<?php
declare(strict_types=1);

/**
 * Run from the command line:  php selftest.php
 *
 * 1. Checks RaceMath against hand-calculated values.
 * 2. Builds the example request payload for the AI engineer from those
 *    same calculations and prints it (add --write to save it next to
 *    this file as payload_example.json).
 *
 * The car below is an invented GT3-style example, not a real car's data.
 */

require __DIR__ . '/RaceMath.php';

$failures = 0;

function check(string $label, float $actual, float $expected, float $tolerance = 0.01): void
{
    global $failures;
    $ok = abs($actual - $expected) <= $tolerance;
    if (!$ok) {
        $failures++;
    }
    fwrite(STDERR, sprintf("%s  %-44s got %.4f, expected %.4f\n", $ok ? 'PASS' : 'FAIL', $label, $actual, $expected));
}

function throws(string $label, callable $fn): void
{
    global $failures;
    try {
        $fn();
        $failures++;
        fwrite(STDERR, "FAIL  $label did not throw\n");
    } catch (InvalidArgumentException) {
        fwrite(STDERR, "PASS  $label throws on bad input\n");
    }
}

// ---------------------------------------------------------------------
// Example data (what the database would hold)
// ---------------------------------------------------------------------

$car = [
    'name' => 'Example GT3', 'car_class' => 'GT3', 'drivetrain' => 'MR',
    'total_mass_kg' => 1300.0, 'front_weight_pct' => 45.0,
    'wheelbase_mm' => 2700, 'track_front_mm' => 1650, 'track_rear_mm' => 1620,
    'unsprung_front_kg' => 45.0, 'unsprung_rear_kg' => 50.0,
];
$compound = ['name' => 'Slick Medium', 'target_hot_psi_front' => 27.0, 'target_hot_psi_rear' => 27.0, 'temp_min_c' => 80.0, 'temp_max_c' => 95.0];
$setup = [
    'fuel_l' => 40.0, 'brake_bias_front_pct' => 58.0, 'arb_front' => 60.0, 'arb_rear' => 30.0,
    'wing_rear' => 6, 'diff_power_pct' => 50, 'diff_coast_pct' => 40, 'diff_preload_nm' => 60, 'tc_level' => 4, 'abs_level' => 3,
];
$corners = [
    'FL' => ['cold_psi' => 23.0, 'camber_deg' => -3.5, 'spring_rate' => 150.0, 'ride_height' => 62.0, 'slow_bump' => 6, 'slow_rebound' => 8],
    'FR' => ['cold_psi' => 23.0, 'camber_deg' => -3.5, 'spring_rate' => 150.0, 'ride_height' => 62.0, 'slow_bump' => 6, 'slow_rebound' => 8],
    'RL' => ['cold_psi' => 22.0, 'camber_deg' => -2.8, 'spring_rate' => 130.0, 'ride_height' => 78.0, 'slow_bump' => 5, 'slow_rebound' => 7],
    'RR' => ['cold_psi' => 22.0, 'camber_deg' => -2.8, 'spring_rate' => 130.0, 'ride_height' => 78.0, 'slow_bump' => 5, 'slow_rebound' => 7],
];
// Anti-roll bars on this example car show N/mm on screen: real N/m = 0 + screen * 1000.
$arbConversion = ['real_base' => 0.0, 'real_per_unit' => 1000.0];
$pressureRange = ['min' => 15.0, 'max' => 35.0, 'step' => 1.0];

$stintTires = [
    'FL' => ['hot_psi' => 27.2, 'in' => 88.0, 'mid' => 84.5, 'out' => 80.0],
    'FR' => ['hot_psi' => 28.7, 'in' => 97.0, 'mid' => 92.0, 'out' => 81.0],
    'RL' => ['hot_psi' => 25.6, 'in' => 82.0, 'mid' => 78.5, 'out' => 77.0],
    'RR' => ['hot_psi' => 26.9, 'in' => 86.0, 'mid' => 83.0, 'out' => 79.5],
];
$validLaps = [99412, 98876, 98345, 98590, 98702, 99105];

// ---------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------

$mass = RaceMath::cornerSprungMass($car['total_mass_kg'], $setup['fuel_l'], $car['front_weight_pct'], $car['unsprung_front_kg'], $car['unsprung_rear_kg']);
check('sprung mass front corner (kg)', $mass['front'], 254.25);
check('sprung mass rear corner (kg)', $mass['rear'], 315.75);

$kwFront = RaceMath::wheelRate($corners['FL']['spring_rate']);
$kwRear  = RaceMath::wheelRate($corners['RL']['spring_rate']);
check('wheel rate front (N/m)', $kwFront, 150000.0);
check('wheel rate with 0.75 motion ratio (N/m)', RaceMath::wheelRate(150.0, 0.75), 84375.0);

$freqFront = RaceMath::rideFrequency($kwFront, $mass['front']);
$freqRear  = RaceMath::rideFrequency($kwRear, $mass['rear']);
check('ride frequency front (Hz)', $freqFront, 3.8658, 0.001);
check('ride frequency rear (Hz)', $freqRear, 3.2294, 0.001);

check('critical damping front (Ns/m)', RaceMath::criticalDamping($kwFront, $mass['front']), 12351.11, 0.5);
check('damping ratio, 8000 Ns/m front', RaceMath::dampingRatio(8000.0, $kwFront, $mass['front']), 0.6477, 0.001);

$arbFront  = RaceMath::toReal($setup['arb_front'], $arbConversion['real_base'], $arbConversion['real_per_unit']);
$arbRear   = RaceMath::toReal($setup['arb_rear'], $arbConversion['real_base'], $arbConversion['real_per_unit']);
$rollFront = RaceMath::rollStiffness($kwFront, $arbFront, $car['track_front_mm']);
$rollRear  = RaceMath::rollStiffness($kwRear, $arbRear, $car['track_rear_mm']);
$rollPct   = RaceMath::rollStiffnessFrontPct($rollFront, $rollRear);
check('roll stiffness front (Nm/deg)', $rollFront, 6414.75, 0.5);
check('roll stiffness rear (Nm/deg)', $rollRear, 4351.46, 0.5);
check('roll stiffness front share (%)', $rollPct, 59.582, 0.01);

$rake = RaceMath::rake($corners['FL']['ride_height'], $corners['RL']['ride_height'], (float) $car['wheelbase_mm']);
check('rake delta (mm)', $rake['delta_mm'], 16.0);
check('rake angle (deg)', $rake['angle_deg'], 0.340, 0.001);

check('cold pressure for target, FR (psi)', RaceMath::coldPressureForTarget(23.0, 28.7, 27.0), 21.523, 0.005);
check('snap 21.52 to 1 psi step', RaceMath::snap(21.523, 15.0, 35.0, 1.0), 22.0);
check('snap clamps to max', RaceMath::snap(99.0, 0.0, 10.0, 0.5), 10.0);
check('snap on 0.1 grid', RaceMath::snap(-3.26, -5.0, 0.0, 0.1), -3.3);

$stats = RaceMath::lapStats($validLaps);
check('lap best (ms)', (float) $stats['best_ms'], 98345.0);
check('lap mean (ms)', (float) $stats['mean_ms'], 98838.0, 0.5);
check('lap median (ms)', (float) $stats['median_ms'], 98789.0, 0.5);
check('lap stdev (ms)', (float) $stats['stdev_ms'], 381.0, 1.0);

check('fuel per lap (L)', RaceMath::fuelPerLap(40.0, 22.6, 6), 2.9);
check('fuel for 25 laps + 1 reserve (L)', (float) RaceMath::fuelForLaps(25, 2.9), 76.0);
check('laps in 60 min race', (float) RaceMath::lapsInTimedRace(3600, 98838), 37.0);

throws('rideFrequency with zero mass', fn () => RaceMath::rideFrequency(150000.0, 0.0));
throws('cornerSprungMass with silly unsprung mass', fn () => RaceMath::cornerSprungMass(900.0, 0.0, 45.0, 400.0, 50.0));

if (RaceMath::formatLap(98345) !== '1:38.345') {
    $failures++;
    fwrite(STDERR, "FAIL  formatLap\n");
}

// ---------------------------------------------------------------------
// Payload for the AI engineer
// ---------------------------------------------------------------------

$tires = [];
$avgTemps = [];
$pressureCorrections = [];
foreach ($stintTires as $corner => $t) {
    $isFront = $corner[0] === 'F';
    $target  = $isFront ? $compound['target_hot_psi_front'] : $compound['target_hot_psi_rear'];
    $thermal = RaceMath::tireThermal($t['in'], $t['mid'], $t['out'], $compound['temp_min_c'], $compound['temp_max_c']);
    $state   = RaceMath::pressureState($t['hot_psi'], $target);

    $tires[$corner] = ['hot_psi' => $t['hot_psi'], 'target_hot_psi' => $target, 'pressure' => $state, 'thermal' => $thermal];
    $avgTemps[$corner] = $thermal['avg_c'];

    $newCold = RaceMath::snap(
        RaceMath::coldPressureForTarget($corners[$corner]['cold_psi'], $t['hot_psi'], $target),
        $pressureRange['min'], $pressureRange['max'], $pressureRange['step']
    );
    if ($newCold !== $corners[$corner]['cold_psi']) {
        $pressureCorrections[] = [
            'param_key' => 'cold_psi', 'scope' => $corner,
            'current_value' => $corners[$corner]['cold_psi'], 'suggested_value' => $newCold, 'unit' => 'psi',
        ];
    }
}

$payload = [
    'prompt_version' => '1.0',
    'track' => [
        'name' => 'Example Circuit', 'layout' => 'GP', 'length_m' => 5148, 'direction' => 'CW',
        'downforce_demand' => 'HIGH', 'bumpiness' => 2, 'kerb_usage' => 3,
        'slow_corners' => 5, 'medium_corners' => 6, 'fast_corners' => 4, 'longest_straight_m' => 760,
    ],
    'conditions' => ['ambient_temp_c' => 24.0, 'track_temp_c' => 32.5, 'grip_pct' => 98.0],
    'car' => $car,
    'tire' => $compound,
    'setup' => [
        'version' => 3,
        'purpose' => 'RACE',
        'values' => ['car' => $setup, 'corners' => $corners],
        'adjustable' => [
            ['param_key' => 'cold_psi', 'scope' => 'FRONT', 'min' => 15, 'max' => 35, 'step' => 1, 'unit' => 'psi', 'higher_means' => 'more pressure'],
            ['param_key' => 'cold_psi', 'scope' => 'REAR', 'min' => 15, 'max' => 35, 'step' => 1, 'unit' => 'psi', 'higher_means' => 'more pressure'],
            ['param_key' => 'camber_deg', 'scope' => 'FRONT', 'min' => -5.0, 'max' => -1.0, 'step' => 0.1, 'unit' => 'deg', 'higher_means' => 'less negative camber'],
            ['param_key' => 'camber_deg', 'scope' => 'REAR', 'min' => -4.0, 'max' => -0.5, 'step' => 0.1, 'unit' => 'deg', 'higher_means' => 'less negative camber'],
            ['param_key' => 'spring_rate', 'scope' => 'FRONT', 'min' => 110, 'max' => 190, 'step' => 10, 'unit' => 'N/mm', 'higher_means' => 'stiffer'],
            ['param_key' => 'spring_rate', 'scope' => 'REAR', 'min' => 90, 'max' => 170, 'step' => 10, 'unit' => 'N/mm', 'higher_means' => 'stiffer'],
            ['param_key' => 'ride_height', 'scope' => 'FRONT', 'min' => 55, 'max' => 80, 'step' => 1, 'unit' => 'mm', 'higher_means' => 'higher'],
            ['param_key' => 'ride_height', 'scope' => 'REAR', 'min' => 60, 'max' => 95, 'step' => 1, 'unit' => 'mm', 'higher_means' => 'higher'],
            ['param_key' => 'slow_bump', 'scope' => 'FRONT', 'min' => 0, 'max' => 12, 'step' => 1, 'unit' => 'clicks', 'higher_means' => 'stiffer'],
            ['param_key' => 'slow_bump', 'scope' => 'REAR', 'min' => 0, 'max' => 12, 'step' => 1, 'unit' => 'clicks', 'higher_means' => 'stiffer'],
            ['param_key' => 'slow_rebound', 'scope' => 'FRONT', 'min' => 0, 'max' => 12, 'step' => 1, 'unit' => 'clicks', 'higher_means' => 'stiffer'],
            ['param_key' => 'slow_rebound', 'scope' => 'REAR', 'min' => 0, 'max' => 12, 'step' => 1, 'unit' => 'clicks', 'higher_means' => 'stiffer'],
            ['param_key' => 'arb_front', 'scope' => 'CAR', 'min' => 20, 'max' => 100, 'step' => 10, 'unit' => 'N/mm', 'higher_means' => 'stiffer'],
            ['param_key' => 'arb_rear', 'scope' => 'CAR', 'min' => 10, 'max' => 70, 'step' => 10, 'unit' => 'N/mm', 'higher_means' => 'stiffer'],
            ['param_key' => 'wing_rear', 'scope' => 'CAR', 'min' => 0, 'max' => 10, 'step' => 1, 'unit' => 'clicks', 'higher_means' => 'more downforce and drag'],
            ['param_key' => 'brake_bias_front_pct', 'scope' => 'CAR', 'min' => 50, 'max' => 70, 'step' => 0.5, 'unit' => '%', 'higher_means' => 'more front braking'],
            ['param_key' => 'diff_power_pct', 'scope' => 'CAR', 'min' => 10, 'max' => 90, 'step' => 5, 'unit' => '%', 'higher_means' => 'more lock on throttle'],
            ['param_key' => 'diff_coast_pct', 'scope' => 'CAR', 'min' => 10, 'max' => 90, 'step' => 5, 'unit' => '%', 'higher_means' => 'more lock off throttle'],
            ['param_key' => 'diff_preload_nm', 'scope' => 'CAR', 'min' => 0, 'max' => 150, 'step' => 10, 'unit' => 'Nm', 'higher_means' => 'more preload'],
            ['param_key' => 'tc_level', 'scope' => 'CAR', 'min' => 0, 'max' => 8, 'step' => 1, 'unit' => 'level', 'higher_means' => 'more intervention'],
        ],
    ],
    'computed' => [
        'sprung_mass_kg' => ['front_corner' => round($mass['front'], 1), 'rear_corner' => round($mass['rear'], 1)],
        'ride_frequency_hz' => ['front' => round($freqFront, 2), 'rear' => round($freqRear, 2)],
        'roll_stiffness' => [
            'front_nm_per_deg' => (int) round($rollFront), 'rear_nm_per_deg' => (int) round($rollRear),
            'front_share_pct' => round($rollPct, 1), 'neutral_reference_pct' => $car['front_weight_pct'] + 5.0,
        ],
        'rake' => $rake,
        'tires' => $tires,
        'tire_balance' => RaceMath::tireBalance($avgTemps),
        'pressure_corrections' => $pressureCorrections,
        'laps' => $stats,
    ],
    'feedback' => [
        ['phase' => 'ENTRY', 'speed_range' => 'LOW', 'symptom' => 'OVERSTEER', 'severity' => 4, 'corner_ref' => 'T1', 'note' => 'Rear steps out as I release the brake'],
        ['phase' => 'EXIT', 'speed_range' => 'LOW', 'symptom' => 'TRACTION_LOSS', 'severity' => 3, 'corner_ref' => 'final chicane', 'note' => 'Wheelspin on the inside rear'],
    ],
    'history' => [
        [
            'from_version' => 2, 'to_version' => 3,
            'changes' => [['param_key' => 'arb_rear', 'scope' => 'CAR', 'from' => 40, 'to' => 30, 'unit' => 'N/mm']],
            'best_lap_delta_ms' => -180, 'avg_lap_delta_ms' => -95, 'conditions_comparable' => true,
            'driver_verdict' => 'Better mid-corner, entry still loose',
        ],
    ],
];

$json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

if (in_array('--write', $argv, true)) {
    file_put_contents(__DIR__ . '/payload_example.json', $json . "\n");
}
echo $json, "\n";

fwrite(STDERR, $failures === 0 ? "\nAll checks passed.\n" : "\n$failures check(s) FAILED.\n");
exit($failures === 0 ? 0 : 1);
