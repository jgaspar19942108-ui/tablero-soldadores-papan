(() => {
  const root = document.querySelector('.cm');
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fInt = d3.format(',.0f'), fDec = d3.format(',.1f'), fPct = d3.format('.1%');
  const fFecha = (s) => (s ? `${+s.slice(8, 10)} ${MES[+s.slice(5, 7) - 1]}` : '—');
  const fFechaY = (s) => (s ? `${+s.slice(8, 10)} ${MES[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '—');
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const FMT = {
    int: (v) => (num(v) == null ? '—' : fInt(num(v))),
    absint: (v) => (num(v) == null ? '—' : fInt(Math.abs(num(v)))),
    dec: (v) => (num(v) == null ? '—' : fDec(num(v))),
    pct: (v) => (num(v) == null ? '—' : fPct(num(v))),
    fecha: (v) => (v ? fFechaY(v) : '—'),
    delta: (v) => (num(v) == null ? '—' : (num(v) >= 0 ? '+' : '−') + fPct(Math.abs(num(v)))),
    dias: (v) => (num(v) == null ? '—' : num(v) > 0 ? `${fInt(num(v))} días de atraso` : num(v) < 0 ? `${fInt(-num(v))} días antes` : 'a tiempo'),
  };
  const PER_NAME = { semana: 'semana en curso', '4sem': 'últimas 4 semanas', todo: 'todo el registro' };
  const PREV_NAME = { semana: 'vs. mismos días de la semana pasada', '4sem': 'vs. las 4 semanas previas', todo: '' };
  const color = (i) => dash.colors[i % dash.colors.length];

  // ---------- period + tabs ----------
  const per = () => dash.params().periodo || 'semana';
  root.querySelectorAll('.cm-seg button').forEach((b) => b.addEventListener('click', () => dash.setParams({ periodo: b.dataset.per })));
  let tab = 'resumen';
  const showTab = (id, push = true) => {
    if (!document.getElementById(id)) return;
    tab = id;
    root.querySelectorAll('.cm-page').forEach((p) => (p.hidden = p.id !== id));
    root.querySelectorAll('.cm-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    document.getElementById('periodo-ctl').style.visibility = id === 'calidad' ? 'hidden' : 'visible';
    if (push) dash.setLink(id);
    draw();
  };
  root.querySelectorAll('.cm-tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- helpers ----------
  const get = (id) => dash.data(id);
  const rowsOf = (id) => { const d = get(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : []; };
  const stateOf = (ids) => {
    const s = ids.map((i) => get(i).status);
    if (s.some((x) => x === 'error' || x === 'declined' || x === 'connect' || x === 'missing')) return 'error';
    if (s.every((x) => x === 'ok')) return 'ok';
    return 'loading';
  };
  const failBox = (el) => { el.classList.remove('dash-skeleton'); el.replaceChildren(); const d = document.createElement('div'); d.className = 'cm-fail'; d.textContent = 'Failed to load'; el.append(d); };
  const prep = (el, ids) => {
    const s = stateOf(ids);
    if (s === 'error') { failBox(el); return false; }
    if (s === 'loading') { el.classList.add('dash-skeleton'); el.replaceChildren(); return false; }
    el.classList.remove('dash-skeleton');
    return true;
  };
  const tipFor = (box) => { let t = box.querySelector('.cm-tip'); if (!t) { t = document.createElement('div'); t.className = 'cm-tip'; box.append(t); } return t; };
  const showTip = (box, tip, html, x, y) => {
    tip.replaceChildren(...html);
    tip.style.display = 'block';
    const w = tip.offsetWidth, bw = box.clientWidth;
    tip.style.left = Math.max(0, Math.min(bw - w, x + 12)) + 'px';
    tip.style.top = Math.max(0, y - 10) + 'px';
  };
  const tipLines = (head, lines) => {
    const h = document.createElement('div'); h.className = 'h'; h.textContent = head;
    return [h, ...lines.map(([c, name, val]) => {
      const d = document.createElement('div');
      if (c) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = c; d.append(s); }
      d.append(document.createTextNode(`${name}: ${val}`));
      return d;
    })];
  };
  const legend = (el, items) => {
    el.replaceChildren(...items.map(([c, name, dashed]) => {
      const s = document.createElement('span'); const i = document.createElement('i');
      if (dashed) { i.className = 'dash'; i.style.borderColor = c; } else i.style.background = c;
      s.append(i, document.createTextNode(name)); return s;
    }));
  };
  const textW = (svg, str) => { const t = svg.append('text').text(str); const w = t.node().getComputedTextLength(); t.remove(); return w; };
  const cleanAxis = (g) => { g.attr('font-size', null).attr('font-family', null); g.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); g.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'); };

  // ---------- marks ----------
  const fillMarks = () => {
    const p = per();
    root.querySelectorAll('.cm-per').forEach((el) => el.setAttribute('data-where', 'periodo=' + p));
    root.querySelectorAll('.cm-per-name').forEach((el) => (el.textContent = PER_NAME[p]));
    root.querySelectorAll('.cm-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.per === p)));
    root.querySelectorAll('[data-fmt]').forEach((el) => {
      const id = el.getAttribute('data-source'); const d = get(id);
      if (d.status !== 'ok') { if (d.status !== 'loading') { el.classList.remove('dash-skeleton'); el.textContent = '—'; } return; }
      el.classList.remove('dash-skeleton');
      let row;
      if (el.hasAttribute('data-row')) row = d.data[+el.getAttribute('data-row')];
      else { const [k, v] = el.getAttribute('data-where').split('='); row = d.data.find((r) => String(r[k]) === v); }
      const v = row ? row[el.getAttribute('data-field')] : null;
      el.textContent = FMT[el.getAttribute('data-fmt')](v);
    });
    // colours and words that follow values
    const pr = rowsOf('proyeccion')[0];
    const kp = rowsOf('kpi_periodo').find((r) => r.periodo === p);
    const w = root.querySelector('.cm-desfase-word');
    if (pr) {
      w.textContent = pr.dias_desfase > 0 ? 'después' : 'antes';
      const desf = root.querySelector('.cm-desf'); desf.className = 'cm-desf ' + (pr.dias_desfase > 0 ? 'cm-down' : 'cm-up');
      const nec = root.querySelector('.cm-nec'); nec.className = 'cm-nec ' + (pr.ritmo_necesario > pr.ritmo_4sem ? 'cm-down' : 'cm-up');
    }
    const dl = root.querySelector('.cm-delta');
    dl.classList.toggle('cm-up', !!kp && kp.cambio_vs_previo > 0);
    dl.classList.toggle('cm-down', !!kp && kp.cambio_vs_previo < 0);
    root.querySelector('.cm-delta-l').textContent = kp && kp.cambio_vs_previo != null ? PREV_NAME[p] : '';
    const rs = rowsOf('rt_resumen')[0]; const pc = rowsOf('proyeccion')[0];
    const age = root.querySelector('.cm-rt-age');
    if (rs && pc && rs.ultimo_reporte) {
      const dd = Math.round((new Date(pc.fecha_corte) - new Date(rs.ultimo_reporte)) / 864e5);
      age.textContent = `${fInt(dd)} días sin reporte al corte`;
      age.className = 'cm-tile-s cm-rt-age ' + (dd > 14 ? 'cm-down' : '');
    } else age.textContent = '';
    const rr = root.querySelector('.cm-rech'); if (rs) rr.classList.toggle('cm-warn', rs.pct_rechazo_rt > 0.05);
    const rp = root.querySelector('.cm-reppend'); if (rs) rp.classList.toggle('cm-down', rs.reparacion_pend > 0);
  };

  // ---------- Curva S ----------
  const drawCurva = () => {
    const el = document.getElementById('ch-curva');
    if (!prep(el, ['curva_s', 'curva_proyeccion', 'proyeccion', 'curva_reprog'])) return;
    const cs = rowsOf('curva_s'), cp = rowsOf('curva_proyeccion'), pr = rowsOf('proyeccion')[0], cr = rowsOf('curva_reprog');
    const P = (s) => new Date(s + 'T00:00:00Z');
    const plan = cr.map((r) => ({ x: P(r.fecha), y: +r.pulg_reprog_acum, f: r.fecha }));
    const real = cs.filter((r) => r.pulg_real_acum !== '' && r.pulg_real_acum != null).map((r) => ({ x: P(r.fecha), y: +r.pulg_real_acum, f: r.fecha }));
    const proy = cp.map((r) => ({ x: P(r.fecha), y: +r.pulg_proyectadas, f: r.fecha }));
    const C = [color(0), 'var(--cds-chart-muted)', color(0)];
    legend(document.getElementById('leg-curva'), [[C[0], 'Real'], [C[1], 'Reprogramado a la meta'], [C[2], 'Proyección al ritmo actual', true]]);
    el.replaceChildren();
    const W = el.clientWidth || 600, H = 300;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const all = [...plan, ...real, ...proy];
    const yMax = d3.max(all, (d) => d.y) * 1.05;
    const y = d3.scaleLinear([0, yMax], [H - 24, 10]).nice();
    const yTicks = y.ticks(5);
    const ml = Math.max(...yTicks.map((t) => textW(svg, fInt(t)))) + 10;
    const endLbl = (pr ? fInt(pr.pulg_total_programa) : '');
    const mr = Math.max(60, textW(svg, 'Meta ' + endLbl) + 10);
    const x = d3.scaleUtc(d3.extent(all, (d) => d.x), [ml, W - mr]);
    const xt = Math.max(2, Math.floor((W - ml - mr) / 70));
    const [x0d, x1d] = x.domain();
    const months = d3.utcMonth.range(d3.utcMonth.ceil(x0d), x1d);
    const step = Math.max(1, Math.ceil(months.length / Math.max(1, xt)));
    const tv = months.filter((_, i) => i % step === 0);
    svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x).tickValues(tv).tickFormat((d) => `${MES[d.getUTCMonth()]}${d.getUTCMonth() === 0 ? ' ' + d.getUTCFullYear() : ''}`).tickSizeOuter(0)).call(cleanAxis);
    svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fInt).tickSize(-(W - ml - mr))).call(cleanAxis).call((g) => g.select('.domain').remove());
    if (pr) {
      const yt = y(pr.pulg_total_programa), xm = x(P(pr.fecha_meta));
      svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', yt).attr('y2', yt).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
      svg.append('line').attr('x1', xm).attr('x2', xm).attr('y1', 10).attr('y2', H - 24).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', W - mr + 6).attr('y', yt + 4).text('Total ' + endLbl);
      svg.append('text').attr('x', xm - 4).attr('y', 20).attr('text-anchor', 'end').text('Meta ' + fFecha(pr.fecha_meta));
    }
    const line = d3.line().x((d) => x(d.x)).y((d) => y(d.y));
    const path = (data, c, dash, w) => svg.append('path').datum(data).attr('fill', 'none').attr('stroke', c).attr('stroke-width', w).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('stroke-dasharray', dash).attr('d', line);
    path(plan, C[1], null, 2);
    path(proy, C[2], '6 4', 2);
    path(real, C[0], null, 2.5);
    const last = proy[proy.length - 1];
    if (last) svg.append('text').attr('class', 'lbl').attr('x', x(last.x) + 6).attr('y', y(last.y) + 16).text(fFecha(last.f));
    const dot = svg.append('circle').attr('r', 4).attr('fill', C[0]).style('display', 'none');
    const tip = tipFor(el);
    const near = (arr, xv) => arr.length ? arr.reduce((a, b) => (Math.abs(b.x - xv) < Math.abs(a.x - xv) ? b : a)) : null;
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml - mr).attr('height', H - 24).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx, my] = d3.pointer(ev);
        const xv = x.invert(mx);
        const p = near(plan, xv);
        const r = near(real, xv), q = near(proy, xv);
        const lines = [];
        const tol = 4 * 864e5;
        if (r && Math.abs(r.x - p.x) < tol) lines.push([C[0], 'Real', fInt(r.y)]);
        if (q && Math.abs(q.x - p.x) < tol) lines.push([C[2], 'Proyección', fInt(q.y)]);
        lines.push([C[1], 'Reprogramado', fInt(p.y)]);
        dot.style('display', null).attr('cx', x(p.x)).attr('cy', y(lines[0][0] === C[1] ? p.y : (r && Math.abs(r.x - p.x) < tol ? r.y : q.y)));
        const rect = el.getBoundingClientRect(); const sc = rect.width / W;
        showTip(el, tip, tipLines(fFechaY(p.f), lines), mx * sc, my * sc);
      })
      .on('pointerleave', () => { tip.style.display = 'none'; dot.style('display', 'none'); });
  };

  // ---------- generic bar chart ----------
  const barChart = (el, rows, { xKey, xFmt, series, ref, partialKey, height = 240 }) => {
    el.replaceChildren();
    const W = el.clientWidth || 500, H = height;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const yMax = Math.max(d3.max(rows, (r) => d3.max(series, (s) => +r[s.key])) || 1, ref ? ref.value : 0) * 1.08;
    const y = d3.scaleLinear([0, yMax], [H - 24, 10]).nice();
    const ml = Math.max(...y.ticks(4).map((t) => textW(svg, fInt(t)))) + 10;
    const mr = ref ? Math.max(40, textW(svg, ref.label) + 8) : 8;
    const x0 = d3.scaleBand(rows.map((r) => r[xKey]), [ml, W - mr]).padding(0.2);
    const x1 = d3.scaleBand(series.map((s) => s.key), [0, x0.bandwidth()]).padding(0.08);
    const lw = d3.max(rows, (r) => textW(svg, xFmt(r[xKey]))) + 8;
    const every = Math.max(1, Math.ceil(lw / x0.step()));
    svg.append('g').attr('transform', `translate(0,${H - 24})`).call(d3.axisBottom(x0).tickFormat((d, i) => (i % every === (rows.length - 1) % every ? xFmt(d) : '')).tickSizeOuter(0).tickSize(0).tickPadding(8)).call(cleanAxis);
    svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fInt).tickSize(-(W - ml - mr))).call(cleanAxis).call((g) => g.select('.domain').remove());
    const g = svg.append('g');
    const bw = Math.min(32, x1.bandwidth());
    rows.forEach((r) => series.forEach((s) => {
      const v = +r[s.key];
      g.append('rect').attr('x', x0(r[xKey]) + x1(s.key) + (x1.bandwidth() - bw) / 2).attr('width', bw)
        .attr('y', y(v)).attr('height', Math.max(0, y(0) - y(v))).attr('rx', Math.min(4, bw / 2))
        .attr('fill', s.color).attr('fill-opacity', partialKey && r[partialKey] ? 0.45 : 1);
    }));
    if (ref) {
      const yr = y(ref.value);
      svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', yr).attr('y2', yr).attr('stroke', 'var(--cds-chart-status-critical)').attr('stroke-dasharray', '4 3');
      svg.append('text').attr('x', W - mr + 4).attr('y', yr + 4).attr('class', 'lbl').text(ref.label);
    }
    const tip = tipFor(el);
    const hl = svg.append('rect').attr('fill', 'var(--cds-chart-grid)').attr('opacity', 0.35).style('display', 'none').attr('y', 10).attr('height', H - 34);
    hl.lower();
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml - mr).attr('height', H - 24).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx, my] = d3.pointer(ev);
        const i = Math.max(0, Math.min(rows.length - 1, Math.floor((mx - ml - x0.step() * x0.paddingOuter()) / x0.step())));
        const r = rows[i];
        hl.style('display', null).attr('x', x0(r[xKey]) - x0.step() * x0.paddingInner() / 2).attr('width', x0.step());
        const sc = el.getBoundingClientRect().width / W;
        showTip(el, tip, tipLines(xFmt(r[xKey], true) + (partialKey && r[partialKey] ? ' (en curso)' : ''), series.map((s) => [series.length > 1 ? s.color : null, s.name, fInt(+r[s.key])])), mx * sc, my * sc);
      })
      .on('pointerleave', () => { tip.style.display = 'none'; hl.style('display', 'none'); });
  };

  const drawSemanal = () => {
    const el = document.getElementById('ch-semanal');
    if (!prep(el, ['semanal', 'proyeccion'])) return;
    const rows = rowsOf('semanal').slice(-16);
    const pr = rowsOf('proyeccion')[0];
    barChart(el, rows, {
      xKey: 'semana', xFmt: (s, long) => (long ? 'Semana del ' + fFechaY(s) : fFecha(s)),
      series: [{ key: 'pulg_soldadas', name: 'Pulg-Ø soldadas', color: color(0) }],
      ref: pr && pr.ritmo_necesario ? { value: pr.ritmo_necesario, label: 'Necesario ' + fInt(pr.ritmo_necesario) } : null,
      partialKey: 'parcial',
    });
  };

  const drawDiario = () => {
    const el = document.getElementById('ch-diario');
    legend(document.getElementById('leg-diario'), [[color(0), 'Soldado'], [color(1), 'Armado (fit-up)']]);
    if (!prep(el, ['diario'])) return;
    const rows = rowsOf('diario');
    barChart(el, rows, {
      xKey: 'dia', xFmt: (s, long) => (long ? fFechaY(s) : fFecha(s)),
      series: [{ key: 'pulg_soldadas', name: 'Soldado', color: color(0) }, { key: 'pulg_armadas', name: 'Armado', color: color(1) }],
    });
  };

  // ---------- ranking bars (HTML) ----------
  const FRENTES = ['EMC', 'COBERTIZO', 'SIN ASIGNAR'];
  const frenteColor = (f) => (f === 'SIN ASIGNAR' ? 'var(--cds-chart-muted)' : color(Math.max(0, FRENTES.indexOf(f)) + 2));
  const rank = (el, rows, { label, sub, value, valTxt, valSub, colorOf, max, stack }) => {
    el.replaceChildren();
    const m = max || d3.max(rows, value) || 1;
    rows.forEach((r) => {
      const row = document.createElement('div'); row.className = 'cm-rank-row';
      const n = document.createElement('div'); n.className = 'cm-rank-name';
      const b = document.createElement('b'); b.textContent = label(r); n.append(b);
      if (sub) n.append(document.createTextNode(sub(r)));
      n.title = n.textContent;
      const tr = document.createElement('div'); tr.className = 'cm-rank-track';
      tr.style.display = 'flex';
      (stack ? stack(r) : [[value(r), colorOf(r)]]).forEach(([v, c]) => {
        const f = document.createElement('div'); f.className = 'cm-rank-fill'; f.style.width = (100 * v / m) + '%'; f.style.background = c;
        if (stack) f.style.borderRadius = '0';
        tr.append(f);
      });
      const v = document.createElement('div'); v.className = 'cm-rank-val'; v.textContent = valTxt(r);
      if (valSub) { const s = document.createElement('small'); s.textContent = valSub(r); v.append(s); }
      row.append(n, tr, v); el.append(row);
    });
  };

  const drawServicios = () => {
    const el = document.getElementById('rk-serv');
    if (!prep(el, ['servicios'])) return;
    const rows = rowsOf('servicios');
    rank(el, rows, {
      label: (r) => r.servicio.charAt(0) + r.servicio.slice(1).toLowerCase(), value: (r) => r.avance, max: 1,
      stack: (r) => [[r.avance, color(0)]],
      valTxt: (r) => fPct(r.avance), valSub: (r) => `faltan ${fInt(r.pulg_pendientes)}`,
    });
  };

  // ---------- sortable table ----------
  const tables = {};
  const table = (id, rows, cols, keyCols, opts = {}) => {
    const t = document.getElementById(id);
    const st = (tables[id] ??= { sort: opts.sort || null, dir: -1, q: '' });
    const ths = [...t.querySelectorAll('thead th')];
    ths.forEach((th) => {
      if (!th.querySelector('button')) {
        const b = document.createElement('button'); b.textContent = th.textContent; th.replaceChildren(b);
        b.addEventListener('click', () => { const f = th.dataset.field; if (st.sort === f) st.dir *= -1; else { st.sort = f; st.dir = typeof rows[0]?.[f] === 'number' ? -1 : 1; } draw(); });
      }
      th.setAttribute('aria-sort', st.sort === th.dataset.field ? (st.dir > 0 ? 'ascending' : 'descending') : 'none');
    });
    let rs = rows.slice();
    if (st.q) rs = rs.filter((r) => cols.some((c) => String(r[c.f] ?? '').toLowerCase().includes(st.q)));
    if (st.sort) rs.sort((a, b) => { const x = a[st.sort], y = b[st.sort]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * st.dir; });
    const tb = t.querySelector('tbody');
    tb.replaceChildren(...rs.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = keyCols.map((k) => encodeURIComponent(r[k])).join(',');
      if (opts.idle && opts.idle(r)) tr.className = 'idle';
      cols.forEach((c) => { const td = document.createElement('td'); if (c.t) td.className = 't'; td.textContent = c.fmt ? c.fmt(r[c.f]) : (r[c.f] ?? '—'); tr.append(td); });
      return tr;
    }));
  };
  const bindSearch = (inputId, tableId) => {
    const i = document.getElementById(inputId);
    i.addEventListener('input', () => { (tables[tableId] ??= { sort: null, dir: -1, q: '' }).q = i.value.trim().toLowerCase(); draw(); });
  };
  bindSearch('q-sold', 'tb-sold'); bindSearch('q-tub', 'tb-tub');
  const tableState = (el, ids) => { const s = stateOf(ids); el.classList.toggle('dash-skeleton', s === 'loading'); return s === 'ok'; };

  const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  const drawResp = () => {
    const t = document.getElementById('tb-resp');
    if (!tableState(t, ['responsables'])) { t.querySelector('tbody').replaceChildren(); return; }
    const p = per();
    table('tb-resp', rowsOf('responsables').filter((r) => r.periodo === p), [
      { f: 'responsable', t: 1 }, { f: 'rol', t: 1 }, { f: 'activos', fmt: FMT.int }, { f: 'plantilla', fmt: FMT.int }, { f: 'pulg', fmt: FMT.int }, { f: 'pulg_persona_dia', fmt: FMT.dec },
    ], ['periodo', 'rol', 'responsable'], { idle: (r) => !r.activos });
  };

  // ---------- people pages ----------
  const drawPeople = (kind) => {
    const S = kind === 'sold';
    const ds = S ? 'soldadores' : 'tuberos';
    const rk = document.getElementById(S ? 'rk-sold' : 'rk-tub');
    const p = per();
    const frs = FRENTES;
    legend(document.getElementById(S ? 'leg-frente-s' : 'leg-frente-t'), frs.map((f) => [frenteColor(f), titleCase(f)]));
    if (prep(rk, [ds])) {
      const rows = rowsOf(ds).filter((r) => r.periodo === p);
      rank(rk, rows, {
        label: (r) => r.clave, sub: (r) => titleCase(r.nombre.split(' ')[0]) + ' ' + titleCase(r.nombre.split(' ').slice(-2, -1)[0] || ''),
        value: (r) => r.pulg, colorOf: (r) => (r.pulg ? frenteColor(r.frente) : 'var(--cds-chart-muted)'),
        valTxt: (r) => fInt(r.pulg), valSub: (r) => (r.pulg_dia != null ? fDec(r.pulg_dia) + '/día' : 'sin producción'),
      });
    }
    const t = document.getElementById(S ? 'tb-sold' : 'tb-tub');
    if (tableState(t, [ds])) {
      const cols = [{ f: 'clave', t: 1 }, { f: 'nombre', t: 1 }, { f: 'frente', t: 1, fmt: titleCase }, { f: 'responsable', t: 1 }, { f: 'juntas', fmt: FMT.int }, { f: 'pulg', fmt: FMT.dec }, { f: 'dias', fmt: FMT.int }, { f: 'pulg_dia', fmt: FMT.dec }, { f: 'diam_prom', fmt: FMT.dec }];
      if (S) cols.push({ f: 'pct_campo', fmt: FMT.pct }, { f: 'rt_rechazadas', fmt: FMT.int }, { f: 'pct_rechazo', fmt: FMT.pct });
      else cols.push({ f: 'juntas_ya_soldadas', fmt: FMT.int }, { f: 'pct_soldado', fmt: FMT.pct });
      table(t.id, rowsOf(ds).filter((r) => r.periodo === p), cols, ['periodo', 'clave'], { idle: (r) => !r.juntas });
    } else t.querySelector('tbody').replaceChildren();
    // heatmap
    const hm = document.getElementById(S ? 'hm-sold' : 'hm-tub');
    if (!prep(hm, ['mapa_semana'])) return;
    const rol = S ? 'Soldador' : 'Tubero';
    const cells = rowsOf('mapa_semana').filter((r) => r.rol === rol);
    const dias = [...new Set(cells.map((r) => r.dia))].sort();
    const tot = d3.rollup(cells, (v) => d3.sum(v, (r) => r.pulg), (r) => r.clave);
    const people = [...tot.keys()].sort((a, b) => tot.get(b) - tot.get(a));
    const mx = d3.max(cells, (r) => r.pulg) || 1;
    hm.replaceChildren();
    if (!people.length) { const n = document.createElement('p'); n.className = 'cm-note'; n.textContent = 'Sin registros con clave esta semana.'; hm.append(n); return; }
    const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const tb = document.createElement('table');
    const hr = document.createElement('tr'); hr.append(document.createElement('th'));
    dias.forEach((d) => { const th = document.createElement('th'); th.textContent = DOW[new Date(d + 'T00:00:00Z').getUTCDay()] + ' ' + (+d.slice(8)); hr.append(th); });
    const tt = document.createElement('th'); tt.textContent = 'Total'; hr.append(tt); tb.append(hr);
    const tip = tipFor(hm); hm.style.position = 'relative';
    people.forEach((c) => {
      const tr = document.createElement('tr'); const th = document.createElement('th'); th.className = 'r'; th.textContent = c; tr.append(th);
      dias.forEach((d) => {
        const r = cells.find((x) => x.clave === c && x.dia === d) || { pulg: 0, juntas: 0 };
        const td = document.createElement('td');
        td.textContent = r.pulg ? fDec(r.pulg).replace(/\.0$/, '') : '·';
        if (!r.pulg) td.className = 'z';
        td.style.background = r.pulg ? `color-mix(in srgb, ${color(S ? 0 : 1)} ${Math.round(15 + 70 * r.pulg / mx)}%, transparent)` : 'transparent';
        td.addEventListener('pointerenter', () => { const b = hm.getBoundingClientRect(), e = td.getBoundingClientRect(); showTip(hm, tip, tipLines(`${c} · ${fFechaY(d)}`, [[null, 'Pulg-Ø', fDec(r.pulg)], [null, 'Juntas', fInt(r.juntas)]]), e.left - b.left + hm.scrollLeft + e.width / 2, e.top - b.top + e.height); });
        td.addEventListener('pointerleave', () => (tip.style.display = 'none'));
        tr.append(td);
      });
      const tdt = document.createElement('td'); tdt.className = 'tot'; tdt.textContent = fDec(tot.get(c)).replace(/\.0$/, ''); tr.append(tdt);
      tb.append(tr);
    });
    hm.append(tb);
  };

  // ---------- quality ----------
  const drawRT = () => {
    const el = document.getElementById('rk-rt');
    const CRIT = 'var(--cds-chart-status-critical)';
    legend(document.getElementById('leg-rt'), [[color(0), 'Aceptadas'], [color(4), 'Rechazadas ya reparadas'], [CRIT, 'Rechazadas por reparar']]);
    if (prep(el, ['rt_soldador'])) {
      const rows = rowsOf('rt_soldador').filter((r) => r.rt_insp > 0);
      const m = d3.max(rows, (r) => r.rt_insp) || 1;
      rank(el, rows, {
        label: (r) => r.clave, value: (r) => r.rt_insp, max: m,
        stack: (r) => [[r.rt_aceptadas, color(0)], [r.reparadas_ok, color(4)], [r.reparacion_pend, CRIT]],
        valTxt: (r) => fInt(r.rt_insp), valSub: (r) => fPct(r.pct_rechazo_rt) + ' rech.',
      });
    }
    const t = document.getElementById('tb-rt');
    if (tableState(t, ['rt_soldador'])) {
      table('tb-rt', rowsOf('rt_soldador'), [{ f: 'clave', t: 1 }, { f: 'rt_insp', fmt: FMT.int }, { f: 'rt_rechazadas', fmt: FMT.int }, { f: 'pct_rechazo_rt', fmt: FMT.pct }, { f: 'reparadas_ok', fmt: FMT.int }, { f: 'reparacion_pend', fmt: FMT.int }, { f: 'pt_insp', fmt: FMT.int }, { f: 'pct_rechazo_pt', fmt: FMT.pct }, { f: 'claves_corregidas', fmt: FMT.int }], ['clave']);
    } else t.querySelector('tbody').replaceChildren();
    // semanal: barras de juntas con RT y línea de % de rechazo
    const ch = document.getElementById('ch-rt-sem');
    legend(document.getElementById('leg-rt-sem'), [[color(0), 'Juntas con RT'], [CRIT, 'Rechazadas'], [CRIT, '% de rechazo', true]]);
    if (!prep(ch, ['rt_semanal'])) return;
    const rows = rowsOf('rt_semanal');
    barChart(ch, rows, { xKey: 'semana', xFmt: (s, long) => (long ? 'Semana del ' + fFechaY(s) : fFecha(s)),
      series: [{ key: 'rt_insp', name: 'Juntas con RT', color: color(0) }, { key: 'rt_rechazadas', name: 'Rechazadas', color: CRIT }] });
    const svg = d3.select(ch).select('svg');
    const W = +svg.attr('viewBox').split(' ')[2], H = +svg.attr('viewBox').split(' ')[3];
    const xs = rows.map((r) => r.semana);
    const bands = svg.selectAll('rect[rx]').nodes();
    const nS = 2, cx = (i) => { const a = bands[i * nS], b = bands[i * nS + 1]; return (+a.getAttribute('x') + +b.getAttribute('x') + +b.getAttribute('width')) / 2; };
    const yMax = Math.max(0.3, d3.max(rows, (r) => r.pct_rechazo) * 1.15);
    const y2 = d3.scaleLinear([0, yMax], [H - 24, 10]);
    const pts = rows.map((r, i) => [cx(i), y2(r.pct_rechazo)]);
    svg.append('path').attr('d', d3.line()(pts)).attr('fill', 'none').attr('stroke', CRIT).attr('stroke-width', 2).attr('stroke-dasharray', '5 3').attr('stroke-linejoin', 'round');
    svg.selectAll('circle.pr').data(rows).join('circle').attr('class', 'pr').attr('r', 3).attr('cx', (d, i) => pts[i][0]).attr('cy', (d, i) => pts[i][1]).attr('fill', CRIT);
    svg.selectAll('text.pr').data(rows).join('text').attr('class', 'pr lbl').attr('x', (d, i) => pts[i][0]).attr('y', (d, i) => pts[i][1] - 7).attr('text-anchor', 'middle').text((d) => d3.format('.0%')(d.pct_rechazo));
  };

  const drawInsp = () => {
    legend(document.getElementById('leg-insp'), [[color(0), 'Avance RT'], [color(1), 'Avance PT']]);
    const t = document.getElementById('tb-insp');
    if (!tableState(t, ['inspeccion'])) { t.querySelector('tbody').replaceChildren(); return; }
    const rows = rowsOf('inspeccion');
    const bar = (v, c) => {
      if (v == null) { const d = document.createElement('span'); d.textContent = '—'; return d; }
      const w = document.createElement('div'); w.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:6.5rem';
      const tr = document.createElement('div'); tr.className = 'cm-rank-track'; tr.style.flex = '1'; tr.style.height = '10px';
      const f = document.createElement('div'); f.className = 'cm-rank-fill'; f.style.width = (100 * (v || 0)) + '%'; f.style.background = c; tr.append(f);
      const l = document.createElement('span'); l.textContent = fPct(v || 0); l.style.minWidth = '3.2rem'; l.style.textAlign = 'right';
      w.append(tr, l); return w;
    };
    table('tb-insp', rows, [{ f: 'area', t: 1 }, { f: 'juntas_total', fmt: FMT.int }, { f: 'bw_total', fmt: FMT.int }, { f: 'bw_soldadas', fmt: FMT.int }, { f: 'rt_hechas', fmt: FMT.int }, { f: 'rt_pend', fmt: FMT.int }, { f: 'pct_rt', t: 1, fmt: FMT.pct }, { f: 'sw_total', fmt: FMT.int }, { f: 'sw_soldadas', fmt: FMT.int }, { f: 'pt_hechas', fmt: FMT.int }, { f: 'pt_pend', fmt: FMT.int }, { f: 'pct_pt', t: 1, fmt: FMT.pct }, { f: 'rt_por_reparar', fmt: FMT.int }, { f: 'sin_tipo_total', fmt: FMT.int }], ['area']);
    t.querySelectorAll('tbody tr').forEach((tr) => {
      const r = rows.find((x) => encodeURIComponent(x.area) === tr.dataset.key);
      if (!r) return;
      const td = tr.children;
      td[6].replaceChildren(bar(r.pct_rt, color(0)));
      td[11].replaceChildren(bar(r.pct_pt, color(1)));
      if (r.area === 'TOTAL') tr.style.fontWeight = '600';
    });
    // embudo: total -> soldadas -> inspeccionadas
    const tot = rows.find((r) => r.area === 'TOTAL');
    const emb = document.getElementById('emb-insp');
    legend(document.getElementById('leg-embudo'), [[color(0), 'BW con RT'], [color(1), 'SW con PT'], ['var(--cds-chart-muted)', 'Soldadas sin inspección'], ['var(--color-border-line)', 'Por soldar']]);
    emb.replaceChildren();
    if (tot) {
      const linea = (nombre, total, sold, insp, c, met) => {
        const r = document.createElement('div'); r.className = 'cm-emb-row';
        const n = document.createElement('div'); const b = document.createElement('b'); b.textContent = nombre; n.append(b, document.createElement('br'), document.createTextNode(fInt(total) + ' juntas'));
        const bar = document.createElement('div'); bar.className = 'cm-emb-bar';
        [[insp, c], [sold - insp, 'var(--cds-chart-muted)'], [total - sold, 'transparent']].forEach(([v, col]) => {
          const d = document.createElement('div'); d.style.width = (total ? 100 * v / total : 0) + '%'; d.style.background = col;
          if (col !== 'transparent' && total && v / total > 0.06) d.textContent = fInt(v);
          bar.append(d);
        });
        const nums = document.createElement('div'); nums.className = 'cm-emb-nums';
        nums.textContent = `Soldadas ${fInt(sold)} (${fPct(total ? sold / total : 0)} del total) · Con ${met} ${fInt(insp)} (${fPct(total ? insp / total : 0)} del total, ${fPct(sold ? insp / sold : 0)} de las soldadas) · Por soldar ${fInt(total - sold)}`;
        r.append(n, bar, nums); emb.append(r);
      };
      linea('BW · RT', tot.bw_total, tot.bw_soldadas, tot.rt_hechas, color(0), 'RT');
      linea('SW · PT', tot.sw_total, tot.sw_soldadas, tot.pt_hechas, color(1), 'PT');
      const st = document.createElement('p'); st.className = 'cm-note';
      st.textContent = `Total de juntas en la bitácora: ${fInt(tot.juntas_total)} (${fInt(tot.bw_total)} BW, ${fInt(tot.sw_total)} SW y ${fInt(tot.sin_tipo_total)} sin tipo capturado).`;
      emb.append(st);
    }
    const sl = rowsOf('rt_sin_ligar')[0];
    root.querySelector('.cm-sinligar').textContent = sl ? `No se encontraron en la bitácora ${fInt(sl.rt)} registros de RT y ${fInt(sl.pt)} de PT de estas áreas; revisa su isométrico o número de junta.` : '';
  };

  // ---------- draw ----------
  function draw() {
    fillMarks();
    if (tab === 'resumen') { drawCurva(); drawSemanal(); drawDiario(); drawResp(); drawServicios(); }
    if (tab === 'soldadores') drawPeople('sold');
    if (tab === 'tuberos') drawPeople('tub');
    if (tab === 'calidad') { drawInsp(); drawRT(); }
  }
  dash.onData(draw);
  const named = location.hash.slice(1);
  if (['soldadores', 'tuberos', 'calidad'].includes(named)) showTab(named, false);
})();
