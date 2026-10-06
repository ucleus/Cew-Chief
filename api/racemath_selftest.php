<?php
/**
 * Verifies the RaceMath.php port against the same hand-calculated values
 * as the earlier build's tuner/selftest.php. Run from the command line:
 *   php api/racemath_selftest.php
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line: php api/racemath_selftest.php\n");
}

require __DIR__ . '/RaceMath.php';

$failures = 0;

function check(string $label, float $actual, float $expected, float $tolerance = 0.01): void
{
    global $failures;
    $ok = abs($actual - $expected) <= $tolerance;
    if (!$ok) {
        $failures++;
    }
    fwrite(STDERR, sprintf("%s  %-44s got %.4f, expected %.4f\n", $ok ? 'PASS' : 'FAIL', $label, $actual, $expected));
}

$mass = RaceMath::cornerSprungMass(1300.0, 40.0, 45.0, 45.0, 50.0);
check('sprung mass front corner (kg)', $mass['front'], 254.25);
check('sprung mass rear corner (kg)', $mass['rear'], 315.75);

$kwFront = RaceMath::wheelRate(150.0);
check('wheel rate front (N/m)', $kwFront, 150000.0);
check('wheel rate with 0.75 motion ratio (N/m)', RaceMath::wheelRate(150.0, 0.75), 84375.0);

$freqFront = RaceMath::rideFrequency($kwFront, $mass['front']);
check('ride frequency front (Hz)', $freqFront, 3.8658, 0.001);

check('critical damping front (Ns/m)', RaceMath::criticalDamping($kwFront, $mass['front']), 12351.11, 0.5);
check('damping ratio, 8000 Ns/m front', RaceMath::dampingRatio(8000.0, $kwFront, $mass['front']), 0.6477, 0.001);

$rollFront = RaceMath::rollStiffness($kwFront, 60000.0, 1650);
check('roll stiffness front (Nm/deg)', $rollFront, 6414.75, 0.5);

check('cold pressure for target, FR (psi)', RaceMath::coldPressureForTarget(23.0, 28.7, 27.0), 21.523, 0.005);
check('snap 21.52 to 1 psi step', RaceMath::snap(21.523, 15.0, 35.0, 1.0), 22.0);

$stats = RaceMath::lapStats([99412, 98876, 98345, 98590, 98702, 99105]);
check('lap best (ms)', (float) $stats['best_ms'], 98345.0);
check('lap stdev (ms)', (float) $stats['stdev_ms'], 381.0, 1.0);

echo RaceMath::formatLap(98345) === '1:38.345' ? "PASS  formatLap\n" : "FAIL  formatLap\n";

fwrite(STDERR, $failures === 0 ? "\nAll checks passed.\n" : "\n$failures check(s) FAILED.\n");
exit($failures === 0 ? 0 : 1);
