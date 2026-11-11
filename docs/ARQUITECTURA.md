# Arquitectura

Este documento describe cómo está organizado Yinying por dentro: qué hace cada módulo, cómo fluyen los datos entre la cámara y la pantalla, y dónde tocar si quieres extenderlo.

---

## 1. Vista general

Yinying es una aplicación p5.js en modo global (sin bundler ni módulos ES). Todos los archivos comparten el mismo ámbito y se cargan en un orden concreto desde `index.html`:

```text
config.js → state.js → hands.js → gestures.js → sprites.js
         → acts.js → escenario.js → theater.js → debug.js → main.js
```

El orden importa porque cada archivo usa constantes, funciones o clases definidas en los anteriores. Por ejemplo, `acts.js` necesita `DURACIONES` de `config.js`, y `escenario.js` necesita `Acts`.

El flujo de un fotograma es:

```text
video de la cámara
   ↓ ml5.handPose
landmarks (21 puntos por mano)
   ↓ hands.js
análisis geométrico + identidad estable
   ↓ gestures.js
gestos crudos → confirmación por histéresis → actores activos
   ↓ theater.js
posiciones suavizadas + sprites animados
   ↓
render del teatro
```

En paralelo, `acts.js` planifica y emite los eventos de la obra, `escenario.js` los dibuja y `Obra` graba la partida para repetirla al final.

---

## 2. Espacios de coordenadas

Hay tres espacios que conviene no mezclar:

| Espacio | Tamaño | Dónde se usa |
| ------- | ------ | ------------ |
| Video | 640 × 360 | Salida de `ml5.handPose` y `createCapture` redimensionado. |
| Lienzo | 1280 × 720 | Canvas real de p5 (`W` × `H`). |
| Arte | 320 × 180 | Unidades de diseño del escenario y los sprites. |

Constantes derivadas en `js/config.js`:

```js
const W = CFG.BASE_W * CFG.ESCALA; // 1280
const H = CFG.BASE_H * CFG.ESCALA; // 720
const S = W / CFG.VIDEO_W;         // 2  (video → lienzo)
const U = W / 640;                 // 2  (escala de la interfaz de debug)
```

- `S` convierte keypoints del video al lienzo (`hands.js`).
- `U` escala la interfaz de debug.
- `CFG.ESCALA` (`E`, por defecto 4) convierte píxeles de arte a píxeles de lienzo.

El escenario trabaja en píxeles de arte y hace `scale(CFG.ESCALA)` antes de dibujar. Las sombras se posicionan en píxeles de lienzo y se dividen por `E` cuando hace falta pasar a arte (por ejemplo, en el dragón vectorial).

---

## 3. Responsabilidad de cada módulo

### `js/config.js`
Define `CFG` (resolución, umbrales de gestos, seguimiento, escala), `DURACIONES` (tiempos compartidos de los eventos) y los patrones de dedos:

- `GESTOS_UNA_MANO`: `conejo` → `x1100`, `pajaro` → `11000`.
- `PATRON_ABIERTA` → `x1111` (cabeza del dragón).
- `PATRON_PUNO` → `x0000` (cuerpo del dragón).

### `js/state.js`
Estado global mutable: `handPose`, `video`, `hands`, `infos`, `tracks`, `entidades`, `suaves`, `extras`, `marco`, `fondoCrema`, `showDebug`, `showPip`.

### `js/hands.js`
- `analizarMano(hand)`: convierte los keypoints al espacio del lienzo y calcula ratios, extensiones, centro, tamaño de palma y lateralidad.
- `asignarIds(infos)`: empareja manos detectadas con las del fotograma anterior por distancia (`MATCH_DIST`) para conservar su `id`. Las pistas no vistas se olvidan tras `TRACK_LOST_FRAMES`.

El análisis de dedos es geométrico, no usa un segundo modelo:

- Índice a meñique: `dist(muñeca, punta) / dist(muñeca, PIP) > EXT_RATIO`.
- Pulgar: `dist(punta, base del índice) / tamaño de palma > THUMB_RATIO`.
- Tamaño de mano: combinación del largo y el ancho de la palma; crece al acercarse a la cámara.

### `js/gestures.js`
- `detectarGestos(infos)`: produce los gestos "crudos" del fotograma.
  - Primero busca parejas abierta + puño para el dragón, ordenadas por cercanía y con separación normalizada ≤ `DRAGON_MAX_DIST`.
  - Las manos usadas por un dragón se excluyen de los gestos individuales.
- `actualizarEntidades(raws)`: mantiene una ficha por entidad (mano o pareja de dragón) con `tipo`, candidato, contador y pérdida. Un gesto se confirma tras `STABLE_FRAMES` y se suelta tras `LOST_FRAMES`.
- `actoresActivos()`: API que consume el teatro; devuelve solo los gestos confirmados.

### `js/sprites.js`
- Carga las hojas de 3 fotogramas en horizontal (`assets/*.png`).
- `dibujarSprite()` dibuja un fotograma centrado y encajado a la rejilla.
- `animarActor()` decide el fotograma del conejo (salto según distancia recorrida) y del pájaro (aleteo en movimiento, idle quieto).
- `estiloSprite()` calcula escala y giro estables con histéresis.
- `dibujarDragonSprite()` compone cola, cuerpo, segmentos y cabeza entre las dos manos.
- Si un sprite no carga, el teatro usa las sombras vectoriales de `theater.js`.

### `js/acts.js`
Director de la obra. Planifica los cinco actos al empezar y expone:

- `start()`, `update(dtMs)`, `record(type, data)`.
- `hooks` para conectar el escenario.
- Getters de solo lectura: `phase`, `act`, `isClimax`, `totalActs`, `actProgress`, `interludeProgress`, `replayProgress`, `log`, `plan`, `seed`.
- `intensity()`: intensidad continua 0..1 para temblor, ambiente y efectos.

### `js/escenario.js`
Dos piezas:

- `Escenario`: estado y dibujo de objetos, clima y desastres. Capas `dibujarFondo()`, `dibujarProps()`, `dibujarFrente()` y HUD `dibujarHUD()`. También calcula el temblor (`temblor()`).
- `Obra`: arranque, grabación y repetición. `conectarObra()` enlaza los hooks de `Acts` con `Escenario`.

### `js/theater.js`
Render del modo teatro: fondo de papel, luz de vela, llamada a las capas del escenario, sombras, marco, HUD y PIP. También suaviza posiciones y aplica el temblor.

### `js/debug.js`
Overlay del modo debug: esqueleto, panel de ratios, anillo de confirmación, dragón evaluado y barra de confirmados.

### `js/main.js`
Punto de entrada de p5: `preload`, `setup`, `draw` y `keyPressed`. En `preload` se crea el detector de manos y se cargan el marco y los sprites; en `setup` se crea el canvas, el fondo de papel, la captura de video y la conexión con la obra.

---

## 4. Flujo de un fotograma

`draw()` en `main.js`:

1. `infos = hands.map(analizarMano)`.
2. `asignarIds(infos)` para conservar identidades.
3. `actualizarEntidades(detectarGestos(infos))`.
4. Si `showDebug`, dibuja la vista de cámara y el overlay; si no, `dibujarTeatro()`.

`dibujarTeatro()` en `theater.js`:

1. `Obra.avanzar(dt)` actualiza el director y el escenario. `dt` se limita a 100 ms para evitar saltos tras un parón.
2. Calcula `Escenario.temblor()` y aplica el desplazamiento de cámara.
3. Dibuja el fondo de papel y la luz de vela.
4. `Escenario.dibujarFondo()` → luna, nubes, eclipse.
5. `Escenario.dibujarProps()` → objetos del suelo y fuego.
6. `dibujarSombras(frame)` → actores vivos o grabados; devuelve el snapshot para grabar.
7. `Obra.grabar(snap, dt)`.
8. `Escenario.dibujarFrente()` → lluvia, viento, agua, oscuridad, destellos.
9. Dibuja el marco del teatro.
10. `Escenario.dibujarHUD()` y, si procede, la PIP.

---

## 5. Movimiento, escala y dirección

En `theater.js`:

- `enEscenario(p)` limita la posición a la zona útil: `x ∈ [60E, 260E]`, `y ∈ [62E, 140E]`.
- `suave(id, p, vivos)` interpola con `lerp(..., 0.35)` y encaja el resultado a una rejilla de `SNAP = 2 * E` píxeles de lienzo (2 px de arte). Así el movimiento es fluido pero conserva el aspecto pixel art.
- Las posiciones suavizadas se guardan en `suaves` y se limpian cuando la entidad desaparece.

En `sprites.js`:

- La escala objetivo es `(tam / TAM_REF) * ESCALA`, limitada a `[ESC_MIN, ESC_MAX]`.
- La escala se suaviza y se redondea a un entero de píxeles por píxel de arte, con histéresis de 0,65 para evitar parpadeos.
- La dirección se confirma tras `DIR_FRAMES` fotogramas: mano izquierda → mira a la derecha; mano derecha → mira a la izquierda.
- El conejo anima el salto según la distancia recorrida (no según el tiempo), así no "patina" al moverlo despacio.
- El pájaro aletea solo cuando se mueve; quieto usa un fotograma fijo.
- El dragón no escala: su cuello crece con la separación entre manos (de 0 a 8 segmentos).

---

## 6. Capas de render

De atrás hacia delante:

1. Fondo oscuro del canvas (`background(26, 18, 16)`).
2. Fondo de papel crema generado una vez en `setup` (`crearFondoCrema`), con tramado Bayer y fibras.
3. Luz de vela parpadeante.
4. Cielo: luna, estrella fugaz, nube, eclipse.
5. Objetos del suelo y su fuego/humo.
6. Sombras de los animales (sprites o respaldo vectorial).
7. Frente: lluvia, viento, inundación, fogata, escombros, meteoritos, tormenta, oscuridad, tinte rojo, destellos y apagón.
8. Marco del teatro (`assets/marco.png`).
9. HUD: título, tarjetas de acto, progreso, repetición y pantalla final.
10. PIP de la cámara.

El temblor se aplica a la imagen del teatro (fondo de papel, escenario, sombras y marco), no al HUD.

---

## 7. La obra y la repetición

`Obra` (`escenario.js`) es el pegamento entre el director y el teatro:

- `iniciar()`: resetea el escenario, llama a `Acts.start()` y prepara la grabación.
- `pedirInicio()`: arranca si la fase es `idle` o `end`.
- `avanzar(dt)`: actualiza `Acts` y `Escenario`. Durante la repetición, el escenario avanza a `dt * replaySpeed`.
- `grabar(snap, dt)`: durante los actos guarda un fotograma cada `REC_MS = 100` ms con las sombras dibujadas. También cuenta apariciones para el resumen final.
- `resumen()`: texto de la pantalla final con las invocaciones.

El inicio por gesto requiere mantenerlo `HOLD_MS = 1200` ms. Tras el final hay una espera de 5 s antes de permitir reiniciar con gesto.

La repetición reproduce el log de `Acts`:

- Eventos `random`: se vuelven a aplicar al escenario.
- Eventos `act`: actualizan el acto visible.
- Eventos `frame`: restauran el último snapshot de sombras grabado.

Termina cuando se ha consumido todo el log y ha pasado un margen de 1500 ms; entonces se pasa a `end`.

---

## 8. Estados del HUD

`Escenario.dibujarHUD()` dibuja según `Acts.phase`:

| Fase | Qué se muestra |
| ---- | -------------- |
| `idle` | Título, instrucción para empezar y barra de progreso del gesto sostenido. |
| `interlude` | Tarjeta "ACTO I…V" con su título, con fundido. |
| `act` | Indicador de acto, progreso y barra inferior. |
| `replay` | Indicador "REPETICIÓN ×5" y progreso. |
| `end` | "FIN", ID de la obra (semilla), resumen de invocaciones y estadísticas. |

---

## 9. Cómo extender el proyecto

### Añadir un animal de una mano

1. Añade su patrón a `GESTOS_UNA_MANO` en `js/config.js`.
2. Añade su sprite y dimensiones en `js/sprites.js` (hoja de 3 fotogramas).
3. Añade el caso en `pintarSombra()` de `js/theater.js` y, si quieres respaldo vectorial, una función de sombra.
4. Si debe grabarlo la repetición, no hace falta nada más: el snapshot guarda `tipo`, posición, giro y escala.
5. Actualiza el resumen de `Obra` (`NOMBRES`) si quieres que aparezca con un nombre legible.

### Añadir un evento de escenario

Está detallado en [`EVENTOS.md`](EVENTOS.md). En resumen: añade el nombre a `POOLS`, su grupo a `GRUPO`, su duración a `DURACIONES` y su dibujo a `Escenario`.

### Cambiar la resolución

- `BASE_W`, `BASE_H` y `ESCALA` determinan el canvas final.
- `VIDEO_W` y `VIDEO_H` determinan lo que ve el modelo; no tienen por qué coincidir con el canvas.
- Revisa las medidas en píxeles de arte de `escenario.js` (`SUELO`, `X0`, `X1`, `CIELO_Y`) si cambias la base.

### Añadir una capa o efecto de pantalla completa

1. Añade el nombre a `POOLS.epic` o `POOLS.sky`.
2. Asígnalo a un grupo en `GRUPO` (`full`, `cielo`, `clima`, etc.).
3. Define su duración en `DURACIONES`.
4. Dibújalo en `dibujarFondo()` o `dibujarFrente()` según su profundidad.
5. Si debe temblar o modular el ambiente, actualiza `update()` y `temblor()`.

---

## 10. Rendimiento

- El coste principal es `ml5.handPose`. `MAX_HANDS` y `VIDEO_W`/`VIDEO_H` son las palancas más efectivas.
- El arte base es pequeño (320 × 180) y se dibuja con `pixelDensity(1)` y `noSmooth()`, así que el render es barato.
- El fondo de papel se genera una sola vez en `setup`; no se recalcula por fotograma.
- Los efectos usan funciones de hash deterministas (`hashN`) en lugar de partículas persistentes, lo que mantiene el estado ligero.
- La grabación guarda un snapshot cada 100 ms, no cada fotograma.
- `dt` se limita a 100 ms para que un parón del navegador no dispare la simulación.
