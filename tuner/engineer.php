<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

// Receives the "Ask the engineer" form from a stint page.
$stintId = (int) ($_POST['stint_id'] ?? 0);
if (!is_post() || !$stintId) {
    redirect('stints.php');
}
try {
    $recId = engineer_run($stintId, (string) ($_POST['provider'] ?? ''));
    redirect('advice.php?id=' . $recId);
} catch (RuntimeException | JsonException $ex) {
    if (db()->inTransaction()) {
        db()->rollBack();
    }
    flash($ex->getMessage(), 'error');
    redirect('stints.php?id=' . $stintId);
}
