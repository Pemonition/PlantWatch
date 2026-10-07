using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Infrastructure.Persistence.Configurations;

/// <summary>Maps <see cref="SensorReading"/> to the <c>sensor_readings</c> table.</summary>
public class SensorReadingConfiguration : IEntityTypeConfiguration<SensorReading>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<SensorReading> builder)
    {
        builder.ToTable("sensor_readings");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Timestamp).IsRequired();
        builder.Property(r => r.PiecesProduced).IsRequired();
        builder.Property(r => r.RejectedPieces).IsRequired();
        builder.Property(r => r.IsRunning).IsRequired();

        builder.HasOne(r => r.Machine)
            .WithMany(m => m.Readings)
            .HasForeignKey(r => r.MachineId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every query this system runs against the time series is "one machine, one period",
        // so the composite index matches the access pattern exactly. Descending on timestamp
        // also serves the "latest N readings" endpoint without a sort.
        builder.HasIndex(r => new { r.MachineId, r.Timestamp })
            .HasDatabaseName("ix_sensor_readings_machine_timestamp")
            .IsDescending(false, true);
    }
}
