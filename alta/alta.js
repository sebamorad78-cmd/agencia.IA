/* Formulario de alta de hotel: arma la configuración del asistente y la envía por Netlify Forms. */
(function () {
  "use strict";

  var CLAVE_BORRADOR = "cfmts-alta-borrador";
  var form = document.getElementById("alta");
  var $ = function (id) { return document.getElementById(id); };

  function slug(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "habitacion";
  }

  function valor(nombre) {
    var el = form.elements[nombre];
    return el ? String(el.value || "").trim() : "";
  }

  /* ---------- Filas repetibles ---------- */

  function agregarFila(contenedor, plantilla, datos) {
    var nodo = $(plantilla).content.firstElementChild.cloneNode(true);
    nodo.querySelectorAll("[data-k]").forEach(function (input) {
      if (datos && datos[input.dataset.k] != null) input.value = datos[input.dataset.k];
    });
    nodo.querySelector(".row__del").addEventListener("click", function () {
      nodo.remove();
      guardarBorrador();
    });
    $(contenedor).appendChild(nodo);
    return nodo;
  }

  function leerFilas(contenedor) {
    return Array.prototype.map.call($(contenedor).children, function (fila) {
      var o = {};
      fila.querySelectorAll("[data-k]").forEach(function (input) { o[input.dataset.k] = input.value.trim(); });
      return o;
    });
  }

  /* ---------- Configuración del asistente ---------- */

  function armarConfiguracion() {
    var habitaciones = leerFilas("habitaciones")
      .filter(function (h) { return h.nombre; })
      .map(function (h) {
        return {
          id: slug(h.nombre),
          nombre: h.nombre,
          capacidad: h.capacidad ? Number(h.capacidad) : null,
          precio: h.precio ? Number(h.precio) : null,
          detalle: h.detalle || "",
        };
      });

    var servicios = {};
    ["desayuno", "cochera", "mascotas", "pileta", "wifi", "playa", "estadia_minima", "pagos", "cancelacion", "otros_servicios"]
      .forEach(function (k) { if (valor(k)) servicios[k] = valor(k); });

    var preguntas = leerFilas("preguntas").filter(function (p) { return p.pregunta && p.respuesta; });

    var tono = valor("trato") === "usted"
      ? "Formal: tratar al huésped de usted."
      : "Cercano: voseo rioplatense.";
    tono += valor("emojis") === "no" ? " Sin emojis." : " Algún emoji con moderación.";
    if (valor("estilo")) tono += " " + valor("estilo");

    var config = {
      nombre: valor("hotel"),
      tipo: valor("tipo"),
      ciudad: valor("ciudad") || "Mar del Plata",
      direccion: valor("direccion"),
      web: valor("web"),
      checkin: valor("checkin"),
      checkout: valor("checkout"),
      moneda: "ARS",
      temporada: valor("temporada"),
      habitaciones: habitaciones,
      servicios: servicios,
      preguntas_frecuentes: preguntas,
      tono: tono,
      horario_atencion: { desde: Number(valor("horario_desde") || 9), hasta: Number(valor("horario_hasta") || 21) },
    };
    Object.keys(config).forEach(function (k) { if (config[k] === "") delete config[k]; });
    return config;
  }

  /* ---------- Borrador local (solo en este dispositivo) ---------- */

  var temporizador;
  function guardarBorrador() {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      var campos = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.type === "hidden" || el.name === "bot-field") return;
        campos[el.name] = el.type === "checkbox" ? el.checked : el.value;
      });
      var borrador = { campos: campos, habitaciones: leerFilas("habitaciones"), preguntas: leerFilas("preguntas") };
      try {
        localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
        $("estado-borrador").textContent = "Borrador guardado";
      } catch (e) { /* sin almacenamiento local: el formulario sigue funcionando */ }
    }, 600);
  }

  function restaurarBorrador() {
    var borrador = null;
    try { borrador = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null"); } catch (e) { borrador = null; }
    if (!borrador) return false;
    Object.keys(borrador.campos || {}).forEach(function (k) {
      var el = form.elements[k];
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!borrador.campos[k];
      else el.value = borrador.campos[k];
    });
    (borrador.habitaciones || []).forEach(function (h) { agregarFila("habitaciones", "tpl-habitacion", h); });
    (borrador.preguntas || []).forEach(function (p) { agregarFila("preguntas", "tpl-pregunta", p); });
    $("estado-borrador").textContent = "Borrador recuperado";
    return true;
  }

  /* ---------- Validación y envío ---------- */

  function validar() {
    var faltan = [];
    ["hotel", "contacto", "whatsapp_avisos"].forEach(function (k) {
      var el = form.elements[k];
      var vacio = !el.value.trim();
      el.setAttribute("aria-invalid", vacio ? "true" : "false");
      if (vacio) faltan.push(el.closest("label").firstChild.textContent.replace("*", "").trim());
    });
    var conPrecio = leerFilas("habitaciones").some(function (h) { return h.nombre && h.precio; });
    if (!conPrecio) faltan.push("al menos una habitación con precio");
    if (!form.elements.acepto.checked) faltan.push("aceptar la política de privacidad");
    return faltan;
  }

  function descargar() {
    var datos = {
      configuracion: armarConfiguracion(),
      contacto: { nombre: valor("contacto"), cargo: valor("cargo"), whatsapp: valor("whatsapp_avisos"), email: valor("email") },
    };
    var blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "alta-" + slug(valor("hotel") || "hotel") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function enviar(e) {
    e.preventDefault();
    $("error").textContent = "";
    var faltan = validar();
    if (faltan.length) {
      $("error").textContent = "Falta completar: " + faltan.join(", ") + ".";
      return;
    }
    $("configuracion").value = JSON.stringify(armarConfiguracion());
    var boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = "Enviando…";

    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(new FormData(form)).toString(),
    }).then(function (r) {
      if (!r.ok) throw new Error("Error " + r.status);
      try { localStorage.removeItem(CLAVE_BORRADOR); } catch (err) { /* nada */ }
      form.hidden = true;
      $("ok").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function () {
      $("error").textContent = "No se pudo enviar. Probá de nuevo o tocá \"Descargar una copia\" y mandánosla por WhatsApp.";
      boton.disabled = false;
      boton.textContent = "Enviar a CFMTS Labs";
    });
  }

  function init() {
    if (!restaurarBorrador()) {
      agregarFila("habitaciones", "tpl-habitacion");
      agregarFila("habitaciones", "tpl-habitacion");
      agregarFila("preguntas", "tpl-pregunta");
      agregarFila("preguntas", "tpl-pregunta");
    }
    $("agregar-habitacion").addEventListener("click", function () { agregarFila("habitaciones", "tpl-habitacion").querySelector("input").focus(); });
    $("agregar-pregunta").addEventListener("click", function () { agregarFila("preguntas", "tpl-pregunta").querySelector("input").focus(); });
    $("descargar").addEventListener("click", descargar);
    form.addEventListener("input", guardarBorrador);
    form.addEventListener("change", guardarBorrador);
    form.addEventListener("submit", enviar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Expuesto para pruebas automáticas.
  window.__cfmtsAlta = { armarConfiguracion: armarConfiguracion, validar: validar };
})();
