<?php
declare(strict_types=1);

/**
 * Best-effort reader for Assetto Corsa's .ini content files
 * (setup.ini, car.ini, suspensions.ini — found in a car's data folder once
 * data.acd has been unpacked).
 *
 * Honesty note: this was written without a verified real sample file from
 * your install (none was available to check field names against). The
 * generic INI parsing (ac_parse_ini) is solid — plain [SECTION]/KEY=VALUE
 * text, nothing AC-specific about it. The car.ini/suspensions.ini field
 * names below (MASS, FUELTANK, WHEELBASE, TRACK, CG_LOCATION) are the
 * commonly documented ones; setup.ini's per-setting MIN/MAX/STEP values
 * are extracted generically by section name, but NOT auto-mapped to our
 * param_key names, since guessing that mapping wrong would silently save
 * bad ranges. Check the raw sections it finds against your own file before
 * trusting them.
 */

function ac_read_text(string $tmpPath): ?string
{
    $contents = @file_get_contents($tmpPath);
    if ($contents === false || $contents === '') {
        return null;
    }
    // Strip a UTF-8 BOM if present, then require at least one [SECTION] header.
    $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents);
    if (!preg_match('/^\s*\[[A-Za-z0-9_]+\]/m', $contents)) {
        return null;
    }
    return $contents;
}

/** @return array<string, array<string, string>> section => key => value */
function ac_parse_ini(string $text): array
{
    $sections = [];
    $current = null;
    foreach (preg_split('/\r\n|\r|\n/', $text) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === ';') {
            continue;
        }
        if (preg_match('/^\[([A-Za-z0-9_]+)\]$/', $line, $m)) {
            $current = $m[1];
            $sections[$current] ??= [];
            continue;
        }
        if ($current === null) {
            continue;
        }
        $eq = strpos($line, '=');
        if ($eq === false) {
            continue;
        }
        $key = trim(substr($line, 0, $eq));
        $value = trim(substr($line, $eq + 1));
        // Drop an inline comment after the value, AC's own ini files use this a lot.
        $value = trim((string) preg_replace('/\s*;.*$/', '', $value));
        $sections[$current][$key] = $value;
    }
    return $sections;
}

function ac_num(array $sections, string $section, string $key): ?float
{
    $value = $sections[$section][$key] ?? null;
    return $value !== null && $value !== '' && is_numeric($value) ? (float) $value : null;
}

/**
 * @param list<string> $texts up to three file contents, any order
 * @return array{found: bool, car: array<string, mixed>, ranges: array<int, array<string, mixed>>}
 */
function ac_import(array $texts): array
{
    $car = [];
    $ranges = [];
    $found = false;

    foreach ($texts as $text) {
        $sections = ac_parse_ini($text);
        if (!$sections) {
            continue;
        }

        // car.ini: [BASIC] MASS=, FUELTANK=
        if (isset($sections['BASIC']['MASS']) || isset($sections['BASIC']['FUELTANK'])) {
            $found = true;
            $mass = ac_num($sections, 'BASIC', 'MASS');
            $fuel = ac_num($sections, 'BASIC', 'FUELTANK');
            if ($mass !== null) $car['total_mass_kg'] = $mass;
            if ($fuel !== null) $car['fuel_tank_l'] = $fuel;
        }

        // suspensions.ini: [FRONT]/[REAR] WHEELBASE, TRACK, [BASIC] CG_LOCATION
        if (isset($sections['FRONT']['TRACK']) || isset($sections['REAR']['TRACK']) || isset($sections['BASIC']['WHEELBASE'])) {
            $found = true;
            $wheelbase = ac_num($sections, 'BASIC', 'WHEELBASE');
            $trackFront = ac_num($sections, 'FRONT', 'TRACK');
            $trackRear = ac_num($sections, 'REAR', 'TRACK');
            $cgLocation = ac_num($sections, 'BASIC', 'CG_LOCATION'); // 0..1, front share per AC convention
            if ($wheelbase !== null) $car['wheelbase_mm'] = round($wheelbase * 1000);
            if ($trackFront !== null) $car['track_front_mm'] = round($trackFront * 1000);
            if ($trackRear !== null) $car['track_rear_mm'] = round($trackRear * 1000);
            if ($cgLocation !== null) $car['front_weight_pct'] = round($cgLocation * 100, 1);
        }

        // setup.ini: every other section with a MIN/MAX is a candidate adjustable
        // range. Reported as-is, under its own section name — map it to one of
        // our param_keys yourself rather than trusting an automatic guess.
        foreach ($sections as $name => $kv) {
            if (in_array($name, ['BASIC', 'FRONT', 'REAR'], true)) {
                continue;
            }
            $min = $kv['MIN'] ?? null;
            $max = $kv['MAX'] ?? null;
            if ($min === null || $max === null || !is_numeric($min) || !is_numeric($max)) {
                continue;
            }
            $found = true;
            $ranges[] = [
                'section' => $name,
                'label' => $kv['NAME'] ?? $name,
                'min_value' => (float) $min,
                'max_value' => (float) $max,
                'step_value' => isset($kv['STEP']) && is_numeric($kv['STEP']) ? (float) $kv['STEP'] : 1.0,
            ];
        }
    }

    return ['found' => $found, 'car' => $car, 'ranges' => $ranges];
}
