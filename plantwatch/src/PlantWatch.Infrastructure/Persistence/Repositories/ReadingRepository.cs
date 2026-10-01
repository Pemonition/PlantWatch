using Microsoft.EntityFrameworkCore;
using PlantWatch.Application.Abstractions;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IReadingRepository"/>.</summary>
public class ReadingRepository : IReadingRepository
{
    private readonly PlantWatchDbContext _db;

    /// <summary>Creates the repository over the context.</summary>
    public ReadingRepository(PlantWatchDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task AddAsync(SensorReading reading, CancellationToken cancellationToken = default) =>
        await _db.SensorReadings.AddAsync(reading, cancellationToken);

    /// <inheritdoc />
    public async Task<IReadOnlyList<SensorReading>> GetForPeriodAsync(
        Guid machineId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken = default) =>
        await _db.SensorReadings
            .AsNoTracking()
            .Where(r => r.MachineId == machineId && r.Timestamp >= from && r.Timestamp < to)
            .OrderBy(r => r.Timestamp)
            .ToListAsync(cancellationToken);

    /// <inheritdoc />
    public async Task<IReadOnlyList<SensorReading>> GetLatestAsync(
        Guid machineId,
        int take,
        CancellationToken cancellationToken = default) =>
        await _db.SensorReadings
            .AsNoTracking()
            .Where(r => r.MachineId == machineId)
            .OrderByDescending(r => r.Timestamp)
            .Take(take)
            .ToListAsync(cancellationToken);

    /// <inheritdoc />
    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _db.SaveChangesAsync(cancellationToken);
}
