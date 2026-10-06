<?php
declare(strict_types=1);

/**
 * RaceMath - the deterministic half of the AC race engineer.
 *
 * Ported from the earlier build's tuner/RaceMath.php (verified against
 * tuner/selftest.php's hand-calculated checks). Pure arithmetic, no DB or
 * network access. The AI never recalculates these numbers; it only reads
 * them from api/ac_compute.php's output.
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
 * Bad inputs throw InvalidArgumentException instead of returning 0.
 */
final class RaceMath
{
    public const PSI_ATMOSPHERE = 14.696;
    public const FUEL_KG_PER_L = 0.75;

    public static function toReal(float $screenValue, ?float $realBase = null, ?float $realPerUnit = null): float
    {
        if ($realBase === null || $realPerUnit === null) {
            return $screenValue;
        }
        return $realBase + $screenValue * $realPerUnit;
    }

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

    public static function fuelMassKg(float $fuelLitres): float
    {
        return max(0.0, $fuelLitres) * self::FUEL_KG_PER_L;
    }

    /** @return array{front: float, rear: float} kg per corner */
    public static function cornerSprungMass(
        float $totalMassKg,
        float $fuelLitres,
        float $frontWeightPct,
        float $unsprungFrontKg,
        float $unsprungRearKg,
    ): array {
        if ($totalMassKg <= 0.0) {
            throw new InvalidArgumentException('cornerSprungMass: total mass must be positive');
        }
        if ($frontWeightPct <= 0.0 || $frontWeightPct >= 100.0) {
            throw new InvalidArgumentException('cornerSprungMass: front weight % must be between 0 and 100');
        }

        $mass = $totalMassKg + self::fuelMassKg($fuelLitres);
        $front = $mass * ($frontWeightPct / 100.0) / 2.0 - $unsprungFrontKg;
        $rear = $mass * (1.0 - $frontWeightPct / 100.0) / 2.0 - $unsprungRearKg;

        if ($front <= 0.0 || $rear <= 0.0) {
            throw new InvalidArgumentException('cornerSprungMass: unsprung mass exceeds corner mass, check the car spec');
        }
        return ['front' => $front, 'rear' => $rear];
    }

    public static function wheelRate(float $springRateNmm, float $motionRatio = 1.0): float
    {
        if ($springRateNmm <= 0.0 || $motionRatio <= 0.0) {
            throw new InvalidArgumentException('wheelRate: spring rate and motion ratio must be positive');
        }
        return $springRateNmm * 1000.0 * $motionRatio ** 2;
    }

    public static function rideFrequency(float $wheelRateNm, float $sprungMassKg): float
    {
        if ($wheelRateNm <= 0.0 || $sprungMassKg <= 0.0) {
            throw new InvalidArgumentException('rideFrequency: wheel rate and sprung mass must be positive');
        }
        return sqrt($wheelRateNm / $sprungMassKg) / (2.0 * M_PI);
    }

    public static function criticalDamping(float $wheelRateNm, float $sprungMassKg): float
    {
        if ($wheelRateNm <= 0.0 || $sprungMassKg <= 0.0) {
            throw new InvalidArgumentException('criticalDamping: wheel rate and sprung mass must be positive');
        }
        return 2.0 * sqrt($wheelRateNm * $sprungMassKg);
    }

    public static function dampingRatio(float $damperNsm, float $wheelRateNm, float $sprungMassKg): float
    {
        if ($damperNsm < 0.0) {
            throw new InvalidArgumentException('dampingRatio: damper rate cannot be negative');
        }
        return $damperNsm / self::criticalDamping($wheelRateNm, $sprungMassKg);
    }

    /** Roll stiffness of one axle in Nm per degree of body roll. */
    public static function rollStiffness(float $wheelRateNm, float $arbRateNm, float $trackWidthMm): float
    {
        if ($wheelRateNm <= 0.0 || $arbRateNm < 0.0 || $trackWidthMm <= 0.0) {
            throw new InvalidArgumentException('rollStiffness: invalid wheel rate, bar rate or track width');
        }
        $t = $trackWidthMm / 1000.0;
        return $t ** 2 * ($wheelRateNm / 2.0 + $arbRateNm) * (M_PI / 180.0);
    }

    public static function rollStiffnessFrontPct(float $frontNmDeg, float $rearNmDeg): float
    {
        $total = $frontNmDeg + $rearNmDeg;
        if ($total <= 0.0) {
            throw new InvalidArgumentException('rollStiffnessFrontPct: total roll stiffness must be positive');
        }
        return $frontNmDeg / $total * 100.0;
    }

    /** @return array{delta_mm: float, angle_deg: float} */
    public static function rake(float $frontHeightMm, float $rearHeightMm, float $wheelbaseMm): array
    {
        if ($wheelbaseMm <= 0.0) {
            throw new InvalidArgumentException('rake: wheelbase must be positive');
        }
        $delta = $rearHeightMm - $frontHeightMm;
        return [
            'delta_mm' => round($delta, 1),
            'angle_deg' => round(rad2deg(atan($delta / $wheelbaseMm)), 3),
        ];
    }

    /**
     * Cold pressure to set so the tyre reaches the target when hot.
     * A tyre of fixed volume gains pressure in proportion to its absolute
     * pressure, so the correction is a ratio on absolute values.
     */
    public static function coldPressureForTarget(float $coldPsi, float $hotPsi, float $targetHotPsi): float
    {
        if ($coldPsi <= 0.0 || $hotPsi <= 0.0 || $targetHotPsi <= 0.0) {
            throw new InvalidArgumentException('coldPressureForTarget: pressures must be positive');
        }
        $atm = self::PSI_ATMOSPHERE;
        return ($coldPsi + $atm) * ($targetHotPsi + $atm) / ($hotPsi + $atm) - $atm;
    }

    /** @return array{delta_psi: float, state: string} */
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

    /**
     * @return array{avg_c: float, spread_c: float, mid_delta_c: float,
     *               window: string, camber: string, crown: string}
     */
    public static function tireThermal(
        float $tempIn,
        float $tempMid,
        float $tempOut,
        float $windowMinC,
        float $windowMaxC,
        float $spreadMinC = 3.0,
        float $spreadMaxC = 12.0,
        float $midToleranceC = 2.0,
    ): array {
        $avg = ($tempIn + $tempMid + $tempOut) / 3.0;
        $spread = $tempIn - $tempOut;
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
            'avg_c' => round($avg, 1),
            'spread_c' => round($spread, 1),
            'mid_delta_c' => round($midDelta, 1),
            'window' => $window,
            'camber' => $camber,
            'crown' => $crown,
        ];
    }

    /**
     * @param array{FL: float, FR: float, RL: float, RR: float} $avgTempC
     * @return array{front_avg_c: float, rear_avg_c: float, front_minus_rear_c: float, left_minus_right_c: float}
     */
    public static function tireBalance(array $avgTempC): array
    {
        foreach (['FL', 'FR', 'RL', 'RR'] as $corner) {
            if (!isset($avgTempC[$corner])) {
                throw new InvalidArgumentException("tireBalance: missing corner $corner");
            }
        }
        $front = ($avgTempC['FL'] + $avgTempC['FR']) / 2.0;
        $rear = ($avgTempC['RL'] + $avgTempC['RR']) / 2.0;
        $left = ($avgTempC['FL'] + $avgTempC['RL']) / 2.0;
        $right = ($avgTempC['FR'] + $avgTempC['RR']) / 2.0;

        return [
            'front_avg_c' => round($front, 1),
            'rear_avg_c' => round($rear, 1),
            'front_minus_rear_c' => round($front - $rear, 1),
            'left_minus_right_c' => round($left - $right, 1),
        ];
    }

    /**
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
        $mean = array_sum($lapsMs) / $n;
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
            'count' => $n,
            'best_ms' => (int) $lapsMs[0],
            'mean_ms' => (int) round($mean),
            'median_ms' => (int) round($median),
            'stdev_ms' => (int) round($stdev),
        ];
    }

    public static function formatLap(int $ms): string
    {
        $minutes = intdiv($ms, 60000);
        $seconds = intdiv($ms % 60000, 1000);
        return sprintf('%d:%02d.%03d', $minutes, $seconds, $ms % 1000);
    }

    public static function fuelPerLap(float $fuelStartL, float $fuelEndL, int $laps): float
    {
        if ($laps <= 0 || $fuelEndL > $fuelStartL) {
            throw new InvalidArgumentException('fuelPerLap: need at least one lap and end fuel below start fuel');
        }
        return ($fuelStartL - $fuelEndL) / $laps;
    }

    public static function fuelForLaps(int $laps, float $fuelPerLapL, float $reserveLaps = 1.0): int
    {
        if ($laps <= 0 || $fuelPerLapL <= 0.0) {
            throw new InvalidArgumentException('fuelForLaps: laps and consumption must be positive');
        }
        return (int) ceil(($laps + $reserveLaps) * $fuelPerLapL);
    }

    public static function lapsInTimedRace(int $durationSeconds, int $avgLapMs): int
    {
        if ($durationSeconds <= 0 || $avgLapMs <= 0) {
            throw new InvalidArgumentException('lapsInTimedRace: duration and lap time must be positive');
        }
        return (int) floor($durationSeconds * 1000 / $avgLapMs) + 1;
    }
}
