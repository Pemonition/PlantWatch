using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Infrastructure.Persistence.Configurations;

/// <summary>Maps <see cref="StopEvent"/> to the <c>stop_events</c> table.</summary>
public class StopEventConfiguration : IEntityTypeConfiguration<StopEvent>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<StopEvent> builder)
    {
        builder.ToTable("stop_events");

        builder.HasKey(s => s.Id);

        builder.Property(s => s.StartedAt).IsRequired();
        builder.Property(s => s.State)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(s => s.Reason).HasMaxLength(500);

        // Duration is computed in the domain; it must not be persisted, or the two can disagree.
        builder.Ignore(s => s.Duration);

        builder.HasOne(s => s.Machine)
            .WithMany(m => m.StopEvents)
            .HasForeignKey(s => s.MachineId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(s => new { s.MachineId, s.StartedAt });
    }
}
