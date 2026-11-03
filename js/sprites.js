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
