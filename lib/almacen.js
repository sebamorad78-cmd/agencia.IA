// Almacenamiento de conversaciones y estadísticas (Netlify Blobs).
// Los datos reales solo se guardan desde la versión publicada; las pruebas usan un espacio aparte.

import { getDeployStore, getStore } from "@netlify/blobs";

export function almacenWhatsApp() {
  const opciones = { name: "whatsapp", consistency: "strong" };
  return globalThis.Netlify?.context?.deploy?.context === "production" ? getStore(opciones) : getDeployStore(opciones);
}
