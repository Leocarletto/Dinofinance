// Finanças — login com Google (Google Identity Services, sem backend).
//
// O Client ID vem, nesta ordem, de:
//   1. localStorage "financas.googleClientId" (configurado pela própria pessoa)
//   2. window.FINANCAS_CONFIG.googleClientId  (config.js — fixado por quem hospeda)
//
// Sem backend não há como validar a assinatura do token; o login serve apenas
// para identificar o perfil neste navegador (os dados nunca saem da máquina).

const LS_CLIENT = "financas.googleClientId";

export function clientIdGoogle() {
  const cfg = (typeof window !== "undefined" && window.FINANCAS_CONFIG) || {};
  return (localStorage.getItem(LS_CLIENT) || "").trim()
    || String(cfg.googleClientId || "").trim();
}

export function definirClientId(valor) {
  const v = String(valor || "").trim();
  if (v) localStorage.setItem(LS_CLIENT, v);
  else localStorage.removeItem(LS_CLIENT);
}

// payload do JWT (base64url + UTF-8) → { sub, nome, email, foto }
export function decodificarJwt(token) {
  const b64 = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const p = JSON.parse(new TextDecoder().decode(bytes));
  if (!p.sub) throw new Error("credencial do Google sem identificador");
  return { sub: p.sub, nome: p.name || "", email: p.email || "", foto: p.picture || "" };
}

let gisPromise = null;

export function carregarGIS() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        gisPromise = null;
        falha(new Error("não foi possível carregar o script do Google (sem internet?)"));
      };
      document.head.append(s);
    });
  }
  return gisPromise;
}

// Desenha o botão oficial dentro de `el`. Retorna false se não há Client ID.
export async function iniciarBotaoGoogle(el, aoEntrar) {
  const clientId = clientIdGoogle();
  if (!clientId) return false;
  await carregarGIS();
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: "popup",
    callback: (resp) => {
      try { aoEntrar(decodificarJwt(resp.credential)); }
      catch (e) { console.error("login Google:", e); }
    },
  });
  google.accounts.id.renderButton(el, {
    theme: "outline", size: "large", shape: "pill",
    text: "signin_with", locale: "pt-BR", width: 300,
  });
  return true;
}
