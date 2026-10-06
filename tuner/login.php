<?php
declare(strict_types=1);
define('PUBLIC_PAGE', true);
require __DIR__ . '/../app/bootstrap.php';

if (isset($_GET['out'])) {
    $_SESSION = [];
    session_destroy();
    redirect('login.php');
}
if (!login_enabled() || !empty($_SESSION['auth'])) {
    redirect('index.php');
}

$error = '';
if (is_post()) {
    if (password_verify((string) ($_POST['password'] ?? ''), $config['password_hash'])) {
        session_regenerate_id(true);
        $_SESSION['auth'] = true;
        redirect('index.php');
    }
    sleep(1); // slows down guessing
    $error = 'That password is not right.';
}

page_header('Sign in');
?>
<div class="access">
  <p class="brand"><?= HEX_ICON ?><span>Race Engineer</span></p>
  <section>
    <h2>Team access</h2>
    <?php if ($error): ?><div class="notice notice-error" role="alert"><?= e($error) ?></div><?php endif; ?>
    <form method="post">
      <?= csrf_field() ?>
      <label class="field">Team password
        <input type="password" name="password" required autofocus autocomplete="current-password">
      </label>
      <div class="form-end"><button class="btn btn-primary btn-wide">Sign in</button></div>
    </form>
  </section>
</div>
<?php page_footer();
