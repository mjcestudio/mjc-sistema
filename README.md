# MJC Estudio · Sistema

- `app/` — App interna **MJC Showroom** (punto de venta, inventario, finanzas). Se publica en https://app.mjcestudio.com.mx (Cloudflare Worker `mjc-showroom`).
- `tienda/` — Tienda pública. Se publica en https://www.mjcestudio.com.mx (Cloudflare Worker `mjc-tienda`).
- `firestore.rules` — Reglas de seguridad de la base de datos (Firebase, proyecto `mjc-showroom`). Se copian a mano en Firebase → Firestore → Reglas.

Cada cambio que llega a la rama `main` se publica solo en Cloudflare.
Los datos (productos, ventas, clientes, finanzas) viven en Firebase, no en este repositorio.
