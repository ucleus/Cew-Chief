<?php
require __DIR__ . '/_bootstrap.php';

function load_setup(array $setup): array
{
    $values = db()->prepare('SELECT param_key, value FROM mg_setup_values WHERE setup_id = ?');
    $values->execute([$setup['id']]);
    $setup['values'] = [];
    foreach ($values->fetchAll() as $row) $setup['values'][$row['param_key']] = (int) $row['value'];

    $choices = db()->prepare('SELECT param_key, option_id FROM mg_setup_choices WHERE setup_id = ?');
    $choices->execute([$setup['id']]);
    $setup['choices'] = [];
    foreach ($choices->fetchAll() as $row) $setup['choices'][$row['param_key']] = (int) $row['option_id'];

    return $setup;
}

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM mg_setups WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $setup = $stmt->fetch();
            respond($setup ? load_setup($setup) : null);
        }

        if (empty($_GET['bike_id']) || empty($_GET['track_id'])) {
            fail('bike_id and track_id are required');
        }
        $stmt = db()->prepare(
            'SELECT * FROM mg_setups WHERE bike_id = ? AND track_id = ? ORDER BY version DESC',
        );
        $stmt->execute([$_GET['bike_id'], $_GET['track_id']]);
        respond(array_map('load_setup', $stmt->fetchAll()));

    case 'POST':
        $in = json_input();
        foreach (['bike_id', 'track_id', 'name'] as $field) {
            if (empty($in[$field])) fail("$field is required");
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $verStmt = $pdo->prepare(
                'SELECT COALESCE(MAX(version), 0) + 1 FROM mg_setups WHERE bike_id = ? AND track_id = ?',
            );
            $verStmt->execute([$in['bike_id'], $in['track_id']]);
            $version = (int) $verStmt->fetchColumn();

            $stmt = $pdo->prepare(
                'INSERT INTO mg_setups (bike_id, track_id, parent_setup_id, version, name, purpose, change_summary, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            );
            $stmt->execute([
                $in['bike_id'], $in['track_id'], $in['parent_setup_id'] ?? null, $version,
                $in['name'], $in['purpose'] ?? 'PRACTICE', $in['change_summary'] ?? null, $in['notes'] ?? null,
            ]);
            $setupId = (int) $pdo->lastInsertId();

            $valueStmt = $pdo->prepare('INSERT INTO mg_setup_values (setup_id, param_key, value) VALUES (?, ?, ?)');
            foreach (($in['values'] ?? []) as $key => $value) {
                $valueStmt->execute([$setupId, $key, $value]);
            }

            $choiceStmt = $pdo->prepare('INSERT INTO mg_setup_choices (setup_id, param_key, option_id) VALUES (?, ?, ?)');
            foreach (($in['choices'] ?? []) as $key => $optionId) {
                $choiceStmt->execute([$setupId, $key, $optionId]);
            }

            $pdo->commit();
            respond(['id' => $setupId, 'version' => $version], 201);
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

    default:
        fail('Method not allowed', 405);
}
