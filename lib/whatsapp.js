// Conexión del asistente con la API oficial de WhatsApp Business (Cloud API de Meta).
// No depende del hosting: el almacenamiento, el envío y el modelo se inyectan.

import { createHmac, timingSafeEqual } from "node:crypto";
import { limpiarMensajes, separarMarcas } from "./agente.js";

export const VERSION_GRAPH_POR_DEFECTO = "v23.0";

const PAUSA_SI_RESPONDE_UNA_PERSONA_MS = 12 * 3600_000;
const MAX_MENSAJES_POR_DIA = 80; // por número de huésped, protege el presupuesto de la IA
const MAX_HISTORIAL = 30;
const ZONA_HORARIA_HORAS = -3; // Argentina, sin horario de verano
const DIA_MS = 24 * 3600_000;
const RETENCION_MENSAJES_MS = 7 * DIA_MS;
const RETENCION_CHATS_MS = 365 * DIA_MS;

const TEXTOS = {
  soloTexto: "Por ahora solo puedo leer mensajes escritos 🙏 ¿Me lo contás por texto?",
  error: "Disculpá, tuve un problema para responderte. Ya le aviso a recepción para que te contesten a la brevedad.",
  reinicio: "Listo, empezamos de nuevo. ¿En qué te puedo ayudar?",
};

/** Fecha y hora en Argentina, para las estadísticas. */
function fechaLocal(ms) {
  return new Date(ms + ZONA_HORARIA_HORAS * 3600_000);
}

/** Idioma aproximado de un mensaje, para el reporte. */
export function detectarIdioma(texto) {
  const t = String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(ola|oi|voce|voces|obrigad\w*|quanto|quarto|diaria|gostaria|pessoas|noites|tem|estacionamento|cachorro)\b/.test(t)) return "pt";
  if (/\b(hello|hi|room|price|how|do you|parking|dog|book|available|thanks|thank you|night|nights|people|guests)\b/.test(t)) return "en";
  return "es";
}

function estadisticasVacias(mes) {
  return {
    mes, mensajes: 0, respondidos: 0, fueraDeHorario: 0, conversaciones: 0, reservas: 0,
    valorReservas: 0, derivaciones: 0, noTexto: 0, idiomas: { es: 0, pt: 0, en: 0 }, porDia: {},
  };
}

/** Borra registros técnicos de más de 7 días y conversaciones sin actividad hace más de 12 meses. */
export async function limpiarDatosViejos({ store, ahora = () => Date.now() }) {
  let borrados = 0;
  const { blobs: mensajes } = await store.list({ prefix: "msg/" });
  for (const { key } of mensajes) {
    const v = await store.get(key, { type: "json" });
    if (!v || ahora() - (v.t || 0) > RETENCION_MENSAJES_MS) { await store.delete(key); borrados++; }
  }
  const { blobs: chats } = await store.list({ prefix: "chat/" });
  for (const { key } of chats) {
    const v = await store.get(key, { type: "json" });
    if (v?.actualizado && ahora() - v.actualizado > RETENCION_CHATS_MS) { await store.delete(key); borrados++; }
  }
  return borrados;
}

/** Verifica que el aviso venga de Meta (cabecera X-Hub-Signature-256). */
export function verificarFirma(cuerpoCrudo, cabecera, appSecret) {
  if (!appSecret || !cabecera || !cabecera.startsWith("sha256=")) return false;
  const esperada = createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest("hex");
  const recibida = cabecera.slice(7);
  if (recibida.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(recibida, "hex"), Buffer.from(esperada, "hex"));
}

/** Convierte el aviso de Meta en una lista simple de eventos. */
export function leerEventos(payload) {
  const eventos = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (change.field === "messages") {
        const nombre = value.contacts?.[0]?.profile?.name || "";
        for (const m of value.messages || []) {
          let texto = null;
          if (m.type === "text") texto = m.text?.body ?? null;
          else if (m.type === "button") texto = m.button?.text ?? null;
          else if (m.type === "interactive") {
            texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
          }
          eventos.push({ tipo: "mensaje", de: m.from, id: m.id, texto, formato: m.type, nombre });
        }
      } else if (change.field === "smb_message_echoes") {
        // Coexistencia: alguien del hotel respondió desde la app WhatsApp Business.
        for (const e of value.message_echoes || []) {
          if (e?.to) eventos.push({ tipo: "eco", para: e.to });
        }
      }
    }
  }
  return eventos;
}

/** Cliente mínimo de la Cloud API. Lanza un Error con `codigo` si Meta rechaza el envío. */
export function crearClienteWhatsApp({ token, phoneNumberId, version = VERSION_GRAPH_POR_DEFECTO, fetchFn = fetch }) {
  async function llamar(body) {
    const res = await fetchFn(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `WhatsApp respondió ${res.status}`);
      err.codigo = data?.error?.code;
      throw err;
    }
    return data;
  }
  return {
    enviarTexto: (para, texto) => llamar({ to: para, type: "text", text: { body: texto.slice(0, 4096) } }),
    marcarLeido: (mensajeId) => llamar({ status: "read", message_id: mensajeId }),
    enviarPlantilla: (para, nombre, idioma, parametros) =>
      llamar({
        to: para,
        type: "template",
        template: {
          name: nombre,
          language: { code: idioma },
          components: [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: t })) }],
        },
      }),
  };
}

function textoAviso({ reserva, derivar, de, nombre, ultimoMensaje }) {
  const contacto = `${nombre ? nombre + " · " : ""}+${de}`;
  if (reserva) {
    const r = reserva;
    const total = typeof r.total_estimado === "number" ? "$" + r.total_estimado.toLocaleString("es-AR") : r.total_estimado;
    return [
      "🛎️ Nueva solicitud de reserva",
      `Huésped: ${r.nombre || "-"}`,
      `WhatsApp: ${contacto}`,
      `Ingreso: ${r.ingreso || "-"} · Salida: ${r.salida || "-"} (${r.noches ?? "-"} noches)`,
      `Personas: ${r.personas ?? "-"} · Habitación: ${r.habitacion || "-"}`,
      `Total estimado: ${total ?? "-"}`,
      r.notas ? `Notas: ${r.notas}` : null,
      "Confirmá disponibilidad y pedí la seña.",
    ].filter(Boolean).join("\n");
  }
  return [
    "🙋 Un huésped necesita a una persona",
    `WhatsApp: ${contacto}`,
    `Motivo: ${derivar}`,
    ultimoMensaje ? `Último mensaje: "${ultimoMensaje.slice(0, 200)}"` : null,
  ].filter(Boolean).join("\n");
}

/**
 * Crea la función que procesa cada evento.
 * - store: { get(key, {type:"json"}), setJSON(key, value) }
 * - whatsapp: cliente de crearClienteWhatsApp
 * - preguntar(messages): devuelve el texto de la respuesta del asistente
 * - avisosA: número (formato 549...) que recibe reservas y derivaciones
 * - horario: horario de atención del hotel, para contar las consultas fuera de horario
 */
export function crearProcesador({
  store, whatsapp, preguntar, avisosA, plantillaAviso, idiomaPlantilla = "es_AR",
  horario = { desde: 9, hasta: 21 }, ahora = () => Date.now(),
}) {
  // Suma al resumen del mes. Un error acá nunca corta la atención al huésped.
  async function registrar(cambiar) {
    try {
      const mes = fechaLocal(ahora()).toISOString().slice(0, 7);
      const clave = `stats/${mes}`;
      const stats = (await store.get(clave, { type: "json" })) || estadisticasVacias(mes);
      cambiar(stats);
      await store.setJSON(clave, stats);
    } catch (err) {
      console.error("No se pudieron registrar las estadísticas:", err?.message);
    }
  }

  async function avisar(datos) {
    if (!avisosA) return;
    const texto = textoAviso(datos);
    try {
      await whatsapp.enviarTexto(avisosA, texto);
    } catch (err) {
      // Fuera de la ventana de 24 h, Meta solo permite mensajes con plantilla aprobada.
      if (plantillaAviso) {
        try {
          await whatsapp.enviarPlantilla(avisosA, plantillaAviso, idiomaPlantilla, [texto.replace(/\n+/g, " · ").slice(0, 1000)]);
          return;
        } catch (err2) {
          console.error("No se pudo enviar el aviso con plantilla:", err2.codigo, err2.message);
          return;
        }
      }
      console.error("No se pudo avisar a recepción:", err.codigo, err.message);
    }
  }

  async function leerChat(numero) {
    return (await store.get(`chat/${numero}`, { type: "json" })) || { mensajes: [], pausadoHasta: 0, dia: "", cantidadHoy: 0 };
  }

  async function guardarChat(numero, chat) {
    chat.mensajes = chat.mensajes.slice(-MAX_HISTORIAL);
    chat.actualizado = ahora();
    await store.setJSON(`chat/${numero}`, chat);
  }

  return async function procesar(evento) {
    if (evento.tipo === "eco") {
      const chat = await leerChat(evento.para);
      chat.pausadoHasta = ahora() + PAUSA_SI_RESPONDE_UNA_PERSONA_MS;
      await guardarChat(evento.para, chat);
      return { accion: "pausado" };
    }
    if (evento.tipo !== "mensaje" || !evento.de || !evento.id) return { accion: "ignorado" };

    // Meta puede reenviar el mismo aviso: cada mensaje se procesa una sola vez.
    if (await store.get(`msg/${evento.id}`)) return { accion: "duplicado" };
    await store.setJSON(`msg/${evento.id}`, { t: ahora() });

    whatsapp.marcarLeido(evento.id).catch(() => {});

    const numero = evento.de;
    const chat = await leerChat(numero);
    const hoy = new Date(ahora()).toISOString().slice(0, 10);
    if (chat.dia !== hoy) { chat.dia = hoy; chat.cantidadHoy = 0; }
    chat.cantidadHoy += 1;

    const texto = (evento.texto || "").trim();

    if (texto.toLowerCase() === "/reiniciar") {
      await guardarChat(numero, { mensajes: [], pausadoHasta: 0, dia: hoy, cantidadHoy: chat.cantidadHoy });
      await whatsapp.enviarTexto(numero, TEXTOS.reinicio);
      return { accion: "reiniciado" };
    }

    const local = fechaLocal(ahora());
    const mes = local.toISOString().slice(0, 7);
    const conversacionNueva = chat.ultimoMes !== mes;
    chat.ultimoMes = mes;
    const hora = local.getUTCHours();
    const fueraDeHorario = hora < horario.desde || hora >= horario.hasta;
    const dia = local.toISOString().slice(8, 10);
    await registrar((s) => {
      s.mensajes += 1;
      if (conversacionNueva) s.conversaciones += 1;
      if (fueraDeHorario) s.fueraDeHorario += 1;
      s.porDia[dia] = (s.porDia[dia] || 0) + 1;
      if (texto) s.idiomas[detectarIdioma(texto)] += 1;
      else s.noTexto += 1;
    });

    if (!texto) {
      await guardarChat(numero, chat);
      await whatsapp.enviarTexto(numero, TEXTOS.soloTexto);
      return { accion: "no-texto" };
    }

    chat.mensajes.push({ role: "user", content: texto });

    if (chat.pausadoHasta > ahora()) {
      await guardarChat(numero, chat);
      return { accion: "atiende-una-persona" };
    }
    if (chat.cantidadHoy > MAX_MENSAJES_POR_DIA) {
      await guardarChat(numero, chat);
      return { accion: "limite-diario" };
    }

    const mensajes = limpiarMensajes(chat.mensajes);
    let respuesta;
    try {
      respuesta = await preguntar(mensajes);
    } catch (err) {
      console.error("Error al consultar al asistente:", err?.status, err?.message);
      await guardarChat(numero, chat);
      await whatsapp.enviarTexto(numero, TEXTOS.error);
      await registrar((s) => { s.derivaciones += 1; });
      await avisar({ derivar: "El asistente no pudo responder", de: numero, nombre: evento.nombre, ultimoMensaje: texto });
      return { accion: "error" };
    }

    const { visible, reserva, derivar } = separarMarcas(respuesta);
    chat.mensajes.push({ role: "assistant", content: respuesta });
    await guardarChat(numero, chat);
    if (visible) await whatsapp.enviarTexto(numero, visible);
    await registrar((s) => {
      s.respondidos += 1;
      if (reserva) {
        s.reservas += 1;
        if (typeof reserva.total_estimado === "number") s.valorReservas += reserva.total_estimado;
      }
      if (derivar) s.derivaciones += 1;
    });
    if (reserva || derivar) await avisar({ reserva, derivar, de: numero, nombre: evento.nombre, ultimoMensaje: texto });
    return { accion: "respondido", reserva: !!reserva, derivar: !!derivar };
  };
}
