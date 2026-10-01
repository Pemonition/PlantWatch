namespace PlantWatch.Application.Dtos;

/// <summary>Machine as exposed over the API. Hides the surrogate key from clients.</summary>
public record MachineDto(string Code, string Name, double IdealCycleSeconds);
