<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';
require __DIR__ . '/../app/AcIni.php';

$target = (string) ($_GET['id'] ?? 'new');
$target = $target === 'new' ? 'new' : (string) (int) $target;
if ($target !== 'new' && !q('SELECT 1 FROM cars WHERE id = ?', [(int) $target])->fetchColumn()) {
    redirect('cars.php');
}

$errors = [];
if (is_post()) {
    $texts = [];
    $files = $_FILES['files'] ?? null;
    foreach ($files['tmp_name'] ?? [] as $i => $tmp) {
        if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $name = (string) ($files['name'][$i] ?? 'file ' . ($i + 1));
        if ($files['error'][$i] !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) {
            $errors[] = "$name did not upload. Try again.";
        } elseif ($files['size'][$i] > 500000) {
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
    if (!$texts && !$errors) {
        $errors[] = 'Choose at least one file.';
    }
    if (!$errors) {
        $import = ac_import($texts);
        if (!$import['found']) {
            $errors[] = 'None of those files looked like setup.ini, car.ini or suspensions.ini.';
        } else {
            $_SESSION['car_import'] = $import;
            redirect('cars.php?id=' . $target . '&imported=1');
        }
    }
}

page_header('Fill from game files', 'cars');
$back = 'cars.php' . ($target === 'new' ? '?id=new' : '?id=' . (int) $target);
page_head('Fill the car from its game files', [
    'crumb' => [$back, 'Back to the car'],
    'lede' => 'Reads the limits of every setting the car offers, and its mass and dimensions, so you don\'t type them. '
        . 'Nothing is saved until you check the car form and press Save.',
]);
show_errors($errors);
?>

<form method="post" enctype="multipart/form-data">
  <?= csrf_field() ?>
  <section>
    <h2>Car data files</h2>
    <label class="field narrow">Choose up to three files
      <input type="file" name="files[]" multiple accept=".ini,.txt,text/plain" required>
    </label>
    <p class="hint">They are in the car's <strong>data</strong> folder, inside
      <strong>assettocorsa/content/cars/&lt;car&gt;</strong>:</p>
    <ul class="prose">
      <li><strong>setup.ini</strong> gives the limits of every setting (this is the useful one).</li>
      <li><strong>car.ini</strong> gives the mass and fuel tank.</li>
      <li><strong>suspensions.ini</strong> gives the wheelbase, front weight and track widths.</li>
    </ul>
    <p class="hint">Official cars keep these inside a packed <strong>data.acd</strong> file, so the loose .ini files only
      exist once that has been unpacked. Many mod cars ship with the data folder already open.
      Files are read in memory and not kept.</p>
  </section>
  <div class="actions"><button class="btn btn-primary">Read the files</button>
    <a class="btn" href="<?= e($back) ?>">Cancel</a></div>
</form>
<?php page_footer();
