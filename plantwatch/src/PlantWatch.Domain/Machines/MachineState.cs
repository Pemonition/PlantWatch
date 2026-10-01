namespace PlantWatch.Domain.Machines;

/// <summary>
/// Operational state of a machine at a point in time.
/// </summary>
/// <remarks>
/// Only <see cref="Running"/> counts as productive time for the availability factor.
/// <see cref="Idle"/> and <see cref="Stopped"/> are both losses, but they are kept apart
/// because they are usually owned by different people: idle time is a scheduling problem,
/// an unplanned stop is a maintenance problem.
/// </remarks>
public enum MachineState
{
    /// <summary>Machine is producing.</summary>
    Running = 0,

    /// <summary>Powered on and available, but not producing (no order, no operator, waiting on material).</summary>
    Idle = 1,

    /// <summary>Unplanned stop — a fault, a jam, or a breakdown.</summary>
    Stopped = 2,

    /// <summary>Planned stop for maintenance. Excluded from planned production time.</summary>
    Maintenance = 3
}
