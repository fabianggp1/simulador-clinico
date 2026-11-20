# Formato del caso clínico (versión 1)

Cada paciente es **un objeto JSON**. El archivo final es una **lista JSON con los 100 objetos** (`casos_clinicos_100.json`). El programa lee estos datos, así que las claves, los nombres y los valores permitidos deben respetarse al pie de la letra.

## 1. Campos del caso (todos obligatorios)

| Campo | Contenido |
|---|---|
| `version` | Siempre `1` |
| `id` | Tres dígitos: `"001"` a `"100"` |
| `motivo` | Motivo de consulta en palabras del paciente, una línea. No menciona el diagnóstico |
| `especialidad` | Una de: Urgencias, Infecciosas, Neurología, Cardiología, Nefrología, Endocrinología, Hematología, Neumología, Oncología, Ginecología, Digestivo, Dermatología, Psiquiatría, Reumatología |
| `nivel` | `Básico`, `Intermedio` o `Avanzado` |
| `minutos_estimados` | Número entero |
| `modo` | `clasico` o `urgente` |
| `paciente` | `nombre`, `sexo` (M/F), `edad` (≥ 18), `ocupacion`, `descripcion_imagen` |
| `escenario` | `lugar`, `momento`, `triaje`, `al_entrar` |
| `diagnostico` | `principal`, `terminos_aceptados` (mínimo 4: sinónimos, siglas, nombres alternativos, errores frecuentes de escritura), `cie10` |
| `anamnesis` | Lista de 4 a 7 grupos `{grupo, preguntas[]}`; cada pregunta: `id`, `pregunta`, `respuesta`, `relevancia`, `dato` |
| `exploracion` | `constantes {TA, FC, FR, SatO2, T}` y `regiones[]` con `region`, `hallazgo`, `clave` (true/false), `valor_semiologico` |
| `monitor` | `ritmo`, `fc`, `spo2`, `ta`, `fr`, `temp` (los mismos valores de las constantes) |
| `hipotesis` | Lista (mínimo 5): `nombre`, `rol`, `a_favor`, `en_contra`. Exactamente una con rol `principal` |
| `pruebas` | Lista de 6 a 10: `id`, `nombre`, `minutos`, `valor`, `resultado`, `imagen`, `interpretacion` |
| `plan` | Lista de 8 a 12 medidas: `id`, `medida`, `categoria`, `justificacion` |
| `trampas` | Lista (mínimo 5): `error`, `gravedad`, `condicion` |
| `razonamiento` | `sintomas_a_hipotesis`, `pruebas_a_diagnostico`, `manejo` |
| `finales` | `bien`, `tarde`, `mal` |
| `objetivos` | Lista de 3 o más |
| `para_recordar` | Exactamente 3 ideas |
| `reto` | `pregunta`, `opciones` (4), `correcta` (0 a 3), `explicacion` |
| `bibliografia` | Lista de 3 o más: `fuente`, `nota` |
| `pendiente_verificar` | Lista de datos que no se pudieron confirmar (cifras, capítulos, dosis). Puede estar vacía |
| `urgente` | **Solo si `modo` es `urgente`.** Ver sección 3 |

## 2. Valores permitidos

- `relevancia` de una pregunta: `clave` (separa diagnósticos), `util` (aporta contexto), `ruido` (no cambia la decisión)
- `rol` de una hipótesis: `principal`, `no_dejar_escapar`, `plausible`, `distractor`
- `valor` de una prueba: `imprescindible`, `razonable`, `bajo_valor`, `no_procede`, `peligrosa`
- `categoria` de una medida del plan: `imprescindible`, `razonable`, `condicional`, `bajo_valor`, `peligrosa`
- `gravedad` de una trampa: `leve`, `grave`, `critico`
- `ritmo` del monitor: `sinusal`, `taquicardia_sinusal`, `bradicardia_sinusal`, `fibrilacion_auricular`, `flutter_auricular`, `taquicardia_supraventricular`, `taquicardia_ventricular`, `fibrilacion_ventricular`, `elevacion_st`, `bloqueo_av_completo`, `asistolia`, `actividad_electrica_sin_pulso`, `hiperpotasemia_grave`

## 3. Bloque `urgente` (solo en los casos de sala de urgencias)

```
"urgente": {
  "fases": [
    {"id":"llegada","minuto":0,"narrativa":"...","monitor":{ritmo,fc,spo2,ta,fr,temp}},
    {"id":"ronda1","minuto":5,"requiere_para_bien":["T01","T02"],
     "narrativa_bien":"...","monitor_bien":{...},"narrativa_mal":"...","monitor_mal":{...}},
    {"id":"ronda2","minuto":10,"requiere_para_bien":["T03"], ... mismos campos ...}
  ],
  "tratar": [ {"id":"T01","nombre":"...","minutos":1,"valor":"imprescindible|razonable|condicional|bajo_valor|peligrosa",
               "fases":["llegada","ronda1"],"efecto":"...","reevaluar_antes_de_repetir":false} ],
  "deterioro": [ {"condicion":"...","consecuencia":"..."} ],
  "fin": {"minuto":20,"estable_si":"T02 y T03 aplicados","mensaje_estable":"...","mensaje_inestable":"..."}
}
```

Cómo lo usa el programa:
- Hay tres fases como mínimo: `llegada`, `ronda1` y `ronda2` (se puede añadir `ronda3`).
- Si al llegar a una fase el jugador ya aplicó **todas** las acciones de `requiere_para_bien`, el monitor y la narrativa son los de `_bien`. Si falta alguna, son los de `_mal`.
- `tratar` incluye entre 6 y 10 acciones con distinto `valor`. Debe haber al menos una `peligrosa` y al menos una `imprescindible`.
- Los casos urgentes también llevan todos los campos normales (anamnesis, exploración, pruebas, plan, etcétera), pero con menos preguntas (de 10 a 16) y pruebas rápidas.

## 4. Reglas de redacción (para quien escriba los casos)

1. **Todo es original.** No se copia texto de otro simulador ni de ningún sitio. Se redacta con palabras propias.
2. **Español neutro con contexto peruano** (hospital de EsSalud o MINSA, clínica, posta). Unidades: glucosa y creatinina en mg/dL, hemoglobina en g/dL, troponina en ng/L, temperatura en °C. Pacientes adultos (18 años o más).
3. **Modo tutor:** el paciente habla como paciente (primera persona, lenguaje cotidiano). Ninguna respuesta de la anamnesis, ni la llegada, nombra el diagnóstico ni usa palabras que lo delaten.
4. **Anamnesis:** de 14 a 24 preguntas en 4 a 7 grupos. Incluir preguntas `clave` (mínimo 3), `util` y algunas `ruido`. Cada `dato` es la frase corta que se anota en el bloc clínico del jugador.
5. **Exploración:** al menos estas regiones: Aspecto general, Cabeza y cuello, Tórax y pulmones, Corazón, Abdomen, Extremidades y piel, Neurológico. Se pueden añadir maniobras específicas. Al menos una región `clave: true` con el hallazgo que orienta el diagnóstico. En `valor_semiologico` se explica qué sugiere el hallazgo y, cuando se conozca, su peso según McGee.
6. **Pruebas:** resultados realistas y coherentes entre sí, con valor de referencia entre paréntesis. En `imagen` se describe lo que se vería en el ECG, la radiografía o la ecografía cuando aplique; si no aplica, `null`. Incluir pruebas innecesarias o contraproducentes (`bajo_valor`, `peligrosa`), no solo las correctas.
7. **Plan:** medidas concretas con dosis cuando corresponda. La justificación explica por qué esa categoría.
8. **Precisión científica:** no inventar cifras de sensibilidad, especificidad o cociente de probabilidad, ni dosis, números de capítulo, páginas o DOI. Si no hay seguridad, se escribe el dato de forma cualitativa y se anota en `pendiente_verificar`.
9. **Bibliografía en este orden de prioridad:** Bickley (Bates, 13.ª ed.) para la técnica; McGee (4.ª ed.) para el valor de los hallazgos; Harrison (21.ª ed.) para mecanismo y clínica; guías internacionales vigentes para el manejo (ESC, AHA/ACC, GOLD, IDSA, KDIGO, ADA, entre otras). Para dermatología: Fitzpatrick (9.ª ed.).
10. **Variedad:** cambiar nombre, ocupación, edad y escenario entre casos. No repetir la misma estructura narrativa.
