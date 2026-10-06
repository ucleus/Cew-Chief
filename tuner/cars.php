<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

const DRIVETRAINS = ['MR' => 'Mid engine, rear drive', 'FR' => 'Front engine, rear drive', 'RR' => 'Rear engine, rear drive',
                     'FF' => 'Front engine, front drive', 'AWD' => 'All-wheel drive'];
const RANGE_FIELDS = ['min_value', 'max_value', 'step_value', 'unit', 'higher_means', 'real_base', 'real_per_unit', 'real_unit'];

$scopesFor = fn (array $def): array => $def['level'] === 'corner' ? ['FRONT', 'REAR'] : ['CAR'];
$id = $_GET['id'] ?? null;

// ---------------------------------------------------------------- list
if ($id === null) {
    $cars = q('SELECT c.*,
                 (SELECT COUNT(*) FROM tire_compounds t WHERE t.car_id = c.id) AS compound_count,
                 (SELECT COUNT(DISTINCT param_key) FROM car_param_ranges r WHERE r.car_id = c.id) AS setting_count,
                 (SELECT COUNT(*) FROM setups s WHERE s.car_id = c.id) AS setup_count
               FROM cars c ORDER BY c.name')->fetchAll();
    page_header('Cars', 'cars');
    page_head('Cars', ['actions' => '<a class="btn btn-primary" href="cars.php?id=new">Add a car</a>']);
    ?>
    <section>
      <h2>Saved cars <span class="count"><?= count($cars) ?></span></h2>
    <?php if (!$cars): ?>
      <p class="empty">No cars yet. Add one with its tyres and the settings its setup screen offers.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Car</th><th>Class</th><th class="num">Mass</th><th class="num">Front weight</th><th class="num">Tyres</th><th class="num">Settings</th><th class="num">Setups</th></tr></thead>
        <tbody>
        <?php foreach ($cars as $c): ?>
          <tr>
            <td><a href="cars.php?id=<?= (int) $c['id'] ?>"><?= e($c['name']) ?></a></td>
            <td><?= e($c['car_class']) ?></td>
            <td class="num"><?= nf($c['total_mass_kg']) ?> kg</td>
            <td class="num"><?= nf($c['front_weight_pct']) ?>%</td>
            <td class="num"><?= (int) $c['compound_count'] ?></td>
            <td class="num"><?= (int) $c['setting_count'] ?></td>
            <td class="num"><?= (int) $c['setup_count'] ?></td>
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
$car = ['name' => '', 'ac_folder' => '', 'car_class' => '', 'drivetrain' => 'MR', 'total_mass_kg' => '', 'front_weight_pct' => '',
        'wheelbase_mm' => '', 'track_front_mm' => '', 'track_rear_mm' => '', 'unsprung_front_kg' => '45', 'unsprung_rear_kg' => '50',
        'motion_ratio_front' => '1', 'motion_ratio_rear' => '1', 'fuel_tank_l' => '', 'notes' => ''];
$compounds = [];
$ranges = [];
if (!$isNew) {
    $car = q('SELECT * FROM cars WHERE id = ?', [(int) $id])->fetch() ?: redirect('cars.php');
    $compounds = q('SELECT * FROM tire_compounds WHERE car_id = ? ORDER BY id', [(int) $id])->fetchAll();
    $ranges = car_ranges((int) $id);
}
$enabled = array_fill_keys(array_keys($ranges), true);

// Coming back from the game-files import: fill the form, save nothing yet.
$importReport = null;
if (!is_post() && isset($_GET['imported']) && isset($_SESSION['car_import'])) {
    $importReport = $_SESSION['car_import'];
    unset($_SESSION['car_import']);
    $car = array_merge($car, $importReport['spec']);
    if ($importReport['ranges']) {
        $ranges = $importReport['ranges'];
        $enabled = array_fill_keys(array_keys($ranges), true);
    }
}

// ---------------------------------------------------------------- save
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        db()->beginTransaction();
        q('DELETE FROM setups WHERE car_id = ?', [(int) $id]);
        q('DELETE FROM cars WHERE id = ?', [(int) $id]);
        db()->commit();
        flash('Car deleted.');
        redirect('cars.php');
    }

    $data = [
        'name'               => in_str($_POST, 'name', 'Car name', $errors, true, 100),
        'ac_folder'          => in_str($_POST, 'ac_folder', 'Game folder', $errors, false, 100),
        'car_class'          => in_str($_POST, 'car_class', 'Class', $errors, true, 40),
        'drivetrain'         => in_enum($_POST, 'drivetrain', array_keys(DRIVETRAINS)),
        'total_mass_kg'      => in_num($_POST, 'total_mass_kg', 'Mass', $errors, true, 200, 5000),
        'front_weight_pct'   => in_num($_POST, 'front_weight_pct', 'Front weight', $errors, true, 20, 80),
        'wheelbase_mm'       => in_num($_POST, 'wheelbase_mm', 'Wheelbase', $errors, true, 1000, 5000),
        'track_front_mm'     => in_num($_POST, 'track_front_mm', 'Front track width', $errors, true, 800, 3000),
        'track_rear_mm'      => in_num($_POST, 'track_rear_mm', 'Rear track width', $errors, true, 800, 3000),
        'unsprung_front_kg'  => in_num($_POST, 'unsprung_front_kg', 'Front unsprung mass', $errors, true, 5, 200),
        'unsprung_rear_kg'   => in_num($_POST, 'unsprung_rear_kg', 'Rear unsprung mass', $errors, true, 5, 200),
        'motion_ratio_front' => in_num($_POST, 'motion_ratio_front', 'Front motion ratio', $errors, true, 0.1, 2),
        'motion_ratio_rear'  => in_num($_POST, 'motion_ratio_rear', 'Rear motion ratio', $errors, true, 0.1, 2),
        'fuel_tank_l'        => in_num($_POST, 'fuel_tank_l', 'Fuel tank', $errors, false, 1, 500),
        'notes'              => in_str($_POST, 'notes', 'Notes', $errors, false, 5000),
    ];
    $car = array_merge($car, $_POST);

    // Tyre compounds: a row with a name is kept, a saved row with its name cleared is deleted.
    $compounds = [];
    $compoundRows = [];
    foreach ((array) ($_POST['comp'] ?? []) as $row) {
        $row = (array) $row;
        $rowId = (int) ($row['id'] ?? 0);
        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '' && $rowId === 0) {
            continue;
        }
        $compounds[] = $row;
        if ($name === '') {
            $compoundRows[] = ['delete' => $rowId];
            continue;
        }
        $label = "Tyre $name:";
        $compoundRows[] = ['id' => $rowId, 'values' => [
            in_str($row, 'name', 'Tyre name', $errors, true, 40),
            in_num($row, 'target_hot_psi_front', "$label front target pressure", $errors, true, 5, 60),
            in_num($row, 'target_hot_psi_rear', "$label rear target pressure", $errors, true, 5, 60),
            in_num($row, 'temp_min_c', "$label window low", $errors, true, 0, 200),
            in_num($row, 'temp_max_c', "$label window high", $errors, true, 0, 200),
        ]];
    }
    if (!array_filter($compoundRows, fn ($r) => isset($r['values']))) {
        $errors[] = 'Add at least one tyre. Setups need a target pressure to work from.';
    }

    // Adjustable settings
    $ranges = [];
    $enabled = [];
    $rangeRows = [];
    foreach ($PARAMS as $key => $def) {
        if (empty($_POST['on'][$key])) {
            continue;
        }
        $enabled[$key] = true;
        foreach ($scopesFor($def) as $scope) {
            $src = (array) ($_POST['r'][$key][$scope] ?? []);
            $ranges[$key][$scope] = $src;
            $label = $def['label'] . ($scope === 'CAR' ? '' : ' ' . strtolower($scope)) . ':';
            $min  = in_num($src, 'min_value', "$label minimum", $errors, true);
            $max  = in_num($src, 'max_value', "$label maximum", $errors, true);
            $step = in_num($src, 'step_value', "$label step", $errors, true, 0.001);
            $unit = in_str($src, 'unit', "$label unit", $errors, true, 12);
            $high = in_str($src, 'higher_means', "$label what a higher number means", $errors, true, 40);
            $base = in_num($src, 'real_base', "$label conversion base", $errors);
            $per  = in_num($src, 'real_per_unit', "$label conversion per step", $errors);
            $realUnit = in_str($src, 'real_unit', "$label real unit", $errors, false, 12);
            if ($min !== null && $max !== null && $max < $min) {
                $errors[] = "$label maximum is below the minimum.";
            }
            if (($base === null) !== ($per === null)) {
                $errors[] = "$label the conversion needs both numbers, or neither.";
            }
            $rangeRows[] = [$key, $scope, $min, $max, $step, $unit, $high, $base, $per, $realUnit];
        }
    }

    if (!$errors) {
        try {
            db()->beginTransaction();
            if ($isNew) {
                $cols = implode(', ', array_keys($data));
                $marks = implode(', ', array_fill(0, count($data), '?'));
                q("INSERT INTO cars ($cols) VALUES ($marks)", array_values($data));
                $carId = (int) db()->lastInsertId();
            } else {
                $carId = (int) $id;
                $set = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data)));
                q("UPDATE cars SET $set WHERE id = ?", [...array_values($data), $carId]);
            }

            foreach ($compoundRows as $row) {
                if (isset($row['delete'])) {
                    q('DELETE FROM tire_compounds WHERE id = ? AND car_id = ?', [$row['delete'], $carId]);
                } elseif ($row['id']) {
                    q('UPDATE tire_compounds SET name = ?, target_hot_psi_front = ?, target_hot_psi_rear = ?, temp_min_c = ?, temp_max_c = ?
                       WHERE id = ? AND car_id = ?', [...$row['values'], $row['id'], $carId]);
                } else {
                    q('INSERT INTO tire_compounds (name, target_hot_psi_front, target_hot_psi_rear, temp_min_c, temp_max_c, car_id)
                       VALUES (?, ?, ?, ?, ?, ?)', [...$row['values'], $carId]);
                }
            }

            q('DELETE FROM car_param_ranges WHERE car_id = ?', [$carId]);
            foreach ($rangeRows as $row) {
                q('INSERT INTO car_param_ranges
                     (car_id, param_key, scope, min_value, max_value, step_value, unit, higher_means, real_base, real_per_unit, real_unit)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$carId, ...$row]);
            }
            db()->commit();
            flash('Car saved.');
            redirect('cars.php');
        } catch (PDOException $ex) {
            db()->rollBack();
            $errors[] = $ex->getCode() === '23000'
                ? 'Either another car already has this name, or you cleared a tyre that existing setups still use.'
                : 'The database refused this: ' . $ex->getMessage();
        }
    }
}

// ---------------------------------------------------------------- form
$compoundRow = function (string $i, array $row): void {
    $f = fn (string $name) => e(nf($row[$name] ?? ''));
    ?>
    <div class="row-set">
      <input type="hidden" name="comp[<?= $i ?>][id]" value="<?= e($row['id'] ?? '') ?>">
      <label class="field span-2">Tyre name
        <input name="comp[<?= $i ?>][name]" value="<?= e($row['name'] ?? '') ?>" maxlength="40" placeholder="Slick medium">
      </label>
      <label class="field">Target hot, front <span class="unit">psi</span>
        <input type="number" step="any" name="comp[<?= $i ?>][target_hot_psi_front]" value="<?= $f('target_hot_psi_front') ?>">
      </label>
      <label class="field">Target hot, rear <span class="unit">psi</span>
        <input type="number" step="any" name="comp[<?= $i ?>][target_hot_psi_rear]" value="<?= $f('target_hot_psi_rear') ?>">
      </label>
      <label class="field">Works from <span class="unit">°C</span>
        <input type="number" step="any" name="comp[<?= $i ?>][temp_min_c]" value="<?= $f('temp_min_c') ?>">
      </label>
      <label class="field">Works up to <span class="unit">°C</span>
        <input type="number" step="any" name="comp[<?= $i ?>][temp_max_c]" value="<?= $f('temp_max_c') ?>">
      </label>
    </div>
    <?php
};

$rangeRow = function (string $key, string $scope, array $def, array $row): void {
    $n = "r[$key][$scope]";
    $f = fn (string $name, string $default = '') => e(nf($row[$name] ?? $default));
    ?>
    <div class="range" data-scope="<?= $scope ?>">
      <?php if ($scope !== 'CAR'): ?><p class="range-scope"><?= human($scope) ?> wheels</p><?php endif; ?>
      <div class="range-grid">
        <label class="field">Lowest
          <input type="number" step="any" name="<?= $n ?>[min_value]" value="<?= $f('min_value') ?>" required>
        </label>
        <label class="field">Highest
          <input type="number" step="any" name="<?= $n ?>[max_value]" value="<?= $f('max_value') ?>" required>
        </label>
        <label class="field">Step
          <input type="number" step="any" min="0.001" name="<?= $n ?>[step_value]" value="<?= $f('step_value', '1') ?>" required>
        </label>
        <label class="field">Unit
          <input name="<?= $n ?>[unit]" value="<?= $f('unit', $def['unit']) ?>" maxlength="12" required>
        </label>
        <label class="field range-wide">A higher number means
          <input name="<?= $n ?>[higher_means]" value="<?= $f('higher_means', $def['higher']) ?>" maxlength="40" required>
        </label>
      </div>
      <details class="convert"<?= ($row['real_base'] ?? '') !== '' && $row['real_base'] !== null ? ' open' : '' ?>>
        <summary>The game shows clicks, not real units</summary>
        <p class="hint">Real value = base + clicks × per click. Leave empty if the screen already shows real units.
          The calculator wants springs in N/mm, anti-roll bars in N/m and dampers in Ns/m.</p>
        <div class="range-grid">
          <label class="field">Base
            <input type="number" step="any" name="<?= $n ?>[real_base]" value="<?= $f('real_base') ?>">
          </label>
          <label class="field">Per click
            <input type="number" step="any" name="<?= $n ?>[real_per_unit]" value="<?= $f('real_per_unit') ?>">
          </label>
          <label class="field">Real unit
            <input name="<?= $n ?>[real_unit]" value="<?= $f('real_unit') ?>" maxlength="12" placeholder="N/m">
          </label>
        </div>
      </details>
    </div>
    <?php
};

$groups = [];
foreach ($PARAMS as $key => $def) {
    $groups[$def['group']][$key] = $def;
}

page_header($isNew ? 'Add a car' : $car['name'], 'cars');
page_head($isNew ? 'Add a car' : (string) $car['name'], [
    'crumb' => ['cars.php', 'Cars'],
    'actions' => $importReport ? '' : '<a class="btn" href="car_import.php?id=' . ($isNew ? 'new' : (int) $id) . '">Fill from the car\'s game files</a>',
]);
show_errors($errors);
?>

<?php if ($importReport): ?>
  <div class="notice notice-ok">
    <p>Read <?= e(implode(', ', $importReport['found'])) ?>. Nothing is saved yet: check the form below, then press Save.
      <?= count($importReport['ranges']) ? count($importReport['ranges']) . ' settings were ticked. ' : '' ?>
      <?php if ($isNew): ?>The game's files don't hold the car's name, class or tyre pressures, so fill those in.<?php endif; ?></p>
  </div>
  <?php if ($importReport['notes']): ?>
    <div class="notice notice-warn">
      <p>Check these before you save:</p>
      <ul><?php foreach ($importReport['notes'] as $note): ?><li><?= e($note) ?></li><?php endforeach; ?></ul>
    </div>
  <?php endif; ?>
  <?php if ($importReport['unrecognized']): ?>
    <details class="convert report">
      <summary><?= count($importReport['unrecognized']) ?> settings in the file were not imported</summary>
      <p class="hint">This app doesn't use them yet. Anything it doesn't know can't be changed by the AI engineer.</p>
      <ul class="prose"><?php foreach ($importReport['unrecognized'] as $u): ?><li><?= e($u) ?></li><?php endforeach; ?></ul>
    </details>
  <?php endif; ?>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>Car</h2>
    <div class="grid">
      <label class="field span-2">Car name
        <input name="name" value="<?= e($car['name']) ?>" required maxlength="100">
      </label>
      <label class="field">Class
        <input name="car_class" value="<?= e($car['car_class']) ?>" required maxlength="40" placeholder="GT3">
      </label>
      <label class="field">Layout
        <select name="drivetrain"><?= options(DRIVETRAINS, $car['drivetrain']) ?></select>
      </label>
      <label class="field">Game folder <span class="hint">optional</span>
        <input name="ac_folder" value="<?= e($car['ac_folder']) ?>" maxlength="100">
      </label>
    </div>
  </section>

  <section>
    <h2>Mass and dimensions</h2>
    <p class="hint">The calculator uses these for ride frequency and roll stiffness, so they need to be the car's real figures.</p>
    <div class="grid">
      <label class="field">Mass <span class="unit">kg</span> <span class="hint">with driver, no fuel</span>
        <input type="number" step="any" name="total_mass_kg" value="<?= e(nf($car['total_mass_kg'])) ?>" required>
      </label>
      <label class="field">Front weight <span class="unit">%</span>
        <input type="number" step="any" name="front_weight_pct" value="<?= e(nf($car['front_weight_pct'])) ?>" required>
      </label>
      <label class="field">Fuel tank <span class="unit">L</span>
        <input type="number" step="any" name="fuel_tank_l" value="<?= e(nf($car['fuel_tank_l'])) ?>">
      </label>
      <label class="field">Wheelbase <span class="unit">mm</span>
        <input type="number" name="wheelbase_mm" value="<?= e($car['wheelbase_mm']) ?>" required>
      </label>
      <label class="field">Front track width <span class="unit">mm</span>
        <input type="number" name="track_front_mm" value="<?= e($car['track_front_mm']) ?>" required>
      </label>
      <label class="field">Rear track width <span class="unit">mm</span>
        <input type="number" name="track_rear_mm" value="<?= e($car['track_rear_mm']) ?>" required>
      </label>
      <label class="field">Front unsprung mass <span class="unit">kg per wheel</span>
        <input type="number" step="any" name="unsprung_front_kg" value="<?= e(nf($car['unsprung_front_kg'])) ?>" required>
      </label>
      <label class="field">Rear unsprung mass <span class="unit">kg per wheel</span>
        <input type="number" step="any" name="unsprung_rear_kg" value="<?= e(nf($car['unsprung_rear_kg'])) ?>" required>
      </label>
    </div>
    <details class="convert">
      <summary>Motion ratios</summary>
      <p class="hint">Assetto Corsa's spring values are already measured at the wheel, so leave both at 1 unless a mod's notes say otherwise.</p>
      <div class="grid">
        <label class="field">Front
          <input type="number" step="any" name="motion_ratio_front" value="<?= e(nf($car['motion_ratio_front'])) ?>" required>
        </label>
        <label class="field">Rear
          <input type="number" step="any" name="motion_ratio_rear" value="<?= e(nf($car['motion_ratio_rear'])) ?>" required>
        </label>
      </div>
    </details>
    <label class="field">Notes
      <textarea name="notes" rows="2"><?= e($car['notes']) ?></textarea>
    </label>
  </section>

  <section>
    <h2>Tyres</h2>
    <p class="hint">One row per compound. Target hot pressure is what the tyre should read after a few flying laps.
      To remove a tyre, clear its name.</p>
    <div data-rows="comp">
      <?php foreach ($compounds as $i => $row) { $compoundRow((string) $i, $row); } ?>
      <?php if (!$compounds) { $compoundRow('0', []); } ?>
    </div>
    <template data-template="comp"><?php $compoundRow('__i__', []); ?></template>
    <button type="button" class="btn btn-small" data-add-row="comp">Add another tyre</button>
  </section>

  <section>
    <h2>Settings this car lets you change</h2>
    <p class="hint">Tick what the car's setup screen offers and copy the limits from it. Setups will only ask for
      what you tick here, and the AI engineer can only recommend values inside these limits.</p>
    <?php foreach ($groups as $group => $defs): ?>
      <h3><?= e($group) ?></h3>
      <?php foreach ($defs as $key => $def): $scopes = $scopesFor($def); ?>
        <div class="param">
          <label class="check">
            <input type="checkbox" class="param-toggle" name="on[<?= $key ?>]" value="1"<?= !empty($enabled[$key]) ? ' checked' : '' ?>>
            <?= e($def['label']) ?>
          </label>
          <div class="param-body">
            <?php foreach ($scopes as $n => $scope): ?>
              <?php $rangeRow($key, $scope, $def, $ranges[$key][$scope] ?? []); ?>
              <?php if ($n === 0 && count($scopes) > 1): ?>
                <button type="button" class="btn btn-small copy-front" data-copy-front>Use these front values for the rear too</button>
              <?php endif; ?>
            <?php endforeach; ?>
          </div>
        </div>
      <?php endforeach; ?>
    <?php endforeach; ?>
  </section>

  <div class="actions">
    <button class="btn btn-primary">Save car</button>
    <a class="btn" href="cars.php">Cancel</a>
    <?php if (!$isNew): ?>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate
              data-confirm="Delete this car and every setup and stint recorded with it?">Delete car</button>
    <?php endif; ?>
  </div>
</form>
<?php page_footer();
