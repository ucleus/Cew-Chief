<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

const MG_PURPOSES = ['PRACTICE' => 'Practice', 'QUALI' => 'Qualifying', 'SPRINT' => 'Sprint', 'RACE' => 'Race', 'WET' => 'Wet'];
$id = $_GET['id'] ?? null;

// ---------------------------------------------------------------- list
if ($id === null) {
    $setups = q('SELECT s.id, s.name, s.version, s.purpose, b.name AS bike, b.game, t.name AS track, p.session_count, p.best_lap_ms
                 FROM mg_setups s JOIN mg_bikes b ON b.id = s.bike_id JOIN mg_tracks t ON t.id = s.track_id JOIN v_mg_setup_progress p ON p.setup_id = s.id
                 ORDER BY b.name, t.name, s.version DESC')->fetchAll();
    page_header('Setups', 'moto_setups');
    page_head('Setups', ['actions' => '<a class="btn btn-primary" href="moto_setups.php?id=new">Enter a setup</a>']);
    ?>
    <section>
      <h2>Every version <span class="count"><?= count($setups) ?></span></h2>
    <?php if (!$setups): ?>
      <p class="empty">No setups yet. Enter the one you are starting from, then log a session on it.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Setup</th><th>Bike</th><th>Track</th><th>For</th><th class="num">Sessions</th><th class="num">Best lap</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($setups as $s): ?>
          <tr>
            <td><a href="moto_setups.php?id=<?= (int) $s['id'] ?>">v<?= (int) $s['version'] ?> <?= e($s['name']) ?></a></td>
            <td><?= e($s['bike']) ?> <span class="muted"><?= e($s['game']) ?></span></td><td><?= e($s['track']) ?></td><td><?= MG_PURPOSES[$s['purpose']] ?></td>
            <td class="num"><?= (int) $s['session_count'] ?></td>
            <td class="num"><?= $s['best_lap_ms'] ? RaceMath::formatLap((int) $s['best_lap_ms']) : '' ?></td>
            <td><a class="btn btn-small" href="moto_sessions.php?id=new&amp;setup_id=<?= (int) $s['id'] ?>">Log a session</a></td>
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
$setup = ['name' => '', 'purpose' => 'RACE', 'change_summary' => '', 'notes' => '', 'parent_setup_id' => null, 'version' => 1];
$state = ['values' => [], 'choices' => []];
$reasons = [];
$parent = null;
$sessionCount = 0;

if ($isNew) {
    $from = (int) ($_GET['from'] ?? 0);
    if ($from) {
        $parent = q('SELECT * FROM mg_setups WHERE id = ?', [$from])->fetch() ?: redirect('moto_setups.php');
        $state = mg_setup_state($from);
        $state['choices'] = array_map(fn ($o) => (int) $o['id'], $state['choices']);
        $setup = array_merge($setup, ['name' => $parent['name'], 'purpose' => $parent['purpose'], 'notes' => $parent['notes'], 'parent_setup_id' => $parent['id']]);
    }
    $bikeId = (int) ($parent['bike_id'] ?? $_GET['bike_id'] ?? 0);
    $trackId = (int) ($parent['track_id'] ?? $_GET['track_id'] ?? 0);
    if (!$bikeId || !$trackId) {
        $bikes = q("SELECT id, CONCAT(name, ' (', game, ', ', class, ')') FROM mg_bikes ORDER BY name")->fetchAll(PDO::FETCH_KEY_PAIR);
        $tracks = q('SELECT id, name FROM mg_tracks ORDER BY name')->fetchAll(PDO::FETCH_KEY_PAIR);
        page_header('Enter a setup', 'moto_setups');
        page_head('Enter a setup', ['crumb' => ['moto_setups.php', 'Setups']]);
        ?>
        <section>
          <h2>Bike, track and starting point</h2>
        <?php if (!$bikes || !$tracks): ?>
          <p class="empty">A setup needs a bike and a track.
            <?php if (!$bikes): ?><a href="moto_bikes.php?id=new">Add a bike</a><?php endif; ?>
            <?php if (!$tracks): ?><a href="moto_tracks.php">Add the tracks</a><?php endif; ?></p>
        <?php else: ?>
          <form method="get" class="narrow">
            <input type="hidden" name="id" value="new">
            <label class="field">Bike <select name="bike_id" required><?= options($bikes, null, 'Choose a bike') ?></select></label>
            <label class="field">Track <select name="track_id" required><?= options($tracks, null, 'Choose a track') ?></select></label>
            <div class="choices" role="radiogroup" aria-label="Start from">
              <label class="check"><input type="radio" name="start" value="defaults" checked> Start from the game's defaults</label>
              <label class="check"><input type="radio" name="start" value="baseline"> Start from the model's starting point for this track</label>
            </div>
            <label class="field">Track temperature <span class="unit">°C</span> <span class="hint">optional, helps the tyre pick</span>
              <input type="number" step="any" name="temp"></label>
            <div class="form-end"><button class="btn btn-primary">Continue</button></div>
          </form>
        <?php endif; ?>
        </section>
        <?php
        page_footer();
        exit;
    }
} else {
    $setup = q('SELECT * FROM mg_setups WHERE id = ?', [(int) $id])->fetch() ?: redirect('moto_setups.php');
    $bikeId = (int) $setup['bike_id'];
    $trackId = (int) $setup['track_id'];
    $state = mg_setup_state((int) $id);
    $state['choices'] = array_map(fn ($o) => (int) $o['id'], $state['choices']);
    $sessionCount = (int) q('SELECT COUNT(*) FROM mg_sessions WHERE setup_id = ?', [(int) $id])->fetchColumn();
}

$bike = q('SELECT * FROM mg_bikes WHERE id = ?', [$bikeId])->fetch() ?: redirect('moto_setups.php');
$track = q('SELECT * FROM mg_tracks WHERE id = ?', [$trackId])->fetch() ?: redirect('moto_setups.php');
$params = mg_bike_params($bikeId);
$options = mg_bike_options($bikeId);
$locked = $sessionCount > 0;

// A fresh setup: the game's defaults, or the model's starting point.
if ($isNew && !$parent) {
    if (($_GET['start'] ?? '') === 'baseline') {
        $temp = ($_GET['temp'] ?? '') !== '' && is_numeric($_GET['temp']) ? (float) $_GET['temp'] : null;
        $base = mg_baseline($bikeId, $track, $temp);
        $state = ['values' => $base['values'], 'choices' => $base['choices']];
        $reasons = $base['reasons'];
        $setup['name'] = 'Starting point';
        $setup['change_summary'] = 'Model starting point for ' . $track['name'];
    } else {
        foreach ($params as $key => $p) {
            $state['values'][$key] = (int) $p['default_value'];
        }
        foreach (['tyre_front', 'tyre_rear', 'front_disc', 'rear_disc'] as $key) {
            if (!empty($options[$key])) {
                // The middle dry compound; a bike that lists only wet tyres starts on those.
                $pool = (str_starts_with($key, 'tyre') ? mg_dry($options[$key]) : $options[$key]) ?: $options[$key];
                $state['choices'][$key] = (int) $pool[(int) floor((count($pool) - 1) / 2)]['id'];
            }
        }
    }
}

// ---------------------------------------------------------------- save
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM mg_setups WHERE id = ?', [(int) $id]);
        flash('Setup deleted.');
        redirect('moto_setups.php');
    }
    if ($locked) {
        flash('This setup has sessions on it, so it stays as it was run. Create the next version to change it.', 'warn');
        redirect('moto_setups.php?id=' . (int) $id);
    }
    $data = [
        'name' => in_str($_POST, 'name', 'Setup name', $errors, true, 100),
        'purpose' => in_enum($_POST, 'purpose', array_keys(MG_PURPOSES)),
        'change_summary' => in_str($_POST, 'change_summary', 'What changed', $errors, false, 255),
        'notes' => in_str($_POST, 'notes', 'Notes', $errors, false, 5000),
    ];
    $values = [];
    foreach ($params as $key => $p) {
        $v = in_num((array) ($_POST['v'] ?? []), $key, mg_label($key), $errors, true, (float) $p['min_value'], (float) $p['max_value']);
        if ($v !== null && abs($v - round($v)) > 1e-9) {
            $errors[] = mg_label($key) . ' must be a whole number.';
        }
        $values[$key] = (int) round((float) $v);
    }
    $choices = [];
    foreach (['tyre_front', 'tyre_rear', 'front_disc', 'rear_disc'] as $key) {
        if (empty($options[$key])) {
            continue;
        }
        $pick = (int) ($_POST['c'][$key] ?? 0);
        if (!in_array($pick, array_map(fn ($o) => (int) $o['id'], $options[$key]), true)) {
            $errors[] = mg_label($key) . ': choose one of the options.';
        }
        $choices[$key] = $pick;
    }
    $setup = array_merge($setup, $data);
    $state = ['values' => $values, 'choices' => $choices];
    if (!$errors) {
        try {
            db()->beginTransaction();
            if ($isNew) {
                $version = (int) q('SELECT COALESCE(MAX(version), 0) + 1 FROM mg_setups WHERE bike_id = ? AND track_id = ?', [$bikeId, $trackId])->fetchColumn();
                q('INSERT INTO mg_setups (bike_id, track_id, parent_setup_id, version, name, purpose, change_summary, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$bikeId, $trackId, $parent['id'] ?? null, $version, $data['name'], $data['purpose'], $data['change_summary'], $data['notes']]);
                $setupId = (int) db()->lastInsertId();
            } else {
                $setupId = (int) $id;
                q('UPDATE mg_setups SET name = ?, purpose = ?, change_summary = ?, notes = ? WHERE id = ?', [$data['name'], $data['purpose'], $data['change_summary'], $data['notes'], $setupId]);
                q('DELETE FROM mg_setup_values WHERE setup_id = ?', [$setupId]);
                q('DELETE FROM mg_setup_choices WHERE setup_id = ?', [$setupId]);
            }
            foreach ($values as $key => $v) {
                q('INSERT INTO mg_setup_values (setup_id, param_key, value) VALUES (?, ?, ?)', [$setupId, $key, $v]);
            }
            foreach ($choices as $key => $optionId) {
                q('INSERT INTO mg_setup_choices (setup_id, param_key, option_id) VALUES (?, ?, ?)', [$setupId, $key, $optionId]);
            }
            db()->commit();
            flash('Setup saved.');
            redirect('moto_setups.php?id=' . $setupId);
        } catch (PDOException $ex) {
            db()->rollBack();
            $errors[] = 'The database refused this: ' . $ex->getMessage();
        }
    }
}

$title = $isNew ? ($parent ? 'Next version of ' . $parent['name'] : 'Enter a setup') : 'v' . $setup['version'] . ' ' . $setup['name'];
$readouts = [];
if (!$isNew) {
    $moved = count(array_filter(array_keys($params), fn ($k) => isset($state['values'][$k]) && (int) $state['values'][$k] !== (int) $params[$k]['default_value']));
    $readouts = [
        ['Sessions', (string) $sessionCount, $locked ? 'Locked as it was ridden' : 'Not ridden yet', $locked ? '' : 'cyan'],
        ['Best lap', lap_text(q('SELECT MIN(best_lap_ms) FROM mg_sessions WHERE setup_id = ?', [(int) $id])->fetchColumn()), 'On this version', 'teal'],
        ['Off default', $moved . ' of ' . count($params), 'Sliders moved from the game\'s default', $moved ? 'orange' : ''],
        ['For', MG_PURPOSES[$setup['purpose']] ?? '', ''],
    ];
}
page_header($title, 'moto_setups');
page_head($title, [
    'crumb' => ['moto_setups.php', 'Setups'],
    'lede' => e($bike['name']) . ' <span class="muted">' . e($bike['game']) . ', ' . e($bike['class']) . '</span> at ' . e($track['name']),
    'readouts' => $readouts,
]);
show_errors($errors);
// Groups and settings in the catalog's order, the same order as the bike form, not the database's.
$byGroup = [];
foreach ($MOTO['params'] as $key => $def) {
    if (isset($params[$key])) {
        $byGroup[$def['group']][] = $key;
    }
}
?>

<?php if ($locked): ?>
  <div class="notice notice-warn"><?= $sessionCount ?> <?= $sessionCount === 1 ? 'session was' : 'sessions were' ?> run on this setup, so it stays exactly as it was ridden.
    To change anything, <a href="moto_setups.php?id=new&amp;from=<?= (int) $id ?>">create the next version</a>.</div>
<?php endif; ?>

<?php if ($reasons): ?>
  <section class="calc" data-tag="Model">
    <h2>Why these values</h2>
    <p class="hint">The game's defaults, moved only where the guides agree: tyres, front disc, final ratio, gearing and bump compliance. Suspension and geometry stay on the defaults: the guides disagree about them track to track, so they are tuned from what the bike feels like. Change anything below before saving.</p>
    <dl>
      <?php
      $shown = [];
      $gears = [];
      foreach ($reasons as $key => $why) {
          if (str_starts_with($key, 'gear_')) {
              $gears[substr($key, 5)] = $why;
          } else {
              $shown[mg_label($key)] = $why;
          }
      }
      if ($gears) {
          $texts = array_unique(array_values($gears));
          $shown['Gear' . (count($gears) > 1 ? 's ' : ' ') . implode(', ', array_keys($gears))] = count($texts) === 1 ? $texts[0] : implode(' ', array_map(fn ($n, $t) => "Gear $n: $t", array_keys($gears), $gears));
      }
      foreach ($shown as $label => $why): ?><div><dt><?= e($label) ?></dt><dd><?= e($why) ?></dd></div><?php endforeach; ?>
    </dl>
  </section>
<?php endif; ?>

<form method="post">
  <?= csrf_field() ?>
  <fieldset class="plain"<?= $locked ? ' disabled' : '' ?>>
  <section>
    <h2>Setup</h2>
    <div class="grid">
      <label class="field span-2">Setup name <input name="name" value="<?= e($setup['name']) ?>" required maxlength="100" placeholder="Race baseline"></label>
      <label class="field">For <select name="purpose"><?= options(MG_PURPOSES, $setup['purpose']) ?></select></label>
      <?php if ($parent || $reasons || !empty($setup['parent_setup_id'])): ?>
        <label class="field span-3">What changed from the last version
          <input name="change_summary" value="<?= e($setup['change_summary']) ?>" maxlength="255"></label>
      <?php endif; ?>
    </div>
  </section>

  <?php foreach ($byGroup as $group => $keys): ?>
    <section>
      <h2><?= e($MOTO['groups'][$group]) ?> <span class="count"><?= count($keys) ?></span></h2>
      <div class="sliders">
        <?php foreach ($keys as $key):
            $p = $params[$key];
            [$min, $max, $def] = [(int) $p['min_value'], (int) $p['max_value'], (int) $p['default_value']];
            $v = $state['values'][$key] ?? '';
            $at = fn (float $x): float => round(($x - $min) / max(1, $max - $min), 4); ?>
          <div class="slider<?= $v !== '' && (int) $v !== $def ? ' is-changed' : '' ?>" data-default="<?= $def ?>">
            <div class="slider-head">
              <label class="slider-name" for="v-<?= $key ?>"><?= e(mg_label($key)) ?></label>
              <input id="v-<?= $key ?>" type="number" name="v[<?= $key ?>]" value="<?= e($v) ?>" required
                     min="<?= $min ?>" max="<?= $max ?>" step="<?= max(1, (int) $p['step_value']) ?>">
            </div>
            <input type="range" min="<?= $min ?>" max="<?= $max ?>" step="<?= max(1, (int) $p['step_value']) ?>" value="<?= e($v === '' ? $def : $v) ?>"
                   data-slider-for="v-<?= $key ?>" tabindex="-1" aria-hidden="true" style="--f:<?= $at($v === '' ? $def : (float) $v) ?>;--d:<?= $at($def) ?>">
            <div class="slider-scale"><span><?= $min ?></span><span>Default <b><?= $def ?></b></span><span><?= $max ?></span></div>
          </div>
        <?php endforeach; ?>
      </div>
    </section>
  <?php endforeach; ?>

  <?php $hasLists = array_filter(['front_disc', 'rear_disc', 'tyre_front', 'tyre_rear'], fn ($k) => !empty($options[$k])); ?>
  <?php if ($hasLists): ?>
  <section>
    <h2>Brakes and tyres</h2>
    <div class="choice-grid">
      <?php foreach ($hasLists as $key):
          // Every option the garage lists, wet tyres included: the model only picks dry ones, but a wet setup needs its tyre.
          $labels = [];
          foreach ($options[$key] as $o) {
              $labels[$o['id']] = $o['label'] . (($o['kind'] ?? '') === 'WET' && stripos($o['label'], 'wet') === false ? ' (wet)' : '');
          } ?>
        <label class="field"><?= e(mg_label($key)) ?>
          <select name="c[<?= $key ?>]"><?= options($labels, $state['choices'][$key] ?? null) ?></select>
          <?php if (isset($reasons[$key])): ?><span class="reason"><?= e($reasons[$key]) ?></span><?php endif; ?>
        </label>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <section>
    <h2>Notes</h2>
    <label class="field">Anything worth remembering <textarea name="notes" rows="3"><?= e($setup['notes']) ?></textarea></label>
  </section>
  </fieldset>

  <div class="actions">
    <?php if (!$locked): ?><button class="btn btn-primary">Save setup</button><?php endif; ?>
    <?php if (!$isNew): ?>
      <a class="btn<?= $locked ? ' btn-primary' : '' ?>" href="moto_sessions.php?id=new&amp;setup_id=<?= (int) $id ?>">Log a session</a>
      <a class="btn" href="moto_setups.php?id=new&amp;from=<?= (int) $id ?>">Create the next version</a>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate data-confirm="Delete this setup and the <?= $sessionCount ?> session(s) run on it?">Delete setup</button>
    <?php else: ?><a class="btn" href="moto_setups.php">Cancel</a><?php endif; ?>
  </div>
</form>
<?php page_footer();
