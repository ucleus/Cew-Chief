<?php
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/RaceMath.php';

const RM_CORNERS = ['FL', 'FR', 'RL', 'RR'];

/**
 * Builds the "computed" block the AI engineer treats as fact: ride
 * frequencies, roll stiffness and its front share, rake, each tyre's
 * pressure/thermal reading, tyre balance, lap stats, and the only
 * MATH-sourced setup change the AI is required to copy verbatim:
 * pressure_corrections.
 */
function range_for(array $car, string $paramKey, string $scope): ?array
{
    foreach ($car['ranges'] ?? [] as $r) {
        if ($r['param_key'] === $paramKey && $r['scope'] === $scope) {
            return $r;
        }
    }
    return null;
}

function to_real(array $car, string $paramKey, string $scope, float $screenValue): float
{
    $range = range_for($car, $paramKey, $scope);
    if (!$range || $range['real_base'] === null || $range['real_per_unit'] === null) {
        return $screenValue;
    }
    return RaceMath::toReal($screenValue, (float) $range['real_base'], (float) $range['real_per_unit']);
}

function compute_block(array $car, array $setup, ?array $compound, ?array $stint): array
{
    $out = [];

    try {
        $mass = RaceMath::cornerSprungMass(
            (float) $car['total_mass_kg'],
            (float) $setup['fuel_l'],
            (float) $car['front_weight_pct'],
            (float) $car['unsprung_front_kg'],
            (float) $car['unsprung_rear_kg'],
        );
        $kwFront = RaceMath::wheelRate((float) ($setup['corners']['FL']['spring_rate'] ?? 0), (float) $car['motion_ratio_front']);
        $kwRear = RaceMath::wheelRate((float) ($setup['corners']['RL']['spring_rate'] ?? 0), (float) $car['motion_ratio_rear']);

        $out['sprung_mass_kg'] = ['front_corner' => round($mass['front'], 1), 'rear_corner' => round($mass['rear'], 1)];
        $out['ride_frequency_hz'] = [
            'front' => round(RaceMath::rideFrequency($kwFront, $mass['front']), 2),
            'rear' => round(RaceMath::rideFrequency($kwRear, $mass['rear']), 2),
        ];

        $arbFront = (float) ($setup['arb_front'] ?? 0);
        $arbRear = (float) ($setup['arb_rear'] ?? 0);
        if ($arbFront > 0 && $arbRear > 0) {
            $rollFront = RaceMath::rollStiffness($kwFront, to_real($car, 'arb_front', 'CAR', $arbFront), (float) $car['track_front_mm']);
            $rollRear = RaceMath::rollStiffness($kwRear, to_real($car, 'arb_rear', 'CAR', $arbRear), (float) $car['track_rear_mm']);
            $out['roll_stiffness'] = [
                'front_nm_per_deg' => (int) round($rollFront),
                'rear_nm_per_deg' => (int) round($rollRear),
                'front_share_pct' => round(RaceMath::rollStiffnessFrontPct($rollFront, $rollRear), 1),
                'neutral_reference_pct' => round((float) $car['front_weight_pct'] + 5.0, 1),
            ];
        }
    } catch (InvalidArgumentException $e) {
        $out['sprung_mass_error'] = $e->getMessage();
    }

    try {
        $frontHeight = $setup['corners']['FL']['ride_height'] ?? null;
        $rearHeight = $setup['corners']['RL']['ride_height'] ?? null;
        if ($frontHeight !== null && $rearHeight !== null) {
            $out['rake'] = RaceMath::rake((float) $frontHeight, (float) $rearHeight, (float) $car['wheelbase_mm']);
        }
    } catch (InvalidArgumentException $e) {
        $out['rake_error'] = $e->getMessage();
    }

    if ($compound && $stint && !empty($stint['tires'])) {
        $tires = [];
        $avgTemps = [];
        $pressureCorrections = [];
        foreach (RM_CORNERS as $corner) {
            $t = $stint['tires'][$corner] ?? null;
            if (!$t) {
                continue;
            }
            $isFront = $corner[0] === 'F';
            $target = (float) ($isFront ? $compound['target_hot_psi_front'] : $compound['target_hot_psi_rear']);
            $thermal = RaceMath::tireThermal(
                (float) $t['temp_in_c'],
                (float) $t['temp_mid_c'],
                (float) $t['temp_out_c'],
                (float) $compound['temp_min_c'],
                (float) $compound['temp_max_c'],
            );
            $state = RaceMath::pressureState((float) $t['hot_psi'], $target);
            $tires[$corner] = ['hot_psi' => (float) $t['hot_psi'], 'target_hot_psi' => $target, 'pressure' => $state, 'thermal' => $thermal];
            $avgTemps[$corner] = $thermal['avg_c'];

            $coldNow = $setup['corners'][$corner]['cold_psi'] ?? null;
            if ($coldNow !== null) {
                $newCold = RaceMath::snap(
                    RaceMath::coldPressureForTarget((float) $coldNow, (float) $t['hot_psi'], $target),
                    15.0,
                    35.0,
                    0.5,
                );
                if (abs($newCold - (float) $coldNow) >= 0.5) {
                    $pressureCorrections[] = [
                        'param_key' => 'cold_psi', 'scope' => $corner,
                        'current_value' => (float) $coldNow, 'suggested_value' => $newCold, 'unit' => 'psi',
                    ];
                }
            }
        }
        if ($tires) {
            $out['tires'] = $tires;
            $out['tire_balance'] = RaceMath::tireBalance($avgTemps);
        }
        $out['pressure_corrections'] = $pressureCorrections;
    } else {
        $out['pressure_corrections'] = [];
    }

    if ($stint && !empty($stint['laps'])) {
        $validMs = array_values(array_map(
            fn ($l) => (int) $l['lap_ms'],
            array_filter($stint['laps'], fn ($l) => !empty($l['is_valid'])),
        ));
        if ($validMs) {
            $out['laps'] = RaceMath::lapStats($validMs);
        }
    }

    return $out;
}

switch (method()) {
    case 'POST':
        $in = json_input();
        foreach (['car', 'setup'] as $field) {
            if (empty($in[$field])) fail("$field is required");
        }
        respond(compute_block($in['car'], $in['setup'], $in['compound'] ?? null, $in['stint'] ?? null));

    default:
        fail('Method not allowed', 405);
}
