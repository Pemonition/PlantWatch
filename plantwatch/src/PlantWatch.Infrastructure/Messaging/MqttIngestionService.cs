using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using PlantWatch.Application.Abstractions;
using PlantWatch.Application.Dtos;
using PlantWatch.Domain.Machines;
using PlantWatch.Infrastructure.Options;

namespace PlantWatch.Infrastructure.Messaging;

/// <summary>
/// Subscribes to the telemetry topic, persists each sample, and pushes it to connected dashboards.
/// </summary>
/// <remarks>
/// <para>
/// This is the one component that touches the outside world continuously, so it is written
/// to assume the outside world is unreliable: the broker restarts, a device sends malformed
/// JSON, a machine code arrives that nobody registered. None of those may take the host down,
/// so the receive handler never lets an exception escape and the outer loop reconnects forever
/// until cancellation.
/// </para>
/// <para>
/// It runs inside the API host for v1 — see ADR 0002 for why, and for the conditions under
/// which it should be split into its own process.
/// </para>
/// </remarks>
public class MqttIngestionService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly MqttOptions _options;
    private readonly ILogger<MqttIngestionService> _logger;

    /// <summary>Creates the service.</summary>
    public MqttIngestionService(
        IServiceScopeFactory scopeFactory,
        IOptions<MqttOptions> options,
        ILogger<MqttIngestionService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        MqttFactory factory = new();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using IMqttClient client = factory.CreateMqttClient();
                client.ApplicationMessageReceivedAsync += OnMessageReceivedAsync;

                MqttClientOptionsBuilder builder = new MqttClientOptionsBuilder()
                    .WithTcpServer(_options.Host, _options.Port)
                    .WithClientId($"{_options.ClientId}-{Environment.MachineName}")
                    .WithCleanSession();

                if (!string.IsNullOrWhiteSpace(_options.Username))
                {
                    builder = builder.WithCredentials(_options.Username, _options.Password ?? string.Empty);
                }

                await client.ConnectAsync(builder.Build(), stoppingToken);

                MqttClientSubscribeOptions subscribeOptions = factory.CreateSubscribeOptionsBuilder()
                    .WithTopicFilter(f => f.WithTopic(_options.TopicFilter))
                    .Build();

                await client.SubscribeAsync(subscribeOptions, stoppingToken);

                _logger.LogInformation(
                    "Connected to MQTT broker {Host}:{Port}, subscribed to {Topic}",
                    _options.Host,
                    _options.Port,
                    _options.TopicFilter);

                // Hold the connection open. The client raises events on its own threads;
                // this loop only watches for disconnection and cancellation.
                while (!stoppingToken.IsCancellationRequested && client.IsConnected)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                }

                if (client.IsConnected)
                {
                    await client.DisconnectAsync(cancellationToken: CancellationToken.None);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "MQTT connection failed; retrying in {Delay}",
                    _options.ReconnectDelay);
            }

            if (stoppingToken.IsCancellationRequested)
            {
                break;
            }

            try
            {
                await Task.Delay(_options.ReconnectDelay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("MQTT ingestion stopped.");
    }

    private async Task OnMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        try
        {
            string payload = Encoding.UTF8.GetString(args.ApplicationMessage.PayloadSegment);
            TelemetryMessage? message = JsonSerializer.Deserialize<TelemetryMessage>(payload, JsonOptions);

            if (message is null)
            {
                _logger.LogWarning("Discarded empty telemetry payload on {Topic}", args.ApplicationMessage.Topic);
                return;
            }

            // The topic is authoritative for the machine code: a device that lies in the body
            // but publishes on its own topic should not be able to write to another machine.
            string? topicCode = ExtractMachineCode(args.ApplicationMessage.Topic);
            string machineCode = topicCode ?? message.MachineCode;

            if (string.IsNullOrWhiteSpace(machineCode))
            {
                _logger.LogWarning("Discarded telemetry with no machine code on {Topic}", args.ApplicationMessage.Topic);
                return;
            }

            await IngestAsync(machineCode, message);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Discarded malformed telemetry on {Topic}", args.ApplicationMessage.Topic);
        }
        catch (Exception ex)
        {
            // An exception escaping here would tear down the MQTT client's receive loop and
            // silently stop all ingestion, so nothing is allowed past this point.
            _logger.LogError(ex, "Failed to ingest telemetry on {Topic}", args.ApplicationMessage.Topic);
        }
    }

    private async Task IngestAsync(string machineCode, TelemetryMessage message)
    {
        // BackgroundService is a singleton; repositories and the DbContext are scoped.
        // A scope per message keeps the change tracker small and short-lived.
        using IServiceScope scope = _scopeFactory.CreateScope();

        IMachineRepository machines = scope.ServiceProvider.GetRequiredService<IMachineRepository>();
        IReadingRepository readings = scope.ServiceProvider.GetRequiredService<IReadingRepository>();
        ITelemetryBroadcaster broadcaster = scope.ServiceProvider.GetRequiredService<ITelemetryBroadcaster>();

        Machine? machine = await machines.GetByCodeAsync(machineCode);

        if (machine is null)
        {
            if (!_options.AutoRegisterUnknownMachines)
            {
                _logger.LogWarning("Discarded telemetry for unknown machine {Code}", machineCode);
                return;
            }

            machine = new Machine
            {
                Code = machineCode,
                Name = machineCode,
                IdealCycleSeconds = _options.DefaultIdealCycleSeconds
            };

            await machines.AddAsync(machine);
            await machines.SaveChangesAsync();

            _logger.LogInformation("Auto-registered machine {Code}", machineCode);
        }

        SensorReading reading = new()
        {
            MachineId = machine.Id,
            Timestamp = message.Timestamp == default ? DateTimeOffset.UtcNow : message.Timestamp.ToUniversalTime(),
            PiecesProduced = Math.Max(0, message.PiecesProduced),
            RejectedPieces = Math.Clamp(message.RejectedPieces, 0, Math.Max(0, message.PiecesProduced)),
            IsRunning = message.IsRunning
        };

        await readings.AddAsync(reading);
        await readings.SaveChangesAsync();

        await broadcaster.BroadcastReadingAsync(new ReadingDto(
            machine.Code,
            reading.Timestamp,
            reading.PiecesProduced,
            reading.RejectedPieces,
            reading.IsRunning));
    }

    /// <summary>
    /// Pulls the machine code out of <c>plantwatch/{machineCode}/telemetry</c>.
    /// </summary>
    private static string? ExtractMachineCode(string topic)
    {
        string[] segments = topic.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return segments.Length >= 3 ? segments[1] : null;
    }
}
