<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

const DOWNFORCE = ['LOW', 'MEDIUM', 'HIGH', 'MAX'];
$id = $_GET['id'] ?? null;

// ---------------------------------------------------------------- list
if ($id === null) {
    $tracks = q('SELECT t.*, (SELECT COUNT(*) FROM setups s WHERE s.track_id = t.id) AS setup_count
                 FROM tracks t ORDER BY t.name, t.layout')->fetchAll();
    page_header('Tracks', 'tracks');
    page_head('Tracks', ['actions' => '<a class="btn btn-primary" href="tracks.php?id=new">Add a track</a>']);
    ?>
    <section>
      <h2>Saved tracks <span class="count"><?= count($tracks) ?></span></h2>
    <?php if (!$tracks): ?>
      <p class="empty">No tracks yet. Add the circuit you are testing at first.</p>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Track</th><th>Layout</th><th class="num">Length</th><th>Downforce</th><th class="num">Bumps</th><th class="num">Setups</th></tr></thead>
        <tbody>
        <?php foreach ($tracks as $t): ?>
          <tr>
            <td><a href="tracks.php?id=<?= (int) $t['id'] ?>"><?= e($t['name']) ?></a></td>
            <td><?= e($t['layout']) ?></td>
            <td class="num"><?= number_format((int) $t['length_m']) ?> m</td>
            <td><?= human($t['downforce_demand']) ?></td>
            <td class="num"><?= (int) $t['bumpiness'] ?>/5</td>
            <td class="num"><?= (int) $t['setup_count'] ?></td>
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

// ---------------------------------------------------------------- form
$isNew = $id === 'new';
$track = ['name' => '', 'layout' => 'Standard', 'ac_folder' => '', 'length_m' => '', 'direction' => 'CW',
          'downforce_demand' => 'MEDIUM', 'bumpiness' => 3, 'kerb_usage' => 3, 'slow_corners' => '',
          'medium_corners' => '', 'fast_corners' => '', 'longest_straight_m' => '', 'notes' => ''];
if (!$isNew) {
    $track = q('SELECT * FROM tracks WHERE id = ?', [(int) $id])->fetch() ?: redirect('tracks.php');
}

$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM tracks WHERE id = ?', [(int) $id]);
        flash('Track deleted.');
        redirect('tracks.php');
    }
    $data = [
        'name'               => in_str($_POST, 'name', 'Track name', $errors, true, 100),
        'layout'             => in_str($_POST, 'layout', 'Layout', $errors, false, 60) ?? 'Standard',
        'ac_folder'          => in_str($_POST, 'ac_folder', 'Game folder', $errors, false, 100),
        'length_m'           => in_num($_POST, 'length_m', 'Length', $errors, true, 100, 100000),
        'direction'          => in_enum($_POST, 'direction', ['CW', 'CCW']),
        'downforce_demand'   => in_enum($_POST, 'downforce_demand', DOWNFORCE),
        'bumpiness'          => in_num($_POST, 'bumpiness', 'Bumpiness', $errors, true, 1, 5),
        'kerb_usage'         => in_num($_POST, 'kerb_usage', 'Kerb use', $errors, true, 1, 5),
        'slow_corners'       => in_num($_POST, 'slow_corners', 'Slow corners', $errors, false, 0, 200),
        'medium_corners'     => in_num($_POST, 'medium_corners', 'Medium corners', $errors, false, 0, 200),
        'fast_corners'       => in_num($_POST, 'fast_corners', 'Fast corners', $errors, false, 0, 200),
        'longest_straight_m' => in_num($_POST, 'longest_straight_m', 'Longest straight', $errors, false, 0, 100000),
        'notes'              => in_str($_POST, 'notes', 'Notes', $errors, false, 5000),
    ];
    $track = array_merge($track, $_POST);

    if (!$errors) {
        try {
            if ($isNew) {
                $cols = implode(', ', array_keys($data));
                $marks = implode(', ', array_fill(0, count($data), '?'));
                q("INSERT INTO tracks ($cols) VALUES ($marks)", array_values($data));
            } else {
                $set = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data)));
                q("UPDATE tracks SET $set WHERE id = ?", [...array_values($data), (int) $id]);
            }
            flash('Track saved.');
            redirect('tracks.php');
        } catch (PDOException $ex) {
            $errors[] = $ex->getCode() === '23000'
                ? 'A track with this name and layout already exists.'
                : 'The database refused this: ' . $ex->getMessage();
        }
    }
}

page_header($isNew ? 'Add a track' : $track['name'], 'tracks');
page_head($isNew ? 'Add a track' : (string) $track['name'], ['crumb' => ['tracks.php', 'Tracks']]);
show_errors($errors);
?>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>Circuit</h2>
    <div class="grid">
      <label class="field span-2">Track name
        <input name="name" value="<?= e($track['name']) ?>" required maxlength="100">
      </label>
      <label class="field">Layout
        <input name="layout" value="<?= e($track['layout']) ?>" maxlength="60">
      </label>
      <label class="field">Length <span class="unit">m</span>
        <input name="length_m" type="number" inputmode="numeric" min="100" value="<?= e($track['length_m']) ?>" required>
      </label>
      <label class="field">Direction
        <select name="direction"><?= options(['CW' => 'Clockwise', 'CCW' => 'Counter-clockwise'], $track['direction']) ?></select>
      </label>
      <label class="field">Game folder <span class="hint">optional, for importing setup files later</span>
        <input name="ac_folder" value="<?= e($track['ac_folder']) ?>" maxlength="100" placeholder="ks_nurburgring">
      </label>
    </div>
  </section>

  <section>
    <h2>What it asks of the car</h2>
    <div class="grid">
      <label class="field">Downforce demand
        <select name="downforce_demand"><?= options(array_combine(DOWNFORCE, array_map('human', DOWNFORCE)), $track['downforce_demand']) ?></select>
      </label>
      <label class="field">Bumpiness <span class="hint">1 smooth, 5 very bumpy</span>
        <input name="bumpiness" type="number" inputmode="numeric" min="1" max="5" value="<?= e($track['bumpiness']) ?>" required>
      </label>
      <label class="field">Kerb use <span class="hint">1 avoid them, 5 they are the line</span>
        <input name="kerb_usage" type="number" inputmode="numeric" min="1" max="5" value="<?= e($track['kerb_usage']) ?>" required>
      </label>
      <label class="field">Longest straight <span class="unit">m</span>
        <input name="longest_straight_m" type="number" inputmode="numeric" min="0" value="<?= e($track['longest_straight_m']) ?>">
      </label>
      <label class="field">Slow corners <span class="hint">under 100 km/h</span>
        <input name="slow_corners" type="number" inputmode="numeric" min="0" value="<?= e($track['slow_corners']) ?>">
      </label>
      <label class="field">Medium corners
        <input name="medium_corners" type="number" inputmode="numeric" min="0" value="<?= e($track['medium_corners']) ?>">
      </label>
      <label class="field">Fast corners <span class="hint">over 180 km/h</span>
        <input name="fast_corners" type="number" inputmode="numeric" min="0" value="<?= e($track['fast_corners']) ?>">
      </label>
    </div>
    <label class="field">Notes
      <textarea name="notes" rows="3"><?= e($track['notes']) ?></textarea>
    </label>
  </section>

  <div class="actions">
    <button class="btn btn-primary">Save track</button>
    <a class="btn" href="tracks.php">Cancel</a>
    <?php if (!$isNew): ?>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate
              data-confirm="Delete this track and every setup and stint recorded on it?">Delete track</button>
    <?php endif; ?>
  </div>
</form>
<?php page_footer();
