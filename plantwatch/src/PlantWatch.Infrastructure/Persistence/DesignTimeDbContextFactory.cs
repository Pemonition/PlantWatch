using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace PlantWatch.Infrastructure.Persistence;

/// <summary>
/// Builds a <see cref="PlantWatchDbContext"/> for the EF Core command-line tools.
/// </summary>
/// <remarks>
/// Without this, <c>dotnet ef migrations add</c> boots the API host, which in turn tries to
/// connect to a database and apply migrations — so generating a migration would require the
/// very database the migration is meant to create. The factory breaks that loop: design-time
/// only needs a connection string shaped correctly, never a reachable server. Override it with
/// the <c>PLANTWATCH_DESIGN_CONNECTION</c> environment variable when scaffolding against a real
/// database.
/// </remarks>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<PlantWatchDbContext>
{
    /// <inheritdoc />
    public PlantWatchDbContext CreateDbContext(string[] args)
    {
        string connectionString = Environment.GetEnvironmentVariable("PLANTWATCH_DESIGN_CONNECTION")
            ?? "Host=localhost;Port=5432;Database=plantwatch;Username=plantwatch;Password=plantwatch";

        DbContextOptions<PlantWatchDbContext> options =
            new DbContextOptionsBuilder<PlantWatchDbContext>()
                .UseNpgsql(connectionString)
                .Options;

        return new PlantWatchDbContext(options);
    }
}
