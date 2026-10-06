<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$count = fn (string $table): int => (int) q("SELECT COUNT(*) FROM $table")->fetchColumn();
$steps = [
    ['Add a track',            'Its length, downforce demand and how bumpy it is.',            'tracks.php?id=new', $count('tracks')],
    ['Add a car',              'Its weight, its tyres and the settings it lets you change.',   'cars.php?id=new',   $count('cars')],
    ['Enter a baseline setup', 'The values on the car before you start testing.',              'setups.php?id=new', $count('setups')],
    ['Log a stint',            'Lap times, hot tyre readings and what the driver felt.',       'stints.php?id=new', $count('stints')],
];

$runs = 'SELECT st.id, st.run_at, st.lap_count, st.best_lap_ms, st.avg_lap_ms, s.id AS setup_id, s.version, s.name AS setup,
                s.car_id, s.track_id, c.name AS car, t.name AS track
         FROM stints st JOIN setups s ON s.id = st.setup_id JOIN cars c ON c.id = s.car_id JOIN tracks t ON t.id = s.track_id';
$recent = q("$runs ORDER BY st.run_at DESC, st.id DESC LIMIT 5")->fetchAll();
$last = $recent[0] ?? null;
$trend = $last ? array_reverse(q("$runs WHERE s.car_id = ? AND s.track_id = ? ORDER BY st.run_at DESC, st.id DESC LIMIT 12",
    [$last['car_id'], $last['track_id']])->fetchAll()) : [];
$advice = q('SELECT id, provider, model, confidence, status, diagnosis, created_at FROM recommendations ORDER BY id DESC LIMIT 1')->fetch();

page_header('Assetto Corsa');
hud_dashboard([
    'title' => 'Assetto Corsa',
    'run' => 'stint',
    'runs' => 'stints.php',
    'last' => $last ? [
        'href' => 'stints.php?id=' . $last['id'], 'best_ms' => $last['best_lap_ms'], 'avg_ms' => $last['avg_lap_ms'],
        'laps' => (int) $last['lap_count'], 'run_at' => $last['run_at'], 'track' => $last['track'], 'machine' => $last['car'],
        'valid' => (int) q('SELECT COUNT(*) FROM stint_laps WHERE stint_id = ? AND is_valid = 1', [$last['id']])->fetchColumn(),
        'setup' => 'Setup v' . $last['version'] . ' ' . $last['setup'], 'setup_href' => 'setups.php?id=' . $last['setup_id'],
    ] : null,
    'steps' => $steps,
    'lede' => 'Each step needs the one before it. A setup belongs to a car and a track; a stint belongs to a setup. '
        . 'Racing MotoGP 24 to 26 on Xbox instead? <a href="moto.php">The MotoGP section</a> does the same job for bikes.',
    'new_run' => ['Log a stint', 'stints.php?id=new'],
    'recent' => array_map(fn ($r) => ['stints.php?id=' . $r['id'], $r['run_at'],
        'v' . $r['version'] . ' ' . $r['setup'] . ' · ' . $r['track'], $r['best_lap_ms']], $recent),
    'advice' => $advice ? ['advice.php?id=' . $advice['id'], (PROVIDER_NAMES[$advice['provider']] ?? $advice['provider']) . ' · ' . $advice['model'],
        $advice['status'], $advice['confidence'], $advice['diagnosis'], $advice['created_at']] : null,
    'trend' => array_map(fn ($r) => ['stints.php?id=' . $r['id'], $r['best_lap_ms'], $r['run_at']], $trend),
]);
page_footer();
