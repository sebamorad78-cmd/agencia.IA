/* Demo del agente de hotel de CFMTS Labs.
 * Usa la IA real vía /api/chat si está configurada; si no, un motor local gratuito. */
(function () {
  "use strict";

  var FALLBACK_HOTEL = null; // se completa con hotel.json
  var history = [];
  var mode = "checking"; // "ai" | "local" | "checking"
  var local = { step: null, data: {} };
  var busy = false;

  var $ = function (id) { return document.getElementById(id); };
  var chatEl = $("chat");

  function safe(fn, name) {
    try { fn(); } catch (e) { console.error("[demo] " + name, e); }
  }

  function fmt(n) {
    return "$" + Math.round(n).toLocaleString("es-AR");
  }

  function time() {
    var d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ---------- UI ---------- */

  function addBubble(role, text) {
    var b = document.createElement("div");
    b.className = "bubble bubble--" + (role === "user" ? "out" : "in");
    var p = document.createElement("p");
    p.textContent = text;
    var t = document.createElement("span");
    t.className = "bubble__time";
    t.textContent = time() + (role === "user" ? " ✓✓" : "");
    b.appendChild(p);
    b.appendChild(t);
    chatEl.appendChild(b);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function typing(on) {
    var el = $("typing");
    if (on && !el) {
      el = document.createElement("div");
      el.id = "typing";
      el.className = "bubble bubble--in bubble--typing";
      el.innerHTML = "<span></span><span></span><span></span>";
      chatEl.appendChild(el);
      chatEl.scrollTop = chatEl.scrollHeight;
    } else if (!on && el) {
      el.remove();
    }
  }

  function setMode(m) {
    mode = m;
    var badge = $("mode-badge");
    badge.textContent = m === "ai" ? "en línea · IA real" : "en línea · modo demo";
    badge.title = m === "ai"
      ? "Responde un modelo de IA real"
      : "Motor de respuestas local, sin costo. Configurá la API para usar IA real.";
  }

  function addPanelItem(kind, payload) {
    var wrap = $("panel-items");
    var empty = wrap.querySelector(".panel__empty");
    if (empty) empty.remove();
    var card = document.createElement("div");
    card.className = "ticket ticket--" + kind;
    var title = document.createElement("strong");
    var list = document.createElement("dl");

    if (kind === "reserva") {
      title.textContent = "Nueva solicitud de reserva";
      var rows = [
        ["Huésped", payload.nombre],
        ["Ingreso", payload.ingreso],
        ["Salida", payload.salida],
        ["Noches", payload.noches],
        ["Personas", payload.personas],
        ["Habitación", payload.habitacion],
        ["Total estimado", typeof payload.total_estimado === "number" ? fmt(payload.total_estimado) : payload.total_estimado],
        ["Notas", payload.notas]
      ];
      rows.forEach(function (r) {
        if (r[1] === undefined || r[1] === null || r[1] === "") return;
        var dt = document.createElement("dt"); dt.textContent = r[0];
        var dd = document.createElement("dd"); dd.textContent = String(r[1]);
        list.appendChild(dt); list.appendChild(dd);
      });
    } else {
      title.textContent = "Derivado a recepción";
      var dt2 = document.createElement("dt"); dt2.textContent = "Motivo";
      var dd2 = document.createElement("dd"); dd2.textContent = payload;
      list.appendChild(dt2); list.appendChild(dd2);
    }
    var stamp = document.createElement("span");
    stamp.className = "ticket__time";
    stamp.textContent = "Recibido " + time();
    card.appendChild(title);
    card.appendChild(stamp);
    card.appendChild(list);
    wrap.prepend(card);
  }

  /* Separa las marcas [[RESERVA]] / [[DERIVAR]] del texto visible. */
  function handleReply(raw) {
    var visible = [];
    raw.split("\n").forEach(function (line) {
      var t = line.trim();
      if (t.indexOf("[[RESERVA]]") === 0) {
        try { addPanelItem("reserva", JSON.parse(t.slice(11))); }
        catch (e) { console.warn("[demo] reserva ilegible", e); }
      } else if (t.indexOf("[[DERIVAR]]") === 0) {
        addPanelItem("derivar", t.slice(11).trim() || "Pedido del huésped");
      } else {
        visible.push(line);
      }
    });
    var text = visible.join("\n").trim();
    if (text) addBubble("assistant", text);
    history.push({ role: "assistant", content: raw });
  }

  /* ---------- Motor local (sin costo) ---------- */

  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /* Devuelve "es", "pt", "en" o null si el mensaje no da pistas claras. */
  function detectLang(s) {
    var n = norm(s);
    if (/\b(ola|oi|voces|voce|cachorro|quanto|obrigad|quarto|diaria|gostaria|estacionamento|tem|pessoas|noites|falar)\b/.test(n)) return "pt";
    if (/\b(hello|hi|room|price|how much|do you|parking|dog|book|available|thanks|night|nights|people|guests)\b/.test(n)) return "en";
    if (/\b(hola|quiero|tienen|cuanto|gracias|hablar|personas|noches|habitacion|cochera|mascota|precio|reservar)\b/.test(n)) return "es";
    return null;
  }

  var T = {
    es: {
      hola: "¡Hola! 👋 Soy el asistente del " + "{hotel}" + ". Te puedo pasar tarifas, contarte los servicios o tomar tu reserva. ¿En qué te ayudo?",
      precios: "Estas son las tarifas por noche de temporada alta, con desayuno:\n{lista}\n¿Para qué fechas y cuántas personas sería?",
      fallback: "Esa consulta la paso a recepción para que te respondan bien. Mientras tanto, ¿te paso tarifas o te ayudo con una reserva?",
      humano: "¡Claro! Te derivo con recepción y en breve te escribe una persona. 🙌",
      pedirFechas: "¡Genial! ¿Qué fecha de ingreso y de salida tenés en mente? (ej: del 10/1 al 15/1)",
      pedirPersonas: "Perfecto. ¿Cuántas personas son?",
      pedirHab: "Para {p} personas te recomiendo:{opciones}¿Cuál preferís?",
      pedirNombre: "¡Buenísimo! ¿A nombre de quién hago la solicitud?",
      resumen: "Listo, {nombre}. Te resumo: {hab}, del {in} al {out} ({n} noches), {p} personas. Total estimado: {total}. Recepción te confirma la disponibilidad en breve y te pasa los datos para la seña del 30%. 🌊",
      noFechas: "No llegué a leer bien las fechas. ¿Me las pasás así: del 10/1 al 15/1?"
    },
    pt: {
      hola: "Olá! 👋 Sou o assistente do {hotel}. Posso passar as tarifas, contar sobre os serviços ou fazer sua reserva. Como posso ajudar?",
      precios: "Estas são as tarifas por noite na alta temporada, com café da manhã:\n{lista}\nPara quais datas e quantas pessoas?",
      fallback: "Vou passar essa pergunta para a recepção. Enquanto isso, quer as tarifas ou fazer uma reserva?",
      humano: "Claro! Vou te passar para a recepção, uma pessoa vai te responder em breve. 🙌",
      pedirFechas: "Ótimo! Quais são as datas de entrada e saída? (ex: de 10/1 a 15/1)",
      pedirPersonas: "Perfeito. Quantas pessoas?",
      pedirHab: "Para {p} pessoas recomendo:{opciones}Qual você prefere?",
      pedirNombre: "Ótimo! Em nome de quem faço a reserva?",
      resumen: "Pronto, {nombre}. Resumo: {hab}, de {in} a {out} ({n} noites), {p} pessoas. Total estimado: {total}. A recepção confirma a disponibilidade em breve. 🌊",
      noFechas: "Não entendi as datas. Pode me mandar assim: de 10/1 a 15/1?"
    },
    en: {
      hola: "Hi! 👋 I'm the {hotel} assistant. I can share rates, tell you about our services or take your booking. How can I help?",
      precios: "These are our high-season nightly rates, breakfast included:\n{lista}\nWhich dates and how many guests?",
      fallback: "I'll pass that question to the front desk. Meanwhile, would you like our rates or to make a booking?",
      humano: "Sure! I'm handing you over to the front desk, someone will reply shortly. 🙌",
      pedirFechas: "Great! What are your check-in and check-out dates? (e.g. 1/10 to 1/15)",
      pedirPersonas: "Perfect. How many guests?",
      pedirHab: "For {p} guests I recommend:{opciones}Which one do you prefer?",
      pedirNombre: "Great! What name should the booking be under?",
      resumen: "All set, {nombre}. Summary: {hab}, {in} to {out} ({n} nights), {p} guests. Estimated total: {total}. The front desk will confirm availability shortly. 🌊",
      noFechas: "I couldn't read the dates. Could you send them like: 1/10 to 1/15?"
    }
  };

  function tpl(s, vars) {
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ""; });
  }

  function parseDates(text, lang) {
    var m = text.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*\d{2,4})?\D+?(\d{1,2})\s*[\/\-]\s*(\d{1,2})/);
    var year = new Date().getFullYear();
    var a, b;
    if (m) {
      var n = m.slice(1, 5).map(Number);
      // En inglés el formato es mes/día.
      if (lang === "en") { a = new Date(year, n[0] - 1, n[1]); b = new Date(year, n[2] - 1, n[3]); }
      else { a = new Date(year, n[1] - 1, n[0]); b = new Date(year, n[3] - 1, n[2]); }
    } else {
      // "del 10 al 15 de enero"
      var meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      var m2 = norm(text).match(/(\d{1,2})\D{1,6}(\d{1,2})\s*de\s*([a-z]+)/);
      if (!m2) return null;
      var mes = meses.indexOf(m2[3]);
      if (mes < 0) return null;
      a = new Date(year, mes, Number(m2[1]));
      b = new Date(year, mes, Number(m2[2]));
    }
    if (isNaN(a) || isNaN(b)) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (a < today) { a.setFullYear(year + 1); b.setFullYear(year + 1); }
    if (b <= a) b.setFullYear(b.getFullYear() + 1);
    var nights = Math.round((b - a) / 86400000);
    if (nights < 1 || nights > 60) return null;
    var f = function (d) { return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear(); };
    return { ingreso: f(a), salida: f(b), noches: nights };
  }

  function parsePeople(text) {
    var n = norm(text).trim();
    var ok = function (v) { v = Number(v); return v > 0 && v < 20 ? v : null; };
    if (/\b(pareja|casal|couple)\b/.test(n)) return 2;
    var m = n.match(/(\d+)\s*(personas?|pax|adultos?|pessoas?|people|guests?|huespedes)/) ||
      n.match(/\b(?:para|somos|for|we are|seremos)\s+(\d+)\b/) ||
      n.match(/^(\d+)$/);
    if (m) return ok(m[1]);
    var words = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, um: 1, duas: 2, quatro: 4, one: 1, two: 2, three: 3, four: 4 };
    for (var w in words) {
      if (new RegExp("^" + w + "$|\\b(para|somos|for|seremos)\\s+" + w + "\\b|\\b" + w + "\\s+(personas|pessoas|people|guests)").test(n)) return words[w];
    }
    return null;
  }

  function roomFor(text, people) {
    var n = norm(text);
    var rooms = FALLBACK_HOTEL.habitaciones;
    if (/familiar|family|famil/.test(n)) return rooms.find(function (r) { return r.id === "familiar"; });
    if (/triple/.test(n)) return rooms.find(function (r) { return r.id === "triple"; });
    if (/mar|vista|sea|ocean/.test(n)) return rooms.find(function (r) { return r.id === "doble_mar"; });
    if (/estandar|standard|padrao|comun|normal/.test(n)) return rooms.find(function (r) { return r.id === "doble"; });
    if (people) {
      var fits = rooms.filter(function (r) { return r.capacidad >= people; });
      if (fits.length === 1) return fits[0];
    }
    return null;
  }

  function listRooms(people) {
    return FALLBACK_HOTEL.habitaciones
      .filter(function (r) { return !people || r.capacidad >= people; })
      .map(function (r) { return "• " + r.nombre + " (hasta " + r.capacidad + "): " + fmt(r.precio); })
      .join("\n");
  }

  function localReply(text) {
    // Respondemos en el idioma del último mensaje que lo deja claro.
    var detected = detectLang(text);
    var lang = detected || local.lang || "es";
    local.lang = lang;
    var L = T[lang];
    var n = norm(text);
    var H = FALLBACK_HOTEL;
    var s = Object.assign({}, H.servicios, lang !== "es" ? H["servicios_" + lang] : null);

    if (/humano|persona|recepcion|atendente|human|someone|reclamo|queja/.test(n) && !local.step) {
      return L.humano + "\n[[DERIVAR]]El huésped pidió hablar con una persona";
    }

    // Flujo de reserva en curso
    if (local.step) {
      var d = local.data;
      if (local.step === "fechas") {
        var dates = parseDates(text, lang);
        if (!dates) return L.noFechas;
        Object.assign(d, dates);
        var p0 = parsePeople(text.replace(/\d{1,2}\s*[\/\-]\s*\d{1,2}/g, ""));
        if (p0) d.personas = p0;
      } else if (local.step === "personas") {
        d.personas = parsePeople(text) || d.personas;
        if (!d.personas) return L.pedirPersonas;
      } else if (local.step === "hab") {
        d.hab = roomFor(text, d.personas);
        if (!d.hab) return tpl(L.pedirHab, { p: d.personas, opciones: "\n" + listRooms(d.personas) + "\n" });
      } else if (local.step === "nombre") {
        d.nombre = text.replace(/^(soy|me llamo|a nombre de|mi nombre es|meu nome e|my name is|i am|i'm)\s+/i, "").trim().slice(0, 60);
      }
      return nextBookingStep(L);
    }

    if (/reserv|book|disponib|lugar|tienen para|quero|quiero ir/.test(n)) {
      local.step = "fechas";
      var dd = parseDates(text, lang);
      if (dd) {
        Object.assign(local.data, dd);
        var pp = parsePeople(text.replace(/\d{1,2}\s*[\/\-]\s*\d{1,2}/g, ""));
        if (pp) local.data.personas = pp;
      }
      return nextBookingStep(L);
    }
    if (/precio|tarifa|cuanto|sale|cost|price|rate|quanto|valor|diaria/.test(n)) return tpl(L.precios, { lista: listRooms() });
    if (/cochera|estacion|auto|parking|garage|carro|estacionamento/.test(n)) return s.cochera;
    if (/mascota|perro|gato|pet|dog|cachorro|animal/.test(n)) return s.mascotas;
    if (/desayuno|breakfast|cafe da manha/.test(n)) return s.desayuno;
    if (/pileta|piscina|pool/.test(n)) return s.pileta;
    if (/wifi|internet/.test(n)) return s.wifi;
    if (/playa|carpa|balneario|beach|praia/.test(n)) return s.playa;
    if (/cancel/.test(n)) return s.cancelacion;
    if (/pago|sena|transferencia|tarjeta|pay|pagamento/.test(n)) return s.pagos;
    if (/check|horario|hora|entrada|salida/.test(n)) return "Check-in desde las " + H.checkin + " y check-out hasta las " + H.checkout + ".";
    if (/donde|ubicac|direcc|where|onde|location/.test(n)) return H.direccion + ".";
    if (/minim/.test(n)) return s.estadia_minima;
    if (/^(hola|buenas|buen dia|ola|oi|hello|hi|hey)\b/.test(n)) return tpl(L.hola, { hotel: H.nombre });
    if (/gracias|obrigad|thank/.test(n)) return lang === "pt" ? "De nada! Qualquer coisa, estou aqui. 😊" : lang === "en" ? "You're welcome! I'm here if you need anything. 😊" : "¡De nada! Cualquier cosa, acá estoy. 😊";
    return L.fallback + "\n[[DERIVAR]]Consulta sin respuesta automática: \"" + text.slice(0, 80) + "\"";
  }

  function nextBookingStep(L) {
    var d = local.data;
    if (!d.ingreso) { local.step = "fechas"; return L.pedirFechas; }
    if (!d.personas) { local.step = "personas"; return L.pedirPersonas; }
    if (!d.hab) {
      d.hab = roomFor("", d.personas);
      if (!d.hab) { local.step = "hab"; return tpl(L.pedirHab, { p: d.personas, opciones: "\n" + listRooms(d.personas) + "\n" }); }
    }
    if (!d.nombre) { local.step = "nombre"; return L.pedirNombre; }
    var total = d.hab.precio * d.noches;
    var summary = tpl(L.resumen, {
      nombre: d.nombre, hab: d.hab.nombre, "in": d.ingreso, out: d.salida, n: d.noches, p: d.personas, total: fmt(total)
    });
    var payload = {
      nombre: d.nombre, ingreso: d.ingreso, salida: d.salida, noches: d.noches,
      personas: d.personas, habitacion: d.hab.nombre, total_estimado: total,
      notas: d.noches < 3 ? "Revisar estadía mínima si es enero/febrero" : ""
    };
    local.step = null;
    local.data = {};
    return summary + "\n[[RESERVA]]" + JSON.stringify(payload);
  }

  /* ---------- Envío ---------- */

  function ask(text) {
    if (mode === "local") {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(localReply(text)); }, 600 + Math.random() * 500);
      });
    }
    return fetch("../api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (data.offline) { setMode("local"); return localReply(text); }
        if (!r.ok || !data.reply) throw new Error(data.error || "Error " + r.status);
        return data.reply;
      });
    }).catch(function (err) {
      // Sin backend (por ejemplo, hosting estático): seguimos con el motor local.
      if (mode === "checking" || err instanceof TypeError) { setMode("local"); return localReply(text); }
      return "⚠️ " + err.message;
    });
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy || !FALLBACK_HOTEL) return;
    busy = true;
    addBubble("user", text);
    history.push({ role: "user", content: text });
    typing(true);
    ask(text).then(function (reply) {
      typing(false);
      handleReply(reply);
    }).finally(function () { busy = false; });
  }

  function reset() {
    history = [];
    local = { step: null, data: {} };
    chatEl.innerHTML = "";
    $("panel-items").innerHTML = '<div class="panel__empty">Todavía no hay solicitudes. Pedí una reserva en el chat.</div>';
    greet();
  }

  function greet() {
    var hello = "¡Hola! 👋 Soy el asistente virtual del " + FALLBACK_HOTEL.nombre + ". Te paso tarifas, te cuento los servicios o tomo tu reserva, a cualquier hora. ¿En qué te ayudo?";
    addBubble("assistant", hello);
    history.push({ role: "assistant", content: hello });
  }

  function init() {
    fetch("hotel.json?v=20261005")
      .then(function (r) { return r.json(); })
      .then(function (h) {
        FALLBACK_HOTEL = h;
        $("hotel-nombre").textContent = h.nombre;
        $("hotel-aviso").textContent = h.aviso;
        // Si la conversación arranca con el saludo del asistente, la API lo descarta (debe empezar el huésped).
        greet();
        return fetch("../api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      })
      .then(function (r) { return r && r.json(); })
      .then(function (data) { setMode(data && data.offline ? "local" : "ai"); })
      .catch(function () { if (FALLBACK_HOTEL) setMode("local"); else addBubble("assistant", "No pude cargar los datos del hotel. Abrí la demo desde la web publicada."); });

    $("composer").addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("input");
      send(input.value);
      input.value = "";
    });
    $("chips").addEventListener("click", function (e) {
      if (e.target.tagName === "BUTTON") send(e.target.textContent);
    });
    $("reset").addEventListener("click", reset);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { safe(init, "init"); });
  else safe(init, "init");
})();
