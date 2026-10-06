<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'PATCH':
        if (empty($_GET['id'])) fail('id is required');
        $in = json_input();
        if (!array_key_exists('accepted', $in)) fail('accepted is required');
        $stmt = db()->prepare('UPDATE recommendation_items SET accepted = ? WHERE id = ?');
        $stmt->execute([$in['accepted'] === null ? null : (int) $in['accepted'], $_GET['id']]);
        respond(['ok' => true]);

    default:
        fail('Method not allowed', 405);
}
