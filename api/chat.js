// Endpoint del agente de hotel (Vercel Serverless Function).
// Sin ANTHROPIC_API_KEY responde { offline: true } y la demo usa su motor local gratuito.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_MESSAGES = 30;
const MAX_CHARS = 1200;
const MAX_REQUESTS_PER_IP = 60; // por instancia y por hora, freno básico contra abuso

const hotel = JSON.parse(readFileSync(join(process.cwd(), "demo", "hotel.json"), "utf8"));
const hits = new Map();

const SYSTEM_PROMPT = `Sos el asistente virtual por WhatsApp del ${hotel.nombre}, en ${hotel.ciudad}.
${hotel.aviso}

DATOS DEL HOTEL (única fuente de verdad, no inventes nada fuera de esto):
${JSON.stringify(hotel, null, 2)}

CÓMO RESPONDER:
- Respondé en el idioma del huésped (español, portugués o inglés). En español usá voseo rioplatense, cálido y profesional.
- Mensajes cortos, estilo WhatsApp: 1 a 4 oraciones, sin markdown ni títulos. Podés usar algún emoji con moderación.
- Precios en pesos argentinos con separador de miles (ej: $95.000). Si te piden un total, calculalo: noches x tarifa (+ extras).
- Nunca confirmes disponibilidad como definitiva: decí que recepción la confirma en breve.
- Si algo no está en los datos, decí que lo consultás con recepción. No inventes.
- Si el huésped pide hablar con una persona, tiene un reclamo o un caso especial, avisale que lo derivás a recepción.

RESERVAS:
- Si quiere reservar, pedí de a poco lo que falte: fecha de ingreso, fecha de salida, cantidad de personas, tipo de habitación y nombre.
- Cuando tengas TODOS esos datos, resumí la solicitud y al final de tu mensaje agregá en una línea aparte exactamente:
[[RESERVA]]{"nombre":"...","ingreso":"...","salida":"...","noches":N,"personas":N,"habitacion":"...","total_estimado":N,"notas":"..."}
- Si derivás a recepción, agregá al final en una línea aparte: [[DERIVAR]]motivo breve
- Esas marcas las lee el sistema del hotel, el huésped no las ve. No las uses en otro caso.`;

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > 3600_000) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_IP;
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .filter((m) => m.content.trim() !== "")
    .slice(-MAX_MESSAGES);
  // La API exige que la conversación empiece con el huésped y termine con él.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ offline: true });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Demasiados mensajes. Probá de nuevo en un rato." });
  }

  const messages = cleanMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: "Conversación inválida" });
  }

  const client = new Anthropic();

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({
        reply: "Disculpá, eso no lo puedo responder por acá. Te derivo con recepción.\n[[DERIVAR]]Consulta no respondida por el asistente",
      });
    }

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return res.status(200).json({ reply: reply || "Perdón, no te entendí. ¿Me lo repetís?" });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "El asistente está con mucha demanda. Probá en unos segundos." });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("API key inválida");
      return res.status(200).json({ offline: true });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Error de la API de Claude:", err.status, err.message);
      return res.status(502).json({ error: "No pude responder ahora. Probá de nuevo." });
    }
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
}
