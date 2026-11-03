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

