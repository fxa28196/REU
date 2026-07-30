package geography.env;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import geography.data.CsvLoader;

/**
 * Hourly PM2.5 concentration field for the September 2020 smoke event (V5,
 * docs/science/DESIGN_SPEC.md).
 *
 * <p><b>Spatial model: county-uniform (DESIGN_SPEC V5, Option A).</b> With only
 * two regulatory monitors inside Multnomah County, any spatial interpolant
 * would fit two points and manufacture gradients the data cannot support. The
 * field is therefore the hourly mean of the in-county monitors, applied
 * uniformly in space. Under a uniform field, differences between shelter
 * placement strategies arise only from travel time and shelter access — a
 * clean, interpretable first result. An IDW option is specified in DESIGN_SPEC
 * to be adopted only if it beats the uniform field in leave-one-out
 * cross-validation (VALIDATION_STRATEGY §5).
 *
 * <p>Data: EPA AQS parameter 88502, provenance in Geography/data/README.md §2.
 * Units: µg/m³. Time base: hour 0 = {@code startDateTime} (local time), matching
 * the tick↔time mapping V13.
 */
public class SmokeField {

	private final double[] hourlyUgM3;      // index 0 = startDateTime hour
	private final LocalDateTime startDateTime;
	private final String county;
	private long outOfRangeLookups = 0;     // ticks that fell outside the data window

	/**
	 * @param csvPath        AQS hourly CSV (data/airnow/...)
	 * @param county         county whose monitors define the field (e.g. "Multnomah")
	 * @param startDateTime  simulation hour 0 (local time), e.g. 2020-09-07T00:00
	 */
	public SmokeField(String csvPath, String county, LocalDateTime startDateTime) {
		this(csvPath, county, startDateTime, 1.0);
	}

	/**
	 * Scenario-E variant (V47): every hourly value is multiplied by
	 * {@code scaleFactor} once, here at construction, so exposure, dose and
	 * hours-above-unhealthy all scale coherently from one place. Scale 1.0 is
	 * the identity — the delegating constructor above uses it, so every
	 * pre-Scenario-E call site is byte-identical. NaN gap hours stay NaN
	 * (a scaled gap is still a gap, never a fabricated zero).
	 *
	 * @param scaleFactor  multiplier on every hourly µg/m³ value (V47); the
	 *                     synthetic severe v1 series already embeds its central
	 *                     1.75× transform, so a series-1 run's effective
	 *                     severity is 1.75 × this factor
	 */
	public SmokeField(String csvPath, String county, LocalDateTime startDateTime,
			double scaleFactor) {
		this.county = county;
		this.startDateTime = startDateTime;

		// Accumulate mean concentration per (date, hour) across all in-county
		// monitors and POCs. Keyed by hour-of-event so gaps are explicit.
		TreeMap<Integer, double[]> sumCount = new TreeMap<Integer, double[]>(); // hourIndex -> {sum,count}
		int maxHour = -1;

		List<Map<String, String>> rows = CsvLoader.read(csvPath);
		for (Map<String, String> row : rows) {
			if (!county.equalsIgnoreCase(row.get("County Name"))) {
				continue;
			}
			String dateStr = row.get("Date Local");   // yyyy-MM-dd
			String timeStr = row.get("Time Local");    // HH:mm
			String valStr = row.get("Sample Measurement");
			if (dateStr == null || timeStr == null || valStr == null || valStr.isEmpty()) {
				continue;
			}
			double val;
			try {
				val = Double.parseDouble(valStr);
			} catch (NumberFormatException e) {
				continue;
			}
			LocalDateTime obs = LocalDateTime.of(
					LocalDate.parse(dateStr),
					LocalTime.parse(timeStr.length() == 5 ? timeStr : timeStr.substring(0, 5)));
			int hourIndex = (int) ChronoUnit.HOURS.between(startDateTime, obs);
			if (hourIndex < 0) {
				continue; // before the simulation start
			}
			double[] sc = sumCount.get(hourIndex);
			if (sc == null) {
				sc = new double[] { 0, 0 };
				sumCount.put(hourIndex, sc);
			}
			sc[0] += val;
			sc[1] += 1;
			if (hourIndex > maxHour) {
				maxHour = hourIndex;
			}
		}

		hourlyUgM3 = new double[maxHour + 1];
		for (int h = 0; h <= maxHour; h++) {
			double[] sc = sumCount.get(h);
			// Missing hours remain Double.NaN so a gap is never silently zero
			// (VALIDATION_STRATEGY §5). Callers treat NaN as "no data".
			// The V47 scale multiplies real values only; NaN * scale is NaN
			// anyway, but the branch keeps the gap semantics explicit.
			hourlyUgM3[h] = (sc == null || sc[1] == 0) ? Double.NaN
					: (sc[0] / sc[1]) * scaleFactor;
		}
	}

	/** Number of hourly slices in the field. */
	public int hours() {
		return hourlyUgM3.length;
	}

	/** Concentration (µg/m³) at a given whole-hour index, NaN if out of range or missing. */
	public double concentrationAtHour(int hourIndex) {
		if (hourIndex < 0 || hourIndex >= hourlyUgM3.length) {
			return Double.NaN;
		}
		return hourlyUgM3[hourIndex];
	}

	/**
	 * Concentration (µg/m³) for the hour containing the given schedule tick.
	 * Beyond the data window this returns 0 and increments an out-of-range
	 * counter (reported in the run manifest) rather than fabricating a value.
	 *
	 * @param tick           current schedule tick
	 * @param minutesPerTick simulated minutes per tick (V13)
	 */
	public double concentrationForTick(double tick, double minutesPerTick) {
		int hourIndex = (int) Math.floor((tick * minutesPerTick) / 60.0);
		double c = concentrationAtHour(hourIndex);
		if (Double.isNaN(c)) {
			outOfRangeLookups++;
			return 0.0;
		}
		return c;
	}

	/** Local wall-clock time corresponding to a schedule tick (V13 anchor). */
	public LocalDateTime timeForTick(double tick, double minutesPerTick) {
		return startDateTime.plusMinutes((long) (tick * minutesPerTick));
	}

	public long getOutOfRangeLookups() { return outOfRangeLookups; }
	public LocalDateTime getStartDateTime() { return startDateTime; }
	public String getCounty() { return county; }

	/** Peak hourly concentration in the field (µg/m³), for validation/manifest. */
	public double peakHourly() {
		double mx = 0;
		for (double v : hourlyUgM3) {
			if (!Double.isNaN(v) && v > mx) {
				mx = v;
			}
		}
		return mx;
	}
}
