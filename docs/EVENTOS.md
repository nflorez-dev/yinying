# Sistema de eventos y actos

Este documento explica cómo `js/acts.js` decide qué pasa en cada obra, cómo evita que los efectos se pisen y cómo añadir eventos nuevos. El objetivo es que puedas cambiar la estructura dramática sin romper el render.

---

## 1. Idea general

La obra se **planifica entera antes de empezar**, no se decide evento a evento en tiempo real. Al llamar a `Acts.start()`:

1. Se genera una semilla a partir de `Date.now()` y `Math.random()`.
2. Se crea un generador pseudoaleatorio determinista (`mulberry32`).
3. Se construye el plan de los cinco actos.
4. Se entra en el primer intermedio.

Esto tiene dos ventajas:

- **Determinismo:** la misma semilla produce exactamente el mismo plan. El ID que se muestra al final es la semilla en hexadecimal.
- **Coherencia:** se pueden reservar huecos, comprobar solapes y repartir efectos mirando el futuro, cosa imposible si se decidiera sobre la marcha.

Durante la partida, `update(dtMs)` solo avanza el reloj y dispara los eventos cuyo `at` ya se ha alcanzado.

---

## 2. Vocabulario y estructuras

### Tipos y capas

```js
const POOLS = {
  object: ['arbol', 'arbusto', 'caja', 'roca', 'casa', 'farol'],
  hazard: ['incendio', 'inundacion'],
  sky:    ['luna', 'estrella fugaz', 'nube', 'lluvia', 'viento'],
  epic:   ['tormenta', 'eclipse', 'terremoto', 'meteoritos'],
};

const LAYER = {
  object: 'ground',
  hazard: 'ground',
  sky:    'sky',
  epic:   'full',
  finale: 'full',
};
```

| Tipo | Capa | Qué representa |
| ---- | ---- | -------------- |
| `object` | suelo | Objetos que aparecen y se quedan. |
| `hazard` | suelo | Incendio o inundación; transforman el suelo. |
| `sky` | cielo | Luna, nubes, lluvia, viento, estrella fugaz. |
| `epic` | pantalla completa | Tormenta, eclipse, terremoto, meteoritos. |
| `finale` | pantalla completa | Cierre reservado del acto V. |

### Grupos de compatibilidad

`GRUPO` asigna una familia visual a cada evento:

```js
const GRUPO = {
  incendio: 'fuego', inundacion: 'agua',
  lluvia: 'clima', viento: 'clima',
  luna: 'cielo', nube: 'cielo', 'estrella fugaz': 'cielo',
  tormenta: 'full', eclipse: 'full', terremoto: 'full',
  meteoritos: 'full', finale: 'full',
};
```

`GRUPO_KIND` da un grupo por defecto cuando el nombre no está en `GRUPO` (`object → suelo`, `hazard → peligro`, `sky → cielo`, `epic/finale → full`).

### Plantilla de actos

```js
const TEMPLATE = [
  ['object', 'object'],
  ['object', 'sky', 'object'],
  ['epic', 'object', 'hazard', 'object'],
  ['object', 'epic', 'hazard', 'object', 'sky'],
  ['epic', 'hazard', 'sky', 'finale'],
];
```

La plantilla define el **tipo** de cada evento, no el evento concreto. El planificador elige después un nombre de la bolsa correspondiente.

### Tiempos

```js
const CFG = {
  totalActs: 5,
  actMs: [10000, 10000, 10000, 10000, 22000],
  interludeMs: 4000,
  replaySpeed: 5,
  minGap: 0.14,
  maxProps: 7,
  minEventGap: 650,
  fullGap: 1000,
  maxSky: 2,
};

const FINALE_AT = 0.55;
const BASE_INTENSITY = [0.15, 0.3, 0.5, 0.7, 1.0];
```

Las duraciones de cada evento están en `DURACIONES`, en `js/config.js`, y las comparten el director y el escenario.

---

## 3. Construcción del plan

`buildPlan()` recorre los actos y llena `plan`, un array de arrays: `plan[0]` son los eventos del acto I, `plan[1]` los del acto II, etc.

### 3.1 Ventanas de reloj

```js
let t = CFG.interludeMs;
for (let a = 0; a < CFG.totalActs; a++) {
  ventanas.push({ start: t, end: t + CFG.actMs[a] });
  t += CFG.actMs[a] + CFG.interludeMs;
}
```

Las ventanas **incluyen los interludios** porque el escenario sigue avanzando mientras se muestra la tarjeta: un efecto puede seguir vivo y no debe solaparse con el acto siguiente.

### 3.2 Reserva del final

```js
const ultima = ventanas[CFG.totalActs - 1];
const finaleStart = ultima.start + CFG.actMs[4] * FINALE_AT;
const reserved = { start: finaleStart, end: finaleStart + DUR.finale };
```

El final se reserva **antes** de colocar cualquier otra cosa. Ningún desastre de pantalla completa, fuego, agua, luna o lluvia puede invadir esa ventana.

### 3.3 Estado del planificador

Durante `buildPlan()` se mantienen estas estructuras:

| Variable | Contenido |
| -------- | --------- |
| `placed` | Objetos de suelo vivos: `{ name, x }`. Candidatos a arder. |
| `usedX` | Posiciones de suelo ocupadas; persisten entre actos. |
| `activos` | Efectos ya programados: `{ name, group, start, end, x }`. |
| `inicios` | Instantes de inicio del acto actual, para el espaciado mínimo. |
| `bags` | Bolsas de nombres por tipo. |
| `ultimoNombre` | Último evento colocado, para no repetirlo seguido. |
| `usadosActo` | Nombres ya usados en el acto actual. |

### 3.4 Nominaciones por acto

Para cada acto se calculan momentos base (`nominaciones`) repartidos de forma pareja:

- Actos normales: `f = 0.12 + 0.76 * (k / (n - 1))`, con un jitter de ±0,025.
- Acto V (clímax): los eventos no finales se reparten entre el 5 % y el 40 % del acto, porque el final ocupa el 45 % restante.
- El evento `finale` se nomina directamente en `win.start + len * FINALE_AT`.

El jitter es pequeño a propósito: evita ráfagas sin desordenar el ritmo dramático.

### 3.5 Intensidad

- En actos normales: `BASE_INTENSITY[a] ± 0,05`.
- En el clímax: de `0,7` a `1,0` según el índice del evento.

La intensidad se guarda en cada evento y la usa el escenario para modular lluvia, agua, oscuridad, llamas, etc.

### 3.6 Colocación

Los eventos se ordenan por su instante nominado y se intentan colocar uno a uno con `colocarEvento()`. Si un tipo no cabe, se prueban alternativas:

```js
const ALTERNATIVAS = {
  epic: ['sky', 'hazard'],
  hazard: ['sky', 'object'],
  sky: ['object'],
  object: [],
};
```

Si ninguna alternativa cabe, ese hueco se queda vacío y el acto puede tener menos eventos. Por eso, en la práctica, una obra suele tener entre 16 y 18 eventos en lugar de exactamente 18.

Al final del acto V se añade siempre el `finale`, que no pasa por el planificador normal porque su hueco está reservado.

---

## 4. Selección de nombres: bolsa barajada

La selección busca **variedad sin repetición inmediata**:

```js
function sacar(kind) {
  let bag = bags[kind] || (bags[kind] = []);
  if (!bag.length) bag.push(...barajar(POOLS[kind].slice()));

  const libre = (n) => n !== ultimoNombre && !usadosActo.has(n);
  let i = bag.findIndex(libre);
  if (i < 0) i = bag.findIndex((n) => n !== ultimoNombre);
  if (i < 0) { /* rellenar y reintentar */ }
  return bag.splice(i, 1)[0];
}
```

Reglas, en orden de prioridad:

1. Que no sea el último nombre colocado **ni** se haya usado ya en este acto.
2. Que no sea el último nombre colocado.
3. Si la bolsa se agota, se rellena y baraja de nuevo.
4. Si aun así no hay opción, se acepta una repetición.

Cuando un evento no cabe, `intentar()` **devuelve** los nombres probados a su bolsa para no gastarlos inútilmente.

---

## 5. Colocación espacial

### Objetos de suelo

- Se descartan si ya hay `maxProps = 7` objetos vivos.
- La posición se elige con `elegirX(usedX)`: 24 candidatos aleatorios en `[0.08, 0.92]`; se queda con el que maximiza la distancia al ocupado más cercano y se detiene en cuanto supera `minGap = 0.14`.

### Incendio

- Si hay objetos vivos, elige uno como objetivo (`elegirObjetivo`), prefiriendo los más antiguos: la ventana es la primera mitad de `placed`.
- La `x` del incendio es la del objeto y el evento lleva `burns: nombreDelObjeto`.
- El escenario busca el objeto coincidente más cercano y le prende fuego durante `DURACIONES.incendio` (7 s). Al terminar queda carbonizado.
- Si no hay ningún objeto, el incendio se convierte en una **fogata** en el suelo.

### Inundación

- Se coloca en el suelo con una `x` despejada, pero no se añade a la lista de props ni elimina objetos.

### Cielo

- La `x` se elige entre las posiciones de los efectos de cielo activos, para repartirlos.
- No puede haber más de `maxSky = 2` efectos de cielo solapados.

### Pantalla completa

- La `x` es fija (`0.5`) salvo que el efecto la use para otra cosa.
- Se reserva aire antes y después (`fullGap = 1000` ms).

---

## 6. Reglas de conflicto

`conflicto(name, group, t, dur, activos, reserved)` decide si un evento puede empezar en `t`. Devuelve `true` (no cabe) si:

1. **Ventana del final:** solapa con `reserved` y el evento es `full`, `fuego`, `agua`, `luna` o `lluvia`.
2. **Aire antes del final:** es `full` y se acerca a menos de `fullGap` del inicio del final (o lo solapa).
3. **Pantalla completa contra pantalla completa:** dos efectos `full` no pueden solaparse ni quedar a menos de `fullGap` uno de otro.
4. **Fuego contra agua:** `fuego` y `agua` no se solapan.
5. **Fuego contra lluvia/tormenta:** en cualquier orden.
6. **Eclipse contra luna:** no coinciden.
7. **Tormenta contra lluvia/viento:** no coinciden.
8. **Límite de cielo:** si ya hay `maxSky` efectos de cielo solapados.

Además, en `colocar()`:

- No se permite un inicio a menos de `minEventGap = 650` ms de otro del mismo acto.
- El evento debe **empezar** antes de `win.end - 250` ms y, si hay final reservado, antes de `reserved.start - minEventGap`.
- El escaneo avanza en pasos de 500 ms desde el instante nominado hasta el límite.

Estas reglas son deliberadamente conservadoras: es mejor perder un evento que mostrar dos desastres ilegibles a la vez.

---

## 7. Ejecución en tiempo real

`Acts` tiene cinco fases:

```text
idle → interlude → act → interlude → act → … → replay → end
```

- `start()`: genera semilla, construye el plan y entra en el primer intermedio.
- `interlude`: dura `interludeMs` (4 s) y muestra la tarjeta del acto.
- `act`: avanza `phaseT` y `storyT`, dispara los eventos cuyo `at` se alcanza y, al llegar a `actLen()`, pasa al siguiente intermedio o a la repetición.
- `replay`: reproduce el log a `replaySpeed = 5`.
- `end`: espera a que el usuario pida otra obra.

Los hooks que conectan todo:

```js
hooks.onActIntro(n, total)
hooks.onActStart(n, total, isClimax)
hooks.onRandomEvent(ev, act)
hooks.onReplayStart()
hooks.onReplayEvent(ev)
hooks.onEnd()
```

`conectarObra()` en `escenario.js` implementa los que usa el teatro:

- `onActIntro` → `Escenario.setActo(n)`.
- `onRandomEvent` → `Escenario.aplicar(ev)`.
- `onReplayStart` → resetea el escenario y activa el modo repetición.
- `onReplayEvent` → aplica eventos, actualiza el acto o restaura un snapshot de sombras.
- `onEnd` → limpia las sombras de la repetición.

### El log

`record(type, data)` solo graba durante la fase `act`. El log contiene:

| Tipo | Datos | Uso en la repetición |
| ---- | ----- | -------------------- |
| `act` | `act` | Actualiza el acto visible. |
| `random` | `name`, `kind`, `layer`, `x`, `intensity`, `burns` | Vuelve a aplicar el evento. |
| `frame` | `a` (snapshot de sombras) | Restaura las sombras cada 100 ms. |
| `spawn` | `animal`, `x`, `y` | Reservado para grabaciones explícitas. |

El snapshot de cada sombra incluye `key`, `tipo`, posición, giro y escala; el dragón incluye cabeza y cuerpo.

---

## 8. Duraciones de los eventos

Definidas en `js/config.js`:

| Evento | Duración |
| ------ | -------- |
| `lluvia` | 12 000 ms |
| `viento` | 8 000 ms |
| `luna` | 22 000 ms |
| `estrella fugaz` | 1 800 ms |
| `nube` | 16 000 ms |
| `inundacion` | 14 000 ms |
| `tormenta` | 14 000 ms |
| `eclipse` | 14 000 ms |
| `terremoto` | 8 000 ms |
| `meteoritos` | 10 000 ms |
| `incendio` | 7 000 ms |
| `fogata` | 7 000 ms |
| `finale` | 9 500 ms |

`escenario.js` usa la misma tabla (`DUR`), así que el planificador y el render coinciden en general. El final tiene duraciones propias: 9500 ms para sus sub-efectos y 9000 ms para la combustión de los objetos.

---

## 9. Añadir un evento nuevo

Checklist:

1. **Nombre y tipo:** añádelo a `POOLS` en `js/acts.js` (`object`, `hazard`, `sky` o `epic`).
2. **Grupo:** añádelo a `GRUPO` con una familia coherente (`fuego`, `agua`, `clima`, `cielo`, `full`). Si no, usará el grupo por defecto de su tipo.
3. **Duración:** añade su entrada a `DURACIONES` en `js/config.js`.
4. **Plantilla:** si quieres que su tipo aparezca de forma garantizada, añádelo a `TEMPLATE`. Si solo quieres que pueda salir, basta con que esté en el pool de un tipo ya usado.
5. **Render:** dibújalo en `Escenario`:
   - En `dibujarFondo()` si va detrás de las sombras (cielo).
   - En `dibujarProps()` si es un objeto de suelo.
   - En `dibujarFrente()` si va delante (clima, luz, agua).
6. **Estado global:** si modula viento o sismo, actualízalo en `update()` y, si procede, en `temblor()`.
7. **Prueba:** abre la consola y revisa `Acts.plan` para comprobar que aparece y no rompe los solapes.

### Ejemplo mínimo

Para añadir `granizo` como evento de cielo:

```js
// js/acts.js
const POOLS = {
  // ...
  sky: ['luna', 'estrella fugaz', 'nube', 'lluvia', 'viento', 'granizo'],
};
const GRUPO = {
  // ...
  granizo: 'cielo',
};
```

```js
// js/config.js
const DURACIONES = {
  // ...
  granizo: 9000,
};
```

```js
// js/escenario.js, dentro de dibujarFrente()
case "granizo": {
  const a = env(p);
  for (let i = 0; i < 80; i++) {
    const x = (hashN(i * 2.1) * 320 + age * 0.05) % 320;
    const y = (hashN(i * 3.7) * 190 + age * 0.45) % 190;
    fill(255, 255, 255, 180 * a);
    rect(x, y, 2, 2);
  }
  break;
}
```

Con eso ya entra en la bolsa de cielo y respeta `maxSky`, los solapes y el reparto temporal.

---

## 10. Depurar el plan

`Acts.plan` es un getter de solo lectura con el plan completo. En la consola del navegador:

```js
// Ver todos los eventos, con su acto
console.table(Acts.plan.flatMap((evs, i) => evs.map((e) => ({ acto: i + 1, ...e }))));

// Ver la semilla de la obra actual
Acts.seed.toString(16).toUpperCase();

// Ver el log de lo ocurrido
console.table(Acts.log);
```

Campos de cada evento del plan:

| Campo | Significado |
| ----- | ----------- |
| `at` | Milisegundos desde el inicio del acto. |
| `name` | Nombre concreto del evento. |
| `kind` | Tipo (`object`, `hazard`, `sky`, `epic`, `finale`). |
| `layer` | Capa (`ground`, `sky`, `full`). |
| `x` | Posición normalizada 0..1 dentro del rango útil del escenario. |
| `intensity` | Intensidad 0..1. |
| `burns` | Nombre del objeto que debe arder (solo incendios con objetivo). |

No hay una API pública para fijar la semilla desde la consola: `buildPlan()` es interna. Para pruebas reproducibles, modifica temporalmente `start()` o expón `buildPlan`/`mulberry32` en el objeto que devuelve el módulo. La función `mulberry32(a)` ya acepta un entero como semilla.

---

## 11. Límites y comportamientos esperados

- **No hay garantía de 18 eventos:** si un tipo no cabe y sus alternativas tampoco, el hueco se pierde. Lo normal es 16–18.
- **La inundación no destruye props:** solo cubre la parte baja; los objetos siguen ahí.
- **El incendio sin objetos es una fogata:** no crea un objeto nuevo.
- **El final no se puede solapar:** está reservado y los efectos incompatibles lo respetan.
- **El clímax dura más:** 22 s frente a 10 s de los demás actos, para que el final respire.
- **La repetición no vuelve a planificar:** reproduce el log, así que reconstruye la misma partida.
- **La semilla manda:** dos obras con la misma semilla tienen el mismo plan, pero las sombras dependen de tus gestos y no se pueden reproducir solo con la semilla.
