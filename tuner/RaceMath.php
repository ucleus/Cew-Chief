<?php
declare(strict_types=1);

/**
 * RaceMath - the deterministic half of the race engineer.
 *
 * Everything here is plain arithmetic with no database or network access,
 * so it can be unit tested on its own. The AI never recalculates these
 * numbers; it only reads them.
 *
 * Units
 *   spring / wheel rate   N/m internally (N/mm in, converted once)
 *   anti-roll bar         N/m
 *   damper                Ns/m
 *   mass                  kg
 *   lengths               mm in, converted to m where the formula needs it
 *   pressure              psi gauge
 *   temperature           deg C
 *   lap time              ms
 *
 * Bad inputs throw InvalidArgumentException instead of returning 0, so a
 * typo in a car spec can never reach the AI looking like a real number.
 */
final class RaceMath
{
    public const PSI_ATMOSPHERE = 14.696;
    public const FUEL_KG_PER_L  = 0.75;

    // ------------------------------------------------------------------
    // Setup-screen values
    // ------------------------------------------------------------------

    /**
     * Convert a setup-screen value (often clicks) to a physical value.
     * real = base + screen * perUnit. With no conversion data the screen
     * value is assumed to be physical already.
     */
    public static function toReal(float $screenValue, ?float $realBase = null, ?float $realPerUnit = null): float
    {
        if ($realBase === null || $realPerUnit === null) {
            return $screenValue;
        }
        return $realBase + $screenValue * $realPerUnit;
    }

    /**
     * Clamp a value into [min, max] and put it on the car's step grid.
     * Run every recommended value through this before showing or saving it.
     */
    public static function snap(float $value, float $min, float $max, float $step): float
    {
        if ($max < $min) {
            throw new InvalidArgumentException('snap: max is below min');
        }
        $value = max($min, min($max, $value));
        if ($step <= 0.0) {
            return round($value, 3);
        }
        $snapped = $min + round(($value - $min) / $step) * $step;
        if ($snapped > $max + 1e-9) {
            $snapped -= $step;
        }
        return round($snapped, 3);
    }

    // ------------------------------------------------------------------
    // Mass
    // ------------------------------------------------------------------

    public static function fuelMassKg(float $fuelLitres): float
    {
        return max(0.0, $fuelLitres) * self::FUEL_KG_PER_L;
    }

    /**
     * Sprung mass carried by one front and one rear corner.
     *
     *   axle mass   = (car + fuel) * axle share
     *   sprung mass = axle mass / 2 - unsprung mass of that corner
     *
     * Fuel is assumed to sit at the car's static weight distribution.
     *
     * @return array{front: float, rear: float} kg per corner
     */
    public static function cornerSprungMass(
        float $totalMassKg,
        float $fuelLitres,
        float $frontWeightPct,
        float $unsprungFrontKg,
        float $unsprungRearKg
    ): array {
        if ($totalMassKg <= 0.0) {
            throw new InvalidArgumentException('cornerSprungMass: total mass must be positive');
        }
        if ($frontWeightPct <= 0.0 || $frontWeightPct >= 100.0) {
            throw new InvalidArgumentException('cornerSprungMass: front weight % must be between 0 and 100');
        }

        $mass  = $totalMassKg + self::fuelMassKg($fuelLitres);
        $front = $mass * ($frontWeightPct / 100.0) / 2.0 - $unsprungFrontKg;
        $rear  = $mass * (1.0 - $frontWeightPct / 100.0) / 2.0 - $unsprungRearKg;

        if ($front <= 0.0 || $rear <= 0.0) {
            throw new InvalidArgumentException('cornerSprungMass: unsprung mass exceeds corner mass, check the car spec');
        }
        return ['front' => $front, 'rear' => $rear];
    }

    // ------------------------------------------------------------------
    // Springs and dampers
    // ------------------------------------------------------------------

    /**
     * Wheel rate in N/m.  Kw = Ks * MR^2, with MR = spring travel / wheel travel.
     *
     * Assetto Corsa's spring values are already wheel rates, so leave the
     * motion ratio at 1.0 unless a mod states otherwise. Applying a real
     * car's motion ratio on top would count it twice.
     */
    public static function wheelRate(float $springRateNmm, float $motionRatio = 1.0): float
    {
        if ($springRateNmm <= 0.0 || $motionRatio <= 0.0) {
            throw new InvalidArgumentException('wheelRate: spring rate and motion ratio must be positive');
        }
        return $springRateNmm * 1000.0 * $motionRatio ** 2;
    }

    /**
     * Undamped ride frequency in Hz.  f = (1 / 2pi) * sqrt(Kw / ms)
     */
    public static function rideFrequency(float $wheelRateNm, float $sprungMassKg): float
    {
        if ($wheelRateNm <= 0.0 || $sprungMassKg <= 0.0) {
            throw new InvalidArgumentException('rideFrequency: wheel rate and sprung mass must be positive');
        }
        return sqrt($wheelRateNm / $sprungMassKg) / (2.0 * M_PI);
    }

    /**
     * Critical damping in Ns/m.  Cc = 2 * sqrt(Kw * ms)
     */
    public static function criticalDamping(float $wheelRateNm, float $sprungMassKg): float
    {
        if ($wheelRateNm <= 0.0 || $sprungMassKg <= 0.0) {
            throw new InvalidArgumentException('criticalDamping: wheel rate and sprung mass must be positive');
        }
        return 2.0 * sqrt($wheelRateNm * $sprungMassKg);
    }

    /**
     * Damping ratio (zeta) = C / Cc. Needs the damper value in Ns/m at the
     * wheel, so click values must go through toReal() first.
     * Rough guide: 0.6-0.8 for slow (body control), 0.3-0.5 for fast (bumps).
     */
    public static function dampingRatio(float $damperNsm, float $wheelRateNm, float $sprungMassKg): float
    {
        if ($damperNsm < 0.0) {
            throw new InvalidArgumentException('dampingRatio: damper rate cannot be negative');
        }
        return $damperNsm / self::criticalDamping($wheelRateNm, $sprungMassKg);
    }

    // ------------------------------------------------------------------
    // Roll stiffness and mechanical balance
    // ------------------------------------------------------------------

    /**
     * Roll stiffness of one axle in Nm per degree of body roll.
     *
     *   K = t^2 * (Kw / 2 + Karb)        [Nm/rad], t = track width in m
     *
     * Assumes the anti-roll bar value is a force per metre of left/right
     * travel difference, which is how AC models it. Tyre stiffness and
     * roll-centre height are ignored, so use the result to compare one
     * setup against another, not as an absolute.
     */
    public static function rollStiffness(float $wheelRateNm, float $arbRateNm, float $trackWidthMm): float
    {
        if ($wheelRateNm <= 0.0 || $arbRateNm < 0.0 || $trackWidthMm <= 0.0) {
            throw new InvalidArgumentException('rollStiffness: invalid wheel rate, bar rate or track width');
        }
        $t = $trackWidthMm / 1000.0;
        return $t ** 2 * ($wheelRateNm / 2.0 + $arbRateNm) * (M_PI / 180.0);
    }

    /**
     * Front share of total roll stiffness, in percent.
     * A common starting point is front weight % plus about 5.
     * Higher than that pushes toward understeer, lower toward oversteer.
     */
    public static function rollStiffnessFrontPct(float $frontNmDeg, float $rearNmDeg): float
    {
        $total = $frontNmDeg + $rearNmDeg;
        if ($total <= 0.0) {
            throw new InvalidArgumentException('rollStiffnessFrontPct: total roll stiffness must be positive');
        }
        return $frontNmDeg / $total * 100.0;
    }

    // ------------------------------------------------------------------
    // Ride height
    // ------------------------------------------------------------------

    /**
     * Rake: rear height minus front height, and the chassis angle it gives.
     * AC measures front and rear at car-specific reference points, so track
     * how rake changes between setups instead of trusting the absolute.
     *
     * @return array{delta_mm: float, angle_deg: float}
     */
    public static function rake(float $frontHeightMm, float $rearHeightMm, float $wheelbaseMm): array
    {
        if ($wheelbaseMm <= 0.0) {
            throw new InvalidArgumentException('rake: wheelbase must be positive');
        }
        $delta = $rearHeightMm - $frontHeightMm;
        return [
            'delta_mm'  => round($delta, 1),
            'angle_deg' => round(rad2deg(atan($delta / $wheelbaseMm)), 3),
        ];
    }

    // ------------------------------------------------------------------
    // Tyre pressure
    // ------------------------------------------------------------------

    /**
     * Cold pressure to set so the tyre reaches the target when hot.
     *
     * A tyre of fixed volume gains pressure in proportion to its absolute
     * pressure, so the correction is a ratio on absolute values:
     *
     *   cold_new_abs = cold_old_abs * target_hot_abs / actual_hot_abs
     *
     * Returns gauge psi, unrounded. Pass the result through snap() with the
     * car's pressure step. Only valid when the next stint runs in similar
     * conditions and the readings came from a properly warmed tyre.
     */
    public static function coldPressureForTarget(float $coldPsi, float $hotPsi, float $targetHotPsi): float
    {
        if ($coldPsi <= 0.0 || $hotPsi <= 0.0 || $targetHotPsi <= 0.0) {
            throw new InvalidArgumentException('coldPressureForTarget: pressures must be positive');
        }
        $atm = self::PSI_ATMOSPHERE;
        return ($coldPsi + $atm) * ($targetHotPsi + $atm) / ($hotPsi + $atm) - $atm;
    }

    /**
     * Where the hot pressure sits against its target.
     *
     * @return array{delta_psi: float, state: 'LOW'|'OK'|'HIGH'}
     */
    public static function pressureState(float $hotPsi, float $targetHotPsi, float $tolerancePsi = 0.3): array
    {
        $delta = $hotPsi - $targetHotPsi;
        $state = 'OK';
        if ($delta > $tolerancePsi) {
            $state = 'HIGH';
        } elseif ($delta < -$tolerancePsi) {
            $state = 'LOW';
        }
        return ['delta_psi' => round($delta, 2), 'state' => $state];
    }

    // ------------------------------------------------------------------
    // Tyre temperatures
    // ------------------------------------------------------------------

    /**
     * Read one tyre's inner / middle / outer temperatures.
     *
     *   spread     = inner - outer   (how hard camber is working the inside edge)
     *   mid_delta  = middle - mean(inner, outer)   (crown of the profile)
     *
     * The spread thresholds are defaults, not laws: rear tyres and low
     * camber cars run a smaller spread. Store them in config per class.
     * mid_delta only supports the pressure reading; hot psi against target
     * (pressureState) is the primary pressure signal.
     *
     * @return array{avg_c: float, spread_c: float, mid_delta_c: float,
     *               window: 'COLD'|'OK'|'HOT',
     *               camber: 'TOO_LITTLE_NEGATIVE'|'OK'|'TOO_MUCH_NEGATIVE',
     *               crown: 'CENTRE_COOL'|'OK'|'CENTRE_HOT'}
     */
    public static function tireThermal(
        float $tempIn,
        float $tempMid,
        float $tempOut,
        float $windowMinC,
        float $windowMaxC,
        float $spreadMinC = 3.0,
        float $spreadMaxC = 12.0,
        float $midToleranceC = 2.0
    ): array {
        $avg      = ($tempIn + $tempMid + $tempOut) / 3.0;
        $spread   = $tempIn - $tempOut;
        $midDelta = $tempMid - ($tempIn + $tempOut) / 2.0;

        $window = 'OK';
        if ($avg < $windowMinC) {
            $window = 'COLD';
        } elseif ($avg > $windowMaxC) {
            $window = 'HOT';
        }

        $camber = 'OK';
        if ($spread < $spreadMinC) {
            $camber = 'TOO_LITTLE_NEGATIVE';
        } elseif ($spread > $spreadMaxC) {
            $camber = 'TOO_MUCH_NEGATIVE';
        }

        $crown = 'OK';
        if ($midDelta > $midToleranceC) {
            $crown = 'CENTRE_HOT';
        } elseif ($midDelta < -$midToleranceC) {
            $crown = 'CENTRE_COOL';
        }

        return [
            'avg_c'       => round($avg, 1),
            'spread_c'    => round($spread, 1),
            'mid_delta_c' => round($midDelta, 1),
            'window'      => $window,
            'camber'      => $camber,
            'crown'       => $crown,
        ];
    }

    /**
     * Which end and which side of the car is working its tyres harder.
     *
     * @param array{FL: float, FR: float, RL: float, RR: float} $avgTempC
     * @return array{front_avg_c: float, rear_avg_c: float,
     *               front_minus_rear_c: float, left_minus_right_c: float}
     */
    public static function tireBalance(array $avgTempC): array
    {
        foreach (['FL', 'FR', 'RL', 'RR'] as $corner) {
            if (!isset($avgTempC[$corner])) {
                throw new InvalidArgumentException("tireBalance: missing corner $corner");
            }
        }
        $front = ($avgTempC['FL'] + $avgTempC['FR']) / 2.0;
        $rear  = ($avgTempC['RL'] + $avgTempC['RR']) / 2.0;
        $left  = ($avgTempC['FL'] + $avgTempC['RL']) / 2.0;
        $right = ($avgTempC['FR'] + $avgTempC['RR']) / 2.0;

        return [
            'front_avg_c'        => round($front, 1),
            'rear_avg_c'         => round($rear, 1),
            'front_minus_rear_c' => round($front - $rear, 1),
            'left_minus_right_c' => round($left - $right, 1),
        ];
    }

    // ------------------------------------------------------------------
    // Lap times
    // ------------------------------------------------------------------

    /**
     * Summary of a stint's valid flying laps (pass those only).
     * stdev is the sample standard deviation; a setup that is faster on
     * best lap but worse on stdev is often slower over a race.
     *
     * @param list<int> $lapsMs
     * @return array{count: int, best_ms: int, mean_ms: int, median_ms: int, stdev_ms: int}
     */
    public static function lapStats(array $lapsMs): array
    {
        $n = count($lapsMs);
        if ($n === 0) {
            throw new InvalidArgumentException('lapStats: no laps given');
        }
        sort($lapsMs);
        $mean   = array_sum($lapsMs) / $n;
        $middle = intdiv($n, 2);
        $median = $n % 2 === 1 ? $lapsMs[$middle] : ($lapsMs[$middle - 1] + $lapsMs[$middle]) / 2.0;

        $stdev = 0.0;
        if ($n > 1) {
            $sumSquares = 0.0;
            foreach ($lapsMs as $lap) {
                $sumSquares += ($lap - $mean) ** 2;
            }
            $stdev = sqrt($sumSquares / ($n - 1));
        }

        return [
            'count'     => $n,
            'best_ms'   => (int) $lapsMs[0],
            'mean_ms'   => (int) round($mean),
            'median_ms' => (int) round($median),
            'stdev_ms'  => (int) round($stdev),
        ];
    }

    /** 98345 -> "1:38.345" */
    public static function formatLap(int $ms): string
    {
        $minutes = intdiv($ms, 60000);
        $seconds = intdiv($ms % 60000, 1000);
        return sprintf('%d:%02d.%03d', $minutes, $seconds, $ms % 1000);
    }

    // ------------------------------------------------------------------
    // Fuel
    // ------------------------------------------------------------------

    public static function fuelPerLap(float $fuelStartL, float $fuelEndL, int $laps): float
    {
        if ($laps <= 0 || $fuelEndL > $fuelStartL) {
            throw new InvalidArgumentException('fuelPerLap: need at least one lap and end fuel below start fuel');
        }
        return ($fuelStartL - $fuelEndL) / $laps;
    }

    /** Litres to start with, rounded up, including a reserve measured in laps. */
    public static function fuelForLaps(int $laps, float $fuelPerLapL, float $reserveLaps = 1.0): int
    {
        if ($laps <= 0 || $fuelPerLapL <= 0.0) {
            throw new InvalidArgumentException('fuelForLaps: laps and consumption must be positive');
        }
        return (int) ceil(($laps + $reserveLaps) * $fuelPerLapL);
    }

    /** Laps in a timed race: the lap in progress when time expires still gets finished. */
    public static function lapsInTimedRace(int $durationSeconds, int $avgLapMs): int
    {
        if ($durationSeconds <= 0 || $avgLapMs <= 0) {
            throw new InvalidArgumentException('lapsInTimedRace: duration and lap time must be positive');
        }
        return (int) floor($durationSeconds * 1000 / $avgLapMs) + 1;
    }
}
