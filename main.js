/* CFMTS Labs — interacciones de la landing */
(function () {
  "use strict";

  // ⚙️ Completá con tu número de WhatsApp: código de país + área + número, sin "+" ni espacios.
  // Ejemplo para Mar del Plata: "5492231234567"
  var WHATSAPP = "5492268516801";

  function safe(fn, name) {
    try { fn(); } catch (e) { console.error("[cfmts] " + name, e); }
  }

  function initNav() {
    var nav = document.getElementById("nav");
    var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 40); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    var show = function (el) { el.classList.add("is-visible"); };
    if (!("IntersectionObserver" in window)) { items.forEach(show); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -5% 0px" });
    items.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 80 + "ms";
      io.observe(el);
    });
    // Red de seguridad: nada queda oculto.
    setTimeout(function () { items.forEach(show); }, 6000);
  }

  function initPreview() {
    var msgs = document.querySelectorAll("#preview-chat .msg");
    var clock = document.querySelector(".preview__clock");
    if (!msgs.length) return;
    var i = 0;
    var minute = 12;
    function step() {
      if (i < msgs.length) {
        msgs[i].classList.add("is-in");
        i++;
        minute++;
        if (clock) clock.textContent = "03:" + String(minute).padStart(2, "0");
        setTimeout(step, i === msgs.length ? 4200 : 1400);
      } else {
        msgs.forEach(function (m) { m.classList.remove("is-in"); });
        i = 0; minute = 12;
        setTimeout(step, 700);
      }
    }
    setTimeout(step, 600);
  }

  function initCalc() {
    var form = document.getElementById("calc");
    if (!form) return;
    var $ = function (id) { return document.getElementById(id); };
    var money = function (n) { return "$" + Math.round(n).toLocaleString("es-AR"); };
    function update() {
      var consultas = +$("c-consultas").value;
      var tarde = +$("c-tarde").value / 100;
      var conv = +$("c-conversion").value / 100;
      var ticket = +$("c-ticket").value;
      $("o-consultas").textContent = consultas;
      $("o-tarde").textContent = Math.round(tarde * 100) + "%";
      $("o-conversion").textContent = Math.round(conv * 100) + "%";
      $("o-ticket").textContent = money(ticket);
      var reservas = consultas * 30 * tarde * conv;
      $("calc-reservas").textContent = Math.round(reservas);
      $("calc-total").textContent = money(reservas * ticket);
    }
    form.addEventListener("input", update);
    update();
  }

  function initContact() {
    var form = document.getElementById("contact-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var text = "Hola CFMTS Labs! Soy " + d.get("nombre") + ", de " + d.get("hotel") +
        " (" + d.get("habitaciones") + " habitaciones). " + (d.get("mensaje") || "Quiero coordinar el diagnóstico.");
      if (!WHATSAPP) {
        alert("Falta configurar el número de WhatsApp de la agencia en main.js.");
        return;
      }
      window.open("https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(text), "_blank", "noopener");
    });
  }

  function init() {
    safe(initNav, "nav");
    safe(initReveal, "reveal");
    safe(initPreview, "preview");
    safe(initCalc, "calc");
    safe(initContact, "contact");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
