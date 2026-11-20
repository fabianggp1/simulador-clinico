/* Simulador clínico — pantallas, progreso en el navegador y navegación. */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');

  /* ---------- Progreso guardado en el navegador ---------- */
  const Almacen = {
    clave: 'simulador-clinico.v1',
    datos: null,
    leer() {
      if (this.datos) return this.datos;
      let d = null;
      try { d = JSON.parse(localStorage.getItem(this.clave)); } catch (e) { d = null; }
      if (!d || typeof d !== 'object') d = {};
      d.sesiones = d.sesiones || {};
      d.ajustes = Object.assign({ tutor: true, tema: 'auto' }, d.ajustes);
      this.datos = d;
      return d;
    },
    guardar() {
      try { localStorage.setItem(this.clave, JSON.stringify(this.datos)); this.fallo = false; } catch (e) { this.fallo = true; }
    },
    fallo: false
  };

  /* ---------- Tema claro / oscuro ---------- */
  function temaEfectivo() {
    const t = Almacen.leer().ajustes.tema;
    if (t === 'claro' || t === 'oscuro') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  function aplicarTema() {
    const t = Almacen.leer().ajustes.tema;
    if (t === 'claro' || t === 'oscuro') document.documentElement.setAttribute('data-tema', t);
    else document.documentElement.removeAttribute('data-tema');
  }
  function alternarTema() {
    const a = Almacen.leer().ajustes;
    a.tema = temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro';
    Almacen.guardar(); aplicarTema();
    const b = $('[data-a="tema"]'); if (b) b.innerHTML = etiquetaTema();
  }
  const etiquetaTema = () => (temaEfectivo() === 'oscuro' ? '☀<span class="solo-ancho"> Claro</span>' : '☾<span class="solo-ancho"> Oscuro</span>');

  /* ---------- Carga de casos ---------- */
  let indice = null;
  const cacheCasos = new Map();
  async function cargarIndice() {
    if (indice) return indice;
    const r = await fetch('data/indice.json');
    if (!r.ok) throw new Error('No se pudo leer el índice de casos');
    indice = (await r.json()).casos;
    return indice;
  }
  async function cargarCaso(id) {
    if (cacheCasos.has(id)) return cacheCasos.get(id);
    const fila = (await cargarIndice()).find((c) => c.id === id);
    if (!fila) throw new Error('Caso no encontrado: ' + id);
    const r = await fetch('data/' + fila.archivo);
    if (!r.ok) throw new Error('No se pudo leer el caso ' + id);
    const caso = await r.json();
    cacheCasos.set(id, caso);
    return caso;
  }

  /* ---------- Estado de la pantalla de atención ---------- */
  let A = null;           // { caso, s, tab, sel, mon, valMon, obs }
  let monitoresDemo = [];

  function limpiar() {
    if (A && A.mon) A.mon.destruir();
    if (A && A.obs) A.obs.disconnect();
    A = null;
    monitoresDemo.forEach((m) => m.destruir()); monitoresDemo = [];
  }

  function guardarSesion() {
    if (!A) return;
    Almacen.leer().sesiones[A.caso.id] = A.s;
    Almacen.guardar();
  }

  /* ---------- Rutas ---------- */
  async function ruta() {
    limpiar();
    window.scrollTo(0, 0);
    const h = (location.hash || '#/').replace(/^#/, '');
    const p = h.split('/').filter(Boolean);
    try {
      if (p[0] === 'caso' && p[1]) await vistaAtencion(p[1]);
      else if (p[0] === 'fin' && p[1]) await vistaFin(p[1]);
      else if (p[0] === 'ritmos') vistaRitmos();
      else await vistaInicio();
    } catch (e) {
      app.innerHTML = '<div class="pagina"><div class="aviso-caja"><h2>No se pudo cargar</h2><p>' + esc(e.message) +
        '</p><a class="btn primario" href="#/">Volver al inicio</a></div></div>';
    }
  }

  const ir = (h) => { if (location.hash === h) ruta(); else location.hash = h; };

  /* ---------- Inicio ---------- */
  async function vistaInicio() {
    const casos = await cargarIndice();
    const al = Almacen.leer();
    const tarjetas = casos.map((c) => {
      const s = al.sesiones[c.id];
      let est = '', botones = '';
      if (!s) botones = '<button class="btn primario" data-a="iniciar" data-id="' + c.id + '">Atender</button>';
      else if (s.estado === 'terminado') {
        est = '<span class="chip ok">Terminado</span>';
        botones = '<button class="btn" data-a="verfin" data-id="' + c.id + '">Ver resultado</button><button class="btn ghost" data-a="reiniciar" data-id="' + c.id + '">Repetir</button>';
      } else {
        est = '<span class="chip aviso">En curso · min ' + s.reloj + '</span>';
        botones = '<button class="btn primario" data-a="continuar" data-id="' + c.id + '">Continuar</button><button class="btn ghost" data-a="reiniciar" data-id="' + c.id + '">Reiniciar</button>';
      }
      return '<article class="tarjeta"><div class="chips"><span class="chip">Caso ' + esc(c.id) + '</span>' +
        '<span class="chip ' + (c.modo === 'urgente' ? 'urg' : '') + '">' + (c.modo === 'urgente' ? 'Urgente' : 'Clásico') + '</span>' +
        '<span class="chip">' + esc(c.especialidad) + '</span><span class="chip">' + esc(c.nivel) + '</span>' +
        '<span class="chip">~' + c.minutos_estimados + ' min</span>' + (c.borrador ? '<span class="chip aviso">Borrador para revisión clínica</span>' : '') + est + '</div>' +
        '<div class="motivo">«' + esc(c.motivo) + '»</div><div class="acciones">' + botones + '</div></article>';
    }).join('');

    app.innerHTML =
      '<header class="cab"><h1>Simulador clínico<span class="sub">Practica anamnesis, examen, pruebas y decisiones</span></h1>' +
      '<button class="btn ghost" data-a="tema">' + etiquetaTema() + '</button></header>' +
      '<main class="pagina">' +
      '<div class="aviso-caja"><div class="ajustes">' +
      '<label><input type="checkbox" data-a="tutor" ' + (al.ajustes.tutor ? 'checked' : '') + '> Modo tutor (no revela explicaciones hasta que las pidas)</label>' +
      '<button class="btn" data-a="exportar">Exportar mi progreso</button>' +
      '<button class="btn" data-a="importar">Importar progreso</button>' +
      '<a class="btn" href="#/ritmos">Probar los ritmos del monitor</a>' +
      '<input type="file" id="archivo" accept="application/json,.json" class="oculto"></div>' +
      '<div id="estado-offline" class="pie" style="margin:0">Tu progreso se guarda en este dispositivo. Para pasarlo entre iPad y computadora usa Exportar e Importar.</div></div>' +
      '<div class="lista-casos">' + tarjetas + '</div>' +
      '<p class="pie">MiniCEX, estadísticas y exportación de tarjetas de repaso llegarán en pasos siguientes. Los casos marcados como borrador esperan tu revisión clínica.</p></main>';
    estadoOffline();
  }

  async function estadoOffline() {
    const el = $('#estado-offline'); if (!el) return;
    try {
      if (!('caches' in window)) return;
      const ok = await caches.match('data/indice.json');
      if (ok) el.insertAdjacentHTML('beforeend', ' <b style="color:var(--ok)">✓ Listo para usar sin internet.</b>');
    } catch (e) { /* sin caché */ }
  }

  function iniciar(id) {
    cargarCaso(id).then((caso) => {
      const al = Almacen.leer();
      al.sesiones[id] = Motor.crear(caso, { tutor: al.ajustes.tutor });
      Almacen.guardar();
      ir('#/caso/' + id);
    });
  }

  /* ---------- Exportar / importar ---------- */
  function exportar() {
    const d = Almacen.leer();
    const carga = { formato: 'simulador-clinico', version: 1, exportado: new Date().toISOString(), ajustes: d.ajustes, sesiones: d.sesiones };
    const blob = new Blob([JSON.stringify(carga, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'simulador-progreso-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function importar(archivo) {
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const c = JSON.parse(lector.result);
        if (c.formato !== 'simulador-clinico' || typeof c.sesiones !== 'object') throw new Error('formato');
        if (!confirm('Esto reemplaza el progreso guardado en este dispositivo por el del archivo. ¿Continuar?')) return;
        Almacen.datos = { sesiones: c.sesiones, ajustes: Object.assign({ tutor: true, tema: 'auto' }, c.ajustes) };
        Almacen.guardar(); aplicarTema(); ruta();
      } catch (e) { alert('Ese archivo no es un progreso válido del simulador.'); }
    };
    lector.readAsText(archivo);
  }

  /* ---------- Pantalla de atención ---------- */
  const TABS = [['hablar', 'Hablar'], ['explorar', 'Explorar'], ['pruebas', 'Pruebas'], ['tratar', 'Tratar'], ['bloc', 'Bloc'], ['registro', 'Registro']];

  async function vistaAtencion(id) {
    const caso = await cargarCaso(id);
    const al = Almacen.leer();
    let s = al.sesiones[id];
    if (!s) { s = Motor.crear(caso, { tutor: al.ajustes.tutor }); al.sesiones[id] = s; Almacen.guardar(); }
    A = { caso: caso, s: s, tab: 'hablar', sel: new Set(), mon: null, valMon: undefined, obs: null };
    const urg = Motor.esUrgente(caso);
    const p = caso.paciente;

    app.innerHTML =
      '<header class="cab"><button class="btn ghost" data-a="salir" aria-label="Guardar y salir">‹<span class="solo-ancho"> Salir</span></button>' +
      '<h1>Caso ' + esc(caso.id) + '<span class="sub">' + (urg ? 'Urgente' : 'Clásico') + ' · ' + (s.tutor ? 'Tutor' : 'Sin ayudas') + (caso.borrador_revision_clinica ? ' · borrador para revisión clínica' : '') + '</span></h1>' +
      '<button class="btn ghost" data-a="tema" aria-label="Cambiar tema">' + etiquetaTema() + '</button>' +
      '<button class="btn primario" data-a="terminar">Terminar<span class="solo-ancho"> atención</span></button></header>' +
      '<main class="atencion">' +
      '<section class="izq">' +
      '<div class="monitor" id="monitor"><div class="mon-barra"><span class="reloj" id="reloj"></span>' +
      '<button class="btn chico" data-a="curvas" id="b-curvas" aria-label="Mostrar u ocultar curvas">Curvas</button>' +
      '<button class="btn primario chico" data-a="medir" id="b-medir"></button></div>' +
      '<canvas class="mon-lienzo" id="lienzo" aria-label="Monitor: ECG derivación II y curva de pletismografía"></canvas>' +
      '<div class="cifras" id="cifras"></div>' +
      '<div class="mon-ayuda">Los valores solo se actualizan al medir o reevaluar (1 min). TA en mmHg. ECG derivación II y curva de saturación.</div></div>' +
      '<div class="paciente" id="paciente">' +
      '<div class="pac-fila"><div class="avatar" id="avatar"></div><div class="pac-datos"><h2>' + esc(p.nombre) + '</h2>' +
      '<div class="linea">' + (p.sexo === 'F' ? 'Mujer' : 'Varón') + ' de ' + p.edad + ' años · ' + esc(p.ocupacion) + '</div>' +
      '<div class="linea">' + esc(caso.escenario.lugar) + ' · ' + esc(caso.escenario.momento) + '</div>' +
      '<div class="linea">Triaje: ' + esc(caso.escenario.triaje) + '</div></div></div>' +
      '<div class="cita"><b>Motivo de consulta:</b> «' + esc(caso.motivo) + '»</div>' +
      '<div id="situacion"></div></div></section>' +
      '<section class="der"><div class="tabs" role="tablist" id="tabs"></div><div class="der-cuerpo" id="cuerpo" role="tabpanel"></div></section></main>';

    // avatar: imagen del paciente si existe; si no, marcador dibujado por código
    const fila = (await cargarIndice()).find((c) => c.id === id);
    const av = $('#avatar');
    if (fila && fila.imagen) av.innerHTML = '<img alt="Paciente" src="imagenes/pacientes/' + id + '.png">';
    else av.innerHTML = '<svg viewBox="0 0 80 90" aria-hidden="true"><circle cx="40" cy="26" r="16" fill="currentColor" opacity=".35"/><path d="M8 88c0-22 14-34 32-34s32 12 32 34z" fill="currentColor" opacity=".35"/></svg><span>Imagen pendiente</span>';

    A.mon = new Monitor.MonitorUCI($('#lienzo'));
    if (global_obs()) { A.obs = new ResizeObserver(fijarAltoMonitor); A.obs.observe($('#monitor')); }
    fijarAltoMonitor();
    refrescar();
  }
  const global_obs = () => typeof ResizeObserver !== 'undefined';
  function fijarAltoMonitor() {
    const m = $('#monitor'); if (!m) return;
    document.documentElement.style.setProperty('--alto-mon', m.getBoundingClientRect().height + 'px');
  }

  function celdasMonitor(v, min) {
    const al = v ? Monitor.alarmas(v) : {};
    return [['fc', 'FC', 'lpm'], ['spo2', 'SpO₂', '%'], ['ta', 'TA', 'mmHg'], ['fr', 'FR', 'rpm'], ['temp', 'Temp', '°C']].map((d) => {
      const k = d[0]; let txt = '--';
      if (v) {
        const x = v[k];
        if (k === 'ta') { const t = Monitor.parseTA(x); txt = t && t.s > 0 ? x : '--'; }
        else if (k === 'temp') txt = Motor.fmt(x);
        else txt = Number(x) > 0 ? String(Math.round(Number(x))) : '--';
      }
      const cls = !v ? 'vacia' : (al[k] ? 'alarma' : '');
      return '<div class="cifra ' + k + ' ' + cls + '"><span class="tag-alarma">ALARMA</span><div class="et">' + d[1] + '</div>' +
        '<div class="val">' + txt + '<span class="un">' + d[2] + '</span></div>' +
        '<div class="min">' + (v ? 'medido en el minuto ' + min : 'sin medir') + '</div></div>';
    }).join('');
  }

  function pintarMonitor() {
    const { s } = A;
    $('#reloj').textContent = '⏱ Minuto ' + s.reloj;
    const b = $('#b-medir');
    b.textContent = s.ultima ? 'Reevaluar · 1 min' : 'Medir constantes · 1 min';
    b.disabled = s.estado === 'terminado';
    const v = s.ultima ? s.ultima.v : null;
    $('#cifras').innerHTML = celdasMonitor(v, s.ultima ? s.ultima.min : 0);
    const clave = s.ultima ? s.ultima.min + ':' + (s.ultima.v.ritmo) : null;
    if (clave !== A.valMon) { A.mon.setValores(v); A.valMon = clave; }
  }

  function pintarSituacion() {
    const { caso, s } = A;
    const sit = Motor.situacion(caso, s);
    const el = $('#situacion');
    if (!sit) { el.innerHTML = '<div class="situacion"><small>Al entrar</small>' + esc(caso.escenario.al_entrar) + '</div>'; return; }
    el.innerHTML = '<div class="situacion ' + (sit.res || '') + '"><small>' + (sit.min === 0 ? 'Al llegar' : 'Situación actual (minuto ' + sit.min + ')') + '</small>' + esc(sit.texto) + '</div>';
  }

  function nuevosResultados() {
    const { caso, s } = A;
    return caso.pruebas.filter((p) => Motor.estadoPrueba(s, p.id) === 'listo' && !s.vistos['r_' + p.id]).length;
  }

  function pintarTabs() {
    const urg = Motor.esUrgente(A.caso);
    $('#tabs').innerHTML = TABS.filter((t) => t[0] !== 'tratar' || urg).map((t) => {
      let extra = '';
      if (t[0] === 'pruebas') { const k = nuevosResultados(); if (k) extra = '<span class="n alerta">' + k + ' nuevo' + (k > 1 ? 's' : '') + '</span>'; }
      return '<button class="tab" role="tab" data-a="tab" data-t="' + t[0] + '" aria-selected="' + (A.tab === t[0]) + '">' + t[1] + extra + '</button>';
    }).join('');
  }

  function refrescar() {
    pintarMonitor(); pintarSituacion(); pintarTabs(); pintarCuerpo();
    guardarSesion(); fijarAltoMonitor();
    if (Almacen.fallo) console.warn('No se pudo guardar el progreso en este navegador.');
  }

  function bannerFin() {
    const { s } = A;
    if (s.estado !== 'terminado') return '';
    return '<div class="banner-fin"><p><b>La atención terminó en el minuto ' + s.resultado.minuto + '.</b></p><button class="btn primario" data-a="verfin" data-id="' + A.caso.id + '">Ver resultado</button></div>';
  }

  function pintarCuerpo() {
    const cuerpo = $('#cuerpo'); const st = cuerpo.scrollTop;
    const f = { hablar: tabHablar, explorar: tabExplorar, pruebas: tabPruebas, tratar: tabTratar, bloc: tabBloc, registro: tabRegistro }[A.tab] || tabHablar;
    cuerpo.innerHTML = bannerFin() + f();
    cuerpo.scrollTop = st;
    if (A.tab === 'pruebas') { // al abrir Pruebas se consideran vistos los resultados
      let cambio = false;
      A.caso.pruebas.forEach((p) => { if (Motor.estadoPrueba(A.s, p.id) === 'listo' && !A.s.vistos['r_' + p.id]) { A.s.vistos['r_' + p.id] = true; cambio = true; } });
      if (cambio) { pintarTabs(); guardarSesion(); }
    }
    if (A.tab === 'bloc') {
      const ta = $('#bloc'); if (ta) ta.addEventListener('input', () => { A.s.notas = ta.value; clearTimeout(A.tNotas); A.tNotas = setTimeout(guardarSesion, 400); });
    }
  }

  const fin = () => A.s.estado === 'terminado';
  const nota = (t) => '<div class="nota-reglas">' + t + '</div>';

  function tabHablar() {
    const { caso, s } = A;
    const grupos = caso.anamnesis.map((g) => {
      const filas = g.preguntas.map((q) => {
        if (s.preguntas[q.id]) {
          return '<div class="hallazgo"><h4>🗣 ' + esc(q.pregunta) + ' <span class="costo">· minuto ' + s.preguntas[q.id].min + '</span></h4><div>' + esc(q.respuesta) + '</div></div>';
        }
        return '<button class="fila" data-a="preguntar" data-id="' + q.id + '" ' + (fin() ? 'disabled' : '') + '><span class="txt">' + esc(q.pregunta) + '</span><span class="costo">1 min</span></button>';
      }).join('');
      return '<div class="grupo"><h3>' + esc(g.grupo) + '</h3>' + filas + '</div>';
    }).join('');
    return nota('Cada pregunta cuesta 1 minuto. La respuesta del paciente aparece aquí y el dato queda anotado en el bloc clínico.') + grupos;
  }

  function tabExplorar() {
    const { caso, s } = A;
    const tutor = s.tutor;
    let h = nota('Cada región cuesta 1 minuto. Los hallazgos aparecen al explorar.');
    h += '<div class="grupo"><h3>Constantes</h3><button class="fila ' + (s.ultima ? 'hecha' : '') + '" data-a="medir" ' + (fin() ? 'disabled' : '') + '><span class="txt">Constantes vitales y monitor' +
      (s.ultima ? '<small>Última medición en el minuto ' + s.ultima.min + '. Toca para reevaluar.</small>' : '') + '</span><span class="costo">1 min</span></button></div>';
    h += '<div class="grupo"><h3>Regiones</h3>';
    caso.exploracion.regiones.forEach((r, i) => {
      if (s.regiones[i]) {
        const ver = !tutor || s.vistos['sem_' + i];
        h += '<div class="hallazgo"><h4>🩺 ' + esc(r.region) + ' <span class="costo">· minuto ' + s.regiones[i].min + '</span></h4><div>' + esc(r.hallazgo) + '</div>' +
          (ver ? '<div class="explica"><b>Valor semiológico:</b> ' + esc(r.valor_semiologico) + '</div>'
            : '<button class="btn chico" style="margin-top:8px" data-a="ver" data-k="sem_' + i + '">Pensar y luego ver el valor semiológico</button>') + '</div>';
      } else {
        h += '<button class="fila" data-a="explorar" data-i="' + i + '" ' + (fin() ? 'disabled' : '') + '><span class="txt">' + esc(r.region) + '</span><span class="costo">1 min</span></button>';
      }
    });
    return h + '</div>';
  }

  function tabPruebas() {
    const { caso, s } = A;
    const urg = Motor.esUrgente(caso);
    let h = nota('Pedir una prueba cuesta 1 minuto y el resultado llega después del tiempo indicado.' + (urg ? '' : ' Puedes dejar pasar el tiempo con «Esperar».'));
    if (!urg) {
      const hayPend = Object.keys(s.pruebas).some((k) => s.reloj < s.pruebas[k].llega);
      h += '<div class="grupo"><h3>Esperar</h3><div class="chips" style="gap:8px">' +
        '<button class="btn" data-a="esperar" data-n="5" ' + (fin() ? 'disabled' : '') + '>Esperar 5 min</button>' +
        '<button class="btn" data-a="esperar" data-n="15" ' + (fin() ? 'disabled' : '') + '>Esperar 15 min</button>' +
        '<button class="btn" data-a="esperar" data-n="proximo" ' + (fin() || !hayPend ? 'disabled' : '') + '>Hasta el próximo resultado</button></div></div>';
    }
    h += '<div class="grupo"><h3>Pruebas</h3>';
    caso.pruebas.forEach((p) => {
      const est = Motor.estadoPrueba(s, p.id);
      if (est === 'sin_pedir') {
        h += '<button class="fila" data-a="pedir" data-id="' + p.id + '" ' + (fin() ? 'disabled' : '') + '><span class="txt">' + esc(p.nombre) + '<small>Resultado en ' + p.minutos + ' min</small></span><span class="costo">pedir · 1 min</span></button>';
      } else if (est === 'pendiente') {
        const x = s.pruebas[p.id];
        h += '<div class="hallazgo"><h4>⏳ ' + esc(p.nombre) + '</h4><div>Pedida en el minuto ' + x.pedida + '. Llega en el minuto ' + x.llega + ' (faltan ' + (x.llega - s.reloj) + ' min).</div></div>';
      } else {
        const ver = !s.tutor || s.vistos['int_' + p.id];
        h += '<div class="hallazgo"><h4>🧪 ' + esc(p.nombre) + ' <span class="costo">· llegó en el minuto ' + s.pruebas[p.id].llega + '</span></h4><div>' + esc(p.resultado) + '</div>' +
          (p.imagen ? '<div class="imagen-desc"><b>Imagen (descripción)</b>' + esc(p.imagen) + '</div>' : '') +
          (ver ? '<div class="explica"><b>Interpretación:</b> ' + esc(p.interpretacion) + '</div>'
            : '<button class="btn chico" style="margin-top:8px" data-a="ver" data-k="int_' + p.id + '">Interpretar y luego ver la explicación</button>') + '</div>';
      }
    });
    return h + '</div>';
  }

  function tabTratar() {
    const { caso, s } = A;
    const u = caso.urgente;
    const fase = Motor.faseActual(caso, s);
    const sit = Motor.situacion(caso, s);
    let h = nota('Marca varios tratamientos y aplícalos en lote. Cada uno cuesta los minutos indicados y el reloj avanza solo por tus acciones. Para repetir un fármaco primero reevalúa al paciente.');
    h += '<div class="situacion ' + (sit.res || '') + '"><small>Situación actual</small>' + esc(sit.texto) + '</div>';
    const lista = u.tratar.filter((t) => t.fases.indexOf(fase) >= 0 || s.tratamientos[t.id]);
    let total = 0, n = 0;
    A.sel.forEach((id) => { const t = u.tratar.find((x) => x.id === id); if (t) { total += t.minutos; n++; } });
    h += '<div class="chips" style="margin:10px 0;gap:8px;align-items:center"><button class="btn primario" data-a="aplicar" ' + (n && !fin() ? '' : 'disabled') + '>Aplicar selección' + (n ? ' (' + n + ' · ' + total + ' min)' : '') + '</button>' +
      (n ? '<button class="btn ghost" data-a="limpiarsel">Quitar selección</button>' : '') + '</div>';
    h += '<div class="grupo"><h3>Tratamientos disponibles</h3>';
    lista.forEach((t) => {
      const a = s.tratamientos[t.id];
      const pt = Motor.puedeTratar(caso, s, t);
      const marc = A.sel.has(t.id);
      h += '<label class="fila ' + (a && !pt.ok ? 'hecha' : (!pt.ok ? 'off' : '')) + '"><input type="checkbox" data-a="sel" data-id="' + t.id + '" ' + (marc ? 'checked' : '') + ' ' + (pt.ok ? '' : 'disabled') + '>' +
        '<span class="txt">' + esc(t.nombre) + (!pt.ok ? '<small>' + esc(pt.motivo) + '</small>' : (a ? '<small>Aplicado ' + a.veces + (a.veces === 1 ? ' vez' : ' veces') + '. Ya reevaluaste: puedes repetirlo.</small>' : '')) + '</span><span class="costo">' + t.minutos + ' min</span></label>';
    });
    return h + '</div>';
  }

  function tabBloc() {
    const { s } = A;
    const datos = s.datos.length ? s.datos.map((d) => '<div class="dato"><span class="m">min ' + d.min + '</span><span>' + esc(d.texto) + '</span></div>').join('') : '<p class="vacio">Aún no hay datos. Al preguntar en «Hablar», el dato clave se anota aquí.</p>';
    return '<div class="grupo"><h3>Datos de la anamnesis</h3>' + datos + '</div><div class="grupo"><h3>Mis notas</h3>' +
      '<textarea class="bloc" id="bloc" placeholder="Escribe tus hipótesis, hallazgos y plan…" aria-label="Notas del bloc clínico">' + esc(s.notas) + '</textarea></div>';
  }

  function tabRegistro() {
    const { s } = A;
    if (!s.registro.length) return '<p class="vacio">Todavía no hay acciones registradas.</p>';
    return s.registro.map((r) => '<div class="registro-item ' + (r.tipo === 'fase' ? 'fase' : r.tipo === 'fin' ? 'fin' : '') + '"><span class="m">min ' + r.min + '</span><span>' + esc(r.texto) + '</span></div>').join('');
  }

  /* ---------- Final del Paso 1 ---------- */
  async function vistaFin(id) {
    const caso = await cargarCaso(id);
    const s = Almacen.leer().sesiones[id];
    if (!s || s.estado !== 'terminado') { ir('#/caso/' + id); return; }
    const total = caso.anamnesis.reduce((n, g) => n + g.preguntas.length, 0);
    let msg = '';
    if (s.resultado && s.resultado.motivo === 'fin') {
      const f = caso.urgente.fin;
      msg = '<div class="situacion ' + (s.resultado.estable ? 'bien' : 'mal') + '"><small>' + (s.resultado.estable ? 'Paciente estable' : 'Paciente inestable') + '</small>' + esc(s.resultado.estable ? f.mensaje_estable : f.mensaje_inestable) + '</div>';
    }
    app.innerHTML = '<header class="cab"><a class="btn ghost" href="#/">‹ Inicio</a><h1>Caso ' + esc(id) + '</h1><button class="btn ghost" data-a="tema">' + etiquetaTema() + '</button></header>' +
      '<main class="pagina"><div class="fin-caja"><h2>Atención terminada en el minuto ' + s.resultado.minuto + '</h2>' + msg +
      '<p style="margin-top:10px">Preguntas hechas: ' + Object.keys(s.preguntas).length + ' de ' + total + '. Regiones exploradas: ' + Object.keys(s.regiones).length + ' de ' + caso.exploracion.regiones.length +
      '. Pruebas pedidas: ' + Object.keys(s.pruebas).length + ' de ' + caso.pruebas.length + (Motor.esUrgente(caso) ? '. Tratamientos aplicados: ' + Object.keys(s.tratamientos).length : '') + '.</p>' +
      '<div class="aviso-caja"><b>Paso 2 (pendiente):</b> aquí irán tu hipótesis con autocompletado, el plan con tarjetas ✓/✕, la puntuación y el informe de 10 pantallas.</div>' +
      '<h3 style="margin:14px 0 6px">Registro de tu atención</h3>' + (s.registro.map((r) => '<div class="registro-item ' + (r.tipo === 'fase' ? 'fase' : r.tipo === 'fin' ? 'fin' : '') + '"><span class="m">min ' + r.min + '</span><span>' + esc(r.texto) + '</span></div>').join('')) +
      '<div class="chips" style="margin-top:14px;gap:8px"><a class="btn primario" href="#/">Volver al inicio</a><button class="btn" data-a="reiniciar" data-id="' + id + '">Repetir este caso</button></div></div></main>';
  }

  /* ---------- Banco de ritmos del monitor ---------- */
  const DEMO = [
    ['sinusal', 75, '120/80'], ['taquicardia_sinusal', 125, '110/70'], ['bradicardia_sinusal', 45, '105/65'],
    ['fibrilacion_auricular', 115, '115/75'], ['flutter_auricular', 150, '110/70'], ['taquicardia_supraventricular', 180, '100/65'],
    ['taquicardia_ventricular', 170, '85/55'], ['fibrilacion_ventricular', 0, '0/0'], ['elevacion_st', 90, '130/85'],
    ['bloqueo_av_completo', 36, '95/60'], ['asistolia', 0, '0/0'], ['actividad_electrica_sin_pulso', 40, '0/0'], ['hiperpotasemia_grave', 48, '90/55']
  ];
  function vistaRitmos() {
    app.innerHTML = '<header class="cab"><a class="btn ghost" href="#/">‹ Inicio</a><h1>Ritmos del monitor<span class="sub">Practica reconocerlos</span></h1><button class="btn ghost" data-a="tema">' + etiquetaTema() + '</button></header>' +
      '<main class="pagina"><div class="aviso-caja"><label class="ajustes" style="margin:0"><span class="fila" style="border:0;background:none;padding:0;margin:0"><input type="checkbox" id="ocultar" data-a="ocultar"> Ocultar los nombres (practicar)</span></label></div>' +
      '<div class="rejilla-ritmos">' + DEMO.map((d, i) => '<div class="caja-ritmo"><h3 class="nombre">' + esc(Monitor.NOMBRES[d[0]]) + ' <span class="costo">' + (d[1] ? d[1] + ' lpm' : 'sin frecuencia') + '</span></h3><canvas id="r' + i + '" aria-label="' + esc(Monitor.NOMBRES[d[0]]) + '"></canvas>' +
        '<button class="btn chico oculto" data-a="revelar">Mostrar nombre</button></div>').join('') + '</div></main>';
    DEMO.forEach((d, i) => {
      const m = new Monitor.MonitorUCI($('#r' + i), { etiquetaPleth: true });
      m.setValores({ ritmo: d[0], fc: d[1], spo2: 97, ta: d[2], fr: 16, temp: 36.6 });
      monitoresDemo.push(m);
    });
  }

  /* ---------- Acciones (clics) ---------- */
  function evitarSiTerminado() { return A && A.s.estado === 'terminado'; }

  const acciones = {
    tema: alternarTema,
    tutor(d, el) { Almacen.leer().ajustes.tutor = el.checked; Almacen.guardar(); },
    exportar,
    importar() { $('#archivo').click(); },
    iniciar(d) { iniciar(d.id); },
    continuar(d) { ir('#/caso/' + d.id); },
    verfin(d) { ir('#/fin/' + d.id); },
    reiniciar(d) {
      if (!confirm('Se borrará lo que hiciste en este caso y empezarás de nuevo. ¿Continuar?')) return;
      iniciar(d.id);
    },
    salir() { guardarSesion(); ir('#/'); },
    terminar() {
      if (evitarSiTerminado()) { ir('#/fin/' + A.caso.id); return; }
      if (!confirm('¿Terminar la atención ahora? No podrás seguir actuando sobre este paciente.')) return;
      Motor.terminar(A.caso, A.s); guardarSesion(); ir('#/fin/' + A.caso.id);
    },
    curvas() { const l = $('#lienzo'); l.style.display = l.style.display === 'none' ? '' : 'none'; setTimeout(fijarAltoMonitor, 30); },
    tab(d) { A.tab = d.t; pintarTabs(); pintarCuerpo(); },
    medir() { if (Motor.medir(A.caso, A.s)) refrescar(); },
    preguntar(d) { if (Motor.preguntar(A.caso, A.s, d.id)) refrescar(); },
    explorar(d) { if (Motor.explorar(A.caso, A.s, +d.i)) refrescar(); },
    pedir(d) { if (Motor.pedirPrueba(A.caso, A.s, d.id)) refrescar(); },
    esperar(d) { if (Motor.esperar(A.caso, A.s, d.n === 'proximo' ? 'proximo' : +d.n)) refrescar(); },
    ver(d) { A.s.vistos[d.k] = true; guardarSesion(); pintarCuerpo(); },
    sel(d, el) { if (el.checked) A.sel.add(d.id); else A.sel.delete(d.id); const st = $('#cuerpo').scrollTop; pintarCuerpo(); $('#cuerpo').scrollTop = st; },
    limpiarsel() { A.sel.clear(); pintarCuerpo(); },
    aplicar() {
      const ids = Array.from(A.sel); A.sel.clear();
      if (Motor.tratar(A.caso, A.s, ids).length) refrescar(); else pintarCuerpo();
    },
    ocultar(d, el) { document.querySelectorAll('.caja-ritmo').forEach((c) => { c.querySelector('.nombre').style.visibility = el.checked ? 'hidden' : 'visible'; c.querySelector('[data-a="revelar"]').classList.toggle('oculto', !el.checked); }); },
    revelar(d, el) { const c = el.closest('.caja-ritmo'); c.querySelector('.nombre').style.visibility = 'visible'; }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.tagName === 'INPUT') return;
    if (el.tagName === 'LABEL') return;
    const f = acciones[el.dataset.a];
    if (f) { e.preventDefault(); f(el.dataset, el, e); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('input[data-a]');
    if (!el) return;
    const f = acciones[el.dataset.a];
    if (f) f(el.dataset, el, e);
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'archivo' && e.target.files[0]) importar(e.target.files[0]); });

  window.addEventListener('hashchange', ruta);
  window.addEventListener('pagehide', guardarSesion);
  aplicarTema();
  ruta();

  /* ---------- Funcionar sin internet ---------- */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
