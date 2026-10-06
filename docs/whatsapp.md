# Conectar el asistente a WhatsApp

Guía para dejar funcionando el asistente en un número real de WhatsApp, con la **API oficial de WhatsApp Business** (Cloud API de Meta).

- **Número del asistente (demo):** +54 9 2236 92-6943
- **Avisos de reservas y derivaciones:** +54 9 2268 51-6801
- **Webhook:** `https://cfmtslabs.netlify.app/api/whatsapp`

Meta cambia seguido los nombres de los menús. Si algo no coincide exactamente, buscá la opción equivalente.

## Antes de empezar

- El número del asistente **no tiene que estar registrado en la app de WhatsApp** (ni la común ni la Business). Si ya lo está, borrá esa cuenta desde la app antes de seguir. Usá un chip dedicado, nunca tu número personal.
- Tené a mano el celular con ese chip: Meta manda un código por SMS o llamada.

## 1. Crear la app en Meta

1. Entrá a [developers.facebook.com](https://developers.facebook.com) con tu Facebook y tocá **Mis apps → Crear app**.
2. Elegí el caso de uso de **WhatsApp** (o tipo **Negocios**) y poné de nombre **CFMTS Labs**.
3. Cuando te lo pida, creá o elegí un **portfolio comercial** (Meta Business) a nombre de CFMTS Labs.

## 2. Registrar el número

1. En la app, andá a **WhatsApp → Configuración de la API** y tocá **Agregar número de teléfono**.
2. Nombre visible: **CFMTS Labs**. Meta revisa que coincida con el negocio; un nombre de hotel ficticio puede ser rechazado.
3. Cargá **+54 9 2236 92-6943** y verificalo con el código.
4. Copiá el **Identificador del número de teléfono** (Phone number ID). Es un número largo.

## 3. Token permanente

El token que aparece en la pantalla de prueba vence en 24 horas. Para uno permanente:

1. Andá a [business.facebook.com](https://business.facebook.com) → **Configuración → Usuarios del sistema → Agregar**. Rol: **Administrador**.
2. **Asignar activos**: la app de CFMTS Labs y la cuenta de WhatsApp, con control total.
3. **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin vencimiento.
4. Copialo y guardalo en un lugar seguro: Meta no lo vuelve a mostrar.

## 4. Clave secreta de la app

En la app: **Configuración de la app → Básica → Clave secreta de la app → Mostrar**. Copiala.

## 5. API key de la IA (Anthropic)

1. Creá una cuenta en [console.anthropic.com](https://console.anthropic.com) y cargá USD 5 a 10 de crédito.
2. **Configurá un límite de gasto mensual** (por ejemplo, USD 10).
3. Creá una API key y copiala.

## 6. Cargar las claves en Netlify

En [app.netlify.com/projects/cfmtslabs](https://app.netlify.com/projects/cfmtslabs) → **Site configuration → Environment variables → Add a variable**. Marcalas como secretas:

| Variable | Valor |
|---|---|
| `WHATSAPP_TOKEN` | El token permanente del paso 3 |
| `WHATSAPP_PHONE_NUMBER_ID` | El identificador del número del paso 2 |
| `WHATSAPP_APP_SECRET` | La clave secreta del paso 4 |
| `ANTHROPIC_API_KEY` | La API key del paso 5 |

Ya están cargadas: `WHATSAPP_VERIFY_TOKEN` (el token de verificación) y `AVISOS_WHATSAPP` (tu número para los avisos).

Después andá a **Deploys → Trigger deploy → Deploy site** para que tome las claves nuevas.

Con `ANTHROPIC_API_KEY` cargada, la demo de la web también pasa a responder con la IA real.

## 7. Conectar el webhook

1. En la app de Meta: **WhatsApp → Configuración → Webhook → Editar**.
2. **URL de devolución de llamada:** `https://cfmtslabs.netlify.app/api/whatsapp`
3. **Token de verificación:** el valor de `WHATSAPP_VERIFY_TOKEN` (está en Netlify, en las variables de entorno).
4. Tocá **Verificar y guardar**.
5. En **Campos del webhook**, suscribite a **messages**.

## 8. Probar

1. Desde tu celular personal, escribile "Hola" al +54 9 2236 92-6943. Tiene que responder el asistente del hotel de la demo.
2. Pedí una reserva completa: te tiene que llegar el aviso a tu número personal.
3. Escribí `/reiniciar` para empezar una conversación nueva.

Si no responde: Netlify → **Logs → Functions → whatsapp**. Ahí aparece qué falta.

## Cómo funciona

- **Respuestas:** cada mensaje llega a `netlify/functions/whatsapp.mts`, que le pasa la conversación a la IA con los datos de `demo/hotel.json` y responde por la API de Meta.
- **Historial:** cada conversación se guarda en Netlify Blobs (últimos 30 mensajes).
- **Avisos:** cuando el huésped completa una reserva o pide una persona, te llega un resumen por WhatsApp.
- **Audios y fotos:** el asistente pide que le escriban por texto.
- **Límite:** 80 mensajes por día por huésped, para cuidar el presupuesto de la IA.

## Avisos fuera de la ventana de 24 horas

Meta solo deja mandar mensajes libres a un número que escribió en las últimas 24 horas. Para que los avisos te lleguen siempre:

- **Opción simple:** escribile "Hola" al número del asistente una vez por día desde tu celular.
- **Opción definitiva:** creá en Meta una **plantilla** de categoría **Utilidad**, llamada `aviso_recepcion`, idioma **español (Argentina)**, con el cuerpo `Aviso de CFMTS Labs: {{1}}`. Cuando la aprueben, cargá en Netlify `WHATSAPP_PLANTILLA_AVISO` = `aviso_recepcion`.

## Para un hotel real

- **Datos del hotel:** se reemplaza `demo/hotel.json` (o se arma un sitio aparte por hotel).
- **Número del hotel:** Meta tiene una función de **coexistencia** que permite seguir usando la app WhatsApp Business en el celular mientras el asistente responde por la API. Hay que confirmar que esté disponible para ese número al momento de conectarlo.
- **Si responde una persona del hotel:** cuando alguien del hotel responde desde la app, el asistente deja de contestar en ese chat por 12 horas. Para eso hay que suscribirse también al campo **smb_message_echoes** del webhook.
