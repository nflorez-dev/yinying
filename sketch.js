// Teatro de Sombras · ETAPA 1: MODO DEBUG de gestos (16:9 forzado, multi-mano)
// Técnica: ml5.js handPose (21 puntos por mano) + p5.js
// Modo por defecto: TEATRO (fondo crema + marco + sombras provisionales por gesto)
// Teclas:  D = vista de cámara con debug   ·   C = mini cámara   ·   M = invertir izquierda/derecha   ·   F = pantalla completa

// ---------------------------------------------------------------
// CONFIGURACIÓN (aquí calibras todo)
// ---------------------------------------------------------------
const CFG = {
  // Resolución forzada 16:9: arte base 320x180 ampliado x4 -> lienzo 1280x720
  BASE_W: 320,
  BASE_H: 180,
  ESCALA: 4,

  // Video que se le da a ml5 (16:9, más liviano = más FPS)
  VIDEO_W: 640,
  VIDEO_H: 360,

  // Manos simultáneas (4 = dos personas). Si bajan los FPS, redúcelo.
  MAX_HANDS: 4,

  // Dedo (índice a meñique) extendido si:
  //   dist(muñeca, punta) / dist(muñeca, articulación PIP) > EXT_RATIO
  EXT_RATIO: 1.15,

  // Pulgar extendido si:
  //   dist(punta del pulgar, base del índice) / tamaño de la palma > THUMB_RATIO
  THUMB_RATIO: 0.75,

  // Dragón: la mano abierta (cabeza) y el puño (cuerpo) deben estar cerca.
  // Distancia entre los centros de las manos / tamaño medio de la palma.
  DRAGON_MAX_DIST: 3.0,

  // Tamaño según la distancia a la cámara (conejo y pájaro; el dragón no cambia).
  // Se mide el tamaño de la mano en el lienzo (TAM) y se traduce a píxeles de
  // pantalla por píxel de arte (ESCALA = 4 es el tamaño normal).
  TAM_REF: 110,  // tamaño de mano (px del lienzo) con el que el sprite sale a escala normal
  ESC_MIN: 2,    // sprite más pequeño (mano lejos)
  ESC_MAX: 7,    // sprite más grande (mano cerca)

  // Dirección: mano izquierda -> mira a la derecha; mano derecha -> mira a la izquierda.
  // Si en tu equipo sale al revés, pulsa M (o pon true aquí).
  INVERTIR_MANOS: false,
  DIR_FRAMES: 6, // fotogramas seguidos para girar al animal (evita parpadeos)

  // Estabilidad (en fotogramas) para evitar parpadeos entre gestos
  STABLE_FRAMES: 8, // fotogramas seguidos para CONFIRMAR un gesto
  LOST_FRAMES: 10,  // fotogramas sin gesto para SOLTARLO

  // Seguimiento de manos entre fotogramas (para que cada mano conserve su #)
  MATCH_DIST: 250,       // máx. distancia (px del lienzo) para considerar la misma mano
  TRACK_LOST_FRAMES: 15, // fotogramas sin ver una mano antes de olvidarla
};

// Derivados
const W = CFG.BASE_W * CFG.ESCALA; // 1280
const H = CFG.BASE_H * CFG.ESCALA; // 720
const S = W / CFG.VIDEO_W;         // video -> lienzo (x2)
const U = W / 640;                 // escala de la interfaz de debug (x2)

// Patrón por dedo: [Pulgar, Índice, Medio, Anular, Meñique]
//   '1' = extendido, '0' = doblado, 'x' = no importa
const GESTOS_UNA_MANO = [
  { id: "conejo", patron: "x1100" }, // "V": índice y medio
  { id: "pajaro", patron: "11000" }, // PROVISIONAL: pulgar + índice ("L")
];
const PATRON_ABIERTA = "x1111"; // mano abierta  (CABEZA del dragón)
const PATRON_PUNO = "x0000";    // puño          (CUERPO del dragón)

// ---------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------
let handPose;
let video;
let hands = [];
let showDebug = false;  // false = TEATRO · true = vista de cámara con debug
let showPip = true;     // mini cámara en el modo teatro
let marco;              // marco del teatro (assets/marco.png, 320x180)
let fondoCrema;         // fondo de papel crema (se genera en setup)
let suaves = {};        // posiciones suavizadas de cada sombra
let extras = {};        // tamaño y dirección estables de cada sombra

let infos = [];        // análisis de cada mano (en coords del lienzo)
let tracks = [];       // manos seguidas entre fotogramas: {id, centro, perdido}
let nextId = 1;
let entidades = {};    // gestos en curso/confirmados, por clave (ver actualizarEntidades)
let dragonVista = [];  // pares abierta+puño evaluados (solo para el debug)

const NOMBRES_DEDOS = ["P", "I", "M", "R", "Me"];
const CADENAS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];
const COLORES_ID = [
  [255, 200, 0],
  [0, 200, 255],
  [255, 100, 200],
  [170, 120, 255],
  [255, 140, 60],
];
const colorId = (id) => color(...COLORES_ID[(id - 1) % COLORES_ID.length]);

// ---------------------------------------------------------------
// p5.js
// ---------------------------------------------------------------
function preload() {
  handPose = ml5.handPose({ maxHands: CFG.MAX_HANDS, flipped: true });
  marco = loadImage("assets/marco.png");
  cargarSprites();
}

function setup() {
  pixelDensity(1); // el lienzo es EXACTAMENTE 1280x720
  createCanvas(W, H);
  noSmooth();
  fondoCrema = crearFondoCrema();

  // Pedimos la cámara en 16:9; si no la ofrece, igual se ajusta a 16:9
  video = createCapture(
    {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
      },
      audio: false,
    },
    { flipped: true }
  );
  video.size(CFG.VIDEO_W, CFG.VIDEO_H);
  video.hide();

  handPose.detectStart(video, (results) => {
    hands = results;
  });
  textFont("monospace");
}

function draw() {
  // 1) Analizar manos y darle a cada una un # que se conserve
  infos = hands.map(analizarMano);
  asignarIds(infos);

  // 2) Detectar gestos (una mano o pareja de dragón) y estabilizarlos
  actualizarEntidades(detectarGestos(infos));

  // 3) Dibujar
  if (showDebug) {
    background(0);
    image(video, 0, 0, W, H);
    fill(0, 120);
    noStroke();
    rect(0, 0, W, H);
    infos.forEach(dibujarMano);
    dibujarDragonDebug();
    dibujarProgreso();
    dibujarPanel();
    dibujarActores();
    dibujarBarra();
  } else {
    dibujarTeatro();
  }
}

function keyPressed() {
  if (key === "d" || key === "D") showDebug = !showDebug;
  if (key === "c" || key === "C") showPip = !showPip;
  if (key === "m" || key === "M") CFG.INVERTIR_MANOS = !CFG.INVERTIR_MANOS;
  if (key === "f" || key === "F") fullscreen(!fullscreen());
}

// ---------------------------------------------------------------
// ANÁLISIS DE LA MANO
// ---------------------------------------------------------------
function d(a, b) {
  return dist(a.x, a.y, b.x, b.y);
}

function analizarMano(hand) {
  // Pasamos los puntos del espacio del video al espacio del lienzo
  const k = hand.keypoints.map((p) => ({ x: p.x * S, y: p.y * S }));
  const muneca = k[0];
  const palma = d(k[0], k[9]); // muñeca -> base del dedo medio

  const ratios = [];
  const ext = [];

  // Pulgar
  const rp = d(k[4], k[5]) / palma;
  ratios.push(rp);
  ext.push(rp > CFG.THUMB_RATIO);

  // Índice, medio, anular, meñique: [punta, PIP]
  for (const [punta, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
    const r = d(k[punta], muneca) / d(k[pip], muneca);
    ratios.push(r);
    ext.push(r > CFG.EXT_RATIO);
  }

  const centro = { x: (k[0].x + k[9].x) / 2, y: (k[0].y + k[9].y) / 2 };

  // Tamaño de la mano (largo y ancho de la palma): crece al acercarse a la cámara
  const tam = (d(k[0], k[9]) + 1.15 * d(k[5], k[17])) / 2;

  // ¿Mano izquierda? (se puede invertir con la tecla M)
  let izq = hand.handedness === "Left";
  if (CFG.INVERTIR_MANOS) izq = !izq;

  return { id: 0, k, ext, ratios, centro, palma, tam, izq, lado: hand.handedness };
}

function coincide(ext, patron) {
  for (let i = 0; i < 5; i++) {
    const c = patron[i];
    if (c === "x") continue;
    if (c === "1" && !ext[i]) return false;
    if (c === "0" && ext[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------
// SEGUIMIENTO DE MANOS (cada mano conserva su # entre fotogramas)
// ---------------------------------------------------------------
function asignarIds(infos) {
  // todas las parejas (mano detectada, mano seguida) ordenadas por cercanía
  const pares = [];
  infos.forEach((info, i) =>
    tracks.forEach((t, j) => pares.push({ i, j, dist: d(info.centro, t.centro) }))
  );
  pares.sort((a, b) => a.dist - b.dist);

  const infoUsada = new Set();
  const trackUsado = new Set();
  for (const p of pares) {
    if (p.dist > CFG.MATCH_DIST) break;
    if (infoUsada.has(p.i) || trackUsado.has(p.j)) continue;
    infoUsada.add(p.i);
    trackUsado.add(p.j);
    infos[p.i].id = tracks[p.j].id;
    tracks[p.j].centro = infos[p.i].centro;
    tracks[p.j].perdido = 0;
  }

  // las manos seguidas que no se vieron este fotograma
  tracks.forEach((t, j) => {
    if (!trackUsado.has(j)) t.perdido++;
  });
  tracks = tracks.filter((t) => t.perdido <= CFG.TRACK_LOST_FRAMES);

  // manos nuevas
  infos.forEach((info, i) => {
    if (!infoUsada.has(i)) {
      info.id = nextId++;
      tracks.push({ id: info.id, centro: info.centro, perdido: 0 });
    }
  });
}

// ---------------------------------------------------------------
// DETECCIÓN DE GESTOS (devuelve los gestos "crudos" de ESTE fotograma)
// ---------------------------------------------------------------
function detectarGestos(infos) {
  const raws = {};

  // Dragón: pareja de mano abierta (cabeza) + puño (cuerpo), cercanas
  const abiertas = infos.filter((i) => coincide(i.ext, PATRON_ABIERTA));
  const punos = infos.filter((i) => coincide(i.ext, PATRON_PUNO));
  const candidatos = [];
  for (const a of abiertas) {
    for (const b of punos) {
      const dist = d(a.centro, b.centro) / ((a.palma + b.palma) / 2);
      candidatos.push({ a, b, dist, ok: dist <= CFG.DRAGON_MAX_DIST });
    }
  }
  candidatos.sort((x, y) => x.dist - y.dist);
  dragonVista = candidatos;

  const usadas = new Set(); // manos que ya forman un dragón
  for (const c of candidatos) {
    if (!c.ok || usadas.has(c.a.id) || usadas.has(c.b.id)) continue;
    usadas.add(c.a.id);
    usadas.add(c.b.id);
    raws["d" + c.a.id + "-" + c.b.id] = {
      tipo: "dragon",
      pos: {
        x: (c.a.centro.x + c.b.centro.x) / 2,
        y: (c.a.centro.y + c.b.centro.y) / 2,
      },
      cabeza: c.a.centro,
      cuerpo: c.b.centro,
    };
  }

  // Gestos de una mano (las manos del dragón no cuentan)
  for (const info of infos) {
    if (usadas.has(info.id)) continue;
    const g = GESTOS_UNA_MANO.find((g) => coincide(info.ext, g.patron));
    if (g) raws["h" + info.id] = { tipo: g.id, pos: info.centro, tam: info.tam, izq: info.izq };
  }
  return raws;
}

// ---------------------------------------------------------------
// ESTABILIDAD: cada "entidad" (una mano o una pareja de dragón) confirma,
// cambia y suelta su gesto por separado
// ---------------------------------------------------------------
function actualizarEntidades(raws) {
  for (const key in raws) {
    const raw = raws[key];
    const e = entidades[key] || (entidades[key] = { tipo: null, cand: null, cont: 0, perdido: 0, data: null });
    e.perdido = 0;

    if (raw.tipo === e.tipo) {
      e.data = raw; // mismo gesto: sigue a la mano
      e.cand = null;
      e.cont = 0;
    } else {
      if (raw.tipo === e.cand) e.cont++;
      else {
        e.cand = raw.tipo;
        e.cont = 1;
      }
      e.pos = raw.pos; // para dibujar el progreso
      if (e.cont >= CFG.STABLE_FRAMES) {
        e.tipo = raw.tipo; // cambio confirmado
        e.data = raw;
        e.cand = null;
        e.cont = 0;
      }
    }
  }

  // las que no aparecen este fotograma
  for (const key in entidades) {
    if (key in raws) continue;
    const e = entidades[key];
    e.cand = null;
    e.cont = 0;
    e.perdido++;
    if (e.perdido >= CFG.LOST_FRAMES) delete entidades[key];
  }
}

// API para el teatro (etapa 2): lista de gestos confirmados ahora mismo.
// Cada uno trae: key, tipo ("conejo" | "pajaro" | "dragon"), pos y,
// para el dragón, cabeza y cuerpo.
function actoresActivos() {
  return Object.keys(entidades)
    .filter((k) => entidades[k].tipo)
    .map((k) => ({ key: k, tipo: entidades[k].tipo, ...entidades[k].data }));
}

// ---------------------------------------------------------------
// DIBUJO
// ---------------------------------------------------------------
function dibujarMano(info) {
  const k = info.k;

  // huesos
  stroke(255, 180);
  strokeWeight(2 * U);
  for (const cadena of CADENAS) {
    for (let i = 0; i < cadena.length - 1; i++) {
      const a = k[cadena[i]];
      const b = k[cadena[i + 1]];
      line(a.x, a.y, b.x, b.y);
    }
  }

  // puntos (las puntas: verde = extendido, rojo = doblado)
  noStroke();
  k.forEach((p) => {
    fill(255);
    circle(p.x, p.y, 5 * U);
  });
  [4, 8, 12, 16, 20].forEach((idx, f) => {
    fill(info.ext[f] ? color(60, 220, 90) : color(230, 60, 60));
    circle(k[idx].x, k[idx].y, 14 * U);
  });

  // centro de la mano, con su # (el color identifica a cada mano)
  noFill();
  stroke(colorId(info.id));
  strokeWeight(3 * U);
  circle(info.centro.x, info.centro.y, 22 * U);
  noStroke();
  fill(colorId(info.id));
  textAlign(CENTER, CENTER);
  textSize(16 * U);
  text("#" + info.id + (info.izq ? " IZQ" : " DER"), info.centro.x, info.centro.y + 26 * U);
}

function dibujarDragonDebug() {
  for (const c of dragonVista) {
    const col = c.ok ? color(60, 220, 90) : color(230, 60, 60);
    stroke(col);
    strokeWeight(3 * U);
    line(c.a.centro.x, c.a.centro.y, c.b.centro.x, c.b.centro.y);

    noStroke();
    textAlign(CENTER, CENTER);
    textSize(12 * U);
    fill(255);
    text("cabeza", c.a.centro.x, c.a.centro.y - 30 * U);
    text("cuerpo", c.b.centro.x, c.b.centro.y - 30 * U);
    fill(col);
    text(
      "dragón: separación " + nf(c.dist, 1, 2) + " / máx " + CFG.DRAGON_MAX_DIST + (c.ok ? "  OK" : "  MUY LEJOS"),
      (c.a.centro.x + c.b.centro.x) / 2,
      (c.a.centro.y + c.b.centro.y) / 2 + 26 * U
    );
  }
}

// anillo amarillo que se llena hasta confirmar un gesto
function dibujarProgreso() {
  for (const key in entidades) {
    const e = entidades[key];
    if (!e.cand || !e.pos) continue;
    const prog = constrain(e.cont / CFG.STABLE_FRAMES, 0, 1);
    noFill();
    stroke(255, 220, 0);
    strokeWeight(5 * U);
    arc(e.pos.x, e.pos.y, 80 * U, 80 * U, -HALF_PI, -HALF_PI + TWO_PI * prog);
    noStroke();
    fill(255, 220, 0);
    textAlign(CENTER, CENTER);
    textSize(12 * U);
    text("¿" + e.cand + "?", e.pos.x, e.pos.y - 52 * U);
  }
}

function dibujarPanel() {
  const alto = 46 * U + infos.length * 78 * U;
  noStroke();
  fill(0, 190);
  rect(0, 0, 440 * U, alto);
  fill(255);
  textSize(12 * U);
  textAlign(LEFT, TOP);
  text("Lienzo: " + W + "x" + H + "  ·  FPS: " + nf(frameRate(), 2, 0) + "  ·  manos: " + infos.length + "/" + CFG.MAX_HANDS, 8 * U, 6 * U);
  text(infoCamara(), 8 * U, 22 * U);

  infos.forEach((info, i) => {
    const y = 46 * U + i * 78 * U;
    fill(colorId(info.id));
    let linea = "#" + info.id + " (" + info.lado + ")  ";
    info.ext.forEach((e, f) => (linea += NOMBRES_DEDOS[f] + ":" + (e ? "1" : "0") + " "));
    text(linea, 8 * U, y);
    fill(255);
    text("ratios " + info.ratios.map((r) => nf(r, 1, 2)).join("  "), 8 * U, y + 16 * U);
    text("patron " + info.ext.map((e) => (e ? "1" : "0")).join(""), 8 * U, y + 32 * U);
    const k = constrain((info.tam / CFG.TAM_REF) * CFG.ESCALA, CFG.ESC_MIN, CFG.ESC_MAX);
    text(
      "tam " + nf(info.tam, 1, 0) + " -> escala " + nf(k, 1, 1) + "   " + (info.izq ? "IZQ: mira a la derecha" : "DER: mira a la izquierda"),
      8 * U,
      y + 48 * U
    );
  });
}

function infoCamara() {
  const vw = video.elt.videoWidth;
  const vh = video.elt.videoHeight;
  if (!vw || !vh) return "Cámara: iniciando...";
  const ok = abs(vw / vh - 16 / 9) < 0.02;
  return "Cámara nativa: " + vw + "x" + vh + (ok ? " (16:9 OK)" : " (NO es 16:9: se estira)");
}

// marcadores de los gestos confirmados
function dibujarActores() {
  for (const a of actoresActivos()) {
    noFill();
    stroke(60, 220, 90);
    strokeWeight(3 * U);
    circle(a.pos.x, a.pos.y, 60 * U);

    noStroke();
    fill(60, 220, 90);
    textAlign(CENTER, CENTER);
    textSize(14 * U);
    text(a.tipo, a.pos.x, a.pos.y - 44 * U);

    if (a.tipo === "dragon") {
      stroke(60, 220, 90);
      strokeWeight(5 * U);
      line(a.cabeza.x, a.cabeza.y, a.cuerpo.x, a.cuerpo.y);
      noStroke();
      fill(60, 220, 90);
      text("cabeza", a.cabeza.x, a.cabeza.y - 30 * U);
      text("cuerpo", a.cuerpo.x, a.cuerpo.y - 30 * U);
    }
  }
}

function dibujarBarra() {
  noStroke();
  fill(0, 200);
  rect(0, H - 54 * U, W, 54 * U);

  const act = actoresActivos();
  textAlign(LEFT, CENTER);
  textSize(18 * U);
  fill(act.length ? color(60, 220, 90) : color(180));
  text(
    "CONFIRMADOS: " + (act.length ? act.map((a) => a.tipo.toUpperCase()).join("  ·  ") : "—"),
    12 * U,
    H - 36 * U
  );

  textSize(12 * U);
  fill(255);
  text("D = panel  ·  F = pantalla completa", 12 * U, H - 14 * U);
}

// ---------------------------------------------------------------
// TEATRO (modo por defecto)  ·  las sombras son PROVISIONALES
// ---------------------------------------------------------------
const SNAP = CFG.ESCALA * 2;  // el movimiento avanza en saltos de 2 px de arte
const TINTA = [26, 18, 16];   // color de las sombras
const PAPEL = [250, 244, 226]; // blanco cálido (ojos)

// Papel de teatro de sombras: crema cálido, más claro al centro (luz detrás),
// con tramado (dither) para que conserve el look pixel art. Se hace a 320x180.
function crearFondoCrema() {
  const g = createGraphics(CFG.BASE_W, CFG.BASE_H);
  g.pixelDensity(1);
  g.noSmooth();
  g.loadPixels();

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const tonos = [
    [226, 205, 158], // borde (papel más oscuro)
    [240, 223, 180], // base crema
    [252, 241, 208], // centro iluminado
  ];

  for (let y = 0; y < CFG.BASE_H; y++) {
    for (let x = 0; x < CFG.BASE_W; x++) {
      const dd = Math.hypot((x - 160) / 150, (y - 85) / 95);
      const nivel = constrain(1 - dd, 0, 1) * 2.2;       // 0 .. 2.2
      const base = Math.floor(nivel);
      const frac = nivel - base;
      let i = frac * 16 > BAYER[y % 4][x % 4] ? base + 1 : base;
      i = Math.min(i, 2);
      let c = tonos[i];

      // fibras del papel: algunos píxeles un poco más oscuros
      if (((x * 73856093) ^ (y * 19349663)) % 61 === 0) {
        c = [c[0] - 9, c[1] - 11, c[2] - 14];
      }

      const k = 4 * (y * CFG.BASE_W + x);
      g.pixels[k] = c[0];
      g.pixels[k + 1] = c[1];
      g.pixels[k + 2] = c[2];
      g.pixels[k + 3] = 255;
    }
  }
  g.updatePixels();
  return g;
}

function dibujarTeatro() {
  noSmooth();
  image(fondoCrema, 0, 0, W, H);

  // luz de vela: parpadeo en pasos (como el resto de la animación)
  const luz = [0, 8, 14, 6][floor(millis() / 180) % 4];
  noStroke();
  fill(255, 205, 110, luz);
  rect(0, 0, W, H);

  // sombras (detrás del marco)
  const frame = floor(millis() / 220) % 3; // 3 fotogramas, estilo Baba Is You
  const vivos = new Set();
  for (const a of actoresActivos()) {
    if (a.tipo === "dragon") {
      const c = suave(a.key + "c", enEscenario(a.cabeza), vivos);
      const b = suave(a.key + "b", enEscenario(a.cuerpo), vivos);
      if (dragonListo()) dibujarDragonSprite(c, b, frame);
      else sombraDragon(c, b, frame);
    } else {
      const pos = suave(a.key, enEscenario(a.pos), vivos);
      const est = estiloSprite(a.key, a); // tamaño (distancia) y dirección (mano)
      if (a.tipo === "conejo" && listo("conejo")) {
        dibujarSprite("conejo", frame, pos.x, pos.y, est.flip, est.k);
      } else if (a.tipo === "pajaro" && listo("pajaro")) {
        dibujarSprite("pajaro", frame, pos.x, pos.y, est.flip, est.k);
      } else {
        push();
        translate(pos.x, pos.y);
        scale(est.flip ? -est.k : est.k, est.k);
        fill(...TINTA);
        noStroke();
        if (a.tipo === "conejo") sombraConejo(frame);
        if (a.tipo === "pajaro") sombraPajaro(frame); // respaldo si falta el sprite
        pop();
      }
    }
  }
  for (const id in suaves) if (!vivos.has(id)) delete suaves[id];
  for (const id in extras) if (!vivos.has(id)) delete extras[id];

  // marco encima (cortinas, cenefa y suelo)
  image(marco, 0, 0, W, H);

  if (showPip) dibujarPip();
}

// la sombra se queda dentro del escenario (entre las cortinas y sobre el suelo)
function enEscenario(p) {
  const E = CFG.ESCALA;
  return { x: constrain(p.x, 60 * E, 260 * E), y: constrain(p.y, 62 * E, 140 * E) };
}

// suaviza (lerp) y luego "encaja" en la cuadrícula: movimiento escalonado
function suave(id, p, vivos) {
  vivos.add(id);
  const s = suaves[id] || (suaves[id] = { x: p.x, y: p.y });
  s.x = lerp(s.x, p.x, 0.35);
  s.y = lerp(s.y, p.y, 0.35);
  return { x: Math.round(s.x / SNAP) * SNAP, y: Math.round(s.y / SNAP) * SNAP };
}

// --- sombras provisionales (coordenadas en píxeles de arte, centradas en 0,0) ---
function sombraConejo(f) {
  const o = [0, 1, 0][f]; // las orejas se mueven un píxel
  ellipse(0, 8, 34, 40);          // cuerpo
  ellipse(2, -14, 24, 22);        // cabeza
  ellipse(-4, -34 - o, 8, 26);    // orejas
  ellipse(7, -34 + o, 8, 26);
  fill(...PAPEL);
  circle(-2, -16, 3);             // ojos
  circle(8, -16, 3);
}

function sombraPajaro(f) {
  const o = [0, 2, 0][f]; // la cola se agita
  ellipse(0, 0, 44, 34);                          // cuerpo
  ellipse(18, -16, 18, 18);                       // cabeza
  triangle(26, -17, 36, -14, 26, -11);            // pico
  triangle(-20, -4, -40, -14 - o, -38, 6 + o);    // cola
  rect(-6, 14, 2, 9);                             // patas
  rect(4, 14, 2, 9);
  fill(...PAPEL);
  circle(21, -19, 3);                             // ojo
  stroke(...PAPEL);                               // ala
  strokeWeight(1.5);
  noFill();
  arc(-2, 2, 22, 16, 0.3, 2.8);
  noStroke();
}

// cabeza y cuerpo siguen cada uno a su mano; el cuello los une
function sombraDragon(c, b, f) {
  const E = CFG.ESCALA;
  const ch = { x: c.x / E, y: c.y / E };
  const cu = { x: b.x / E, y: b.y / E };
  let dx = cu.x - ch.x;
  let dy = cu.y - ch.y;
  let L = Math.hypot(dx, dy);
  if (L < 2) { dx = 1; dy = 0; L = 1; }
  const ux = dx / L;   // dirección cabeza -> cuerpo
  const uy = dy / L;
  const nx = -uy;      // perpendicular
  const ny = ux;
  const o = [0, 3, 0][f];

  push();
  scale(E);
  fill(...TINTA);
  stroke(...TINTA);
  strokeWeight(20);
  strokeCap(ROUND);
  line(ch.x, ch.y, cu.x, cu.y);   // cuello
  noStroke();

  ellipse(cu.x, cu.y, 58, 46);    // cuerpo
  const tx = cu.x + ux * 70 + nx * o;   // cola (sale por el lado opuesto a la cabeza)
  const ty = cu.y + uy * 70 + ny * o;
  triangle(cu.x + nx * 16, cu.y + ny * 16, cu.x - nx * 16, cu.y - ny * 16, tx, ty);

  ellipse(ch.x, ch.y, 44, 38);                          // cabeza
  ellipse(ch.x - ux * 24, ch.y - uy * 24, 24, 18);      // hocico
  for (const sg of [-1, 1]) {                           // cuernos
    triangle(
      ch.x + nx * sg * 8 + ux * 4, ch.y + ny * sg * 8 + uy * 4,
      ch.x + nx * sg * 14 + ux * 2, ch.y + ny * sg * 14 + uy * 2,
      ch.x + nx * sg * 16 + ux * 22, ch.y + ny * sg * 16 + uy * 22
    );
  }
  fill(...PAPEL);
  circle(ch.x - ux * 8 + nx * 8, ch.y - uy * 8 + ny * 8, 4);  // ojos
  circle(ch.x - ux * 8 - nx * 8, ch.y - uy * 8 - ny * 8, 4);
  pop();
}

// mini cámara para seguir calibrando mientras ves el teatro
function dibujarPip() {
  const PW = 224;
  const PH = 126;
  const x = W - PW - 12;
  const y = H - PH - 12;

  noStroke();
  fill(0);
  rect(x - 3, y - 3, PW + 6, PH + 6);
  image(video, x, y, PW, PH);

  push();
  translate(x, y);
  scale(PW / W);
  infos.forEach(dibujarMano);
  pop();

  const act = actoresActivos();
  noStroke();
  fill(0, 180);
  rect(x, y + PH - 22, PW, 22);
  fill(255);
  textAlign(LEFT, CENTER);
  textSize(11 * U);
  text(act.length ? act.map((a) => a.tipo).join(" · ") : "sin gesto", x + 6, y + PH - 11);
}

// ---------------------------------------------------------------
// SPRITES (hojas de 3 fotogramas en fila, hechas en Aseprite)
// ---------------------------------------------------------------
// Tamaño de UN fotograma, en píxeles de arte. Si cambias el tamaño de un
// sprite en Aseprite, cámbialo aquí.
const SPR_DIM = {
  conejo: [32, 40],   // el conejo está dibujado MIRANDO A LA DERECHA
  pajaro: [44, 36],   // el pájaro está dibujado MIRANDO A LA DERECHA
  cabeza: [56, 40],   // la cabeza del dragón está dibujada MIRANDO A LA IZQUIERDA
  cuerpo: [40, 34],
  segmento: [28, 26],
  cola: [44, 28],     // la cola está dibujada saliendo hacia la DERECHA
};
const SPR_ARCHIVO = {
  conejo: "assets/conejo.png",
  pajaro: "assets/pajaro.png",
  cabeza: "assets/dragon_cabeza.png",
  cuerpo: "assets/dragon_cuerpo.png",
  segmento: "assets/dragon_segmento.png",
  cola: "assets/dragon_cola.png",
};
let SPR = {};

function cargarSprites() {
  for (const n in SPR_ARCHIVO) SPR[n] = loadImage(SPR_ARCHIVO[n]);
}

// true si la hoja cargó bien (si falta el archivo, se usa la sombra provisional)
function listo(n) {
  return SPR[n] && SPR[n].width >= SPR_DIM[n][0] * 3;
}
function dragonListo() {
  return ["cabeza", "cuerpo", "segmento", "cola"].every(listo);
}

// dibuja UN fotograma centrado en (x, y), encajado en la cuadrícula del arte
// k = píxeles de pantalla por píxel de arte (por defecto, la escala normal)
function dibujarSprite(nombre, frame, x, y, flip, k = CFG.ESCALA) {
  const E = CFG.ESCALA;
  const [w, h] = SPR_DIM[nombre];
  push();
  translate(Math.round(x / E) * E, Math.round(y / E) * E);
  if (flip) scale(-1, 1);
  image(SPR[nombre], -(w * k) / 2, -(h * k) / 2, w * k, h * k, frame * w, 0, w, h);
  pop();
}

// Tamaño y dirección ESTABLES de un conejo/pájaro:
//  · tamaño: crece al acercar la mano (tam). Se suaviza y se redondea a un
//    número entero de píxeles por píxel de arte, para que el pixel art no se
//    deforme; crece "a saltos", como el resto de la animación.
//  · dirección: mano izquierda -> mira a la derecha; mano derecha -> a la izquierda.
//    Los sprites están dibujados MIRANDO A LA DERECHA.
function estiloSprite(id, a) {
  const objetivo = constrain((a.tam / CFG.TAM_REF) * CFG.ESCALA, CFG.ESC_MIN, CFG.ESC_MAX);
  const flipDeseado = !a.izq;

  let e = extras[id];
  if (!e) {
    e = extras[id] = { s: objetivo, k: Math.round(objetivo), flip: flipDeseado, cont: 0 };
  }

  e.s = lerp(e.s, objetivo, 0.15);
  if (Math.abs(e.s - e.k) > 0.65) e.k = Math.round(e.s); // histéresis: evita parpadeo entre tamaños

  if (flipDeseado === e.flip) e.cont = 0;
  else if (++e.cont >= CFG.DIR_FRAMES) {
    e.flip = flipDeseado;
    e.cont = 0;
  }
  return { k: constrain(e.k, CFG.ESC_MIN, CFG.ESC_MAX), flip: e.flip };
}

// Dragón: cabeza en la mano abierta, cuerpo en el puño, segmentos entre los
// dos (más lejos = más segmentos) y cola por el lado contrario a la cabeza.
function dibujarDragonSprite(c, b, f) {
  const E = CFG.ESCALA;
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const dist = Math.hypot(dx, dy);
  const flip = c.x > b.x;              // cabeza a la derecha del cuerpo: se espeja
  const lado = flip ? -1 : 1;          // hacia dónde sale la cola
  const n = constrain(Math.round(dist / (14 * E)) - 1, 0, 8);
  const ola = (x) => 3 * E * Math.sin(x / (9 * E) + f * 2.094); // ondulación

  dibujarSprite("cola", f, b.x + lado * 32 * E, b.y + ola(b.x), flip);
  dibujarSprite("cuerpo", f, b.x, b.y + ola(b.x), flip);
  for (let i = n; i >= 1; i--) {       // de cerca del cuerpo a cerca de la cabeza
    const t = i / (n + 1);
    const x = c.x + dx * t;
    dibujarSprite("segmento", f, x, c.y + dy * t + ola(x), flip);
  }
  dibujarSprite("cabeza", f, c.x, c.y + ola(c.x), flip);
}