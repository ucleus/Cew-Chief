<?php
require __DIR__ . '/_bootstrap.php';

function load_car(array $car): array
{
    $ranges = db()->prepare('SELECT * FROM car_param_ranges WHERE car_id = ? ORDER BY scope, param_key');
    $ranges->execute([$car['id']]);
    $car['ranges'] = $ranges->fetchAll();

    $compounds = db()->prepare('SELECT * FROM tire_compounds WHERE car_id = ? ORDER BY name');
    $compounds->execute([$car['id']]);
    $car['compounds'] = $compounds->fetchAll();

    return $car;
}

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM cars WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $car = $stmt->fetch();
            respond($car ? load_car($car) : null);
        }
        respond(db()->query('SELECT * FROM cars ORDER BY name')->fetchAll());

    case 'POST':
        $in = json_input();
        foreach (['name', 'car_class', 'total_mass_kg', 'front_weight_pct', 'wheelbase_mm', 'track_front_mm', 'track_rear_mm'] as $field) {
            if (!isset($in[$field]) || $in[$field] === '') fail("$field is required");
        }
        $stmt = db()->prepare(
            'INSERT INTO cars
                (name, ac_folder, car_class, drivetrain, total_mass_kg, front_weight_pct,
                 wheelbase_mm, track_front_mm, track_rear_mm, unsprung_front_kg, unsprung_rear_kg,
                 motion_ratio_front, motion_ratio_rear, fuel_tank_l, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $stmt->execute([
            $in['name'], $in['ac_folder'] ?? null, $in['car_class'], $in['drivetrain'] ?? 'MR',
            $in['total_mass_kg'], $in['front_weight_pct'], $in['wheelbase_mm'], $in['track_front_mm'], $in['track_rear_mm'],
            $in['unsprung_front_kg'] ?? 45.0, $in['unsprung_rear_kg'] ?? 50.0,
            $in['motion_ratio_front'] ?? 1.000, $in['motion_ratio_rear'] ?? 1.000,
            $in['fuel_tank_l'] ?? null, $in['notes'] ?? null,
        ]);
        respond(['id' => (int) db()->lastInsertId()], 201);

    case 'PATCH':
        if (empty($_GET['id'])) fail('id is required');
        $in = json_input();
        $fields = [];
        $args = [];
        foreach ([
            'name', 'ac_folder', 'car_class', 'drivetrain', 'total_mass_kg', 'front_weight_pct',
            'wheelbase_mm', 'track_front_mm', 'track_rear_mm', 'unsprung_front_kg', 'unsprung_rear_kg',
            'motion_ratio_front', 'motion_ratio_rear', 'fuel_tank_l', 'notes',
        ] as $field) {
            if (array_key_exists($field, $in)) { $fields[] = "$field = ?"; $args[] = $in[$field]; }
        }
        if (!$fields) fail('Nothing to update');
        $args[] = $_GET['id'];
        $stmt = db()->prepare('UPDATE cars SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($args);
        respond(['ok' => true]);

    default:
        fail('Method not allowed', 405);
}
