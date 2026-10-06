<?php
/**
 * One-time catalog seed: tracks, bikes, bike setup-param ranges, tyre options.
 * Run from the command line: php api/seed.php
 * Safe to re-run — every insert is skipped if the row already exists.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line: php api/seed.php\n");
}

require __DIR__ . '/config.php';

$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME),
    DB_USER,
    DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

const GAME = 'MotoGP 26';

// The 22 circuits in MotoGP 26 (RacingGames' launch track list, recovered
// from the earlier build's tuner/moto_tracks.php — that app seeded name and
// country only and left length/corners for the user to fill in; this one
// keeps the length_m for calendar tracks already in the public record
// instead of leaving it blank, but corner counts are left for you to enter
// from a lap, same as the original did).
// name, country, length_m, event/type notes
$tracks = [
    ['Chang International Circuit', 'Thailand', 4554, 'Thai GP — Championship / Hot'],
    ['Autódromo Internacional Ayrton Senna', 'Brazil', 3840, 'Brazilian GP — Championship (Goiânia)'],
    ['Circuit of the Americas', 'United States', 5513, 'Americas GP — Championship / Technical'],
    ['Circuito de Jerez', 'Spain', 4423, 'Spanish GP — Championship / Technical'],
    ['Circuit Bugatti, Le Mans', 'France', 4185, 'French GP — Championship / Stop-Go'],
    ['Circuit de Barcelona-Catalunya', 'Spain', 4657, 'Catalunya GP — Championship / Balanced'],
    ['Mugello Circuit', 'Italy', 5245, 'Italian GP — Championship / High Speed'],
    ['Balaton Park Circuit', 'Hungary', 4142, 'Hungarian GP — Championship / Technical'],
    ['Brno Circuit', 'Czechia', 5403, 'Czechia GP — Championship / Flowing'],
    ['TT Circuit Assen', 'Netherlands', 4542, 'Dutch GP — Championship / Flowing'],
    ['Sachsenring Circuit', 'Germany', 3671, 'German GP — Championship / Left-Heavy'],
    ['Silverstone Circuit', 'England', 5900, 'British GP — Championship / High Speed'],
    ['MotorLand Aragón', 'Spain', 5077, 'Aragón GP — Championship / High Speed'],
    ['Misano World Circuit Marco Simoncelli', 'Italy', 4226, 'San Marino GP — Championship / Technical'],
    ['Red Bull Ring (Spielberg)', 'Austria', 4318, 'Austrian GP — Championship / Power'],
    ['Mobility Resort Motegi', 'Japan', 4801, 'Japanese GP — Championship / Stop-Go'],
    ['Pertamina Mandalika International Circuit', 'Indonesia', 4310, 'Indonesian GP — Championship'],
    ['Phillip Island Grand Prix Circuit', 'Australia', 4445, 'Australian GP — Championship / High Speed'],
    ['Sepang International Circuit', 'Malaysia', 5543, 'Malaysian GP — Championship'],
    ['Lusail International Circuit', 'Qatar', 5380, 'Qatar GP — Championship / Night'],
    ['Autódromo Internacional do Algarve', 'Portugal', 4592, 'Portuguese GP — Championship / Undulating (Portimão)'],
    ['Circuit Ricardo Tormo, Valencia', 'Spain', 4005, 'Valencia GP — Championship / Technical'],
];

$bikesByClass = [
    'MotoGP' => ['Aprilia RS-GP', 'Ducati Desmosedici GP', 'Honda RC213V', 'KTM RC16', 'Yamaha YZR-M1'],
    'Moto2' => ['Boscoscuro B-26', 'Kalex Moto2', 'Yamaha Moto2'],
    'Moto3' => ['Honda NSF250RW', 'KTM RC 250 GP'],
];

// param_key => [min, max, default, step, flip]
$paramDefs = [
    'front_compression' => [1, 20, 10, 1, 0],
    'front_rebound' => [1, 20, 10, 1, 0],
    'front_preload' => [1, 10, 5, 1, 0],
    'front_height' => [1, 10, 5, 1, 0],
    'rear_compression' => [1, 20, 10, 1, 0],
    'rear_rebound' => [1, 20, 10, 1, 0],
    'rear_preload' => [1, 10, 5, 1, 0],
    'rear_height' => [1, 10, 5, 1, 0],
    'brake_bias' => [45, 60, 52, 1, 0],
    'engine_brake' => [1, 8, 4, 1, 0],
    'front_downforce' => [1, 10, 5, 1, 0],
    'rear_downforce' => [1, 10, 5, 1, 0],
    'tc1' => [1, 12, 6, 1, 0],
    'tc2' => [1, 12, 6, 1, 0],
    'wheelie_control' => [1, 8, 4, 1, 0],
    'engine_map' => [1, 6, 3, 1, 0],
    'anti_wheelie' => [1, 6, 3, 1, 0],
];

$tyreCompounds = [
    ['label' => 'Soft', 'kind' => 'SOFT', 'rank_no' => 1],
    ['label' => 'Medium', 'kind' => 'MEDIUM', 'rank_no' => 2],
    ['label' => 'Hard', 'kind' => 'HARD', 'rank_no' => 3],
    ['label' => 'Wet', 'kind' => 'WET', 'rank_no' => 4],
];

$trackInsert = $pdo->prepare(
    'INSERT INTO mg_tracks (name, country, length_m, notes)
     VALUES (?, ?, ?, ?)',
);
$trackExists = $pdo->prepare('SELECT id FROM mg_tracks WHERE name = ?');

$trackCount = 0;
foreach ($tracks as [$name, $country, $lengthM, $notes]) {
    $trackExists->execute([$name]);
    if ($trackExists->fetchColumn()) continue;
    $trackInsert->execute([$name, $country, $lengthM, $notes]);
    $trackCount++;
}
echo "Tracks seeded: $trackCount\n";

$bikeInsert = $pdo->prepare('INSERT INTO mg_bikes (game, class, name) VALUES (?, ?, ?)');
$bikeExists = $pdo->prepare('SELECT id FROM mg_bikes WHERE game = ? AND class = ? AND name = ?');
$paramInsert = $pdo->prepare(
    'INSERT INTO mg_bike_params (bike_id, param_key, min_value, max_value, default_value, step_value, flip)
     VALUES (?, ?, ?, ?, ?, ?, ?)',
);
$paramExists = $pdo->prepare('SELECT 1 FROM mg_bike_params WHERE bike_id = ? AND param_key = ?');
$optionInsert = $pdo->prepare(
    'INSERT INTO mg_bike_options (bike_id, param_key, label, kind, rank_no) VALUES (?, ?, ?, ?, ?)',
);
$optionExists = $pdo->prepare('SELECT 1 FROM mg_bike_options WHERE bike_id = ? AND param_key = ? AND label = ?');

$bikeCount = 0;
$paramCount = 0;
$optionCount = 0;

foreach ($bikesByClass as $class => $names) {
    foreach ($names as $name) {
        $bikeExists->execute([GAME, $class, $name]);
        $bikeId = $bikeExists->fetchColumn();
        if (!$bikeId) {
            $bikeInsert->execute([GAME, $class, $name]);
            $bikeId = (int) $pdo->lastInsertId();
            $bikeCount++;
        }

        foreach ($paramDefs as $key => [$min, $max, $default, $step, $flip]) {
            $paramExists->execute([$bikeId, $key]);
            if ($paramExists->fetchColumn()) continue;
            $paramInsert->execute([$bikeId, $key, $min, $max, $default, $step, $flip]);
            $paramCount++;
        }

        foreach (['tyre_front', 'tyre_rear'] as $tyreKey) {
            foreach ($tyreCompounds as $compound) {
                $optionExists->execute([$bikeId, $tyreKey, $compound['label']]);
                if ($optionExists->fetchColumn()) continue;
                $optionInsert->execute([$bikeId, $tyreKey, $compound['label'], $compound['kind'], $compound['rank_no']]);
                $optionCount++;
            }
        }
    }
}

echo "Bikes seeded: $bikeCount\n";
echo "Bike params seeded: $paramCount\n";
echo "Bike tyre options seeded: $optionCount\n";
echo "Done.\n";
