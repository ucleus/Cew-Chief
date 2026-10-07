<?php
require __DIR__ . '/_bootstrap.php';

function load_session(array $session): array
{
    $laps = db()->prepare('SELECT lap_no, lap_ms, sector1_ms, sector2_ms, sector3_ms, is_valid FROM mg_session_laps WHERE session_id = ? ORDER BY lap_no');
    $laps->execute([$session['id']]);
    $session['laps'] = $laps->fetchAll();

    $feedback = db()->prepare('SELECT * FROM mg_session_feedback WHERE session_id = ? ORDER BY id');
    $feedback->execute([$session['id']]);
    $session['feedback'] = $feedback->fetchAll();

    return $session;
}

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM mg_sessions WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $session = $stmt->fetch();
            respond($session ? load_session($session) : null);
        }

        if (!empty($_GET['setup_id'])) {
            $stmt = db()->prepare('SELECT * FROM mg_sessions WHERE setup_id = ? ORDER BY run_at DESC');
            $stmt->execute([$_GET['setup_id']]);
        } elseif (!empty($_GET['bike_id'])) {
            $sql = 'SELECT x.*, s.track_id, s.bike_id, s.name AS setup_name, s.version AS setup_version, s.purpose AS setup_purpose
                    FROM mg_sessions x JOIN mg_setups s ON s.id = x.setup_id WHERE s.bike_id = ?';
            $args = [$_GET['bike_id']];
            if (!empty($_GET['track_id'])) { $sql .= ' AND s.track_id = ?'; $args[] = $_GET['track_id']; }
            $sql .= ' ORDER BY x.run_at DESC';
            $stmt = db()->prepare($sql);
            $stmt->execute($args);
        } else {
            $stmt = db()->query('SELECT * FROM mg_sessions ORDER BY run_at DESC LIMIT 200');
        }
        respond(array_map('load_session', $stmt->fetchAll()));

    case 'POST':
        $in = json_input();
        foreach (['setup_id', 'lap_count', 'best_lap_ms'] as $field) {
            if (!isset($in[$field]) || $in[$field] === '') fail("$field is required");
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO mg_sessions
                    (setup_id, session_type, run_at, lap_count, best_lap_ms, avg_lap_ms, lap_stdev_ms,
                     ambient_temp_c, track_temp_c, weather, race_laps,
                     tyre_front_temp, tyre_rear_temp, tyre_front_wear_pct, tyre_rear_wear_pct,
                     brake_front_temp, brake_rear_temp, hit_limiter, driver_notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            );
            $stmt->execute([
                $in['setup_id'],
                $in['session_type'] ?? 'PRACTICE',
                $in['run_at'] ?? gmdate('Y-m-d H:i:s'),
                $in['lap_count'],
                $in['best_lap_ms'],
                $in['avg_lap_ms'] ?? null,
                $in['lap_stdev_ms'] ?? null,
                $in['ambient_temp_c'] ?? null,
                $in['track_temp_c'] ?? null,
                $in['weather'] ?? 'DRY',
                $in['race_laps'] ?? null,
                $in['tyre_front_temp'] ?? null,
                $in['tyre_rear_temp'] ?? null,
                $in['tyre_front_wear_pct'] ?? null,
                $in['tyre_rear_wear_pct'] ?? null,
                $in['brake_front_temp'] ?? null,
                $in['brake_rear_temp'] ?? null,
                !empty($in['hit_limiter']) ? 1 : 0,
                $in['driver_notes'] ?? null,
            ]);
            $sessionId = (int) $pdo->lastInsertId();

            $lapStmt = $pdo->prepare(
                'INSERT INTO mg_session_laps (session_id, lap_no, lap_ms, sector1_ms, sector2_ms, sector3_ms, is_valid)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
            );
            foreach (($in['laps'] ?? []) as $i => $lap) {
                $lapStmt->execute([
                    $sessionId,
                    $lap['lap_no'] ?? ($i + 1),
                    $lap['lap_ms'],
                    $lap['sector1_ms'] ?? null,
                    $lap['sector2_ms'] ?? null,
                    $lap['sector3_ms'] ?? null,
                    isset($lap['is_valid']) ? (int) $lap['is_valid'] : 1,
                ]);
            }

            $fbStmt = $pdo->prepare(
                'INSERT INTO mg_session_feedback (session_id, phase, corner_type, symptom, severity, corner_ref, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
            );
            foreach (($in['feedback'] ?? []) as $fb) {
                $fbStmt->execute([
                    $sessionId, $fb['phase'], $fb['corner_type'] ?? 'ALL', $fb['symptom'],
                    $fb['severity'] ?? 3, $fb['corner_ref'] ?? null, $fb['note'] ?? null,
                ]);
            }

            $pdo->commit();
            respond(['id' => $sessionId], 201);
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

    default:
        fail('Method not allowed', 405);
}
