<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

$count = fn (string $table): int => (int) q("SELECT COUNT(*) FROM $table")->fetchColumn();
$steps = [
    ['Set up a bike',          'Which settings its garage shows, how far each slider goes and where the game starts them.', 'moto_bikes.php?id=new',   $count('mg_bikes')],
    ['Add the tracks',         'Corner counts, braking zones and a few 1 to 5 ratings. One button adds the 22 MotoGP 26 circuits.', 'moto_tracks.php', $count('mg_tracks')],
    ['Enter a setup',          'Start from the game\'s defaults or from the model\'s starting point for a track.', 'moto_setups.php?id=new',  $count('mg_setups')],
    ['Log a session',          'Lap times, what the HUD showed for tyres and brakes, and what the bike did.', 'moto_sessions.php?id=new', $count('mg_sessions')],
];

$runs = 'SELECT x.id, x.run_at, x.lap_count, x.best_lap_ms, x.avg_lap_ms, s.id AS setup_id, s.version, s.name AS setup,
                s.bike_id, s.track_id, b.name AS bike, t.name AS track
         FROM mg_sessions x JOIN mg_setups s ON s.id = x.setup_id JOIN mg_bikes b ON b.id = s.bike_id JOIN mg_tracks t ON t.id = s.track_id';
$recent = q("$runs ORDER BY x.run_at DESC, x.id DESC LIMIT 5")->fetchAll();
$last = $recent[0] ?? null;
$trend = $last ? array_reverse(q("$runs WHERE s.bike_id = ? AND s.track_id = ? ORDER BY x.run_at DESC, x.id DESC LIMIT 12",
    [$last['bike_id'], $last['track_id']])->fetchAll()) : [];
$advice = q('SELECT id, source, provider, model, confidence, status, diagnosis, created_at FROM mg_recommendations ORDER BY id DESC LIMIT 1')->fetch();

ob_start(); ?>
<section>
  <h2>Before you start</h2>
  <ul class="prose">
    <li>Setup and tyre choice only exist in the Pro experience. Arcade turns them off.</li>
    <li>The game has its own Guided Setup in the garage. This app is for tracking what you changed and what it did, and for working out the next change from your own results.</li>
    <li>There is no telemetry on Xbox. You type in what the HUD shows and what the bike felt like.</li>
    <li><a href="moto_about.php">How it works</a> explains what the model knows, what it guesses, and the formulas.</li>
  </ul>
</section>
<?php $notes = ob_get_clean();

page_header('MotoGP', 'moto');
hud_dashboard([
    'title' => 'MotoGP 24 to 26',
    'run' => 'session',
    'runs' => 'moto_sessions.php',
    'last' => $last ? [
        'href' => 'moto_sessions.php?id=' . $last['id'], 'best_ms' => $last['best_lap_ms'], 'avg_ms' => $last['avg_lap_ms'],
        'laps' => (int) $last['lap_count'], 'run_at' => $last['run_at'], 'track' => $last['track'], 'machine' => $last['bike'],
        'valid' => (int) q('SELECT COUNT(*) FROM mg_session_laps WHERE session_id = ? AND is_valid = 1', [$last['id']])->fetchColumn(),
        'setup' => 'Setup v' . $last['version'] . ' ' . $last['setup'], 'setup_href' => 'moto_setups.php?id=' . $last['setup_id'],
    ] : null,
    'steps' => $steps,
    'lede' => 'Tunes any class of bike in the Xbox games. Each step needs the one before it.',
    'new_run' => ['Log a session', 'moto_sessions.php?id=new'],
    'recent' => array_map(fn ($r) => ['moto_sessions.php?id=' . $r['id'], $r['run_at'],
        'v' . $r['version'] . ' ' . $r['setup'] . ' · ' . $r['track'], $r['best_lap_ms']], $recent),
    'advice' => $advice ? ['moto_advice.php?id=' . $advice['id'],
        $advice['source'] === 'MODEL' ? 'Built-in model' : (PROVIDER_NAMES[$advice['provider']] ?? $advice['provider']) . ' · ' . $advice['model'],
        $advice['status'], $advice['confidence'], $advice['diagnosis'], $advice['created_at']] : null,
    'trend' => array_map(fn ($r) => ['moto_sessions.php?id=' . $r['id'], $r['best_lap_ms'], $r['run_at']], $trend),
    'extra' => $notes,
]);
page_footer();
