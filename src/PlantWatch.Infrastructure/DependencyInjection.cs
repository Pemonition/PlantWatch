using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PlantWatch.Application.Abstractions;
using PlantWatch.Application.Machines;
using PlantWatch.Application.Oee;
using PlantWatch.Infrastructure.Messaging;
using PlantWatch.Infrastructure.Options;
using PlantWatch.Infrastructure.Persistence;
using PlantWatch.Infrastructure.Persistence.Repositories;

namespace PlantWatch.Infrastructure;

/// <summary>
/// Composition root for everything this layer owns.
/// </summary>
/// <remarks>
/// The API's <c>Program.cs</c> calls one method instead of knowing about EF Core, Npgsql and
/// MQTTnet: that is what keeps the dependency direction honest. Swapping Postgres for another
/// provider is a change to this file only.
/// </remarks>
public static class DependencyInjection
{
    /// <summary>
    /// Registers persistence, repositories, use-case services and MQTT ingestion.
    /// </summary>
    public static IServiceCollection AddPlantWatchInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddOptions<MqttOptions>()
            .Bind(configuration.GetSection(MqttOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<DatabaseOptions>()
            .Bind(configuration.GetSection(DatabaseOptions.SectionName));

        string connectionString = configuration.GetConnectionString("PlantWatch")
            ?? "Host=postgres;Port=5432;Database=plantwatch;Username=plantwatch;Password=plantwatch";

        services.AddDbContext<PlantWatchDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                // Compose starts the database and the API together, and a broker-driven
                // ingest writes on every sample: both make transient connection failures
                // normal rather than exceptional. Retrying them here keeps a database
                // restart from killing the host or dropping telemetry.
                npgsql.EnableRetryOnFailure(
                    maxRetryCount: 5,
                    maxRetryDelay: TimeSpan.FromSeconds(5),
                    errorCodesToAdd: null)));

        services.AddScoped<IMachineRepository, MachineRepository>();
        services.AddScoped<IReadingRepository, ReadingRepository>();

        services.AddScoped<OeeQueryService>();
        services.AddScoped<MachineQueryService>();

        services.AddHostedService<MqttIngestionService>();

        return services;
    }
}
