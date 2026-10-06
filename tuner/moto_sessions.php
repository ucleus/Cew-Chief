<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

const MG_SESSION_TYPES = ['PRACTICE' => 'Practice', 'QUALI' => 'Qualifying', 'SPRINT' => 'Sprint', 'RACE' => 'Race'];
const MG_WEATHER = ['DRY' => 'Dry', 'DAMP' => 'Damp', 'WET' => 'Wet'];
const MG_PHASES = ['BRAKING' => 'Braking', 'ENTRY' => 'Corner entry', 'MID' => 'Mid-corner', 'EXIT' => 'Corner exit', 'STRAIGHT' => 'On the straight', 'BUMPS' => 'Over bumps'];
const MG_CORNERS = ['ALL' => 'Any corner', 'SLOW' => 'Slow corners', 'MEDIUM' => 'Medium corners', 'FAST' => 'Fast corners'];
$id = $_GET['id'] ?? null;

// ---------------------------------------------------------------- list
if ($id === null) {
    $rows = q('SELECT x.id, x.run_at, x.lap_count, x.best_lap_ms, x.avg_lap_ms, x.session_type, s.name AS setup, s.version, b.name AS bike, t.name AS track
               FROM mg_sessions x JOIN mg_setups s ON s.id = x.setup_id JOIN mg_bikes b ON b.id = s.bike_id JOIN mg_tracks t ON t.id = s.track_id
               ORDER BY x.run_at DESC LIMIT 200')->fetchAll();
    page_header('Sessions', 'moto_sessions');
    page_head('Sessions', ['actions' => '<a class="btn btn-primary" href="moto_sessions.php?id=new">Log a session</a>']);
    ?>
    <section>
      <h2>Latest first <span class="count"><?= count($rows) ?></span></h2>
    <?php if (!$rows): ?>
      <p class="empty">No sessions yet. Ride a few laps on a saved setup, then log the times and what the HUD showed.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>Setup</th><th>Bike and track</th><th class="num">Laps</th><th class="num">Best</th><th class="num">Average</th></tr></thead>
        <tbody>
        <?php foreach ($rows as $r): ?>
          <tr>
            <td><a href="moto_sessions.php?id=<?= (int) $r['id'] ?>"><?= e(date('j M, H:i', strtotime($r['run_at']))) ?></a></td>
            <td>v<?= (int) $r['version'] ?> <?= e($r['setup']) ?></td>
            <td><?= e($r['bike']) ?> <span class="muted"><?= e($r['track']) ?></span></td>
            <td class="num"><?= (int) $r['lap_count'] ?></td>
            <td class="num"><?= RaceMath::formatLap((int) $r['best_lap_ms']) ?></td>
            <td class="num"><?= $r['avg_lap_ms'] ? RaceMath::formatLap((int) $r['avg_lap_ms']) : '' ?></td>
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

// ---------------------------------------------------------------- load
$isNew = $id === 'new';
$feedback = [];
$lapText = '';
if ($isNew) {
    $setupId = (int) ($_GET['setup_id'] ?? 0);
    if (!$setupId) {
        $choices = q("SELECT s.id, CONCAT(b.name, ' at ', t.name, ': v', s.version, ' ', s.name) FROM mg_setups s JOIN mg_bikes b ON b.id = s.bike_id
                      JOIN mg_tracks t ON t.id = s.track_id ORDER BY s.created_at DESC")->fetchAll(PDO::FETCH_KEY_PAIR);
        page_header('Log a session', 'moto_sessions');
        page_head('Log a session', ['crumb' => ['moto_sessions.php', 'Sessions']]);
        ?>
        <section>
          <h2>The setup</h2>
        <?php if (!$choices): ?>
          <p class="empty">A session is ridden on a setup. <a href="moto_setups.php?id=new">Enter a setup</a> first.</p>
        <?php else: ?>
          <form method="get" class="narrow">
            <input type="hidden" name="id" value="new">
            <label class="field">Which setup was on the bike? <select name="setup_id" required><?= options($choices, null, 'Choose a setup') ?></select></label>
            <div class="form-end"><button class="btn btn-primary">Continue</button></div>
          </form>
        <?php endif; ?>
        </section>
        <?php
        page_footer();
        exit;
    }
    $s = ['session_type' => 'PRACTICE', 'run_at' => date('Y-m-d H:i:s'), 'weather' => 'DRY', 'ambient_temp_c' => '', 'track_temp_c' => '', 'race_laps' => '',
          'tyre_front_temp' => '', 'tyre_rear_temp' => '', 'tyre_front_wear_pct' => '', 'tyre_rear_wear_pct' => '', 'brake_front_temp' => '', 'brake_rear_temp' => '',
          'hit_limiter' => 0, 'driver_notes' => ''];
} else {
    $s = q('SELECT * FROM mg_sessions WHERE id = ?', [(int) $id])->fetch() ?: redirect('moto_sessions.php');
    $setupId = (int) $s['setup_id'];
    $feedback = q('SELECT * FROM mg_session_feedback WHERE session_id = ? ORDER BY id', [(int) $id])->fetchAll();
    foreach (q('SELECT * FROM mg_session_laps WHERE session_id = ? ORDER BY lap_no', [(int) $id]) as $lap) {
        $lapText .= ($lap['is_valid'] ? '' : 'x ') . RaceMath::formatLap((int) $lap['lap_ms']) . "\n";
    }
}
$setup = q('SELECT s.*, b.name AS bike, b.game, b.class, b.ranges_verified, t.name AS track FROM mg_setups s JOIN mg_bikes b ON b.id = s.bike_id JOIN mg_tracks t ON t.id = s.track_id WHERE s.id = ?', [$setupId])->fetch() ?: redirect('moto_sessions.php');

// ---------------------------------------------------------------- save
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM mg_sessions WHERE id = ?', [(int) $id]);
        flash('Session deleted.');
        redirect('moto_sessions.php');
    }
    $runAt = strtotime((string) ($_POST['run_at'] ?? ''));
    if ($runAt === false) {
        $errors[] = 'When it was ridden is not a date and time.';
    }
    $state = fn (string $key) => in_array($_POST[$key] ?? '', array_keys(MG_TEMP_STATES), true) ? $_POST[$key] : null;
    $data = [
        'session_type' => in_enum($_POST, 'session_type', array_keys(MG_SESSION_TYPES)),
        'run_at' => date('Y-m-d H:i:s', $runAt ?: time()),
        'weather' => in_enum($_POST, 'weather', array_keys(MG_WEATHER)),
        'ambient_temp_c' => in_num($_POST, 'ambient_temp_c', 'Air temperature', $errors, false, -20, 60),
        'track_temp_c' => in_num($_POST, 'track_temp_c', 'Track temperature', $errors, false, -20, 80),
        'race_laps' => in_num($_POST, 'race_laps', 'Race distance', $errors, false, 1, 80),
        'tyre_front_temp' => $state('tyre_front_temp'), 'tyre_rear_temp' => $state('tyre_rear_temp'),
        'tyre_front_wear_pct' => in_num($_POST, 'tyre_front_wear_pct', 'Front tyre wear', $errors, false, 0, 100),
        'tyre_rear_wear_pct' => in_num($_POST, 'tyre_rear_wear_pct', 'Rear tyre wear', $errors, false, 0, 100),
        'brake_front_temp' => $state('brake_front_temp'), 'brake_rear_temp' => $state('brake_rear_temp'),
        'hit_limiter' => empty($_POST['hit_limiter']) ? 0 : 1,
        'driver_notes' => in_str($_POST, 'driver_notes', 'Notes', $errors, false, 5000),
    ];
    $lapText = (string) ($_POST['laps'] ?? '');
    $laps = [];
    foreach (preg_split('/\R/', $lapText) as $n => $line) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }
        $valid = !preg_match('/^[xX*]\s*/', $line, $m);
        $ms = parse_lap($valid ? $line : substr($line, strlen($m[0])));
        if ($ms === null) {
            $errors[] = 'Line ' . ($n + 1) . ' of the lap times ("' . $line . '") is not a lap time. Use 1:38.345.';
            continue;
        }
        $laps[] = [$ms, $valid ? 1 : 0];
    }
    $good = array_column(array_filter($laps, fn ($l) => $l[1] === 1), 0);
    if (!$good) {
        $errors[] = 'Enter at least one lap time that counts.';
    } else {
        $stats = RaceMath::lapStats($good);
        $data += ['lap_count' => count($laps), 'best_lap_ms' => $stats['best_ms'], 'avg_lap_ms' => $stats['mean_ms'], 'lap_stdev_ms' => count($good) > 1 ? $stats['stdev_ms'] : null];
    }
    $fb = [];
    foreach ((array) ($_POST['fb'] ?? []) as $row) {
        $row = (array) $row;
        if (!isset($MOTO['symptoms'][$row['symptom'] ?? ''])) {
            continue;
        }
        $fb[] = ['phase' => in_enum($row, 'phase', array_keys(MG_PHASES)), 'corner_type' => in_enum($row, 'corner_type', array_keys(MG_CORNERS)), 'symptom' => $row['symptom'],
                 'severity' => (int) (in_num($row, 'severity', 'How bad', $errors, true, 1, 5) ?? 3), 'corner_ref' => in_str($row, 'corner_ref', 'Where', $errors, false, 40),
                 'note' => in_str($row, 'note', 'Complaint detail', $errors, false, 255)];
    }
    $s = array_merge($s, $_POST);
    $feedback = $fb;
    if (!$errors) {
        try {
            db()->beginTransaction();
            if ($isNew) {
                $data['setup_id'] = $setupId;
                q('INSERT INTO mg_sessions (' . implode(', ', array_keys($data)) . ') VALUES (' . implode(', ', array_fill(0, count($data), '?')) . ')', array_values($data));
                $sid = (int) db()->lastInsertId();
            } else {
                $sid = (int) $id;
                q('UPDATE mg_sessions SET ' . implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data))) . ' WHERE id = ?', [...array_values($data), $sid]);
                q('DELETE FROM mg_session_laps WHERE session_id = ?', [$sid]);
                q('DELETE FROM mg_session_feedback WHERE session_id = ?', [$sid]);
            }
            foreach ($laps as $n => [$ms, $valid]) {
                q('INSERT INTO mg_session_laps (session_id, lap_no, lap_ms, is_valid) VALUES (?, ?, ?, ?)', [$sid, $n + 1, $ms, $valid]);
            }
            foreach ($fb as $f) {
                q('INSERT INTO mg_session_feedback (session_id, phase, corner_type, symptom, severity, corner_ref, note) VALUES (?, ?, ?, ?, ?, ?, ?)', [$sid, ...array_values($f)]);
            }
            db()->commit();
            flash('Session saved.');
            redirect('moto_sessions.php?id=' . $sid);
        } catch (PDOException $ex) {
            db()->rollBack();
            $errors[] = 'The database refused this: ' . $ex->getMessage();
        }
    }
}

// ---------------------------------------------------------------- analysis
$ctx = null;
$signals = null;
$advice = [];
if (!$isNew && !$errors) {
    $ctx = mg_context((int) $id);
    $signals = mg_signals($ctx);
    $advice = q('SELECT id, source, provider, confidence, status, created_at FROM mg_recommendations WHERE session_id = ? ORDER BY id DESC', [(int) $id])->fetchAll();
}
$providers = engineer_providers();
$adviceStatus = ['PENDING' => 'not acted on yet', 'APPLIED' => 'applied', 'PARTIAL' => 'partly applied', 'REJECTED' => 'set aside'];
$symptomOptions = array_map(fn ($d) => $d['label'], $MOTO['symptoms']);

$feedbackRow = function (string $i, array $row) use ($symptomOptions): void { ?>
    <div class="row-set">
      <label class="field span-2">What happened <select name="fb[<?= $i ?>][symptom]"><?= options($symptomOptions, $row['symptom'] ?? '', 'Choose') ?></select></label>
      <label class="field">When <select name="fb[<?= $i ?>][phase]"><?= options(MG_PHASES, $row['phase'] ?? 'ENTRY') ?></select></label>
      <label class="field">Which corners <select name="fb[<?= $i ?>][corner_type]"><?= options(MG_CORNERS, $row['corner_type'] ?? 'ALL') ?></select></label>
      <label class="field">How bad <span class="hint">1 minor, 5 undriveable</span> <input type="number" min="1" max="5" name="fb[<?= $i ?>][severity]" value="<?= e($row['severity'] ?? 3) ?>"></label>
      <label class="field">Where <span class="hint">optional</span> <input name="fb[<?= $i ?>][corner_ref]" value="<?= e($row['corner_ref'] ?? '') ?>" maxlength="40" placeholder="Turn 1"></label>
      <label class="field span-3">In your words <span class="hint">optional</span> <input name="fb[<?= $i ?>][note]" value="<?= e($row['note'] ?? '') ?>" maxlength="255"></label>
    </div>
<?php };
$stateSelect = fn (string $name, string $label) => '<label class="field">' . e($label) . '<select name="' . $name . '">' . options(MG_TEMP_STATES, $s[$name] ?? '', 'Not recorded') . '</select></label>';

$title = $isNew ? 'Log a session' : 'Session on ' . date('j M, H:i', strtotime($s['run_at']));
$readouts = [];
if ($ctx) {
    $stats = $ctx['laps'] ? RaceMath::lapStats($ctx['laps']) : null;
    $readouts = [
        ['Best lap', lap_text($stats['best_ms'] ?? null), '', 'cyan'],
        ['Average', lap_text($stats['mean_ms'] ?? null, '-'), $stats && $stats['count'] > 1 ? '±' . number_format($stats['stdev_ms'] / 1000, 3) . ' s lap to lap' : ''],
        ['Laps', count($ctx['laps']) . ' / ' . (int) $s['lap_count'], 'Counted / ridden', 'teal'],
        [MG_WEATHER[$s['weather']] ?? '', $s['track_temp_c'] !== null ? nf($s['track_temp_c']) . ' °C' : '-', 'Track temperature'],
    ];
}
page_header($title, 'moto_sessions');
page_head($title, [
    'crumb' => ['moto_sessions.php', 'Sessions'],
    'lede' => e($setup['bike']) . ' at ' . e($setup['track']) . ', on <a href="moto_setups.php?id=' . $setupId . '">v' . (int) $setup['version'] . ' ' . e($setup['name']) . '</a>',
    'readouts' => $readouts,
]);
show_errors($errors);
?>

<?php if ($ctx): ?>
  <section class="calc" data-tag="Calculated">
    <h2>What the readings say</h2>
    <?php
    $gauges = '';
    foreach (['front' => 'Front tyre', 'rear' => 'Rear tyre'] as $end => $name) {
        $w = $signals['wear'][$end];
        if ($w && $w['projected_pct'] !== null) {
            $gauges .= hud_gauge($w['projected_pct'] / 100, nf($w['projected_pct']) . '%', 'Race', $name, $w['status'] === 'SHORT' ? '' : 'cyan');
        } elseif ($ctx['session']["tyre_{$end}_wear_pct"] !== null) {
            $gauges .= hud_gauge($ctx['session']["tyre_{$end}_wear_pct"] / 100, nf($ctx['session']["tyre_{$end}_wear_pct"]) . '%', 'Worn', $name, 'cyan');
        }
    }
    if ($gauges): ?><div class="gauges"><?= $gauges ?></div><?php endif; ?>
    <div class="table-wrap"><table>
      <thead><tr><th>Tyre</th><th>HUD</th><th class="num">Worn</th><th class="num">Per lap</th><th class="num">Projected over race</th><th>Verdict</th></tr></thead>
      <tbody>
      <?php foreach (['front' => 'Front', 'rear' => 'Rear'] as $end => $name): $w = $signals['wear'][$end]; $temp = $ctx['session']["tyre_{$end}_temp"]; ?>
        <tr>
          <td><?= $name ?></td>
          <td><?php if ($temp): ?><span class="flag flag-<?= $temp === 'OK' ? 'ok' : 'warn' ?>"><?= MG_TEMP_STATES[$temp] ?></span><?php endif; ?></td>
          <td class="num"><?= $ctx['session']["tyre_{$end}_wear_pct"] !== null ? nf($ctx['session']["tyre_{$end}_wear_pct"]) . '%' : '' ?></td>
          <td class="num"><?= $w ? nf($w['rate_per_lap']) . '%' : '' ?></td>
          <td class="num"><?= $w && $w['projected_pct'] !== null ? nf($w['projected_pct']) . '% over ' . (int) $ctx['session']['race_laps'] . ' laps' : '' ?></td>
          <td><?php if ($w): ?><span class="flag flag-<?= $w['status'] === 'SHORT' ? 'warn' : 'ok' ?>"><?=
              $w['status'] === 'SHORT' ? 'Will not last: ' . nf($w['overshoot_pct']) . ' points past the limit' : ($w['status'] === 'OK' ? 'Should last' : 'Enter the race distance to project') ?></span><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
    <?php if ($signals['derived']): ?>
      <p class="hint">Treated as complaints because of the readings:</p>
      <ul class="prose"><?php foreach ($signals['derived'] as $sym => $why): ?><li><?= e($why) ?> (<?= e(lcfirst($MOTO['symptoms'][$sym]['label'])) ?>)</li><?php endforeach; ?></ul>
    <?php endif; ?>
    <?php foreach ($signals['flags'] as $flag): ?><p class="hint"><?= e($flag) ?></p><?php endforeach; ?>
    <p class="hint">Wear is projected as if the tyre keeps wearing at the same rate. Real tyres rarely wear in a straight line, so read it as an early warning. The limit used is <?= nf($MOTO['model']['wear']['limit_pct']) ?>% worn.</p>
  </section>

  <section>
    <h2>Get advice</h2>
    <?php if ($advice): ?>
      <div class="advice-list bleed">
        <?php foreach ($advice as $a): ?>
          <a href="moto_advice.php?id=<?= (int) $a['id'] ?>"><b>Advice from <?= e(when($a['created_at'])) ?></b>
            <span><?= $a['source'] === 'MODEL' ? 'Built-in model' : e(PROVIDER_NAMES[$a['provider']] ?? $a['provider']) ?>, <?= strtolower($a['confidence']) ?> confidence, <?= $adviceStatus[$a['status']] ?></span></a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
    <?php if (!$setup['ranges_verified']): ?>
      <div class="notice notice-warn">Advice is switched off until you've checked this bike's slider ranges against your garage.
        <a href="moto_bikes.php?id=<?= (int) $ctx['bike']['id'] ?>">Open the bike</a> and tick the box once they match.</div>
    <?php else: ?>
      <form method="post" action="moto_engineer.php" class="ask">
        <?= csrf_field() ?><input type="hidden" name="session_id" value="<?= (int) $id ?>"><input type="hidden" name="provider" value="model">
        <button class="btn btn-primary">Quick take from the built-in model</button>
      </form>
      <p class="hint">No AI and no cost: it works from the symptoms and readings above using the rules on the <a href="moto_about.php">How it works</a> page.</p>
      <?php if ($providers): ?>
        <form method="post" action="moto_engineer.php" class="ask" data-busy="Asking the engineer. This can take a minute.">
          <?= csrf_field() ?><input type="hidden" name="session_id" value="<?= (int) $id ?>">
          <label class="field">Or ask an AI <select name="provider"><?= options($providers, null) ?></select></label>
          <button class="btn">Ask</button>
        </form>
        <p class="hint">Sends this session, the setup and the model's proposal. The AI may improve on the proposal but is held to the same limits.</p>
      <?php endif; ?>
    <?php endif; ?>
  </section>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>The run</h2>
    <div class="grid">
      <label class="field">Session <select name="session_type"><?= options(MG_SESSION_TYPES, $s['session_type']) ?></select></label>
      <label class="field span-2">When <input type="datetime-local" name="run_at" value="<?= e(date('Y-m-d\TH:i', strtotime((string) $s['run_at']) ?: time())) ?>" required></label>
      <label class="field">Weather <select name="weather"><?= options(MG_WEATHER, $s['weather']) ?></select></label>
      <label class="field">Air temperature <span class="unit">°C</span> <input type="number" step="any" name="ambient_temp_c" value="<?= e(nf($s['ambient_temp_c'])) ?>"></label>
      <label class="field">Track temperature <span class="unit">°C</span> <input type="number" step="any" name="track_temp_c" value="<?= e(nf($s['track_temp_c'])) ?>"></label>
      <label class="field">Race distance <span class="unit">laps</span> <span class="hint">to project tyre wear</span> <input type="number" name="race_laps" min="1" value="<?= e($s['race_laps']) ?>"></label>
    </div>
  </section>
  <section>
    <h2>Lap times</h2>
    <label class="field">One lap per line. Put an x in front of laps that don't count: the out-lap, cuts, crashes.
      <textarea name="laps" rows="7" class="laps" data-laps required placeholder="x 1:44.210&#10;1:38.876&#10;1:38.345"><?= e($lapText) ?></textarea></label>
    <p class="hint" data-laps-summary aria-live="polite"></p>
  </section>
  <section>
    <h2>What the HUD showed</h2>
    <p class="hint">Look at the bottom right of the HUD after two or three laps, and at the tyre wear at the end of the run.</p>
    <div class="grid">
      <?= $stateSelect('tyre_front_temp', 'Front tyre') ?>
      <?= $stateSelect('tyre_rear_temp', 'Rear tyre') ?>
      <label class="field">Front tyre worn <span class="unit">%</span> <span class="hint">at the end</span> <input type="number" step="any" name="tyre_front_wear_pct" value="<?= e(nf($s['tyre_front_wear_pct'])) ?>"></label>
      <label class="field">Rear tyre worn <span class="unit">%</span> <span class="hint">at the end</span> <input type="number" step="any" name="tyre_rear_wear_pct" value="<?= e(nf($s['tyre_rear_wear_pct'])) ?>"></label>
      <?= $stateSelect('brake_front_temp', 'Front brake') ?>
      <?= $stateSelect('brake_rear_temp', 'Rear brake') ?>
    </div>
    <p class="hint">If the game shows tyre life remaining rather than worn, enter 100 minus that.</p>
    <label class="check"><input type="checkbox" name="hit_limiter" value="1"<?= $s['hit_limiter'] ? ' checked' : '' ?>> I hit the rev limiter on a straight</label>
  </section>
  <section>
    <h2>What the bike did</h2>
    <p class="hint">One row per complaint. Which corners matters: slow-corner problems are mostly mechanical, fast-corner problems are mostly stability.</p>
    <div data-rows="fb"><?php foreach ($feedback as $i => $row) { $feedbackRow((string) $i, $row); } ?><?php if (!$feedback) { $feedbackRow('0', []); } ?></div>
    <template data-template="fb"><?php $feedbackRow('__i__', []); ?></template>
    <button type="button" class="btn btn-small" data-add-row="fb">Add another complaint</button>
    <label class="field">Anything else <textarea name="driver_notes" rows="3"><?= e($s['driver_notes']) ?></textarea></label>
  </section>
  <div class="actions">
    <button class="btn btn-primary">Save session</button><a class="btn" href="moto_sessions.php">Cancel</a>
    <?php if (!$isNew): ?><button class="btn btn-danger" name="delete" value="1" formnovalidate data-confirm="Delete this session?">Delete session</button><?php endif; ?>
  </div>
</form>
<?php page_footer();
