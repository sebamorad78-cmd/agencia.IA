# CFMTS Labs

Web publicada: **https://cfmtslabs.netlify.app** · Demo: **https://cfmtslabs.netlify.app/demo/**

Sitio web de **CFMTS Labs**, agencia de inteligencia artificial para hotelería en Mar del Plata, y **demo en vivo** de un asistente de WhatsApp para hoteles.

## Qué hay en este repo

| Ruta | Qué es |
|---|---|
| `index.html`, `styles.css`, `main.js` | Landing de la agencia: propuesta, calculadora de reservas perdidas, cómo trabajamos, FAQ y contacto por WhatsApp. |
| `demo/` | Demo del asistente de WhatsApp de un hotel **ficticio** (Hotel Brisa Atlántica) con panel de recepción. |
| `demo/hotel.json` | Datos del hotel de la demo (tarifas, servicios, políticas). Para adaptar la demo a un hotel real, se edita este archivo. |
| `lib/` | Lógica del asistente compartida por la web y WhatsApp (`agente.js`, `chat-web.js`, `whatsapp.js`). |
| `netlify/functions/` | Funciones de Netlify: `/api/whatsapp` (webhook de WhatsApp) y `/api/chat` (chat de la demo web). |
| `api/chat.js` | La misma función de chat, para Vercel. |
| `docs/whatsapp.md` | Guía paso a paso para conectar el asistente a WhatsApp. |
| `tests/` | Pruebas de la función (`npm test`). |
| `assets/` | Logo (`brand/`) y tipografías propias (`fonts/`). |
| `kit-comercial/` | Material interno de venta: tarjeta, propuesta, acuerdo, planilla y logos. No se publica. Ver su README. |

## Cómo funciona la demo

- **Modo demo (gratis):** si no hay API key configurada, o si la web está en un hosting estático, la demo usa un motor de respuestas local. Responde tarifas y servicios en español, portugués e inglés, toma reservas y deriva a recepción. No cuesta nada.
- **Modo IA real:** con la variable `ANTHROPIC_API_KEY` configurada en Vercel, responde Claude con conversación libre usando los datos de `demo/hotel.json`.

El indicador debajo del nombre del hotel muestra qué modo está activo.

## Antes de publicar

1. **Número de WhatsApp:** ya configurado en `main.js`. Si cambia, se edita ahí.

## Publicar gratis en Vercel (recomendado)

1. Crear una cuenta gratis en [vercel.com](https://vercel.com) con GitHub.
2. "Add New → Project" e importar este repositorio. No hace falta cambiar ninguna configuración.
3. Queda publicado en una dirección `algo.vercel.app`. Más adelante se puede conectar un dominio propio.

### Activar la IA real (opcional, cuando haya presupuesto o un cliente que lo pague)

1. Crear una API key en [console.anthropic.com](https://console.anthropic.com).
2. **Configurar un límite de gasto mensual** en la consola, para que la demo pública no genere costos inesperados.
3. En Vercel: Settings → Environment Variables → agregar `ANTHROPIC_API_KEY`.
4. Opcional: `CLAUDE_MODEL` para elegir otro modelo (por defecto `claude-opus-5-5`; un modelo más chico abarata cada conversación).

La función ya trae un freno básico contra abuso (largo de mensajes, cantidad por conversación y por IP).

## Publicar gratis en Netlify

1. Crear una cuenta gratis en [netlify.com](https://www.netlify.com) con GitHub.
2. "Add new site → Import an existing project → GitHub" y elegir este repositorio.
3. No hace falta cambiar nada: `netlify.toml` ya tiene la configuración. Tocar "Deploy".

Con `ANTHROPIC_API_KEY` cargada en Netlify, la demo web responde con la IA real; sin ella, funciona en modo demo. El kit comercial y los archivos internos quedan bloqueados.

## WhatsApp

El asistente también responde en un número real de WhatsApp. Ver [`docs/whatsapp.md`](docs/whatsapp.md).

## Publicar en Hostinger u otro hosting estático

Subí todos los archivos por FTP o el administrador de archivos, **menos la carpeta `kit-comercial/`**. La landing funciona completa y la demo funciona en **modo demo** (la carpeta `api/` necesita Vercel para funcionar). El `.htaccess` evita que el hosting sirva versiones viejas de CSS/JS.

## Desarrollo local

```bash
npm install
npm test          # pruebas de la función
npx vercel dev    # landing + demo + API en http://localhost:3000
```
