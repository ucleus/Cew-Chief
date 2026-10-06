<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
mg_require_tables();

// Receives the "Get advice" forms from a session page: the built-in model or an AI provider.
$sessionId = (int) ($_POST['session_id'] ?? 0);
if (!is_post() || !$sessionId) {
    redirect('moto_sessions.php');
}
try {
    $provider = (string) ($_POST['provider'] ?? 'model');
    $recId = $provider === 'model' ? mg_run_model($sessionId) : mg_run_ai($sessionId, $provider);
    redirect('moto_advice.php?id=' . $recId);
} catch (RuntimeException | JsonException $ex) {
    if (db()->inTransaction()) {
        db()->rollBack();
    }
    flash($ex->getMessage(), 'error');
    redirect('moto_sessions.php?id=' . $sessionId);
}
