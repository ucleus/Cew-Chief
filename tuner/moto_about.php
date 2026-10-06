<?php
declare(strict_types=1);
require __DIR__ . '/../app/bootstrap.php';

$conf = ['stated' => 'Stated by a guide', 'assumed' => 'Assumed', 'unknown' => 'Unknown'];
$cfg = $MOTO['model'];
page_header('How it works', 'moto_about');
page_head('How the MotoGP model works', ['lede' => 'What it knows, what it guesses, and the arithmetic. Everything on this page is read from <code>app/moto_catalog.php</code>, so it always matches what the app does.']);
?>

<section>
  <h2>Where this comes from</h2>
  <p class="prose">Milestone doesn't publish the physics, and Xbox has no telemetry, so there is nothing to calculate a setup from. What exists is how the garage is laid out and what guides and players say each setting does. This page's rules are built from those: RacingGames' MotoGP 24 setup guide and its track-by-track articles for earlier games, forum threads, and MotoGP 26 guides.</p>
  <ul class="prose">
    <li><strong>Track-driven rules</strong> (tyres, front disc, final ratio, gearing, bump compliance) are the ones the guides agree on, so the app computes them from the track.</li>
    <li><strong>Suspension and geometry are not guessed from the track.</strong> The track-by-track guides disagree with each other: Silverstone is given pre-load 1 and steering-head 1 (responsive), Mugello 5 and 5 (stable). So those are tuned from what the bike does, not from the circuit.</li>
    <li>The numbers on each setting's effect are my sizing of the directions the guides state. Treat them as a first draft and change them in the catalog as you learn what the game does.</li>
    <li>Setup only exists in the game's Pro experience. One MotoGP 26 guide says setup matters less than in car sims and that discs and tyres matter most. The app is built around that: it takes tyres and brakes seriously and keeps chassis changes small.</li>
  </ul>
</section>

<section>
  <h2>Sliders are normalised</h2>
  <p class="prose">The games' sliders are small whole numbers whose scale and default have changed between versions. The model never uses the raw number. It turns a slider into a position from -1 (lowest) to +1 (highest):</p>
  <p class="prose"><code>position = 2 × (value − lowest) ÷ (highest − lowest) − 1</code></p>
  <p class="prose">That is why each bike records its own lowest, highest and default, and why advice stays off until you've checked them.</p>
</section>

<section>
  <h2>The chassis: three handling axes</h2>
  <p class="prose">Each suspension and geometry setting moves the bike along three axes. A setting's effect is the shift from moving it across its whole range (two units).</p>
  <dl>
    <?php foreach ($MOTO['axes'] as $axis => $name): ?><div><dt><?= e($axis) ?>: <?= e($name) ?></dt><dd><?= ['S' => 'Positive: calmer and slower to turn. Negative: sharper and twitchier.', 'R' => 'Positive: rotates and tends to oversteer. Negative: pushes wide.', 'C' => 'Positive: soaks up bumps. Negative: firm.'][$axis] ?></dd></div><?php endforeach; ?>
  </dl>
  <div class="table-wrap"><table>
    <thead><tr><th>Setting</th><th class="num">Stability</th><th class="num">Rotation</th><th class="num">Compliance</th><th>A higher number means</th><th>Basis</th></tr></thead>
    <tbody>
    <?php foreach ($MOTO['params'] as $key => $d): if (!in_array($d['group'], MG_CHASSIS_GROUPS, true)) { continue; } ?>
      <tr><td><?= e($d['label']) ?></td>
        <?php foreach (['S', 'R', 'C'] as $a): ?><td class="num"><?= isset($d['effect'][$a]) ? MotoMath::signed($d['effect'][$a]) : '' ?></td><?php endforeach; ?>
        <td class="wrap-text"><?= e($d['higher']) ?></td><td><?= $conf[$d['conf']] ?></td></tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <p class="hint">"Assumed" settings count half as much as stated ones. "Unknown" ones are never moved.</p>

  <h3>From a complaint to slider moves</h3>
  <p class="prose">Each complaint asks for a shift on the axes, scaled by how bad it was (severity ÷ <?= (int) $cfg['severity_nominal'] ?>). The model picks the sliders one at a time, each time taking the one that closes the most of the remaining gap, then solves for the smallest moves that deliver it:</p>
  <p class="prose"><code>move = A · Wᵀ · (W · A · Wᵀ + <?= $cfg['ridge'] ?> · I)⁻¹ · wanted</code></p>
  <p class="prose">W holds the table above, A how freely each setting may move. The small ridge term (<?= $cfg['ridge'] ?>) stops a small complaint becoming a big move. Moves are then rounded to whole steps, never more than <?= (int) $cfg['max_steps'] ?> on one setting, and at most <?= (int) $cfg['max_chassis_moves'] ?> settings per complaint. Choosing one at a time means a setting that only cancels another's side effect is never left behind on its own.</p>
</section>

<section>
  <h2>Everything else: rules by complaint</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Complaint</th><th>What the model does</th></tr></thead>
    <tbody>
    <?php foreach ($MOTO['symptoms'] as $key => $s): ?>
      <tr><td class="wrap-text"><?= e($s['label']) ?></td><td class="wrap-text">
        <?php if (!empty($s['d'])): ?>Handling model: <?= e(mg_axis_text(array_map(fn ($v) => $v, $s['d']))) ?><?= !empty($s['only']) ? ' (' . e(implode(', ', $s['only'])) . ' only)' : '' ?>.<?php endif; ?>
        <?php foreach ($s['rules'] ?? [] as $r): $t = $r['param'] ?? $r['choice']; ?>
          <?= e(mg_label($t)) ?> <?= ($r['dir'] ?? $r['move']) > 0 ? 'up' : 'down' ?><?= isset($r['by']) ? ' (by ' . e($r['by']) . ')' : '' ?> <span class="muted">(<?= e($r['conf']) ?>)</span>.
        <?php endforeach; ?>
        <?php if (empty($s['d']) && empty($s['rules'])): ?>Noted only.<?php endif; ?>
      </td></tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <p class="hint">Rule moves are added up, so opposite complaints cancel (hitting the limiter and slow acceleration both move the final ratio, in opposite directions). A rule weaker than <?= $cfg['min_rule_score'] ?> after adding up is ignored. At most <?= (int) $cfg['max_total_moves'] ?> changes come out in total.</p>
</section>

<section>
  <h2>Starting point for a track</h2>
  <ul class="prose">
    <li><strong>Tyres.</strong> A hardness score from 0 to 1: <code><?= $cfg['tyre']['w_temp'] ?> × heat + <?= $cfg['tyre']['w_share'] ?> × corner share + <?= $cfg['tyre']['w_wear'] ?> × wear rating</code>. Heat runs from 0 at <?= nf($cfg['tyre']['temp_cold_c']) ?> °C track temperature to 1 at <?= nf($cfg['tyre']['temp_hot_c']) ?> °C. Corner share is the slow-corner share for the rear and the fast-corner share for the front (a <?= (int) ($cfg['tyre']['share_full'] * 100) ?>% share counts as full). The score is spread evenly over the dry compounds.</li>
    <li><strong>Front disc.</strong> Size grows with big braking zones (<?= (int) $cfg['brakes']['big_zones_min'] ?> or fewer is the smallest, <?= (int) $cfg['brakes']['big_zones_max'] ?> or more the largest). If <?= (int) $cfg['brakes']['quick_zones_for_cooling'] ?> or more braking zones come in quick succession, an extreme-cooling disc is preferred; otherwise a high-mass or standard one.</li>
    <li><strong>Final ratio.</strong> Moved from the default by the straight rating: rating 5 raises it by <?= $cfg['gearing']['final_gain'] ?> of half the slider, rating 1 lowers it by the same.</li>
    <li><strong>Gears.</strong> The same, using the average-speed rating and a gain of <?= $cfg['gearing']['gear_gain'] ?>. A track with long straights but low average speed gets a tall final ratio and ordinary gears.</li>
    <li><strong>Bumps.</strong> The bumpiness rating asks for bump compliance (<?= $cfg['gearing']['bump_gain'] ?> at the extremes) from the front and rear suspension sliders only.</li>
    <li>Pre-load, springs, geometry, electronics and the slipper clutch stay on the game's defaults.</li>
  </ul>
</section>

<section>
  <h2>Tyre wear projection</h2>
  <p class="prose"><code>wear per lap = percent worn ÷ laps ridden</code>, and <code>projected wear = wear per lap × race laps</code>. A tyre counts as used up at <?= nf($cfg['wear']['limit_pct']) ?>% worn. Tyres rarely wear in a straight line, so it's an early warning rather than a promise.</p>
</section>

<section>
  <h2>What it can't do</h2>
  <ul class="prose">
    <li>It can't see the game's physics, so every effect is a direction from the guides, not a measurement.</li>
    <li>The class differences in the garage aren't verified for 24 to 26. Older games gave Moto3 and Moto2 fewer electronics, so you tick what your bike's garage shows.</li>
    <li>The effect of the swingarm connector is unknown, so the model leaves it alone.</li>
    <li>Every session you log is kept with the setup change that preceded it, so over time your own results are a better guide than this page.</li>
  </ul>
</section>
<?php page_footer();
