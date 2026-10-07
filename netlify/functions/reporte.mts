// Datos del reporte mensual de un hotel. Protegido con la clave REPORTE_CLAVE.

import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import hotel from "../../demo/hotel.json" with { type: "json" };
import { almacenWhatsApp } from "../../lib/almacen.js";

function claveValida(recibida: string, esperada: string) {
  if (!esperada || recibida.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada));
}

function json(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const { clave = "", mes = "" } = await req.json().catch(() => ({}));
  if (!claveValida(String(clave), Netlify.env.get("REPORTE_CLAVE") || "")) {
    return json({ error: "Clave incorrecta" }, 401);
  }
  if (!/^\d{4}-\d{2}$/.test(String(mes))) return json({ error: "Mes inválido (formato AAAA-MM)" }, 400);

  const stats = await almacenWhatsApp().get(`stats/${mes}`, { type: "json" });
  return json({ hotel: hotel.nombre, mes, stats: stats || null });
};

export const config: Config = {
  path: "/api/reporte",
};
