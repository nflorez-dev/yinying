"use strict";
/* ============================================================
   ACTS — director de la obra: 5 actos + repetición final.
   Cargar DESPUÉS de state.js y ANTES de theater.js / main.js.
   ============================================================ */

const Acts = (() => {
  const CFG = {
    totalActs: 5,
    actMs: [10000, 10000, 10000, 10000, 22000], // el clímax dura más
    interludeMs: 4000,
    replaySpeed: 5,
    minGap: 0.14,       // separación mínima (0..1) entre objetos de suelo
    maxProps: 7,        // objetos de suelo vivos a la vez
    minEventGap: 650,   // ms mínimos entre dos eventos (evita ráfagas)
    fullGap: 1000,      // ms de respiro entre efectos de pantalla completa
    maxSky: 2,          // efectos de cielo simultáneos
  };

  // Qué puede aparecer. Edita estas listas para que coincidan con tus sprites.
  const POOLS = {
    object: ['arbol', 'arbusto', 'caja', 'roca', 'casa', 'farol'], // suelo, se quedan
    hazard: ['incendio', 'inundacion'],                             // suelo, transforman
    sky:    ['luna', 'estrella fugaz', 'nube', 'lluvia', 'viento'], // cielo / ambiente
    epic:   ['tormenta', 'eclipse', 'terremoto', 'meteoritos'],     // pantalla completa
  };
  const LAYER = { object: 'ground', hazard: 'ground', sky: 'sky', epic: 'full', finale: 'full' };

  // Receta de cada acto. Los desastres grandes se reparten entre actos para
  // que no se pisen; el acto 5 se reserva para el gran final.
  const TEMPLATE = [
    ['object', 'object'],                                  // 1: calma
    ['object', 'sky', 'object'],                           // 2: algo cambia
    ['epic', 'object', 'hazard', 'object'],                // 3: surge el peligro
    ['object', 'epic', 'hazard', 'object', 'sky'],         // 4: todo se complica
    ['epic', 'hazard', 'sky', 'finale']                    // 5: el gran final
  ];
  const BASE_INTENSITY = [0.15, 0.3, 0.5, 0.7, 1.0];
  // El final empieza antes de la mitad del acto 5: así le queda tiempo para
  // desplegarse entero en vez de quedar cortado por la repetición.
  const FINALE_AT = 0.55;

  // Familia visual de cada evento: evita que se pisen efectos incompatibles.
  const GRUPO = {
    incendio: 'fuego', inundacion: 'agua',
    lluvia: 'clima', viento: 'clima',
    luna: 'cielo', nube: 'cielo', 'estrella fugaz': 'cielo',
    tormenta: 'full', eclipse: 'full', terremoto: 'full', meteoritos: 'full',
    finale: 'full',
  };
  const GRUPO_KIND = { object: 'suelo', hazard: 'peligro', sky: 'cielo', epic: 'full', finale: 'full' };
  // Si un tipo no cabe (por choque o por falta de sitio), se prueba otro.
  const ALTERNATIVAS = { epic: ['sky', 'hazard'], hazard: ['sky', 'object'], sky: ['object'], object: [] };
  const DUR = DURACIONES; // definido en config.js (misma tabla que escenario.js)

  const hooks = {
    onActIntro: (n, total) => {},
    onActStart: (n, total, isClimax) => {},
    // ev = { name, kind, layer, x (0..1), intensity (0..1), burns? }
    onRandomEvent: (ev, act) => {},
    onReplayStart: () => {},
    onReplayEvent: (ev) => {},        // ev.type: 'act' | 'random' | 'spawn'
    onEnd: () => {},
  };

  let phase = 'idle';   // idle | interlude | act | replay | end
  let act = 0, phaseT = 0, storyT = 0;
  let seed = 0, rng = Math.random;
  let plan = [], log = [], planIdx = 0;
  let replayT = 0, replayIdx = 0;
  let bags = {}, ultimoNombre = null, usadosActo = new Set();

  const actLen = () => CFG.actMs[Math.max(0, act - 1)];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- selección con bolsa: variedad sin repetir el mismo nombre seguido ---
  function barajar(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sacar(kind) {
    let bag = bags[kind];
    if (!bag) bag = bags[kind] = [];
    if (!bag.length) bag.push(...barajar(POOLS[kind].slice()));

    // Prefiere un nombre que no haya salido en este acto ni sea el último
    // colocado. Si no queda, permite repetir dentro del acto, pero no seguido.
    const libre = (n) => n !== ultimoNombre && !usadosActo.has(n);
    let i = bag.findIndex(libre);
    if (i < 0) i = bag.findIndex((n) => n !== ultimoNombre);
    if (i < 0) {
      bag.push(...barajar(POOLS[kind].slice()));
      i = bag.findIndex(libre);
      if (i < 0) i = bag.findIndex((n) => n !== ultimoNombre);
      if (i < 0) i = bag.length - 1;
    }

    return bag.splice(i, 1)[0];
  }

  function devolver(kind, name) {
    if (!bags[kind]) bags[kind] = [];
    bags[kind].push(name);
  }

  // Busca el hueco más despejado. Si no llega al mínimo, usa el menos malo.
  function elegirX(ocupados) {
    let mejor = 0.5, mejorDist = -1;
    for (let i = 0; i < 24; i++) {
      const x = 0.08 + rng() * 0.84;
      let d = 1;
      for (const u of ocupados) d = Math.min(d, Math.abs(u - x));
      if (d > mejorDist) { mejorDist = d; mejor = x; }
      if (d >= CFG.minGap) break;
    }
    return mejor;
  }

  function solapan(a0, a1, b0, b1) {
    return a0 < b1 && b0 < a1;
  }

  function conflicto(name, group, t, dur, activos, reserved) {
    const fin = t + dur;

    // El final ya trae eclipse, meteoritos, terremoto y fuego: no le sumamos ruido.
    if (reserved && solapan(t, fin, reserved.start, reserved.end)) {
      if (group === 'full' || group === 'fuego' || group === 'agua' || name === 'luna' || name === 'lluvia') return true;
    }

    // Los desastres de pantalla completa necesitan aire entre ellos.
    if (group === 'full' && reserved && fin > reserved.start - CFG.fullGap && t < reserved.end) return true;

    for (const o of activos) {
      if (group === 'full' && o.group === 'full' && t < o.end + CFG.fullGap && o.start < fin + CFG.fullGap) return true;
      if (!solapan(t, fin, o.start, o.end)) continue;
      if (group === 'full' && o.group === 'full') return true;
      if (group === 'fuego' && o.group === 'agua') return true;
      if (group === 'agua' && o.group === 'fuego') return true;
      if (group === 'fuego' && (o.name === 'lluvia' || o.name === 'tormenta')) return true;
      if (o.group === 'fuego' && (name === 'lluvia' || name === 'tormenta')) return true;
      if ((name === 'eclipse' && o.name === 'luna') || (name === 'luna' && o.name === 'eclipse')) return true;
      if ((name === 'tormenta' && (o.name === 'lluvia' || o.name === 'viento')) ||
          (o.name === 'tormenta' && (name === 'lluvia' || name === 'viento'))) return true;
    }

    if (group === 'cielo') {
      let n = 0;
      for (const o of activos) {
        if (o.group === 'cielo' && solapan(t, fin, o.start, o.end)) n++;
      }
      if (n >= CFG.maxSky) return true;
    }
    return false;
  }

  // Prefiere quemar objetos que llevan más tiempo en escena (los primeros).
  function elegirObjetivo(placed) {
    const ventana = Math.max(1, Math.ceil(placed.length / 2));
    return Math.floor(rng() * ventana);
  }

  // Intenta colocar un evento concreto. Si no cabe, devuelve null sin tocar nada.
  function colocar(name, kind, nominal, win, intensidad, activos, placed, usedX, inicios, reserved) {
    if (kind === 'object' && placed.length >= CFG.maxProps) return null;

    const dur = DUR[name] || 0;
    const group = GRUPO[name] || GRUPO_KIND[kind];
    let x = 0.5, burns = null, objetivo = -1;

    if (kind === 'object') {
      x = elegirX(usedX);
    } else if (kind === 'hazard') {
      if (name === 'incendio' && placed.length) {
        objetivo = elegirObjetivo(placed);
        x = placed[objetivo].x;
        burns = placed[objetivo].name;
      } else {
        x = elegirX(usedX);
      }
    } else if (kind === 'sky') {
      const ocupados = activos.filter((o) => o.group === 'cielo').map((o) => o.x);
      x = elegirX(ocupados);
    }

    const limite = reserved
      ? Math.min(win.end - 250, reserved.start - CFG.minEventGap)
      : win.end - 250;

    for (let t = nominal; t <= limite; t += 500) {
      if (inicios.some((s) => Math.abs(s - t) < CFG.minEventGap)) continue;
      if (conflicto(name, group, t, dur, activos, reserved)) continue;

      const ev = {
        at: t - win.start,
        name, kind, layer: LAYER[kind], x,
        intensity: intensidad,
        burns,
      };

      if (kind === 'object') {
        placed.push({ name, x });
        usedX.push(x);
      } else if (kind === 'hazard') {
        if (objetivo >= 0) placed.splice(objetivo, 1);
        else if (name === 'incendio') usedX.push(x);
      }

      activos.push({ name, group, start: t, end: t + dur, x });
      inicios.push(t);
      return ev;
    }
    return null;
  }

  function intentar(kind, nominal, win, intensidad, activos, placed, usedX, inicios, reserved) {
    const probados = [];
    for (let i = 0; i < POOLS[kind].length; i++) {
      const name = sacar(kind);
      const ev = colocar(name, kind, nominal, win, intensidad, activos, placed, usedX, inicios, reserved);
      if (ev) {
        probados.forEach((n) => devolver(kind, n));
        return ev;
      }
      probados.push(name);
    }
    probados.forEach((n) => devolver(kind, n));
    return null;
  }

  function colocarEvento(kind, nominal, win, intensidad, activos, placed, usedX, inicios, reserved) {
    for (const k of [kind, ...(ALTERNATIVAS[kind] || [])]) {
      const ev = intentar(k, nominal, win, intensidad, activos, placed, usedX, inicios, reserved);
      if (ev) return ev;
    }
    return null;
  }

  function buildPlan() {
    const placed = [];  // objetos de suelo vivos (candidatos a arder)
    const usedX = [];   // posiciones de suelo ocupadas (persisten entre actos)
    const activos = []; // efectos programados, para detectar solapes
    plan = [];
    bags = {};
    ultimoNombre = null;

    // Ventanas de reloj: incluyen los interludios porque el escenario sigue
    // avanzando (y los efectos siguen vivos) mientras se muestra la tarjeta.
    const ventanas = [];
    let t = CFG.interludeMs;
    for (let a = 0; a < CFG.totalActs; a++) {
      ventanas.push({ start: t, end: t + CFG.actMs[a] });
      t += CFG.actMs[a] + CFG.interludeMs;
    }

    // El final se reserva primero: ningún desastre grande puede pisarlo.
    const ultima = ventanas[CFG.totalActs - 1];
    const finaleStart = ultima.start + CFG.actMs[CFG.totalActs - 1] * FINALE_AT;
    const reserved = { start: finaleStart, end: finaleStart + (DUR.finale || 0) };

    for (let a = 0; a < CFG.totalActs; a++) {
      const kinds = TEMPLATE[a];
      const len = CFG.actMs[a];
      const win = ventanas[a];
      const climax = a === CFG.totalActs - 1;
      const finaleIdx = kinds.indexOf('finale');
      const nRand = finaleIdx >= 0 ? finaleIdx : kinds.length;
      const evs = [];
      const inicios = [];
      usadosActo = new Set();

      // Momentos base: reparto parejo con poco azar, para que no haya ráfagas.
      const nominaciones = kinds.map((kind, k) => {
        if (kind === 'finale') return win.start + len * FINALE_AT;
        let f;
        if (climax) {
          const fin = FINALE_AT - 0.15;
          f = 0.05 + (fin - 0.05) * (k / Math.max(1, nRand - 1));
        } else {
          f = 0.12 + 0.76 * (k / Math.max(1, kinds.length - 1));
        }
        const jitter = (rng() - 0.5) * 0.05;
        return win.start + len * clamp01(f + jitter);
      });

      // Se colocan en orden temporal; si algo choca, se corre un poco.
      const orden = kinds
        .map((kind, k) => ({ kind, k, t: nominaciones[k] }))
        .filter((x) => x.kind !== 'finale')
        .sort((p, q) => p.t - q.t);

      for (const item of orden) {
        const intensidad = climax
          ? clamp01(0.7 + 0.3 * (item.k / Math.max(1, nRand - 1)))
          : clamp01(BASE_INTENSITY[a] + (rng() - 0.5) * 0.1);
        const ev = colocarEvento(item.kind, item.t, win, intensidad, activos, placed, usedX, inicios, reserved);
        if (ev) {
          evs.push(ev);
          ultimoNombre = ev.name;
          usadosActo.add(ev.name);
        }
      }

      if (climax) {
        evs.push({
          at: len * FINALE_AT,
          name: 'finale', kind: 'finale', layer: 'full',
          x: 0.5, intensity: 1, burns: null,
        });
      }

      evs.sort((p, q) => p.at - q.at);
      plan.push(evs);
    }
  }

  function beginInterlude() {
    act++;
    phase = 'interlude';
    phaseT = 0;
    hooks.onActIntro(act, CFG.totalActs);
  }

  function start() {
    seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    rng = mulberry32(seed);
    buildPlan();
    log = [];
    act = 0; storyT = 0;
    beginInterlude();
  }

  // El teatro llama a esto cuando el USUARIO hace algo:
  //   Acts.record('spawn', { animal: 'conejo', x, y })
  function record(type, data = {}) {
    if (phase !== 'act') return;
    log.push({ t: storyT, act, type, ...data });
  }

  function update(dtMs) {
    if (phase === 'interlude') {
      phaseT += dtMs;
      if (phaseT >= CFG.interludeMs) {
        phase = 'act'; phaseT = 0; planIdx = 0;
        log.push({ t: storyT, act, type: 'act' });
        hooks.onActStart(act, CFG.totalActs, act === CFG.totalActs);
      }
    } else if (phase === 'act') {
      phaseT += dtMs; storyT += dtMs;
      const evs = plan[act - 1];
      while (planIdx < evs.length && phaseT >= evs[planIdx].at) {
        const { at, ...ev } = evs[planIdx++];
        log.push({ t: storyT, act, type: 'random', ...ev });
        hooks.onRandomEvent(ev, act);
      }
      if (phaseT >= actLen()) {
        if (act < CFG.totalActs) beginInterlude();
        else startReplay();
      }
    } else if (phase === 'replay') {
      replayT += dtMs * CFG.replaySpeed;
      while (replayIdx < log.length && log[replayIdx].t <= replayT) {
        hooks.onReplayEvent(log[replayIdx++]);
      }
      if (replayIdx >= log.length && replayT > storyT + 1500) {
        phase = 'end';
        hooks.onEnd();
      }
    }
  }

  function startReplay() {
    phase = 'replay'; replayT = 0; replayIdx = 0;
    hooks.onReplayStart();
  }

  // Intensidad continua 0..1 para escalar sacudida de cámara, música, brillo, etc.
  function intensity() {
    if (act < 1) return 0;
    const prev = act > 1 ? BASE_INTENSITY[act - 2] : 0;
    const cur = BASE_INTENSITY[act - 1];
    let p = phase === 'act' ? clamp01(phaseT / actLen()) : (phase === 'interlude' ? 0 : 1);
    if (act === CFG.totalActs) p = Math.pow(p, 1.5); // el clímax arranca lento y se dispara
    return prev + (cur - prev) * p;
  }

  return {
    hooks, CFG, POOLS, start, update, record, intensity,
    get phase() { return phase; },
    get act() { return act; },
    get isClimax() { return act === CFG.totalActs; },
    get totalActs() { return CFG.totalActs; },
    get interludeProgress() { return phase === 'interlude' ? phaseT / CFG.interludeMs : 0; },
    get actProgress() { return phase === 'act' ? phaseT / actLen() : 0; },
    get replayProgress() { return storyT ? Math.min(1, replayT / storyT) : 0; },
    get log() { return log; },
    get plan() { return plan; },
    get seed() { return seed; },
  };
})();
