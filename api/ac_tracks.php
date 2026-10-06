<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM tracks WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            respond($stmt->fetch() ?: null);
        }
        respond(db()->query('SELECT * FROM tracks ORDER BY name')->fetchAll());

    case 'POST':
        $in = json_input();
        if (empty($in['name']) || empty($in['length_m'])) fail('name and length_m are required');
        $stmt = db()->prepare(
            'INSERT INTO tracks
                (name, layout, ac_folder, length_m, direction, downforce_demand, bumpiness, kerb_usage,
                 slow_corners, medium_corners, fast_corners, longest_straight_m, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $stmt->execute([
            $in['name'], $in['layout'] ?? 'Standard', $in['ac_folder'] ?? null, $in['length_m'],
            $in['direction'] ?? 'CW', $in['downforce_demand'] ?? 'MEDIUM',
            $in['bumpiness'] ?? 3, $in['kerb_usage'] ?? 3,
            $in['slow_corners'] ?? null, $in['medium_corners'] ?? null, $in['fast_corners'] ?? null,
            $in['longest_straight_m'] ?? null, $in['notes'] ?? null,
        ]);
        respond(['id' => (int) db()->lastInsertId()], 201);

    case 'PATCH':
        if (empty($_GET['id'])) fail('id is required');
        $in = json_input();
        $fields = [];
        $args = [];
        foreach ([
            'name', 'layout', 'ac_folder', 'length_m', 'direction', 'downforce_demand', 'bumpiness',
            'kerb_usage', 'slow_corners', 'medium_corners', 'fast_corners', 'longest_straight_m', 'notes',
        ] as $field) {
            if (array_key_exists($field, $in)) { $fields[] = "$field = ?"; $args[] = $in[$field]; }
        }
        if (!$fields) fail('Nothing to update');
        $args[] = $_GET['id'];
        $stmt = db()->prepare('UPDATE tracks SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($args);
        respond(['ok' => true]);

    default:
        fail('Method not allowed', 405);
}
