<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

$bikeId = (int) ($_GET['bike_id'] ?? 0);
$trackId = (int) ($_GET['track_id'] ?? 0);
if (!$bikeId || !$trackId) {
    $combos = q('SELECT s.bike_id, s.track_id, b.name AS bike, b.game, t.name AS track, COUNT(*) AS versions, MIN(p.best_lap_ms) AS best
                 FROM mg_setups s JOIN mg_bikes b ON b.id = s.bike_id JOIN mg_tracks t ON t.id = s.track_id JOIN v_mg_setup_progress p ON p.setup_id = s.id
                 GROUP BY s.bike_id, s.track_id, b.name, b.game, t.name ORDER BY b.name, t.name')->fetchAll();
    page_header('Progress', 'moto_progress');
    page_head('Progress', ['lede' => 'Lap time against setup version, one chart per bike and track.']);
    ?>
    <section>
      <h2>Bike and track <span class="count"><?= count($combos) ?></span></h2>
    <?php if (!$combos): ?><p class="empty">Nothing to chart yet. <a href="moto_setups.php?id=new">Enter a setup</a> and log a session on it.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Bike and track</th><th class="num">Versions</th><th class="num">Best lap so far</th></tr></thead>
        <tbody><?php foreach ($combos as $c): ?>
          <tr><td><a href="moto_progress.php?bike_id=<?= (int) $c['bike_id'] ?>&amp;track_id=<?= (int) $c['track_id'] ?>"><?= e($c['bike']) ?> at <?= e($c['track']) ?></a> <span class="muted"><?= e($c['game']) ?></span></td>
            <td class="num"><?= (int) $c['versions'] ?></td><td class="num"><?= $c['best'] ? RaceMath::formatLap((int) $c['best']) : '' ?></td></tr>
        <?php endforeach; ?></tbody>
      </table></div>
    <?php endif; ?>
    </section>
    <?php
    page_footer();
    exit;
}
$bike = q('SELECT name FROM mg_bikes WHERE id = ?', [$bikeId])->fetchColumn() ?: redirect('moto_progress.php');
$track = q('SELECT name FROM mg_tracks WHERE id = ?', [$trackId])->fetchColumn() ?: redirect('moto_progress.php');
$rows = q('SELECT * FROM v_mg_setup_progress WHERE bike_id = ? AND track_id = ? ORDER BY version', [$bikeId, $trackId])->fetchAll();
$ran = array_filter($rows, fn ($r) => $r['session_count'] > 0);
page_header("$bike at $track", 'moto_progress');
page_head("$bike at $track", ['crumb' => ['moto_progress.php', 'Progress'], 'readouts' => progress_readouts($rows, 'session_count', 'Sessions')]);
?>
<?php if (count($ran) < 2): ?>
  <p class="empty">The chart needs sessions on at least two setup versions. <?= count($ran) ?> so far.</p>
<?php else: ?>
  <section class="calc" data-tag="Calculated">
    <h2>Lap time by setup version</h2>
    <div class="chart chart-tall"><canvas data-chart="progress" role="img" aria-label="Best and average lap time for each setup version"
      data-values="<?= e(json_encode(['labels' => array_map(fn ($r) => 'v' . $r['version'], $rows),
          'best' => array_map(fn ($r) => $r['best_lap_ms'] !== null ? (int) $r['best_lap_ms'] : null, $rows),
          'average' => array_map(fn ($r) => $r['mean_avg_lap_ms'] !== null ? (int) $r['mean_avg_lap_ms'] : null, $rows)])) ?>"></canvas></div>
    <p class="hint">A faster version only counts if the track was in similar shape. Check the track temperature column before trusting a gain.</p>
  </section>
<?php endif; ?>
<section>
  <h2>Versions</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Version</th><th>What changed</th><th class="num">Sessions</th><th class="num">Best</th><th class="num">Average</th><th class="num">Track temp</th></tr></thead>
    <tbody><?php foreach ($rows as $r): ?>
      <tr><td><a href="moto_setups.php?id=<?= (int) $r['setup_id'] ?>">v<?= (int) $r['version'] ?> <?= e($r['name']) ?></a></td>
        <td class="wrap"><?= e($r['change_summary'] ?? ($r['version'] == 1 ? 'Starting point' : '')) ?></td>
        <td class="num"><?= (int) $r['session_count'] ?></td>
        <td class="num"><?= $r['best_lap_ms'] ? RaceMath::formatLap((int) $r['best_lap_ms']) : '' ?></td>
        <td class="num"><?= $r['mean_avg_lap_ms'] ? RaceMath::formatLap((int) $r['mean_avg_lap_ms']) : '' ?></td>
        <td class="num"><?= $r['mean_track_temp_c'] !== null ? nf($r['mean_track_temp_c']) . ' °C' : '' ?></td></tr>
    <?php endforeach; ?></tbody>
  </table></div>
</section>
<?php page_footer(count($ran) >= 2 ? ['assets/chart.umd.min.js'] : []);
