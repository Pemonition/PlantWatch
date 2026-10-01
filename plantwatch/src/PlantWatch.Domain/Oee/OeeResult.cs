namespace PlantWatch.Domain.Oee;

/// <summary>
/// Result of an OEE calculation. Every factor is a ratio in the closed interval [0, 1].
/// </summary>
/// <param name="Availability">
/// Share of planned production time the machine was actually running.
/// Lost to breakdowns, changeovers and waiting.
/// </param>
/// <param name="Performance">
/// Share of the theoretical maximum output achieved while running.
/// Lost to running slower than the specification cycle time, and to micro-stops.
/// </param>
/// <param name="Quality">
/// Share of produced pieces that were good. Lost to scrap and rework.
/// </param>
/// <param name="Oee">
/// The product of the three factors. It is deliberately multiplicative: a plant that is
/// excellent at two factors and poor at the third is still a plant with a problem, and
/// averaging the factors would hide that.
/// </param>
public readonly record struct OeeResult(
    double Availability,
    double Performance,
    double Quality,
    double Oee)
{
    /// <summary>An all-zero result, used when a period contains no usable data.</summary>
    public static OeeResult Empty => new(0d, 0d, 0d, 0d);
}
