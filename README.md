# ¡Oído, Cocina! 🍔

Juego cooperativo de hamburguesería en **pixel art** para jugar con amigos como **Actividad de Discord**.
De 1 a 4 cocineros se mueven por la cocina de *Mordiscos Mandarina* (una hamburguesería inventada)
a lo largo de 20 niveles cada vez más rápidos: cajas de ingredientes, plancha, freidora, bebidas, mesa de montaje y pase.

> **Estado actual: Fase 4 (en curso)**: 20 niveles de dificultad creciente, en el navegador y como Actividad de Discord.

## Requisitos

- Node.js 20 o superior (probado con Node 26)
- npm

## Probar en el navegador

```bash
npm install
npm run dev
```

Arranca dos cosas a la vez:

- **Cliente** (Vite + Phaser) en <http://localhost:5173>
- **Servidor** (Colyseus) en el puerto 2567. El cliente le habla a través de `/colyseus` en el mismo origen (Vite hace de proxy), igual que hará dentro de Discord.

**Jugar con varios:** elige en el menú cuántos sois y abre el juego en varias pestañas o dispositivos con la misma sala, por ejemplo
<http://localhost:5173/?sala=amigos>. Sin `?sala=` todos entran en la sala `local`.
Desde el móvil, usa la dirección «Network» que muestra Vite (por ejemplo `http://192.168.1.50:5173/?sala=amigos`).

**Turno corto para pruebas:** añade `&turno=20` (20 segundos). Lo decide quien crea la sala.
Los bots también pueden empezar en otro nivel con la opción `nivel` (solo para pruebas).

**Prueba automática con bots** (con `npm run dev` en marcha, en otra terminal):

```bash
node scripts/prueba-bots.mjs
```

Dos bots entran en una sala, se reparten los puestos, cocinan, toman nota, se pasan cosas y terminan un turno; luego un bot solo cocina dos hamburguesas, supera un nivel, elige habilidad, pasa por la tienda, pierde la siguiente ronda y entra en el ranking (tarda unos 2 minutos); el script marca cada paso con ✅ o ❌.

## Jugar en Discord (Actividad)

Dentro de Discord, el juego coge tu **nombre y avatar** de tu cuenta y mete en la misma partida a todos los
que abran la Actividad en el **mismo canal de voz** (una sala por instancia de la Actividad).
Fuera de Discord sigue funcionando en el navegador como hasta ahora.

### 1. Crear la aplicación en el Discord Developer Portal

1. Entra en <https://discord.com/developers/applications> y pulsa **New Application**. Ponle nombre (por ejemplo *¡Oído, Cocina!*).
2. En **OAuth2**:
   - Copia el **Client ID**.
   - Pulsa **Reset Secret** y copia el **Client Secret**. Discord solo te lo enseña una vez.
   - En **Redirects**, si te pide una URL, añade `https://127.0.0.1` (la Actividad no la usa, pero el formulario la pide).
3. En la raíz del proyecto, copia `.env.example` como `.env` y rellénalo:

   ```bash
   cp .env.example .env
   ```

   ```env
   VITE_DISCORD_CLIENT_ID=tu_client_id
   DISCORD_CLIENT_SECRET=tu_client_secret
   ```

   El secreto **no se sube a git** (`.env` está en `.gitignore`) y solo lo usa el servidor, nunca el navegador.

### 2. Activar las Actividades

En el portal, dentro de tu aplicación:

1. **Activities → Settings** → marca **Enable Activities**. Discord crea solo el comando de entrada «Launch».
2. En esa misma página, en **Supported Platforms**, marca **Web**, **iOS** y **Android**. Si no marcas una plataforma, la Actividad no aparece en ella.

### 3. Probarlo en Discord durante el desarrollo con cloudflared

Discord carga la Actividad desde una URL pública con HTTPS. Mientras desarrollas, `cloudflared` crea un
túnel gratuito hasta tu PC.

1. Instala cloudflared, por ejemplo en Windows:

   ```bash
   winget install --id Cloudflare.cloudflared
   ```

   En macOS: `brew install cloudflared`. En Linux, mira <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.
2. En el `.env`, activa el modo túnel para que la recarga en caliente de Vite funcione a través de HTTPS:

   ```env
   DISCORD_TUNNEL=1
   ```

3. Arranca el juego y, en otra terminal, el túnel:

   ```bash
   npm run dev
   ```

   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```

   cloudflared muestra una dirección del estilo `https://palabras-al-azar.trycloudflare.com`.
4. **URL Mapping:** en el portal, ve a **Activities → URL Mappings** y pon en el mapeo raíz:

   | PREFIX | TARGET |
   |---|---|
   | `/` | `palabras-al-azar.trycloudflare.com` |

   Pon el TARGET **sin `https://`**. No hacen falta más mapeos: el juego, `/api/token` y la conexión
   del multijugador (`/colyseus`) van todos por esa misma dirección, y Vite los reparte. Los avatares de
   `cdn.discordapp.com` los permite Discord sin mapeo.

   ⚠️ La dirección de `trycloudflare.com` **cambia cada vez que reinicias cloudflared**. Cuando la reinicies, actualiza el mapeo.
5. **Abrir la Actividad:**
   - Activa el **Modo desarrollador** en Discord: *Ajustes de usuario → Avanzado → Modo desarrollador*.
   - Entra en un canal de voz de un servidor y pulsa el botón de **Actividades** (el cohete).
   - Elige *¡Oído, Cocina!*.

   La primera vez Discord te pide permiso para compartir tu cuenta con la aplicación.

Si algo falla, la consola de Discord ayuda: en escritorio, `Ctrl+Shift+I` (Windows) o `Cmd+Option+I` (macOS)
abre las herramientas de desarrollo. Los errores de conexión también aparecen en la pantalla de la sala.

### 4. Añadir a tus amigos como testers

Mientras la Actividad no esté distribuida, Discord solo deja abrirla a **ti y a los miembros del equipo de desarrollo**
de la aplicación. Para que tus amigos puedan jugar:

1. En el portal, ve a **Teams → New Team** y crea un equipo.
2. Invita a tus amigos al equipo con su nombre de usuario de Discord. Tienen que aceptar la invitación; Discord puede pedirles verificación en dos pasos.
3. En tu aplicación, en **General Information**, usa **Transfer App to Team** para pasarla a ese equipo.
4. Cada amigo activa el **Modo desarrollador** en su Discord. Ya pueden abrir la Actividad desde el canal de voz como en el paso 3.5.

Si en tu portal aparece una pestaña **App Testers** dentro de la aplicación, también puedes añadirlos desde ahí.
Las opciones del portal cambian a menudo: si no ves alguna de estas, busca «Teams» en la documentación de Discord.

### 5. Desplegarlo cuando esté terminado

Cuando no quieras depender de tu PC, sube el juego a un servidor Node con WebSockets y HTTPS
(Railway, Render, Fly.io o un VPS propio). En producción, el mismo servidor sirve el juego compilado,
el endpoint `/api/token` y el multijugador, todo en un único puerto.

1. Comandos en el hosting:

   ```bash
   npm install
   npm run build
   ```

   ```bash
   npm start
   ```

   `npm start` usa el puerto `PORT` que da el hosting, o `SERVER_PORT` si lo defines.
2. Variables de entorno en el hosting, en lugar del `.env`:

   | Variable | Valor |
   |---|---|
   | `VITE_DISCORD_CLIENT_ID` | tu Client ID (tiene que estar ya en el `npm run build`) |
   | `DISCORD_CLIENT_SECRET` | tu Client Secret |
   | `REQUIRE_DISCORD` | `1` (solo se entra desde Discord; sin invitados por navegador) |

3. En **Activities → URL Mappings**, cambia el mapeo raíz `/` a tu dominio (por ejemplo `hora-punta.up.railway.app`, sin `https://`).
4. Comprueba que `https://tu-dominio/health` responde `{"ok":true}`.

El estado de las partidas vive en la memoria del servidor (Colyseus, un solo proceso). Basta de sobra para
jugar con amigos; si el servidor se reinicia, las partidas en curso se pierden.

Para que la Actividad la pueda usar **cualquiera** (no solo tu equipo) hay que pasar por el proceso de
distribución y verificación de Discord. Para jugar con tus amigos no hace falta.

## Publicarlo en Railway

Un solo servicio de Railway hace todo: sirve el juego, el login de Discord (`/api/token`), el ranking y el
multijugador (WebSockets), por el mismo puerto. No hace falta port forwarding ni un segundo servicio.

1. **New Project → Deploy from GitHub repo** → `oido-cocina`, rama `main`, carpeta raíz del repositorio.
   `railway.json` ya le dice cómo compilar (`npm run build`) y arrancar (`npm start`), con comprobación en `/health`.
2. **Variables**:
   - `VITE_DISCORD_CLIENT_ID`: el ID de la aplicación (se usa al compilar).
   - `DISCORD_CLIENT_SECRET`: el secreto de OAuth2.
   - `REQUIRE_DISCORD=1` (opcional): solo se puede entrar desde Discord.
   - `RANKING_FILE=/data/ranking.json` con un **Volume** montado en `/data`, para que el ranking no se borre en cada despliegue.
   - No pongas `PORT` ni `SERVER_PORT`: Railway da el puerto y el servidor lo usa.
3. **Settings → Networking → Generate Domain**: te da una dirección como `oido-cocina-production.up.railway.app`.
   Ábrela en el navegador para probar (tú y tus amigos, con `?sala=algo` para jugar juntos).
4. En el Developer Portal de Discord, **Activities → URL Mappings**: prefijo `/` → esa dirección (sin `https://`).


## Cómo se juega

### Modos

En el menú principal eliges cuántos vais a jugar:

- **1 jugador**: partida privada, sin sala de espera. Llevas todos los puestos y **los clientes dicen
  directamente lo que quieren** (no hace falta tomar nota).
- **2, 3 o 4 jugadores**: se abre la sala y el turno no puede empezar hasta que estéis todos. Los puestos
  se reparten solos según cuántos seáis, y en la sala se pueden cambiar tocando una tarjeta. También se
  puede cambiar ahí el número de jugadores (botones 2, 3 y 4), por ejemplo si en Discord lo eligió otro.
  Con más cocineros llegan más clientes (un 12 % más por cada uno).

| Jugadores | Reparto automático |
|---|---|
| 2 | Caja + Montaje · Plancha + Freidora y bebidas |
| 3 | Caja + Montaje · Plancha · Freidora y bebidas |
| 4 | Un puesto cada uno |

En PC también puedes elegir el modo con las teclas 1-4.

### Puestos

Solo puedes usar los puestos que son tuyos: la casilla que tienes delante se marca en **blanco** si es
tuya y en **rojo** si es de otro.

| Puesto | Qué hace |
|---|---|
| **Caja** | Toma nota en el pase (con las manos vacías) y entrega allí cada parte del pedido |
| **Plancha** | Carne a la plancha: hecha en 6 s, quemada 8 s después (−1 💰) |
| **Montaje** | Apila las hamburguesas en las mesas de montaje, de abajo arriba |
| **Freidora y bebidas** | Patatas (5 s, se queman 8 s después) y vasos de cola o naranja (3 s) |

Las cajas de ingredientes, las encimeras y la basura son de todos. Para pasar algo a un compañero, ponte
delante de él y pulsa acción (tiene que tener las manos libres), o déjalo en una encimera.
Quien entra a mitad de turno ayuda sin puesto hasta el siguiente; si alguien se va, sus puestos pasan a otro.

### Niveles

Una partida es una escalada de **20 niveles**. Cada ronda tiene un **objetivo de pedidos servidos**: si lo cumplís
(sin quedaros sin reputación) pasáis al siguiente. **Si no, se acaba la partida**: volvéis al nivel 1 sin habilidades.
Las estrellas (1-3) dependen de cuánto superéis el objetivo. Cada navegador guarda su récord.

| | Nivel 1 | Nivel 10 | Nivel 20 |
|---|---|---|---|
| Duración de la ronda | 1 min 30 s | 2 min 15 s | 3 min |
| Paciencia de los clientes | ×2 | ×1,5 | ×0,85 |
| Clientes a la vez (máx.) | 2 | 3-4 | 5 |
| Patatas / bebida | nunca | 41 % | 75 % |

- **Recetas nuevas** al subir: El Jardín (nivel 5, tomate), La Ahumada (8, bacon), Doble Trueno (11) y El Monstruo (14).
  La Huertana aparece en el nivel 3; en los dos primeros solo se pide La Chispa.
- **Según cuántos sois**: con más cocineros llegan más clientes (×1,4 con 2, ×1,75 con 3, ×2 con 4) y el objetivo
  es mayor; jugando solo los clientes tienen un 15 % más de paciencia.
- Todos los números están en `shared/src/levels.ts`, para ajustarlos fácilmente.

### Mini-habilidades

Cada **2 niveles superados** (tras el 2, el 4, el 6…), **cada cocinero elige una habilidad entre tres**, con
preferencia por las que sirven para sus puestos. Le acompañan el resto de la partida; al perder una ronda se pierden todas.
Si alguien sale de la sala y vuelve a entrar desde Discord, recupera las suyas.

| Habilidad | Efecto | Máx. |
|---|---|---|
| Zapatillas rápidas | Te mueves un 12 % más rápido | ×2 |
| Vuelta y vuelta | La carne que pones se hace un 25 % antes | ×2 |
| Termómetro | Lo que pones en plancha o freidora tarda un 60 % más en quemarse | ×2 |
| Aceite nuevo | Tus patatas se fríen un 25 % antes | ×2 |
| Grifo a presión | Tus vasos se llenan un 35 % antes | ×2 |
| Labia | Los clientes a los que tomas nota tienen un 20 % más de paciencia (no sale jugando solo) | ×2 |
| Simpatía | Cada parte que entregas devuelve al cliente un 12 % de paciencia | ×2 |
| Bandeja | Con comida en las manos, coger de una caja de ingredientes lo apila encima | ×1 |
| Disculpa a tiempo | Tu primer fallo de cada ronda no cuesta reputación ni dinero | ×2 |
| Clientela fiel | El equipo empieza cada ronda con 10 de reputación más | ×2 |

Están definidas en `shared/src/perks.ts`. Durante la ronda, las tuyas aparecen debajo de tus puestos.

### Tienda

Tras cada nivel superado (y tras elegir habilidad, si toca) se abre la **tienda**. El dinero que ganáis en cada
ronda va a una **caja común de la partida**, y cualquiera puede comprar **mejoras del local** que valen para todos.
Se sigue cuando todos pulsan «Listo». Al perder una ronda se pierden el dinero y las mejoras.

| Mejora | Efecto | Precio (1 jugador) |
|---|---|---|
| Tercera plancha | Una plancha más, debajo de la mesa de montaje | 45 |
| Plancha de hierro | Toda la carne se hace un 20 % antes | 35 |
| Freidora industrial | Todas las patatas se fríen un 30 % antes | 30 |
| Dispensador doble | Todos los vasos se llenan un 40 % antes | 25 |
| Terraza con sombrillas | Los clientes esperan un 15 % más | 40 |
| Extintor | Lo quemado no cuesta dinero y todo tarda un 30 % más en quemarse | 25 |
| Tarro de propinas | Las propinas valen el doble | 20 |
| Reseñas de 5 estrellas | Cada ronda empieza con 15 de reputación más | 30 |

Con más jugadores cuestan un 25 % más por jugador extra (también se gana más). Están en `shared/src/shop.ts`.

### Fin de la partida y ranking

Al perder (o al superar los 20 niveles) sale el **resumen de la partida**: niveles superados, hamburguesas,
dinero, tiempo, las habilidades de cada uno, el MVP de toda la partida y el **ranking del grupo**. En Discord,
el ranking es **por servidor**, así que se ve qué grupo de amigos llega más lejos. También se puede consultar desde
el menú («Ranking»). El servidor lo guarda en `server/data/ranking.json` (o en la ruta de `RANKING_FILE`).

### Modo rol y modo libre

En la sala, antes de empezar la partida (nivel 1), cualquiera puede elegir el modo de juego. Se mantiene hasta perder.

- **Modo rol** (por defecto): cada jugador lleva sus puestos (caja, plancha, montaje, freidora) y la caja toma nota.
- **Modo libre**: todos pueden usar toda la cocina y no hay que tomar nota (los clientes piden directamente).
  Para compensar, los clientes llegan un **20 % más rápido** y el objetivo de pedidos es algo mayor.
  En el ranking, estas partidas salen marcadas con «(libre)». En solitario el modo no cambia nada.

### Pausa

Escape (o el botón de pausa) **para la ronda para todo el grupo**: el reloj, los clientes y los fogones se quedan
quietos y a todos les sale el menú con «Pausada por …». Cualquiera puede reanudar. Desde la pausa:
**Reanudar**, **Configuración** (sonido, volumen y pantalla completa) o **Salir al menú principal**.

### Social y Discord

- **Invitar**: en Discord, la sala tiene un botón «Invitar» que abre el diálogo de Discord para llamar a tus amigos
  a la Actividad (entran al canal de voz y a la misma cocina).
- **Estado en tu perfil**: mientras jugáis, Discord muestra qué hacéis («Cocinando en el nivel 7 · 3 de 4 cocineros»,
  «De compras en la tienda», «Partida terminada: 9 niveles»…) con cuántos sois, para que los amigos se apunten.
  Para esto la Actividad pide el permiso `rpc.activities.write` (Discord lo pregunta una vez).
- **Tu cocinero**: en el menú (o tocando al cocinero grande) eliges el **color del delantal** (8) y un **accesorio**
  que se gana con tu récord: gorro de chef, gorra (2 niveles), pañuelo (4), bigote (6), gafas de sol (10) y corona (20).
  Se guarda en el navegador y lo ven todos en la cocina, la sala y los resúmenes.
- **Gestos rápidos**: «¡Oído!», «¡Ayuda!», «¡Marchando!» y «¡Gracias!» salen en un bocadillo encima de tu cocinero, con
  su sonido. En el PC, teclas **1-4**; en el móvil, el icono del bocadillo entre el joystick y el botón. Útil para quien
  no tiene micro.

### Sonido

Todo el sonido se genera en el navegador (Web Audio), sin archivos: marimba y campanillas suaves para coger,
apilar (cada capa suena más aguda), entregar y cobrar; chisporroteo de la plancha y burbujeo de la freidora;
avisos antes de que algo se queme; cuenta atrás en los últimos 10 segundos; y una música tranquila que se
acelera en los últimos 30 segundos de la ronda. El altavoz (menú, tienda y cocina) cambia entre
**música y sonido → solo efectos → silencio**, y se recuerda en cada navegador.

### Pedidos

1. Con 2 o más jugadores, los clientes llegan a la calle con un bocadillo «…»: **la caja tiene que tomarles
   nota** (pase rojo, manos vacías, acción). Hasta entonces la cocina no sabe qué quieren y no aparece su
   comanda; a quien lleva la caja le sale un aviso amarillo.
2. Cada pedido es una hamburguesa y, a veces, **patatas** y/o una **bebida**. Se cobra cuando se han entregado todas sus partes en el pase.
3. Cada cliente tiene un número, y su comanda con ese número aparece arriba con la paciencia que le queda.

- Pedido completo con más de la mitad de paciencia = **perfecto** + propina.
- Entregar algo que nadie ha pedido: −3 💰 y −5 ⭐. Cliente que se va: −2 💰 y −8 ⭐. Si la reputación llega a 0, se acaba la ronda (y no se pasa de nivel).
- Al final, el resumen muestra lo que ha hecho cada uno (notas, entregas, fogones, capas, fallos) y el **MVP**.

**Controles**

| | Escritorio | Móvil / táctil |
|---|---|---|
| Moverse | WASD o flechas | Joystick (izquierda) |
| Acción (coger, dejar, apilar, servir, tomar nota, pasar) | Espacio, E o Enter | Botón naranja (muestra la acción) |
| Gestos rápidos | 1, 2, 3, 4 | Icono del bocadillo |
| Pausa (reanudar, configuración, salir al menú) | Escape o el icono ⏸ abajo a la derecha | Icono ⏸ arriba a la izquierda de los controles |

## Cómo funciona la red

- El **servidor es la autoridad**: genera los pedidos, lleva los tiempos de plancha, freidora, bebidas y paciencia,
  decide qué pasa al pulsar acción y calcula la puntuación. Envía el estado de la cocina unas 20 veces por segundo.
- Cada cliente **mueve a su propio cocinero al instante** (predicción) y manda su posición; el servidor la valida
  (sin atravesar paredes ni ir más rápido de lo posible) y, si no cuadra, el cliente se recoloca.
- Los demás cocineros se dibujan suavizados entre una actualización y la siguiente.
- Si se corta la conexión (típico en el móvil), el servidor guarda tu sitio 20 segundos.

## Estructura

```
shared/   Lógica de juego en TypeScript, común a cliente y servidor: plano de la cocina,
          movimiento, puestos, pedidos, puntuación y mensajes de red (protocol.ts).
server/   Colyseus: una sala por grupo (KitchenRoom.ts) que ejecuta la simulación,
          /api/token y verificación de la cuenta de Discord (discord.ts).
client/   Vite + TypeScript + Phaser 3.
  src/discord.ts Login con el SDK de Discord (nombre, avatar y sala por instancia).
  src/net.ts     Conexión con el servidor.
  src/pixel/     Sprites pixel art generados por código (sin imágenes externas).
  src/scenes/    Menú, sala, cocina, HUD (comandas y controles) y resumen.
scripts/  Prueba con bots.
```

El plano de la cocina es un mapa de caracteres en `shared/src/kitchen.ts`: se puede rediseñar editando el texto.

Variables de entorno: ver `.env.example` (`VITE_DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SERVER_PORT`, `REQUIRE_DISCORD`, `DISCORD_TUNNEL`, `RANKING_FILE`).

## Hoja de ruta

1. ✅ Cocina pixel art: plancha, freidora, bebidas, montaje y pase; 2 recetas (escritorio y móvil)
2. ✅ Multijugador con Colyseus: sala, puestos por jugador, tomar nota, pasarse cosas, resumen con MVP
3. ✅ Actividad de Discord: login, nombre y avatar, una partida por canal de voz, guía de portal, túnel y despliegue
4. ⏳ ✅ 20 niveles con dificultad creciente según el número de jugadores y 6 recetas (tomate y bacon).
   ✅ Mini-habilidades cada 2 niveles; perder una ronda devuelve al nivel 1.
   ✅ Tienda entre rondas, resumen final de la partida y ranking por servidor de Discord.
   ✅ Sonido y música, vapor y humo, destellos al servir, clientes que sudan, confeti, comandas que tiemblan.
   ✅ Invitar desde el juego, estado en Discord, delantal y accesorios, gestos rápidos.
   Pendiente: eventos aleatorios, stock de ingredientes
