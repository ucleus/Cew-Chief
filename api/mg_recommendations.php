<?php
require __DIR__ . '/_bootstrap.php';

function load_recommendation(array $rec): array
{
    $items = db()->prepare('SELECT * FROM mg_rec_items WHERE recommendation_id = ? ORDER BY priority');
    $items->execute([$rec['id']]);
    $rec['items'] = $items->fetchAll();
    return $rec;
}

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM mg_recommendations WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $rec = $stmt->fetch();
            respond($rec ? load_recommendation($rec) : null);
        }
        if (empty($_GET['session_id'])) fail('session_id is required');
        $stmt = db()->prepare('SELECT * FROM mg_recommendations WHERE session_id = ? ORDER BY created_at DESC');
        $stmt->execute([$_GET['session_id']]);
        respond(array_map('load_recommendation', $stmt->fetchAll()));

    case 'POST':
        $in = json_input();
        foreach (['session_id', 'source', 'prompt_version', 'response_json', 'diagnosis', 'confidence', 'expected_tradeoff'] as $field) {
            if (empty($in[$field])) fail("$field is required");
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO mg_recommendations
                    (session_id, source, provider, model, prompt_version, request_json, response_json,
                     diagnosis, confidence, expected_tradeoff, status, input_tokens, output_tokens)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            );
            $stmt->execute([
                $in['session_id'], $in['source'], $in['provider'] ?? null, $in['model'] ?? null,
                $in['prompt_version'], $in['request_json'] ?? null, $in['response_json'],
                $in['diagnosis'], $in['confidence'], $in['expected_tradeoff'],
                $in['status'] ?? 'PENDING', $in['input_tokens'] ?? null, $in['output_tokens'] ?? null,
            ]);
            $recId = (int) $pdo->lastInsertId();

            $itemStmt = $pdo->prepare(
                'INSERT INTO mg_rec_items
                    (recommendation_id, priority, source, param_key, kind, current_text, suggested_text,
                     suggested_number, suggested_option_id, addresses, rationale, tradeoff)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            );
            foreach (($in['items'] ?? []) as $i => $item) {
                $itemStmt->execute([
                    $recId, $item['priority'] ?? ($i + 1), $item['source'] ?? 'AI',
                    $item['param_key'], $item['kind'] ?? 'NUM', $item['current_text'] ?? '', $item['suggested_text'] ?? '',
                    $item['suggested_number'] ?? null, $item['suggested_option_id'] ?? null,
                    $item['addresses'] ?? null, $item['rationale'] ?? '', $item['tradeoff'] ?? null,
                ]);
            }

            $pdo->commit();
            respond(['id' => $recId], 201);
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

    case 'PATCH':
        if (empty($_GET['id'])) fail('id is required');
        $in = json_input();
        $fields = [];
        $args = [];
        foreach (['status', 'applied_setup_id'] as $field) {
            if (array_key_exists($field, $in)) { $fields[] = "$field = ?"; $args[] = $in[$field]; }
        }
        if (!$fields) fail('Nothing to update');
        $args[] = $_GET['id'];
        $stmt = db()->prepare('UPDATE mg_recommendations SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($args);
        respond(['ok' => true]);

    default:
        fail('Method not allowed', 405);
}
