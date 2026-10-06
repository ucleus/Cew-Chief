<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$id = $_GET['id'] ?? null;
$isNew = $id === null || $id === 'new';
$driver = ['name' => '', 'style_notes' => ''];
if (!$isNew) {
    $driver = q('SELECT * FROM drivers WHERE id = ?', [(int) $id])->fetch() ?: redirect('drivers.php');
}

$errors = [];
if (is_post()) {
    if (isset($_POST['delete']) && !$isNew) {
        q('DELETE FROM drivers WHERE id = ?', [(int) $id]);
        flash('Driver deleted. Their stints are kept without a driver name.');
        redirect('drivers.php');
    }
    $name  = in_str($_POST, 'name', 'Name', $errors, true, 80);
    $notes = in_str($_POST, 'style_notes', 'Driving style', $errors, false, 255);
    $driver = array_merge($driver, $_POST);
    if (!$errors) {
        if ($isNew) {
            q('INSERT INTO drivers (name, style_notes) VALUES (?, ?)', [$name, $notes]);
        } else {
            q('UPDATE drivers SET name = ?, style_notes = ? WHERE id = ?', [$name, $notes, (int) $id]);
        }
        flash('Driver saved.');
        redirect('drivers.php');
    }
}

$drivers = q('SELECT d.*, (SELECT COUNT(*) FROM stints s WHERE s.driver_id = d.id) AS stint_count
              FROM drivers d ORDER BY d.name')->fetchAll();

page_header('Drivers', 'drivers');
page_head('Drivers', ['lede' => 'Everyone who gives feedback after a stint. The AI engineer reads their driving style.']);
show_errors($errors);
?>
<section>
  <h2>Team <span class="count"><?= count($drivers) ?></span></h2>
<?php if ($drivers): ?>
  <div class="table-wrap"><table>
    <thead><tr><th>Driver</th><th>Driving style</th><th class="num">Stints</th></tr></thead>
    <tbody>
    <?php foreach ($drivers as $d): ?>
      <tr>
        <td><a href="drivers.php?id=<?= (int) $d['id'] ?>"><?= e($d['name']) ?></a></td>
        <td><?= e($d['style_notes']) ?></td>
        <td class="num"><?= (int) $d['stint_count'] ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
<?php else: ?>
  <p class="empty">No drivers yet. Add everyone who will give you feedback, yourself included.</p>
<?php endif; ?>
</section>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2><?= $isNew ? 'Add a driver' : 'Edit ' . e($driver['name']) ?></h2>
    <div class="grid">
      <label class="field">Name
        <input name="name" value="<?= e($driver['name']) ?>" required maxlength="80">
      </label>
      <label class="field span-2">Driving style <span class="hint">optional; the AI engineer reads this</span>
        <input name="style_notes" value="<?= e($driver['style_notes']) ?>" maxlength="255" placeholder="Brakes late, likes a car that rotates on entry">
      </label>
    </div>
  </section>
  <div class="actions">
    <button class="btn btn-primary">Save driver</button>
    <?php if (!$isNew): ?>
      <a class="btn" href="drivers.php">Cancel</a>
      <button class="btn btn-danger" name="delete" value="1" formnovalidate data-confirm="Delete this driver?">Delete driver</button>
    <?php endif; ?>
  </div>
</form>
<?php page_footer();
