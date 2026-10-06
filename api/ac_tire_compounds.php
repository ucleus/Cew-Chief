<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'GET':
        if (empty($_GET['car_id'])) fail('car_id is required');
        $stmt = db()->prepare('SELECT * FROM tire_compounds WHERE car_id = ? ORDER BY name');
        $stmt->execute([$_GET['car_id']]);
        respond($stmt->fetchAll());

    case 'POST':
        $in = json_input();
        foreach (['car_id', 'name', 'target_hot_psi_front', 'target_hot_psi_rear', 'temp_min_c', 'temp_max_c'] as $field) {
            if (!isset($in[$field]) || $in[$field] === '') fail("$field is required");
        }
        $stmt = db()->prepare(
            'INSERT INTO tire_compounds (car_id, name, target_hot_psi_front, target_hot_psi_rear, temp_min_c, temp_max_c)
             VALUES (?, ?, ?, ?, ?, ?)',
        );
        $stmt->execute([
            $in['car_id'], $in['name'], $in['target_hot_psi_front'], $in['target_hot_psi_rear'],
            $in['temp_min_c'], $in['temp_max_c'],
        ]);
        respond(['id' => (int) db()->lastInsertId()], 201);

    default:
        fail('Method not allowed', 405);
}
