using System.Text.Json.Serialization;

namespace PlantWatch.Application.Dtos;

/// <summary>
/// Wire contract for the MQTT payload published on <c>plantwatch/{machineCode}/telemetry</c>.
/// </summary>
/// <remarks>
/// This type is a contract with devices in the field that cannot be upgraded on demand,
/// so it is kept separate from the domain entity and from the API DTOs: a refactor of
/// <see cref="PlantWatch.Domain.Machines.SensorReading"/> must never silently change
/// what a PLC is expected to send. See ADR 0004.
/// </remarks>
public class TelemetryMessage
{
    /// <summary>Shop-floor machine code, also present in the topic.</summary>
    [JsonPropertyName("machineCode")]
    public string MachineCode { get; set; } = string.Empty;

    /// <summary>Sample instant. Devices are expected to send UTC with an offset.</summary>
    [JsonPropertyName("timestamp")]
    public DateTimeOffset Timestamp { get; set; }

    /// <summary>Pieces produced since the previous sample.</summary>
    [JsonPropertyName("piecesProduced")]
    public int PiecesProduced { get; set; }

    /// <summary>Rejected pieces within <see cref="PiecesProduced"/>.</summary>
    [JsonPropertyName("rejectedPieces")]
    public int RejectedPieces { get; set; }

    /// <summary>Whether the machine was producing during the sampled interval.</summary>
    [JsonPropertyName("isRunning")]
    public bool IsRunning { get; set; }
}
