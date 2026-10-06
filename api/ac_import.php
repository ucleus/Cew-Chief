<?php
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/AcIni.php';

// Multipart upload, not JSON — reads up to 3 of the car's AC data files
// (setup.ini / car.ini / suspensions.ini) and returns what it could read.
// Nothing is saved; the caller decides what to keep via ac_cars.php /
// ac_car_ranges.php.

if (method() !== 'POST') {
    fail('Method not allowed', 405);
}

$files = $_FILES['files'] ?? null;
if (!$files || empty($files['tmp_name'])) {
    fail('No files uploaded');
}

$texts = [];
$errors = [];
foreach ($files['tmp_name'] as $i => $tmp) {
    if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        continue;
    }
    $name = (string) ($files['name'][$i] ?? "file $i");
    if ($files['error'][$i] !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) {
        $errors[] = "$name did not upload correctly.";
    } elseif (($files['size'][$i] ?? 0) > 500000) {
        $errors[] = "$name is too big to be a car data file.";
    } elseif (($text = ac_read_text($tmp)) === null) {
        $errors[] = "$name is not a text file with [SECTION] headings, so it was not read.";
    } else {
        $texts[] = $text;
    }
    if (count($texts) >= 3) {
        break;
    }
}

if (!$texts) {
    respond(['found' => false, 'car' => [], 'ranges' => [], 'errors' => $errors ?: ['Choose at least one file.']]);
}

$result = ac_import($texts);
$result['errors'] = $errors;
respond($result);
