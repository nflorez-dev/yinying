// MODO DEBUG: vista de cámara, esqueleto de manos, panel y barra

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

