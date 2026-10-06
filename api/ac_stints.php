<?php
require __DIR__ . '/_bootstrap.php';

const AC_CORNERS = ['FL', 'FR', 'RL', 'RR'];

function load_stint(array $stint): array
{
    $laps = db()->prepare('SELECT lap_no, lap_ms, is_valid FROM stint_laps WHERE stint_id = ? ORDER BY lap_no');
    $laps->execute([$stint['id']]);
    $stint['laps'] = $laps->fetchAll();

    $tires = db()->prepare('SELECT * FROM stint_tires WHERE stint_id = ?');
    $tires->execute([$stint['id']]);
    $stint['tires'] = [];
    foreach ($tires->fetchAll() as $row) $stint['tires'][$row['corner']] = $row;

    $feedback = db()->prepare('SELECT * FROM stint_feedback WHERE stint_id = ? ORDER BY id');
    $feedback->execute([$stint['id']]);
    $stint['feedback'] = $feedback->fetchAll();

    return $stint;
}

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM stints WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $stint = $stmt->fetch();
            respond($stint ? load_stint($stint) : null);
        }

        if (!empty($_GET['setup_id'])) {
            $stmt = db()->prepare('SELECT * FROM stints WHERE setup_id = ? ORDER BY run_at DESC');
            $stmt->execute([$_GET['setup_id']]);
        } elseif (!empty($_GET['car_id'])) {
            $sql = 'SELECT x.*, s.track_id, s.car_id, s.name AS setup_name, s.version AS setup_version, s.purpose AS setup_purpose
                    FROM stints x JOIN setups s ON s.id = x.setup_id WHERE s.car_id = ?';
            $args = [$_GET['car_id']];
            if (!empty($_GET['track_id'])) { $sql .= ' AND s.track_id = ?'; $args[] = $_GET['track_id']; }
            $sql .= ' ORDER BY x.run_at DESC';
            $stmt = db()->prepare($sql);
            $stmt->execute($args);
        } else {
            $stmt = db()->query('SELECT * FROM stints ORDER BY run_at DESC LIMIT 200');
        }
        respond(array_map('load_stint', $stmt->fetchAll()));

    case 'POST':
        $in = json_input();
        foreach (['setup_id', 'lap_count', 'best_lap_ms', 'ambient_temp_c', 'track_temp_c'] as $field) {
            if (!isset($in[$field]) || $in[$field] === '') fail("$field is required");
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO stints
                    (setup_id, driver_id, session_type, lap_count, best_lap_ms, avg_lap_ms, lap_stdev_ms,
                     ambient_temp_c, track_temp_c, grip_pct, fuel_start_l, fuel_end_l, top_speed_kmh, driver_notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            );
            $stmt->execute([
                $in['setup_id'], $in['driver_id'] ?? null, $in['session_type'] ?? 'PRACTICE',
                $in['lap_count'], $in['best_lap_ms'], $in['avg_lap_ms'] ?? null, $in['lap_stdev_ms'] ?? null,
                $in['ambient_temp_c'], $in['track_temp_c'], $in['grip_pct'] ?? null,
                $in['fuel_start_l'] ?? null, $in['fuel_end_l'] ?? null, $in['top_speed_kmh'] ?? null,
                $in['driver_notes'] ?? null,
            ]);
            $stintId = (int) $pdo->lastInsertId();

            $lapStmt = $pdo->prepare('INSERT INTO stint_laps (stint_id, lap_no, lap_ms, is_valid) VALUES (?, ?, ?, ?)');
            foreach (($in['laps'] ?? []) as $i => $lap) {
                $lapStmt->execute([$stintId, $lap['lap_no'] ?? ($i + 1), $lap['lap_ms'], isset($lap['is_valid']) ? (int) $lap['is_valid'] : 1]);
            }

            $tireStmt = $pdo->prepare(
                'INSERT INTO stint_tires (stint_id, corner, hot_psi, temp_in_c, temp_mid_c, temp_out_c, wear_pct)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
            );
            foreach (AC_CORNERS as $corner) {
                $t = ($in['tires'] ?? [])[$corner] ?? null;
                if (!$t || !isset($t['hot_psi'], $t['temp_in_c'], $t['temp_mid_c'], $t['temp_out_c'])) continue;
                $tireStmt->execute([$stintId, $corner, $t['hot_psi'], $t['temp_in_c'], $t['temp_mid_c'], $t['temp_out_c'], $t['wear_pct'] ?? null]);
            }

            $fbStmt = $pdo->prepare(
                'INSERT INTO stint_feedback (stint_id, phase, speed_range, symptom, severity, corner_ref, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
            );
            foreach (($in['feedback'] ?? []) as $fb) {
                $fbStmt->execute([
                    $stintId, $fb['phase'], $fb['speed_range'] ?? 'ALL', $fb['symptom'],
                    $fb['severity'] ?? 3, $fb['corner_ref'] ?? null, $fb['note'] ?? null,
                ]);
            }

            $pdo->commit();
            respond(['id' => $stintId], 201);
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

    default:
        fail('Method not allowed', 405);
}
