import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { crearProcesador, leerEventos, verificarFirma, crearClienteWhatsApp, detectarIdioma, limpiarDatosViejos } from "../lib/whatsapp.js";
import { limpiarMensajes, separarMarcas } from "../lib/agente.js";

function storeFalso() {
  const datos = new Map();
  return {
    datos,
    async get(k) { return datos.has(k) ? structuredClone(datos.get(k)) : null; },
    async setJSON(k, v) { datos.set(k, structuredClone(v)); },
    async list({ prefix = "" } = {}) { return { blobs: [...datos.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { datos.delete(k); },
  };
}

function whatsappFalso() {
  const enviados = [];
  return {
    enviados,
    falloTexto: null,
    async enviarTexto(para, texto) {
      if (this.falloTexto && para === this.falloTexto) { const e = new Error("fuera de ventana"); e.codigo = 131047; throw e; }
      enviados.push({ para, texto });
    },
    async marcarLeido() {},
    async enviarPlantilla(para, nombre, idioma, params) { enviados.push({ para, plantilla: nombre, params }); },
  };
}

const mensaje = (id, texto, extra = {}) => ({ tipo: "mensaje", de: "5492230000000", id, texto, formato: "text", nombre: "Lucía", ...extra });

test("verifica la firma de Meta", () => {
  const cuerpo = '{"hola":1}';
  const firma = "sha256=" + createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  assert.equal(verificarFirma(cuerpo, firma, "secreto"), true);
  assert.equal(verificarFirma(cuerpo, firma, "otro"), false);
  assert.equal(verificarFirma(cuerpo, null, "secreto"), false);
  assert.equal(verificarFirma(cuerpo, firma, ""), false);
  assert.equal(verificarFirma(cuerpo, "sha256=abc", "secreto"), false);
});

test("lee mensajes de texto, botones, otros formatos y ecos", () => {
  const payload = {
    entry: [{
      changes: [
        {
          field: "messages",
          value: {
            contacts: [{ profile: { name: "Lucía" } }],
            messages: [
              { from: "549223", id: "a", type: "text", text: { body: "Hola" } },
              { from: "549223", id: "b", type: "audio", audio: {} },
              { from: "549223", id: "c", type: "interactive", interactive: { button_reply: { title: "Reservar" } } },
            ],
            statuses: [{ id: "x" }],
          },
        },
        { field: "smb_message_echoes", value: { message_echoes: [{ to: "549223" }] } },
      ],
    }],
  };
  const ev = leerEventos(payload);
  assert.equal(ev.length, 4);
  assert.deepEqual(ev[0], { tipo: "mensaje", de: "549223", id: "a", texto: "Hola", formato: "text", nombre: "Lucía" });
  assert.equal(ev[1].texto, null);
  assert.equal(ev[2].texto, "Reservar");
  assert.deepEqual(ev[3], { tipo: "eco", para: "549223" });
  assert.deepEqual(leerEventos({}), []);
});

test("une mensajes seguidos del huésped y descarta el saludo inicial del asistente", () => {
  const m = limpiarMensajes([
    { role: "assistant", content: "Hola" },
    { role: "user", content: "Hola" },
    { role: "user", content: "¿tienen lugar?" },
  ]);
  assert.deepEqual(m, [{ role: "user", content: "Hola\n¿tienen lugar?" }]);
  assert.equal(limpiarMensajes([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), null);
});

test("separa las marcas internas del texto visible", () => {
  const r = separarMarcas('Listo, te resumo.\n[[RESERVA]]{"nombre":"Lucía","noches":2}\n[[DERIVAR]]grupo grande');
  assert.equal(r.visible, "Listo, te resumo.");
  assert.deepEqual(r.reserva, { nombre: "Lucía", noches: 2 });
  assert.equal(r.derivar, "grupo grande");
});

test("responde, guarda el historial y avisa a recepción cuando hay reserva", async () => {
  const store = storeFalso();
  const wa = whatsappFalso();
  const vistos = [];
  const procesar = crearProcesador({
    store, whatsapp: wa, avisosA: "5492268516801",
    preguntar: async (msgs) => {
      vistos.push(msgs);
      return msgs.length === 1
        ? "¡Hola! ¿Para qué fechas?"
        : 'Te resumo.\n[[RESERVA]]{"nombre":"Lucía","ingreso":"10/1","salida":"12/1","noches":2,"personas":2,"habitacion":"Doble","total_estimado":190000}';
    },
  });

  assert.equal((await procesar(mensaje("m1", "Hola"))).accion, "respondido");
  const r = await procesar(mensaje("m2", "Del 10 al 12 de enero, 2 personas, Lucía"));
  assert.equal(r.reserva, true);

  assert.equal(vistos[1].length, 3, "el segundo pedido incluye el historial");
  assert.deepEqual(wa.enviados[0], { para: "5492230000000", texto: "¡Hola! ¿Para qué fechas?" });
  assert.equal(wa.enviados[1].texto, "Te resumo.");
  assert.equal(wa.enviados[2].para, "5492268516801");
  assert.match(wa.enviados[2].texto, /Nueva solicitud de reserva/);
  assert.match(wa.enviados[2].texto, /\$190\.000/);
  assert.match(wa.enviados[2].texto, /\+5492230000000/);
});

test("no procesa dos veces el mismo mensaje", async () => {
  const wa = whatsappFalso();
  let llamadas = 0;
  const procesar = crearProcesador({ store: storeFalso(), whatsapp: wa, preguntar: async () => { llamadas++; return "Hola"; } });
  await procesar(mensaje("dup", "Hola"));
  assert.equal((await procesar(mensaje("dup", "Hola"))).accion, "duplicado");
  assert.equal(llamadas, 1);
});

test("si responde una persona del hotel, el asistente se calla en ese chat", async () => {
  const wa = whatsappFalso();
  let ahora = 1_000_000;
  let llamadas = 0;
  const procesar = crearProcesador({ store: storeFalso(), whatsapp: wa, preguntar: async () => { llamadas++; return "Hola"; }, ahora: () => ahora });
  await procesar({ tipo: "eco", para: "5492230000000" });
  assert.equal((await procesar(mensaje("p1", "¿Siguen ahí?"))).accion, "atiende-una-persona");
  assert.equal(llamadas, 0);
  ahora += 13 * 3600_000;
  assert.equal((await procesar(mensaje("p2", "Hola de nuevo"))).accion, "respondido");
});

test("pide texto cuando llega un audio y permite reiniciar la conversación", async () => {
  const store = storeFalso();
  const wa = whatsappFalso();
  const procesar = crearProcesador({ store, whatsapp: wa, preguntar: async () => "Hola" });
  assert.equal((await procesar(mensaje("au", null, { formato: "audio" }))).accion, "no-texto");
  assert.match(wa.enviados[0].texto, /mensajes escritos/);
  await procesar(mensaje("t1", "Hola"));
  assert.equal((await procesar(mensaje("t2", "/reiniciar"))).accion, "reiniciado");
  const chat = await store.get("chat/5492230000000");
  assert.equal(chat.mensajes.length, 0);
});

test("si la IA falla, avisa al huésped y a recepción", async () => {
  const wa = whatsappFalso();
  const procesar = crearProcesador({
    store: storeFalso(), whatsapp: wa, avisosA: "5492268516801",
    preguntar: async () => { throw Object.assign(new Error("caída"), { status: 500 }); },
  });
  assert.equal((await procesar(mensaje("e1", "Hola"))).accion, "error");
  assert.match(wa.enviados[0].texto, /problema/);
  assert.match(wa.enviados[1].texto, /necesita a una persona/);
});

test("usa la plantilla aprobada cuando el aviso cae fuera de la ventana de 24 h", async () => {
  const wa = whatsappFalso();
  wa.falloTexto = "5492268516801";
  const procesar = crearProcesador({
    store: storeFalso(), whatsapp: wa, avisosA: "5492268516801", plantillaAviso: "aviso_recepcion",
    preguntar: async () => "Te derivo.\n[[DERIVAR]]reclamo",
  });
  await procesar(mensaje("v1", "Quiero hacer un reclamo"));
  const aviso = wa.enviados.find((e) => e.plantilla);
  assert.equal(aviso.plantilla, "aviso_recepcion");
  assert.match(aviso.params[0], /reclamo/);
});

test("el cliente de WhatsApp arma bien el pedido a Meta y reporta errores", async () => {
  const pedidos = [];
  const fetchFn = async (url, opts) => {
    pedidos.push({ url, opts });
    if (JSON.parse(opts.body).to === "malo") return { ok: false, status: 400, json: async () => ({ error: { message: "x", code: 131047 } }) };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid" }] }) };
  };
  const wa = crearClienteWhatsApp({ token: "T", phoneNumberId: "123", version: "v23.0", fetchFn });
  await wa.enviarTexto("549", "Hola");
  assert.equal(pedidos[0].url, "https://graph.facebook.com/v23.0/123/messages");
  assert.equal(pedidos[0].opts.headers.Authorization, "Bearer T");
  assert.deepEqual(JSON.parse(pedidos[0].opts.body), { messaging_product: "whatsapp", to: "549", type: "text", text: { body: "Hola" } });
  await assert.rejects(() => wa.enviarTexto("malo", "x"), (e) => e.codigo === 131047);
});

test("detecta el idioma del mensaje", () => {
  assert.equal(detectarIdioma("Olá! Vocês aceitam cachorro?"), "pt");
  assert.equal(detectarIdioma("Hi, do you have a room?"), "en");
  assert.equal(detectarIdioma("Hola, ¿tienen lugar?"), "es");
});

test("arma las estadísticas del mes para el reporte", async () => {
  const store = storeFalso();
  // 7 de octubre de 2026, 02:00 en Argentina (05:00 UTC): fuera de horario.
  let ahora = Date.UTC(2026, 9, 7, 5, 0);
  const procesar = crearProcesador({
    store, whatsapp: whatsappFalso(), ahora: () => ahora,
    preguntar: async (m) => (m.length === 1 ? "Hola" : 'Listo.\n[[RESERVA]]{"nombre":"Ana","total_estimado":250000}'),
  });
  await procesar(mensaje("s1", "Hola"));
  ahora = Date.UTC(2026, 9, 7, 15, 0); // 12:00 en Argentina
  await procesar(mensaje("s2", "Reservo para 2"));
  await procesar(mensaje("s3", "Olá, tem quarto?", { de: "5511999999999" }));
  await procesar(mensaje("s4", null, { formato: "audio" }));

  const s = await store.get("stats/2026-10");
  assert.equal(s.mensajes, 4);
  assert.equal(s.conversaciones, 2);
  assert.equal(s.fueraDeHorario, 1);
  assert.equal(s.respondidos, 3);
  assert.equal(s.reservas, 1);
  assert.equal(s.valorReservas, 250000);
  assert.equal(s.idiomas.pt, 1);
  assert.equal(s.noTexto, 1);
  assert.equal(s.porDia["07"], 4);
});

test("borra los datos viejos según la política de privacidad", async () => {
  const store = storeFalso();
  const hoy = Date.UTC(2026, 9, 7);
  const dia = 24 * 3600_000;
  await store.setJSON("msg/viejo", { t: hoy - 8 * dia });
  await store.setJSON("msg/nuevo", { t: hoy - dia });
  await store.setJSON("chat/inactivo", { mensajes: [], actualizado: hoy - 400 * dia });
  await store.setJSON("chat/activo", { mensajes: [], actualizado: hoy - 10 * dia });
  await store.setJSON("stats/2025-01", { mensajes: 3 });
  const borrados = await limpiarDatosViejos({ store, ahora: () => hoy });
  assert.equal(borrados, 2);
  assert.deepEqual([...store.datos.keys()].sort(), ["chat/activo", "msg/nuevo", "stats/2025-01"]);
});
