<?php
require __DIR__ . '/_bootstrap.php';

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM mg_bikes WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $bike = $stmt->fetch();
            if (!$bike) respond(null);

            $params = db()->prepare('SELECT * FROM mg_bike_params WHERE bike_id = ? ORDER BY param_key');
            $params->execute([$bike['id']]);
            $bike['params'] = $params->fetchAll();

            $options = db()->prepare('SELECT * FROM mg_bike_options WHERE bike_id = ? ORDER BY param_key, rank_no');
            $options->execute([$bike['id']]);
            $bike['options'] = $options->fetchAll();

            respond($bike);
        }

        $sql = 'SELECT * FROM mg_bikes WHERE 1=1';
        $args = [];
        if (!empty($_GET['game'])) { $sql .= ' AND game = ?'; $args[] = $_GET['game']; }
        if (!empty($_GET['class'])) { $sql .= ' AND class = ?'; $args[] = $_GET['class']; }
        $sql .= ' ORDER BY class, name';
        $stmt = db()->prepare($sql);
        $stmt->execute($args);
        respond($stmt->fetchAll());

    default:
        fail('Method not allowed', 405);
}
