using Microsoft.EntityFrameworkCore;
using PlantWatch.Application.Abstractions;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Infrastructure.Persistence.Repositories;

/// <summary>EF Core implementation of <see cref="IMachineRepository"/>.</summary>
public class MachineRepository : IMachineRepository
{
    private readonly PlantWatchDbContext _db;

    /// <summary>Creates the repository over the context.</summary>
    public MachineRepository(PlantWatchDbContext db) => _db = db;

    /// <inheritdoc />
    public async Task<IReadOnlyList<Machine>> GetAllAsync(CancellationToken cancellationToken = default) =>
        await _db.Machines
            .AsNoTracking()
            .OrderBy(m => m.Code)
            .ToListAsync(cancellationToken);

    /// <inheritdoc />
    public Task<Machine?> GetByCodeAsync(string code, CancellationToken cancellationToken = default) =>
        _db.Machines.FirstOrDefaultAsync(m => m.Code == code, cancellationToken);

    /// <inheritdoc />
    public async Task AddAsync(Machine machine, CancellationToken cancellationToken = default) =>
        await _db.Machines.AddAsync(machine, cancellationToken);

    /// <inheritdoc />
    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _db.SaveChangesAsync(cancellationToken);
}
