<?php
/**
 * One-time catalog seed for the Assetto Corsa side: cars, tracks, generic
 * setup param ranges, and a default tire compound per car.
 *
 * ac_folder is left NULL on purpose — these are real base-game cars/tracks
 * but the exact content folder name depends on your install. Fill it in
 * later through the car/track edit screen once you've checked your
 * content/cars and content/tracks directories.
 *
 * Run from the command line: php api/ac_seed.php
 * Safe to re-run — every insert is skipped if the row already exists.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line: php api/ac_seed.php\n");
}

require __DIR__ . '/config.php';

$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME),
    DB_USER,
    DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

// name, class, drivetrain, total_mass_kg, front_weight_pct, wheelbase_mm, track_front_mm, track_rear_mm, fuel_tank_l
$cars = [
    ['Mazda MX-5 Cup', 'Road/Cup', 'FR', 970.0, 52.0, 2330, 1500, 1505, 45.0],
    ['Toyota GT86', 'Road', 'FR', 1250.0, 53.0, 2570, 1520, 1540, 50.0],
    ['BMW M3 E30 Group A', 'Touring', 'FR', 960.0, 54.0, 2562, 1420, 1430, 60.0],
    ['BMW M3 E92', 'Road/GT', 'FR', 1570.0, 52.0, 2760, 1500, 1516, 63.0],
    ['Ferrari 458 Italia', 'GT', 'MR', 1485.0, 46.0, 2650, 1672, 1620, 92.0],
    ['McLaren MP4-12C', 'GT', 'MR', 1434.0, 42.0, 2670, 1670, 1650, 72.0],
    ['Nissan GT-R', 'GT', 'AWD', 1740.0, 54.0, 2780, 1590, 1600, 74.0],
    ['Lotus Elise SC', 'Road', 'MR', 931.0, 38.0, 2300, 1428, 1467, 40.0],
    ['KTM X-Bow R', 'Open/Road', 'MR', 790.0, 42.0, 2430, 1570, 1570, 50.0],
    ['RUF RT12R', 'GT', 'RR', 1495.0, 38.0, 2350, 1450, 1500, 67.0],
];

// name, country (-> folded into notes, table has no country column), length_m, direction, downforce_demand
$tracks = [
    ['Silverstone Circuit', 5891, 'CW', 'HIGH', 'United Kingdom'],
    ['Autodromo Nazionale di Monza', 5793, 'CW', 'LOW', 'Italy'],
    ['Autodromo Internazionale del Mugello', 5245, 'CW', 'MEDIUM', 'Italy'],
    ['Autodromo Internazionale Enzo e Dino Ferrari', 4909, 'CW', 'MEDIUM', 'Italy — Imola'],
    ['Autodromo Piero Taruffi', 4085, 'CW', 'MEDIUM', 'Italy — Vallelunga'],
    ["Autodromo dell'Umbria", 2507, 'CW', 'LOW', 'Italy — Magione'],
    ['Nürburgring GP', 5148, 'CW', 'MEDIUM', 'Germany'],
    ['Circuit de Spa-Francorchamps', 7004, 'CW', 'MEDIUM', 'Belgium'],
    ['Circuit Park Zandvoort', 4252, 'CW', 'MEDIUM', 'Netherlands'],
    ['Trento-Bondone', 5500, 'CW', 'LOW', 'Italy — hillclimb'],
];

// param_key => [min, max, default_step, unit, higher_means]
$carParams = [
    'brake_bias_front_pct' => [50, 70, 0.5, '%', 'more front brake bias'],
    'brake_power_pct' => [80, 100, 1, '%', 'more overall brake force'],
    'brake_duct_front' => [1, 6, 1, 'clicks', 'more front brake cooling'],
    'brake_duct_rear' => [1, 6, 1, 'clicks', 'more rear brake cooling'],
    'arb_front' => [10, 80, 1, 'N/mm', 'stiffer front roll resistance'],
    'arb_rear' => [10, 80, 1, 'N/mm', 'stiffer rear roll resistance'],
    'caster_deg' => [3.0, 7.0, 0.1, 'deg', 'more caster / self-centering'],
    'wing_front' => [0, 10, 1, 'clicks', 'more front downforce'],
    'wing_rear' => [0, 10, 1, 'clicks', 'more rear downforce'],
    'diff_power_pct' => [20, 100, 5, '%', 'more locked under power'],
    'diff_coast_pct' => [0, 100, 5, '%', 'more locked on throttle-off'],
    'diff_preload_nm' => [10, 120, 5, 'Nm', 'more baseline diff lock'],
    'final_drive' => [3.0, 4.5, 0.01, 'ratio', 'shorter overall gearing'],
    'tc_level' => [0, 10, 1, 'level', 'more traction control intervention'],
    'abs_level' => [0, 10, 1, 'level', 'more ABS intervention'],
    'engine_brake' => [0, 10, 1, 'level', 'more engine braking on decel'],
    'turbo_boost_pct' => [80, 110, 1, '%', 'more boost / power'],
];

// applies once per axle (FRONT, REAR)
$cornerParams = [
    'cold_psi' => [20, 32, 0.5, 'psi', 'more cold pressure'],
    'camber_deg' => [-5.0, -0.5, 0.1, 'deg', 'less negative camber'],
    'toe' => [-0.50, 0.50, 0.01, 'deg', 'more toe-in'],
    'spring_rate' => [40, 180, 1, 'N/mm', 'stiffer spring'],
    'ride_height' => [50, 120, 1, 'mm', 'more ground clearance'],
    'packer' => [0, 20, 1, 'mm', 'more travel before packing'],
    'bumpstop_rate' => [0, 500, 10, 'N/mm', 'harder bump stop'],
    'slow_bump' => [1, 20, 1, 'clicks', 'stiffer low-speed compression'],
    'slow_rebound' => [1, 20, 1, 'clicks', 'stiffer low-speed rebound'],
    'fast_bump' => [1, 20, 1, 'clicks', 'stiffer high-speed compression'],
    'fast_rebound' => [1, 20, 1, 'clicks', 'stiffer high-speed rebound'],
];

$carInsert = $pdo->prepare(
    'INSERT INTO cars
        (name, car_class, drivetrain, total_mass_kg, front_weight_pct, wheelbase_mm, track_front_mm, track_rear_mm, fuel_tank_l)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
$carExists = $pdo->prepare('SELECT id FROM cars WHERE name = ?');

$rangeInsert = $pdo->prepare(
    'INSERT INTO car_param_ranges (car_id, param_key, scope, min_value, max_value, step_value, unit, higher_means)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
$rangeExists = $pdo->prepare('SELECT 1 FROM car_param_ranges WHERE car_id = ? AND param_key = ? AND scope = ?');

$compoundInsert = $pdo->prepare(
    'INSERT INTO tire_compounds (car_id, name, target_hot_psi_front, target_hot_psi_rear, temp_min_c, temp_max_c)
     VALUES (?, ?, ?, ?, ?, ?)',
);
$compoundExists = $pdo->prepare('SELECT 1 FROM tire_compounds WHERE car_id = ? AND name = ?');

$carCount = 0;
$rangeCount = 0;
$compoundCount = 0;

foreach ($cars as [$name, $class, $drivetrain, $mass, $frontPct, $wheelbase, $trackF, $trackR, $fuel]) {
    $carExists->execute([$name]);
    $carId = $carExists->fetchColumn();
    if (!$carId) {
        $carInsert->execute([$name, $class, $drivetrain, $mass, $frontPct, $wheelbase, $trackF, $trackR, $fuel]);
        $carId = (int) $pdo->lastInsertId();
        $carCount++;
    }

    foreach ($carParams as $key => [$min, $max, $step, $unit, $means]) {
        $rangeExists->execute([$carId, $key, 'CAR']);
        if ($rangeExists->fetchColumn()) continue;
        $rangeInsert->execute([$carId, $key, 'CAR', $min, $max, $step, $unit, $means]);
        $rangeCount++;
    }

    foreach (['FRONT', 'REAR'] as $scope) {
        foreach ($cornerParams as $key => [$min, $max, $step, $unit, $means]) {
            $rangeExists->execute([$carId, $key, $scope]);
            if ($rangeExists->fetchColumn()) continue;
            $rangeInsert->execute([$carId, $key, $scope, $min, $max, $step, $unit, $means]);
            $rangeCount++;
        }
    }

    $compoundExists->execute([$carId, 'Slick']);
    if (!$compoundExists->fetchColumn()) {
        $compoundInsert->execute([$carId, 'Slick', 27.5, 27.5, 80.0, 105.0]);
        $compoundCount++;
    }
}

$trackInsert = $pdo->prepare('INSERT INTO tracks (name, length_m, direction, downforce_demand, notes) VALUES (?, ?, ?, ?, ?)');
$trackExists = $pdo->prepare('SELECT id FROM tracks WHERE name = ?');

$trackCount = 0;
foreach ($tracks as [$name, $lengthM, $direction, $downforce, $notes]) {
    $trackExists->execute([$name]);
    if ($trackExists->fetchColumn()) continue;
    $trackInsert->execute([$name, $lengthM, $direction, $downforce, $notes]);
    $trackCount++;
}

echo "Cars seeded: $carCount\n";
echo "Car param ranges seeded: $rangeCount\n";
echo "Tire compounds seeded: $compoundCount\n";
echo "Tracks seeded: $trackCount\n";
echo "Done. ac_folder is NULL on every car/track — fill it in from your install via the edit screen.\n";
