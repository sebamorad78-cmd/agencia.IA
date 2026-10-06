// Chat de la demo web en Netlify. Sin ANTHROPIC_API_KEY la demo usa su motor local gratuito.

import type { Config, Context } from "@netlify/functions";
import hotel from "../../demo/hotel.json" with { type: "json" };
import { crearChatWeb } from "../../lib/chat-web.js";

// Se reutiliza entre pedidos para que el freno contra abuso recuerde las IP.
let responder: ReturnType<typeof crearChatWeb> | undefined;
let claveActual: string | undefined;

function obtenerResponder() {
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!responder || claveActual !== apiKey) {
    responder = crearChatWeb({ hotel, apiKey, model: Netlify.env.get("CLAUDE_MODEL") });
    claveActual = apiKey;
  }
  return responder;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST" },
    });
  }
  const body = await req.json().catch(() => ({}));
  const { status, json } = await obtenerResponder()({ body, ip: context.ip });
  return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
};

export const config: Config = {
  path: "/api/chat",
};
