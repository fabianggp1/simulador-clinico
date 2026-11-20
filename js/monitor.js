/* Monitor tipo UCI dibujado por código (sin librerías).
   - ECG derivación II con barrido en movimiento y curva de pletismografía.
   - 13 ritmos; la frecuencia dibujada es igual a la FC mostrada.
   - Límites de alarma en LIMITES (se pueden cambiar aquí). */
(function (global) {
  'use strict';

  /* ---------- Límites de alarma (rango normal del adulto) ---------- */
  const LIMITES = {
    fc: [60, 100],      // lpm
    spo2: [94, 100],    // %
    fr: [12, 20],       // rpm
    temp: [36.0, 37.9], // °C
    tas: [90, 139],     // mmHg sistólica
    tad: [50, 89]       // mmHg diastólica
  };

  const NOMBRES = {
    sinusal: 'Ritmo sinusal',
    taquicardia_sinusal: 'Taquicardia sinusal',
    bradicardia_sinusal: 'Bradicardia sinusal',
    fibrilacion_auricular: 'Fibrilación auricular',
    flutter_auricular: 'Flutter auricular',
    taquicardia_supraventricular: 'Taquicardia supraventricular',
    taquicardia_ventricular: 'Taquicardia ventricular',
    fibrilacion_ventricular: 'Fibrilación ventricular',
    elevacion_st: 'Elevación del ST',
    bloqueo_av_completo: 'Bloqueo AV completo',
    asistolia: 'Asistolia',
    actividad_electrica_sin_pulso: 'Actividad eléctrica sin pulso',
    hiperpotasemia_grave: 'Hiperpotasemia grave'
  };

  const SIN_PULSO = ['fibrilacion_ventricular', 'asistolia', 'actividad_electrica_sin_pulso'];
  const TAU = Math.PI * 2;
  const g = (x, m, s, a) => a * Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const num = (x) => { const n = Number(x); return isFinite(n) ? n : null; };

  function parseTA(ta) {
    const m = String(ta == null ? '' : ta).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { s: +m[1], d: +m[2] } : null;
  }

  /* ---------- Alarmas ---------- */
  function alarmas(v) {
    const a = { fc: false, spo2: false, ta: false, fr: false, temp: false };
    if (!v) return a;
    const fc = num(v.fc), sp = num(v.spo2), fr = num(v.fr), t = num(v.temp), ta = parseTA(v.ta);
    a.fc = fc === null || fc < LIMITES.fc[0] || fc > LIMITES.fc[1];
    a.spo2 = sp === null || sp < LIMITES.spo2[0];
    a.ta = !ta || ta.s < LIMITES.tas[0] || ta.s > LIMITES.tas[1] || ta.d < LIMITES.tad[0] || ta.d > LIMITES.tad[1];
    a.fr = fr === null || fr < LIMITES.fr[0] || fr > LIMITES.fr[1];
    a.temp = t === null || t < LIMITES.temp[0] || t > LIMITES.temp[1];
    return a;
  }

  /* ---------- Forma de cada complejo (dt = segundos desde el pico R) ---------- */
  const tT = (rr) => 0.17 + 0.09 * Math.sqrt(rr);
  const qrsFino = (dt, a, r) => a * (g(dt, -0.028, 0.010, -0.10) + g(dt, 0, 0.011, r) + g(dt, 0.028, 0.011, -0.22));

  function complejo(e, dt) {
    const a = e.amp, rr = e.rr;
    switch (e.f) {
      case 'n': // sinusal
        return a * (g(dt, -0.028, 0.010, -0.12) + g(dt, 0, 0.011, 1.0) + g(dt, 0.028, 0.011, -0.22)) + g(dt, tT(rr), 0.045, 0.30);
      case 'st': // elevación del ST «en lápida»
        return a * (g(dt, 0, 0.011, 0.9) + g(dt, 0.028, 0.011, -0.12)) + 0.55 * Math.exp(-Math.pow((dt - 0.16) / 0.14, 4));
      case 'fa':
        return qrsFino(dt, a, 0.9) + g(dt, tT(rr), 0.05, 0.16);
      case 'fl':
        return qrsFino(dt, a, 0.9);
      case 'tsv': // estrecho, regular, con leve descenso del ST
        return a * (g(dt, -0.02, 0.009, -0.10) + g(dt, 0, 0.011, 0.95) + g(dt, 0.027, 0.011, -0.30))
          - 0.10 * Math.exp(-Math.pow((dt - 0.10) / 0.07, 2)) + g(dt, 0.19, 0.04, -0.07);
      case 'tv': // complejo ancho, monomórfico
        return 0.95 * g(dt, 0, 0.042, 1) - 0.65 * g(dt, 0.12, 0.05, 1);
      case 'esc': // escape ventricular: QRS ancho y T opuesta
        return a * (g(dt, -0.02, 0.025, -0.15) + g(dt, 0, 0.032, 0.85) + g(dt, 0.07, 0.03, -0.30)) + g(dt, 0.34, 0.07, -0.25);
      case 'hk': // QRS ancho, sin P y T alta y picuda
        return 0.8 * (g(dt, -0.03, 0.03, -0.20) + g(dt, 0, 0.035, 0.80) + g(dt, 0.07, 0.035, -0.30)) + 0.95 * Math.exp(-Math.abs(dt - 0.27) / 0.045);
      case 'aesp': // complejos anchos y bajos
        return 0.6 * (g(dt, 0, 0.04, 0.8) + g(dt, 0.1, 0.05, -0.30)) + g(dt, 0.35, 0.08, 0.15);
      default:
        return 0;
    }
  }

  const pulso = (d) => g(d, 0.13, d < 0.13 ? 0.045 : 0.095, 1) + g(d, 0.38, 0.06, 0.25);

  /* ---------- Generador de señal ---------- */
  class Generador {
    constructor(ritmo, fc, t0) { this.reiniciar(ritmo, fc, t0 || 0); }

    reiniciar(ritmo, fc, t0) {
      this.ritmo = ritmo;
      this.fc = Math.max(0, Number(fc) || 0);
      this.ev = [];   // complejos ventriculares
      this.pev = [];  // ondas P (auriculares)
      this.k = 0;
      this.proximoV = t0 + 0.2;
      this.proximoA = t0 + 0.1;
      this.refV = this.proximoV;
      this.bloque = [];
      this.fase = [Math.random() * TAU, Math.random() * TAU, Math.random() * TAU];
      const f = this.fc || 1;
      this.n = Math.max(2, Math.round(300 / f)); // flutter: relación de conducción
      this.ia = 60 / (f * this.n);               // flutter: intervalo entre ondas F
    }

    programar(hasta) {
      const r = this.ritmo, rr = this.fc > 0 ? 60 / this.fc : 1;
      switch (r) {
        case 'sinusal': case 'taquicardia_sinusal': case 'bradicardia_sinusal': case 'elevacion_st':
          while (this.proximoV < hasta) {
            const rrk = rr * (1 + 0.02 * Math.sin(this.k++ * 0.9)); // variabilidad leve
            this.ev.push({ t: this.proximoV, rr: rrk, f: r === 'elevacion_st' ? 'st' : 'n', amp: 1, mec: true });
            this.pev.push({ t: this.proximoV - Math.min(0.16, rrk * 0.45) });
            this.proximoV += rrk;
          }
          break;
        case 'fibrilacion_auricular':
          while (this.proximoV < hasta) {
            if (!this.bloque.length) { // 8 intervalos irregulares con media exacta
              const b = []; for (let i = 0; i < 8; i++) b.push(0.55 + Math.random() * 0.95);
              const m = b.reduce((x, y) => x + y, 0) / b.length;
              this.bloque = b.map((x) => x / m);
            }
            const rrk = rr * this.bloque.shift();
            this.ev.push({ t: this.proximoV, rr: rrk, f: 'fa', amp: 0.8 + Math.random() * 0.2, mec: true });
            this.proximoV += rrk;
          }
          break;
        case 'flutter_auricular': case 'taquicardia_supraventricular': case 'taquicardia_ventricular':
        case 'bloqueo_av_completo': case 'hiperpotasemia_grave': case 'actividad_electrica_sin_pulso': {
          const f = { flutter_auricular: 'fl', taquicardia_supraventricular: 'tsv', taquicardia_ventricular: 'tv',
            bloqueo_av_completo: 'esc', hiperpotasemia_grave: 'hk', actividad_electrica_sin_pulso: 'aesp' }[r];
          while (this.proximoV < hasta) {
            this.ev.push({ t: this.proximoV, rr, f, amp: 0.9, mec: r !== 'actividad_electrica_sin_pulso' });
            this.proximoV += rr;
          }
          if (r === 'bloqueo_av_completo') { // ondas P independientes a 78/min
            while (this.proximoA < hasta) { this.pev.push({ t: this.proximoA }); this.proximoA += 60 / 78; }
          }
          break;
        }
        default: break; // FV y asistolia: señal continua
      }
      const corte = hasta - 4;
      if (this.ev.length > 40) this.ev = this.ev.filter((e) => e.t > corte);
      if (this.pev.length > 40) this.pev = this.pev.filter((p) => p.t > corte);
    }

    ecg(t) {
      this.programar(t + 1.2);
      const r = this.ritmo;
      let v = 0;
      for (const e of this.ev) { const dt = t - e.t; if (dt > -0.4 && dt < 0.9) v += complejo(e, dt); }
      for (const p of this.pev) { const dt = t - p.t; if (dt > -0.1 && dt < 0.1) v += g(dt, 0, 0.022, 0.14); }
      if (r === 'fibrilacion_auricular') {
        v += 0.05 * (Math.sin(TAU * 7.1 * t + this.fase[0]) + 0.7 * Math.sin(TAU * 5.3 * t + this.fase[1]) + 0.5 * Math.sin(TAU * 9.7 * t + this.fase[2]));
      } else if (r === 'flutter_auricular') {
        let u = ((t - this.refV) / this.ia + 0.55) % 1; if (u < 0) u += 1;
        v += u < 0.85 ? 0.12 - 0.34 * (u / 0.85) : -0.22 + 0.34 * ((u - 0.85) / 0.15); // diente de sierra
      } else if (r === 'fibrilacion_ventricular') {
        const A = 0.75 * (0.6 + 0.4 * Math.sin(TAU * 0.27 * t + this.fase[0]));
        v += A * (Math.sin(TAU * 4.3 * t + this.fase[0] + 1.4 * Math.sin(TAU * 0.5 * t))
          + 0.7 * Math.sin(TAU * 6.1 * t + this.fase[1] + Math.sin(TAU * 0.31 * t))
          + 0.4 * Math.sin(TAU * 3.1 * t + this.fase[2])) * 0.6;
      } else if (r === 'asistolia') {
        v += 0.02 * Math.sin(TAU * 0.3 * t + this.fase[0]);
      }
      return v + 0.012 * Math.sin(TAU * 0.25 * t) + (Math.random() - 0.5) * 0.012;
    }

    pleth(t, amp) {
      if (SIN_PULSO.indexOf(this.ritmo) >= 0) return 0;
      let p = 0;
      for (const e of this.ev) {
        if (!e.mec) continue;
        const d = t - e.t - 0.2;
        if (d > -0.1 && d < 0.9) p += amp * (e.f === 'fa' ? e.amp : 1) * pulso(d);
      }
      return p;
    }

    /* Cuenta los latidos ventriculares dibujados en «segundos» (para comprobar la FC) */
    static contarLatidos(ritmo, fc, segundos) {
      const gen = new Generador(ritmo, fc, 0);
      const vistos = new Set();
      for (let h = 1; h <= segundos + 1; h++) { // avanza de a 1 s para contar antes de que se descarten los viejos
        gen.programar(h + 0.2);
        gen.ev.forEach((e) => { if (e.t >= 0.2 && e.t < segundos + 0.2) vistos.add(e.t); });
      }
      return vistos.size;
    }
  }

  /* ---------- Monitor (canvas) ---------- */
  const registro = new Set();
  let raf = 0;

  function bucle(ts) {
    raf = 0;
    registro.forEach((m) => m.tick(ts / 1000));
    if (registro.size) raf = requestAnimationFrame(bucle);
  }

  class MonitorUCI {
    constructor(canvas, opc) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.opc = Object.assign({ etiquetaPleth: true }, opc || {});
      this.v = null; this.gen = null; this.ampP = 0.8; this.ultimo = null; this.px = 0;
      this.ajustar();
      registro.add(this);
      if (!raf) raf = requestAnimationFrame(bucle);
    }

    destruir() { registro.delete(this); }

    ajustar() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.pps = clamp(this.w / 5, 60, 170);
      this.hE = Math.round(this.h * 0.64);
      this.limpiar();
    }

    limpiar() {
      const c = this.ctx;
      c.fillStyle = '#05090d'; c.fillRect(0, 0, this.w, this.h);
      c.strokeStyle = 'rgba(120,150,170,.25)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, this.hE + 0.5); c.lineTo(this.w, this.hE + 0.5); c.stroke();
      this.ultimo = null;
      this.etiquetas();
    }

    etiquetas() {
      const c = this.ctx;
      c.font = '600 11px system-ui, sans-serif'; c.textBaseline = 'top';
      const rotulo = (txt, x, y, color) => { // se borra el fondo antes para que el texto no se engrose al repintar
        c.fillStyle = '#05090d'; c.fillRect(x - 2, y - 1, c.measureText(txt).width + 4, 14);
        c.fillStyle = color; c.fillText(txt, x, y);
      };
      rotulo('II', 6, 4, '#4ade80');
      if (this.opc.etiquetaPleth) rotulo('PLETH', 6, this.hE + 4, '#22d3ee');
      if (this.v && SIN_PULSO.indexOf(this.v.ritmo) >= 0) rotulo('sin señal de pulso', 52, this.hE + 4, '#94a3b8');
      if (!this.v) {
        c.fillStyle = '#94a3b8'; c.font = '500 13px system-ui, sans-serif'; c.textAlign = 'center';
        c.fillText('Monitor sin datos: mide las constantes', this.w / 2, this.hE / 2 - 8);
        c.textAlign = 'start';
      }
    }

    setValores(v) {
      this.v = v || null;
      if (!v) { this.gen = null; this.limpiar(); return; }
      const ahora = performance.now() / 1000;
      if (this.gen) this.gen.reiniciar(v.ritmo, v.fc, ahora); else { this.gen = new Generador(v.ritmo, v.fc, ahora); this.limpiar(); }
      const ta = parseTA(v.ta);
      this.ampP = ta ? clamp((ta.s - ta.d) / 45, 0.25, 1.15) : 0.7;
      this.ultimo = null;
    }

    tick(ahora) {
      if (!this.c.isConnected) return;
      if (this.c.clientWidth && (Math.abs(this.c.clientWidth - this.w) > 1 || Math.abs(this.c.clientHeight - this.h) > 1)) this.ajustar();
      if (!this.gen) return;
      if (this.ultimoT === undefined || ahora - this.ultimoT > 0.3) this.ultimoT = ahora - 0.02;
      const paso = 1 / 125, c = this.ctx, gap = 14;
      const hP = this.h - this.hE;
      for (let t = this.ultimoT + paso; t <= ahora; t += paso) {
        this.ultimoT = t;
        const x = (t * this.pps) % this.w;
        const yE = this.hE * 0.64 - this.gen.ecg(t) * this.hE * 0.42;
        const yP = this.hE + hP * 0.88 - this.gen.pleth(t, this.ampP) * hP * 0.62;
        c.fillStyle = '#05090d';
        c.fillRect(x, 0, gap, this.hE - 1); c.fillRect(x, this.hE + 1, gap, hP);
        if (this.ultimo && x > this.ultimo.x) {
          c.lineWidth = 1.8; c.lineJoin = 'round';
          c.strokeStyle = '#4ade80'; c.beginPath(); c.moveTo(this.ultimo.x, this.ultimo.yE); c.lineTo(x, yE); c.stroke();
          c.strokeStyle = '#22d3ee'; c.beginPath(); c.moveTo(this.ultimo.x, this.ultimo.yP); c.lineTo(x, yP); c.stroke();
        }
        this.ultimo = { x: x, yE: yE, yP: yP };
      }
      if (this.ultimo && this.ultimo.x < 150) this.etiquetas(); // se repintan al pasar el barrido
    }
  }

  global.Monitor = { MonitorUCI, Generador, alarmas, parseTA, LIMITES, NOMBRES, SIN_PULSO };
})(window);
