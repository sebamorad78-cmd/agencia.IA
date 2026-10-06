// El "cerebro" del asistente de hotel: lo usan la demo web y el WhatsApp.

export const MODELO_POR_DEFECTO = "claude-opus-5-5";

const MAX_MENSAJES = 30;
const MAX_CARACTERES = 1200;

const RESPUESTA_REFUSAL =
  "Disculpá, eso no lo puedo responder por acá. Te derivo con recepción.\n[[DERIVAR]]Consulta no respondida por el asistente";

export function crearPromptSistema(hotel, canal = "WhatsApp") {
  return `Sos el asistente virtual por ${canal} del ${hotel.nombre}, en ${hotel.ciudad}.
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
}

/**
 * Deja la conversación en el formato que acepta la API: solo texto, roles válidos,
 * sin mensajes vacíos, empezando y terminando con el huésped, y con turnos alternados.
 * Devuelve null si no queda una conversación válida.
 */
export function limpiarMensajes(raw) {
  if (!Array.isArray(raw)) return null;
  const limpios = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.slice(0, MAX_CARACTERES).trim();
    if (!content) continue;
    const anterior = limpios[limpios.length - 1];
    // En WhatsApp el huésped suele mandar varios mensajes seguidos: se unen en un solo turno.
    if (anterior && anterior.role === m.role) anterior.content += "\n" + content;
    else limpios.push({ role: m.role, content });
  }
  const recortados = limpios.slice(-MAX_MENSAJES);
  while (recortados.length && recortados[0].role !== "user") recortados.shift();
  if (!recortados.length || recortados[recortados.length - 1].role !== "user") return null;
  return recortados;
}

/** Pide la próxima respuesta al modelo. Los errores de la API se propagan al llamador. */
export async function preguntarAlAsistente({ client, model, system, messages }) {
  const response = await client.beta.messages.create({
    model: model || MODELO_POR_DEFECTO,
    max_tokens: 4000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") return RESPUESTA_REFUSAL;

  const texto = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return texto || "Perdón, no te entendí. ¿Me lo repetís?";
}

/** Separa el texto que ve el huésped de las marcas internas de reserva y derivación. */
export function separarMarcas(texto) {
  const visible = [];
  let reserva = null;
  let derivar = null;
  for (const linea of String(texto).split("\n")) {
    const t = linea.trim();
    if (t.startsWith("[[RESERVA]]")) {
      try { reserva = JSON.parse(t.slice(11)); } catch { reserva = { detalle: t.slice(11) }; }
    } else if (t.startsWith("[[DERIVAR]]")) {
      derivar = t.slice(11).trim() || "Pedido del huésped";
    } else {
      visible.push(linea);
    }
  }
  return { visible: visible.join("\n").trim(), reserva, derivar };
}
