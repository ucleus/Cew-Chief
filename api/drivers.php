<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'GET':
        if (isset($_GET['name'])) {
            $stmt = db()->prepare('SELECT * FROM drivers WHERE name = ? LIMIT 1');
            $stmt->execute([$_GET['name']]);
            respond($stmt->fetch() ?: null);
        }
        respond(db()->query('SELECT * FROM drivers ORDER BY name')->fetchAll());

    case 'POST':
        $in = json_input();
        $name = trim($in['name'] ?? '');
        if ($name === '') fail('name is required');

        $stmt = db()->prepare('SELECT * FROM drivers WHERE name = ? LIMIT 1');
        $stmt->execute([$name]);
        $existing = $stmt->fetch();
        if ($existing) respond($existing);

        $stmt = db()->prepare('INSERT INTO drivers (name, style_notes) VALUES (?, ?)');
        $stmt->execute([$name, $in['style_notes'] ?? null]);
        respond(['id' => (int) db()->lastInsertId(), 'name' => $name, 'style_notes' => $in['style_notes'] ?? null], 201);

    case 'PATCH':
        if (empty($_GET['id'])) fail('id is required');
        $in = json_input();
        if (!array_key_exists('style_notes', $in)) fail('Nothing to update');
        $stmt = db()->prepare('UPDATE drivers SET style_notes = ? WHERE id = ?');
        $stmt->execute([$in['style_notes'], $_GET['id']]);
        respond(['ok' => true]);

    default:
        fail('Method not allowed', 405);
}
