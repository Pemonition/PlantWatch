namespace PlantWatch.Infrastructure.Options;

/// <summary>
/// Database behaviour toggles, bound from the <c>Database</c> configuration section.
/// </summary>
public class DatabaseOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "Database";

    /// <summary>
    /// Whether the host applies EF Core migrations on start.
    /// </summary>
    /// <remarks>
    /// On by default so that <c>docker compose up</c> works with no extra step, and guarded by
    /// a flag because migrate-on-start is the wrong default for a real production rollout:
    /// several instances racing to migrate, and a failed migration taking the app down with it,
    /// are both avoided by running migrations as a separate deployment step.
    /// </remarks>
    public bool ApplyMigrationsOnStartup { get; set; } = true;

    /// <summary>Whether to insert the three demo machines when the table is empty.</summary>
    public bool SeedDemoMachines { get; set; } = true;
}
