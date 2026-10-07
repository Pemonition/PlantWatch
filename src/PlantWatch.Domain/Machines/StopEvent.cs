namespace PlantWatch.Domain.Machines;

/// <summary>
/// A period during which a machine was not producing.
/// </summary>
/// <remarks>
/// Stop events are derived from readings rather than published directly, because only the
/// server can see where one stop ends and the next begins. <see cref="EndedAt"/> is null
/// while the stop is still open, which is also how the dashboard knows a machine is down now.
/// </remarks>
public class StopEvent
{
    /// <summary>Surrogate database identity.</summary>
    public long Id { get; set; }

    /// <summary>Machine this stop belongs to.</summary>
    public Guid MachineId { get; set; }

    /// <summary>Navigation to the owning machine.</summary>
    public Machine? Machine { get; set; }

    /// <summary>Instant the stop started, in UTC.</summary>
    public DateTimeOffset StartedAt { get; set; }

    /// <summary>Instant the stop ended, in UTC; null while the machine is still down.</summary>
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>State that classifies the stop (idle, unplanned stop, planned maintenance).</summary>
    public MachineState State { get; set; }

    /// <summary>Optional reason captured by the operator.</summary>
    public string? Reason { get; set; }

    /// <summary>Duration of the stop, or null while it is still open.</summary>
    public TimeSpan? Duration => EndedAt is null ? null : EndedAt.Value - StartedAt;
}
