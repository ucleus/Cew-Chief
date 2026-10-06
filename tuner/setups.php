<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

const PURPOSES = ['BASELINE' => 'Baseline', 'QUALI' => 'Qualifying', 'RACE' => 'Race', 'ENDURANCE' => 'Endurance', 'WET' => 'Wet'];

$carKeys    = array_keys(array_filter($PARAMS, fn ($d) => $d['level'] === 'car'));
$cornerKeys = array_keys(array_filter($PARAMS, fn ($d) => $d['level'] === 'corner'));
$id = $_GET['id'] ?? null;

function check_range(?float $value, ?array $range, string $label, array &$errors): void
{
    if ($value === null || $range === null) {
        return;
    }
    [$min, $max, $step] = [(float) $range['min_value'], (float) $range['max_value'], (float) $range['step_value']];
    if ($value < $min || $value > $max) {
        $errors[] = "$label must be between " . nf($range['min_value']) . ' and ' . nf($range['max_value']) . " {$range['unit']}.";
    } elseif (abs(RaceMath::snap($value, $min, $max, $step) - $value) > 0.0005) {
        $errors[] = "$label moves in steps of " . nf($range['step_value']) . ' from ' . nf($range['min_value']) . '.';
    }
}

/** The calculator's view of a saved setup as [label, value] rows. */
function setup_summary(array $car, array $setup, array $corners, array $ranges): array
{
    $state = chassis_state($car, $setup, $corners, $ranges);
    if ($state['error']) {
        return [['Calculator', 'Could not run: ' . $state['error']]];
    }
    $rows = [['Sprung mass per wheel', sprintf('front %.0f kg, rear %.0f kg',
        $state['sprung_mass_kg']['front_corner'], $state['sprung_mass_kg']['rear_corner'])]];

    $rows[] = ['Ride frequency', $state['ride_frequency_hz']
        ? sprintf('front %.2f Hz, rear %.2f Hz', $state['ride_frequency_hz']['front'], $state['ride_frequency_hz']['rear'])
        : 'Needs spring rates in N/mm, or a clicks conversion on the car.'];

    if ($state['ride_frequency_hz']) {
        $rows[] = ['Roll stiffness at the front', $state['roll_stiffness']
            ? sprintf('%.1f%% (a neutral starting point is about %.0f%%)',
                $state['roll_stiffness']['front_share_pct'], $state['roll_stiffness']['neutral_reference_pct'])
            : 'Needs both anti-roll bars in N/mm or N/m, or a clicks conversion on the car.'];
    }
    if ($state['rake']) {
        $rows[] = ['Rake', sprintf('%s mm, %.2f°', nf($state['rake']['delta_mm']), $state['rake']['angle_deg'])];
    }
    return $rows;
}

// ---------------------------------------------------------------- list
if ($id === null) {
    $setups = q('SELECT s.id, s.name, s.version, s.purpose, c.name AS car, t.name AS track, t.layout,
                        p.stint_count, p.best_lap_ms
                 FROM setups s
                 JOIN cars c ON c.id = s.car_id
                 JOIN tracks t ON t.id = s.track_id
                 JOIN v_setup_progress p ON p.setup_id = s.id
                 ORDER BY c.name, t.name, s.version DESC')->fetchAll();
    page_header('Setups', 'setups');
    page_head('Setups', ['actions' => '<a class="btn btn-primary" href="setups.php?id=new">Enter a setup</a>']);
    ?>
    <section>
      <h2>Every version <span class="count"><?= count($setups) ?></span></h2>
    <?php if (!$setups): ?>
      <p class="empty">No setups yet. Enter the baseline you are starting from, then log a stint on it.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Setup</th><th>Car</th><th>Track</th><th>For</th><th class="num">Stints</th><th class="num">Best lap</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($setups as $s): ?>
          <tr>
            <td><a href="setups.php?id=<?= (int) $s['id'] ?>">v<?= (int) $s['version'] ?> <?= e($s['name']) ?></a></td>
            <td><?= e($s['car']) ?></td>
            <td><?= e($s['track']) ?> <span class="muted"><?= e($s['layout']) ?></span></td>
            <td><?= PURPOSES[$s['purpose']] ?></td>
            <td class="num"><?= (int) $s['stint_count'] ?></td>
            <td class="num"><?= $s['best_lap_ms'] ? RaceMath::formatLap((int) $s['best_lap_ms']) : '' ?></td>
            <td><a class="btn btn-small" href="stints.php?id=new&amp;setup_id=<?= (int) $s['id'] ?>">Log a stint</a></td>
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
$parent = null;
$stintCount = 0;
$corners = [];

if ($isNew) {
    $from = (int) ($_GET['from'] ?? 0);
    if ($from) {
        $parent = q('SELECT * FROM setups WHERE id = ?', [$from])->fetch() ?: redirect('setups.php');
        foreach (q('SELECT * FROM setup_corners WHERE setup_id = ?', [$from]) as $row) {
            $corners[$row['corner']] = $row;
        }
    }
    $carId   = (int) ($parent['car_id'] ?? $_GET['car_id'] ?? 0);
    $trackId = (int) ($parent['track_id'] ?? $_GET['track_id'] ?? 0);

    if (!$carId || !$trackId) {
        // Step one: which car, which track.
        $carOptions   = q('SELECT id, name FROM cars ORDER BY name')->fetchAll(PDO::FETCH_KEY_PAIR);
        $trackOptions = q("SELECT id, CONCAT(name, ' (', layout, ')') FROM tracks ORDER BY name")->fetchAll(PDO::FETCH_KEY_PAIR);
        page_header('Enter a setup', 'setups');
        page_head('Enter a setup', ['crumb' => ['setups.php', 'Setups']]);
        ?>
        <section>
          <h2>Car and track</h2>
        <?php if (!$carOptions || !$trackOptions): ?>
          <p class="empty">A setup needs a car and a track.
            <?php if (!$carOptions): ?><a href="cars.php?id=new">Add a car</a><?php endif; ?>
            <?php if (!$trackOptions): ?><a href="tracks.php?id=new">Add a track</a><?php endif; ?>
          </p>
        <?php else: ?>
          <form method="get" class="narrow">
            <input type="hidden" name="id" value="new">
            <label class="field">Car
              <select name="car_id" required><?= options($carOptions, $carId ?: null, 'Choose a car') ?></select>
            </label>
            <label class="field">Track
              <select name="track_id" required><?= options($trackOptions, $trackId ?: null, 'Choose a track') ?></select>
            </label>
            <div class="form-end"><button class="btn btn-primary">Continue</button></div>
          </form>
        <?php endif; ?>
        </section>
        <?php
        page_footer();
        exit;
    }
    $setup = $parent ?? ['name' => '', 'purpose' => 'BASELINE', 'compound_id' => '', 'fuel_l' => '', 'notes' => ''];
    $setup['change_summary'] = '';
    if ($parent) {
        $setup['purpose'] = $parent['purpose'];
    }
} else {
    $setup = q('SELECT * FROM setups WHERE id = ?', [(int) $id])->fetch() ?: redirect('setups.php');
    $carId = (int) $setup['car_id'];
    $trackId = (int) $setup['track_id'];
    foreach (q('SELECT * FROM setup_corners WHERE setup_id = ?', [(int) $id]) as $row) {
        $corners[$row['corner']] = $row;
    }
    $stintCount = (int) q('SELECT COUNT(*) FROM stints WHERE setup_id = ?', [(int) $id])->fetchColumn();
}

$gearText = implode(', ', array_map('nf', array_map('strval', json_decode((string) ($setup['gear_ratios'] ?? ''), true) ?: [])));
$car   = q('SELECT * FROM cars WHERE id = ?', [$carId])->fetch() ?: redirect('setups.php');
$track = q('SELECT * FROM tracks WHERE id = ?', [$trackId])->fetch() ?: redirect('setups.php');
$ranges = car_ranges($carId);
$compoundOptions = q('SELECT id, name FROM tire_compounds WHERE car_id = ? ORDER BY id', [$carId])->fetchAll(PDO::FETCH_KEY_PAIR);
$locked = $stintCount > 0;

// Which settings this car shows. Fuel and cold pressure are always asked for.
$shownCar = array_values(array_filter($carKeys, fn ($k) => $k === 'fuel_l' || isset($ranges[$k]['CAR'])));
$shownCorner = array_values(array_filter($cornerKeys, fn ($k) => $k === 'cold_psi' || isset($ranges[$k])));

// ---------------------------------------------------------------- save
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM setups WHERE id = ?', [(int) $id]);
        flash('Setup deleted.');
        redirect('setups.php');
    }
    if ($locked) {
        flash('This setup has stints on it, so it stays as it was run. Create the next version to change it.', 'warn');
        redirect('setups.php?id=' . (int) $id);
    }

    $data = [
        'name'           => in_str($_POST, 'name', 'Setup name', $errors, true, 100),
        'purpose'        => in_enum($_POST, 'purpose', array_keys(PURPOSES)),
        'compound_id'    => (int) ($_POST['compound_id'] ?? 0),
        'change_summary' => in_str($_POST, 'change_summary', 'What changed', $errors, false, 255),
        'notes'          => in_str($_POST, 'notes', 'Notes', $errors, false, 5000),
    ];
    if (!isset($compoundOptions[$data['compound_id']])) {
        $errors[] = 'Choose a tyre.';
    }

    // Gear ratios: numbers separated by commas, spaces or new lines, 1st gear first.
    $gearText = trim((string) ($_POST['gear_ratios'] ?? ''));
    $ratios = [];
    foreach ($gearText === '' ? [] : preg_split('/[\s,;]+/', $gearText) as $piece) {
        $ratio = str_replace(',', '.', $piece);
        if (!is_numeric($ratio) || (float) $ratio < 0.3 || (float) $ratio > 15) {
            $errors[] = "Gear ratio \"$piece\" is not a ratio between 0.3 and 15.";
            break;
        }
        $ratios[] = (float) $ratio;
    }
    if (count($ratios) > 12) {
        $errors[] = 'That is more than 12 gears.';
    }
    $data['gear_ratios'] = $ratios ? json_encode($ratios) : null;

    $posted = (array) ($_POST['p'] ?? []);
    foreach ($carKeys as $key) {
        $data[$key] = null;
        if (in_array($key, $shownCar, true)) {
            $label = $PARAMS[$key]['label'];
            $data[$key] = in_num($posted, $key, $label, $errors, true, $key === 'fuel_l' ? 0 : null);
            check_range($data[$key], $ranges[$key]['CAR'] ?? null, $label, $errors);
        }
    }

    $cornerData = [];
    foreach (CORNERS as $corner => $cornerName) {
        $src = (array) ($_POST['c'][$corner] ?? []);
        foreach ($cornerKeys as $key) {
            $range = corner_range($ranges, $key, $corner);
            $ask = in_array($key, $shownCorner, true) && ($key === 'cold_psi' || $range !== null);
            $label = "$cornerName " . strtolower($PARAMS[$key]['label']);
            // The hot/cold pressure maths needs a real tyre pressure, so cold pressure is held to the same bounds as hot.
            $value = $ask ? in_num($src, $key, $label, $errors, true, $key === 'cold_psi' ? 5.0 : null, $key === 'cold_psi' ? 60.0 : null) : null;
            check_range($value, $range, $label, $errors);
            $cornerData[$corner][$key] = $value;
        }
    }

    $setup = array_merge($setup, $data, $posted);
    $corners = $cornerData;

    if (!$errors) {
        try {
            db()->beginTransaction();
            if ($isNew) {
                $data['car_id'] = $carId;
                $data['track_id'] = $trackId;
                $data['parent_setup_id'] = $parent['id'] ?? null;
                $data['version'] = (int) q('SELECT COALESCE(MAX(version), 0) + 1 FROM setups WHERE car_id = ? AND track_id = ?',
                    [$carId, $trackId])->fetchColumn();
                $cols = implode(', ', array_keys($data));
                $marks = implode(', ', array_fill(0, count($data), '?'));
                q("INSERT INTO setups ($cols) VALUES ($marks)", array_values($data));
                $setupId = (int) db()->lastInsertId();
            } else {
                $setupId = (int) $id;
                $set = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data)));
                q("UPDATE setups SET $set WHERE id = ?", [...array_values($data), $setupId]);
                q('DELETE FROM setup_corners WHERE setup_id = ?', [$setupId]);
            }
            $cols = implode(', ', $cornerKeys);
            $marks = implode(', ', array_fill(0, count($cornerKeys), '?'));
            foreach ($cornerData as $corner => $values) {
                q("INSERT INTO setup_corners (setup_id, corner, $cols) VALUES (?, ?, $marks)", [$setupId, $corner, ...array_values($values)]);
            }
            db()->commit();
            flash('Setup saved.');
            redirect('setups.php?id=' . $setupId);
        } catch (PDOException $ex) {
            db()->rollBack();
            $errors[] = 'The database refused this: ' . $ex->getMessage();
        }
    }
}

// ---------------------------------------------------------------- form
$mirrored = true;
foreach ($shownCorner as $key) {
    if (nf($corners['FL'][$key] ?? '') !== nf($corners['FR'][$key] ?? '') || nf($corners['RL'][$key] ?? '') !== nf($corners['RR'][$key] ?? '')) {
        $mirrored = false;
    }
}

/** min/max/step/placeholder attributes from a range row. */
$attrs = function (?array $range): string {
    if (!$range) {
        return 'step="any"';
    }
    return sprintf('min="%s" max="%s" step="%s" placeholder="%s to %s"',
        e(nf($range['min_value'])), e(nf($range['max_value'])), e(nf($range['step_value'])),
        e(nf($range['min_value'])), e(nf($range['max_value'])));
};

$title = $isNew ? ($parent ? 'Next version of ' . $parent['name'] : 'Enter a setup') : 'v' . $setup['version'] . ' ' . $setup['name'];
$readouts = [];
if (!$isNew) {
    $readouts = [
        ['Stints', (string) $stintCount, $locked ? 'Locked as it was run' : 'Not run yet', $locked ? '' : 'cyan'],
        ['Best lap', lap_text(q('SELECT MIN(best_lap_ms) FROM stints WHERE setup_id = ?', [(int) $id])->fetchColumn()), 'On this version', 'teal'],
        ['Tyre', (string) ($compoundOptions[$setup['compound_id']] ?? ''), PURPOSES[$setup['purpose']] ?? ''],
        ['Fuel', nf($setup['fuel_l']) . ' L', ''],
    ];
}
page_header($title, 'setups');
page_head($title, [
    'crumb' => ['setups.php', 'Setups'],
    'lede' => e($car['name']) . ' at ' . e($track['name']) . ' <span class="muted">' . e($track['layout']) . '</span>',
    'readouts' => $readouts,
]);
show_errors($errors);
?>

<?php if ($locked): ?>
  <div class="notice notice-warn">
    <?= $stintCount ?> <?= $stintCount === 1 ? 'stint was' : 'stints were' ?> run on this setup, so it stays exactly as it was driven.
    To change anything, <a href="setups.php?id=new&amp;from=<?= (int) $id ?>">create the next version</a>.
  </div>
<?php endif; ?>

<?php if (!$isNew): ?>
  <section class="calc" data-tag="Calculated">
    <h2>From these values</h2>
    <dl>
      <?php foreach (setup_summary($car, $setup, $corners, $ranges) as [$label, $value]): ?>
        <div><dt><?= e($label) ?></dt><dd><?= e($value) ?></dd></div>
      <?php endforeach; ?>
    </dl>
  </section>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <fieldset class="plain"<?= $locked ? ' disabled' : '' ?>>
  <section>
    <h2>Setup</h2>
    <div class="grid">
      <label class="field span-2">Setup name
        <input name="name" value="<?= e($setup['name']) ?>" required maxlength="100" placeholder="Race baseline">
      </label>
      <label class="field">For
        <select name="purpose"><?= options(PURPOSES, $setup['purpose']) ?></select>
      </label>
      <label class="field">Tyre
        <select name="compound_id" required><?= options($compoundOptions, $setup['compound_id'], count($compoundOptions) > 1 ? 'Choose a tyre' : null) ?></select>
      </label>
      <label class="field">Fuel <span class="unit">L</span>
        <input type="number" name="p[fuel_l]" value="<?= e(nf($setup['fuel_l'])) ?>" required <?= $attrs($ranges['fuel_l']['CAR'] ?? null) ?>>
      </label>
      <?php if ($parent || !empty($setup['parent_setup_id'])): ?>
        <label class="field span-3">What changed from the last version
          <input name="change_summary" value="<?= e($setup['change_summary']) ?>" maxlength="255" placeholder="Rear anti-roll bar 40 to 30">
        </label>
      <?php endif; ?>
    </div>
  </section>

  <section>
    <h2>At each wheel</h2>
    <label class="check">
      <input type="checkbox" data-mirror<?= $mirrored ? ' checked' : '' ?>>
      Copy what I type on the left to the right
    </label>
    <div class="car">
      <div class="chassis" aria-hidden="true"><span>Front</span></div>
      <?php foreach (CORNERS as $corner => $cornerName): ?>
        <fieldset class="wheel wheel-<?= strtolower($corner) ?>" data-corner="<?= $corner ?>">
          <legend><?= $cornerName ?></legend>
          <?php foreach ($shownCorner as $key):
              $range = corner_range($ranges, $key, $corner);
              if ($key !== 'cold_psi' && $range === null) { continue; } ?>
            <label class="field"><?= e($PARAMS[$key]['label']) ?> <span class="unit"><?= e($range['unit'] ?? $PARAMS[$key]['unit']) ?></span>
              <input type="number" name="c[<?= $corner ?>][<?= $key ?>]" data-param="<?= $key ?>"
                     value="<?= e(nf($corners[$corner][$key] ?? '')) ?>" required <?= $attrs($range) ?>>
            </label>
          <?php endforeach; ?>
        </fieldset>
      <?php endforeach; ?>
    </div>
  </section>

  <?php
  $groups = [];
  foreach ($shownCar as $key) {
      if ($key !== 'fuel_l') {
          $groups[$PARAMS[$key]['group']][] = $key;
      }
  }
  ?>
  <?php if ($groups): ?>
  <section>
    <h2>Whole car</h2>
    <?php foreach ($groups as $group => $keys): ?>
      <h3><?= e($group) ?></h3>
      <div class="grid">
        <?php foreach ($keys as $key): $range = $ranges[$key]['CAR']; ?>
          <label class="field"><?= e($PARAMS[$key]['label']) ?> <span class="unit"><?= e($range['unit']) ?></span>
            <input type="number" name="p[<?= $key ?>]" value="<?= e(nf($setup[$key] ?? '')) ?>" required <?= $attrs($range) ?>>
            <span class="hint">Higher: <?= e($range['higher_means']) ?></span>
          </label>
        <?php endforeach; ?>
      </div>
    <?php endforeach; ?>
  </section>
  <?php endif; ?>

  <section>
    <h2>Gearing</h2>
    <label class="field">Gear ratios, first gear first <span class="hint">optional, for example 3.29, 2.16, 1.61, 1.27</span>
      <input name="gear_ratios" value="<?= e($gearText) ?>" maxlength="120" inputmode="decimal">
    </label>
    <p class="hint">Recorded with the setup and shown to the AI engineer, but the AI is not asked to change gearing.
      The final drive, if the car lets you change it, is set above.</p>
  </section>

  <section>
    <h2>Notes</h2>
    <label class="field">Anything worth remembering about this setup
      <textarea name="notes" rows="3"><?= e($setup['notes']) ?></textarea>
    </label>
  </section>
  </fieldset>

  <div class="actions">
    <?php if (!$locked): ?><button class="btn btn-primary">Save setup</button><?php endif; ?>
    <?php if (!$isNew): ?>
      <a class="btn<?= $locked ? ' btn-primary' : '' ?>" href="stints.php?id=new&amp;setup_id=<?= (int) $id ?>">Log a stint</a>
      <a class="btn" href="setups.php?id=new&amp;from=<?= (int) $id ?>">Create the next version</a>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate
              data-confirm="Delete this setup and the <?= $stintCount ?> stint(s) run on it?">Delete setup</button>
    <?php else: ?>
      <a class="btn" href="setups.php">Cancel</a>
    <?php endif; ?>
  </div>
</form>
<?php page_footer();
