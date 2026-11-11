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
  DRAGON_MAX_DIST: 7.0,

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

// Duración de los eventos del escenario (ms). La comparten acts.js (para
// planificar sin solapar efectos) y escenario.js (para dibujarlos).
const DURACIONES = {
  lluvia: 12000,
  viento: 8000,
  luna: 22000,
  "estrella fugaz": 1800,
  nube: 16000,
  inundacion: 14000,
  tormenta: 14000,
  eclipse: 14000,
  terremoto: 8000,
  meteoritos: 10000,
  incendio: 7000,
  fogata: 7000,
  finale: 9500,
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
