<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$carId = (int) ($_GET['car_id'] ?? 0);
$trackId = (int) ($_GET['track_id'] ?? 0);

// ---------------------------------------------------------------- chooser
if (!$carId || !$trackId) {
    $combos = q('SELECT s.car_id, s.track_id, c.name AS car, t.name AS track, t.layout,
                        COUNT(*) AS versions, MIN(p.best_lap_ms) AS best
                 FROM setups s
                 JOIN cars c ON c.id = s.car_id
                 JOIN tracks t ON t.id = s.track_id
                 JOIN v_setup_progress p ON p.setup_id = s.id
                 GROUP BY s.car_id, s.track_id, c.name, t.name, t.layout
                 ORDER BY c.name, t.name')->fetchAll();
    page_header('Progress', 'progress');
    page_head('Progress', ['lede' => 'Lap time against setup version, one chart per car and track.']);
    ?>
    <section>
      <h2>Car and track <span class="count"><?= count($combos) ?></span></h2>
    <?php if (!$combos): ?>
      <p class="empty">Nothing to chart yet. <a href="setups.php?id=new">Enter a setup</a> and log a stint on it.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Car and track</th><th class="num">Versions</th><th class="num">Best lap so far</th></tr></thead>
        <tbody>
        <?php foreach ($combos as $c): ?>
          <tr>
            <td><a href="progress.php?car_id=<?= (int) $c['car_id'] ?>&amp;track_id=<?= (int) $c['track_id'] ?>"><?= e($c['car']) ?> at <?= e($c['track']) ?></a>
              <span class="muted"><?= e($c['layout']) ?></span></td>
            <td class="num"><?= (int) $c['versions'] ?></td>
            <td class="num"><?= $c['best'] ? RaceMath::formatLap((int) $c['best']) : '' ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table></div>
    <?php endif; ?>
    </section>
    <?php
    page_footer();
    exit;
}

// ---------------------------------------------------------------- one car at one track
$car = q('SELECT name FROM cars WHERE id = ?', [$carId])->fetchColumn() ?: redirect('progress.php');
$track = q('SELECT name FROM tracks WHERE id = ?', [$trackId])->fetchColumn() ?: redirect('progress.php');
$rows = q('SELECT * FROM v_setup_progress WHERE car_id = ? AND track_id = ? ORDER BY version', [$carId, $trackId])->fetchAll();
$ran = array_filter($rows, fn ($r) => $r['stint_count'] > 0);

page_header("$car at $track", 'progress');
page_head("$car at $track", ['crumb' => ['progress.php', 'Progress'], 'readouts' => progress_readouts($rows, 'stint_count', 'Stints')]);
?>

<?php if (count($ran) < 2): ?>
  <p class="empty">The chart needs stints on at least two setup versions. <?= count($ran) ?> so far.</p>
<?php else: ?>
  <section class="calc" data-tag="Calculated">
    <h2>Lap time by setup version</h2>
    <div class="chart chart-tall">
      <canvas data-chart="progress" role="img" aria-label="Best and average lap time for each setup version"
              data-values="<?= e(json_encode([
                  'labels'  => array_map(fn ($r) => 'v' . $r['version'], $rows),
                  'best'    => array_map(fn ($r) => $r['best_lap_ms'] !== null ? (int) $r['best_lap_ms'] : null, $rows),
                  'average' => array_map(fn ($r) => $r['mean_avg_lap_ms'] !== null ? (int) $r['mean_avg_lap_ms'] : null, $rows),
              ])) ?>"></canvas>
    </div>
    <p class="hint">A faster version only counts if the track was in similar shape. Check the track temperature column before trusting a gain.</p>
  </section>
<?php endif; ?>

<section>
  <h2>Versions</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Version</th><th>What changed</th><th class="num">Stints</th><th class="num">Best</th><th class="num">Average</th><th class="num">Track temp</th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): ?>
      <tr>
        <td><a href="setups.php?id=<?= (int) $r['setup_id'] ?>">v<?= (int) $r['version'] ?> <?= e($r['name']) ?></a></td>
        <td class="wrap"><?= e($r['change_summary'] ?? ($r['version'] == 1 ? 'Starting point' : '')) ?></td>
        <td class="num"><?= (int) $r['stint_count'] ?></td>
        <td class="num"><?= $r['best_lap_ms'] ? RaceMath::formatLap((int) $r['best_lap_ms']) : '' ?></td>
        <td class="num"><?= $r['mean_avg_lap_ms'] ? RaceMath::formatLap((int) $r['mean_avg_lap_ms']) : '' ?></td>
        <td class="num"><?= $r['mean_track_temp_c'] !== null ? nf($r['mean_track_temp_c']) . ' °C' : '' ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
</section>
<?php page_footer(count($ran) >= 2 ? ['assets/chart.umd.min.js'] : []);
