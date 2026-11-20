/* Motor de la atención: reglas de reloj, acciones y fases del caso urgente.
   No toca la pantalla; solo recibe el caso y la sesión (objeto simple que se guarda en el navegador).
   Reglas de tiempo:
   - Medir/reevaluar, preguntar, explorar y pedir una prueba cuestan 1 minuto.
   - Cada tratamiento cuesta los minutos que indica el caso y cuenta como aplicado desde que se empieza.
   - Una ronda del caso urgente se resuelve al llegar a su minuto: si los tratamientos de
     «requiere_para_bien» ya estaban aplicados, pasa lo «bien»; si no, lo «mal».
   - Las pruebas llegan «minutos» después de pedirlas. */
(function (global) {
  'use strict';

  const COSTO = 1;

  function crear(caso, opciones) {
    const o = opciones || {};
    return {
      version: 1,
      id: caso.id,
      modo: caso.modo,
      tutor: o.tutor !== false,
      inicio: new Date().toISOString(),
      estado: 'en_curso',   // en_curso | terminado
      resultado: null,      // { motivo: 'manual'|'fin', estable: bool, minuto }
      reloj: 0,
      preguntas: {},        // A01: { min }
      regiones: {},         // índice de región: { min }
      pruebas: {},          // P01: { pedida, llega, avisada }
      tratamientos: {},     // T01: { veces, min, necesitaReeval }
      fases: {},            // ronda1: { res: 'bien'|'mal', min }
      ultima: null,         // última medición { min, v }
      datos: [],            // bloc clínico (frases cortas de la anamnesis)
      notas: '',
      vistos: {},           // explicaciones desplegadas
      registro: []          // { min, tipo, texto }
    };
  }

  function log(s, min, tipo, texto) { s.registro.push({ min: min, tipo: tipo, texto: texto }); }

  function esUrgente(caso) { return caso.modo === 'urgente' && !!caso.urgente; }

  function fasesOrdenadas(caso) {
    return esUrgente(caso) ? caso.urgente.fases.slice().sort((a, b) => a.minuto - b.minuto) : [];
  }

  /* Valores reales del paciente en este momento (lo que mostraría el monitor si se midiera) */
  function valoresReales(caso, s) {
    if (!esUrgente(caso)) return Object.assign({}, caso.monitor);
    const fs = fasesOrdenadas(caso);
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i], r = s.fases[f.id];
      if (f.id !== 'llegada' && r) return Object.assign({}, r.res === 'bien' ? f.monitor_bien : f.monitor_mal);
    }
    return Object.assign({}, fs[0].monitor);
  }

  /* Texto de la situación actual del paciente (solo caso urgente) */
  function situacion(caso, s) {
    if (!esUrgente(caso)) return null;
    const fs = fasesOrdenadas(caso);
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i], r = s.fases[f.id];
      if (f.id !== 'llegada' && r) return { min: r.min, texto: r.res === 'bien' ? f.narrativa_bien : f.narrativa_mal, res: r.res };
    }
    return { min: 0, texto: fs[0].narrativa, res: null };
  }

  function faseActual(caso, s) {
    const fs = fasesOrdenadas(caso);
    let id = fs.length ? fs[0].id : 'llegada';
    fs.forEach((f) => { if (f.minuto <= s.reloj) id = f.id; });
    return id;
  }

  function idsDe(texto) { return (String(texto || '').match(/T\d+/g) || []); }

  /* Próximo suceso (ronda, llegada de prueba o fin) con minuto <= destino */
  function proximoSuceso(caso, s, destino) {
    let mejor = null;
    const poner = (min, orden, dato) => { if (!mejor || min < mejor.min || (min === mejor.min && orden < mejor.orden)) mejor = { min: min, orden: orden, dato: dato }; };
    if (esUrgente(caso)) {
      fasesOrdenadas(caso).forEach((f) => { if (f.id !== 'llegada' && !s.fases[f.id] && f.minuto <= destino) poner(f.minuto, 0, { tipo: 'fase', f: f }); });
      const fin = caso.urgente.fin;
      if (fin && s.estado !== 'terminado' && fin.minuto <= destino) poner(fin.minuto, 2, { tipo: 'fin' });
    }
    Object.keys(s.pruebas).forEach((pid) => {
      const p = s.pruebas[pid];
      if (!p.avisada && p.llega <= destino) poner(p.llega, 1, { tipo: 'prueba', pid: pid });
    });
    return mejor;
  }

  function procesar(caso, s, ev) {
    const d = ev.dato;
    if (d.tipo === 'fase') {
      const bien = (d.f.requiere_para_bien || []).every((t) => !!s.tratamientos[t]);
      s.fases[d.f.id] = { res: bien ? 'bien' : 'mal', min: ev.min };
      log(s, ev.min, 'fase', bien ? d.f.narrativa_bien : d.f.narrativa_mal);
    } else if (d.tipo === 'prueba') {
      s.pruebas[d.pid].avisada = true;
      const p = caso.pruebas.find((x) => x.id === d.pid);
      log(s, ev.min, 'resultado', 'Llegó el resultado: ' + p.nombre + '.');
    } else if (d.tipo === 'fin') {
      const fin = caso.urgente.fin;
      const estable = idsDe(fin.estable_si).every((t) => !!s.tratamientos[t]);
      s.estado = 'terminado';
      s.resultado = { motivo: 'fin', estable: estable, minuto: ev.min };
      log(s, ev.min, 'fin', estable ? fin.mensaje_estable : fin.mensaje_inestable);
    }
  }

  function avanzar(caso, s, n) {
    if (s.estado === 'terminado') return;
    const destino = s.reloj + n;
    for (;;) {
      const ev = proximoSuceso(caso, s, destino);
      if (!ev) break;
      procesar(caso, s, ev);
      if (s.estado === 'terminado') { s.reloj = Math.max(s.reloj, ev.min); return; }
    }
    s.reloj = destino;
  }

  function fmt(v) {
    if (v == null) return '--';
    return String(v).replace('.', ',');
  }

  function medir(caso, s) {
    if (s.estado === 'terminado') return false;
    avanzar(caso, s, COSTO);
    const v = valoresReales(caso, s);
    s.ultima = { min: s.reloj, v: v };
    Object.keys(s.tratamientos).forEach((k) => { s.tratamientos[k].necesitaReeval = false; });
    log(s, s.reloj, 'medida', 'Constantes medidas: FC ' + fmt(v.fc) + ', TA ' + v.ta + ', FR ' + fmt(v.fr) + ', SpO₂ ' + fmt(v.spo2) + ' %, T ' + fmt(v.temp) + ' °C.');
    return true;
  }

  function preguntar(caso, s, qid) {
    if (s.estado === 'terminado' || s.preguntas[qid]) return false;
    let q = null;
    caso.anamnesis.forEach((g) => g.preguntas.forEach((x) => { if (x.id === qid) q = x; }));
    if (!q) return false;
    avanzar(caso, s, COSTO);
    s.preguntas[qid] = { min: s.reloj };
    s.datos.push({ min: s.reloj, id: qid, texto: q.dato });
    log(s, s.reloj, 'hablar', 'Preguntaste: «' + q.pregunta + '»');
    return true;
  }

  function explorar(caso, s, i) {
    if (s.estado === 'terminado' || s.regiones[i]) return false;
    const r = caso.exploracion.regiones[i];
    if (!r) return false;
    avanzar(caso, s, COSTO);
    s.regiones[i] = { min: s.reloj };
    log(s, s.reloj, 'explorar', 'Exploraste: ' + r.region + '.');
    return true;
  }

  function pedirPrueba(caso, s, pid) {
    if (s.estado === 'terminado' || s.pruebas[pid]) return false;
    const p = caso.pruebas.find((x) => x.id === pid);
    if (!p) return false;
    avanzar(caso, s, COSTO);
    if (s.estado === 'terminado') return false;
    s.pruebas[pid] = { pedida: s.reloj, llega: s.reloj + p.minutos, avisada: false };
    log(s, s.reloj, 'prueba', 'Pediste: ' + p.nombre + ' (llega en el minuto ' + (s.reloj + p.minutos) + ').');
    return true;
  }

  function estadoPrueba(s, pid) {
    const p = s.pruebas[pid];
    if (!p) return 'sin_pedir';
    return s.reloj >= p.llega ? 'listo' : 'pendiente';
  }

  /* Solo modo clásico: dejar pasar el tiempo (n minutos o «hasta el próximo resultado») */
  function esperar(caso, s, n) {
    if (s.estado === 'terminado' || esUrgente(caso)) return false;
    let m = n;
    if (n === 'proximo') {
      const pend = Object.keys(s.pruebas).map((k) => s.pruebas[k]).filter((p) => s.reloj < p.llega);
      if (!pend.length) return false;
      m = Math.min.apply(null, pend.map((p) => p.llega)) - s.reloj;
    }
    log(s, s.reloj, 'espera', 'Esperaste ' + m + ' min.');
    avanzar(caso, s, m);
    return true;
  }

  /* ¿Se puede aplicar este tratamiento ahora? */
  function puedeTratar(caso, s, t) {
    if (!esUrgente(caso)) return { ok: false, motivo: 'Solo en casos urgentes.' };
    if (s.estado === 'terminado') return { ok: false, motivo: 'La atención terminó.' };
    if (t.fases.indexOf(faseActual(caso, s)) < 0) return { ok: false, motivo: 'Ya no está disponible en esta fase.' };
    const a = s.tratamientos[t.id];
    if (a && !t.reevaluar_antes_de_repetir) return { ok: false, motivo: 'Ya aplicado.' };
    if (a && a.necesitaReeval) return { ok: false, motivo: 'Reevalúa al paciente antes de repetirlo.' };
    return { ok: true, motivo: '' };
  }

  /* Aplica un lote de tratamientos, en el orden en que están en el caso */
  function tratar(caso, s, ids) {
    const lista = caso.urgente.tratar.filter((t) => ids.indexOf(t.id) >= 0);
    const hechos = [];
    for (const t of lista) {
      if (s.estado === 'terminado') break;
      if (!puedeTratar(caso, s, t).ok) { log(s, s.reloj, 'aviso', 'No se pudo aplicar: ' + t.nombre + '.'); continue; }
      const a = s.tratamientos[t.id];
      log(s, s.reloj, 'tratar', 'Aplicaste: ' + t.nombre + '. ' + t.efecto);
      s.tratamientos[t.id] = { veces: (a ? a.veces : 0) + 1, min: s.reloj, necesitaReeval: !!t.reevaluar_antes_de_repetir };
      hechos.push(t.id);
      avanzar(caso, s, t.minutos); // cuenta desde que se empieza
    }
    return hechos;
  }

  function terminar(caso, s) {
    if (s.estado === 'terminado') return;
    s.estado = 'terminado';
    s.resultado = { motivo: 'manual', estable: null, minuto: s.reloj };
    log(s, s.reloj, 'fin', 'Terminaste la atención en el minuto ' + s.reloj + '.');
  }

  global.Motor = { COSTO, crear, esUrgente, valoresReales, situacion, faseActual, avanzar, medir, preguntar, explorar,
    pedirPrueba, estadoPrueba, esperar, puedeTratar, tratar, terminar, fmt, idsDe };
})(window);
