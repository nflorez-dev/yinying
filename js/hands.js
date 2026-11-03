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

