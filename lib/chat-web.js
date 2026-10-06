// Lógica del chat de la demo web, independiente del hosting (Vercel o Netlify).
// Sin API key responde { offline: true } y la demo usa su motor local gratuito.

import Anthropic from "@anthropic-ai/sdk";
import { crearPromptSistema, limpiarMensajes, preguntarAlAsistente } from "./agente.js";

const MAX_PEDIDOS_POR_IP = 60; // por instancia y por hora, freno básico contra abuso

export function crearChatWeb({ hotel, apiKey, model, crearCliente = (key) => new Anthropic({ apiKey: key }) }) {
  const system = crearPromptSistema(hotel, "la web");
  const pedidos = new Map();

  function limitado(ip) {
    const ahora = Date.now();
    const entrada = pedidos.get(ip);
    if (!entrada || ahora - entrada.inicio > 3600_000) {
      pedidos.set(ip, { inicio: ahora, cantidad: 1 });
      return false;
    }
    entrada.cantidad += 1;
    return entrada.cantidad > MAX_PEDIDOS_POR_IP;
  }

  return async function responder({ body, ip }) {
    if (!apiKey) return { status: 200, json: { offline: true } };
    if (limitado(ip || "anon")) {
      return { status: 429, json: { error: "Demasiados mensajes. Probá de nuevo en un rato." } };
    }
    const messages = limpiarMensajes(body?.messages);
    if (!messages) return { status: 400, json: { error: "Conversación inválida" } };

    try {
      const reply = await preguntarAlAsistente({ client: crearCliente(apiKey), model, system, messages });
      return { status: 200, json: { reply } };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return { status: 429, json: { error: "El asistente está con mucha demanda. Probá en unos segundos." } };
      }
      if (err instanceof Anthropic.AuthenticationError) {
        console.error("API key de Anthropic inválida");
        return { status: 200, json: { offline: true } };
      }
      if (err instanceof Anthropic.APIError) {
        console.error("Error de la API de Claude:", err.status, err.message);
        return { status: 502, json: { error: "No pude responder ahora. Probá de nuevo." } };
      }
      console.error(err);
      return { status: 500, json: { error: "Error interno" } };
    }
  };
}
