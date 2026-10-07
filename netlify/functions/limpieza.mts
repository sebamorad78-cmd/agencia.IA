// Borrado automático diario de datos viejos, según la política de privacidad.

import type { Config } from "@netlify/functions";
import { almacenWhatsApp } from "../../lib/almacen.js";
import { limpiarDatosViejos } from "../../lib/whatsapp.js";

export default async () => {
  const borrados = await limpiarDatosViejos({ store: almacenWhatsApp() });
  console.log(`Limpieza diaria: ${borrados} registros borrados`);
};

export const config: Config = {
  schedule: "@daily",
};
