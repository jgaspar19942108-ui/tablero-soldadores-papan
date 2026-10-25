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
wl=pd.read_excel(F,sheet_name='Weld Log Detailed',engine='pyxlsb')
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
out.to_csv(O+'juntas.csv',index=False)
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
rto.to_csv(O+'rt.csv',index=False); print(rto.fecha.value_counts().to_dict(), rto.resultado.value_counts().to_dict())
# curva
cs=[]
with wb.get_sheet('Curva S') as sh:
    for i,r in enumerate(sh.rows()):
        v=[c.v for c in r]+[None]*8
        if i>=2 and v[1] is not None and v[0] is not None:
            cs.append(dict(semana=('Cierre' if v[0]=='CIERRE' else int(v[0])),fecha=d(v[1]),pulg_reprog_acum=v[2],pulg_real_acum=v[4] if v[4] not in ('',None) else ''))
pd.DataFrame(cs).to_csv(O+'curva_s.csv',index=False); print(pd.DataFrame(cs).tail(6))
