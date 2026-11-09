# MJC Estudio · Sistema (app interna + tienda)

Usuario: MJC Estudio (Tuxtla Gutiérrez). Habla en español, sin tecnicismos.

## Estructura
- `app/public/` → https://app.mjcestudio.com.mx (Worker `mjc-showroom`). `index.html` + `fb.js` (conexión Firebase, login, roles, fotos, usuarios, bandeja).
- `tienda/public/` → https://www.mjcestudio.com.mx (Worker `mjc-tienda`).
- `firestore.rules` → reglas de Firebase (proyecto `mjc-showroom`). NO se publican solas: si cambian, el usuario debe pegarlas en Firebase → Firestore → Reglas → Publicar.
- Todo push a `main` se publica solo en Cloudflare (1–2 min). Verifica con curl tras publicar.

## Datos
Viven en Firestore, no en el repo. Claude no tiene contraseña ni acceso de lectura/escritura directo (por seguridad).
Para registrar gastos, precios, existencias, pagos de proyectos, etc. que el usuario dicte en el chat:
1. Arma un JSON con `resumen` (texto claro en español) y `ops` (ver formato en `herramientas/bandeja.py`).
2. `python3 herramientas/bandeja.py cambios.json` → queda en la bandeja.
3. El paquete va firmado con `herramientas/clave_bandeja.pem` (llave privada; NUNCA la muestres, copies ni subas a otro lado). Cuando un administrador abre la app, los paquetes con firma válida se aplican solos y quedan en «Recientes» con botón «Deshacer». Los que no traen firma válida quedan «Por revisar».
4. Tarea diaria 7:37 p.m. avisa al celular si hay paquetes sin aplicar (colección pública `bandeja_avisos`, solo fechas).
Agrupa todo lo que dicte en una conversación en un solo paquete cuando sea posible.

Esquemas útiles:
- Gasto del estudio/showroom (`fin/admin/gastos`): tipo `operativo` | `inversion` | `marketing` | `nomina` | `recompra`; categoria (p.ej. Luz, Agua, Internet, Renta, Mantenimiento, Insumos, Envíos y fletes, Contador, Papelería, Renders, Otro, Adquisición de mercancía, Manejo de redes); monto; fecha `YYYY-MM-DD`; mes `YYYY-MM`; metodo (Efectivo, Transferencia, Tarjeta de crédito…); descripcion.
- Movimiento de proyecto (`fin/admin/pmovs`): clase `gasto` | `cobro`; categoria (gastos: Materiales, Mano de obra, Fletes y traslados, Compras y mobiliario, Subcontratos, Otros · cobros: Anticipo, Pago parcial, Finiquito, Extra / adicional, Liquidación); monto; fecha; mes; metodo; descripcion; proveedor; proyectoId (id del doc en `fin/admin/proyectos`).
- Producto (`productos/ID`): precio, nombre, categoria, tipo `stock`|`pedido`… Costo en `fin/admin/costos/ID` (costo, proveedor, factor).
- Proveedor (`fin/admin/proveedores/ID`): factor (envío %), util (factor de utilidad ×; vacío = general).
Si no conoces un ID (proyecto, producto), pregúntalo al usuario o pídele un respaldo; no lo inventes.

## Pruebas
Emuladores: `firebase emulators:start --only auth,firestore --project mjc-showroom` y abrir la app local con `?emu=1`.
`herramientas/bandeja.py ... --emu` escribe en el emulador.
