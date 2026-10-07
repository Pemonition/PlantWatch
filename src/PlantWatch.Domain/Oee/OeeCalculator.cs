namespace PlantWatch.Domain.Oee;

/// <summary>
/// Pure, dependency-free implementation of the standard OEE calculation.
/// </summary>
/// <remarks>
/// <para>
/// OEE (Overall Equipment Effectiveness) answers one question: of the time a machine was
/// supposed to be making good parts at full speed, what fraction did it actually deliver?
/// It is the product of three independent factors:
/// </para>
/// <list type="bullet">
///   <item><description><b>Availability</b> = run time / planned production time — the time losses.</description></item>
///   <item><description><b>Performance</b> = (ideal cycle x total pieces) / run time — the speed losses.</description></item>
///   <item><description><b>Quality</b> = good pieces / total pieces — the yield losses.</description></item>
/// </list>
/// <para>
/// The class is static and stateless by design. It is the one piece of this system that
/// must be provably correct, so it has no clock, no I/O and no configuration: given the
/// same <see cref="OeeInput"/> it always returns the same <see cref="OeeResult"/>, which
/// makes it cheap to cover exhaustively with unit tests.
/// </para>
/// <para>
/// Two defensive rules apply to every factor. Any division whose denominator is zero or
/// negative yields <c>0</c> rather than throwing or producing <c>NaN</c>/<c>Infinity</c> —
/// a shift with no planned time is a reporting gap, not an exception. And every factor is
/// clamped to [0, 1], because values above 100% only ever mean the inputs are wrong
/// (typically an ideal cycle time set slower than the machine really runs), and a dashboard
/// showing 128% performance destroys trust in every other number on the page.
/// </para>
/// </remarks>
public static class OeeCalculator
{
    /// <summary>
    /// Calculates availability, performance, quality and the resulting OEE for one period.
    /// </summary>
    /// <param name="input">Aggregated counters and durations for the period.</param>
    /// <returns>
    /// A result whose four members are each within [0, 1]. Returns <see cref="OeeResult.Empty"/>
    /// in effect when the period carries no usable data.
    /// </returns>
    public static OeeResult Calculate(OeeInput input)
    {
        double plannedSeconds = input.PlannedProductionTime.TotalSeconds;
        double runSeconds = input.RunTime.TotalSeconds;

        // Availability: how much of the planned time was spent producing.
        double availability = Ratio(runSeconds, plannedSeconds);

        // Performance: how close to the theoretical maximum output we ran while producing.
        // The numerator is the time the pieces *should* have taken at specification speed.
        double idealProductionSeconds = input.IdealCycleSeconds > 0 && input.TotalPieces > 0
            ? input.IdealCycleSeconds * input.TotalPieces
            : 0d;
        double performance = Ratio(idealProductionSeconds, runSeconds);

        // Quality: how many of the produced pieces were sellable.
        double quality = Ratio(input.GoodPieces, input.TotalPieces);

        // OEE is the product, not the average: the factors compound.
        double oee = Clamp(availability * performance * quality);

        return new OeeResult(availability, performance, quality, oee);
    }

    /// <summary>
    /// Divides and clamps, treating a non-positive denominator as "no data" rather than an error.
    /// </summary>
    private static double Ratio(double numerator, double denominator)
    {
        if (denominator <= 0d || numerator <= 0d)
        {
            return 0d;
        }

        return Clamp(numerator / denominator);
    }

    /// <summary>
    /// Forces a ratio into [0, 1], also absorbing <c>NaN</c> from pathological inputs.
    /// </summary>
    private static double Clamp(double value)
    {
        if (double.IsNaN(value))
        {
            return 0d;
        }

        return Math.Clamp(value, 0d, 1d);
    }
}
