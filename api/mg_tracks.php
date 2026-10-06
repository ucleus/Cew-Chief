<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM mg_tracks WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            respond($stmt->fetch() ?: null);
        }
        respond(db()->query('SELECT * FROM mg_tracks ORDER BY name')->fetchAll());

    case 'POST':
        $in = json_input();
        if (empty($in['name'])) fail('name is required');
        $stmt = db()->prepare(
            'INSERT INTO mg_tracks
                (name, country, length_m, slow_corners, medium_corners, fast_corners,
                 big_braking_zones, quick_braking_zones, straight_rating, avg_speed_rating,
                 bumpiness, front_wear_rating, rear_wear_rating, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $stmt->execute([
            $in['name'], $in['country'] ?? null, $in['length_m'] ?? null,
            $in['slow_corners'] ?? null, $in['medium_corners'] ?? null, $in['fast_corners'] ?? null,
            $in['big_braking_zones'] ?? null, $in['quick_braking_zones'] ?? null,
            $in['straight_rating'] ?? 3, $in['avg_speed_rating'] ?? 3, $in['bumpiness'] ?? 3,
            $in['front_wear_rating'] ?? 3, $in['rear_wear_rating'] ?? 3, $in['notes'] ?? null,
        ]);
        respond(['id' => (int) db()->lastInsertId()], 201);

    default:
        fail('Method not allowed', 405);
}
