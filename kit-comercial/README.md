# Kit comercial de CFMTS Labs

Material para salir a vender. **Es interno: no se sube a la web** (está excluido en `.vercelignore` y `.htaccess`).

## Lo que hay en `salida/`

| Archivo | Para qué |
|---|---|
| `tarjeta.pdf` | Tarjeta personal 85 × 55 mm, frente y dorso. Lista para imprenta |
| `propuesta-piloto.pdf` | Propuesta de una página con espacios para completar a mano |
| `acuerdo-piloto.pdf` | Acuerdo simple del piloto para firmar. Revisarlo con un profesional antes del primer uso |
| `planilla-prospectos.xlsx` | Seguimiento de los hoteles: estados, próximos pasos, resumen e ingresos |
| `marca/perfil-whatsapp-instagram.png` | Foto de perfil para WhatsApp Business e Instagram |
| `marca/logo-horizontal-oscuro.png` / `-claro.png` | Logo para presentaciones, firmas de mail y documentos |

## Personalizar

1. Completá tu nombre (y email o web si querés) en `datos.json`. Los precios también se cambian ahí.
2. Generá todo de nuevo:

```bash
cd kit-comercial
npm install
node generar.cjs
```

### Propuesta y acuerdo para un hotel concreto

```bash
node generar.cjs --hotel "Hotel Costa Azul" --contacto "Laura Gómez" --corto "Costa Azul" \
  --diag1 "Reciben unas 25 consultas por WhatsApp por día en enero." \
  --diag2 "Las consultas que llegan después de las 22 se responden a la mañana." \
  --diag3 "Muchos huéspedes de Brasil escriben en portugués."
```

Genera `salida/propuesta-piloto-hotel-costa-azul.pdf` y `salida/acuerdo-piloto-hotel-costa-azul.pdf`. Esos archivos no se guardan en el repo.

## Logo

Cinco barras, una por cada inicial de CFMTS, que juntas dibujan una ola. Los colores van de la arena al mar. Los archivos vectoriales están en `assets/brand/`.
