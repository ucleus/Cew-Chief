<?php
require __DIR__ . '/_bootstrap.php';

const CORNERS = ['FL', 'FR', 'RL', 'RR'];

function load_ac_setup(array $setup): array
{
    $corners = db()->prepare('SELECT * FROM setup_corners WHERE setup_id = ?');
    $corners->execute([$setup['id']]);
    $setup['corners'] = [];
    foreach ($corners->fetchAll() as $row) $setup['corners'][$row['corner']] = $row;

    if (!empty($setup['gear_ratios'])) {
        $setup['gear_ratios'] = json_decode($setup['gear_ratios'], true);
    }

    return $setup;
}

switch (method()) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = db()->prepare('SELECT * FROM setups WHERE id = ?');
            $stmt->execute([$_GET['id']]);
            $setup = $stmt->fetch();
            respond($setup ? load_ac_setup($setup) : null);
        }

        if (empty($_GET['car_id']) || empty($_GET['track_id'])) {
            fail('car_id and track_id are required');
        }
        $stmt = db()->prepare('SELECT * FROM setups WHERE car_id = ? AND track_id = ? ORDER BY version DESC');
        $stmt->execute([$_GET['car_id'], $_GET['track_id']]);
        respond(array_map('load_ac_setup', $stmt->fetchAll()));

    case 'POST':
        $in = json_input();
        foreach (['car_id', 'track_id', 'name', 'compound_id', 'fuel_l'] as $field) {
            if (!isset($in[$field]) || $in[$field] === '') fail("$field is required");
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $verStmt = $pdo->prepare('SELECT COALESCE(MAX(version), 0) + 1 FROM setups WHERE car_id = ? AND track_id = ?');
            $verStmt->execute([$in['car_id'], $in['track_id']]);
            $version = (int) $verStmt->fetchColumn();

            $stmt = $pdo->prepare(
                'INSERT INTO setups
                    (car_id, track_id, parent_setup_id, version, name, purpose, compound_id, change_summary, fuel_l,
                     brake_bias_front_pct, brake_power_pct, brake_duct_front, brake_duct_rear,
                     arb_front, arb_rear, caster_deg, wing_front, wing_rear,
                     diff_power_pct, diff_coast_pct, diff_preload_nm, final_drive, gear_ratios,
                     tc_level, abs_level, engine_brake, turbo_boost_pct, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            );
            $stmt->execute([
                $in['car_id'], $in['track_id'], $in['parent_setup_id'] ?? null, $version,
                $in['name'], $in['purpose'] ?? 'BASELINE', $in['compound_id'], $in['change_summary'] ?? null, $in['fuel_l'],
                $in['brake_bias_front_pct'] ?? null, $in['brake_power_pct'] ?? null,
                $in['brake_duct_front'] ?? null, $in['brake_duct_rear'] ?? null,
                $in['arb_front'] ?? null, $in['arb_rear'] ?? null, $in['caster_deg'] ?? null,
                $in['wing_front'] ?? null, $in['wing_rear'] ?? null,
                $in['diff_power_pct'] ?? null, $in['diff_coast_pct'] ?? null, $in['diff_preload_nm'] ?? null,
                $in['final_drive'] ?? null,
                isset($in['gear_ratios']) ? json_encode($in['gear_ratios']) : null,
                $in['tc_level'] ?? null, $in['abs_level'] ?? null, $in['engine_brake'] ?? null,
                $in['turbo_boost_pct'] ?? null, $in['notes'] ?? null,
            ]);
            $setupId = (int) $pdo->lastInsertId();

            $cornerStmt = $pdo->prepare(
                'INSERT INTO setup_corners
                    (setup_id, corner, cold_psi, camber_deg, toe, spring_rate, ride_height, packer,
                     bumpstop_rate, slow_bump, slow_rebound, fast_bump, fast_rebound)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            );
            foreach (CORNERS as $corner) {
                $c = ($in['corners'] ?? [])[$corner] ?? null;
                if (!$c || !isset($c['cold_psi'])) continue;
                $cornerStmt->execute([
                    $setupId, $corner, $c['cold_psi'],
                    $c['camber_deg'] ?? null, $c['toe'] ?? null, $c['spring_rate'] ?? null,
                    $c['ride_height'] ?? null, $c['packer'] ?? null, $c['bumpstop_rate'] ?? null,
                    $c['slow_bump'] ?? null, $c['slow_rebound'] ?? null,
                    $c['fast_bump'] ?? null, $c['fast_rebound'] ?? null,
                ]);
            }

            $pdo->commit();
            respond(['id' => $setupId, 'version' => $version], 201);
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

    default:
        fail('Method not allowed', 405);
}
