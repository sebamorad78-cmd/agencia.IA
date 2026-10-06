// Endpoint del chat de la demo web para Vercel. La lógica vive en lib/chat-web.js.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crearChatWeb } from "../lib/chat-web.js";

const hotel = JSON.parse(readFileSync(join(process.cwd(), "demo", "hotel.json"), "utf8"));
let responder;
let claveActual;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }
  // Se recrea si cambia la API key, para leer siempre las variables de entorno vigentes.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!responder || claveActual !== apiKey) {
    responder = crearChatWeb({ hotel, apiKey, model: process.env.CLAUDE_MODEL });
    claveActual = apiKey;
  }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const { status, json } = await responder({ body: req.body, ip });
  return res.status(status).json(json);
}
