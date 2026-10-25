dash.calc('kpi_periodo', {
  inputs: ['juntas'],
  title: 'Indicadores por periodo',
  description: 'Pulgadas y juntas soldadas y armadas, personal activo y rendimiento por persona-día, para la semana en curso, las últimas 4 semanas y todo el registro (sin juntas canceladas).',
  fn: (juntas) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1], min = f[0];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const P = [['semana', lunes, max, add(lunes, -7), add(max, -7)], ['4sem', add(max, -27), max, add(max, -55), add(max, -28)], ['todo', min, max, null, null]];
    const inR = (x, a, b) => !!x && x >= a && x <= b;
    const sum = (a) => a.reduce((t, r) => t + Number(r.diam), 0);
    return P.map(([periodo, desde, hasta, pa, pb]) => {
      const S = J.filter((r) => inR(r.fecha_soldadura, desde, hasta));
      const A = J.filter((r) => inR(r.fecha_fitup, desde, hasta));
      const Sk = S.filter((r) => r.soldador), Ak = A.filter((r) => r.tubero);
      const sd = new Set(Sk.map((r) => r.soldador + '|' + r.fecha_soldadura)).size;
      const td = new Set(Ak.map((r) => r.tubero + '|' + r.fecha_fitup)).size;
      const prev = pa ? sum(J.filter((r) => inR(r.fecha_soldadura, pa, pb))) : null;
      return {
        periodo, desde, hasta,
        pulg_soldadas: sum(S), juntas_soldadas: S.length,
        pulg_soldadas_previo: prev,
        cambio_vs_previo: prev ? sum(S) / prev - 1 : null,
        juntas_con_clave: Sk.length,
        pct_juntas_con_clave: S.length ? Sk.length / S.length : null,
        juntas_sin_clave: S.length - Sk.length,
        soldadores_activos: new Set(Sk.map((r) => r.soldador)).size,
        soldador_dias: sd,
        pulg_soldador_dia: sd ? sum(Sk) / sd : null,
        pulg_armadas: sum(A), juntas_armadas: A.length,
        tuberos_activos: new Set(Ak.map((r) => r.tubero)).size,
        tubero_dias: td,
        pulg_tubero_dia: td ? sum(Ak) / td : null,
        juntas_armadas_sin_clave: A.length - Ak.length,
      };
    });
  },
});

dash.calc('soldadores', {
  inputs: ['juntas', 'personal', 'rt'],
  title: 'Producción por soldador',
  description: 'Juntas y pulgadas-Ø soldadas por clave de soldador en cada periodo, días trabajados, pulgadas por día y resultado de radiografías (RT acumulado).',
  fn: (juntas, personal, rt) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1], min = f[0];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const P = [['semana', lunes, max], ['4sem', add(max, -27), max], ['todo', min, max]];
    const inR = (x, a, b) => !!x && x >= a && x <= b;
    const roster = personal.filter((p) => p.rol === 'Soldador');
    const rtBy = {};
    rt.forEach((r) => {
      if (!r.soldadores) return;
      r.soldadores.split(/\s*,\s*/).forEach((c) => {
        const o = (rtBy[c] ??= { ac: 0, re: 0 });
        if (r.resultado === 'Aceptado') o.ac++;
        if (r.resultado === 'Rechazado') o.re++;
      });
    });
    const out = [];
    for (const [periodo, desde, hasta] of P) {
      const g = {};
      J.filter((r) => r.soldador && inR(r.fecha_soldadura, desde, hasta)).forEach((r) => (g[r.soldador] ??= []).push(r));
      const claves = new Set([...roster.filter((p) => p.frente !== 'SIN ASIGNAR').map((p) => p.clave), ...Object.keys(g)]);
      for (const clave of claves) {
        const a = g[clave] || [];
        const p = roster.find((x) => x.clave === clave) || {};
        const pulg = a.reduce((t, r) => t + Number(r.diam), 0);
        const dias = new Set(a.map((r) => r.fecha_soldadura)).size;
        const q = rtBy[clave] || { ac: 0, re: 0 };
        out.push({
          periodo, clave, nombre: p.nombre || clave, frente: p.frente || 'SIN ASIGNAR', responsable: p.responsable || 'Sin asignar',
          juntas: a.length, pulg, dias, pulg_dia: dias ? pulg / dias : null,
          diam_prom: a.length ? pulg / a.length : null,
          pct_campo: a.length ? a.filter((r) => r.tipo_junta === 'Campo').length / a.length : null,
          rt_aceptadas: q.ac, rt_rechazadas: q.re, pct_rechazo: q.ac + q.re ? q.re / (q.ac + q.re) : null,
        });
      }
    }
    return out.sort((x, y) => y.pulg - x.pulg || y.juntas - x.juntas);
  },
});

dash.calc('tuberos', {
  inputs: ['juntas', 'personal'],
  title: 'Armado por tubero',
  description: 'Juntas y pulgadas-Ø armadas (fit-up) por clave de tubero en cada periodo, días trabajados, pulgadas por día y cuántas de sus juntas armadas ya se soldaron.',
  fn: (juntas, personal) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1], min = f[0];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const P = [['semana', lunes, max], ['4sem', add(max, -27), max], ['todo', min, max]];
    const inR = (x, a, b) => !!x && x >= a && x <= b;
    const roster = personal.filter((p) => p.rol === 'Tubero');
    const out = [];
    for (const [periodo, desde, hasta] of P) {
      const g = {};
      J.filter((r) => r.tubero && inR(r.fecha_fitup, desde, hasta)).forEach((r) => (g[r.tubero] ??= []).push(r));
      const claves = new Set([...roster.filter((p) => p.frente !== 'SIN ASIGNAR').map((p) => p.clave), ...Object.keys(g)]);
      for (const clave of claves) {
        const a = g[clave] || [];
        const p = roster.find((x) => x.clave === clave) || {};
        const pulg = a.reduce((t, r) => t + Number(r.diam), 0);
        const dias = new Set(a.map((r) => r.fecha_fitup)).size;
        const sold = a.filter((r) => r.fecha_soldadura).length;
        out.push({
          periodo, clave, nombre: p.nombre || clave, frente: p.frente || 'SIN ASIGNAR', responsable: p.responsable || 'Sin asignar',
          juntas: a.length, pulg, dias, pulg_dia: dias ? pulg / dias : null,
          diam_prom: a.length ? pulg / a.length : null,
          juntas_ya_soldadas: sold, pct_soldado: a.length ? sold / a.length : null,
        });
      }
    }
    return out.sort((x, y) => y.pulg - x.pulg || y.juntas - x.juntas);
  },
});

dash.calc('semanal', {
  inputs: ['juntas'],
  title: 'Producción semanal',
  description: 'Pulgadas-Ø soldadas y armadas por semana (lunes a domingo) con el acumulado soldado.',
  fn: (juntas) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const mon = (s) => add(s, -((D(s).getUTCDay() + 6) % 7));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const w = {};
    const get = (k) => (w[k] ??= { semana: k, pulg_soldadas: 0, juntas_soldadas: 0, pulg_armadas: 0 });
    J.forEach((r) => {
      if (r.fecha_soldadura) { const o = get(mon(r.fecha_soldadura)); o.pulg_soldadas += Number(r.diam); o.juntas_soldadas++; }
      if (r.fecha_fitup) get(mon(r.fecha_fitup)).pulg_armadas += Number(r.diam);
    });
    let acc = 0;
    return Object.values(w).sort((a, b) => (a.semana < b.semana ? -1 : 1)).map((o) => {
      acc += o.pulg_soldadas;
      return { ...o, pulg_acumuladas: acc, parcial: add(o.semana, 6) > max };
    });
  },
});

dash.calc('diario', {
  inputs: ['juntas'],
  title: 'Producción diaria (28 días)',
  description: 'Pulgadas-Ø soldadas y armadas por día en los últimos 28 días, con soldadores y tuberos con clave activos.',
  fn: (juntas) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const out = [];
    for (let i = 27; i >= 0; i--) {
      const dia = add(max, -i);
      const S = J.filter((r) => r.fecha_soldadura === dia), A = J.filter((r) => r.fecha_fitup === dia);
      out.push({
        dia,
        pulg_soldadas: S.reduce((t, r) => t + Number(r.diam), 0),
        juntas_soldadas: S.length,
        pulg_armadas: A.reduce((t, r) => t + Number(r.diam), 0),
        soldadores_activos: new Set(S.filter((r) => r.soldador).map((r) => r.soldador)).size,
        tuberos_activos: new Set(A.filter((r) => r.tubero).map((r) => r.tubero)).size,
      });
    }
    return out;
  },
});

dash.calc('mapa_semana', {
  inputs: ['juntas'],
  title: 'Mapa diario de la semana',
  description: 'Pulgadas-Ø por persona y día de la semana en curso: soldadas por soldador y armadas por tubero.',
  fn: (juntas) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const dias = [];
    for (let d = lunes; d <= max; d = add(d, 1)) dias.push(d);
    const out = [];
    for (const [rol, kc, kf] of [['Soldador', 'soldador', 'fecha_soldadura'], ['Tubero', 'tubero', 'fecha_fitup']]) {
      const g = {};
      J.filter((r) => r[kc] && r[kf] >= lunes && r[kf] <= max).forEach((r) => {
        const o = ((g[r[kc]] ??= {})[r[kf]] ??= { pulg: 0, juntas: 0 });
        o.pulg += Number(r.diam); o.juntas++;
      });
      for (const clave of Object.keys(g)) for (const dia of dias) {
        const o = g[clave][dia] || { pulg: 0, juntas: 0 };
        out.push({ rol, clave, dia, pulg: o.pulg, juntas: o.juntas });
      }
    }
    return out;
  },
});

dash.calc('responsables', {
  inputs: ['juntas', 'personal'],
  title: 'Rendimiento por responsable',
  description: 'Personas activas contra plantilla, pulgadas-Ø y pulgadas por persona-día de soldadores y tuberos agrupados por su responsable, en cada periodo.',
  fn: (juntas, personal) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1], min = f[0];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const P = [['semana', lunes, max], ['4sem', add(max, -27), max], ['todo', min, max]];
    const out = [];
    for (const [periodo, desde, hasta] of P) {
      for (const [rol, kc, kf] of [['Soldador', 'soldador', 'fecha_soldadura'], ['Tubero', 'tubero', 'fecha_fitup']]) {
        const resp = (c) => (personal.find((p) => p.rol === rol && p.clave === c) || {}).responsable || 'Sin asignar';
        const g = {};
        personal.filter((p) => p.rol === rol).forEach((p) => { (g[p.responsable] ??= { plantilla: 0, rows: [] }).plantilla++; });
        J.filter((r) => r[kc] && r[kf] >= desde && r[kf] <= hasta).forEach((r) => (g[resp(r[kc])] ??= { plantilla: 0, rows: [] }).rows.push(r));
        for (const [responsable, o] of Object.entries(g)) {
          const pulg = o.rows.reduce((t, r) => t + Number(r.diam), 0);
          const pd = new Set(o.rows.map((r) => r[kc] + '|' + r[kf])).size;
          out.push({
            periodo, rol, responsable, plantilla: o.plantilla,
            activos: new Set(o.rows.map((r) => r[kc])).size,
            juntas: o.rows.length, pulg, persona_dias: pd, pulg_persona_dia: pd ? pulg / pd : null,
          });
        }
      }
    }
    return out.sort((a, b) => b.pulg - a.pulg);
  },
});

dash.calc('servicios', {
  inputs: ['juntas'],
  title: 'Avance por servicio',
  description: 'Pulgadas-Ø totales y soldadas por servicio según la bitácora de soldadura, con su avance y las pulgadas soldadas en la semana en curso.',
  fn: (juntas) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si' && r.servicio && r.servicio !== 'SIN CLASIFICAR');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const g = {};
    J.forEach((r) => {
      const o = (g[r.servicio] ??= { servicio: r.servicio, pulg_total: 0, pulg_soldadas: 0, pulg_semana: 0 });
      const d = Number(r.diam);
      o.pulg_total += d;
      if (r.fecha_soldadura) o.pulg_soldadas += d;
      if (r.fecha_soldadura >= lunes) o.pulg_semana += d;
    });
    return Object.values(g).map((o) => ({ ...o, avance: o.pulg_total ? o.pulg_soldadas / o.pulg_total : null, pulg_pendientes: o.pulg_total - o.pulg_soldadas }))
      .sort((a, b) => b.pulg_pendientes - a.pulg_pendientes);
  },
});

dash.calc('proyeccion', {
  inputs: ['juntas', 'curva_s'],
  title: 'Proyección de cierre',
  description: 'Avance contra el total del programa (Curva S), ritmo de las últimas 4 semanas, ritmo necesario para la meta de término del 10 nov 2026, fecha estimada de cierre y soldadores necesarios (6 días hábiles por semana).',
  fn: (juntas, curva_s) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const lunes = add(max, -((D(max).getUTCDay() + 6) % 7));
    const cierre = curva_s.find((r) => r.semana === 'Cierre');
    const total = Number(cierre.pulg_reprog_acum), meta = '2026-11-10'; // meta de término fijada por el usuario
    const sum = (a) => a.reduce((t, r) => t + Number(r.diam), 0);
    const sold = sum(J.filter((r) => r.fecha_soldadura));
    const pend = total - sold;
    const ritmo = sum(J.filter((r) => r.fecha_soldadura >= add(max, -27) && r.fecha_soldadura <= max)) / 4;
    const diasRest = (D(meta) - D(max)) / 864e5;
    const ritmoNec = diasRest > 0 ? pend / (diasRest / 7) : null;
    const semanas = ritmo ? pend / ritmo : null;
    const fechaEst = semanas != null ? add(max, Math.ceil(semanas * 7)) : null;
    const Sk = J.filter((r) => r.soldador && r.fecha_soldadura >= lunes && r.fecha_soldadura <= max);
    const sd = new Set(Sk.map((r) => r.soldador + '|' + r.fecha_soldadura)).size;
    const psd = sd ? sum(Sk) / sd : null;
    const back = J.filter((r) => r.fecha_fitup && !r.fecha_soldadura);
    const plan = curva_s.filter((r) => r.semana !== 'Cierre' && r.fecha <= max).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).pop();
    return [{
      fecha_corte: max, pulg_total_programa: total, pulg_soldadas: sold, avance: sold / total, pulg_pendientes: pend,
      fecha_meta: meta, dias_a_meta: diasRest,
      ritmo_4sem: ritmo, ritmo_necesario: ritmoNec, brecha_ritmo: ritmoNec != null ? ritmoNec - ritmo : null,
      semanas_al_ritmo: semanas, fecha_estimada: fechaEst,
      dias_desfase: fechaEst ? (D(fechaEst) - D(meta)) / 864e5 : null,
      pulg_soldador_dia: psd,
      soldadores_activos: new Set(Sk.map((r) => r.soldador)).size,
      soldadores_necesarios: psd && ritmoNec != null ? Math.ceil(ritmoNec / (6 * psd)) : null,
      backlog_juntas: back.length, backlog_pulg: sum(back),
      plan_a_la_fecha: plan ? Number(plan.pulg_reprog_acum) : null,
    }];
  },
});

dash.calc('curva_proyeccion', {
  inputs: ['juntas', 'curva_s'],
  title: 'Curva proyectada al ritmo actual',
  description: 'Pulgadas-Ø acumuladas proyectadas semana a semana desde la fecha de corte al ritmo promedio de las últimas 4 semanas, hasta llegar al total del programa.',
  fn: (juntas, curva_s) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const total = Number(curva_s.find((r) => r.semana === 'Cierre').pulg_reprog_acum);
    const sum = (a) => a.reduce((t, r) => t + Number(r.diam), 0);
    let acc = sum(J.filter((r) => r.fecha_soldadura));
    const ritmo = sum(J.filter((r) => r.fecha_soldadura >= add(max, -27) && r.fecha_soldadura <= max)) / 4;
    const out = [{ fecha: max, pulg_proyectadas: acc }];
    for (let i = 1; i <= 40 && acc < total && ritmo > 0; i++) {
      const falta = total - acc;
      if (falta <= ritmo) { out.push({ fecha: add(max, Math.ceil(7 * (i - 1) + 7 * falta / ritmo)), pulg_proyectadas: total }); break; }
      acc += ritmo;
      out.push({ fecha: add(max, 7 * i), pulg_proyectadas: acc });
    }
    return out;
  },
});

dash.calc('rt_soldador', {
  inputs: ['rt'],
  title: 'Radiografías por soldador',
  description: 'Juntas radiografiadas por soldador con resultado aceptado o rechazado y su tasa de rechazo; una junta con dos soldadores cuenta para ambos.',
  fn: (rt) => {
    const g = {};
    rt.forEach((r) => {
      if (!r.soldadores) return;
      r.soldadores.split(/\s*,\s*/).forEach((c) => {
        const o = (g[c] ??= { clave: c, radiografias: 0, aceptadas: 0, rechazadas: 0, sin_resultado: 0 });
        o.radiografias++;
        if (r.resultado === 'Aceptado') o.aceptadas++;
        else if (r.resultado === 'Rechazado') o.rechazadas++;
        else o.sin_resultado++;
      });
    });
    return Object.values(g).map((o) => ({ ...o, pct_rechazo: o.aceptadas + o.rechazadas ? o.rechazadas / (o.aceptadas + o.rechazadas) : null }))
      .sort((a, b) => b.radiografias - a.radiografias);
  },
});

dash.calc('rt_resumen', {
  inputs: ['rt'],
  title: 'Resumen de radiografías',
  description: 'Total de juntas radiografiadas, resultados capturados, tasa de rechazo y fecha del último reporte.',
  fn: (rt) => {
    const n = (s) => rt.filter((r) => r.resultado === s).length;
    const ac = n('Aceptado'), re = n('Rechazado');
    const fechas = rt.map((r) => r.fecha).filter(Boolean).sort();
    return [{
      radiografias: rt.length, aceptadas: ac, rechazadas: re, por_revisar: n('Revisar'),
      sin_resultado: n('Sin resultado capturado'), pct_rechazo: ac + re ? re / (ac + re) : null,
      pct_con_resultado: rt.length ? (ac + re) / rt.length : null,
      ultimo_reporte: fechas[fechas.length - 1] || null,
      reportes: new Set(rt.map((r) => r.reporte)).size,
    }];
  },
});

dash.calc('curva_reprog', {
  inputs: ['juntas', 'curva_s'],
  title: 'Curva reprogramada a la meta',
  description: 'Curva S real hasta la fecha de corte y, desde ahí, el saldo pendiente repartido en línea recta semana a semana hasta la meta de término del 10 nov 2026.',
  fn: (juntas, curva_s) => {
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (t) => t.toISOString().slice(0, 10);
    const add = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
    const meta = '2026-11-10';
    const J = juntas.filter((r) => r.cancelada !== 'si');
    const f = J.flatMap((r) => [r.fecha_soldadura, r.fecha_fitup]).filter(Boolean).sort();
    const max = f[f.length - 1];
    const total = Number(curva_s.find((r) => r.semana === 'Cierre').pulg_reprog_acum);
    const sold = J.filter((r) => r.fecha_soldadura).reduce((t, r) => t + Number(r.diam), 0);
    const out = curva_s.filter((r) => r.semana !== 'Cierre' && r.fecha < max && r.pulg_real_acum !== '')
      .map((r) => ({ fecha: r.fecha, pulg_reprog_acum: Number(r.pulg_real_acum) }));
    out.push({ fecha: max, pulg_reprog_acum: sold });
    const dias = (D(meta) - D(max)) / 864e5;
    for (let d = 7; d < dias; d += 7) out.push({ fecha: add(max, d), pulg_reprog_acum: sold + (total - sold) * d / dias });
    if (dias > 0) out.push({ fecha: meta, pulg_reprog_acum: total });
    return out;
  },
});
