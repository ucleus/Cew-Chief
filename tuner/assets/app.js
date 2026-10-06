(() => {
  'use strict';

  // Ask before destructive buttons.
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-confirm]');
    if (button && !window.confirm(button.dataset.confirm)) {
      e.preventDefault();
    }
  });

  // Car form: an unticked setting's fields are hidden by CSS; disable them
  // too so they are neither validated nor sent.
  const syncParam = (toggle) => {
    toggle.closest('.param').querySelectorAll('.param-body input').forEach((input) => {
      input.disabled = !toggle.checked;
    });
  };
  document.querySelectorAll('.param-toggle').forEach((toggle) => {
    syncParam(toggle);
    toggle.addEventListener('change', () => syncParam(toggle));
  });

  // Car form: copy a setting's front limits to the rear.
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-copy-front]');
    if (!button) return;
    const body = button.closest('.param-body');
    body.querySelectorAll('[data-scope="FRONT"] input').forEach((front) => {
      const rear = body.querySelector(`[name="${front.name.replace('[FRONT]', '[REAR]')}"]`);
      if (rear) rear.value = front.value;
    });
    const details = body.querySelector('[data-scope="REAR"] details');
    if (details && body.querySelector('[data-scope="FRONT"] details').open) details.open = true;
  });

  // Repeating rows (tyres, driver complaints).
  let rowCounter = 0;
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-add-row]');
    if (!button) return;
    const key = button.dataset.addRow;
    const template = document.querySelector(`template[data-template="${key}"]`);
    const container = document.querySelector(`[data-rows="${key}"]`);
    container.insertAdjacentHTML('beforeend', template.innerHTML.replaceAll('__i__', 'n' + rowCounter++));
    const first = container.lastElementChild.querySelector('input:not([type="hidden"]), select');
    if (first) first.focus();
  });

  // Setup form: typing on a left wheel fills the matching right wheel.
  const mirror = document.querySelector('[data-mirror]');
  if (mirror) {
    const twins = { FL: 'FR', RL: 'RR' };
    document.addEventListener('input', (e) => {
      const wheel = e.target.closest('.wheel[data-corner]');
      if (!mirror.checked || !wheel || !e.target.dataset.param) return;
      const other = twins[wheel.dataset.corner];
      if (!other) return;
      const twin = document.querySelector(`.wheel[data-corner="${other}"] [data-param="${e.target.dataset.param}"]`);
      if (twin) twin.value = e.target.value;
    });
  }

  // Stint form: read the lap list back as it is typed.
  const laps = document.querySelector('[data-laps]');
  const summary = document.querySelector('[data-laps-summary]');
  if (laps && summary) {
    const parse = (text) => {
      text = text.trim().replace(',', '.');
      let m = text.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
      if (m) return m[1] * 60000 + m[2] * 1000 + Number((m[3] || '0').padEnd(3, '0'));
      m = text.match(/^(\d{1,3})\.(\d{1,3})$/);
      if (m) return m[1] * 1000 + Number(m[2].padEnd(3, '0'));
      return /^\d{4,7}$/.test(text) ? Number(text) : null;
    };
    const format = (ms) => {
      ms = Math.round(ms);
      const s = Math.floor((ms % 60000) / 1000);
      return `${Math.floor(ms / 60000)}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
    };
    const update = () => {
      const valid = [];
      let skipped = 0;
      let bad = 0;
      laps.value.split(/\r?\n/).forEach((line, i) => {
        line = line.trim();
        if (!line) return;
        const excluded = /^[xX*]/.test(line);
        const ms = parse(line.replace(/^[xX*]\s*/, ''));
        if (ms === null) bad = bad || i + 1;
        else if (excluded) skipped++;
        else valid.push(ms);
      });
      if (bad) {
        summary.textContent = `Line ${bad} is not a lap time. Write it like 1:38.345.`;
      } else if (!valid.length) {
        summary.textContent = '';
      } else {
        const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
        summary.textContent = `${valid.length} ${valid.length === 1 ? 'lap counts' : 'laps count'}`
          + (skipped ? `, ${skipped} left out` : '')
          + `. Best ${format(Math.min(...valid))}, average ${format(mean)}.`;
      }
    };
    laps.addEventListener('input', update);
    update();
  }
})();

// Slow forms (the AI request): show that something is happening.
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-busy]');
  if (!form) return;
  const button = form.querySelector('button');
  setTimeout(() => {
    button.disabled = true;
    button.textContent = form.dataset.busy;
  }, 0);
});

// Charts. Chart.js is only loaded on pages that have one.
if (window.Chart) {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const lap = (ms) => {
    const s = Math.floor((ms % 60000) / 1000);
    return `${Math.floor(ms / 60000)}:${String(s).padStart(2, '0')}.${String(Math.round(ms % 1000)).padStart(3, '0')}`;
  };
  Chart.defaults.font.family = 'Saira, system-ui, sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = css('--muted');
  Chart.defaults.borderColor = css('--line');
  Chart.defaults.animation = false;
  Chart.defaults.elements.point.pointStyle = 'rect';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = css('--bar');
  Chart.defaults.plugins.tooltip.borderColor = css('--frame');
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.cornerRadius = 0;

  // Shades the tyre's working temperature window behind the bars.
  const windowBand = {
    id: 'windowBand',
    beforeDatasetsDraw(chart, _args, opts) {
      if (!opts.range) return;
      const { ctx, chartArea: area, scales: { y } } = chart;
      const top = Math.max(y.getPixelForValue(opts.range[1]), area.top);
      const bottom = Math.min(y.getPixelForValue(opts.range[0]), area.bottom);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = css('--teal');
      ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
      ctx.restore();
    },
  };

  document.querySelectorAll('canvas[data-chart]').forEach((canvas) => {
    const d = JSON.parse(canvas.dataset.values);
    if (canvas.dataset.chart === 'tyres') {
      const all = [...d.inside, ...d.middle, ...d.outside, ...d.window];
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: d.labels,
          datasets: [
            { label: 'Inside', data: d.inside, backgroundColor: css('--text') },
            { label: 'Middle', data: d.middle, backgroundColor: css('--cyan') },
            { label: 'Outside', data: d.outside, backgroundColor: css('--orange') },
          ],
        },
        options: {
          maintainAspectRatio: false,
          scales: {
            y: { min: Math.floor(Math.min(...all) / 5) * 5 - 5, max: Math.ceil(Math.max(...all) / 5) * 5 + 5, title: { display: true, text: '°C' } },
            x: { grid: { display: false } },
          },
          plugins: { windowBand: { range: d.window }, legend: { position: 'bottom' } },
        },
        plugins: [windowBand],
      });
    }
    if (canvas.dataset.chart === 'progress') {
      new Chart(canvas, {
        type: 'line',
        data: {
          labels: d.labels,
          datasets: [
            { label: 'Best lap', data: d.best, borderColor: css('--cyan'), backgroundColor: css('--cyan'), spanGaps: true, pointRadius: 5 },
            { label: 'Average lap', data: d.average, borderColor: css('--muted'), backgroundColor: css('--muted'), borderDash: [6, 4], spanGaps: true, pointRadius: 4 },
          ],
        },
        options: {
          maintainAspectRatio: false,
          scales: { y: { ticks: { callback: (v) => lap(v) } }, x: { offset: true, grid: { display: false } } },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${lap(c.parsed.y)}` } },
          },
        },
      });
    }
  });
}

// MotoGP bike form: an unticked setting greys out and is not sent.
document.querySelectorAll('.setting-toggle').forEach((toggle) => {
  const row = toggle.closest('.setting');
  const sync = () => {
    row.classList.toggle('off', !toggle.checked);
    row.querySelectorAll('input[type="number"], .flip input').forEach((i) => { i.disabled = !toggle.checked; });
  };
  sync();
  toggle.addEventListener('change', sync);
});

// MotoGP bike form: one scale for every ticked setting.
document.querySelector('[data-bulk-apply]')?.addEventListener('click', () => {
  const lo = document.querySelector('[data-bulk-min]').value;
  const hi = document.querySelector('[data-bulk-max]').value;
  const df = document.querySelector('[data-bulk-default]').value;
  document.querySelectorAll('.setting').forEach((row) => {
    if (!row.querySelector('.setting-toggle').checked) return;
    if (lo !== '') row.querySelector('[name$="[min]"]').value = lo;
    if (hi !== '') row.querySelector('[name$="[max]"]').value = hi;
    if (df !== '') row.querySelector('[name$="[default]"]').value = df;
  });
});

// Tables: on a phone each row stacks into a block, each cell labelled by its column.
document.querySelectorAll('.table-wrap > table:not(.no-stack)').forEach((table) => {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  table.querySelectorAll('tbody tr').forEach((tr) => {
    [...tr.children].forEach((td, i) => {
      if (!td.hasAttribute('data-label')) td.dataset.label = heads[i] || '';
    });
  });
  table.classList.add('stack');
});

// MotoGP garage sliders: the number is saved, the bar mirrors it and can be dragged.
document.querySelectorAll('input[type="range"][data-slider-for]').forEach((range) => {
  const number = document.getElementById(range.dataset.sliderFor);
  const box = range.closest('.slider');
  if (!number || !box) return;
  const min = Number(range.min);
  const span = Math.max(1, Number(range.max) - min);
  const show = (value) => {
    range.style.setProperty('--f', String((Math.min(Math.max(value, min), min + span) - min) / span));
    box.classList.toggle('is-changed', String(value) !== box.dataset.default);
  };
  range.addEventListener('input', () => {
    number.value = range.value;
    show(Number(range.value));
  });
  number.addEventListener('input', () => {
    if (number.value === '' || Number.isNaN(Number(number.value))) return;
    range.value = number.value;
    show(Number(number.value));
  });
});
