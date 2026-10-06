<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$id = (int) ($_GET['id'] ?? 0);
$rec = q('SELECT r.*, st.setup_id, st.run_at, s.name AS setup, s.version, c.name AS car, t.name AS track
          FROM recommendations r
          JOIN stints st ON st.id = r.stint_id
          JOIN setups s ON s.id = st.setup_id
          JOIN cars c ON c.id = s.car_id
          JOIN tracks t ON t.id = s.track_id
          WHERE r.id = ?', [$id])->fetch() ?: redirect('stints.php');

if (is_post()) {
    if (isset($_POST['reject'])) {
        q("UPDATE recommendations SET status = 'REJECTED' WHERE id = ? AND applied_setup_id IS NULL", [$id]);
        flash('Advice set aside. Nothing on the car changed.');
        redirect('stints.php?id=' . (int) $rec['stint_id']);
    }
    try {
        $newId = engineer_apply($id, (array) ($_POST['items'] ?? []));
        flash('Next version created with the ticked changes. Check it over, then put it on the car.');
        redirect('setups.php?id=' . $newId);
    } catch (RuntimeException $ex) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }
        flash($ex->getMessage(), 'error');
        redirect('advice.php?id=' . $id);
    }
}

$items = q('SELECT * FROM recommendation_items WHERE recommendation_id = ? ORDER BY priority, id', [$id])->fetchAll();
$full = json_decode((string) $rec['response_json'], true) ?: [];
$open = $rec['applied_setup_id'] === null && $rec['status'] !== 'REJECTED';

page_header('Engineer\'s advice', 'stints');
page_head('Engineer\'s advice', [
    'crumb' => ['stints.php?id=' . (int) $rec['stint_id'], 'Stint on ' . when($rec['run_at'])],
    'lede' => e($rec['car']) . ' at ' . e($rec['track']) . ', after running v' . (int) $rec['version'] . ' ' . e($rec['setup']) . '. From '
        . e(PROVIDER_NAMES[$rec['provider']]) . ' <span class="muted">(' . e($rec['model']) . ')</span>.',
    'aside' => hud_gauge(['LOW' => 1 / 3, 'MEDIUM' => 2 / 3, 'HIGH' => 1.0][$rec['confidence']],
        ['LOW' => 'Low', 'MEDIUM' => 'Med', 'HIGH' => 'High'][$rec['confidence']], '', 'Confidence', $rec['confidence'] === 'LOW' ? '' : 'cyan'),
]);
?>

<?php if ($rec['applied_setup_id']): ?>
  <div class="notice notice-ok">This advice became <a href="setups.php?id=<?= (int) $rec['applied_setup_id'] ?>">the next setup version</a>.</div>
<?php elseif ($rec['status'] === 'REJECTED'): ?>
  <div class="notice">This advice was set aside.</div>
<?php endif; ?>

<section class="calc" data-tag="Engineer">
  <h2>Diagnosis</h2>
  <p class="prose"><?= nl2br(e($rec['diagnosis'])) ?></p>
  <?php if (!empty($full['data_quality_flags'])): ?>
    <div class="notice notice-warn">
      <p>The data behind this is weaker than it looks:</p>
      <ul><?php foreach ($full['data_quality_flags'] as $flag): ?><li><?= e($flag) ?></li><?php endforeach; ?></ul>
    </div>
  <?php endif; ?>
</section>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>Changes to test <span class="count"><?= count($items) ?></span></h2>
    <?php if (!$items): ?>
      <p class="empty">No changes recommended from this stint.</p>
    <?php endif; ?>
    <div class="change-list">
    <?php foreach ($items as $item):
        $head = '<span class="change-head"><span><span class="change-where">' . e(SCOPE_LABELS[$item['scope']] ?: 'Whole car') . '</span>'
            . '<span class="change-name">' . e($PARAMS[$item['param_key']]['label'] ?? $item['param_key']) . '</span></span>'
            . '<span class="change-move"><span class="from">' . e(nf($item['current_value'])) . '</span><span class="arrow" aria-hidden="true">&#9656;</span><span class="visually-hidden"> to </span>'
            . '<span class="to">' . e(nf($item['suggested_value'])) . '</span><span class="unit">' . e($item['unit']) . '</span></span></span>'; ?>
      <div class="change<?= $open ? ' is-open' : '' ?>">
        <?php if ($open): ?>
          <label class="change-pick"><input type="checkbox" name="items[]" value="<?= (int) $item['id'] ?>" checked><?= $head ?></label>
        <?php else: ?>
          <?= $head ?>
        <?php endif; ?>
        <div class="change-meta">
          <?php if ($item['source'] === 'MATH'): ?><span class="chip chip-solid">From the calculator</span>
          <?php elseif ((int) $item['priority'] === 1): ?><span class="chip chip-orange">Main change</span>
          <?php else: ?><span class="chip chip-muted">Secondary</span><?php endif; ?>
          <?php if (!$open && $item['accepted'] !== null): ?><span class="chip<?= $item['accepted'] ? '' : ' chip-muted' ?>"><?= $item['accepted'] ? 'Applied' : 'Skipped' ?></span><?php endif; ?>
          <?php if ($item['addresses']): ?><span>For: <?= e($item['addresses']) ?></span><?php endif; ?>
        </div>
        <p><?= e($item['rationale']) ?></p>
        <?php if ($item['tradeoff']): ?><p class="cost"><b>It costs you</b><?= e($item['tradeoff']) ?></p><?php endif; ?>
      </div>
    <?php endforeach; ?>
    </div>
  </section>

  <section>
    <h2>What to expect</h2>
    <p class="prose"><?= nl2br(e($rec['expected_tradeoff'])) ?></p>
    <?php if (!empty($full['next_stint_focus'])): ?>
      <h3>On the next run</h3>
      <p class="prose"><?= nl2br(e($full['next_stint_focus'])) ?></p>
    <?php endif; ?>
    <?php if (!empty($full['unavailable_fixes'])): ?>
      <h3>Would help, but this car can't adjust it</h3>
      <ul class="prose"><?php foreach ($full['unavailable_fixes'] as $fix): ?><li><?= e($fix) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>
    <?php if (!empty($full['checker_notes'])): ?>
      <h3>Corrected before you saw it</h3>
      <ul class="prose"><?php foreach ($full['checker_notes'] as $note): ?><li><?= e($note) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </section>

  <?php if ($open): ?>
    <div class="actions">
      <?php if ($items): ?><button class="btn btn-primary">Create the next version with the ticked changes</button><?php endif; ?>
      <button class="btn btn-danger" name="reject" value="1">Set this advice aside</button>
    </div>
  <?php endif; ?>
</form>
<?php page_footer();
