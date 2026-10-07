using PlantWatch.Domain.Machines;

namespace PlantWatch.Application.Abstractions;

/// <summary>
/// Append and query access to the telemetry time series.
/// </summary>
/// <remarks>
/// Deliberately narrow: readings are only ever appended and read back by machine and period.
/// Keeping the interface this small is what lets the storage choice change later
/// (plain Postgres today, a TimescaleDB hypertable or a dedicated TSDB tomorrow)
/// without touching the use cases.
/// </remarks>
public interface IReadingRepository
{
    /// <summary>Appends one reading.</summary>
    Task AddAsync(SensorReading reading, CancellationToken cancellationToken = default);

    /// <summary>Returns the readings for a machine within a half-open period [from, to).</summary>
    Task<IReadOnlyList<SensorReading>> GetForPeriodAsync(
        Guid machineId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken = default);

    /// <summary>Returns the most recent readings for a machine, newest first.</summary>
    Task<IReadOnlyList<SensorReading>> GetLatestAsync(
        Guid machineId,
        int take,
        CancellationToken cancellationToken = default);

    /// <summary>Commits pending changes.</summary>
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
