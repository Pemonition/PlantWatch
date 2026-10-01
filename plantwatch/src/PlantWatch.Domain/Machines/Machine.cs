namespace PlantWatch.Domain.Machines;

/// <summary>
/// A physical production machine being monitored.
/// </summary>
/// <remarks>
/// <see cref="Code"/> is the business identity: it is what operators paint on the machine,
/// what appears on the shop-floor schedule, and what the MQTT topic carries. <see cref="Id"/>
/// is a surrogate key owned by the database. The API is addressed by <see cref="Code"/> so that
/// URLs stay meaningful to the people using them.
/// </remarks>
public class Machine
{
    /// <summary>Surrogate database identity.</summary>
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Short shop-floor identifier, unique per plant (for example <c>PRESS-01</c>).</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Human readable name shown on the dashboard.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Theoretical fastest cycle time, in seconds, to produce one piece.
    /// This is the denominator of the performance factor: it is a machine
    /// specification, not an observed average, and it must not be tuned to
    /// make the numbers look better.
    /// </summary>
    public double IdealCycleSeconds { get; set; }

    /// <summary>Telemetry recorded for this machine.</summary>
    public ICollection<SensorReading> Readings { get; set; } = new List<SensorReading>();

    /// <summary>Stop events recorded for this machine.</summary>
    public ICollection<StopEvent> StopEvents { get; set; } = new List<StopEvent>();
}
