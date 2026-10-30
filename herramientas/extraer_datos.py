# Extrae los 4 CSV del tablero desde Dashboard_Control_Maestro_rev.xlsb
# Uso: python3 -I extraer_datos.py <archivo.xlsb> <carpeta_salida>
import pandas as pd, numpy as np, datetime as dt, sys
from pyxlsb import open_workbook
import sys
F=sys.argv[1]   # ruta del .xlsb
O=sys.argv[2].rstrip('/')+'/'   # carpeta de salida de los CSV
def d(x):
    try:
        x=float(x)
        if np.isnan(x): return ''
        return (dt.date(1899,12,30)+dt.timedelta(days=int(x))).isoformat()
    except: 
        s=str(x).strip()
        if len(s)==10 and s[2]=='-': return s[6:]+'-'+s[3:5]+'-'+s[:2]
        return ''
def k(x):
    s='' if pd.isna(x) else str(x).strip().upper()
    return s
# la hoja de la bitácora se ha llamado 'Weld Log Detailed' y 'Weld Log '; se busca por nombre sin importar espacios ni mayúsculas
_hojas=pd.ExcelFile(F,engine='pyxlsb').sheet_names
_wl=next((h for h in _hojas if h.strip().lower()=='weld log detailed'),None) or next((h for h in _hojas if h.strip().lower().startswith('weld log')),None)
if _wl is None: raise SystemExit('No se encontró la hoja de la bitácora (Weld Log) en el Excel')
wl=pd.read_excel(F,sheet_name=_wl,engine='pyxlsb')
wl=wl[wl['Drawing No'].notna() | wl['Diam'].notna()]
out=pd.DataFrame({
 'id':range(1,len(wl)+1),
 'area':wl.Area.map(k).str.replace('SK1200','SK-1200').str.replace('A2000','A-2000'),
 'servicio':wl.SERVICIO.map(k),
 'prioridad':wl.Prio.map(k),
 'isometrico':wl['Drawing No'].map(lambda x:'' if pd.isna(x) else str(x).strip()),
 'junta':wl['N° de Junta'].map(k),
 'tipo_junta':wl['Tipo de junta'].map(lambda x: str(x).strip().capitalize() if pd.notna(x) else ''),
 'tipo':wl.Tipo.map(k),
 'diam':pd.to_numeric(wl.Diam,errors='coerce').fillna(0),
 'fecha_soldadura':wl['Fecha de soldadura'].map(d),
 'soldador':wl['Clave Soldador'].map(k).replace({'SW':''}),
 'fecha_fitup':wl['Fecha FIT-UP'].map(d),
 'tubero':wl['Tubero'].map(k),
 'cancelada':wl.localizacion.astype(str).str.contains('CANC').map({True:'si',False:'no'}),
})
# juntas sin área capturada: se toma el área del nombre del isométrico (…-SK-1200-02 → SK-1200)
import re as _re
def _area_iso(iso):
    m=_re.search(r'(?<![A-Z0-9])(SK|A)-?(\d{3,4})(?!\d)', str(iso).upper())
    return (('SK-' if m.group(1)=='SK' else 'A-')+m.group(2)) if m else ''
_sin=out.area==''
out.loc[_sin,'area']=out.loc[_sin,'isometrico'].map(_area_iso)
out.to_csv(O+'juntas.csv',index=False)
juntas_df=out.copy()
print(len(out), out.diam.sum(), out[out.fecha_soldadura!=''].diam.sum(), out.fecha_soldadura.max())
# personal
wb=open_workbook(F)
rows=[]
with wb.get_sheet('Metricas') as sh:
    R=[[c.v for c in r] for r in sh.rows()]
sec=None
for r in R:
    r=r+[None]*30
    if r[1]=='MÉTRICAS DE SOLDADORES': sec='Soldador'; continue
    if r[1]=='MÉTRICAS DE TUBEROS': sec='Tubero'; continue
    if sec and isinstance(r[0],(int,float)) and r[1] and k(r[1])!='SIN ASIGNAR' and r[2]:
        rows.append(dict(clave=k(r[1]),nombre=str(r[4]).strip().title(),rol=sec,frente=k(r[2]),responsable=str(r[3]).strip().title()))
p=pd.DataFrame(rows)
ls=pd.read_excel(F,sheet_name='Lista Soldadores',engine='pyxlsb')
for _,r in ls.iterrows():
    c=k(r.Clave)
    if not ((p.clave==c)&(p.rol=='Soldador')).any():
        p.loc[len(p)]=dict(clave=c,nombre=str(r.Nombre).strip().title(),rol='Soldador',frente='SIN ASIGNAR',responsable='Sin asignar')
# keys in log not in roster
for col,rol in [('soldador','Soldador'),('tubero','Tubero')]:
    for c in sorted(set(out[col])-{''}):
        if not ((p.clave==c)&(p.rol==rol)).any():
            other=p[p.clave==c]
            nm=other.nombre.iloc[0] if len(other) else c
            p.loc[len(p)]=dict(clave=c,nombre=nm,rol=rol,frente='SIN ASIGNAR',responsable='Sin asignar')
p.to_csv(O+'personal.csv',index=False); print(p.rol.value_counts().to_dict()); print(p[p.frente=='SIN ASIGNAR'])
# rt
# --- Calidad: hojas RESUMEN RT y RESUMEN PT (validación de soldadura) ---
# RT: B reporte, C fecha, D isométrico, E junta, F Ø, G C/S, H C/S REAL, I resultado, J-L 1ra reparación, M-O 2da reparación, P observaciones (proveedor)
# PT: B reporte, C fecha, D isométrico, E junta, F Ø, G C/S, H resultado, I-K 1ra reparación, L-N 2da reparación, O observaciones
# Regla de clave: si la columna H (C/S REAL) de RESUMEN RT trae una clave, esa manda sobre la de la columna G.
def hoja(nombre):
    with wb.get_sheet(nombre) as sh:
        R=[[c.v for c in r] for r in sh.rows()]
    w=max(len(r) for r in R); R=[r+[None]*(w-len(r)) for r in R]
    df=pd.DataFrame(R[1:]); return df[df[3].notna()|df[4].notna()]
def claves(x):
    s=k(x)
    if s in ('','N/A','NA','-'): return ''
    return ', '.join(c for c in [c.strip() for c in s.replace('/',',').replace(' Y ',',').split(',')] if c)
def res(x):
    s=k(x)
    return {'D/N':'Aceptada','F/N':'Rechazada'}.get(s, s.capitalize() if s else '')
def diam(x):
    s=str(x).replace('\u00d8','').replace('"','').strip() if x is not None else ''
    try:
        if ' ' in s and '/' in s: a,b=s.split(' '); n,dd=b.split('/'); return float(a)+float(n)/float(dd)
        if '/' in s: n,dd=s.split('/'); return float(n)/float(dd)
        return float(s)
    except: return None
out=[]
for metodo,nombre,c in [('RT','RESUMEN RT',dict(cs=6,real=7,r=8,r1=11,r2=14,obs=15)),('PT','RESUMEN PT',dict(cs=6,real=None,r=7,r1=10,r2=13,obs=14))]:
    df=hoja(nombre)
    for _,r in df.iterrows():
        cs=claves(r[c['cs']]); real=claves(r[c['real']]) if c['real'] is not None else ''
        out.append(dict(metodo=metodo, reporte=k(r[1]), fecha=d(r[2]), isometrico=str(r[3]).strip() if r[3] is not None else '', junta=k(r[4]),
            diam=diam(r[5]), soldador_reporte=cs, soldador_real=real, soldadores=real or cs, clave_corregida='si' if real and real!=cs else 'no',
            resultado=res(r[c['r']]), reparacion1=res(r[c['r1']]), reparacion2=res(r[c['r2']]),
            proveedor=str(r[c['obs']]).strip() if r[c['obs']] is not None else ''))
rto=pd.DataFrame(out); rto.insert(0,'id',range(1,len(rto)+1))
# Área de cada junta inspeccionada: se toma la clave de área del isométrico (A1500, SK-1200, R900...)
# y se traduce al área que esa misma clave tiene en la bitácora (respeta las reasignaciones del Weld Log).
import re
def tok(iso):
    m=re.search(r'(?<![A-Z0-9])(SK|A|R)-?(\d{3,4})(?!\d)', str(iso).upper())
    return (m.group(1)+m.group(2)) if m else ''
tmap=(pd.DataFrame({'t':juntas_df.isometrico.map(tok),'a':juntas_df.area}).query("t!='' and a!=''")
      .groupby('t').a.agg(lambda x: x.value_counts().index[0]).to_dict())
def area_de(iso):
    t=tok(iso)
    if not t: return ''
    if t in tmap: return tmap[t]
    pre,num=re.match(r'(SK|A|R)(\d+)',t).groups()
    return ('SK-' if pre=='SK' else 'A-')+num
rto.insert(6,'area',rto.isometrico.map(area_de))

rto.to_csv(O+'rt.csv',index=False)
# --- Ligar cada registro RT/PT con su junta de la bitácora (isométrico + junta) ---
def niso(x):
    t=str(x).upper()
    t=re.sub(r'\(.*?\)','',t)
    t=re.sub(r'^[\s\d"/\-]+(?=[A-Z])','',t)
    return re.sub(r'[^A-Z0-9]','',t)
def njun(x):
    m=re.match(r'\s*J\s*-?\s*0*(\d+)\s*([A-Z]*)',str(x).upper())
    if not m: return str(x).upper().strip()
    suf=re.sub(r'R+$','',m.group(2))        # J-05R / J-05RR son reparaciones de la J-05
    return 'J-%02d%s'%(int(m.group(1)),suf)
jk=pd.DataFrame({'i':juntas_df.isometrico.map(niso),'j':juntas_df.junta.map(njun),'id':juntas_df.id})
exact={(a,b):c for a,b,c in zip(jk.i,jk.j,jk.id)}
porj={}
for a,b,c in zip(jk.i,jk.j,jk.id): porj.setdefault(b,[]).append((a,c))
def liga(iso,jun):
    a,b=niso(iso),njun(jun)
    if (a,b) in exact: return exact[(a,b)]
    if len(a)>=10:
        cand={c for k_,c in porj.get(b,[]) if k_.startswith(a) or a.startswith(k_)}
        if len(cand)==1: return cand.pop()
    return ''
rto.insert(7,'junta_id',[liga(a,b) for a,b in zip(rto.isometrico,rto.junta)])
# estado de cada junta de la bitácora por método: Aceptada / Rechazada (reparada o no)
def estado(g):
    if (g.resultado=='Aceptada').any() or (g.reparacion1=='Aceptada').any() or (g.reparacion2=='Aceptada').any():
        return 'Rechazada-reparada' if (g.resultado=='Rechazada').any() else 'Aceptada'
    if (g.resultado=='Rechazada').any(): return 'Rechazada'
    return 'Registrada'
for met in ['RT','PT']:
    g=rto[(rto.metodo==met)&(rto.junta_id!='')].groupby('junta_id').apply(estado,include_groups=False).to_dict()
    juntas_df[met.lower()]=juntas_df.id.map(g).fillna('')
juntas_df.to_csv(O+'juntas.csv',index=False)
rto.to_csv(O+'rt.csv',index=False)
print(rto.fecha.value_counts().to_dict(), rto.resultado.value_counts().to_dict())
# curva
cs=[]
with wb.get_sheet('Curva S') as sh:
    for i,r in enumerate(sh.rows()):
        v=[c.v for c in r]+[None]*8
        if i>=2 and v[1] is not None and v[0] is not None:
            cs.append(dict(semana=('Cierre' if v[0]=='CIERRE' else int(v[0])),fecha=d(v[1]),pulg_reprog_acum=v[2],pulg_real_acum=v[4] if v[4] not in ('',None) else ''))
pd.DataFrame(cs).to_csv(O+'curva_s.csv',index=False); print(pd.DataFrame(cs).tail(6))
