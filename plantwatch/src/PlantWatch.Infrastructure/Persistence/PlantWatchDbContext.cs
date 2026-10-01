using Microsoft.EntityFrameworkCore;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Infrastructure.Persistence;

/// <summary>
/// EF Core unit of work over the PlantWatch schema.
/// </summary>
/// <remarks>
/// Mapping lives in <see cref="IEntityTypeConfiguration{TEntity}"/> classes rather than in
/// <see cref="OnModelCreating"/>, so that this file stays readable as the model grows and
/// each entity's configuration can be reviewed on its own.
/// </remarks>
public class PlantWatchDbContext : DbContext
{
    /// <summary>Creates the context with the options supplied by DI.</summary>
    public PlantWatchDbContext(DbContextOptions<PlantWatchDbContext> options)
        : base(options)
    {
    }

    /// <summary>Monitored machines.</summary>
    public DbSet<Machine> Machines => Set<Machine>();

    /// <summary>Telemetry time series.</summary>
    public DbSet<SensorReading> SensorReadings => Set<SensorReading>();

    /// <summary>Derived stop events.</summary>
    public DbSet<StopEvent> StopEvents => Set<StopEvent>();

    /// <inheritdoc />
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PlantWatchDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
