#!/usr/bin/env python3
"""Deja un paquete de cambios en la bandeja de la app MJC Showroom.

Uso:  python3 herramientas/bandeja.py cambios.json
      (o con --emu para probar contra los emuladores locales)

cambios.json:
{
  "resumen": "Texto que verá el administrador, en español claro.",
  "ops": [
    {"op": "add", "path": "fin/admin/gastos", "data": {"tipo": "operativo", "categoria": "Insumos", "monto": 730.8,
       "fecha": "2026-11-09", "mes": "2026-11", "metodo": "Transferencia", "descripcion": "..."}},
    {"op": "update", "path": "productos/BAN-001", "data": {"precio": 9900}}
  ]
}

Rutas permitidas (la app rechaza cualquier otra):
  add    -> fin/admin/gastos, fin/admin/pmovs, movimientos
  set/update -> productos/ID, existencias/ID, fin/admin/costos/ID, fin/admin/proveedores/ID,
                fin/admin/proyectos/ID, fin/admin/empleados/ID
Valores especiales: "__now__" (fecha y hora al aplicar), "__uid__" (quien aplica).
Nada se guarda en los datos reales hasta que un administrador toca «Aplicar» en la app.
"""
import json, sys, secrets, datetime, urllib.request

PROJECT = "mjc-showroom"
API_KEY = "AIzaSyBUSMqtvho-y-x4bmgNkdZ4FmtB9m9-JDk"  # clave pública de la app web (no es secreta)


def fv(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [fv(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: fv(x) for k, x in v.items()}}}
    raise TypeError(type(v))


def post(base, col, doc_id, data):
    url = f"{base}/projects/{PROJECT}/databases/(default)/documents/{col}?documentId={doc_id}&key={API_KEY}"
    body = json.dumps({"fields": {k: fv(v) for k, v in data.items()}}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        return json.loads(urllib.request.urlopen(req, timeout=30).read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Error {e.code}: {e.read().decode()[:400]}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    emu = "--emu" in sys.argv
    base = "http://127.0.0.1:8080/v1" if emu else "https://firestore.googleapis.com/v1"
    pkg = json.load(open(args[0], encoding="utf-8"))
    assert pkg.get("resumen") and pkg.get("ops"), "Falta resumen u ops"
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    doc_id = now.replace(":", "").replace("-", "") + "-" + secrets.token_hex(3)
    post(base, "bandeja", doc_id, {"creado": now, "resumen": pkg["resumen"], "ops": pkg["ops"], "estado": "pendiente", "origen": "claude"})
    post(base, "bandeja_avisos", doc_id, {"creado": now})
    print("En bandeja:", doc_id)


if __name__ == "__main__":
    main()
