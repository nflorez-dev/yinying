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

