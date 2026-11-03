<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/banner/banner-light.png">
    <source media="(prefers-color-scheme: light)" srcset="./assets/banner/banner-light.png">
    <img alt="Yinying Banner" src="./assets/banner/banner-light.png" width="100%">
  </picture>
</div>

Yinying es una aplicación web interactiva en la que tu mano actúa simultáneamente como control y personaje. A través de la cámara web directamente en el navegador, el sistema detecta los gestos de la mano en tiempo real para dar vida a marionetas de sombras tradicionales dentro de un escenario digital de papel recortado.

No se requiere teclado ni ratón para controlar los personajes: la app traslada el clásico juego infantil de sombras chinescas a una experiencia interactiva accesible desde la web.

## Cómo funciona
La aplicación utiliza visión por computador en el navegador para rastrear 21 puntos clave por mano desde el video de la webcam. Mediante cálculos geométricos sencillos se analiza la apertura, distancia y posición de los dedos para invocar y controlar a los diferentes animales en pantalla.


### Tabla de gestos e interacción
| Animal | Gesto de las manos |
| ------ | ------------------ |
| Conejo 🐇| Señal de "V" (Índice y medio extendidos) |
| Pájaro 🐦| Señal de "L" (Pulgar e índice extendidos) |
| Dragón 🐲| Dos Manos: Mano abierta (Cabeza) + Puño (Cuerpo) |

## Características Estéticas y Visuales
- **Escenario de Papel:** Interfaz inspirada en un teatro de sombras tradicional, con bordes decorados en rojo y dorado sobre una pantalla translúcida de papel.
- **Iluminación Dinámica:** Efectos visuales en el canvas que simulan el parpadeo de una vela detrás del escenario.
- **Siluetas Pixel Art:** Sombras articuladas diseñadas con estética tradicional de recorte de papel (shadow play).
- **Profundidad y Escala:** Acercar o alejar la mano de la cámara ajusta proporcionalmente el tamaño de las figuras en pantalla

## Tecnologías Utilizadas
- **[p5.js](https://p5js.org/)** — Renderizado en Canvas, gestión de resolución 16:9 y bucle principal de animación web.
- **[ml5.js](https://ml5js.org/) (handPose)** — Modelo de Machine Learning para detección de manos del lado del cliente en JS.
- **HTML5, CSS3 y JavaScript (ES6)**

## Controles y depuración
Durante la ejecución de la app web, puedes usar las siguientes teclas para la calibración y el modo de depuración:
- `D` — Activar / Desactivar Modo Debug (muestra puntos clave, ratios y panel técnico).
- `C` — Mostrar / Ocultar la mini cámara web en pantalla (PIP).
- `M` — Invertir orientación de las manos (espejar izquierda/derecha).
- `F` — Activar / Desactivar pantalla completa en el navegador.

## Rendimiento y aspectos técnicos
- **100% Client-Side:** El procesamiento de video ocurre de forma local en el navegador del usuario; no se envían datos de la cámara a servidores externos.
- **Prevención de Falsos Positivos:** Se requiere mantener el gesto durante una serie de fotogramas continuos antes de confirmar el cambio de animal.
- **Suavizado de Movimiento:** Interpolación (lerp) para eliminar el temblor de los puntos provocado por el ruido de la cámara.
- **Seguimiento Multimano:** Conserva identificadores únicos para evitar confusiones o cruces cuando interactúan varias manos.
