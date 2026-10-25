# Genera un index.html autónomo (datos incrustados) a partir de los CSV y los archivos del tablero.
import sys, json, re, datetime as dt, pandas as pd
src, dashdir, out = sys.argv[1], sys.argv[2], sys.argv[3]   # carpeta CSV, carpeta con index.html/calcs.js/app.js, archivo salida
data = {}
for k in ['juntas', 'personal', 'rt', 'curva_s']:
    df = pd.read_csv(f'{src}/{k}.csv', dtype=str, keep_default_na=False)
    data[k] = {'c': list(df.columns), 'r': df.values.tolist()}
body = open(f'{dashdir}/index.html', encoding='utf-8').read()
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)
calcs = open(f'{dashdir}/calcs.js', encoding='utf-8').read()
app = open(f'{dashdir}/app.js', encoding='utf-8').read()
ts = dt.datetime.now(dt.timezone(dt.timedelta(hours=-6))).strftime('%d/%m/%Y %H:%M')
shim = r'''
window.dash = (() => {
  const raw = __DATA__;
  const ds = {};
  for (const k in raw) ds[k] = raw[k].r.map((row) => Object.fromEntries(raw[k].c.map((c, i) => [c, row[i]])));
  const calcs = {}, cbs = [];
  const DEF = { periodo: 'semana' };
  let params = { ...DEF };
  const data = (id) => {
    if (ds[id]) return { status: 'ok', data: ds[id], refreshing: false, meta: [] };
    const c = calcs[id];
    if (c) { if (!c.v) c.v = c.fn(...c.inputs.map((i) => data(i).data)); return { status: 'ok', data: c.v, refreshing: false, meta: [] }; }
    return { status: 'missing', data: [] };
  };
  const run = () => cbs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 150); });
  return {
    calc: (id, o) => { calcs[id] = o; }, loader: () => {}, data,
    onData: (fn) => { cbs.push(fn); fn(); },
    params: () => ({ ...params }), setParams: (p) => { Object.assign(params, p); run(); },
    resetParams: () => { params = { ...DEF }; run(); },
    colors: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'],
    setLink: (n) => { try { history.replaceState(null, '', '#' + n); } catch (e) {} }, refresh: () => {},
  };
})();
'''.replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
tokens = '''
:root { color-scheme: light dark;
  --color-fg:#1f1e1b; --color-fg-muted:#6b6861; --color-bg:#faf9f5; --color-panel:#ffffff; --color-border-line:#e6e3da;
  --color-ok:#2f7d4f; --color-warn:#a86b00; --color-bad:#c2410c;
  --s1:#2d6fdb; --s2:#e08a2c; --s3:#2f9e77; --s4:#8a5cd1; --s5:#c9a227; --s6:#1f9bb5; --s7:#c2410c; --s8:#7a7a7a;
  --cds-chart-muted:#c9c5ba; --cds-chart-grid:#ece9e1; --cds-chart-axis:#c9c5ba; --cds-chart-reference:#8f8b80; --cds-chart-status-critical:#c2410c;
  --cds-surface-popover:#ffffff; --cds-border:#e0ddd3; --cds-shadow-popover:0 4px 16px rgba(0,0,0,.12); --cds-text-secondary:#6b6861;
}
@media (prefers-color-scheme: dark) { :root {
  --color-fg:#ecebe6; --color-fg-muted:#a3a097; --color-bg:#1c1b19; --color-panel:#262522; --color-border-line:#3a3834;
  --color-ok:#6cc38f; --color-warn:#e0ae4a; --color-bad:#f08a5d;
  --s1:#6b9cf0; --s2:#f0a95a; --s3:#5cc49c; --s4:#b08ef0; --s5:#e6c55a; --s6:#58c3da; --s7:#f08a5d; --s8:#9a9a9a;
  --cds-chart-muted:#55534d; --cds-chart-grid:#33312d; --cds-chart-axis:#55534d; --cds-chart-reference:#8f8b80; --cds-chart-status-critical:#f08a5d;
  --cds-surface-popover:#2e2d29; --cds-border:#45433e; --cds-shadow-popover:0 4px 16px rgba(0,0,0,.5); --cds-text-secondary:#a3a097;
} }
:root { --font-anthropic-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --font-anthropic-serif: Georgia, "Times New Roman", serif;
  --cds-font-size-caption:.8125rem; --cds-font-size-body:.9375rem; --cds-font-size-heading:1.0625rem; --cds-font-size-title:1.75rem; --cds-font-weight-medium:500;
  --cds-gap-xs:4px; --cds-gap-sm:8px; --cds-gap-md:12px; --cds-gap-lg:20px; --cds-gap-xl:32px;
  --cds-pad-xs:4px; --cds-pad-sm:8px; --cds-pad-md:12px; --cds-pad-lg:16px; --cds-pad-xl:24px; --cds-radius:10px; --cds-dur-slow:.3s; }
html, body { margin:0; background:var(--color-bg); color:var(--color-fg); font-family:var(--font-anthropic-sans); }
#dash-root { max-width: 1400px; margin: 0 auto; padding: 24px clamp(16px, 3vw, 40px) 40px; box-sizing: border-box; }
.dash-skeleton { color: transparent !important; }
.pub-foot { margin-top: 28px; font-size: .75rem; color: var(--color-fg-muted); }
'''
html = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Soldadores y tuberos · EMC Papan</title>
<style>{tokens}</style>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
</head><body><div id="dash-root">
{body}
<p class="pub-foot">Fuente: Control Maestro (Weld Log, Métricas, Resumen RT y PT, Curva S) · Actualizado {ts} (hora de México)</p>
</div>
<script>{shim}</script>
<script>{calcs}</script>
<script>{app}</script>
</body></html>'''
open(out, 'w', encoding='utf-8').write(html)
print(len(html))
