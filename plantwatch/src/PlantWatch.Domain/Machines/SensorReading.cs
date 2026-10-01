namespace PlantWatch.Domain.Machines;

/// <summary>
/// One telemetry sample published by a machine.
/// </summary>
/// <remarks>
/// Readings are append-only and immutable once stored: they are the raw evidence
/// from which every OEE figure is derived. Counters are reported per sample
/// (pieces produced *since the previous sample*), not as a lifetime total, so a
/// controller reboot cannot silently reset the history.
/// </remarks>
public class SensorReading
{
    /// <summary>Surrogate database identity.</summary>
    public long Id { get; set; }

    /// <summary>Machine this reading belongs to.</summary>
    public Guid MachineId { get; set; }

    /// <summary>Navigation to the owning machine.</summary>
    public Machine? Machine { get; set; }

    /// <summary>Instant the sample was taken, in UTC.</summary>
    public DateTimeOffset Timestamp { get; set; }

    /// <summary>Pieces produced since the previous sample, good and bad combined.</summary>
    public int PiecesProduced { get; set; }

    /// <summary>Subset of <see cref="PiecesProduced"/> that failed quality checks.</summary>
    public int RejectedPieces { get; set; }

    /// <summary>Whether the machine was producing during the sampled interval.</summary>
    public bool IsRunning { get; set; }
}
