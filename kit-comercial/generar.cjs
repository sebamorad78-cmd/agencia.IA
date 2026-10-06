#!/usr/bin/env node
/*
 * Genera el kit comercial de CFMTS Labs (PDF e imágenes) a partir de las plantillas.
 *
 * Uso:
 *   node generar.cjs                      → kit genérico (tarjeta, marca y propuesta/acuerdo con espacios en blanco)
 *   node generar.cjs --hotel "Hotel Costa" --contacto "Laura Gómez" \
 *     --diag1 "Reciben unas 25 consultas por día en enero." \
 *     --diag2 "Las consultas de la noche se responden a la mañana." \
 *     --diag3 "Muchos huéspedes de Brasil escriben en portugués."
 *                                        → propuesta y acuerdo personalizados para ese hotel
 *
 * Los datos de la agencia (nombre, email, precios) se editan en datos.json.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const QRCode = require("qrcode");

function loadPlaywright() {
  try { return require("playwright"); } catch (_) {
    const globalRoot = execSync("npm root -g").toString().trim();
    return require(path.join(globalRoot, "playwright"));
  }
}

const ROOT = __dirname;
const TPL = path.join(ROOT, "plantillas");
const OUT = path.join(ROOT, "salida");
const datos = JSON.parse(fs.readFileSync(path.join(ROOT, "datos.json"), "utf8"));

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] || "";
  }
  return out;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function slug(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Falta el dato "${k}" para la plantilla`);
    return vars[k];
  });
}

const BLANK = '<span class="blank"></span>';
const WIDE_BLANK = '<span class="blank" style="display:block;width:100%;height:6.5mm"></span>';

function fechaLarga(d = new Date()) {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

async function main() {
  const a = args();
  fs.mkdirSync(path.join(OUT, "marca"), { recursive: true });

  const qr = await QRCode.toString(`https://wa.me/${datos.whatsapp}`, {
    type: "svg", margin: 0, color: { dark: "#12232c", light: "#00000000" },
  });

  const hotel = a.hotel ? esc(a.hotel) : "";
  const vars = {
    nombre: datos.nombre ? esc(datos.nombre) : "Nombre Apellido",
    nombre_campo: datos.nombre ? esc(datos.nombre) : "",
    firma_pie: datos.nombre ? `<b>${esc(datos.nombre)}</b> · CFMTS Labs` : "<b>CFMTS Labs</b>",
    cls_nombre: datos.nombre ? "filled" : "",
    cargo: esc(datos.cargo),
    whatsapp_visible: esc(datos.whatsapp_visible),
    ciudad: esc(datos.ciudad),
    linea_email: datos.email ? `<span><em>Email</em>${esc(datos.email)}</span>` : "",
    linea_web: datos.web ? `<span><em>Web</em>${esc(datos.web)}</span>` : "",
    email_pie: datos.email ? ` · ${esc(datos.email)}` : "",
    web_pie: datos.web ? `${esc(datos.web)} · ` : "",
    qr_whatsapp: qr,
    precio_piloto: String(datos.precio_piloto),
    abono: String(datos.abono),
    fecha: fechaLarga(),
    hotel: hotel || BLANK,
    hotel_corto: a.corto ? esc(a.corto) : (hotel || "tu hotel"),
    hotel_campo: hotel,
    cls_hotel: hotel ? "filled" : "",
    contacto: a.contacto ? esc(a.contacto) : BLANK,
    contacto_campo: a.contacto ? esc(a.contacto) : "",
    cls_contacto: a.contacto ? "filled" : "",
    diagnostico_1: a.diag1 ? esc(a.diag1) : WIDE_BLANK,
    diagnostico_2: a.diag2 ? esc(a.diag2) : WIDE_BLANK,
    diagnostico_3: a.diag3 ? esc(a.diag3) : WIDE_BLANK,
  };

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const tmpFiles = [];

  async function render(name, outFile, opts) {
    const html = fill(fs.readFileSync(path.join(TPL, `${name}.html`), "utf8"), vars);
    const tmp = path.join(TPL, `_tmp-${name}.html`);
    fs.writeFileSync(tmp, html);
    tmpFiles.push(tmp);
    const page = await browser.newPage(opts.viewport ? { viewport: opts.viewport, deviceScaleFactor: opts.scale || 1 } : {});
    await page.goto("file://" + tmp);
    await page.evaluate(() => document.fonts.ready);
    if (opts.pdf) await page.pdf({ path: outFile, preferCSSPageSize: true, printBackground: true });
    else await page.screenshot({ path: outFile, omitBackground: !!opts.transparent });
    await page.close();
    console.log("✓", path.relative(ROOT, outFile));
  }

  const suffix = a.hotel ? "-" + slug(a.hotel) : "";
  try {
    if (!a.hotel) {
      await render("tarjeta", path.join(OUT, "tarjeta.pdf"), { pdf: true });
      await render("marca-perfil", path.join(OUT, "marca", "perfil-whatsapp-instagram.png"), { viewport: { width: 640, height: 640 }, scale: 2 });
      await render("marca-horizontal", path.join(OUT, "marca", "logo-horizontal-oscuro.png"), { viewport: { width: 1200, height: 360 }, scale: 2 });
      await render("marca-horizontal-claro", path.join(OUT, "marca", "logo-horizontal-claro.png"), { viewport: { width: 1200, height: 360 }, scale: 2, transparent: true });
    }
    await render("propuesta", path.join(OUT, `propuesta-piloto${suffix}.pdf`), { pdf: true });
    await render("acuerdo", path.join(OUT, `acuerdo-piloto${suffix}.pdf`), { pdf: true });
  } finally {
    await browser.close();
    tmpFiles.forEach((f) => fs.rmSync(f, { force: true }));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
