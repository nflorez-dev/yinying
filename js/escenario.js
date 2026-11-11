// ---------------------------------------------------------------
// ESCENARIO + OBRA
//  · Escenario: objetos, clima y desastres que el director (acts.js)
//    manda al teatro. Todo es provisional (sombras de tinta + fuego).
//  · Obra: pega Acts con el teatro (arranque, grabación, repetición).
// Cargar DESPUÉS de acts.js y ANTES de theater.js.
// ---------------------------------------------------------------

// ruido determinista 0..1 (mismo n -> mismo valor): sirve para lluvia, temblor, etc.
function hashN(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const Escenario = (() => {
  // --- medidas en PÍXELES DE ARTE (320x180); se escalan con CFG.ESCALA ---
  const SUELO = 140;            // y donde se apoyan los objetos
  const X0 = 64, X1 = 256;      // rango horizontal útil del escenario
  const CIELO_Y = 46;           // altura de luna / eclipse / nubes
  const INT_ACTO = [0.15, 0.3, 0.5, 0.7, 1.0]; // igual que acts.js
  const FUEGO_MS = DURACIONES.incendio; // lo que tarda un objeto en quemarse
  const TRUENOS = [2500, 5200, 5500, 9000, 11000];
  const N_METEOROS = 6;
  const DUR = DURACIONES;       // misma tabla que usa el director (config.js)
  const ALTO = { arbol: 46, arbusto: 14, caja: 22, roca: 12, casa: 44, farol: 52 };

  let ahora = 0;        // reloj del escenario (ms). En la repetición corre 3x
  let props = [];       // objetos puestos: {name, x, t0, v, fuego, fuegoDur, quemado}
  let efectos = [];     // efectos activos: {name, t0, dur, x, i}
  let actVista = 0;     // acto que se está mostrando (para el ambiente)
  let enReplay = false;
  let actoresRep = [];  // sombras de la repetición (último fotograma grabado)
  const est = { viento: 0, sismo: 0 };

  const E = () => CFG.ESCALA;
  const env = (p, a = 0.15, b = 0.2) => Math.max(0, Math.min(1, Math.min(p / a, (1 - p) / b)));

  // ---------- estado ----------
  function reset() {
    ahora = 0; props = []; efectos = []; actVista = 0; actoresRep = [];
    est.viento = 0; est.sismo = 0;
  }
  function modoReplay(v) { enReplay = v; }
  function setActo(n) { actVista = n; }
  function setActoresReplay(a) { actoresRep = a || []; }

  function update(dt) {
    ahora += dt;
    efectos = efectos.filter((e) => ahora - e.t0 < e.dur);
    props.forEach((p) => {
      if (p.fuego !== null && ahora - p.fuego >= p.fuegoDur) { p.fuego = null; p.quemado = true; }
    });
    est.viento = 0; est.sismo = 0;
    efectos.forEach((e) => {
      const p = (ahora - e.t0) / e.dur;
      if (e.name === "viento") est.viento = Math.max(est.viento, e.i * env(p));
      if (e.name === "tormenta") est.viento = Math.max(est.viento, 0.8 * env(p));
      if (e.name === "terremoto") est.sismo = Math.max(est.sismo, e.i * env(p, 0.1, 0.3));
    });
  }

  // Recibe un evento del director: { name, kind, layer, x(0..1), intensity, burns }
  function aplicar(ev) {
    const x = X0 + ev.x * (X1 - X0);
    const I = ev.intensity;
    if (ev.kind === "object") {
      props.push({ name: ev.name, x, t0: ahora, v: Math.floor(hashN(x * 7.3) * 3), fuego: null, fuegoDur: 0, quemado: false });
    } else if (ev.name === "incendio") {
      let objetivo = null, mejor = 1e9;
      if (ev.burns) {
        props.forEach((p) => {
          if (p.name === ev.burns && !p.quemado && p.fuego === null && Math.abs(p.x - x) < mejor) {
            mejor = Math.abs(p.x - x); objetivo = p;
          }
        });
      }
      if (objetivo) { objetivo.fuego = ahora; objetivo.fuegoDur = FUEGO_MS; }
      else efectos.push({ name: "fogata", t0: ahora, dur: FUEGO_MS, x, i: I });
    } else if (ev.name === "finale") {
      // todo arde, eclipse, meteoritos, temblor y apagón final
      props.forEach((p) => { if (!p.quemado && p.fuego === null) { p.fuego = ahora; p.fuegoDur = 9000; } });
      efectos.push({ name: "finale", t0: ahora, dur: 9500, x: 160, i: 1 });
      efectos.push({ name: "eclipse", t0: ahora, dur: 9500, x: 160, i: 1 });
      efectos.push({ name: "meteoritos", t0: ahora, dur: 9000, x: 160, i: 1 });
      efectos.push({ name: "terremoto", t0: ahora, dur: 9000, x: 160, i: 1 });
    } else {
      efectos.push({ name: ev.name, t0: ahora, dur: DUR[ev.name] || 8000, x, i: I });
    }
  }

  function intensidadVista() {
    if (!enReplay && (Acts.phase === "act" || Acts.phase === "interlude")) return Acts.intensity();
    return INT_ACTO[actVista - 1] || 0;
  }

  // amplitud del temblor en px de arte
  function temblor() {
    let amp = est.sismo * 7;
    efectos.forEach((e) => {
      const age = ahora - e.t0, p = age / e.dur;
      if (e.name === "tormenta") TRUENOS.forEach((t) => { if (age >= t && age < t + 150) amp = Math.max(amp, 3); });
      if (e.name === "meteoritos") {
        for (let i = 0; i < N_METEOROS; i++) {
          const b = age - (400 + i * 1400) - 1000;
          if (b >= 0 && b < 250) amp = Math.max(amp, 5);
        }
      }
      if (e.name === "finale") amp = Math.max(amp, 4 * env(p, 0.1, 0.3));
    });
    // en el clímax en vivo el mundo ya retumba un poco antes del final
    if (!enReplay && Acts.phase === "act" && Acts.isClimax) amp = Math.max(amp, Math.max(0, Acts.intensity() - 0.6) * 3);
    return amp;
  }

  function stats() {
    return { objetos: props.length, quemados: props.filter((p) => p.quemado || p.fuego !== null).length };
  }

  // ---------- dibujo: piezas ----------
  function llama(x, y, s, t) {
    if (s <= 0.02) return;
    const f = Math.floor(t / 110) % 3;
    noStroke();
    fill(255, 150, 40, 38);
    circle(x, y - 9 * s, 38 * s);
    [[220, 60, 20, 9, 22], [255, 140, 30, 6.5, 16], [255, 225, 110, 3.5, 9]].forEach(([r, g, b, w, h], i) => {
      fill(r, g, b);
      triangle(x - w * s, y, x + w * s, y, x + (f - 1) * 1.5 * s, y - (h + ((f + i) % 2) * 3) * s);
    });
  }

  function forma(nombre, s) {
    scale(s);
    fill(...TINTA);
    switch (nombre) {
      case "arbol":
        rect(-3, -30, 6, 30); ellipse(0, -44, 34, 30); ellipse(-11, -34, 22, 18); ellipse(11, -34, 22, 18);
        break;
      case "arbusto":
        ellipse(0, -8, 30, 16); ellipse(-10, -6, 18, 12); ellipse(10, -6, 18, 12);
        break;
      case "caja":
        rect(-12, -22, 24, 22);
        stroke(...PAPEL); strokeWeight(1); line(-12, -22, 12, 0); line(12, -22, -12, 0); noStroke();
        break;
      case "roca":
        ellipse(0, -9, 32, 18); ellipse(-9, -6, 18, 12);
        break;
      case "casa":
        rect(-18, -24, 36, 24); triangle(-24, -24, 24, -24, 0, -44);
        fill(...PAPEL); rect(-4, -16, 8, 8);
        break;
      case "farol":
        rect(-1.5, -40, 3, 40); rect(-6, -52, 12, 12);
        fill(255, 215, 120); rect(-3, -49, 6, 6);
        break;
    }
  }

  function formaQuemada() {
    fill(...TINTA);
    ellipse(0, -2, 24, 5); rect(-8, -6, 2, 6); rect(4, -8, 2, 8);
    const g = Math.floor(ahora / 300) % 2;
    fill(255, 120, 40, 140); circle(-3, -3, 3 - g); circle(5, -2, 2 + g);
  }

  // ---------- dibujo: capas ----------
  // cielo: detrás de las sombras
  function dibujarFondo() {
    push(); scale(E()); noStroke();
    efectos.forEach((e) => {
      const age = ahora - e.t0, p = age / e.dur;
      if (e.name === "luna") {
        const al = env(p, 0.2, 0.2);
        fill(255, 230, 150, 40 * al); circle(e.x, CIELO_Y, 46);
        fill(26, 18, 16, 255 * al); circle(e.x, CIELO_Y, 26);
        fill(80, 62, 55, 255 * al); circle(e.x - 4, CIELO_Y - 3, 6); circle(e.x + 5, CIELO_Y + 4, 4);
      } else if (e.name === "estrella fugaz") {
        const hx = e.x - 50 + p * 120, hy = 18 + p * 70, al = env(p, 0.1, 0.3);
        stroke(26, 18, 16, 200 * al); strokeWeight(2); line(hx - 26, hy - 15, hx, hy);
        noStroke(); fill(255, 170, 60, 255 * al); circle(hx, hy, 5);
      } else if (e.name === "nube") {
        const cx = -40 + p * 400, cy = CIELO_Y - 6;
        fill(26, 18, 16, 215 * env(p, 0.04, 0.04));
        ellipse(cx, cy, 52, 18); ellipse(cx - 15, cy + 3, 32, 14); ellipse(cx + 17, cy + 4, 34, 14); ellipse(cx, cy - 6, 30, 16);
      } else if (e.name === "eclipse") {
        const al = env(p, 0.15, 0.15), off = -46 + p * 92, y = CIELO_Y + 6;
        fill(255, 190, 70, 90 * al); circle(160, y, 64);
        fill(255, 232, 160, 235 * al); circle(160, y, 36);
        fill(26, 18, 16, 255 * al); circle(160 + off, y, 38);
        if (Math.abs(off) < 9) { noFill(); stroke(255, 200, 90, 220 * al); strokeWeight(2); circle(160, y, 46); noStroke(); }
      }
    });
    pop();
  }

  // objetos del escenario: detrás de los animales
  function dibujarProps() {
    const k = E();
    props.forEach((p) => {
      const grow = Math.min(1, Math.floor((ahora - p.t0) / 100) / 4); // aparece en 4 pasos
      if (grow <= 0) return;
      const flexible = p.name === "arbol" || p.name === "arbusto" || p.name === "farol";
      const ang = flexible && !p.quemado ? Math.sin(ahora / 260 + p.x) * 0.05 * est.viento : 0;
      const jx = est.sismo ? (hashN(Math.floor(ahora / 50) + p.x) - 0.5) * 3 * est.sismo : 0;
      push();
      scale(k); translate(p.x + jx, SUELO); rotate(ang); scale(1, grow); noStroke();
      if (p.quemado) formaQuemada(); else forma(p.name, [0.85, 1, 1.15][p.v]);
      pop();

      if (p.fuego !== null) {
        const fa = ahora - p.fuego, fe = env(fa / p.fuegoDur, 0.12, 0.2), h = ALTO[p.name] || 20;
        const n = Math.max(2, Math.round(h / 14));
        push(); scale(k); noStroke();
        llama(p.x, SUELO, 1.1 * fe, ahora);
        for (let j = 0; j < n; j++) {
          const fy = SUELO - h * (0.25 + 0.6 * (j / Math.max(1, n - 1)));
          const fx = p.x + (hashN(j + p.x) - 0.5) * 14;
          llama(fx, fy, (1.0 - 0.4 * (j / n)) * fe, ahora + j * 70);
        }
        for (let j = 0; j < 3; j++) { // humo
          const sy = SUELO - h - ((fa / 40 + j * 14) % 30);
          fill(60, 50, 50, 110 * fe); circle(p.x + Math.sin(fa / 300 + j) * 3, sy, 6 + j * 2);
        }
        pop();
      }
    });
  }

  function lluvia(age, dens, a) {
    const n = Math.floor(25 + 95 * dens);
    stroke(26, 18, 16, 150 * a); strokeWeight(1);
    for (let i = 0; i < n; i++) {
      const sp = 0.30 * (0.8 + hashN(i * 2.3) * 0.4);
      const y = (hashN(i * 3.1) * 190 + age * sp) % 190 - 5;
      const x = (hashN(i * 1.7) * 340 + y * 0.18) % 330 - 5;
      line(x, y, x - 1.5, y + 6);
    }
    noStroke();
  }

  function viento(age, a) {
    noFill(); stroke(26, 18, 16, 90 * a); strokeWeight(1);
    for (let i = 0; i < 12; i++) {
      const y = 28 + hashN(i * 4.4) * 112;
      const x = ((age * 0.16 * (1 + hashN(i))) + hashN(i * 9.1) * 400) % 420 - 50;
      beginShape();
      for (let k = 0; k < 7; k++) vertex(x + k * 5, y + Math.sin(k * 0.9 + age / 130 + i) * 2);
      endShape();
    }
    noStroke();
  }

  function agua(a, I) {
    const lvl = 30 * (0.6 + 0.4 * I) * a;
    if (lvl < 0.5) return;
    const y0 = 152 - lvl;
    fill(30, 60, 90, 150); rect(0, y0, 320, 200);
    fill(150, 205, 235, 150);
    for (let x = 0; x < 320; x += 4) rect(x, y0 + Math.round(Math.sin(x * 0.2 + ahora / 200) * 1.5), 4, 2);
  }

  function escombros(age, a) {
    for (let i = 0; i < 10; i++) {
      const x = hashN(i * 5.7) * 320;
      const y = (age * 0.09 * (0.8 + hashN(i) * 0.5) + hashN(i * 2.1) * 180) % 180;
      fill(26, 18, 16, 200 * a); rect(Math.round(x), Math.round(y), 2, 3);
    }
  }

  function meteoritos(age) {
    const FALL = 1000;
    for (let i = 0; i < N_METEOROS; i++) {
      const a = age - (400 + i * 1400);
      if (a < 0) continue;
      const xi = X0 + hashN(i * 5.5) * (X1 - X0);
      if (a < FALL) {
        const q = a / FALL, hx = xi + 70 * (1 - q), hy = -10 + (SUELO + 10) * q;
        stroke(255, 160, 40, 210); strokeWeight(3); line(hx + 10, hy - 22, hx, hy);
        stroke(255, 230, 120); strokeWeight(1); line(hx + 10, hy - 22, hx, hy);
        noStroke(); fill(255, 210, 90); circle(hx, hy, 4);
      } else {
        const b = a - FALL;
        if (b < 350) { noStroke(); fill(255, 220, 120, 200 * (1 - b / 350)); circle(xi, SUELO - 3, 10 + b / 6); }
        if (b < 2600) llama(xi, SUELO, 0.9 * env(b / 2600, 0.1, 0.4), ahora + i * 50);
      }
    }
  }

  function rayo(t) {
    let x = 70 + hashN(t) * 180;
    stroke(255, 255, 215); strokeWeight(2);
    for (let y = 0; y < SUELO; y += 14) {
      const nx = x + (hashN(t + y) - 0.5) * 16;
      line(x, y, nx, y + 14); x = nx;
    }
    noStroke();
  }

  // delante de los animales: clima, fuego, agua y las capas de luz/oscuridad
  function dibujarFrente() {
    let oscuro = intensidadVista() * 38, rojo = 0, destello = 0, negro = 0;
    push(); scale(E()); noStroke();
    efectos.forEach((e) => {
      const age = ahora - e.t0, p = age / e.dur;
      switch (e.name) {
        case "lluvia": lluvia(age, 0.45 + 0.55 * e.i, env(p)); break;
        case "viento": viento(age, env(p) * e.i); break;
        case "inundacion": agua(env(p, 0.25, 0.3), e.i); break;
        case "fogata": {
          const s = (0.7 + 0.6 * e.i) * env(p, 0.12, 0.2);
          llama(e.x - 6, SUELO, s * 0.8, ahora); llama(e.x + 5, SUELO, s * 0.9, ahora + 90); llama(e.x, SUELO, s * 1.2, ahora + 40);
          break;
        }
        case "terremoto": escombros(age, env(p, 0.1, 0.3)); break;
        case "meteoritos": meteoritos(age); break;
        case "tormenta": {
          lluvia(age, 1, env(p));
          oscuro = Math.max(oscuro, 110 * env(p));
          TRUENOS.forEach((t) => {
            const d = age - t;
            if (d >= 0 && d < 90) destello = Math.max(destello, 200 * (1 - d / 90));
            if (d >= 0 && d < 150) rayo(t);
          });
          break;
        }
        case "eclipse": {
          const off = -46 + p * 92, cover = 1 - Math.min(1, Math.abs(off) / 38);
          oscuro = Math.max(oscuro, 125 * cover * env(p, 0.15, 0.15));
          break;
        }
        case "finale": {
          const fe = env(p, 0.1, 0.18);
          oscuro = Math.max(oscuro, 120 * fe);
          rojo = Math.max(rojo, 95 * env(p, 0.2, 0.5));
          for (let k = 0; k < 7; k++) llama(X0 + (k * (X1 - X0)) / 6, SUELO, (1.0 + 0.5 * hashN(k)) * fe * 1.3, ahora + k * 60);
          if (p > 0.82) negro = Math.max(negro, Math.pow((p - 0.82) / 0.18, 2) * 255);
          break;
        }
      }
    });
    pop();

    noStroke();
    const m = 40; // margen extra por si la pantalla tiembla
    if (oscuro > 0) { fill(8, 6, 12, oscuro); rect(-m, -m, W + 2 * m, H + 2 * m); }
    if (rojo > 0) { fill(170, 35, 10, rojo); rect(-m, -m, W + 2 * m, H + 2 * m); }
    if (destello > 0) { fill(255, 255, 240, destello); rect(-m, -m, W + 2 * m, H + 2 * m); }
    if (negro > 0) { fill(0, 0, 0, negro); rect(-m, -m, W + 2 * m, H + 2 * m); }
  }

  // ---------- HUD: tarjetas de acto, título, fin ----------
  const ROMANO = ["I", "II", "III", "IV", "V"];
  const TITULOS = ["EL TELÓN SE ABRE", "ALGO CAMBIA", "SURGE EL PELIGRO", "TODO SE COMPLICA", "EL GRAN FINAL"];
  const velo = (a) => { noStroke(); fill(26, 18, 16, a); rect(0, 0, W, H); };

  // Tamaños en píxeles reales del lienzo (1280x720), sin depender de U.
  function dibujarHUD() {
    const fase = Acts.phase;
    textAlign(CENTER, CENTER); noStroke();

    if (fase === "idle") {
      velo(185);
      fill(...PAPEL);
      textSize(72); text("YINYING 陰影", W / 2, H * 0.34);
      textSize(24); text("TEATRO DE SOMBRAS", W / 2, H * 0.34 + 72);
      textSize(26); text("HAZ UN GESTO CON LA MANO PARA COMENZAR", W / 2, H * 0.62);
      fill(255, 150, 40); rect(W / 2 - 150, H * 0.62 + 32, 300 * Obra.progresoInicio(), 5);
      fill(...PAPEL, 150); textSize(18);
      text("ENTER O ESPACIO TAMBIÉN INICIAN · 5 ACTOS", W / 2, H * 0.62 + 66);
    } else if (fase === "interlude") {
      const n = Acts.act, a = env(Acts.interludeProgress, 0.2, 0.25);
      velo(245 * a);
      fill(250, 244, 226, 255 * a);
      textSize(88); text("ACTO " + ROMANO[n - 1], W / 2, H * 0.42);
      if (n === Acts.totalActs) fill(255, 120, 60, 255 * a);
      textSize(28); text(TITULOS[n - 1], W / 2, H * 0.42 + 80);
    } else if (fase === "act") {
      const n = Acts.act;
      fill(26, 18, 16, 190); rect(12, H - 54, 330, 42);
      fill(...PAPEL); textAlign(LEFT, CENTER); textSize(20);
      text("ACTO " + ROMANO[n - 1] + "/V  " + "■".repeat(n) + "□".repeat(Acts.totalActs - n), 24, H - 33);
      fill(255, 150, 40); rect(12, H - 12, 330 * Acts.actProgress, 4);
    } else if (fase === "replay") {
      fill(26, 18, 16, 190); rect(12, 12, 430, 42);
      fill(...PAPEL); textAlign(LEFT, CENTER); textSize(20);
      text("▶▶ REPETICIÓN x" + Acts.CFG.replaySpeed + (actVista ? "  ·  ACTO " + ROMANO[actVista - 1] : ""), 24, 33);
      fill(255, 150, 40); rect(0, H - 4, W * Acts.replayProgress, 4);
    } else if (fase === "end") {
      velo(215);
      const st = stats();
      fill(...PAPEL);
      textSize(110); text("FIN", W / 2, H * 0.28);
      textSize(22); text("ID DE TU OBRA  #" + Acts.seed.toString(16).toUpperCase(), W / 2, H * 0.28 + 92);
      textSize(20);
      text(Obra.resumen(), W / 2, H * 0.58);
      text("OBJETOS: " + st.objetos + "  ·  QUEMADOS: " + st.quemados, W / 2, H * 0.58 + 34);
      fill(...PAPEL, 160); textSize(18);
      text("ESPACIO / ENTER PARA OTRA OBRA", W / 2, H * 0.82);
    }
    textAlign(LEFT, BASELINE);
  }

  return {
    reset, update, aplicar, modoReplay, setActo, setActoresReplay,
    actoresReplay: () => actoresRep,
    temblor, stats, dibujarFondo, dibujarProps, dibujarFrente, dibujarHUD,
  };
})();

// ---------------------------------------------------------------
// OBRA: arranque, grabación de lo que hace el usuario y repetición
// ---------------------------------------------------------------
const Obra = (() => {
  let espera = 0;          // ms con un gesto sostenido (para empezar)
  let tFin = 0;            // ms desde que terminó la repetición
  let acc = 0;             // acumulador de grabación
  let prev = new Set();    // sombras vivas en el fotograma anterior
  let apariciones = {};    // cuántas veces invocó cada tipo
  const REC_MS = 100;      // se graba un fotograma cada 100 ms
  const HOLD_MS = 1200;    // gesto sostenido para comenzar
  const NOMBRES = { conejo: "conejo", dragon: "dragón", pajaro: "pájaro" };

  function iniciar() {
    Escenario.reset();
    Escenario.modoReplay(false);
    apariciones = {}; prev = new Set(); acc = 0; espera = 0; tFin = 0;
    Acts.start();
  }

  function pedirInicio() {
    if (Acts.phase === "idle" || Acts.phase === "end") iniciar();
  }

  // un paso por fotograma (solo en modo teatro)
  function avanzar(dt) {
    const fase = Acts.phase;
    Acts.update(dt);
    Escenario.update(fase === "replay" ? dt * Acts.CFG.replaySpeed : dt);

    if (fase === "idle" || fase === "end") {
      tFin = fase === "end" ? tFin + dt : 0;
      const puede = fase === "idle" || tFin > 5000;
      espera = puede && actoresActivos().length > 0 ? espera + dt : 0;
      if (espera >= HOLD_MS) iniciar();
    }
  }

  // snap = sombras dibujadas este fotograma (ver dibujarSombras en theater.js)
  function grabar(snap, dt) {
    if (Acts.phase !== "act") return;
    const keys = new Set(snap.map((s) => s.key + ":" + s.t));
    snap.forEach((s) => { if (!prev.has(s.key + ":" + s.t)) apariciones[s.t] = (apariciones[s.t] || 0) + 1; });
    prev = keys;
    acc += dt;
    if (acc >= REC_MS) { acc -= REC_MS; Acts.record("frame", { a: snap }); }
  }

  function resumen() {
    const partes = Object.keys(apariciones).map((t) => (NOMBRES[t] || t) + " ×" + apariciones[t]);
    return partes.length ? "INVOCASTE: " + partes.join(" · ") : "NO INVOCASTE A NADIE";
  }

  return { iniciar, pedirInicio, avanzar, grabar, resumen, progresoInicio: () => Math.min(1, espera / HOLD_MS) };
})();

// Conecta el director (Acts) con el escenario. Llamar una vez en setup().
function conectarObra() {
  const h = Acts.hooks;
  h.onActIntro = (n) => Escenario.setActo(n);
  h.onRandomEvent = (ev) => Escenario.aplicar(ev);
  h.onReplayStart = () => { Escenario.reset(); Escenario.modoReplay(true); };
  h.onReplayEvent = (ev) => {
    if (ev.type === "frame") Escenario.setActoresReplay(ev.a);
    else if (ev.type === "random") Escenario.aplicar(ev);
    else if (ev.type === "act") Escenario.setActo(ev.act);
  };
  h.onEnd = () => Escenario.setActoresReplay([]);
}