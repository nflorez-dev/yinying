// PUNTO DE ENTRADA: p5.js llama a preload, setup, draw y keyPressed

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
  conectarObra(); // enlaza el director de actos con el escenario
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
  if (key === " " || keyCode === ENTER) Obra.pedirInicio(); // empezar / otra obra
}