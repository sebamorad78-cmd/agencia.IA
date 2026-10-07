// Webhook de WhatsApp Business: Meta avisa acá cada mensaje que recibe el número del hotel.
// La lógica vive en lib/whatsapp.js; este archivo solo la conecta con Netlify.

import type { Config, Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import hotel from "../../demo/hotel.json" with { type: "json" };
import { almacenWhatsApp } from "../../lib/almacen.js";
import { crearPromptSistema, preguntarAlAsistente } from "../../lib/agente.js";
import {
  VERSION_GRAPH_POR_DEFECTO,
  crearClienteWhatsApp,
  crearProcesador,
  leerEventos,
  verificarFirma,
} from "../../lib/whatsapp.js";

export default async (req: Request, context: Context) => {
  const env = (clave: string) => Netlify.env.get(clave) || "";

  // 1) Verificación inicial que hace Meta al configurar el webhook.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge") || "";
    if (modo === "subscribe" && token && token === env("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(desafio, { status: 200 });
    }
    return new Response("Token de verificación inválido", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  // 2) Cada aviso tiene que venir firmado por Meta.
  const cuerpo = await req.text();
  if (!verificarFirma(cuerpo, req.headers.get("x-hub-signature-256"), env("WHATSAPP_APP_SECRET"))) {
    return new Response("Firma inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const faltan = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "ANTHROPIC_API_KEY"].filter((k) => !env(k));
  if (faltan.length) {
    console.error("Faltan variables de entorno:", faltan.join(", "));
    return new Response("ok");
  }

  const whatsapp = crearClienteWhatsApp({
    token: env("WHATSAPP_TOKEN"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    version: env("WHATSAPP_GRAPH_VERSION") || VERSION_GRAPH_POR_DEFECTO,
  });
  const cliente = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const system = crearPromptSistema(hotel, "WhatsApp");

  const procesar = crearProcesador({
    store: almacenWhatsApp(),
    whatsapp,
    preguntar: (messages) => preguntarAlAsistente({ client: cliente, model: env("CLAUDE_MODEL"), system, messages }),
    avisosA: env("AVISOS_WHATSAPP"),
    horario: hotel.horario_atencion || { desde: 9, hasta: 21 },
    plantillaAviso: env("WHATSAPP_PLANTILLA_AVISO"),
  });

  // 3) Se responde a Meta enseguida y la conversación se procesa a continuación.
  const trabajo = Promise.all(leerEventos(payload).map((ev) => procesar(ev))).catch((err) =>
    console.error("Error procesando el aviso de WhatsApp:", err),
  );
  if (typeof context.waitUntil === "function") context.waitUntil(trabajo);
  else await trabajo;

  return new Response("ok");
};

export const config: Config = {
  path: "/api/whatsapp",
};
