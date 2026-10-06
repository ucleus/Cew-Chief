<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

const MG_GAMES = ['MotoGP 24', 'MotoGP 25', 'MotoGP 26'];
const MG_LISTS = ['front_disc' => 'Front brake discs', 'rear_disc' => 'Rear brake discs', 'tyre_front' => 'Front tyres', 'tyre_rear' => 'Rear tyres'];

$numeric = array_filter($MOTO['params'], fn ($d) => $d['kind'] === 'num');
$id = $_GET['id'] ?? null;

// ---------------------------------------------------------------- list
if ($id === null) {
    $bikes = q('SELECT b.*, (SELECT COUNT(*) FROM mg_bike_params p WHERE p.bike_id = b.id) AS settings,
                       (SELECT COUNT(*) FROM mg_setups s WHERE s.bike_id = b.id) AS setups
                FROM mg_bikes b ORDER BY b.game DESC, b.class, b.name')->fetchAll();
    page_header('Bikes', 'moto_bikes');
    page_head('Bikes', ['actions' => '<a class="btn btn-primary" href="moto_bikes.php?id=new">Add a bike</a>']);
    ?>
    <section>
      <h2>Garages <span class="count"><?= count($bikes) ?></span></h2>
    <?php if (!$bikes): ?>
      <p class="empty">No bikes yet. Add one for the class you are racing. You only describe a garage once: later bikes can copy it.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Bike</th><th>Game</th><th>Class</th><th class="num">Settings</th><th>Ranges</th><th class="num">Setups</th></tr></thead>
        <tbody>
        <?php foreach ($bikes as $b): ?>
          <tr>
            <td><a href="moto_bikes.php?id=<?= (int) $b['id'] ?>"><?= e($b['name']) ?></a></td>
            <td><?= e($b['game']) ?></td><td><?= e($b['class']) ?></td>
            <td class="num"><?= (int) $b['settings'] ?></td>
            <td><span class="flag flag-<?= $b['ranges_verified'] ? 'ok' : 'warn' ?>"><?= $b['ranges_verified'] ? 'Checked' : 'Not checked yet' ?></span></td>
            <td class="num"><?= (int) $b['setups'] ?></td>
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
$bike = ['game' => 'MotoGP 26', 'class' => 'MotoGP', 'name' => '', 'notes' => '', 'ranges_verified' => 0];
$rows = [];
$lists = array_fill_keys(array_keys(MG_LISTS), []);
$sourceId = $isNew ? (int) ($_GET['copy'] ?? 0) : (int) $id;
if (!$isNew) {
    $bike = q('SELECT * FROM mg_bikes WHERE id = ?', [(int) $id])->fetch() ?: redirect('moto_bikes.php');
}
if ($sourceId && ($copy = q('SELECT * FROM mg_bikes WHERE id = ?', [$sourceId])->fetch())) {
    if ($isNew) {
        $bike['game'] = $copy['game'];
        $bike['class'] = $copy['class'];
    }
    foreach (mg_bike_params($sourceId) as $key => $p) {
        $rows[$key] = ['on' => 1, 'min' => $p['min_value'], 'max' => $p['max_value'], 'default' => $p['default_value'], 'flip' => $p['flip']];
    }
    foreach (mg_bike_options($sourceId) as $key => $list) {
        $lists[$key] = $list;
    }
} else {
    $seed = $MOTO['model']['seed_range'];
    foreach ($numeric as $key => $_) {
        $rows[$key] = ['on' => 1, 'min' => $seed['min'], 'max' => $seed['max'], 'default' => $seed['default'], 'flip' => 0];
    }
    $lists['tyre_front'] = $lists['tyre_rear'] = [
        ['label' => 'Soft', 'kind' => 'SOFT', 'size_mm' => null], ['label' => 'Medium', 'kind' => 'MEDIUM', 'size_mm' => null], ['label' => 'Hard', 'kind' => 'HARD', 'size_mm' => null]];
}

// ---------------------------------------------------------------- save
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        db()->beginTransaction();
        q('DELETE FROM mg_setups WHERE bike_id = ?', [(int) $id]);
        q('DELETE FROM mg_bikes WHERE id = ?', [(int) $id]);
        db()->commit();
        flash('Bike deleted.');
        redirect('moto_bikes.php');
    }
    $game = in_array($_POST['game'] ?? '', MG_GAMES, true) ? $_POST['game'] : 'MotoGP 26';
    $data = [
        'game' => $game,
        'class' => in_str($_POST, 'class', 'Class', $errors, true, 30),
        'name' => in_str($_POST, 'name', 'Bike name', $errors, true, 100),
        'notes' => in_str($_POST, 'notes', 'Notes', $errors, false, 5000),
        'ranges_verified' => empty($_POST['ranges_verified']) ? 0 : 1,
    ];
    $bike = array_merge($bike, $data);

    $rows = [];
    $paramRows = [];
    foreach ($numeric as $key => $def) {
        $src = (array) ($_POST['s'][$key] ?? []);
        if (empty($src['on'])) {
            continue;
        }
        $lo = in_num($src, 'min', $def['label'] . ' lowest', $errors, true, -100, 1000);
        $hi = in_num($src, 'max', $def['label'] . ' highest', $errors, true, -100, 1000);
        $df = in_num($src, 'default', $def['label'] . ' game default', $errors, true, -100, 1000);
        $rows[$key] = ['on' => 1, 'min' => $lo, 'max' => $hi, 'default' => $df, 'flip' => empty($src['flip']) ? 0 : 1];
        if ($lo !== null && $hi !== null && $hi <= $lo) {
            $errors[] = $def['label'] . ': the highest value must be above the lowest.';
        } elseif ($lo !== null && $hi !== null && $df !== null && ($df < $lo || $df > $hi)) {
            $errors[] = $def['label'] . ": the game default must be between $lo and $hi.";
        }
        $paramRows[] = [$key, (int) $lo, (int) $hi, (int) $df, empty($src['flip']) ? 0 : 1];
    }
    if (!$paramRows) {
        $errors[] = 'Tick at least one setting.';
    }

    $lists = array_fill_keys(array_keys(MG_LISTS), []);
    $optionRows = [];
    foreach (MG_LISTS as $key => $_) {
        $kinds = str_starts_with($key, 'tyre') ? array_keys($MOTO['tyre_kinds']) : array_keys($MOTO['disc_kinds']);
        $rank = 0;
        foreach ((array) ($_POST['o'][$key] ?? []) as $row) {
            $label = trim((string) ($row['label'] ?? ''));
            if ($label === '') {
                continue;
            }
            $size = trim((string) ($row['size_mm'] ?? ''));
            $kind = in_array($row['kind'] ?? '', $kinds, true) ? $row['kind'] : null;
            if ($size !== '' && (!ctype_digit($size) || (int) $size < 100 || (int) $size > 500)) {
                $errors[] = "$label: size must be a whole number of millimetres.";
            }
            $rank++;
            $lists[$key][] = ['label' => $label, 'size_mm' => $size === '' ? null : (int) $size, 'kind' => $kind, 'rank_no' => $rank];
            $optionRows[] = [$key, cut($label, 60), $size === '' ? null : (int) $size, $kind, $rank];
        }
    }

    if (!$errors) {
        try {
            db()->beginTransaction();
            if ($isNew) {
                q('INSERT INTO mg_bikes (game, class, name, notes, ranges_verified) VALUES (?, ?, ?, ?, ?)',
                    [$data['game'], $data['class'], $data['name'], $data['notes'], $data['ranges_verified']]);
                $bikeId = (int) db()->lastInsertId();
            } else {
                $bikeId = (int) $id;
                q('UPDATE mg_bikes SET game = ?, class = ?, name = ?, notes = ?, ranges_verified = ? WHERE id = ?',
                    [$data['game'], $data['class'], $data['name'], $data['notes'], $data['ranges_verified'], $bikeId]);
                q('DELETE FROM mg_bike_params WHERE bike_id = ?', [$bikeId]);
                // A removed setting must not leave orphaned values in saved setups.
                $keep = array_column($paramRows, 0);
                foreach (q('SELECT DISTINCT v.param_key FROM mg_setup_values v JOIN mg_setups s ON s.id = v.setup_id WHERE s.bike_id = ?', [$bikeId])->fetchAll(PDO::FETCH_COLUMN) as $k) {
                    if (!in_array($k, $keep, true)) {
                        q('DELETE v FROM mg_setup_values v JOIN mg_setups s ON s.id = v.setup_id WHERE s.bike_id = ? AND v.param_key = ?', [$bikeId, $k]);
                    }
                }
            }
            foreach ($paramRows as $r) {
                q('INSERT INTO mg_bike_params (bike_id, param_key, min_value, max_value, default_value, flip) VALUES (?, ?, ?, ?, ?, ?)', [$bikeId, ...$r]);
            }
            $labels = [];
            foreach ($optionRows as [$key, $label, $size, $kind, $rank]) {
                // The unique key ignores case, so "Soft" renamed to "SOFT" lands on the same row: take the new spelling
                // too, or the clean-up below would not recognise the row and delete it.
                q('INSERT INTO mg_bike_options (bike_id, param_key, label, size_mm, kind, rank_no) VALUES (?, ?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE label = VALUES(label), size_mm = VALUES(size_mm), kind = VALUES(kind), rank_no = VALUES(rank_no)', [$bikeId, $key, $label, $size, $kind, $rank]);
                $labels[$key][] = $label;
            }
            $kept = [];
            foreach (q('SELECT id, param_key, label FROM mg_bike_options WHERE bike_id = ?', [$bikeId])->fetchAll() as $o) {
                if (!in_array($o['label'], $labels[$o['param_key']] ?? [], true)) {
                    try {
                        q('DELETE FROM mg_bike_options WHERE id = ?', [$o['id']]);
                    } catch (PDOException) {
                        $kept[] = $o['label'];
                    }
                }
            }
            db()->commit();
            flash('Bike saved.' . ($kept ? ' Kept ' . implode(', ', $kept) . ' because a saved setup uses it.' : ''), $kept ? 'warn' : 'ok');
            redirect('moto_bikes.php');
        } catch (PDOException $ex) {
            if (db()->inTransaction()) {
                db()->rollBack();
            }
            $errors[] = $ex->getCode() === '23000' ? 'A bike with this game, class and name already exists.' : 'The database refused this: ' . $ex->getMessage();
        }
    }
}

$others = $isNew ? q("SELECT id, CONCAT(name, ' (', game, ', ', class, ')') FROM mg_bikes ORDER BY name")->fetchAll(PDO::FETCH_KEY_PAIR) : [];

$listRow = function (string $key, string $i, array $row): void {
    global $MOTO;
    $tyre = str_starts_with($key, 'tyre');
    $kinds = $tyre ? $MOTO['tyre_kinds'] : $MOTO['disc_kinds'];
    ?>
    <div class="row-set">
      <label class="field span-2">Name as the garage shows it
        <input name="o[<?= $key ?>][<?= $i ?>][label]" value="<?= e($row['label'] ?? '') ?>" maxlength="60" placeholder="<?= $tyre ? 'Medium' : '340 mm high mass' ?>">
      </label>
      <?php if (!$tyre): ?>
        <label class="field">Size <span class="unit">mm</span>
          <input type="number" name="o[<?= $key ?>][<?= $i ?>][size_mm]" value="<?= e($row['size_mm'] ?? '') ?>" min="100" max="500">
        </label>
      <?php endif; ?>
      <label class="field">Type
        <select name="o[<?= $key ?>][<?= $i ?>][kind]"><?= options($kinds, $row['kind'] ?? '', 'Not stated') ?></select>
      </label>
    </div>
    <?php
};

page_header($isNew ? 'Add a bike' : $bike['name'], 'moto_bikes');
page_head($isNew ? 'Add a bike' : (string) $bike['name'], ['crumb' => ['moto_bikes.php', 'Bikes']]);
show_errors($errors);
?>

<?php if ($isNew && $others && !$sourceId): ?>
  <section>
    <h2>Start from another bike</h2>
    <form method="get" class="ask">
      <input type="hidden" name="id" value="new">
      <label class="field">Copy the garage from
        <select name="copy"><?= options($others, null, 'Start from scratch') ?></select>
      </label>
      <button class="btn">Copy</button>
    </form>
  </section>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>Bike</h2>
    <div class="grid">
      <label class="field">Game
        <select name="game"><?= options(array_combine(MG_GAMES, MG_GAMES), $bike['game']) ?></select>
      </label>
      <label class="field">Class
        <input name="class" list="classes" value="<?= e($bike['class']) ?>" required maxlength="30">
        <datalist id="classes"><option>MotoGP</option><option>Moto2</option><option>Moto3</option><option>MotoE</option></datalist>
      </label>
      <label class="field span-2">Bike name
        <input name="name" value="<?= e($bike['name']) ?>" required maxlength="100" placeholder="Ducati Desmosedici GP26">
      </label>
    </div>
    <label class="field">Notes
      <textarea name="notes" rows="2"><?= e($bike['notes']) ?></textarea>
    </label>
  </section>

  <section>
    <h2>Settings in the garage</h2>
    <p class="hint">Open this bike's garage and tick only what it shows. For each one, give the lowest and highest the slider reaches and the value the game starts it on.
      The numbers below are placeholders: the games have used different scales, so they have to come from your garage.
      Untick anything this class doesn't offer.</p>
    <label class="check verify">
      <input type="checkbox" name="ranges_verified" value="1"<?= $bike['ranges_verified'] ? ' checked' : '' ?>>
      I checked these against my garage
    </label>
    <p class="hint">The advice stays switched off until this is ticked, because it works out step sizes from these ranges.</p>
    <div class="bulk">
      <strong>Same scale for everything?</strong>
      <label class="field">Lowest <input type="number" data-bulk-min></label>
      <label class="field">Highest <input type="number" data-bulk-max></label>
      <label class="field">Default <span class="hint">optional</span> <input type="number" data-bulk-default></label>
      <button type="button" class="btn btn-small" data-bulk-apply>Apply to ticked settings</button>
    </div>
    <?php
    $byGroup = [];
    foreach ($numeric as $key => $def) {
        $byGroup[$def['group']][$key] = $def;
    }
    foreach ($byGroup as $group => $defs): ?>
      <h3><?= e($MOTO['groups'][$group]) ?></h3>
      <?php foreach ($defs as $key => $def): $r = $rows[$key] ?? ['on' => 0, 'min' => $MOTO['model']['seed_range']['min'], 'max' => $MOTO['model']['seed_range']['max'], 'default' => $MOTO['model']['seed_range']['default'], 'flip' => 0]; ?>
        <div class="setting<?= $r['on'] ? '' : ' off' ?>">
          <label class="check"><input type="checkbox" class="setting-toggle" name="s[<?= $key ?>][on]" value="1"<?= $r['on'] ? ' checked' : '' ?>> <?= e($def['label']) ?></label>
          <label class="field">Lowest <input type="number" name="s[<?= $key ?>][min]" value="<?= e($r['min']) ?>"></label>
          <label class="field">Highest <input type="number" name="s[<?= $key ?>][max]" value="<?= e($r['max']) ?>"></label>
          <label class="field">Game default <input type="number" name="s[<?= $key ?>][default]" value="<?= e($r['default']) ?>"></label>
          <label class="flip"><input type="checkbox" name="s[<?= $key ?>][flip]" value="1"<?= $r['flip'] ? ' checked' : '' ?>> Reversed</label>
        </div>
      <?php endforeach; ?>
    <?php endforeach; ?>
    <p class="hint">Reversed: tick this if a higher number does the opposite of what the garage's own description says on this bike. Most never need it.</p>
  </section>

  <section>
    <h2>Brake discs and tyres</h2>
    <p class="hint">List what the garage offers, <strong>smallest disc first</strong> and <strong>softest tyre first</strong>. The model uses the order, the size and the type to pick between them.</p>
    <?php foreach (MG_LISTS as $key => $label): ?>
      <h3><?= e($label) ?></h3>
      <div data-rows="<?= $key ?>">
        <?php foreach ($lists[$key] as $i => $row) { $listRow($key, (string) $i, $row); } ?>
        <?php if (!$lists[$key]) { $listRow($key, '0', []); } ?>
      </div>
      <template data-template="<?= $key ?>"><?php $listRow($key, '__i__', []); ?></template>
      <button type="button" class="btn btn-small" data-add-row="<?= $key ?>">Add another</button>
    <?php endforeach; ?>
  </section>

  <div class="actions">
    <button class="btn btn-primary">Save bike</button>
    <a class="btn" href="moto_bikes.php">Cancel</a>
    <?php if (!$isNew): ?>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate data-confirm="Delete this bike and every setup and session recorded on it?">Delete bike</button>
    <?php endif; ?>
  </div>
</form>
<?php page_footer();
