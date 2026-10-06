<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

const SESSIONS = ['PRACTICE' => 'Practice', 'QUALI' => 'Qualifying', 'RACE' => 'Race'];
const PHASES   = ['BRAKING', 'ENTRY', 'MID', 'EXIT', 'STRAIGHT', 'KERBS'];
const SPEEDS   = ['ALL' => 'Any speed', 'LOW' => 'Slow corners', 'MEDIUM' => 'Medium corners', 'HIGH' => 'Fast corners'];
const SYMPTOMS = ['UNDERSTEER', 'OVERSTEER', 'SNAP_OVERSTEER', 'TRACTION_LOSS', 'FRONT_LOCKING', 'REAR_LOCKING',
                  'INSTABILITY', 'BOTTOMING', 'BOUNCING', 'SLOW_RESPONSE', 'OTHER'];
const PHASE_LABELS = ['BRAKING' => 'Braking', 'ENTRY' => 'Corner entry', 'MID' => 'Mid-corner', 'EXIT' => 'Corner exit',
                      'STRAIGHT' => 'On the straight', 'KERBS' => 'Over kerbs'];

$id = $_GET['id'] ?? null;

// ---------------------------------------------------------------- list
if ($id === null) {
    $stints = q('SELECT st.id, st.run_at, st.lap_count, st.best_lap_ms, st.avg_lap_ms, st.session_type,
                        s.name AS setup, s.version, c.name AS car, t.name AS track, d.name AS driver
                 FROM stints st
                 JOIN setups s ON s.id = st.setup_id
                 JOIN cars c ON c.id = s.car_id
                 JOIN tracks t ON t.id = s.track_id
                 LEFT JOIN drivers d ON d.id = st.driver_id
                 ORDER BY st.run_at DESC LIMIT 200')->fetchAll();
    page_header('Stints', 'stints');
    page_head('Stints', ['actions' => '<a class="btn btn-primary" href="stints.php?id=new">Log a stint</a>']);
    ?>
    <section>
      <h2>Latest first <span class="count"><?= count($stints) ?></span></h2>
    <?php if (!$stints): ?>
      <p class="empty">No stints yet. Run a few laps on a saved setup, then log the times and tyre readings here.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>Setup</th><th>Car and track</th><th>Driver</th><th class="num">Laps</th><th class="num">Best</th><th class="num">Average</th></tr></thead>
        <tbody>
        <?php foreach ($stints as $s): ?>
          <tr>
            <td><a href="stints.php?id=<?= (int) $s['id'] ?>"><?= e(date('j M, H:i', strtotime($s['run_at']))) ?></a></td>
            <td>v<?= (int) $s['version'] ?> <?= e($s['setup']) ?></td>
            <td><?= e($s['car']) ?> <span class="muted"><?= e($s['track']) ?></span></td>
            <td><?= e($s['driver']) ?></td>
            <td class="num"><?= (int) $s['lap_count'] ?></td>
            <td class="num"><?= RaceMath::formatLap((int) $s['best_lap_ms']) ?></td>
            <td class="num"><?= $s['avg_lap_ms'] ? RaceMath::formatLap((int) $s['avg_lap_ms']) : '' ?></td>
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
$tires = [];
$feedback = [];
$lapText = '';

if ($isNew) {
    $setupId = (int) ($_GET['setup_id'] ?? 0);
    if (!$setupId) {
        $setupOptions = q("SELECT s.id, CONCAT(c.name, ' at ', t.name, ': v', s.version, ' ', s.name)
                           FROM setups s JOIN cars c ON c.id = s.car_id JOIN tracks t ON t.id = s.track_id
                           ORDER BY s.created_at DESC")->fetchAll(PDO::FETCH_KEY_PAIR);
        page_header('Log a stint', 'stints');
        page_head('Log a stint', ['crumb' => ['stints.php', 'Stints']]);
        ?>
        <section>
          <h2>The setup</h2>
        <?php if (!$setupOptions): ?>
          <p class="empty">A stint is run on a setup. <a href="setups.php?id=new">Enter a setup</a> first.</p>
        <?php else: ?>
          <form method="get" class="narrow">
            <input type="hidden" name="id" value="new">
            <label class="field">Which setup was on the car?
              <select name="setup_id" required><?= options($setupOptions, null, 'Choose a setup') ?></select>
            </label>
            <div class="form-end"><button class="btn btn-primary">Continue</button></div>
          </form>
        <?php endif; ?>
        </section>
        <?php
        page_footer();
        exit;
    }
    $stint = ['driver_id' => '', 'session_type' => 'PRACTICE', 'run_at' => date('Y-m-d H:i:s'), 'ambient_temp_c' => '',
              'track_temp_c' => '', 'grip_pct' => '', 'fuel_start_l' => null, 'fuel_end_l' => '', 'top_speed_kmh' => '', 'driver_notes' => ''];
} else {
    $stint = q('SELECT * FROM stints WHERE id = ?', [(int) $id])->fetch() ?: redirect('stints.php');
    $setupId = (int) $stint['setup_id'];
    foreach (q('SELECT * FROM stint_tires WHERE stint_id = ?', [(int) $id]) as $row) {
        $tires[$row['corner']] = $row;
    }
    $feedback = q('SELECT * FROM stint_feedback WHERE stint_id = ? ORDER BY id', [(int) $id])->fetchAll();
    foreach (q('SELECT * FROM stint_laps WHERE stint_id = ? ORDER BY lap_no', [(int) $id]) as $lap) {
        $lapText .= ($lap['is_valid'] ? '' : 'x ') . RaceMath::formatLap((int) $lap['lap_ms']) . "\n";
    }
}

$setup = q('SELECT s.*, c.name AS car, t.name AS track, t.layout,
                   k.name AS compound, k.target_hot_psi_front, k.target_hot_psi_rear, k.temp_min_c, k.temp_max_c
            FROM setups s
            JOIN cars c ON c.id = s.car_id
            JOIN tracks t ON t.id = s.track_id
            JOIN tire_compounds k ON k.id = s.compound_id
            WHERE s.id = ?', [$setupId])->fetch() ?: redirect('stints.php');
$stint['fuel_start_l'] ??= $setup['fuel_l'];
$driverOptions = q('SELECT id, name FROM drivers ORDER BY name')->fetchAll(PDO::FETCH_KEY_PAIR);

// ---------------------------------------------------------------- save
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM stints WHERE id = ?', [(int) $id]);
        flash('Stint deleted.');
        redirect('stints.php');
    }

    $runAt = strtotime((string) ($_POST['run_at'] ?? ''));
    if ($runAt === false) {
        $errors[] = 'When it was run is not a date and time.';
    }
    $driverId = (int) ($_POST['driver_id'] ?? 0);
    $data = [
        'driver_id'      => isset($driverOptions[$driverId]) ? $driverId : null,
        'session_type'   => in_enum($_POST, 'session_type', array_keys(SESSIONS)),
        'run_at'         => date('Y-m-d H:i:s', $runAt ?: time()),
        'ambient_temp_c' => in_num($_POST, 'ambient_temp_c', 'Air temperature', $errors, true, -20, 60),
        'track_temp_c'   => in_num($_POST, 'track_temp_c', 'Track temperature', $errors, true, -20, 80),
        'grip_pct'       => in_num($_POST, 'grip_pct', 'Track grip', $errors, false, 50, 100),
        'fuel_start_l'   => in_num($_POST, 'fuel_start_l', 'Fuel at the start', $errors, false, 0, 500),
        'fuel_end_l'     => in_num($_POST, 'fuel_end_l', 'Fuel at the end', $errors, false, 0, 500),
        'top_speed_kmh'  => in_num($_POST, 'top_speed_kmh', 'Top speed', $errors, false, 0, 500),
        'driver_notes'   => in_str($_POST, 'driver_notes', 'Driver notes', $errors, false, 5000),
    ];

    // Laps: one per line, "x" in front of laps that don't count.
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
    $validLaps = array_column(array_filter($laps, fn ($l) => $l[1] === 1), 0);
    if (!$validLaps) {
        $errors[] = 'Enter at least one lap time that counts.';
    } else {
        $stats = RaceMath::lapStats($validLaps);
        $data += ['lap_count' => count($laps), 'best_lap_ms' => $stats['best_ms'], 'avg_lap_ms' => $stats['mean_ms'],
                  'lap_stdev_ms' => count($validLaps) > 1 ? $stats['stdev_ms'] : null];
    }

    $tireData = [];
    foreach (CORNERS as $corner => $cornerName) {
        $src = (array) ($_POST['t'][$corner] ?? []);
        $tireData[$corner] = [
            'hot_psi'    => in_num($src, 'hot_psi', "$cornerName hot pressure", $errors, true, 5, 60),
            'temp_in_c'  => in_num($src, 'temp_in_c', "$cornerName inside temperature", $errors, true, 0, 250),
            'temp_mid_c' => in_num($src, 'temp_mid_c', "$cornerName middle temperature", $errors, true, 0, 250),
            'temp_out_c' => in_num($src, 'temp_out_c', "$cornerName outside temperature", $errors, true, 0, 250),
            'wear_pct'   => in_num($src, 'wear_pct', "$cornerName wear", $errors, false, 0, 100),
        ];
    }

    $feedbackData = [];
    foreach ((array) ($_POST['fb'] ?? []) as $row) {
        $row = (array) $row;
        if (!in_array($row['symptom'] ?? '', SYMPTOMS, true)) {
            continue; // rows left on "Choose" are ignored
        }
        $feedbackData[] = [
            'phase'       => in_enum($row, 'phase', PHASES),
            'speed_range' => in_enum($row, 'speed_range', array_keys(SPEEDS)),
            'symptom'     => $row['symptom'],
            'severity'    => (int) (in_num($row, 'severity', 'How bad', $errors, true, 1, 5) ?? 3),
            'corner_ref'  => in_str($row, 'corner_ref', 'Where', $errors, false, 40),
            'note'        => in_str($row, 'note', 'Complaint detail', $errors, false, 255),
        ];
    }

    $stint = array_merge($stint, $_POST);
    $tires = $tireData;
    $feedback = $feedbackData;

    if (!$errors) {
        try {
            db()->beginTransaction();
            if ($isNew) {
                $data['setup_id'] = $setupId;
                $cols = implode(', ', array_keys($data));
                $marks = implode(', ', array_fill(0, count($data), '?'));
                q("INSERT INTO stints ($cols) VALUES ($marks)", array_values($data));
                $stintId = (int) db()->lastInsertId();
            } else {
                $stintId = (int) $id;
                $set = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data)));
                q("UPDATE stints SET $set WHERE id = ?", [...array_values($data), $stintId]);
                foreach (['stint_laps', 'stint_tires', 'stint_feedback'] as $table) {
                    q("DELETE FROM $table WHERE stint_id = ?", [$stintId]);
                }
            }
            foreach ($laps as $n => [$ms, $valid]) {
                q('INSERT INTO stint_laps (stint_id, lap_no, lap_ms, is_valid) VALUES (?, ?, ?, ?)', [$stintId, $n + 1, $ms, $valid]);
            }
            foreach ($tireData as $corner => $t) {
                q('INSERT INTO stint_tires (stint_id, corner, hot_psi, temp_in_c, temp_mid_c, temp_out_c, wear_pct)
                   VALUES (?, ?, ?, ?, ?, ?, ?)', [$stintId, $corner, ...array_values($t)]);
            }
            foreach ($feedbackData as $f) {
                q('INSERT INTO stint_feedback (stint_id, phase, speed_range, symptom, severity, corner_ref, note)
                   VALUES (?, ?, ?, ?, ?, ?, ?)', [$stintId, ...array_values($f)]);
            }
            db()->commit();
            flash('Stint saved.');
            redirect('stints.php?id=' . $stintId);
        } catch (PDOException $ex) {
            db()->rollBack();
            $errors[] = 'The database refused this: ' . $ex->getMessage();
        }
    }
}

// ---------------------------------------------------------------- analysis (saved stints only)
$analysis = [];
if (!$isNew && !$errors) {
    $ranges = car_ranges((int) $setup['car_id']);
    $cold = q('SELECT corner, cold_psi FROM setup_corners WHERE setup_id = ?', [$setupId])->fetchAll(PDO::FETCH_KEY_PAIR);
    $analysis = tire_analysis($setup, $tires, $cold, $ranges);
}
$providers = engineer_providers();
$advice = $isNew ? [] : q('SELECT id, provider, confidence, status, created_at FROM recommendations WHERE stint_id = ? ORDER BY id DESC', [(int) $id])->fetchAll();
$adviceStatus = ['PENDING' => 'not acted on yet', 'APPLIED' => 'applied', 'PARTIAL' => 'partly applied', 'REJECTED' => 'set aside'];
$flag = fn (string $state): string => $state === 'OK' ? 'ok' : 'warn';
$words = ['LOW' => 'low', 'HIGH' => 'high', 'OK' => 'on target', 'COLD' => 'too cold', 'HOT' => 'too hot',
          'TOO_LITTLE_NEGATIVE' => 'wants more negative camber', 'TOO_MUCH_NEGATIVE' => 'too much negative camber',
          'CENTRE_HOT' => 'centre running hot', 'CENTRE_COOL' => 'centre running cool'];

// ---------------------------------------------------------------- form
$tempField = function (string $corner, string $field, string $label) use (&$tires): void {
    ?>
    <label class="field"><?= $label ?>
      <input type="number" step="any" name="t[<?= $corner ?>][<?= $field ?>]" value="<?= e(nf($tires[$corner][$field] ?? '')) ?>" required>
    </label>
    <?php
};

$feedbackRow = function (string $i, array $row): void {
    ?>
    <div class="row-set">
      <label class="field">What happened
        <select name="fb[<?= $i ?>][symptom]"><?= options(array_combine(SYMPTOMS, array_map('human', SYMPTOMS)), $row['symptom'] ?? '', 'Choose') ?></select>
      </label>
      <label class="field">When
        <select name="fb[<?= $i ?>][phase]"><?= options(PHASE_LABELS, $row['phase'] ?? 'ENTRY') ?></select>
      </label>
      <label class="field">At what speed
        <select name="fb[<?= $i ?>][speed_range]"><?= options(SPEEDS, $row['speed_range'] ?? 'ALL') ?></select>
      </label>
      <label class="field">How bad <span class="hint">1 minor, 5 undriveable</span>
        <input type="number" min="1" max="5" name="fb[<?= $i ?>][severity]" value="<?= e($row['severity'] ?? 3) ?>">
      </label>
      <label class="field">Where <span class="hint">optional</span>
        <input name="fb[<?= $i ?>][corner_ref]" value="<?= e($row['corner_ref'] ?? '') ?>" maxlength="40" placeholder="T1">
      </label>
      <label class="field span-3">In the driver's words <span class="hint">optional</span>
        <input name="fb[<?= $i ?>][note]" value="<?= e($row['note'] ?? '') ?>" maxlength="255" placeholder="Rear steps out as I come off the brake">
      </label>
    </div>
    <?php
};

$title = $isNew ? 'Log a stint' : 'Stint on ' . date('j M, H:i', strtotime($stint['run_at']));
$readouts = [];
if ($analysis) {
    $valid = (int) q('SELECT COUNT(*) FROM stint_laps WHERE stint_id = ? AND is_valid = 1', [(int) $id])->fetchColumn();
    $readouts = [
        ['Best lap', lap_text($stint['best_lap_ms']), '', 'cyan'],
        ['Average', lap_text($stint['avg_lap_ms'], '-'), $stint['lap_stdev_ms'] !== null ? '±' . number_format((int) $stint['lap_stdev_ms'] / 1000, 3) . ' s lap to lap' : ''],
        ['Laps', $valid . ' / ' . (int) $stint['lap_count'], 'Counted / run', 'teal'],
        ['Track', nf($stint['track_temp_c']) . ' °C', 'Air ' . nf($stint['ambient_temp_c']) . ' °C'],
    ];
}
page_header($title, 'stints');
page_head($title, [
    'crumb' => ['stints.php', 'Stints'],
    'lede' => e($setup['car']) . ' at ' . e($setup['track']) . ', on <a href="setups.php?id=' . $setupId . '">v' . (int) $setup['version'] . ' '
        . e($setup['name']) . '</a> with ' . e($setup['compound']) . ' tyres',
    'readouts' => $readouts,
]);
show_errors($errors);
?>

<?php if ($analysis): ?>
  <section class="calc" data-tag="Calculated">
    <h2>What the tyres say</h2>
    <p class="hint">Targets for <?= e($setup['compound']) ?>: <?= nf($setup['target_hot_psi_front']) ?> psi front, <?= nf($setup['target_hot_psi_rear']) ?> psi rear,
      working between <?= nf($setup['temp_min_c']) ?> and <?= nf($setup['temp_max_c']) ?> °C.</p>
    <div class="table-wrap"><table class="stack">
      <thead><tr><th>Wheel</th><th>Hot pressure</th><th>Temperature</th><th>Inside minus outside</th><th>Middle</th><th class="num">Cold pressure next run</th></tr></thead>
      <tbody>
      <?php foreach ($analysis as $a): $th = $a['thermal']; ?>
        <tr>
          <td><?= $a['name'] ?></td>
          <td data-label="Hot pressure"><span class="flag flag-<?= $flag($a['pressure']['state']) ?>"><?= sprintf('%+.1f', $a['pressure']['delta_psi']) ?> psi, <?= $words[$a['pressure']['state']] ?></span></td>
          <td data-label="Temperature"><span class="flag flag-<?= $flag($th['window']) ?>"><?= nf($th['avg_c']) ?> °C<?= $th['window'] === 'OK' ? '' : ', ' . $words[$th['window']] ?></span></td>
          <td data-label="Inside minus outside"><span class="flag flag-<?= $flag($th['camber']) ?>"><?= sprintf('%+.1f', $th['spread_c']) ?> °C<?= $th['camber'] === 'OK' ? '' : ', ' . $words[$th['camber']] ?></span></td>
          <td data-label="Middle"><span class="flag flag-<?= $flag($th['crown']) ?>"><?= $th['crown'] === 'OK' ? 'even' : $words[$th['crown']] ?></span></td>
          <td class="num" data-label="Cold pressure next run"><span><?= abs($a['next'] - $a['cold']) < 0.05 ? 'keep ' . nf($a['cold']) : nf($a['cold']) . ' to <strong>' . nf($a['next']) . '</strong>' ?> psi</span></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
    <p class="hint">Best <?= RaceMath::formatLap((int) $stint['best_lap_ms']) ?><?php if ($stint['avg_lap_ms']): ?>,
      average <?= RaceMath::formatLap((int) $stint['avg_lap_ms']) ?><?php endif; ?><?php if ($stint['lap_stdev_ms'] !== null): ?>,
      laps within about ±<?= number_format((int) $stint['lap_stdev_ms'] / 1000, 3) ?> s of each other<?php endif; ?>.
      Pressure advice assumes the next run is in similar conditions.</p>
    <div class="chart">
      <canvas data-chart="tyres" role="img" aria-label="Tyre temperatures across each tyre, against the working window"
              data-values="<?= e(json_encode([
                  'labels'  => array_column($analysis, 'name'),
                  'inside'  => array_map(fn ($c) => (float) $tires[$c]['temp_in_c'], array_keys($analysis)),
                  'middle'  => array_map(fn ($c) => (float) $tires[$c]['temp_mid_c'], array_keys($analysis)),
                  'outside' => array_map(fn ($c) => (float) $tires[$c]['temp_out_c'], array_keys($analysis)),
                  'window'  => [(float) $setup['temp_min_c'], (float) $setup['temp_max_c']],
              ])) ?>"></canvas>
    </div>
  </section>

  <section>
    <h2>Ask the engineer</h2>
    <?php if ($advice): ?>
      <div class="advice-list bleed">
        <?php foreach ($advice as $a): ?>
          <a href="advice.php?id=<?= (int) $a['id'] ?>"><b>Advice from <?= e(when($a['created_at'])) ?></b>
            <span><?= e(PROVIDER_NAMES[$a['provider']]) ?>, <?= strtolower($a['confidence']) ?> confidence, <?= $adviceStatus[$a['status']] ?></span></a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
    <?php if ($providers): ?>
      <form method="post" action="engineer.php" class="ask" data-busy="Asking the engineer. This can take a minute.">
        <?= csrf_field() ?>
        <input type="hidden" name="stint_id" value="<?= (int) $id ?>">
        <label class="field">Which AI
          <select name="provider"><?= options($providers, null) ?></select>
        </label>
        <button class="btn btn-primary"><?= $advice ? 'Ask again' : 'Get recommendations' ?></button>
      </form>
      <p class="hint">Sends this stint, the setup and the calculated numbers above. Pressure changes always come from the calculator, not the AI.</p>
    <?php else: ?>
      <p class="hint">To switch this on, add an API key and a model for at least one provider in app/config.php.</p>
    <?php endif; ?>
  </section>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>The run</h2>
    <div class="grid">
      <label class="field">Driver
        <select name="driver_id"><?= options($driverOptions, $stint['driver_id'], 'Not recorded') ?></select>
      </label>
      <label class="field">Session
        <select name="session_type"><?= options(SESSIONS, $stint['session_type']) ?></select>
      </label>
      <label class="field span-2">When
        <input type="datetime-local" name="run_at" value="<?= e(date('Y-m-d\TH:i', strtotime((string) $stint['run_at']) ?: time())) ?>" required>
      </label>
      <label class="field">Air temperature <span class="unit">°C</span>
        <input type="number" step="any" name="ambient_temp_c" value="<?= e(nf($stint['ambient_temp_c'])) ?>" required>
      </label>
      <label class="field">Track temperature <span class="unit">°C</span>
        <input type="number" step="any" name="track_temp_c" value="<?= e(nf($stint['track_temp_c'])) ?>" required>
      </label>
      <label class="field">Track grip <span class="unit">%</span>
        <input type="number" step="any" name="grip_pct" value="<?= e(nf($stint['grip_pct'])) ?>" placeholder="98">
      </label>
      <label class="field">Fuel at the start <span class="unit">L</span>
        <input type="number" step="any" name="fuel_start_l" value="<?= e(nf($stint['fuel_start_l'])) ?>">
      </label>
      <label class="field">Fuel at the end <span class="unit">L</span>
        <input type="number" step="any" name="fuel_end_l" value="<?= e(nf($stint['fuel_end_l'])) ?>">
      </label>
      <label class="field">Top speed <span class="unit">km/h</span>
        <input type="number" name="top_speed_kmh" value="<?= e($stint['top_speed_kmh']) ?>">
      </label>
    </div>
  </section>

  <section>
    <h2>Lap times</h2>
    <label class="field">One lap per line. Put an x in front of laps that don't count: the out-lap, cuts, spins.
      <textarea name="laps" rows="7" class="laps" data-laps required placeholder="x 1:44.210&#10;1:38.876&#10;1:38.345&#10;1:38.590"><?= e($lapText) ?></textarea>
    </label>
    <p class="hint" data-laps-summary aria-live="polite"></p>
  </section>

  <section>
    <h2>Hot tyres</h2>
    <p class="hint">Read these as soon as the car stops. Temperatures run across each tyre the way you see them from above,
      so the outside edge is always on the outside of the car.</p>
    <div class="car">
      <div class="chassis" aria-hidden="true"><span>Front</span></div>
      <?php foreach (CORNERS as $corner => $cornerName): $left = $corner[1] === 'L'; ?>
        <fieldset class="wheel wheel-<?= strtolower($corner) ?>">
          <legend><?= $cornerName ?></legend>
          <label class="field">Hot pressure <span class="unit">psi</span>
            <input type="number" step="any" name="t[<?= $corner ?>][hot_psi]" value="<?= e(nf($tires[$corner]['hot_psi'] ?? '')) ?>" required>
          </label>
          <div class="temps">
            <?php
            $tempField($corner, $left ? 'temp_out_c' : 'temp_in_c', $left ? 'Outside' : 'Inside');
            $tempField($corner, 'temp_mid_c', 'Middle');
            $tempField($corner, $left ? 'temp_in_c' : 'temp_out_c', $left ? 'Inside' : 'Outside');
            ?>
          </div>
          <label class="field">Wear <span class="unit">%</span> <span class="hint">optional</span>
            <input type="number" step="any" name="t[<?= $corner ?>][wear_pct]" value="<?= e(nf($tires[$corner]['wear_pct'] ?? '')) ?>">
          </label>
        </fieldset>
      <?php endforeach; ?>
    </div>
  </section>

  <section>
    <h2>What the driver felt</h2>
    <p class="hint">One row per complaint. Speed matters most: slow-corner problems are fixed mechanically, fast-corner problems with aero.</p>
    <div data-rows="fb">
      <?php foreach ($feedback as $i => $row) { $feedbackRow((string) $i, $row); } ?>
      <?php if (!$feedback) { $feedbackRow('0', []); } ?>
    </div>
    <template data-template="fb"><?php $feedbackRow('__i__', []); ?></template>
    <button type="button" class="btn btn-small" data-add-row="fb">Add another complaint</button>
    <label class="field">Anything else from the driver
      <textarea name="driver_notes" rows="3"><?= e($stint['driver_notes']) ?></textarea>
    </label>
  </section>

  <div class="actions">
    <button class="btn btn-primary">Save stint</button>
    <a class="btn" href="stints.php">Cancel</a>
    <?php if (!$isNew): ?>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate data-confirm="Delete this stint?">Delete stint</button>
    <?php endif; ?>
  </div>
</form>
<?php page_footer($analysis ? ['assets/chart.umd.min.js'] : []);
