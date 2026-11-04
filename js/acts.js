"use strict";
/* ============================================================
   ACTS — director de la obra: 5 actos + repetición final.
   Cargar DESPUÉS de state.js y ANTES de theater.js / main.js.
   ============================================================ */

const Acts = (() => {
  const CFG = {
    totalActs: 5,
    actMs: [10000, 10000, 10000, 10000, 10000], // el clímax dura más
    interludeMs: 4000,
    replaySpeed: 5,
    minGap: 0.12,   // separación mínima (0..1) entre elementos de suelo del mismo acto
  };

  // Qué puede aparecer. Edita estas listas para que coincidan con tus sprites.
  const POOLS = {
    object: ['arbol', 'arbusto', 'caja', 'roca', 'casa', 'farol'], // suelo, se quedan
    hazard: ['incendio', 'inundacion'],                             // suelo, transforman
    sky:    ['luna', 'estrella fugaz', 'nube', 'lluvia', 'viento'], // cielo / ambiente
    epic:   ['tormenta', 'eclipse', 'terremoto', 'meteoritos'],     // pantalla completa
  };
  const LAYER = { object: 'ground', hazard: 'ground', sky: 'sky', epic: 'full', finale: 'full' };

  // Receta de cada acto: qué tipo de evento ocurre y en qué orden.
  const TEMPLATE = [
    ['object', 'object'],                                         // 1: calma
    ['object', 'sky', 'object'],                                  // 2
    ['object', 'hazard', 'sky', 'object'],                        // 3
    ['object', 'hazard', 'object', 'sky', 'hazard'],              // 4
    ['sky', 'hazard', 'hazard', 'epic', 'hazard', 'epic', 'epic'] // 5: CLÍMAX
  ];
  const BASE_INTENSITY = [0.15, 0.3, 0.5, 0.7, 1.0];
  const FINALE_AT = 0.86; // el gran final ocurre al 86% del acto 5

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

  function pick(kind, avoid) {
    const pool = POOLS[kind].filter((n) => n !== avoid);
    return pool[Math.floor(rng() * pool.length)];
  }

  function freeX(used) {
    let x = 0.5;
    for (let i = 0; i < 10; i++) {
      x = 0.08 + rng() * 0.84;
      if (used.every((u) => Math.abs(u - x) >= CFG.minGap)) break;
    }
    return x;
  }

  function buildPlan() {
    const placed = [];  // objetos de suelo que ya existen en la obra (candidatos a arder)
    plan = [];
    for (let a = 0; a < CFG.totalActs; a++) {
      const kinds = TEMPLATE[a];
      const n = kinds.length;
      const climax = a === CFG.totalActs - 1;
      const len = CFG.actMs[a];
      const evs = [], usedX = [];
      let last = null;

      kinds.forEach((kind, k) => {
        const name = pick(kind, last);
        last = name;
        let x = LAYER[kind] === 'full' ? 0.5 : freeX(usedX);
        let burns = null;

        // Un incendio cae sobre un objeto ya existente y lo quema.
        if (name === 'incendio' && placed.length) {
          const i = Math.floor(rng() * placed.length);
          x = placed[i].x;
          burns = placed[i].name;
          placed.splice(i, 1);
        }
        if (kind === 'object') placed.push({ name, x });
        if (LAYER[kind] === 'ground') usedX.push(x);

        // Momento: parejo en actos normales; ACELERADO en el clímax
        // (los huecos entre eventos se van acortando).
        const frac = climax
          ? 0.06 + 0.74 * Math.pow(k / (n - 1), 0.6)
          : 0.10 + 0.80 * ((k + 0.15 + rng() * 0.7) / n);
        const intensity = climax
          ? clamp01(0.7 + 0.3 * (k / (n - 1)))
          : clamp01(BASE_INTENSITY[a] + (rng() - 0.5) * 0.1);

        evs.push({ at: len * frac, name, kind, layer: LAYER[kind], x, intensity, burns });
      });

      if (climax) {
        evs.push({ at: len * FINALE_AT, name: 'finale', kind: 'finale', layer: 'full', x: 0.5, intensity: 1, burns: null });
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
    get seed() { return seed; },
  };
})();