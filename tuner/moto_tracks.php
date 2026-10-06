<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

// The 22 circuits in MotoGP 26 (RacingGames' launch track list). Earlier games differ a little: delete or add as needed.
const MG_SEED_TRACKS = [
    'Chang International Circuit' => 'Thailand', 'Autódromo Internacional Ayrton Senna (Goiânia)' => 'Brazil', 'Circuit of the Americas' => 'United States',
    'Circuito de Jerez' => 'Spain', 'Circuit Bugatti, Le Mans' => 'France', 'Circuit de Barcelona-Catalunya' => 'Spain', 'Mugello Circuit' => 'Italy',
    'Balaton Park Circuit' => 'Hungary', 'Brno Circuit' => 'Czechia', 'TT Circuit Assen' => 'Netherlands', 'Sachsenring Circuit' => 'Germany',
    'Silverstone Circuit' => 'England', 'MotorLand Aragón' => 'Spain', 'Misano World Circuit Marco Simoncelli' => 'Italy', 'Red Bull Ring (Spielberg)' => 'Austria',
    'Mobility Resort Motegi' => 'Japan', 'Pertamina Mandalika International Circuit' => 'Indonesia', 'Phillip Island Grand Prix Circuit' => 'Australia',
    'Sepang International Circuit' => 'Malaysia', 'Lusail International Circuit' => 'Qatar', 'Autódromo Internacional do Algarve (Portimão)' => 'Portugal',
    'Circuit Ricardo Tormo, Valencia' => 'Spain',
];
$id = $_GET['id'] ?? null;

if (is_post() && isset($_POST['seed'])) {
    $added = 0;
    foreach (MG_SEED_TRACKS as $name => $country) {
        $added += q('INSERT IGNORE INTO mg_tracks (name, country) VALUES (?, ?)', [$name, $country])->rowCount();
    }
    flash($added ? "Added $added circuits. Open each one and fill in what you know: the model uses the corner counts, braking zones and ratings." : 'Every circuit was already there.');
    redirect('moto_tracks.php');
}

// ---------------------------------------------------------------- list
if ($id === null) {
    $tracks = q('SELECT t.*, (SELECT COUNT(*) FROM mg_setups s WHERE s.track_id = t.id) AS setups FROM mg_tracks t ORDER BY t.name')->fetchAll();
    page_header('Tracks', 'moto_tracks');
    page_head('Tracks', ['actions' => '<a class="btn btn-primary" href="moto_tracks.php?id=new">Add a track</a>']);
    ?>
    <section>
      <h2>Circuits <span class="count"><?= count($tracks) ?></span></h2>
    <?php if (!$tracks): ?>
      <p class="empty">No tracks yet.</p>
      <form method="post" class="step-row"><?= csrf_field() ?><button class="btn btn-primary" name="seed" value="1">Add the 22 MotoGP 26 circuits</button>
        <span class="hint">Adds names and countries only. You fill in the rest.</span></form>
    <?php else: ?>
      <div class="table-wrap"><table>
        <thead><tr><th>Track</th><th>Country</th><th class="num">Corners slow / med / fast</th><th class="num">Big braking</th><th class="num">Setups</th></tr></thead>
        <tbody>
        <?php foreach ($tracks as $t): $filled = $t['slow_corners'] !== null || $t['big_braking_zones'] !== null; ?>
          <tr>
            <td><a href="moto_tracks.php?id=<?= (int) $t['id'] ?>"><?= e($t['name']) ?></a><?= $filled ? '' : ' <span class="chip chip-orange">To fill in</span>' ?></td>
            <td><?= e($t['country']) ?></td>
            <td class="num"><?= $t['slow_corners'] === null ? '' : (int) $t['slow_corners'] . ' / ' . (int) $t['medium_corners'] . ' / ' . (int) $t['fast_corners'] ?></td>
            <td class="num"><?= $t['big_braking_zones'] ?? '' ?></td>
            <td class="num"><?= (int) $t['setups'] ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table></div>
      <form method="post" class="step-row"><?= csrf_field() ?><button class="btn btn-small" name="seed" value="1">Add any missing MotoGP 26 circuits</button></form>
    <?php endif; ?>
    </section>
    <?php
    page_footer();
    exit;
}

// ---------------------------------------------------------------- form
$isNew = $id === 'new';
$track = ['name' => '', 'country' => '', 'length_m' => '', 'slow_corners' => '', 'medium_corners' => '', 'fast_corners' => '', 'big_braking_zones' => '',
          'quick_braking_zones' => '', 'straight_rating' => 3, 'avg_speed_rating' => 3, 'bumpiness' => 3, 'front_wear_rating' => 3, 'rear_wear_rating' => 3, 'notes' => ''];
if (!$isNew) {
    $track = q('SELECT * FROM mg_tracks WHERE id = ?', [(int) $id])->fetch() ?: redirect('moto_tracks.php');
}
$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM mg_tracks WHERE id = ?', [(int) $id]);
        flash('Track deleted.');
        redirect('moto_tracks.php');
    }
    $data = [
        'name' => in_str($_POST, 'name', 'Track name', $errors, true, 100),
        'country' => in_str($_POST, 'country', 'Country', $errors, false, 40),
        'length_m' => in_num($_POST, 'length_m', 'Length', $errors, false, 500, 20000),
        'slow_corners' => in_num($_POST, 'slow_corners', 'Slow corners', $errors, false, 0, 60),
        'medium_corners' => in_num($_POST, 'medium_corners', 'Medium corners', $errors, false, 0, 60),
        'fast_corners' => in_num($_POST, 'fast_corners', 'Fast corners', $errors, false, 0, 60),
        'big_braking_zones' => in_num($_POST, 'big_braking_zones', 'Big braking zones', $errors, false, 0, 30),
        'quick_braking_zones' => in_num($_POST, 'quick_braking_zones', 'Braking zones in quick succession', $errors, false, 0, 30),
        'straight_rating' => in_num($_POST, 'straight_rating', 'Straights', $errors, true, 1, 5),
        'avg_speed_rating' => in_num($_POST, 'avg_speed_rating', 'Average speed', $errors, true, 1, 5),
        'bumpiness' => in_num($_POST, 'bumpiness', 'Bumpiness', $errors, true, 1, 5),
        'front_wear_rating' => in_num($_POST, 'front_wear_rating', 'Front tyre wear', $errors, true, 1, 5),
        'rear_wear_rating' => in_num($_POST, 'rear_wear_rating', 'Rear tyre wear', $errors, true, 1, 5),
        'notes' => in_str($_POST, 'notes', 'Notes', $errors, false, 5000),
    ];
    $track = array_merge($track, $_POST);
    if (!$errors) {
        try {
            if ($isNew) {
                q('INSERT INTO mg_tracks (' . implode(', ', array_keys($data)) . ') VALUES (' . implode(', ', array_fill(0, count($data), '?')) . ')', array_values($data));
            } else {
                q('UPDATE mg_tracks SET ' . implode(', ', array_map(fn ($c) => "$c = ?", array_keys($data))) . ' WHERE id = ?', [...array_values($data), (int) $id]);
            }
            flash('Track saved.');
            redirect('moto_tracks.php');
        } catch (PDOException $ex) {
            $errors[] = $ex->getCode() === '23000' ? 'A track with this name already exists.' : 'The database refused this: ' . $ex->getMessage();
        }
    }
}
$rating = fn (string $name, string $label, string $low, string $high) => sprintf(
    '<label class="field">%s <span class="hint">1 %s, 5 %s</span><input type="number" name="%s" min="1" max="5" value="%s" required></label>',
    e($label), e($low), e($high), $name, e($track[$name]));
$count = fn (string $name, string $label, string $hint = '') => sprintf(
    '<label class="field">%s%s<input type="number" name="%s" min="0" value="%s"></label>',
    e($label), $hint ? ' <span class="hint">' . e($hint) . '</span>' : '', $name, e($track[$name]));

page_header($isNew ? 'Add a track' : $track['name'], 'moto_tracks');
page_head($isNew ? 'Add a track' : (string) $track['name'], ['crumb' => ['moto_tracks.php', 'Tracks'], 'lede' => e($track['country'] ?? '')]);
show_errors($errors);
?>
<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>Circuit</h2>
    <div class="grid">
      <label class="field span-2">Track name <input name="name" value="<?= e($track['name']) ?>" required maxlength="100"></label>
      <label class="field">Country <input name="country" value="<?= e($track['country']) ?>" maxlength="40"></label>
      <label class="field">Length <span class="unit">m</span> <input type="number" name="length_m" min="500" value="<?= e($track['length_m']) ?>"></label>
    </div>
  </section>
  <section>
    <h2>Corners and braking</h2>
    <p class="hint">Count them from a lap in the game or a track map. Leave blank what you don't know and the model uses a middle value.</p>
    <div class="grid">
      <?= $count('slow_corners', 'Slow corners', 'tight, first or second gear') ?>
      <?= $count('medium_corners', 'Medium corners') ?>
      <?= $count('fast_corners', 'Fast corners', 'flat out or nearly') ?>
      <?= $count('big_braking_zones', 'Big braking zones', 'hard stops from high speed') ?>
      <?= $count('quick_braking_zones', 'Braking zones in quick succession', 'little time to cool') ?>
    </div>
  </section>
  <section>
    <h2>How it feels</h2>
    <div class="grid">
      <?= $rating('straight_rating', 'Long straights', 'none', 'very long') ?>
      <?= $rating('avg_speed_rating', 'Average speed', 'tight and slow', 'fast and flowing') ?>
      <?= $rating('bumpiness', 'Bumpiness', 'smooth', 'very bumpy') ?>
      <?= $rating('front_wear_rating', 'Front tyre wear', 'easy on it', 'very hard on it') ?>
      <?= $rating('rear_wear_rating', 'Rear tyre wear', 'easy on it', 'very hard on it') ?>
    </div>
    <label class="field">Notes <textarea name="notes" rows="2"><?= e($track['notes']) ?></textarea></label>
  </section>
  <div class="actions">
    <button class="btn btn-primary">Save track</button>
    <a class="btn" href="moto_tracks.php">Cancel</a>
    <?php if (!$isNew): ?><button class="btn btn-danger" name="delete" value="1" formnovalidate data-confirm="Delete this track and every setup and session recorded on it?">Delete track</button><?php endif; ?>
  </div>
</form>
<?php page_footer();
