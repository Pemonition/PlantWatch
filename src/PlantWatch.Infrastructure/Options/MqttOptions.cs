using System.ComponentModel.DataAnnotations;

namespace PlantWatch.Infrastructure.Options;

/// <summary>
/// Broker connection and subscription settings, bound from the <c>Mqtt</c> configuration section.
/// </summary>
/// <remarks>
/// Using the options pattern rather than reading <c>IConfiguration</c> inline keeps the
/// ingestion service testable and lets the host fail fast at startup on bad configuration
/// instead of failing obscurely on the first connection attempt.
/// </remarks>
public class MqttOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Mqtt";

    /// <summary>Broker host name. Defaults to the docker-compose service name.</summary>
    [Required]
    public string Host { get; set; } = "mosquitto";

    /// <summary>Broker TCP port.</summary>
    [Range(1, 65535)]
    public int Port { get; set; } = 1883;

    /// <summary>Client identifier presented to the broker.</summary>
    public string ClientId { get; set; } = "plantwatch-api";

    /// <summary>Topic filter to subscribe to. See ADR 0004 for the contract.</summary>
    [Required]
    public string TopicFilter { get; set; } = "plantwatch/+/telemetry";

    /// <summary>Optional username; anonymous when empty.</summary>
    public string? Username { get; set; }

    /// <summary>Optional password; anonymous when empty.</summary>
    public string? Password { get; set; }

    /// <summary>Delay before retrying after a lost connection.</summary>
    public TimeSpan ReconnectDelay { get; set; } = TimeSpan.FromSeconds(5);

    /// <summary>
    /// Whether a telemetry message for an unknown machine code auto-registers that machine.
    /// Convenient for demos and for a greenfield plant; a mature deployment turns it off so
    /// that a typo in a PLC cannot create phantom assets.
    /// </summary>
    public bool AutoRegisterUnknownMachines { get; set; } = true;

    /// <summary>Ideal cycle time assigned to auto-registered machines, in seconds.</summary>
    public double DefaultIdealCycleSeconds { get; set; } = 30d;
}
