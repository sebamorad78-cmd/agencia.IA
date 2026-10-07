/* Reporte mensual: pide los datos a /api/reporte y arma una hoja lista para imprimir. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";
  var IDIOMAS = { es: "Español", pt: "Portugués", en: "Inglés" };

  function num(n) { return Math.round(n).toLocaleString("es-AR"); }
  function pesos(n) { return "$" + num(n); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  function nombreMes(mes) {
    var p = mes.split("-");
    var texto = new Date(Number(p[0]), Number(p[1]) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function diasDelMes(mes) {
    var p = mes.split("-");
    return new Date(Number(p[0]), Number(p[1]), 0).getDate();
  }

  /* Escala con números redondos para el eje vertical. */
  function escala(max) {
    if (max <= 0) return { tope: 4, paso: 1 };
    var bruto = max / 4;
    var potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
    var paso = [1, 2, 5, 10].map(function (m) { return m * potencia; }).find(function (p) { return p >= bruto; });
    return { tope: Math.ceil(max / paso) * paso, paso: paso };
  }

  function el(tag, attrs, texto) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (texto != null) n.textContent = texto;
    return n;
  }

  function graficoDias(stats, mes) {
    var cont = $("grafico");
    cont.innerHTML = "";
    var dias = diasDelMes(mes);
    var valores = [];
    for (var d = 1; d <= dias; d++) valores.push(stats.porDia[String(d).padStart(2, "0")] || 0);
    var max = Math.max.apply(null, valores);
    var e = escala(max);

    var W = 640, H = 200, izq = 34, der = 6, arriba = 16, abajo = 22;
    var ancho = W - izq - der, alto = H - arriba - abajo;
    var franja = ancho / dias;
    var barra = Math.min(24, Math.max(4, franja - 2));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, "aria-hidden": "true" });

    for (var t = 0; t <= e.tope; t += e.paso) {
      var y = arriba + alto - (t / e.tope) * alto;
      svg.appendChild(el("line", { x1: izq, x2: W - der, y1: y, y2: y, class: "grilla" }));
      svg.appendChild(el("text", { x: izq - 6, y: y + 3, "text-anchor": "end", class: "eje" }, num(t)));
    }

    var iMax = valores.indexOf(max);
    valores.forEach(function (v, i) {
      var x = izq + i * franja + (franja - barra) / 2;
      if (v > 0) {
        var h = (v / e.tope) * alto;
        var r = Math.min(4, h, barra / 2);
        var base = arriba + alto;
        // Extremo redondeado de 4 px arriba, recto sobre la línea de base.
        var d = "M" + x + "," + base + "V" + (base - h + r) + "Q" + x + "," + (base - h) + " " + (x + r) + "," + (base - h) +
          "H" + (x + barra - r) + "Q" + (x + barra) + "," + (base - h) + " " + (x + barra) + "," + (base - h + r) + "V" + base + "Z";
        var p = el("path", { d: d, class: "barra" });
        p.appendChild(el("title", null, "Día " + (i + 1) + ": " + num(v) + " mensajes"));
        svg.appendChild(p);
        if (i === iMax) svg.appendChild(el("text", { x: x + barra / 2, y: base - h - 5, "text-anchor": "middle", class: "valor" }, num(v)));
      }
      if (i === 0 || (i + 1) % 5 === 0) {
        svg.appendChild(el("text", { x: x + barra / 2, y: H - 6, "text-anchor": "middle", class: "eje" }, String(i + 1)));
      }
    });
    cont.appendChild(svg);
    cont.setAttribute("aria-label", "Mensajes por día. Máximo: " + num(max) + " el día " + (iMax + 1) + ".");

    var tbody = $("tabla-dias").querySelector("tbody");
    tbody.innerHTML = "";
    valores.forEach(function (v, i) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (i + 1) + "</td><td>" + v + "</td>";
      tbody.appendChild(tr);
    });
    return { max: max, dia: iMax + 1 };
  }

  function render(datos) {
    var s = datos.stats;
    var mes = datos.mes;
    var nombre = nombreMes(mes);
    var mesCorto = nombre.split(" ")[0].toLowerCase();

    $("r-hotel").textContent = datos.hotel;
    $("r-mes").textContent = nombre;
    $("k-mensajes").textContent = num(s.mensajes);
    $("k-conversaciones").textContent = num(s.conversaciones);
    $("k-fuera").textContent = pct(s.fueraDeHorario, s.mensajes) + "%";
    $("k-fuera-l").textContent = "Fuera del horario de recepción (" + num(s.fueraDeHorario) + " mensajes)";
    $("k-reservas").textContent = num(s.reservas);
    $("k-valor").textContent = pesos(s.valorReservas);
    $("k-derivaciones").textContent = num(s.derivaciones);

    $("r-titular").textContent = "En " + mesCorto + ", el asistente atendió " + num(s.mensajes) + " mensajes de " +
      num(s.conversaciones) + " huéspedes, y el " + pct(s.fueraDeHorario, s.mensajes) + "% llegó cuando recepción no estaba.";

    var pico = graficoDias(s, mes);

    var totalIdiomas = (s.idiomas.es || 0) + (s.idiomas.pt || 0) + (s.idiomas.en || 0);
    var cont = $("idiomas");
    cont.innerHTML = "";
    Object.keys(IDIOMAS).forEach(function (k) {
      var p = pct(s.idiomas[k] || 0, totalIdiomas);
      var fila = document.createElement("div");
      fila.className = "idioma";
      fila.innerHTML = "<span>" + IDIOMAS[k] + "</span><div class='idioma__pista'><div class='idioma__barra' style='width:" + p + "%'></div></div><span class='idioma__pct'>" + p + "%</span>";
      cont.appendChild(fila);
    });

    var extranjeros = pct((s.idiomas.pt || 0) + (s.idiomas.en || 0), totalIdiomas);
    var claves = [
      num(s.fueraDeHorario) + " mensajes llegaron fuera del horario de recepción y recibieron respuesta al instante.",
      s.reservas
        ? "Se armaron " + num(s.reservas) + " solicitudes de reserva por un valor estimado de " + pesos(s.valorReservas) + ", listas para que recepción confirme."
        : "Todavía no hubo solicitudes de reserva completas este mes.",
      extranjeros ? "El " + extranjeros + "% de los mensajes fue en portugués o inglés, y se respondió en el mismo idioma." : null,
      num(s.derivaciones) + " conversaciones se derivaron a una persona del hotel, con el contexto completo.",
      pico.max ? "El día con más movimiento fue el " + pico.dia + ", con " + num(pico.max) + " mensajes." : null,
    ].filter(Boolean);
    var ul = $("claves");
    ul.innerHTML = "";
    claves.forEach(function (c) { var li = document.createElement("li"); li.textContent = c; ul.appendChild(li); });

    $("hoja").hidden = false;
    $("imprimir").disabled = false;
    document.title = "Reporte " + nombre + " · " + datos.hotel;
  }

  function ejemplo(mes) {
    var dias = diasDelMes(mes);
    var porDia = {};
    var total = 0;
    for (var d = 1; d <= dias; d++) {
      var finde = [0, 5, 6].indexOf(new Date(mes + "-" + String(d).padStart(2, "0") + "T12:00:00").getDay()) >= 0;
      var v = Math.round(9 + (d / dias) * 10 + (finde ? 8 : 0) + ((d * 7) % 5));
      porDia[String(d).padStart(2, "0")] = v;
      total += v;
    }
    return {
      hotel: "Hotel Brisa Atlántica (ejemplo)",
      mes: mes,
      stats: {
        mes: mes, mensajes: total, respondidos: total - 6, conversaciones: Math.round(total / 4.2),
        fueraDeHorario: Math.round(total * 0.38), reservas: 23, valorReservas: 9480000, derivaciones: 14, noTexto: 6,
        idiomas: { es: Math.round(total * 0.74), pt: Math.round(total * 0.21), en: Math.round(total * 0.05) }, porDia: porDia,
      },
    };
  }

  function mostrarMensaje(t) { $("msg").textContent = t || ""; }

  function init() {
    var hoy = new Date();
    $("mes").value = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0");

    $("panel").addEventListener("submit", function (e) {
      e.preventDefault();
      mostrarMensaje("Buscando datos…");
      fetch("../api/reporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: $("clave").value, mes: $("mes").value }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || "No se pudo obtener el reporte");
          if (!d.stats) throw new Error("Todavía no hay datos para " + nombreMes(d.mes) + ".");
          mostrarMensaje("");
          render(d);
        });
      }).catch(function (err) { mostrarMensaje(err.message); });
    });

    $("ejemplo").addEventListener("click", function () {
      mostrarMensaje("Datos de ejemplo: así se ve el reporte que recibe un hotel.");
      render(ejemplo($("mes").value || "2027-01"));
    });
    $("imprimir").addEventListener("click", function () { window.print(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
