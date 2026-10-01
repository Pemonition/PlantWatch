using System.Globalization;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;
using PlantWatch.Simulator;

// PlantWatch telemetry simulator.
//
// The point of this tool is that the whole system can be demonstrated, developed and
// reviewed without a single piece of hardware. It publishes the same MQTT contract a real
// gateway would (ADR 0004), including the messy parts: machines stop, restart, and produce
// the occasional reject.
//
// Configuration comes from environment variables so that docker-compose can drive it:
//   MQTT_HOST        broker host              (default: mosquitto)
//   MQTT_PORT        broker port              (default: 1883)
//   INTERVAL_SECONDS seconds between samples  (default: 5)
//   SEED             RNG seed for repeatable runs (default: time-based)

string host = Environment.GetEnvironmentVariable("MQTT_HOST") ?? "mosquitto";
int port = ParseInt(Environment.GetEnvironmentVariable("MQTT_PORT"), 1883);
int intervalSeconds = ParseInt(Environment.GetEnvironmentVariable("INTERVAL_SECONDS"), 5);
int? seed = int.TryParse(Environment.GetEnvironmentVariable("SEED"), out int s) ? s : null;

TimeSpan interval = TimeSpan.FromSeconds(Math.Max(1, intervalSeconds));
Random random = seed is null ? new Random() : new Random(seed.Value);

SimulatedMachine[] machines =
[
    new("PRESS-01", idealCycleSeconds: 12, stopProbability: 0.04, rejectRate: 0.02, random),
    new("LATHE-02", idealCycleSeconds: 30, stopProbability: 0.08, rejectRate: 0.05, random),
    new("PACK-03", idealCycleSeconds: 4, stopProbability: 0.02, rejectRate: 0.01, random)
];

JsonSerializerOptions jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

using CancellationTokenSource cts = new();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

MqttFactory factory = new();
using IMqttClient client = factory.CreateMqttClient();

MqttClientOptions clientOptions = new MqttClientOptionsBuilder()
    .WithTcpServer(host, port)
    .WithClientId($"plantwatch-simulator-{Guid.NewGuid():N}")
    .WithCleanSession()
    .Build();

Console.WriteLine($"PlantWatch simulator -> mqtt://{host}:{port}, every {interval.TotalSeconds:0}s, {machines.Length} machines.");

await ConnectWithRetryAsync(client, clientOptions, cts.Token);

try
{
    while (!cts.IsCancellationRequested)
    {
        if (!client.IsConnected)
        {
            await ConnectWithRetryAsync(client, clientOptions, cts.Token);
        }

        DateTimeOffset now = DateTimeOffset.UtcNow;

        foreach (SimulatedMachine machine in machines)
        {
            TelemetrySample sample = machine.NextSample(now, interval);

            string topic = $"plantwatch/{machine.Code}/telemetry";
            string payload = JsonSerializer.Serialize(sample, jsonOptions);

            MqttApplicationMessage message = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(payload)
                .Build();

            await client.PublishAsync(message, cts.Token);

            Console.WriteLine(
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"{now:HH:mm:ss} {machine.Code,-9} running={sample.IsRunning,-5} pieces={sample.PiecesProduced,3} rejects={sample.RejectedPieces}"));
        }

        await Task.Delay(interval, cts.Token);
    }
}
catch (OperationCanceledException)
{
    // Expected on Ctrl+C.
}
finally
{
    if (client.IsConnected)
    {
        await client.DisconnectAsync(cancellationToken: CancellationToken.None);
    }

    Console.WriteLine("Simulator stopped.");
}

return 0;

static async Task ConnectWithRetryAsync(IMqttClient client, MqttClientOptions options, CancellationToken ct)
{
    // The broker may still be starting when compose brings everything up at once,
    // so the simulator waits for it rather than crash-looping.
    while (!ct.IsCancellationRequested)
    {
        try
        {
            await client.ConnectAsync(options, ct);
            Console.WriteLine("Connected to broker.");
            return;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Console.WriteLine($"Broker not reachable ({ex.GetType().Name}); retrying in 3s.");
            await Task.Delay(TimeSpan.FromSeconds(3), ct);
        }
    }
}

static int ParseInt(string? value, int fallback) =>
    int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int parsed) ? parsed : fallback;
