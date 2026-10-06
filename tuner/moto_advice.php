<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

$id = (int) ($_GET['id'] ?? 0);
$rec = q('SELECT r.*, x.setup_id, x.run_at, s.name AS setup, s.version, b.name AS bike, t.name AS track
          FROM mg_recommendations r JOIN mg_sessions x ON x.id = r.session_id JOIN mg_setups s ON s.id = x.setup_id
          JOIN mg_bikes b ON b.id = s.bike_id JOIN mg_tracks t ON t.id = s.track_id WHERE r.id = ?', [$id])->fetch() ?: redirect('moto_sessions.php');

if (is_post()) {
    if (isset($_POST['reject'])) {
        q("UPDATE mg_recommendations SET status = 'REJECTED' WHERE id = ? AND applied_setup_id IS NULL", [$id]);
        flash('Advice set aside. Nothing on the bike changed.');
        redirect('moto_sessions.php?id=' . (int) $rec['session_id']);
    }
    try {
        $newId = mg_apply($id, (array) ($_POST['items'] ?? []));
        flash('Next version created with the ticked changes. Put it on the bike, then re-open the setup in the pit menu and check the values stuck.');
        redirect('moto_setups.php?id=' . $newId);
    } catch (RuntimeException $ex) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }
        flash($ex->getMessage(), 'error');
        redirect('moto_advice.php?id=' . $id);
    }
}

$items = q('SELECT * FROM mg_rec_items WHERE recommendation_id = ? ORDER BY priority, id', [$id])->fetchAll();
$full = json_decode((string) $rec['response_json'], true) ?: [];
$open = $rec['applied_setup_id'] === null && $rec['status'] !== 'REJECTED';
$isModel = $rec['source'] === 'MODEL';

page_header('Advice', 'moto_sessions');
page_head('Advice', [
    'crumb' => ['moto_sessions.php?id=' . (int) $rec['session_id'], 'Session on ' . when($rec['run_at'])],
    'lede' => e($rec['bike']) . ' at ' . e($rec['track']) . ', after riding v' . (int) $rec['version'] . ' ' . e($rec['setup']) . '. From '
        . ($isModel ? 'the built-in model' : e(PROVIDER_NAMES[$rec['provider']] ?? $rec['provider']) . ' <span class="muted">(' . e($rec['model']) . ')</span>') . '.',
    'aside' => hud_gauge(['LOW' => 1 / 3, 'MEDIUM' => 2 / 3, 'HIGH' => 1.0][$rec['confidence']],
        ['LOW' => 'Low', 'MEDIUM' => 'Med', 'HIGH' => 'High'][$rec['confidence']], '', 'Confidence', $rec['confidence'] === 'LOW' ? '' : 'cyan'),
]);
?>

<?php if ($rec['applied_setup_id']): ?>
  <div class="notice notice-ok">This advice became <a href="moto_setups.php?id=<?= (int) $rec['applied_setup_id'] ?>">the next setup version</a>.</div>
<?php elseif ($rec['status'] === 'REJECTED'): ?><div class="notice">This advice was set aside.</div><?php endif; ?>

<section class="calc" data-tag="<?= $isModel ? 'Model' : 'Engineer' ?>">
  <h2>Diagnosis</h2>
  <p class="prose"><?= nl2br(e($rec['diagnosis'])) ?></p>
  <?php if (!empty($full['data_quality_flags'])): ?>
    <div class="notice notice-warn"><p>The data behind this is weaker than it looks:</p>
      <ul><?php foreach ($full['data_quality_flags'] as $f): ?><li><?= e($f) ?></li><?php endforeach; ?></ul></div>
  <?php endif; ?>
  <?php if ($isModel && !empty($full['wanted'])): ?>
    <p class="hint">What the handling model was asked for and what these moves deliver (units are the model's, not lap time):</p>
    <div class="axes">
      <?php foreach (array_keys($MOTO['axes']) as $i => $axis): ?>
        <div><b><?= e($MOTO['axes'][$axis]) ?></b><span>Asked <?= MotoMath::signed((float) $full['wanted'][$i]) ?> &middot; delivered <?= MotoMath::signed((float) ($full['achieved'][$i] ?? 0)) ?></span></div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>

<form method="post">
  <?= csrf_field() ?>
  <section>
    <h2>Changes to test <span class="count"><?= count($items) ?></span></h2>
    <?php if (!$items): ?><p class="empty">No changes recommended from this session.</p><?php endif; ?>
    <div class="change-list">
    <?php foreach ($items as $item):
        $head = '<span class="change-head"><span><span class="change-where">' . e($MOTO['groups'][$MOTO['params'][$item['param_key']]['group'] ?? ''] ?? '') . '</span>'
            . '<span class="change-name">' . e(mg_label($item['param_key'])) . '</span></span>'
            . '<span class="change-move"><span class="from">' . e($item['current_text']) . '</span><span class="arrow" aria-hidden="true">&#9656;</span>'
            . '<span class="visually-hidden"> to </span><span class="to">' . e($item['suggested_text']) . '</span></span></span>'; ?>
      <div class="change<?= $open ? ' is-open' : '' ?>">
        <?php if ($open): ?>
          <label class="change-pick"><input type="checkbox" name="items[]" value="<?= (int) $item['id'] ?>" checked><?= $head ?></label>
        <?php else: ?>
          <?= $head ?>
        <?php endif; ?>
        <div class="change-meta">
          <?= (int) $item['priority'] === 1 ? '<span class="chip chip-orange">Main change</span>' : '<span class="chip chip-muted">Secondary</span>' ?>
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
    <?php if (!empty($full['next_session_focus'])): ?><h3>On the next run</h3><p class="prose"><?= nl2br(e($full['next_session_focus'])) ?></p><?php endif; ?>
    <?php if (!empty($full['technique_notes'])): ?><h3>Riding tips</h3><ul class="prose"><?php foreach ($full['technique_notes'] as $n): ?><li><?= e($n) ?></li><?php endforeach; ?></ul><?php endif; ?>
    <?php if (!empty($full['checker_notes'])): ?><h3>Corrected before you saw it</h3><ul class="prose"><?php foreach ($full['checker_notes'] as $n): ?><li><?= e($n) ?></li><?php endforeach; ?></ul><?php endif; ?>
    <p class="hint">A MotoGP 26 patch fixed a bug where some pit-menu setup changes were not applied, so after changing the bike re-open the setup screen and check the values.</p>
  </section>
  <?php if ($open): ?>
    <div class="actions">
      <?php if ($items): ?><button class="btn btn-primary">Create the next version with the ticked changes</button><?php endif; ?>
      <button class="btn btn-danger" name="reject" value="1">Set this advice aside</button>
    </div>
  <?php endif; ?>
</form>
<?php page_footer();
