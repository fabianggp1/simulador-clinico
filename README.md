# Simulador clínico

Simulador web propio para practicar razonamiento clínico con pacientes: anamnesis, examen físico, pruebas, diagnóstico y plan.
Es una página estática (HTML, CSS y JavaScript, sin librerías ni compilación). Todo el texto, el diseño y el código son originales.

## Estado: Paso 1 (prototipo)
- Monitor tipo UCI dibujado por código: ECG derivación II en movimiento, curva de saturación, FC, SpO₂, TA, FR y temperatura.
- Los 13 ritmos del formato (sinusal, taquicardia y bradicardia sinusal, fibrilación auricular, flutter, TSV, TV, FV, elevación del ST, bloqueo AV completo, asistolia, AESP, hiperpotasemia grave), con la frecuencia dibujada igual a la FC mostrada.
- Acciones: Hablar, Explorar, Pruebas (con tiempo de llegada), Tratar (solo casos urgentes), Bloc clínico y Registro con minutos.
- Modo clásico y modo urgente; modo tutor activado por defecto.
- Progreso guardado en el navegador, con exportar e importar.
- Funciona sin internet después de la primera carga y se instala con «Añadir a pantalla de inicio».
- Tres casos de prueba: 083 (clásico), 901 (urgente, borrador para revisión clínica) y 902 (clásico, borrador para revisión clínica).

Pendiente: hipótesis con autocompletado, plan, puntuación e informe final (Paso 2); los 100 casos (Paso 3); MiniCEX, estadísticas y exportación de tarjetas de repaso (Paso 4).

## Reglas de tiempo
- Medir o reevaluar, preguntar, explorar y pedir una prueba cuestan 1 minuto.
- Cada tratamiento cuesta los minutos que indica el caso y cuenta como aplicado desde que se empieza.
- Las pruebas llegan después de los minutos indicados. En el modo clásico se puede «esperar»; en el urgente el reloj solo avanza por acciones.
- Los valores del monitor solo cambian al medir o reevaluar; cada cifra indica «medido en el minuto N».
- Caso urgente: cada ronda se resuelve al llegar a su minuto. Si ya estaba aplicado todo lo de `requiere_para_bien`, pasa lo «bien»; si no, lo «mal».
- Un tratamiento no se repite sin reevaluar antes (si el caso lo marca con `reevaluar_antes_de_repetir`) y los demás solo se aplican una vez.
- La condición `fin.estable_si` se lee buscando los códigos T01, T02… del texto: el paciente queda estable si todos están aplicados.

## Límites de alarma del monitor
Rango normal del adulto. Se pueden cambiar en `LIMITES`, al comienzo de `js/monitor.js`:
FC 60–100 lpm · SpO₂ ≥ 94 % · FR 12–20 rpm · temperatura 36,0–37,9 °C · TA sistólica 90–139 y diastólica 50–89 mmHg.

## Carpetas
- `index.html`, `css/`, `js/` — la página (`monitor.js` dibuja el monitor, `motor.js` lleva el reloj y las reglas, `app.js` las pantallas).
- `data/casos/NNN.json` — un archivo por caso, en el formato de `herramientas/formato_caso_clinico.md`.
- `data/indice.json` — lista de casos que lee la página (se genera con la herramienta de abajo).
- `imagenes/pacientes/NNN.png` — imagen del paciente (si no existe, se dibuja un marcador).
- `imagenes/pruebas/` — imágenes de pruebas (`NNN_Pxx.png`). Toda imagen externa debe tener licencia libre y fuente citada.
- `herramientas/` — validador, preparador de casos e ícono.
- `sw.js`, `manifest.webmanifest`, `iconos/` — uso sin internet e instalación en iPad.

## Agregar o actualizar casos (no hace falta tocar el código)
1. Validar: `python3 herramientas/validar_casos.py casos_clinicos_100.json`
2. Separar la lista en archivos y rehacer el índice: `python3 herramientas/preparar_casos.py casos_clinicos_100.json`
   (si solo se agregó un archivo a `data/casos/`: `python3 herramientas/preparar_casos.py`)
3. Subir el valor de `VERSION` en `sw.js` para que los dispositivos descarguen lo nuevo.

## Probar en local
`python3 -m http.server 8000` y abrir `http://localhost:8000`.

## Nota
Los casos marcados con `borrador_revision_clinica` esperan revisión clínica antes de usarse para estudiar.
