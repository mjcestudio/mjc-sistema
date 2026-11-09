/* MJC Showroom · conexión con Firebase (proyecto mjc-showroom, plan Spark).
   Ofrece a la app la misma interfaz que usaba en Claude (window.claude.use),
   pero con usuarios propios, Firestore y fotos guardadas dentro de Firestore. */
(function () {
  "use strict";
  const CFG = {
    apiKey: "AIzaSyBUSMqtvho-y-x4bmgNkdZ4FmtB9m9-JDk",
    authDomain: "mjc-showroom.firebaseapp.com",
    projectId: "mjc-showroom",
    storageBucket: "mjc-showroom.firebasestorage.app",
    messagingSenderId: "824709070318",
    appId: "1:824709070318:web:90e2d8517efd8afe54a2ff"
  };
  // Cuenta dueña: siempre administradora (debe coincidir con firestore.rules).
  const OWNERS = ["mjc.estudioarq@gmail.com"];

  firebase.initializeApp(CFG);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  fs.settings({ ignoreUndefinedProperties: true, merge: true, cacheSizeBytes: 200 * 1024 * 1024 });
  auth.languageCode = "es";
  // Solo para pruebas en la computadora de desarrollo (nunca aplica en mjcestudio.com.mx).
  const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu=1/.test(location.search);
  if (EMU) { auth.useEmulator("http://127.0.0.1:9099", { disableWarnings: true }); fs.useEmulator("127.0.0.1", 8080); }
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FB = window.FB = { auth, fs, perfil: null };

  /* ---------- sesión ---------- */
  let resolveReady; const ready = new Promise(r => (resolveReady = r));
  let started = false;

  const css = `
  .fb-gate{position:fixed;inset:0;z-index:100;background:var(--bg,#F2EDE6);display:grid;place-items:center;padding:20px;overflow:auto}
  .fb-card{width:min(400px,100%);background:var(--surface,#FBF8F4);border-radius:26px;padding:30px 26px;box-shadow:0 1px 2px rgba(46,43,39,.06),0 8px 24px rgba(46,43,39,.08);display:flex;flex-direction:column;gap:14px}
  .fb-brand{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:6px;text-align:center}
  .fb-brand svg{width:44px;height:44px;color:var(--brand,#7E7869)}
  .fb-brand b{font-family:var(--display,Georgia,serif);font-size:28px;font-weight:600;letter-spacing:.1em}
  .fb-brand small{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted,#6E675C)}
  .fb-msg{font-size:13.5px;min-height:1.3em;color:var(--bad,#8E2A2A)}
  .fb-msg.ok{color:var(--ok,#3F6E47)}
  .fb-link{all:unset;cursor:pointer;font-size:13.5px;font-weight:600;text-decoration:underline;text-underline-offset:3px;color:var(--muted,#6E675C);align-self:center}
  .fb-link:focus-visible{outline:2px solid var(--wine,#5A1F26);outline-offset:3px}
  .fb-me{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12.5px;color:var(--muted,#6E675C)}
  .fb-me button{all:unset;cursor:pointer;font-weight:700;text-decoration:underline;text-underline-offset:3px}
  .fb-urow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:12px 2px;border-bottom:1px solid var(--line,#DDD3C5)}
  .fb-urow:last-child{border-bottom:0}
  .fb-urow .acts{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
  @media (max-width:560px){.fb-urow{grid-template-columns:minmax(0,1fr)}.fb-urow .acts{justify-content:flex-start}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const gate = document.createElement("div");
  gate.className = "fb-gate";
  gate.innerHTML = `<div class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fbTitle">
    <div class="fb-brand"><svg aria-hidden="true" viewBox="0 0 100 100"><use href="#i-petal"/></svg><b id="fbTitle">MJC</b><small>Showroom · acceso del equipo</small></div>
    <div id="fbBody"><div class="sub" style="text-align:center">Cargando…</div></div>
  </div>`;
  const mountGate = () => { if (!gate.isConnected) document.body.appendChild(gate); };
  if (document.body) mountGate(); else document.addEventListener("DOMContentLoaded", mountGate);

  function showLogin(msg = "", ok = false) {
    $("#fbBody", gate).innerHTML = `<form id="fbLogin" style="display:flex;flex-direction:column;gap:12px" autocomplete="on">
      <div class="field"><label for="fbMail">Correo</label><input class="input" id="fbMail" type="email" autocomplete="username" required></div>
      <div class="field"><label for="fbPass">Contraseña</label><input class="input" id="fbPass" type="password" autocomplete="current-password" required></div>
      <button class="btn primary block" type="submit" id="fbGo">Entrar</button>
      <div class="fb-msg ${ok ? "ok" : ""}" id="fbMsg" role="status">${esc(msg)}</div>
      <button class="fb-link" type="button" id="fbForgot">Olvidé mi contraseña</button>
    </form>`;
    $("#fbMail", gate).focus();
  }
  function showNoAccess(email) {
    $("#fbBody", gate).innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;text-align:center">
      <p style="margin:0">La cuenta <b>${esc(email)}</b> no tiene acceso a la app o fue desactivada.</p>
      <p class="sub" style="margin:0">Pide a un administrador de MJC que te dé de alta.</p>
      <button class="btn ghost block" type="button" data-fbout>Usar otra cuenta</button></div>`;
  }
  const errMsg = e => {
    const c = (e && e.code) || "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return "Correo o contraseña incorrectos.";
    if (/too-many-requests/.test(c)) return "Demasiados intentos. Espera unos minutos o restablece tu contraseña.";
    if (/network/.test(c)) return "Sin conexión a internet. Revisa tu red e inténtalo de nuevo.";
    if (/invalid-email/.test(c)) return "Ese correo no es válido.";
    if (/user-disabled/.test(c)) return "Esta cuenta está desactivada.";
    if (/email-already-in-use/.test(c)) return "Ya existe una cuenta con ese correo.";
    if (/weak-password/.test(c)) return "La contraseña debe tener al menos 6 caracteres.";
    if (/permission-denied/.test(c)) return "No tienes permiso para esta acción.";
    return "Algo falló. Inténtalo de nuevo.";
  };

  gate.addEventListener("submit", async e => {
    if (e.target.id !== "fbLogin") return; e.preventDefault();
    const btn = $("#fbGo", gate), msg = $("#fbMsg", gate); btn.disabled = true; msg.className = "fb-msg"; msg.textContent = "Entrando…";
    try { await auth.signInWithEmailAndPassword($("#fbMail", gate).value.trim(), $("#fbPass", gate).value); }
    catch (err) { msg.textContent = errMsg(err); btn.disabled = false; }
  });
  gate.addEventListener("click", async e => {
    if (e.target.closest("[data-fbout]")) { await auth.signOut(); return; }
    if (e.target.id === "fbForgot") {
      const mail = $("#fbMail", gate).value.trim(), msg = $("#fbMsg", gate);
      if (!mail) { msg.className = "fb-msg"; msg.textContent = "Escribe tu correo arriba y vuelve a tocar «Olvidé mi contraseña»."; return; }
      try { await auth.sendPasswordResetEmail(mail); } catch (err) { if (!/user-not-found/.test(err.code || "")) { msg.className = "fb-msg"; msg.textContent = errMsg(err); return; } }
      msg.className = "fb-msg ok"; msg.textContent = "Si el correo está registrado, te llegará un enlace para crear una contraseña nueva. Revisa también spam.";
    }
  });

  auth.onAuthStateChanged(async u => {
    if (!u) {
      FB.perfil = null;
      if (started) { location.reload(); return; }
      mountGate(); showLogin(); return;
    }
    const email = (u.email || "").toLowerCase();
    let perfil = null;
    try { const s = await fs.doc("usuarios/" + u.uid).get(); if (s.exists) perfil = s.data(); } catch (e) { console.error(e); }
    if (OWNERS.includes(email)) perfil = { nombre: "MJC Estudio", ...(perfil || {}), email, rol: "admin", activo: true, dueno: true };
    if (!perfil || perfil.activo === false || !["admin", "vendedor"].includes(perfil.rol)) { mountGate(); showNoAccess(email); return; }
    FB.perfil = { uid: u.uid, email, ...perfil };
    if (started) return;
    started = true; gate.remove(); resolveReady();
  });

  /* ---------- fotos: guardadas como imagen dentro de Firestore ---------- */
  const PIX = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const cache = new Map(), pend = new Map();
  FB.src = (id, k = "m") => { if (!id) return ""; const key = (k === "f" ? "f" : "m") + id; return cache.get(key) || PIX + "#" + key; };
  async function load(key) {
    if (cache.has(key)) return cache.get(key);
    if (pend.has(key)) return pend.get(key);
    const p = (async () => {
      const id = key.slice(1), full = key[0] === "f";
      // Las fotos nunca cambian: primero se buscan en la memoria del dispositivo (no gasta lecturas).
      const read = async path => { const ref = fs.doc(path); try { const c = await ref.get({ source: "cache" }); if (c.exists && c.data().d) return c.data().d; } catch (e) {} try { const s = await ref.get(); return s.exists ? s.data().d || "" : ""; } catch (e) { return ""; } };
      let d = await read((full ? "fotos/" : "miniaturas/") + id);
      if (!d && !full) d = await read("fotos/" + id);
      if (d) cache.set(key, d);
      pend.delete(key); return d;
    })();
    pend.set(key, p); return p;
  }
  // Las imágenes llegan con un marcador; aquí se reemplaza por la foto real cuando se descarga.
  const queue = []; let active = 0;
  function pump() {
    while (active < 6 && queue.length) {
      const img = queue.shift(), src = img.getAttribute("src") || "", key = src.slice(PIX.length + 1);
      if (!src.startsWith(PIX + "#")) continue;
      active++;
      load(key).then(d => { if (d && img.getAttribute("src") === src) img.setAttribute("src", d); }).finally(() => { active--; pump(); });
    }
  }
  // Solo se descargan las fotos que están en pantalla o por aparecer (ahorra lecturas del plan gratuito).
  const io = new IntersectionObserver(es => { es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target); } }); pump(); }, { rootMargin: "600px 0px" });
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    const list = root.tagName === "IMG" ? [root] : root.querySelectorAll('img[src^="data:image/gif;base64,R0lGOD"]');
    list.forEach(img => { const s = img.getAttribute("src") || ""; if (s.startsWith(PIX + "#")) { if (cache.has(s.slice(PIX.length + 1))) { queue.push(img); } else io.observe(img); } });
    pump();
  }
  const drop = n => { if (n.nodeType !== 1) return; if (n.tagName === "IMG") io.unobserve(n); else n.querySelectorAll && n.querySelectorAll("img").forEach(i => io.unobserve(i)); };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === "attributes") scan(m.target); else { m.removedNodes.forEach(drop); m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)); } } })
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });

  FB.fotoBlob = async (id, k = "f") => { const d = await load((k === "f" ? "f" : "m") + id); return d ? (await fetch(d)).blob() : null; };

  function toImg(blob) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }); }
  function jpegDataUrl(img, max, q) {
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  }
  async function encodePair(blob) {
    const img = await toImg(blob);
    let max = 1400, q = .82, full = jpegDataUrl(img, max, q);
    while (full.length > 900000 && max > 500) { max = Math.round(max * .8); q = Math.max(.6, q - .05); full = jpegDataUrl(img, max, q); }
    const mini = jpegDataUrl(img, 420, .76);
    URL.revokeObjectURL(img.src);
    return { full, mini };
  }
  const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
  FB.savePhoto = async (blob, id = newId(), pre) => {
    const { full, mini } = pre || await encodePair(blob);
    const meta = { creado: new Date().toISOString(), por: (auth.currentUser || {}).uid || "" };
    const b = fs.batch(); b.set(fs.doc("fotos/" + id), { d: full, ...meta }); b.set(fs.doc("miniaturas/" + id), { d: mini, ...meta }); await b.commit();
    cache.set("f" + id, full); cache.set("m" + id, mini);
    return { id, url: full };
  };

  /* ---------- servicios que la app pide con window.claude.use ---------- */
  const user = {
    id: async () => (auth.currentUser || {}).uid || null,
    can: async () => !!FB.perfil,
    canEdit: async () => !!FB.perfil && FB.perfil.rol === "admin",
  };
  const assets = { upload: async blob => FB.savePhoto(blob) };
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv;charset=utf-8" : "application/octet-stream" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
  };
  window.claude = { use: async name => { await ready; return { db: fs, user, assets, downloads }[name] || null; } };

  /* ---------- datos de la sesión en pantalla ---------- */
  FB.meHtml = () => { const p = FB.perfil || {}; return `<span class="fb-me"><span>${esc(p.nombre || p.email || "")}</span><button type="button" data-fblogout>Cerrar sesión</button></span>`; };
  document.addEventListener("click", e => { if (e.target.closest("[data-fblogout]")) { if (confirm("¿Cerrar sesión en este dispositivo?")) auth.signOut(); } });

  /* ---------- Ajustes: usuarios del equipo ---------- */
  let usuarios = [], unsubU = null, fuText = "Le llegará un correo para crear su contraseña. Si no lo ve, que revise spam.";
  const ROLES = { admin: "Administrador", vendedor: "Vendedor" };
  FB.mountAjustes = () => {
    const el = $("#fbUsers"); if (!el) return;
    if (!unsubU) unsubU = fs.collection("usuarios").onSnapshot(s => { usuarios = s.docs.map(d => ({ uid: d.id, ...d.data() })); renderUsers(); }, e => console.error(e));
    renderUsers(); renderImport();
  };
  function renderUsers() {
    const el = $("#fbUsers"); if (!el) return;
    const me = FB.perfil || {};
    const rows = usuarios.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es")).map(u => `<div class="fb-urow">
      <div style="min-width:0"><div style="font-weight:600;overflow-wrap:anywhere">${esc(u.nombre || u.email)}${u.activo === false ? ' <span class="pill out">Desactivado</span>' : ""}</div><div class="sub" style="overflow-wrap:anywhere">${esc(u.email)} · ${ROLES[u.rol] || u.rol}</div></div>
      <div class="acts">${u.uid === me.uid ? '<span class="sub">Tú</span>' : `
        <select class="input" style="width:auto;padding:6px 10px" data-furol="${esc(u.uid)}" aria-label="Rol de ${esc(u.nombre || u.email)}"><option value="vendedor" ${u.rol === "vendedor" ? "selected" : ""}>Vendedor</option><option value="admin" ${u.rol === "admin" ? "selected" : ""}>Administrador</option></select>
        <button class="btn sm ghost" type="button" data-fureset="${esc(u.email)}">Enviar correo de contraseña</button>
        <button class="btn sm ${u.activo === false ? "primary" : "danger"}" type="button" data-fuact="${esc(u.uid)}|${u.activo === false ? 1 : 0}">${u.activo === false ? "Reactivar" : "Desactivar"}</button>`}</div></div>`).join("");
    el.innerHTML = `<div class="panel" style="display:flex;flex-direction:column;gap:12px">
      <h2>Usuarios del equipo</h2>
      <div class="sub">Tu acceso: <span class="role">Administrador</span> · ${esc(me.email || "")}. Cada persona entra en este link con su correo y su propia contraseña.</div>
      <button class="btn ghost" type="button" data-bjopen style="align-self:flex-start">Ver cambios de Claude</button>
      <div class="list">${rows || '<div class="sub">Aún no das de alta a nadie del equipo.</div>'}</div>
      <form id="fbNewUser" class="fgrid" style="background:var(--bg);border-radius:var(--r-md);padding:14px">
        <div class="field"><label for="fuNom">Nombre</label><input class="input" id="fuNom" required></div>
        <div class="field"><label for="fuMail">Correo</label><input class="input" id="fuMail" type="email" required></div>
        <div class="field"><label for="fuRol">Rol</label><select class="input" id="fuRol"><option value="vendedor">Vendedor · vende y ve catálogo</option><option value="admin">Administrador · ve todo</option></select></div>
        <div class="field" style="justify-content:flex-end"><button class="btn primary" type="submit" id="fuGo">Dar de alta</button></div>
        <div class="full sub" id="fuMsg" role="status">${esc(fuText)}</div>
      </form>
      <div class="note" style="background:var(--sunk);color:var(--ink)">Vendedor: vende, ve catálogo y existencias, registra solicitudes y pagos. No ve costos, utilidad, proveedores, clientes, reportes ni finanzas. Las restricciones se aplican en la base de datos, no solo en pantalla.</div>
    </div>`;
  }
  document.addEventListener("submit", async e => {
    if (e.target.id !== "fbNewUser") return; e.preventDefault();
    const nombre = $("#fuNom").value.trim(), email = $("#fuMail").value.trim().toLowerCase(), rol = $("#fuRol").value, btn = $("#fuGo");
    const say = t => { fuText = t; const m = $("#fuMsg"); if (m) m.textContent = t; };
    if (!nombre || !email) return; btn.disabled = true; say("Creando la cuenta…");
    let sec;
    try {
      sec = firebase.apps.find(a => a.name === "alta");
      if (!sec) { sec = firebase.initializeApp(CFG, "alta"); if (EMU) sec.auth().useEmulator("http://127.0.0.1:9099", { disableWarnings: true }); }
      const tmp = newId() + "Aa1!";
      const cred = await sec.auth().createUserWithEmailAndPassword(email, tmp);
      await fs.doc("usuarios/" + cred.user.uid).set({ nombre, email, rol, activo: true, creado: new Date().toISOString(), por: (auth.currentUser || {}).uid || "" });
      await sec.auth().signOut();
      await auth.sendPasswordResetEmail(email);
      say(`Listo: ${nombre} quedó como ${ROLES[rol].toLowerCase()}. Le enviamos un correo a ${email} para crear su contraseña.`);
      const f = $("#fbNewUser"); if (f) f.reset();
    } catch (err) {
      console.error(err);
      say(/email-already-in-use/.test(err.code || "") ? "Ese correo ya tiene cuenta. Si la desactivaste, usa «Reactivar» en la lista." : errMsg(err));
      try { sec && await sec.auth().signOut(); } catch (x) {}
    }
    const b2 = $("#fuGo"); if (b2) b2.disabled = false;
  });
  document.addEventListener("change", async e => {
    const uid = e.target.dataset && e.target.dataset.furol; if (!uid) return;
    try { await fs.doc("usuarios/" + uid).update({ rol: e.target.value, actualizado: new Date().toISOString() }); toast("Rol actualizado"); } catch (err) { toast(errMsg(err)); }
  });
  document.addEventListener("click", async e => {
    const r = e.target.closest("[data-fureset]"), a = e.target.closest("[data-fuact]");
    if (r) { try { await auth.sendPasswordResetEmail(r.dataset.fureset); toast("Correo enviado a " + r.dataset.fureset); } catch (err) { toast(errMsg(err)); } }
    if (a) { const [uid, on] = a.dataset.fuact.split("|"); try { await fs.doc("usuarios/" + uid).update({ activo: on === "1", actualizado: new Date().toISOString() }); toast(on === "1" ? "Cuenta reactivada" : "Cuenta desactivada: ya no puede entrar"); } catch (err) { toast(errMsg(err)); } }
  });
  function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2800); }

  /* ---------- Bandeja de cambios de Claude ----------
     Claude deja aquí los gastos, precios y ajustes que el usuario le dicta en el chat.
     Nada se guarda en los datos reales hasta que un administrador lo revisa y toca «Aplicar». */
  const BCSS = `.bj-pill{position:fixed;right:18px;top:calc(env(safe-area-inset-top,0px) + 14px);z-index:31;display:flex;align-items:center;gap:8px;background:var(--wine,#5A1F26);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer;box-shadow:0 8px 24px rgba(46,43,39,.18)}
  .bj-pill:focus-visible{outline:2px solid var(--ink,#2E2B27);outline-offset:3px}
  .bj-item{border:1px solid var(--line,#DDD3C5);border-radius:18px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--surface,#FBF8F4)}
  .bj-item h3{font-family:var(--body,system-ui);font-size:15px;font-weight:700;margin:0}
  .bj-res{white-space:pre-wrap;font-size:14px;margin:0}
  .bj-ops{margin:0;padding-left:18px;font-size:13px;color:var(--muted,#6E675C);display:flex;flex-direction:column;gap:4px}
  .bj-ops b{color:var(--ink,#2E2B27);font-weight:600}
  .bj-acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  @media (max-width:860px){.bj-pill{right:12px;padding:8px 13px;font-size:12.5px}}`;
  const bst = document.createElement("style"); bst.textContent = BCSS; document.head.appendChild(bst);
  let bj = [], bjOpen = false;
  // Solo estas rutas se pueden tocar desde la bandeja.
  const ADD_OK = ["fin/admin/gastos", "fin/admin/pmovs", "movimientos"];
  const DOC_OK = /^(productos|existencias|fin\/admin\/costos|fin\/admin\/proveedores|fin\/admin\/proyectos|fin\/admin\/empleados)\/[A-Za-z0-9_.\-]+$/;
  const opOk = o => o && ((o.op === "add" && ADD_OK.includes(o.path)) || ((o.op === "set" || o.op === "update") && DOC_OK.test(o.path || ""))) && o.data && typeof o.data === "object";
  const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  const NAMES = { "fin/admin/gastos": "Gasto", "fin/admin/pmovs": "Movimiento de proyecto", "movimientos": "Movimiento de inventario", productos: "Producto", existencias: "Existencia", "fin/admin/costos": "Costo", "fin/admin/proveedores": "Proveedor", "fin/admin/proyectos": "Proyecto", "fin/admin/empleados": "Empleado" };
  const SKIP = new Set(["creado", "actualizado", "por", "mes"]);
  function opLine(o) {
    const base = o.op === "add" ? o.path : o.path.replace(/\/[^/]+$/, ""), id = o.op === "add" ? "" : o.path.split("/").pop();
    const verb = o.op === "add" ? "Nuevo" : o.op === "set" ? "Guardar" : "Cambiar";
    const fields = Object.entries(o.data).filter(([k]) => !SKIP.has(k)).map(([k, v]) => `${k}: ${k === "monto" || k === "precio" || k === "costo" ? MXN.format(+v || 0) : typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
    return `<li><b>${verb} ${esc((NAMES[base] || base).toLowerCase())}${id ? " " + esc(id) : ""}</b> — ${esc(fields)}${opOk(o) ? "" : ' <span class="pill out">No permitido</span>'}</li>`;
  }
  // Llave pública: solo los paquetes firmados por Claude (con su llave privada) se aplican solos.
  const BJ_JWK = { kty: "EC", crv: "P-256", x: "Wrk-YJiifHjtiVBldG5_8IBK7qSP0bViBTo9vR0erNI", y: "YImxbZ10dWSkXmmjbxcw7MMDGDnXT0cSmo_or6ZyPCs", ext: true };
  let bjKey = null, hist = [], autoN = 0;
  const tried = new Set();
  const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v);
  async function firmaOk(x) {
    try {
      if (!x.firma || !crypto.subtle) return false;
      bjKey = bjKey || await crypto.subtle.importKey("jwk", BJ_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const sig = Uint8Array.from(atob(x.firma), c => c.charCodeAt(0));
      return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, bjKey, sig, new TextEncoder().encode(canon({ creado: x.creado, resumen: x.resumen, ops: x.ops })));
    } catch (e) { console.error(e); return false; }
  }
  const fdate = iso => new Date(iso || Date.now()).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function renderBj() {
    let pill = $("#bjPill");
    const txt = bj.length ? `Cambios de Claude por revisar · ${bj.length}` : autoN ? `Claude aplicó ${autoN} ${autoN === 1 ? "cambio" : "cambios"} · Ver` : "";
    if (!txt) { if (pill) pill.remove(); } else {
      if (!pill) { pill = document.createElement("button"); pill.id = "bjPill"; pill.className = "bj-pill"; pill.type = "button"; pill.dataset.bjopen = "1"; document.body.appendChild(pill); }
      pill.textContent = txt;
    }
    if (bjOpen) drawBj();
  }
  function drawBj() {
    const layer = $("#bjLayer") || Object.assign(document.createElement("div"), { id: "bjLayer" });
    if (!layer.isConnected) document.body.appendChild(layer);
    const card = (x, acts, tag = "") => `<article class="bj-item"><h3>${esc(fdate(x.aplicado || x.creado))}${tag}</h3>
        <p class="bj-res">${esc(x.resumen || "")}</p>
        <details><summary class="sub" style="cursor:pointer">Ver detalle (${(x.ops || []).length})</summary><ul class="bj-ops">${(x.ops || []).map(opLine).join("")}</ul></details>
        <div class="bj-acts">${acts}</div></article>`;
    const pend = bj.map(x => card(x, `<button class="btn sm danger" type="button" data-bjdel="${esc(x.id)}">Descartar</button>${(x.ops || []).every(opOk) ? `<button class="btn sm primary" type="button" data-bjok="${esc(x.id)}">Aplicar</button>` : '<span class="sub" style="align-self:center">Contiene cambios no permitidos</span>'}`, ' <span class="pill low">No viene firmado por Claude · revísalo con cuidado</span>')).join("");
    const ESTADO = { aplicado: ["stock", "Aplicado"], deshecho: ["neutral", "Deshecho"], descartado: ["neutral", "Descartado"] };
    const done = hist.map(x => { const e = ESTADO[x.estado] || ["neutral", x.estado]; return card(x, x.estado === "aplicado" && Array.isArray(x.deshacer) ? `<button class="btn sm ghost" type="button" data-bjundo="${esc(x.id)}">Deshacer</button>` : "", ` <span class="pill ${e[0]}">${e[1]}${x.auto ? " solo" : ""}</span>`); }).join("");
    layer.innerHTML = `<div class="scrim" data-bjclose><div class="drawer" role="dialog" aria-modal="true" aria-label="Cambios de Claude">
      <div class="dh"><h2>Cambios de Claude</h2><button type="button" class="x" data-bjclose aria-label="Cerrar">×</button></div>
      <p class="sub" style="margin:0">Lo que le dictas a Claude en el chat se aplica solo al abrir la app. Si algo no te convence, tócale «Deshacer».</p>
      ${pend ? `<h3 style="font-size:18px">Por revisar</h3>${bj.length > 1 ? `<button class="btn primary block" type="button" data-bjall>Aplicar todo (${bj.length})</button>` : ""}${pend}` : ""}
      <h3 style="font-size:18px">Recientes</h3>${done || '<p class="sub" style="margin:0">Todavía no hay cambios.</p>'}
    </div></div>`;
  }
  function closeBj() { bjOpen = false; const l = $("#bjLayer"); if (l) l.innerHTML = ""; }
  const stamp = v => v === "__now__" ? new Date().toISOString() : v === "__uid__" ? (auth.currentUser || {}).uid || "" : v;
  const NONE = "__no_existia__";
  // Aplica un paquete en una sola transacción y guarda lo necesario para deshacerlo.
  async function applyBj(x, auto) {
    const ops = x.ops || [];
    if (!ops.length || !ops.every(opOk)) throw Object.assign(new Error("op"), { code: "op-no-permitida" });
    const now = new Date().toISOString(), uid = (auth.currentUser || {}).uid || "", bref = fs.doc("bandeja/" + x.id);
    return fs.runTransaction(async tx => {
      const cur = await tx.get(bref);
      if (!cur.exists || cur.data().estado !== "pendiente") return false;
      const prevs = [];
      for (const o of ops) prevs.push(o.op === "add" ? null : await tx.get(fs.doc(o.path)));
      const undo = [];
      ops.forEach((o, i) => {
        const d = {}; for (const [k, v] of Object.entries(o.data)) d[k] = stamp(v);
        if (o.op === "add") { const r = fs.collection(o.path).doc(); tx.set(r, { creado: now, por: uid, ...d }); undo.push({ t: "del", path: r.path }); return; }
        const pv = prevs[i];
        if (o.op === "update" && !pv.exists) throw Object.assign(new Error("no existe " + o.path), { code: "not-found" });
        if (!pv.exists) undo.push({ t: "del", path: o.path });
        else { const old = pv.data(), vals = {}; for (const k of [...Object.keys(d), "actualizado"]) vals[k] = k in old ? old[k] : NONE; undo.push({ t: "restore", path: o.path, vals }); }
        tx.set(fs.doc(o.path), { ...d, actualizado: now }, { merge: true });
      });
      tx.update(bref, { estado: "aplicado", aplicado: now, aplicadoPor: uid, auto: !!auto, deshacer: undo });
      tx.delete(fs.doc("bandeja_avisos/" + x.id));
      return true;
    });
  }
  async function undoBj(id) {
    const x = hist.find(h => h.id === id); if (!x || !Array.isArray(x.deshacer)) return;
    const b = fs.batch(), del = firebase.firestore.FieldValue.delete();
    for (const u of x.deshacer) {
      if (u.t === "del") b.delete(fs.doc(u.path));
      else { const v = {}; for (const [k, val] of Object.entries(u.vals || {})) v[k] = val === NONE ? del : val; b.set(fs.doc(u.path), v, { merge: true }); }
    }
    b.update(fs.doc("bandeja/" + id), { estado: "deshecho", deshecho: new Date().toISOString() });
    await b.commit();
  }
  async function autoApply() {
    for (const x of bj.slice()) {
      if (tried.has(x.id)) continue; tried.add(x.id);
      if (!(x.ops || []).every(opOk) || !(await firmaOk(x))) continue;
      try { if (await applyBj(x, true)) { autoN++; renderBj(); } } catch (err) { console.error("No se pudo aplicar", x.id, err); }
    }
  }
  document.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("[data-bjopen]")) { bjOpen = true; autoN = 0; renderBj(); drawBj(); return; }
    if (t.matches("[data-bjclose]")) { closeBj(); return; }
    const ok = t.closest("[data-bjok]"), del = t.closest("[data-bjdel]"), all = t.closest("[data-bjall]"), un = t.closest("[data-bjundo]");
    if (ok || all) {
      const list = (ok ? bj.filter(x => x.id === ok.dataset.bjok) : bj.slice()).filter(x => (x.ops || []).every(opOk));
      const btn = ok || all; btn.disabled = true; let n = 0, bad = 0;
      for (const x of list) { try { if (await applyBj(x, false)) n++; } catch (err) { console.error(err); bad++; } }
      toast(bad ? `${n} aplicados · ${bad} no se pudieron aplicar` : n === 1 ? "Cambio aplicado" : `${n} cambios aplicados`);
      btn.disabled = false; return;
    }
    if (un) {
      if (!confirm("¿Deshacer este cambio? Se regresan los datos a como estaban antes de aplicarlo.")) return;
      un.disabled = true;
      try { await undoBj(un.dataset.bjundo); toast("Cambio deshecho"); } catch (err) { console.error(err); toast(errMsg(err)); un.disabled = false; }
      return;
    }
    if (del) {
      if (!confirm("¿Descartar este cambio? No se guardará nada.")) return;
      try { const b = fs.batch(); b.update(fs.doc("bandeja/" + del.dataset.bjdel), { estado: "descartado", aplicado: new Date().toISOString() }); b.delete(fs.doc("bandeja_avisos/" + del.dataset.bjdel)); await b.commit(); toast("Cambio descartado"); } catch (err) { toast(errMsg(err)); }
    }
  });
  let pendAll = [];
  ready.then(() => {
    if (!FB.perfil || FB.perfil.rol !== "admin") return;
    fs.collection("bandeja").where("estado", "==", "pendiente").limit(100).onSnapshot(async s => {
      pendAll = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
      bj = pendAll;
      await autoApply();
      // Lo que queda pendiente es lo que no trae firma válida: se revisa a mano.
      bj = pendAll.filter(x => tried.has(x.id));
      renderBj();
    }, err => console.error(err));
    fs.collection("bandeja").orderBy("aplicado", "desc").limit(15).onSnapshot(s => { hist = s.docs.map(d => ({ id: d.id, ...d.data() })); if (bjOpen) drawBj(); }, err => console.error(err));
  });

  /* ---------- Ajustes: importar respaldo (.zip) ---------- */
  let zipMsg = "", zipBusy = false;
  function renderImport() {
    const el = $("#fbImport"); if (!el) return;
    el.innerHTML = `<div class="panel" style="display:flex;flex-direction:column;gap:10px"><h2>Importar respaldo</h2>
      <div class="sub">Carga un respaldo .zip (datos.json y carpeta de fotos) a la base de datos. Úsalo para la mudanza inicial o para restaurar. Los registros con el mismo identificador se reemplazan.</div>
      ${zipBusy ? "" : '<label class="btn ghost" for="fbZip" style="align-self:flex-start">Elegir respaldo .zip</label><input id="fbZip" type="file" accept=".zip" hidden>'}
      <div class="sub" id="fbZipMsg" role="status">${esc(zipMsg)}</div></div>`;
  }
  document.addEventListener("change", async e => {
    if (e.target.id !== "fbZip" || !e.target.files[0]) return;
    const say = t => { zipMsg = t; const m = $("#fbZipMsg"); if (m) m.textContent = t; };
    try {
      if (!window.JSZip) throw new Error("JSZip");
      say("Leyendo el archivo…");
      const zip = await JSZip.loadAsync(e.target.files[0]);
      const dj = zip.file("datos.json"); if (!dj) { say("Ese .zip no tiene datos.json."); return; }
      const data = JSON.parse(await dj.async("string")), cols = data.colecciones || {};
      const total = Object.values(cols).reduce((n, c) => n + Object.keys(c).length, 0);
      const fotos = Object.keys(zip.files).filter(n => /^fotos\/[^/]+\.(jpe?g|png|webp)$/i.test(n));
      if (!confirm(`Se importarán ${total} registros y ${fotos.length} fotos. ¿Continuar?`)) { say(""); return; }
      zipBusy = true; renderImport();
      let done = 0, b = fs.batch(), n = 0;
      const flush = async () => { if (n) { await b.commit(); b = fs.batch(); n = 0; } };
      for (const [path, docs] of Object.entries(cols)) {
        for (const [id, d] of Object.entries(docs)) {
          b.set(fs.doc(path + "/" + id), d); n++; done++;
          if (n >= 400) { await flush(); say(`Datos: ${done} de ${total}…`); }
        }
      }
      await flush(); say(`Datos listos (${total}). Subiendo fotos…`);
      const toData = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      let ok = 0, fail = 0; const work = fotos.slice();
      const w = async () => { while (work.length) { const name = work.shift(), id = name.replace(/^fotos\//, "").replace(/\.[^.]+$/, "");
        try {
          const full = await toData(new Blob([await zip.file(name).async("uint8array")], { type: "image/jpeg" }));
          const mf = zip.file("miniaturas/" + id + ".jpg");
          const mini = mf ? await toData(new Blob([await mf.async("uint8array")], { type: "image/jpeg" })) : null;
          if (mini && full.length < 1000000) await FB.savePhoto(null, id, { full, mini });
          else await FB.savePhoto(new Blob([await zip.file(name).async("uint8array")]), id);
          ok++;
        } catch (err) { console.error(name, err); fail++; }
        if ((ok + fail) % 10 === 0) say(`Fotos ${ok + fail} de ${fotos.length}…`); } };
      await Promise.all([w(), w(), w()]);
      say(`Importación terminada: ${total} registros y ${ok} fotos${fail ? ` (${fail} no se pudieron subir; vuelve a importar para reintentar)` : ""}.`);
    } catch (err) { console.error(err); say("No se pudo importar: " + errMsg(err)); }
    zipBusy = false; renderImport();
  });
})();
