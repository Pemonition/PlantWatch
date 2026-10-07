using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PlantWatch.Api.Endpoints;
using PlantWatch.Api.Realtime;
using PlantWatch.Application.Abstractions;
using PlantWatch.Domain.Machines;
using PlantWatch.Infrastructure;
using PlantWatch.Infrastructure.Options;
using PlantWatch.Infrastructure.Persistence;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

// --- Services -------------------------------------------------------------
// Infrastructure brings persistence, repositories, use cases and MQTT ingestion.
builder.Services.AddPlantWatchInfrastructure(builder.Configuration);

// The realtime transport is an API concern, so the adapter is registered here rather than
// in Infrastructure, which must not know SignalR exists.
builder.Services.AddSignalR();
builder.Services.AddScoped<ITelemetryBroadcaster, SignalRTelemetryBroadcaster>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// A permissive CORS policy for the planned Angular dashboard in phase 2. It is scoped to a
// named policy so that tightening it for production is a one-line configuration change.
builder.Services.AddCors(options =>
    options.AddPolicy("dashboard", policy => policy
        .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:4200"])
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

builder.Services.AddHealthChecks();

WebApplication app = builder.Build();

// --- Database -------------------------------------------------------------
// Migrate-on-start is guarded by configuration: convenient for `docker compose up`,
// wrong for a multi-instance production rollout. See ADR 0002 and DatabaseOptions.
DatabaseOptions databaseOptions = app.Services.GetRequiredService<IOptions<DatabaseOptions>>().Value;

if (databaseOptions.ApplyMigrationsOnStartup)
{
    using IServiceScope scope = app.Services.CreateScope();
    PlantWatchDbContext db = scope.ServiceProvider.GetRequiredService<PlantWatchDbContext>();

    await db.Database.MigrateAsync();

    if (databaseOptions.SeedDemoMachines && !await db.Machines.AnyAsync())
    {
        db.Machines.AddRange(
            new Machine { Code = "PRESS-01", Name = "Hydraulic press 01", IdealCycleSeconds = 12 },
            new Machine { Code = "LATHE-02", Name = "CNC lathe 02", IdealCycleSeconds = 30 },
            new Machine { Code = "PACK-03", Name = "Packaging line 03", IdealCycleSeconds = 4 });

        await db.SaveChangesAsync();
    }
}

// --- Pipeline -------------------------------------------------------------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "PlantWatch API v1"));
}

app.UseCors("dashboard");

app.MapHealthChecks("/health");
app.MapMachineEndpoints();
app.MapHub<TelemetryHub>("/hubs/telemetry");

app.Run();

/// <summary>
/// Exposed so that an integration test project can drive the host with
/// <c>WebApplicationFactory&lt;Program&gt;</c> without reflection tricks.
/// </summary>
public partial class Program;
