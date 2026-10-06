<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'GET':
        if (empty($_GET['car_id'])) fail('car_id is required');
        $stmt = db()->prepare('SELECT * FROM car_param_ranges WHERE car_id = ? ORDER BY scope, param_key');
        $stmt->execute([$_GET['car_id']]);
        respond($stmt->fetchAll());

    case 'POST':
        $in = json_input();
        foreach (['car_id', 'param_key', 'min_value', 'max_value', 'unit', 'higher_means'] as $field) {
            if (!isset($in[$field]) || $in[$field] === '') fail("$field is required");
        }
        $stmt = db()->prepare(
            'INSERT INTO car_param_ranges
                (car_id, param_key, scope, min_value, max_value, step_value, unit, higher_means, real_base, real_per_unit, real_unit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                min_value = VALUES(min_value), max_value = VALUES(max_value), step_value = VALUES(step_value),
                unit = VALUES(unit), higher_means = VALUES(higher_means),
                real_base = VALUES(real_base), real_per_unit = VALUES(real_per_unit), real_unit = VALUES(real_unit)',
        );
        $stmt->execute([
            $in['car_id'], $in['param_key'], $in['scope'] ?? 'CAR',
            $in['min_value'], $in['max_value'], $in['step_value'] ?? 1.0,
            $in['unit'], $in['higher_means'],
            $in['real_base'] ?? null, $in['real_per_unit'] ?? null, $in['real_unit'] ?? null,
        ]);
        respond(['ok' => true], 201);

    case 'PATCH':
        if (empty($_GET['id'])) fail('id is required');
        $in = json_input();
        $fields = [];
        $args = [];
        foreach (['min_value', 'max_value', 'step_value', 'unit', 'higher_means', 'real_base', 'real_per_unit', 'real_unit'] as $field) {
            if (array_key_exists($field, $in)) { $fields[] = "$field = ?"; $args[] = $in[$field]; }
        }
        if (!$fields) fail('Nothing to update');
        $args[] = $_GET['id'];
        $stmt = db()->prepare('UPDATE car_param_ranges SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($args);
        respond(['ok' => true]);

    default:
        fail('Method not allowed', 405);
}
