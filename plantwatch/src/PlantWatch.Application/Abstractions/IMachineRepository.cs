using PlantWatch.Domain.Machines;

namespace PlantWatch.Application.Abstractions;

/// <summary>
/// Read/write access to machines. Defined here, in the application layer, so that
/// use cases depend on an interface they own rather than on EF Core (dependency inversion).
/// </summary>
public interface IMachineRepository
{
    /// <summary>Lists every monitored machine.</summary>
    Task<IReadOnlyList<Machine>> GetAllAsync(CancellationToken cancellationToken = default);

    /// <summary>Finds a machine by its shop-floor code, or null when it is unknown.</summary>
    Task<Machine?> GetByCodeAsync(string code, CancellationToken cancellationToken = default);

    /// <summary>Adds a machine. Used by seeding and by the ingestion service for auto-registration.</summary>
    Task AddAsync(Machine machine, CancellationToken cancellationToken = default);

    /// <summary>Commits pending changes.</summary>
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
