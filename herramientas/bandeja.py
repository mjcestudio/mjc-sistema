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
Cada paquete va firmado con herramientas/clave_bandeja.pem: la app lo aplica sola al abrirla un administrador
(y permite deshacerlo). Paquetes sin firma válida se quedan para revisión manual.
"""
import json, sys, os, secrets, datetime, base64, urllib.request

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


def norm(v):
    """Números enteros como int (igual que JavaScript) para que la firma coincida."""
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, list): return [norm(x) for x in v]
    if isinstance(v, dict): return {k: norm(x) for k, x in v.items()}
    return v


def canon(v):
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def firmar(msg):
    """Firma ECDSA P-256 (formato r||s) con la clave privada del repositorio."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    pem = os.path.join(os.path.dirname(os.path.abspath(__file__)), "clave_bandeja.pem")
    key = serialization.load_pem_private_key(open(pem, "rb").read(), None)
    r_, s_ = decode_dss_signature(key.sign(msg.encode("utf-8"), ec.ECDSA(hashes.SHA256())))
    return base64.b64encode(r_.to_bytes(32, "big") + s_.to_bytes(32, "big")).decode()


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
    ops = norm(pkg["ops"])
    firma = firmar(canon({"creado": now, "resumen": pkg["resumen"], "ops": ops}))
    post(base, "bandeja", doc_id, {"creado": now, "resumen": pkg["resumen"], "ops": ops, "estado": "pendiente", "origen": "claude", "firma": firma})
    post(base, "bandeja_avisos", doc_id, {"creado": now})
    print("En bandeja:", doc_id)


if __name__ == "__main__":
    main()
