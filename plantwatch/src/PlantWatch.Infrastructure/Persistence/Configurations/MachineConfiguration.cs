using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Infrastructure.Persistence.Configurations;

/// <summary>Maps <see cref="Machine"/> to the <c>machines</c> table.</summary>
public class MachineConfiguration : IEntityTypeConfiguration<Machine>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Machine> builder)
    {
        builder.ToTable("machines");

        builder.HasKey(m => m.Id);

        builder.Property(m => m.Code)
            .HasMaxLength(40)
            .IsRequired();

        builder.Property(m => m.Name)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(m => m.IdealCycleSeconds)
            .IsRequired();

        // The code is the business key and the API route segment, so uniqueness is enforced
        // in the database rather than only in application code.
        builder.HasIndex(m => m.Code).IsUnique();
    }
}
