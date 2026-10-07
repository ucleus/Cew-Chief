<?php
/**
 * Additive, non-destructive migration: adds sector split times to both
 * apps' lap tables. Safe to re-run — every ADD COLUMN is guarded with
 * IF NOT EXISTS (MariaDB 10.4+; this server runs 11.8).
 *
 * Run from the command line: php api/migrate_sectors.php
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line: php api/migrate_sectors.php\n");
}

require __DIR__ . '/config.php';

$pdo = new PDO(
    sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_NAME),
    DB_USER,
    DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$statements = [
    'mg_session_laps' => [
        'ALTER TABLE mg_session_laps ADD COLUMN IF NOT EXISTS sector1_ms INT UNSIGNED NULL AFTER lap_ms',
        'ALTER TABLE mg_session_laps ADD COLUMN IF NOT EXISTS sector2_ms INT UNSIGNED NULL AFTER sector1_ms',
        'ALTER TABLE mg_session_laps ADD COLUMN IF NOT EXISTS sector3_ms INT UNSIGNED NULL AFTER sector2_ms',
    ],
    'stint_laps' => [
        'ALTER TABLE stint_laps ADD COLUMN IF NOT EXISTS sector1_ms INT UNSIGNED NULL AFTER lap_ms',
        'ALTER TABLE stint_laps ADD COLUMN IF NOT EXISTS sector2_ms INT UNSIGNED NULL AFTER sector1_ms',
        'ALTER TABLE stint_laps ADD COLUMN IF NOT EXISTS sector3_ms INT UNSIGNED NULL AFTER sector2_ms',
    ],
];

foreach ($statements as $table => $queries) {
    foreach ($queries as $sql) {
        $pdo->exec($sql);
    }
    echo "$table: sector1_ms, sector2_ms, sector3_ms ready.\n";
}

echo "Done.\n";
