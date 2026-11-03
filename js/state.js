// ESTADO GLOBAL compartido entre archivos (p5 trabaja en modo global)
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
