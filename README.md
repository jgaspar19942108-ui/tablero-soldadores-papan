# Tablero de soldadores y tuberos · EMC Papan

Página pública: https://jgaspar19942108-ui.github.io/tablero-soldadores-papan/

Muestra el avance de soldadura, la producción por soldador y tubero, la proyección de cierre y la calidad RT de la obra mecánica EMC Papan.

Los datos salen del Excel **Dashboard_Control_Maestro_rev.xlsb** (carpeta *Control de Obra* en OneDrive) y se actualizan cada día a las 7:32 a. m. (hora de México).

## Cómo se genera

1. `herramientas/extraer_datos.py <archivo.xlsb> datos` saca 4 CSV ligeros del Excel: bitácora de juntas, plantilla, radiografías y curva S.
2. `herramientas/generar_pagina.py datos herramientas/tablero index.html` arma `index.html`, una sola página con los datos incluidos.
