// dinofinance — app estático (sem backend obrigatório).
// Dados por perfil no localStorage via js/data.js (contrato `store`).
// Módulos: js/extrato.js (importação CSV/OFX/PDF), js/google.js (login Google),
// js/sync.js (sincronização com os CSVs locais quando servido pelo server.py).

import {
  esc, MESES_ABR, MESES, brl, brlCurto,
  hoje, iso, deIso, compDe, fimDoMes, clampDia, addMeses, addDias, ddmm,
  parseValor, resolverVenc, categorias,
  store, dbVazio,
  novoLanc as _novoLanc, gerarMes as _gerarMes, criarAvulso as _criarAvulso,
  criarRecorrente as _criarRecorrente, criarParcelado as _criarParcelado,
  lancPorId as _lancPorId, pagar as _pagar, desfazer as _desfazer,
  excluir as _excluir, rotuloLanc as rotulo,
  PERIODOS, resolverPeriodo, comparacao, filtraConta as _filtraConta,
  efetivo, soma, serie as _serie, porCategoria as _porCategoria,
} from "./js/data.js";
import { parseExtrato, parseExtratoPdf, marcarDuplicadas } from "./js/extrato.js";
import { iniciarBotaoGoogle, clientIdGoogle, definirClientId } from "./js/google.js";
import { pingLocal, baixarDados, enviarDados, mesclar } from "./js/sync.js";

/* ================= util ================= */

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

/* ================= paleta categórica (validada p/ branco) ================= */

const PALETA = ["#635bff", "#1baf7a", "#eda100", "#2a78d6", "#e87ba4", "#eb6834", "#4a3aa7"];
const COR_OUTROS = "#98a2b3";

const TIPOS_INVEST = ["Ações", "CDB", "Cripto", "FIIs", "Fundos", "Poupança",
  "Renda fixa", "Tesouro Direto", "Outros"];
const FORMAS_PAGAMENTO = ["Pix", "Cartão de crédito", "Cartão de débito",
  "Dinheiro", "Boleto", "Transferência"];

/* ================= estado do app ================= */

let DB = null;          // dados do perfil ativo
let PERFIL = null;      // perfil ativo
let estado = store.carregarEstado();

function salvarEstado() { store.salvarEstado(estado); }
function salvarDB() { store.salvarDados(PERFIL.id, DB); }

/* domínio de js/data.js amarrado ao DB/estado ativos (mesmas assinaturas
   que o app usava antes; a gravação acontece aqui, não no módulo puro) */
const novoLanc = (o) => _novoLanc(DB, o);
const gerarMes = (comp) => { if (_gerarMes(DB, comp)) salvarDB(); };
const criarAvulso = (o) => { const l = _criarAvulso(DB, o); salvarDB(); return l; };
const criarRecorrente = (o) => { const r = _criarRecorrente(DB, o); salvarDB(); return r; };
const criarParcelado = (o) => { const ns = _criarParcelado(DB, o); salvarDB(); return ns; };
const lancPorId = (id) => _lancPorId(DB, id);
const pagar = (id) => { const l = _pagar(DB, id); if (l) salvarDB(); return l; };
const desfazer = (id) => { const l = _desfazer(DB, id); if (l) salvarDB(); return l; };
const excluir = (id) => { const r = _excluir(DB, id); if (r) salvarDB(); return r; };
const filtraConta = (l) => _filtraConta(estado.conta)(l);
const serie = (tipo, ini, fim) => _serie(DB, tipo, ini, fim, estado.conta);
const porCategoria = (tipo, ini, fim, topo = 6) => _porCategoria(DB, tipo, ini, fim, estado.conta, topo);

/* ================= tema (claro/escuro) ================= */

const ICONE_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICONE_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function temaResolvido() {
  if (estado.tema === "claro" || estado.tema === "escuro") return estado.tema;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

function aplicarTema() {
  const raiz = document.documentElement;
  if (estado.tema === "claro" || estado.tema === "escuro") {
    raiz.dataset.tema = estado.tema;
    raiz.style.colorScheme = estado.tema === "escuro" ? "dark" : "light";
  } else {
    delete raiz.dataset.tema;
    raiz.style.colorScheme = "";
  }
  const icone = temaResolvido() === "escuro" ? ICONE_SOL : ICONE_LUA;
  for (const b of $$(".btn-tema")) b.innerHTML = icone;
  atualizarFavicon();   // o favicon mono segue claro/escuro
}

function alternarTema() {
  estado.tema = temaResolvido() === "escuro" ? "claro" : "escuro";
  salvarEstado();
  aplicarTema();
}

/* ================= skins temáticas de dinossauro (por perfil) ================= */

// mono = padrão preto/branco: um T. rex negro (branco no escuro). Cada skin
// muda o acento do tema (CSS em :root[data-skin]), o dino da marca e o favicon.
const SKINS = {
  mono: { rotulo: "T. rex", nomeCompleto: "Tyrannosaurus rex", dino: "trex", tile: null },
  carnotauro: { rotulo: "Carnotauro", nomeCompleto: "Carnotaurus sastrei", dino: "carno", tile: "#b42318" },
  oxalaia: { rotulo: "Oxalaia", nomeCompleto: "Oxalaia quilombensis", dino: "oxalaia", tile: "#0e7490" },
  braquiossauro: { rotulo: "Braquiossauro", nomeCompleto: "Brachiosaurus altithorax", dino: "braquio", tile: "#15803d" },
};

// ficha de cada dinossauro (página Início e tooltips dos seletores de tema)
const DINO_INFO = {
  mono: {
    periodo: "Cretáceo Superior · 68–66 milhões de anos",
    onde: "América do Norte",
    porte: "até 12,5 m · ~8 toneladas",
    desc: "O rei dos dinossauros, com a mordida mais forte que já pisou em terra " +
      "firme — nada escapava dele, nem um lançamento sem categoria. Preto no " +
      "claro, branco no escuro: elegante como um rei deve ser.",
  },
  carnotauro: {
    periodo: "Cretáceo Superior · ~71 milhões de anos",
    onde: "Patagônia, Argentina",
    porte: "~8 m · o velocista dos predadores",
    desc: "O “touro carnívoro”: dois chifres na testa, braços ainda menores que " +
      "os do T. rex e pernas de corredor num deserto vulcânico. A mascote " +
      "original do dinofinance — e dizem que, se você insistir três vezes, ele dança.",
  },
  oxalaia: {
    periodo: "Cretáceo · Cenomaniano, ~95 milhões de anos",
    onde: "Ilha do Cajual, Maranhão — Brasil",
    porte: "12–14 m · o maior carnívoro brasileiro",
    desc: "Espinossaurídeo pescador com focinho de crocodilo e vela dorsal, " +
      "vivendo entre rios e mangues. O nome homenageia Oxalá e os quilombos da " +
      "região onde os fósseis foram achados — orgulho nacional em tema azul-petróleo.",
  },
  braquiossauro: {
    periodo: "Jurássico Superior · 154–150 milhões de anos",
    onde: "América do Norte",
    porte: "~22 m · 12 m de altura no pescoço",
    desc: "O “lagarto de braços”: dianteiras mais longas que as traseiras e um " +
      "pescoço de guindaste para alcançar as copas das araucárias. Gigante " +
      "gentil e herbívoro — cresce devagar e sempre, como uma boa carteira.",
  },
};
const skinDe = (perfil) => (perfil && SKINS[perfil.tema] ? perfil.tema : "mono");
let skinAtiva = "mono";

function aplicarSkin(skin) {
  skinAtiva = SKINS[skin] ? skin : "mono";
  const raiz = document.documentElement;
  if (skinAtiva === "mono") delete raiz.dataset.skin;
  else raiz.dataset.skin = skinAtiva;
  const dino = SKINS[skinAtiva].dino;
  for (const u of $$(".logo-dino use")) u.setAttribute("href", "#dino-" + dino);
  atualizarFavicon();
}

// favicon dinâmico: tile na cor da skin (mono segue claro/escuro) + dino dela
function atualizarFavicon() {
  const s = SKINS[skinAtiva];
  const escuro = temaResolvido() === "escuro";
  const tile = s.tile || (escuro ? "#ffffff" : "#0a0a0a");
  const corpo = s.tile ? "#ffffff" : (escuro ? "#0a0a0a" : "#ffffff");
  const serial = (id) => {
    const g = document.getElementById(id);
    if (!g) return "";
    const c = g.cloneNode(true);
    c.removeAttribute("style"); c.removeAttribute("id");
    return new XMLSerializer().serializeToString(c);
  };
  const miolo = serial("corpo-" + s.dino);
  if (!miolo) return;   // defs ainda não estão no DOM
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="115" fill="${tile}"/>` +
    `<g fill="${corpo}">${miolo}</g>` +
    `<g fill="${tile}">${serial("olho-" + s.dino)}</g></svg>`;
  const link = $("#favicon");
  if (link) link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}

// miniatura da skin (tile fixo na cor do dino; mono segue o tema atual)
const tileSkinAttr = (s) => s.tile ? ` style="--accent:${s.tile};--accent-inv:#ffffff"` : "";

// tooltip com nome científico + período geológico
const tituloSkin = (k) => `${SKINS[k].nomeCompleto} · ${DINO_INFO[k].periodo}`;

function htmlTemas(nome, sel) {
  return Object.entries(SKINS).map(([k, s]) => `
    <label class="skin-op" title="${esc(tituloSkin(k))}">
      <input type="radio" name="${nome}" value="${k}" ${k === sel ? "checked" : ""}>
      <svg class="skin-mini" viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>
      <span>${s.rotulo}</span>
    </label>`).join("");
}

// easter egg: no tema Carnotauro, 3 cliques rápidos no dino do topo = dança
let cliquesCarno = 0, timerCarno = null;
function ligarDancaCarno(el) {
  el.addEventListener("click", () => {
    if (skinAtiva !== "carnotauro") return;
    cliquesCarno += 1;
    clearTimeout(timerCarno);
    timerCarno = setTimeout(() => { cliquesCarno = 0; }, 600);
    if (cliquesCarno >= 3) {
      cliquesCarno = 0;
      el.classList.add("carno-danca");
      setTimeout(() => el.classList.remove("carno-danca"), 4700);
    }
  });
}

function entrarPerfilDireto(perfil) {
  PERFIL = perfil;
  store.definirAtivo(perfil.id);
  DB = store.carregarDados(perfil.id);
  gerarMes(compDe(hoje()));
  aplicarSkin(skinDe(perfil));
  $("#tela-login").hidden = true;
  $("#app").hidden = false;
  atualizarAvatar();
  render();
}

function atualizarAvatar() {
  // identidade nos dois lugares: cartão da lateral + cabeçalho do menu
  // (arte = dino da skin, ou a foto do Google quando existir)
  const s = SKINS[skinDe(PERFIL)];
  const arte = PERFIL.foto
    ? `<span class="menu-foto" style="background-image:url('${esc(PERFIL.foto)}')"></span>`
    : `<svg viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>`;
  $("#lp-avatar").innerHTML = arte;
  $("#lp-nome").textContent = PERFIL.nome;
  $("#lp-email").textContent = PERFIL.email || "só neste navegador";
  $("#menu-avatar").innerHTML = arte;
  $("#menu-nome").textContent = PERFIL.nome;
  $("#menu-email").textContent = PERFIL.email || "perfil só neste navegador";
  montarMenuTemas();
}

// troca rápida de tema no próprio menu (minis dos 4 dinos, ativa com anel)
function montarMenuTemas() {
  const at = skinDe(PERFIL);
  $("#menu-temas").innerHTML = Object.entries(SKINS).map(([k, s]) => `
    <button class="menu-tema${k === at ? " on" : ""}" data-tema="${k}" type="button"
      title="${esc(tituloSkin(k))}">
      <svg viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>
    </button>`).join("");
}

function definirTema(v) {
  if (!SKINS[v] || !PERFIL) return;
  PERFIL = store.atualizarPerfil(PERFIL.id, { tema: v });
  aplicarSkin(v);
  atualizarAvatar();   // refaz o cabeçalho do menu e o anel do mini ativo
  flash(`✓ Tema ${SKINS[v].rotulo} aplicado`);
}

// entrada com senha local (se o perfil tiver uma definida)
function entrarPerfil(perfil) {
  if (!perfil.senha) { entrarPerfilDireto(perfil); return; }
  mostrarLanding();
  const caixa = abrirModal(`
<div class="modal-cab"><h2>Perfil protegido</h2><button class="btn-x" data-fechar title="fechar">×</button></div>
<p class="modal-sub">«${esc(perfil.nome)}» tem senha. Digite para entrar.</p>
<form id="form-senha" class="form">
  <label class="campo"><span>Senha</span>
    <input name="senha" type="password" required autofocus></label>
  <button class="btn primario">Entrar</button>
</form>`);
  aoFecharModal = () => store.limparAtivo();   // cancelou: fica na tela de login
  $("#form-senha", caixa).onsubmit = async (ev) => {
    ev.preventDefault();
    const dig = new FormData(ev.target).get("senha");
    if (await hashSenha(String(dig), perfil.senha.salt) === perfil.senha.hash) {
      aoFecharModal = null;
      fecharModal();
      entrarPerfilDireto(perfil);
    } else {
      flash("⚠ Senha incorreta.");
    }
  };
}

function sairPerfil() {
  store.limparAtivo();
  location.reload();
}

async function hashSenha(senha, salt) {
  const dados = new TextEncoder().encode(salt + "|" + senha);
  const d = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const novoSalt = () =>
  [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");

function corCategoria(nome) {
  if (nome === "Outros") return COR_OUTROS;
  if (!(nome in DB.catSlots)) {
    const usados = Object.values(DB.catSlots);
    const livre = PALETA.findIndex((_, i) => !usados.includes(i));
    DB.catSlots[nome] = livre >= 0 ? livre : Object.keys(DB.catSlots).length % PALETA.length;
    salvarDB();
  }
  return PALETA[DB.catSlots[nome]];
}

const cumulativa = (vals) => { let s = 0; return vals.map(v => (s += v, Math.round(s * 100) / 100)); };

/* ================= gráfico SVG (linhas) ================= */

function tetoBonito(v) {
  if (v <= 0) return 100;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 2, 2.5, 5, 10]) if (v <= k * e) return k * e;
  return 10 * e;
}

let seqChart = 0;

// atual pode ser mais curto que labels (linha "para" no hoje, como na Stripe)
function chartSVG(labels, atual, anterior, alt = 170) {
  const gid = "ch" + (++seqChart);
  if (labels.length === 1) { labels = [...labels, ...labels]; atual = [...atual, ...atual]; anterior = [...anterior, ...anterior]; }
  const n = labels.length;
  const W = 620, H = alt, pl = 4, pr = 52, pt = 10, pb = 8;
  const ymax = tetoBonito(Math.max(...atual.filter(v => v != null), ...anterior, 1));
  const X = (i) => pl + i * (W - pl - pr) / (n - 1);
  const Y = (v) => pt + (1 - v / ymax) * (H - pt - pb);
  const caminho = (vs) => vs.map((v, i) => v == null ? "" :
    `${i === 0 || vs[i - 1] == null ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  let grade = "";
  for (const gv of [0, ymax / 2, ymax]) {
    const gy = Y(gv).toFixed(1);
    grade += `<line x1="${pl}" y1="${gy}" x2="${W - pr}" y2="${gy}" class="gr"/>` +
      `<text x="${W - pr + 7}" y="${(+gy + 3.5).toFixed(1)}" class="ytick">${esc(brlCurto(gv))}</text>`;
  }
  const ultI = atual.reduce((acc, v, i) => v != null ? i : acc, 0);
  const dados = { labels, atual, anterior, pl, pr, pt, pb, ymax, W, H, n };
  return `
<div class="chart" id="${gid}">
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${grade}
    <path d="${caminho(anterior)}" class="ln-prev"/>
    <path d="${caminho(atual)}" class="ln-atual"/>
    <circle cx="${X(ultI).toFixed(1)}" cy="${Y(atual[ultI] ?? 0).toFixed(1)}" r="3.6" class="dot-fim"/>
    <line class="crosshair" y1="${pt}" y2="${H - pb}" visibility="hidden"/>
    <circle class="dot-hv-a" r="4" visibility="hidden"/>
    <circle class="dot-hv-p" r="3.5" visibility="hidden"/>
    <rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
  </svg>
  <div class="xlabels"><span>${esc(labels[0])}</span><span>${esc(labels[n - 1])}</span></div>
  <div class="tooltip" hidden></div>
  <script type="application/json">${JSON.stringify(dados)}<\/script>
</div>`;
}

function ligarCharts(raiz) {
  $$(".chart", raiz).forEach((ch) => {
    const dados = JSON.parse($("script", ch).textContent);
    const { labels, atual, anterior, pl, pr, pt, pb, ymax, W, H, n } = dados;
    const svg = $("svg", ch), hit = $(".hit", ch), tt = $(".tooltip", ch);
    const cx = $(".crosshair", ch), da = $(".dot-hv-a", ch), dp = $(".dot-hv-p", ch);
    const X = (i) => pl + i * (W - pl - pr) / (n - 1);
    const Y = (v) => pt + (1 - v / ymax) * (H - pt - pb);

    const linha = (cls, nome, v) => {
      const l = document.createElement("div"); l.className = "tt-linha";
      const k = document.createElement("span"); k.className = "tt-chave " + cls;
      const s = document.createElement("span"); s.className = "tt-nome"; s.textContent = nome;
      const b = document.createElement("b"); b.className = "tt-val"; b.textContent = brl(v);
      l.append(k, s, b); return l;
    };

    hit.addEventListener("mousemove", (ev) => {
      const r = svg.getBoundingClientRect();
      const fx = (ev.clientX - r.left) / r.width * W;
      let i = Math.round((fx - pl) / ((W - pl - pr) / (n - 1)));
      i = Math.max(0, Math.min(n - 1, i));
      const px = X(i);
      cx.setAttribute("x1", px); cx.setAttribute("x2", px); cx.removeAttribute("visibility");
      if (atual[i] != null) { da.setAttribute("cx", px); da.setAttribute("cy", Y(atual[i])); da.removeAttribute("visibility"); }
      else da.setAttribute("visibility", "hidden");
      dp.setAttribute("cx", px); dp.setAttribute("cy", Y(anterior[i] ?? 0)); dp.removeAttribute("visibility");

      tt.hidden = false;
      tt.replaceChildren();
      const cab = document.createElement("div");
      cab.className = "tt-data"; cab.textContent = labels[i];
      tt.append(cab);
      if (atual[i] != null) tt.append(linha("", "Atual", atual[i]));
      tt.append(linha("prev", "Comparação", anterior[i] ?? 0));
      const ttw = tt.offsetWidth || 170;
      let lx = px / W * r.width + 14;
      if (lx + ttw > r.width - 6) lx = px / W * r.width - ttw - 14;
      tt.style.left = Math.max(0, lx) + "px";
    });
    hit.addEventListener("mouseleave", () => {
      tt.hidden = true;
      [cx, da, dp].forEach(el => el.setAttribute("visibility", "hidden"));
    });
  });
}

/* ================= donut (círculo) + legenda ================= */

// fatias: [{ nome, valor, cor, op?, etq? }] — op = opacidade (rampa), etq = selo html
function donutSVG(fatias, centro1, centro2) {
  const total = soma(fatias.map(f => f.valor));
  if (!total) return "";
  const R = 78, LARG = 22, C = 2 * Math.PI * R;   // anel fino → miolo interno de ~134
  let acc = 0, arcos = "";
  for (const f of fatias) {
    const frac = f.valor / total;
    const len = Math.max(frac * C - 2.5, 0.8);
    arcos += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${f.cor}"` +
      (f.op ? ` stroke-opacity="${f.op}"` : "") +
      ` stroke-width="${LARG}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"` +
      ` stroke-dashoffset="${(-acc * C + 1.25).toFixed(2)}" transform="rotate(-90 100 100)">` +
      `<title>${esc(f.nome)} · ${brl(f.valor)}</title></circle>`;
    acc += frac;
  }
  // texto central dimensionado para NUNCA passar do miolo (largura útil ~118)
  const t1 = String(centro1), t2 = String(centro2);
  const f1 = Math.min(23, 203 / Math.max(t1.length, 1));
  const f2 = Math.min(11.5, 214 / Math.max(t2.length, 1));
  return `<svg class="donut-svg" viewBox="0 0 200 200">${arcos}
  <text x="100" y="97" text-anchor="middle" class="donut-c1" style="font-size:${f1.toFixed(1)}px">${esc(t1)}</text>
  <text x="100" y="115" text-anchor="middle" class="donut-c2" style="font-size:${f2.toFixed(1)}px">${esc(t2)}</text></svg>`;
}

function donutComLegenda(fatias, centro1, centro2) {
  if (!fatias.length) return '<div class="vazio">Nada neste mês</div>';
  const legenda = fatias.map(f => `
    <div class="dl-linha">
      <span class="dl-cor" style="background:${f.cor}${f.op ? `;opacity:${f.op}` : ""}"></span>
      <span class="dl-nome">${esc(f.nome)}</span>${f.etq || ""}
      <b class="dl-val">${brl(f.valor)}</b>
    </div>`).join("");
  return `<div class="donut-flex">${donutSVG(fatias, centro1, centro2)}
    <div class="donut-legenda">${legenda}</div></div>`;
}

// rampa monocromática: todas as fatias no acento do tema (preto no claro,
// branco no escuro, cor do dino nas skins), cada uma num tom (opacidade)
function ramparFatias(fatias) {
  const passo = Math.min(0.13, 0.78 / Math.max(fatias.length - 1, 1));
  fatias.forEach((f, i) => {
    f.cor = "var(--accent)";
    f.op = Math.max(1 - i * passo, 0.2).toFixed(2);
  });
  return fatias;
}

// fatias de pagas × em aberto (status vai no selo da legenda; cor = rampa do acento)
function fatiasStatus(itens) {
  const hj = iso(hoje());
  const grupos = { pago: [], aberto: [], vencido: [] };
  for (const l of itens) {
    const g = l.status === "pago" ? "pago" : (l.venc < hj ? "vencido" : "aberto");
    grupos[g].push(l);
  }
  const selo = (g, l) => {
    const r = l.tipo === "renda"
      ? { pago: "recebido", aberto: "a receber", vencido: "vencido" }
      : { pago: "paga", aberto: "aberta", vencido: "vencida" };
    const cls = { pago: "etq ok", aberto: "etq padrao", vencido: "etq vencida" };
    return `<span class="${cls[g]}">${r[g]}</span>`;
  };
  const fatias = [];
  for (const g of ["vencido", "aberto", "pago"]) {
    let lista = grupos[g].slice().sort((x, y) => efetivo(y) - efetivo(x));
    let resto = [];
    if (lista.length > 7) {
      resto = lista.slice(6);
      lista = lista.slice(0, 6);
    }
    lista.forEach((l) => fatias.push({ nome: rotulo(l), valor: efetivo(l), etq: selo(g, l) }));
    if (resto.length) fatias.push({
      nome: `Outros (${resto.length})`, valor: soma(resto.map(efetivo)), etq: selo(g, resto[0]),
    });
  }
  return ramparFatias(fatias);
}

/* ================= componentes ================= */

function deltaHtml(atual, anterior, subirEBom) {
  if (!anterior) return '<span class="delta neutro"></span>';
  const pct = (atual - anterior) / anterior * 100;
  const bom = (pct >= 0) === subirEBom;
  const txt = (pct >= 0 ? "+" : "−") + Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  return `<span class="delta ${bom ? "bom" : "ruim"}">${txt}</span>`;
}

function quebraHtml(pares) {
  if (!pares.length) return '<div class="vazio">Nada no período</div>';
  const total = pares.reduce((s, [, v]) => s + v, 0) || 1;
  const segs = pares.map(([nome, v]) =>
    `<div class="quebra-seg" style="width:${(v / total * 100).toFixed(2)}%;background:${corCategoria(nome)}"></div>`).join("");
  const linhas = pares.map(([nome, v]) => `
    <div class="quebra-linha">
      <span class="quebra-cor" style="background:${corCategoria(nome)}"></span>
      <span class="quebra-nome">${esc(nome)}</span>
      <b class="quebra-val">${brl(v)}</b>
    </div>`).join("");
  return `<div class="quebra-barra">${segs}</div>${linhas}`;
}

function badgeStatus(l) {
  if (l.status === "pago") return `<span class="badge pago">${l.tipo === "renda" ? "Recebido" : "Pago"}</span>`;
  const d = Math.round((deIso(l.venc) - hoje()) / 864e5);
  if (d < 0) return `<span class="badge vencido">Vencido há ${-d}d</span>`;
  if (d === 0) return '<span class="badge aberto">Vence hoje</span>';
  return `<span class="badge aberto">Aberto</span>`;
}

function etiquetas(l) {
  let t = "";
  if (l.pTot) t += `<span class="etq">${l.pNum}/${l.pTot}</span>`;
  if (l.origem === "recorrente") t += '<span class="etq">fixa</span>';
  if (l.origem === "extrato") t += '<span class="etq">extrato</span>';
  if (l.conta === "mei") t += '<span class="etq pj">PJ</span>';
  return t;
}

function linhaLanc(l, acoes = true) {
  const venc = deIso(l.venc);
  const vencido = l.status === "pendente" && iso(venc) < iso(hoje());
  const val = l.tipo === "renda"
    ? `<b class="val-pos">+${brl(l.valorPago ?? l.valor)}</b>`
    : `<b class="val-neg">${brl(l.valorPago ?? l.valor)}</b>`;
  const acao = l.status === "pendente"
    ? `<button class="btn mini" data-acao="pagar" data-id="${l.id}">${l.tipo === "renda" ? "Receber" : "Pagar"}</button>`
    : `<button class="link-btn" data-acao="desfazer" data-id="${l.id}">desfazer</button>`;
  return `
<div class="linha">
  <div class="dia ${vencido ? "crit" : ""}"><span class="d">${String(venc.getDate()).padStart(2, "0")}</span><span class="m">${MESES_ABR[venc.getMonth()]}</span></div>
  <div class="linha-info">
    <div class="linha-t">${esc(l.descricao)}${etiquetas(l)}</div>
    <div class="linha-s">${esc(l.categoria)}${l.status === "pago" ? " · " + (l.tipo === "renda" ? "recebido" : "pago") + " em " + deIso(l.pagoEm).getDate() + "/" + (deIso(l.pagoEm).getMonth() + 1) : ""}</div>
  </div>
  <div class="linha-dir">${val}${badgeStatus(l)}</div>
  ${acoes ? `<div class="linha-acoes">${acao}<button class="btn-x" data-acao="excluir" data-id="${l.id}" title="excluir">×</button></div>` : ""}
</div>`;
}

let flashTimer = null;
function flash(msg, desfazerId) {
  const f = $("#flash");
  f.replaceChildren();
  const s = document.createElement("span"); s.textContent = msg;
  f.append(s);
  if (desfazerId) {
    const b = document.createElement("button");
    b.textContent = "desfazer";
    b.onclick = () => { desfazer(desfazerId); f.hidden = true; render(); };
    f.append(b);
  }
  f.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { f.hidden = true; }, 5000);
}

/* ================= modal genérico ================= */

let aoFecharModal = null;   // callback opcional de cancelamento

function abrirModal(html, classe = "") {
  const fundo = $("#modal");
  const caixa = $(".modal-caixa", fundo);
  caixa.className = "modal-caixa" + (classe ? " " + classe : "");
  caixa.innerHTML = html;
  fundo.hidden = false;
  return caixa;
}

function fecharModal() {
  const fundo = $("#modal");
  fundo.hidden = true;
  $(".modal-caixa", fundo).innerHTML = "";
  const cb = aoFecharModal;
  aoFecharModal = null;
  if (cb) cb();
}

/* ================= aprendizado (categorias e padrões) ================= */

// chave estável da descrição: minúscula, sem acento, sem números/datas
const chaveDesc = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[\d\/.,:;#*_—–-]+/g, " ").replace(/\s+/g, " ").trim();

// aplica o que o perfil já ensinou: categoria aprendida por descrição e
// detecção de padrão mensal (mesma descrição em meses anteriores, com mesmo
// valor ou dia próximo) — sugere "Repete: sempre" quando faz sentido
function aplicarAprendizado(linhas) {
  const porChave = new Map();
  for (const x of DB.lancs) {
    if (x.status === "pulado") continue;
    const k = x.tipo + "|" + chaveDesc(x.descricao);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(x);
  }
  const recsAtivas = new Set(DB.recs.filter(r => r.ativo)
    .map(r => r.tipo + "|" + chaveDesc(r.descricao)));

  for (const l of linhas) {
    const k = l.tipo + "|" + chaveDesc(l.descricao);
    l.aprendida = false; l.padrao = false;
    const cat = DB.aprendCat[k];
    if (cat) { l.categoria = cat; l.aprendida = true; }

    const compL = l.data.slice(0, 7), dia = +l.data.slice(8, 10);
    const previos = (porChave.get(k) || []).filter(x => x.comp < compL);
    if (!previos.length) continue;
    const valorIgual = previos.some(x => Math.abs(efetivo(x) - l.valor) < 0.01);
    const diaProximo = previos.some(x => Math.abs(+x.venc.slice(8, 10) - dia) <= 2);
    if (valorIgual || diaProximo) {
      l.padrao = true;
      // já paga todo mês e ainda não é recorrente? pré-sugere repetir
      if (valorIgual && !recsAtivas.has(k) && !l.dup && !l.rep)
        l.rep = { modo: "sempre" };
    }
  }
}

/* ================= importação de extrato (CSV/OFX/PDF) ================= */

async function lerArquivoTexto(arq) {
  const buf = await arq.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  // muitos U+FFFD → o arquivo veio em Latin-1/Windows-1252 (comum em bancos)
  const ruins = (utf8.match(/�/g) || []).length;
  if (ruins > 0) return new TextDecoder("windows-1252").decode(buf);
  return utf8;
}

// também exportada: permite importar extrato a partir de texto (testes/console)
export function abrirImportacaoDeTexto(texto, nome = "extrato.csv") {
  const ext = parseExtrato(texto);
  if (!ext.linhas.length) { flash("⚠ Nenhum lançamento reconhecido no arquivo."); return; }
  marcarDuplicadas(ext.linhas, DB);
  aplicarAprendizado(ext.linhas);
  previaExtrato(nome, ext);
}

// também exportada (seam de teste — o file picker nativo não é automatizável)
export async function abrirImportacaoDeArquivo(arq) {
  if (/\.pdf$/i.test(arq.name || "") || arq.type === "application/pdf") {
    const paginas = await lerPaginasPdf(arq);
    const ext = parseExtratoPdf(paginas);
    if (!ext.linhas.length) { flash("⚠ Nenhum lançamento reconhecido no PDF."); return; }
    marcarDuplicadas(ext.linhas, DB);
    aplicarAprendizado(ext.linhas);
    previaExtrato(arq.name, ext);
    return;
  }
  abrirImportacaoDeTexto(await lerArquivoTexto(arq), arq.name);
}

function abrirImportacao() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".csv,.ofx,.txt,.pdf,text/csv,text/plain,application/pdf";
  inp.onchange = async () => {
    const arq = inp.files[0];
    if (!arq) return;
    try {
      await abrirImportacaoDeArquivo(arq);
    } catch (e) {
      flash("⚠ " + e.message);
    }
  };
  inp.click();
}

/* ---------- leitura de PDF (pdf.js vendorizado, carregado sob demanda) ---------- */

let _pdfjs = null;
function carregarPdfjs() {
  _pdfjs ??= new Promise((certo, erro) => {
    const s = document.createElement("script");
    s.src = "vendor/pdfjs/pdf.min.js";        // Mozilla pdf.js 3.11.174 (Apache-2.0)
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
      certo(window.pdfjsLib);
    };
    s.onerror = () => erro(new Error("não consegui carregar o leitor de PDF (vendor/pdfjs)"));
    document.head.append(s);
  });
  return _pdfjs;
}

// -> [[{ str, x, y, w }…]…] por página, para parseExtratoPdf; pede a senha se precisar
async function lerPaginasPdf(arq) {
  const pdfjs = await carregarPdfjs();
  const dados = new Uint8Array(await arq.arrayBuffer());
  let doc = null, senha;
  for (let tent = 0; tent < 3 && !doc; tent++) {
    try {
      doc = await pdfjs.getDocument({ data: dados.slice(), password: senha }).promise;
    } catch (e) {
      if (e?.name !== "PasswordException")
        throw new Error("não consegui abrir este PDF (" + (e?.message || e) + ")");
      senha = prompt(tent
        ? "Senha incorreta. Tente de novo:"
        : "Este PDF tem senha (faturas costumam usar início do CPF ou data de nascimento):");
      if (senha == null) throw new Error("importação cancelada (PDF com senha)");
    }
  }
  if (!doc) throw new Error("não consegui abrir o PDF com essa senha");
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pag = await doc.getPage(p);
    const tc = await pag.getTextContent();
    paginas.push(tc.items.map((it) => ({
      str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0,
    })));
  }
  await doc.destroy();
  return paginas;
}

const ROTULO_FORMATO = {
  "nubank-cartao": "fatura de cartão (Nubank)",
  "nubank-conta": "extrato de conta (Nubank)",
  "extrato-banco": "extrato bancário",
  "generico": "CSV genérico",
  "ofx": "extrato OFX",
  "ofx-cartao": "fatura de cartão (OFX)",
  "pdf-tabela": "extrato em PDF (tabela)",
  "pdf-extrato": "extrato em PDF",
  "pdf-fatura": "fatura de cartão (PDF)",
};

function previaExtrato(nomeArq, ext) {
  const linhas = ext.linhas;
  const caixa = abrirModal(`
<div class="modal-cab">
  <h2>Importar extrato</h2>
  <button class="btn-x" data-fechar title="fechar">×</button>
</div>
<p class="modal-sub">${esc(nomeArq)} · ${linhas.length} lançamento(s) ·
  formato: <b>${esc(ROTULO_FORMATO[ext.formato] || ext.formato)}</b></p>
<div class="ext-controles">
  <label class="controle"><span>Conta</span>
    <select id="ext-conta"><option value="pessoal">Pessoal</option><option value="mei">PJ</option></select></label>
  <label class="controle caixa"><input type="checkbox" id="ext-inverter">
    <span>inverter despesa/renda</span></label>
  <span class="espaco"></span>
  <span class="ext-resumo" id="ext-resumo"></span>
</div>
<div class="ext-rolagem"><table class="ext-tabela">
  <thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Repete</th><th class="num">Valor</th></tr></thead>
  <tbody id="ext-corpo"></tbody>
</table></div>
<div class="modal-pe">
  <span class="modal-nota">Entram como <b>pagos/recebidos</b> na data do extrato. Linhas com
    <span class="etq padrao">padrão</span> se repetem todo mês no seu histórico; escolha
    <b>Repete</b> para virar recorrente (sempre, nº de vezes ou até uma data no calendário).</span>
  <button class="btn primario" id="ext-importar">Importar</button>
</div>`, "modal-larga");

  const corpo = $("#ext-corpo", caixa);

  const desenhar = () => {
    corpo.replaceChildren();
    linhas.forEach((l, i) => {
      const tr = document.createElement("tr");
      if (l.dup) tr.className = "dup";
      const marcada = l.sel !== undefined ? l.sel : !(l.dup || l.ignorarPadrao);
      l.sel = marcada;
      const cats = categorias(DB, l.tipo);
      if (!cats.includes(l.categoria)) cats.push(l.categoria);
      const d = deIso(l.data);
      const rep = l.rep?.modo || "";
      tr.innerHTML = `
<td><input type="checkbox" data-i="${i}" ${marcada ? "checked" : ""}></td>
<td class="ext-data">${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}</td>
<td class="ext-desc">${esc(l.descricao)}${l.dup ? ' <span class="etq">já existe</span>' : ""}${l.padrao && !l.dup ? ' <span class="etq padrao">padrão</span>' : ""}${l.aprendida && !l.dup ? ' <span class="etq ok">aprendida</span>' : ""}${l.ignorarPadrao && !l.dup ? ' <span class="etq">pgto. de fatura</span>' : ""}</td>
<td><select data-cat="${i}">${cats.map(c => `<option ${c === l.categoria ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></td>
<td><div class="rep-celula">
  <select data-rep="${i}">
    <option value="" ${!rep ? "selected" : ""}>Não</option>
    <option value="sempre" ${rep === "sempre" ? "selected" : ""}>Sempre</option>
    <option value="vezes" ${rep === "vezes" ? "selected" : ""}>Nº vezes</option>
    <option value="ate" ${rep === "ate" ? "selected" : ""}>Até…</option>
  </select>
  <input type="number" min="2" max="120" value="${l.rep?.n || 12}" data-rep-n="${i}" ${rep === "vezes" ? "" : "hidden"}>
  <input type="month" value="${l.rep?.ate || ""}" data-rep-ate="${i}" ${rep === "ate" ? "" : "hidden"}>
</div></td>
<td class="num ${l.tipo === "renda" ? "val-pos" : "val-neg"}">${l.tipo === "renda" ? "+" : "−"}${brl(l.valor)}</td>`;
      corpo.append(tr);
    });
    atualizarResumo();
  };

  const atualizarResumo = () => {
    const sel = linhas.filter(l => l.sel);
    const desp = soma(sel.filter(l => l.tipo === "despesa").map(l => l.valor));
    const rend = soma(sel.filter(l => l.tipo === "renda").map(l => l.valor));
    $("#ext-resumo", caixa).textContent =
      `${sel.length} selecionado(s) · saídas ${brl(desp)} · entradas ${brl(rend)}`;
    $("#ext-importar", caixa).disabled = !sel.length;
  };

  corpo.onchange = (ev) => {
    const alvo = ev.target;
    const chk = alvo.closest("input[type=checkbox]");
    if (chk) { linhas[+chk.dataset.i].sel = chk.checked; atualizarResumo(); return; }
    const cat = alvo.closest("select[data-cat]");
    if (cat) { linhas[+cat.dataset.cat].categoria = cat.value; return; }
    const rep = alvo.closest("select[data-rep]");
    if (rep) {
      const i = +rep.dataset.rep, l = linhas[i];
      l.rep = rep.value ? { ...(l.rep || {}), modo: rep.value } : null;
      const cel = rep.closest(".rep-celula");
      $("input[data-rep-n]", cel).hidden = rep.value !== "vezes";
      $("input[data-rep-ate]", cel).hidden = rep.value !== "ate";
      return;
    }
    const repN = alvo.closest("input[data-rep-n]");
    if (repN) { const l = linhas[+repN.dataset.repN]; if (l.rep) l.rep.n = +repN.value; return; }
    const repAte = alvo.closest("input[data-rep-ate]");
    if (repAte) { const l = linhas[+repAte.dataset.repAte]; if (l.rep) l.rep.ate = repAte.value; }
  };

  $("#ext-inverter", caixa).onchange = () => {
    for (const l of linhas) {
      l.tipo = l.tipo === "renda" ? "despesa" : "renda";
      l.categoria = l.categoriaSugerida?.[l.tipo] ?? l.categoria;
      l.rep = null;
    }
    marcarDuplicadas(linhas, DB);
    aplicarAprendizado(linhas);
    desenhar();
  };

  $("#ext-importar", caixa).onclick = () => {
    const conta = $("#ext-conta", caixa).value;
    const sel = linhas.filter(l => l.sel);
    let recsCriadas = 0;
    for (const l of sel) {
      // aprendizado: memoriza a categoria escolhida para esta descrição
      if (l.categoria && l.categoria !== "Outros")
        DB.aprendCat[l.tipo + "|" + chaveDesc(l.descricao)] = l.categoria;

      // repete: cria a recorrente (se ainda não existir uma igual)
      let recId = null;
      if (l.rep?.modo) {
        const k = chaveDesc(l.descricao);
        const ja = DB.recs.find(r => r.ativo && r.tipo === l.tipo
          && chaveDesc(r.descricao) === k && Math.abs(r.valor - l.valor) < 0.01);
        if (ja) recId = ja.id;
        else {
          const d = deIso(l.data);
          let fim = "";
          if (l.rep.modo === "vezes") {
            const n = Math.max(2, +l.rep.n || 2);
            const { a, m } = addMeses(d, n - 1);
            fim = `${a}-${String(m + 1).padStart(2, "0")}`;
          } else if (l.rep.modo === "ate") {
            fim = l.rep.ate || "";
          }
          DB.recSeq += 1;
          DB.recs.push({ id: DB.recSeq, tipo: l.tipo, conta, descricao: l.descricao,
            categoria: l.categoria, valor: l.valor, diaVenc: d.getDate(),
            inicio: l.data.slice(0, 7), fim, ativo: true });
          recId = DB.recSeq;
          recsCriadas += 1;
        }
      }

      _criarAvulso(DB, {
        tipo: l.tipo, conta, descricao: l.descricao, categoria: l.categoria,
        valor: l.valor, venc: deIso(l.data),
        status: "pago", pagoEm: l.data, valorPago: l.valor,
        origem: "extrato", recId,
      });
    }
    if (recsCriadas) _gerarMes(DB, compDe(hoje()));
    salvarDB();
    fecharModal();
    flash(`✓ ${sel.length} lançamento(s) importados` +
      (recsCriadas ? ` · ${recsCriadas} recorrente(s) criada(s)` : ""));
    render();
  };

  desenhar();
}

/* ================= sincronização com os CSVs locais ================= */

async function abrirSync() {
  const caixa = abrirModal(`
<div class="modal-cab">
  <h2>Sincronizar com os CSVs locais</h2>
  <button class="btn-x" data-fechar title="fechar">×</button>
</div>
<div id="sync-corpo" class="sync-corpo"><div class="vazio">Consultando o servidor local…</div></div>`);
  const corpo = $("#sync-corpo", caixa);

  let remoto;
  try {
    remoto = await baixarDados();
  } catch (e) {
    corpo.innerHTML = `<div class="vazio">⚠ ${esc(e.message)}</div>`;
    return;
  }
  const rl = remoto.lancs?.length || 0, rr = remoto.recs?.length || 0;

  corpo.innerHTML = `
<div class="sync-cols">
  <div class="mini-cartao"><span class="rotulo">CSVs do repositório (data/)</span>
    <b>${rl}</b> lançamento(s) · <b>${rr}</b> recorrente(s)</div>
  <div class="mini-cartao"><span class="rotulo">Perfil «${esc(PERFIL.nome)}»</span>
    <b>${DB.lancs.length}</b> lançamento(s) · <b>${DB.recs.length}</b> recorrente(s)</div>
</div>
<div class="sync-acao">
  <div><b>Trazer dos CSVs</b><br><span class="modal-nota">mescla os dados dos CSVs neste
    perfil — nada é apagado; duplicatas são ignoradas e check-ins são copiados.</span></div>
  <button class="btn mini" id="sync-trazer">Trazer</button>
</div>
<div class="sync-acao">
  <div><b>Enviar para os CSVs</b><br><span class="modal-nota">substitui os CSVs locais
    pelos dados deste perfil (um backup em data/backup-… é criado antes).</span></div>
  <button class="btn mini" id="sync-enviar">Enviar</button>
</div>`;

  $("#sync-trazer", caixa).onclick = () => {
    const r = mesclar(DB, remoto);
    salvarDB();
    fecharModal();
    flash(`✓ Trazidos ${r.novos} lançamento(s) e ${r.novasRecs} recorrente(s); ${r.atualizados} check-in(s) copiado(s)`);
    render();
  };
  $("#sync-enviar", caixa).onclick = async () => {
    if (!confirm("Substituir os CSVs locais (data/*.csv) pelos dados deste perfil?\nUm backup é criado antes.")) return;
    try {
      const r = await enviarDados({ lancs: DB.lancs, recs: DB.recs });
      fecharModal();
      flash(`✓ CSVs atualizados (${r.lancs} lançamentos, ${r.recs} recorrentes)` +
        (r.backup ? ` — backup em data/${r.backup}` : ""));
    } catch (e) {
      flash("⚠ " + e.message);
    }
  };
}

/* ================= investimentos (domínio) ================= */

function criarMovInvest(o) {
  DB.investSeq += 1;
  const m = {
    id: DB.investSeq, mov: o.mov, tipoInvest: o.tipoInvest || "Outros",
    descricao: (o.descricao || "").trim(), valor: o.valor,
    data: iso(o.data), conta: o.conta || "pessoal",
  };
  DB.invests.push(m);
  salvarDB();
  return m;
}

function agregadosInvest() {
  const movs = DB.invests.filter(m => estado.conta === "tudo" || m.conta === estado.conta);
  const porTipo = {};
  for (const m of movs) {
    const t = porTipo[m.tipoInvest] ??= { investido: 0, resgatado: 0, rendimento: 0 };
    if (m.mov === "aplicacao") t.investido += m.valor;
    else if (m.mov === "resgate") t.resgatado += m.valor;
    else t.rendimento += m.valor;
  }
  for (const t of Object.values(porTipo))
    t.saldo = Math.max(Math.round((t.investido - t.resgatado) * 100) / 100, 0);
  return { movs, porTipo };
}

// tom de cada tipo na rampa do acento (ordem = posição na carteira ordenada)
function opPorTipoInvest(tipos) {
  const passo = Math.min(0.13, 0.78 / Math.max(tipos.length - 1, 1));
  return new Map(tipos.map(([nome], i) =>
    [nome, Math.max(1 - i * passo, 0.2).toFixed(2)]));
}

/* ================= páginas ================= */

function cabecalhoFiltros() {
  const opsP = PERIODOS.map(([k, r]) => `<option value="${k}" ${estado.p === k ? "selected" : ""}>${r}</option>`).join("");
  const { ini, fim } = resolverPeriodo(estado.p);
  const diario = Math.round((fim - ini) / 864e5) + 1 <= 45;
  return `
<div class="filtros">
  <label class="controle"><span>Período</span>
    <select id="sel-p">${opsP}</select></label>
  <span class="controle"><span>${diario ? "Diário" : "Mensal"}</span></span>
  <label class="controle"><span>Comparar</span>
    <select id="sel-comp">
      <option value="anterior" ${estado.comp === "anterior" ? "selected" : ""}>Período anterior</option>
      <option value="ano" ${estado.comp === "ano" ? "selected" : ""}>Mesmo período do ano passado</option>
    </select></label>
  <span class="espaco"></span>
  <button class="btn mini" id="btn-importacao">Importação</button>
  <button class="btn primario add" data-form="despesa">+ Despesa</button>
  <button class="btn mini add" data-form="renda">+ Rendimento</button>
</div>`;
}

// Início: boas-vindas com o dino do perfil + galeria dos dinossauros (com
// período geológico e descrição; troca de tema direto pelo cartão)
function paginaInicio() {
  const h = hoje();
  const compAtual = compDe(h);
  const fimMes = iso(new Date(h.getFullYear(), h.getMonth(), fimDoMes(h.getFullYear(), h.getMonth())));
  const pagoMes = soma(DB.lancs.filter(l => l.status === "pago" && l.tipo === "despesa"
    && filtraConta(l) && l.pagoEm && l.pagoEm.slice(0, 7) === compAtual).map(efetivo));
  const pend = DB.lancs.filter(l => l.status === "pendente" && filtraConta(l) && l.venc <= fimMes);
  const aPagar = soma(pend.filter(l => l.tipo === "despesa").map(l => l.valor));
  const aReceber = soma(pend.filter(l => l.tipo === "renda").map(l => l.valor));
  const skAtiva = skinDe(PERFIL);

  const cardDino = ([k, s]) => {
    const inf = DINO_INFO[k];
    const ativo = k === skAtiva;
    return `
<div class="dino-cartao cartao${ativo ? " ativo" : ""}" style="--dc:${s.tile || "var(--accent)"}">
  <div class="dino-cartao-topo">
    <svg class="dino-arte" viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>
    <div class="dino-cartao-id">
      <b>${esc(s.rotulo)}</b>
      <i>${esc(s.nomeCompleto)}</i>
      <span class="chip-periodo">${esc(inf.periodo)}</span>
    </div>
  </div>
  <p class="dino-desc">${inf.desc}</p>
  <div class="dino-meta"><span>📍 ${esc(inf.onde)}</span><span>📏 ${esc(inf.porte)}</span></div>
  <div class="dino-acao">${ativo
    ? '<span class="etq ok">seu tema</span>'
    : `<button class="btn mini" data-usar-tema="${k}">Usar este tema</button>`}</div>
</div>`;
  };

  const s = SKINS[skAtiva];
  return `
<div class="inicio-hero">
  <svg class="inicio-dino" viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>
  <div class="inicio-tx">
    <h1>Olá, ${esc(PERFIL.nome)}!</h1>
    <p class="inicio-data">${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][h.getDay()]},
      ${h.getDate()} de ${MESES[h.getMonth()]} · até agora no mês:
      <b class="val-neutro">${brl(pagoMes)}</b> pagos ·
      <b class="val-neg">${brl(aPagar)}</b> a pagar ·
      <b class="val-pos">${brl(aReceber)}</b> a receber</p>
    <div class="inicio-acoes">
      <a class="btn primario" href="#/visao">Ver visão geral</a>
      <button class="btn mini add" data-form="despesa">+ Despesa</button>
      <button class="btn mini" id="btn-importacao">Importação</button>
    </div>
  </div>
</div>

<h1 class="secao">Os dinossauros do dinofinance
  <span class="secao-sub">cada tema é um dinossauro, com seu período e seu habitat</span></h1>
<div class="dino-grade">
  ${Object.entries(SKINS).map(cardDino).join("")}
</div>`;
}

function paginaHome() {
  const h = hoje();
  const { ini, fim } = resolverPeriodo(estado.p);
  const cmp = comparacao(estado.comp, ini, fim);

  // ---- Hoje (mês corrente acumulado vs comparação)
  const mIni = new Date(h.getFullYear(), h.getMonth(), 1);
  const mFim = new Date(h.getFullYear(), h.getMonth(), fimDoMes(h.getFullYear(), h.getMonth()));
  const sMes = serie("despesa", mIni, mFim);
  const cMes = comparacao(estado.comp, mIni, mFim);
  const sMesAnt = serie("despesa", cMes.ini, cMes.fim);
  const cumAtual = cumulativa(sMes.vals).map((v, i) => i <= h.getDate() - 1 ? v : null);
  const cumAnt = cumulativa(sMesAnt.vals);
  const nDias = Math.max(sMes.vals.length, cumAnt.length);
  const labelsMes = [];
  for (let i = 0; i < nDias; i++) labelsMes.push(ddmm(addDias(mIni, i)));

  const gastoHoje = soma(DB.lancs.filter(l => l.status === "pago" && l.pagoEm === iso(h)
    && l.tipo === "despesa" && filtraConta(l)).map(efetivo));
  const ontem = addDias(h, -1);
  const gastoOntem = soma(DB.lancs.filter(l => l.status === "pago" && l.pagoEm === iso(ontem)
    && l.tipo === "despesa" && filtraConta(l)).map(efetivo));

  const fimMesIso = iso(mFim);
  const pend = DB.lancs.filter(l => l.status === "pendente" && filtraConta(l) && l.venc <= fimMesIso);
  const aPagar = soma(pend.filter(l => l.tipo === "despesa").map(l => l.valor));
  const aReceber = soma(pend.filter(l => l.tipo === "renda").map(l => l.valor));
  const nVencidas = pend.filter(l => l.tipo === "despesa" && l.venc < iso(h)).length;

  // ---- Visão geral (período selecionado)
  const sEnt = serie("renda", ini, fim), sSai = serie("despesa", ini, fim);
  const sEntC = serie("renda", cmp.ini, cmp.fim), sSaiC = serie("despesa", cmp.ini, cmp.fim);
  const tE = soma(sEnt.vals), tS = soma(sSai.vals);
  const tEC = soma(sEntC.vals), tSC = soma(sSaiC.vals);
  const alinhar = (a, b) => { // mesma quantidade de pontos p/ sobrepor
    const n = Math.max(a.length, b.length);
    return [[...a, ...Array(n - a.length).fill(0)], [...b, ...Array(n - b.length).fill(0)]];
  };
  const [entA, entC] = alinhar(sEnt.vals, sEntC.vals);
  const [saiA, saiC] = alinhar(sSai.vals, sSaiC.vals);
  const labelsP = sEnt.labels.length >= sEntC.labels.length ? sEnt.labels : sEntC.labels;

  const catsD = porCategoria("despesa", ini, fim);
  const catsR = porCategoria("renda", ini, fim, 4);
  const pendLista = pend.slice().sort((x, y) => x.venc < y.venc ? -1 : 1).slice(0, 6);
  const recsAtivas = DB.recs.filter(r => r.ativo && (estado.conta === "tudo" || r.conta === estado.conta));

  return `
<h1 class="secao">Hoje <span class="secao-sub">${["dom","seg","ter","qua","qui","sex","sáb"][h.getDay()]}, ${h.getDate()} de ${MESES[h.getMonth()]}</span></h1>
<div class="hoje-grade">
  <div class="hoje-esq">
    <div class="hoje-cols">
      <div class="hoje-col"><span class="rotulo">Saídas hoje</span>
        <b class="val-neutro">${brl(gastoHoje)}</b>
        <div class="hoje-hora">${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div>
      <div class="hoje-col"><span class="rotulo">${ddmm(ontem)}</span>
        <b class="val-mut">${brl(gastoOntem)}</b>
        <div class="hoje-hora">ontem</div></div>
    </div>
    ${chartSVG(labelsMes, cumAtual, cumAnt, 150)}
  </div>
  <div class="hoje-dir">
    <div class="mini-cartao">
      <div class="topo-mini"><span class="rotulo">A pagar no mês</span><a class="ver" href="#/despesas">Ver</a></div>
      <b class="val-neg">${brl(aPagar)}</b>
      <div class="mini-sub">${nVencidas ? nVencidas + " conta(s) vencida(s)" : "nenhuma vencida"}</div>
    </div>
    <div class="mini-cartao">
      <div class="topo-mini"><span class="rotulo">A receber no mês</span><a class="ver" href="#/rendimentos">Ver</a></div>
      <b class="val-pos">${brl(aReceber)}</b>
      <div class="mini-sub">previsto até ${ddmm(mFim)}</div>
    </div>
  </div>
</div>

<h1 class="secao">Visão geral</h1>
${cabecalhoFiltros()}

<div class="grade3">
  <div class="cartao">
    <span class="rotulo">Entradas <i class="info" title="rendimentos recebidos no período">ⓘ</i></span>
    <div class="linha-grande"><span class="grande">${brl(tE)}</span>${deltaHtml(tE, tEC, true)}</div>
    <div class="anterior">${brl(tEC)} · ${cmp.rotulo}</div>
    ${chartSVG(labelsP, entA, entC)}
    <div class="cartao-pe"><span>Atualizado agora</span><a href="#/rendimentos">Mais detalhes</a></div>
  </div>
  <div class="cartao">
    <span class="rotulo">Saídas <i class="info" title="despesas pagas no período">ⓘ</i></span>
    <div class="linha-grande"><span class="grande">${brl(tS)}</span>${deltaHtml(tS, tSC, false)}</div>
    <div class="anterior">${brl(tSC)} · ${cmp.rotulo}</div>
    ${chartSVG(labelsP, saiA, saiC)}
    <div class="cartao-pe"><span>Atualizado agora</span><a href="#/despesas">Mais detalhes</a></div>
  </div>
  <div class="cartao">
    <span class="rotulo">Despesas por categoria <i class="info" title="pagas no período">ⓘ</i></span>
    ${quebraHtml(catsD)}
    <div class="cartao-pe"><span>${esc(PERIODOS.find(([k]) => k === estado.p)[1])}</span><a href="#/despesas">Ver todas</a></div>
  </div>
</div>

<div class="grade3">
  <div class="cartao">
    <span class="rotulo">Pendências do mês</span>
    ${pendLista.map(l => linhaLanc(l, false)).join("") || '<div class="vazio">Nada pendente ✓</div>'}
    <div class="cartao-pe"><span>${pend.length} em aberto</span><a href="#/despesas">Fazer check-in</a></div>
  </div>
  <div class="cartao">
    <span class="rotulo">Rendimentos por categoria</span>
    ${quebraHtml(catsR)}
    <div class="cartao-pe"><span>${esc(PERIODOS.find(([k]) => k === estado.p)[1])}</span><a href="#/rendimentos">Ver todos</a></div>
  </div>
  <div class="cartao">
    <span class="rotulo">Recorrentes ativas</span>
    ${recsAtivas.map(r => `
      <div class="linha simples">
        <div class="linha-info"><div class="linha-t">${esc(r.descricao)}${r.conta === "mei" ? '<span class="etq pj">PJ</span>' : ""}</div>
          <div class="linha-s">todo dia ${r.diaVenc} · ${r.fim ? "até " + r.fim : "contínua"}</div></div>
        <div class="linha-dir"><b class="${r.tipo === "renda" ? "val-pos" : "val-neg"}">${r.tipo === "renda" ? "+" : ""}${brl(r.valor)}</b></div>
      </div>`).join("") || '<div class="vazio">Nenhuma recorrente</div>'}
    <div class="cartao-pe"><span>${recsAtivas.length} ativa(s)</span><button class="link-btn" data-form="despesa">Adicionar</button></div>
  </div>
</div>`;
}

function formLanc(tipo) {
  const todas = categorias(DB, tipo);
  return `
<form class="form" id="form-lanc" data-tipo="${tipo}">
  <div class="campo-linha">
    <label class="campo"><span>Conta</span>
      <select name="conta"><option value="pessoal">Pessoal</option><option value="mei">PJ</option></select></label>
    <label class="campo"><span>Categoria</span>
      <input name="categoria" list="dl-cats" placeholder="${tipo === "renda" ? "Salário" : "Moradia, Mercado, Carro…"}">
      <datalist id="dl-cats">${todas.map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
  </div>
  <label class="campo"><span>Descrição</span>
    <input name="descricao" required placeholder="${tipo === "renda" ? "ex.: Salário, Nota fiscal…" : "ex.: Aluguel, Seguro do carro…"}"></label>
  <div class="campo-linha">
    <label class="campo"><span>Valor (R$)</span>
      <input name="valor" required inputmode="decimal" placeholder="0,00"></label>
    <label class="campo"><span>${tipo === "renda" ? "Recebimento" : "Vencimento"}</span>
      <input name="venc" placeholder="dia (1-31) ou DD/MM/AAAA"></label>
  </div>
  <label class="campo"><span>Repetição</span>
    <select name="repeticao" id="f-rep">
      <option value="unica">Única</option>
      <option value="recorrente">Recorrente (todo mês)</option>
      <option value="parcelada">Parcelada</option>
    </select></label>
  <div class="subgrupo" id="f-grupo-rec" hidden>
    <label class="campo caixa"><input type="checkbox" name="continua" id="f-continua" checked>
      <span><b>Contínua</b> — sem data de fim (ex.: aluguel)</span></label>
    <label class="campo"><span>Até quando?</span>
      <input name="fim" id="f-fim" type="month" disabled></label>
  </div>
  <div class="subgrupo" id="f-grupo-parc" hidden>
    <div class="campo-linha">
      <label class="campo"><span>Nº de parcelas</span>
        <input name="parcelas" type="number" min="2" max="120" value="2"></label>
      <label class="campo caixa"><input type="checkbox" name="valorParcela">
        <span>o valor é de <b>cada parcela</b></span></label>
    </div>
  </div>
  <button class="btn primario">${tipo === "renda" ? "Adicionar rendimento" : "Adicionar despesa"}</button>
</form>`;
}

// formulário de lançamento em modal — aberto pelos botões "+ Despesa"/"+ Rendimento"
function abrirFormLanc(tipo) {
  const caixa = abrirModal(`
<div class="modal-cab">
  <h2>${tipo === "renda" ? "Novo rendimento" : "Nova despesa"}</h2>
  <button class="btn-x" data-fechar title="fechar">×</button>
</div>
${formLanc(tipo)}
<p class="form-nota">Recorrente usa o <b>dia</b> informado no vencimento e repete todo mês
  (contínua) ou até o mês escolhido. Parcelada divide o valor total a partir do primeiro
  vencimento. Tem o extrato do banco (CSV ou PDF)?
  <button type="button" class="link-btn" id="btn-importar-nota">Importar extrato</button></p>`);
  ligarForm($("#form-lanc", caixa), () => { fecharModal(); render(); });
  $("#btn-importar-nota", caixa).onclick = () => { fecharModal(); abrirImportacao(); };
}

function paginaLancs(tipo) {
  const titulo = tipo === "renda" ? "Rendimentos" : "Despesas";
  const h = hoje();
  const fimMes = iso(new Date(h.getFullYear(), h.getMonth(), fimDoMes(h.getFullYear(), h.getMonth())));
  const compAtual = compDe(h);
  const itens = DB.lancs
    .filter(l => l.tipo === tipo && l.status !== "pulado" && filtraConta(l)
      && (l.comp === compAtual || (l.status === "pendente" && l.venc <= fimMes)))
    .sort((x, y) => (x.status === "pendente" ? 0 : 1) - (y.status === "pendente" ? 0 : 1)
      || (x.venc < y.venc ? -1 : 1));
  const pendN = itens.filter(l => l.status === "pendente").length;
  const pagasN = itens.length - pendN;
  const total = soma(itens.map(efetivo));
  const fatias = fatiasStatus(itens);

  return `
<h1 class="secao">${titulo}
  <span class="secao-sub">${MESES[h.getMonth()]} de ${h.getFullYear()}</span></h1>
<div class="filtros">
  <span class="controle"><span>${itens.length} lançamento(s) no mês · ${pendN} em aberto</span></span>
  <span class="espaco"></span>
  <button class="btn mini" id="btn-importacao">Importação</button>
  <button class="btn primario add" data-form="${tipo}">+ ${tipo === "renda" ? "Rendimento" : "Despesa"}</button>
</div>
<div class="grade-pagina">
  <div class="cartao">
    <span class="rotulo">${tipo === "renda" ? "Recebidos × a receber" : "Pagas × em aberto"}</span>
    ${donutComLegenda(fatias, brlCurto(total), "total do mês")}
  </div>
  <div class="cartao">
    <div class="secao" style="border:0;padding:0;margin:0 0 6px;font-size:14px">
      <span class="rotulo">Lançamentos do mês</span>
      <span class="contador">${pendN} em aberto</span>
    </div>
    ${itens.map(l => linhaLanc(l)).join("") || '<div class="vazio">Nada por aqui ainda — use o botão acima para adicionar</div>'}
  </div>
</div>`;
}

/* ---------------- página Investimentos ---------------- */

const ROTULO_MOV = { aplicacao: "Aplicação", resgate: "Resgate", rendimento: "Rendimento" };

function paginaInvest() {
  const { movs, porTipo } = agregadosInvest();
  const tipos = Object.entries(porTipo).sort((a, b) => b[1].saldo - a[1].saldo);
  const totalInvestido = soma(tipos.map(([, t]) => t.saldo));
  const totalRend = soma(tipos.map(([, t]) => t.rendimento));

  const opTipo = opPorTipoInvest(tipos);
  const fatias = tipos.filter(([, t]) => t.saldo > 0).map(([nome, t]) => ({
    nome, valor: t.saldo, cor: "var(--accent)", op: opTipo.get(nome),
  }));

  const linhasRend = tipos.map(([nome, t]) => `
    <div class="inv-linha">
      <span class="dl-cor" style="background:var(--accent);opacity:${opTipo.get(nome)}"></span>
      <div class="inv-nome">${esc(nome)}
        <div class="inv-meta">investido ${brl(t.saldo)}</div></div>
      <div style="text-align:right">
        <b class="inv-val ${t.rendimento ? "val-pos" : "val-mut"}">${t.rendimento ? "+" + brl(t.rendimento) : "—"}</b>
        <div class="inv-meta">${t.saldo > 0 && t.rendimento ? (t.rendimento / t.saldo * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "% sobre o investido" : "rendimento"}</div>
      </div>
    </div>`).join("");

  const ordenados = movs.slice().sort((x, y) => x.data < y.data ? 1 : -1).slice(0, 30);
  const linhasMov = ordenados.map(m => {
    const d = deIso(m.data);
    const pos = m.mov !== "aplicacao";
    return `
<div class="linha">
  <div class="dia"><span class="d">${String(d.getDate()).padStart(2, "0")}</span><span class="m">${MESES_ABR[d.getMonth()]}</span></div>
  <div class="linha-info">
    <div class="linha-t">${esc(m.tipoInvest)}${m.conta === "mei" ? '<span class="etq pj">PJ</span>' : ""}
      <span class="etq ${m.mov === "rendimento" ? "ok" : ""}">${ROTULO_MOV[m.mov]}</span></div>
    <div class="linha-s">${esc(m.descricao || "—")}</div>
  </div>
  <div class="linha-dir"><b class="${pos ? "val-pos" : "val-neutro"}">${pos ? "+" : "−"}${brl(m.valor)}</b></div>
  <div class="linha-acoes"><button class="btn-x" data-acao="inv-excluir" data-id="${m.id}" title="excluir">×</button></div>
</div>`;
  }).join("");

  return `
<h1 class="secao">Investimentos
  <span class="secao-sub">carteira, aportes e rendimentos</span></h1>
<div class="filtros">
  <span class="controle"><span>${movs.length} movimentação(ões)</span></span>
  <span class="espaco"></span>
  <button class="btn primario add" id="btn-form-invest">+ Investimento</button>
</div>
<div class="grade-pagina">
  <div class="cartao">
    <span class="rotulo">Carteira por tipo <i class="info" title="aplicações − resgates, por tipo de investimento">ⓘ</i></span>
    ${donutComLegenda(fatias, brlCurto(totalInvestido), "total investido")}
  </div>
  <div class="cartao">
    <span class="rotulo">Rendimento por tipo <i class="info" title="rendimentos registrados por tipo de investimento">ⓘ</i></span>
    ${linhasRend || '<div class="vazio">Nenhum investimento ainda — use “+ Investimento”</div>'}
    ${tipos.length ? `<div class="cartao-pe"><span>Total investido ${brl(totalInvestido)}</span><b class="val-pos">${totalRend ? "+" + brl(totalRend) : ""}</b></div>` : ""}
  </div>
</div>
<div class="cartao" style="margin-top:20px">
  <span class="rotulo">Movimentações</span>
  ${linhasMov || '<div class="vazio">Nenhuma movimentação registrada</div>'}
</div>`;
}

function abrirFormInvest() {
  const tiposUsados = [...new Set([...TIPOS_INVEST, ...DB.invests.map(m => m.tipoInvest)])]
    .filter(t => t !== "Outros").sort((a, b) => a.localeCompare(b, "pt-BR"));
  tiposUsados.push("Outros");
  const caixa = abrirModal(`
<div class="modal-cab">
  <h2>Novo investimento</h2>
  <button class="btn-x" data-fechar title="fechar">×</button>
</div>
<form class="form" id="form-invest">
  <div class="campo-linha">
    <label class="campo"><span>Movimento</span>
      <select name="mov">
        <option value="aplicacao">Aplicação (aporte)</option>
        <option value="resgate">Resgate</option>
        <option value="rendimento">Rendimento (juros/dividendos)</option>
      </select></label>
    <label class="campo"><span>Conta</span>
      <select name="conta"><option value="pessoal">Pessoal</option><option value="mei">PJ</option></select></label>
  </div>
  <div class="campo-linha">
    <label class="campo"><span>Tipo de investimento</span>
      <input name="tipoInvest" list="dl-tinv" required placeholder="CDB, Ações, Cripto…">
      <datalist id="dl-tinv">${tiposUsados.map(t => `<option value="${esc(t)}">`).join("")}</datalist></label>
    <label class="campo"><span>Valor (R$)</span>
      <input name="valor" required inputmode="decimal" placeholder="0,00"></label>
  </div>
  <label class="campo"><span>Descrição (opcional)</span>
    <input name="descricao" placeholder="ex.: CDB 110% CDI, PETR4…"></label>
  <label class="campo"><span>Data</span>
    <input name="data" type="date" value="${iso(hoje())}"></label>
  <button class="btn primario">Registrar</button>
</form>`);
  $("#form-invest", caixa).onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      const valor = parseValor(f.get("valor"));
      const dTxt = String(f.get("data") || "");
      const m = criarMovInvest({
        mov: String(f.get("mov")), conta: String(f.get("conta")),
        tipoInvest: String(f.get("tipoInvest") || "Outros").trim() || "Outros",
        descricao: String(f.get("descricao") || ""), valor,
        data: /^\d{4}-\d{2}-\d{2}$/.test(dTxt) ? deIso(dTxt) : hoje(),
      });
      fecharModal();
      flash(`✓ ${ROTULO_MOV[m.mov]} de ${brl(m.valor)} em ${m.tipoInvest} registrado`);
      render();
    } catch (e) {
      flash("⚠ " + e.message);
    }
  };
}

/* ---------------- perfil (configurações da conta) ---------------- */

function abrirPerfil() {
  const temSenha = !!PERFIL.senha;
  const caixa = abrirModal(`
<div class="modal-cab">
  <h2>Meu perfil</h2>
  <button class="btn-x" data-fechar title="fechar">×</button>
</div>
<form class="form" id="form-perfil-cfg" style="margin-top:10px">
  <div class="campo-linha">
    <label class="campo"><span>Nome</span>
      <input name="nome" required value="${esc(PERFIL.nome || "")}"></label>
    <label class="campo"><span>E-mail</span>
      <input name="email" type="email" value="${esc(PERFIL.email || "")}"></label>
  </div>
  <label class="campo"><span>Forma de pagamento padrão</span>
    <select name="pagamento">
      <option value="">— nenhuma —</option>
      ${FORMAS_PAGAMENTO.map(fp => `<option ${PERFIL.pagamento === fp ? "selected" : ""}>${fp}</option>`).join("")}
    </select></label>
  <button class="btn primario">Salvar alterações</button>
</form>

<div class="form campo-tema" style="margin-top:16px">
  <span class="rotulo">Tema do perfil</span>
  <div class="skin-grade" id="cfg-tema">${htmlTemas("tema-cfg", skinDe(PERFIL))}</div>
  <p class="form-nota">O tema muda o acento, os gráficos, a marca e o favicon — só para este
    perfil. Dica: cada dinossauro tem sua vibe… e o Carnotauro guarda uma dança. 🦖</p>
</div>

<form class="form" id="form-perfil-senha" style="margin-top:16px">
  <span class="rotulo">Senha do perfil ${temSenha ? '<span class="etq ok">definida</span>' : '<span class="etq">sem senha</span>'}</span>
  ${temSenha ? `
  <label class="campo"><span>Senha atual</span>
    <input name="atual" type="password" required></label>` : ""}
  <label class="campo"><span>${temSenha ? "Nova senha (vazia = remover a senha)" : "Nova senha"}</span>
    <input name="nova" type="password" ${temSenha ? "" : "required"} minlength="4"
      placeholder="mín. 4 caracteres"></label>
  <button class="btn mini">${temSenha ? "Trocar/remover senha" : "Definir senha"}</button>
  <p class="form-nota">A senha protege este perfil <b>neste navegador</b> (é pedida ao entrar).
    Não há recuperação: se esquecer, só excluindo a conta.</p>
</form>

<div class="zona-perigo">
  <div class="acao"><span>Apagar todos os lançamentos, recorrentes e investimentos
    deste perfil (o perfil continua existindo).</span>
    <button class="btn mini perigo" id="pf-zerar">Apagar dados</button></div>
  <div class="acao"><span>Excluir a conta «${esc(PERFIL.nome)}» e todos os dados dela
    deste navegador. Não tem volta.</span>
    <button class="btn mini perigo" id="pf-excluir">Excluir conta</button></div>
</div>`);

  $("#form-perfil-cfg", caixa).onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    PERFIL = store.atualizarPerfil(PERFIL.id, {
      nome: String(f.get("nome")).trim() || PERFIL.nome,
      email: String(f.get("email")).trim(),
      pagamento: String(f.get("pagamento") || ""),
    });
    atualizarAvatar();
    fecharModal();
    flash("✓ Perfil atualizado");
  };

  // tema: aplica e salva na hora (prévia imediata, sem precisar de "Salvar")
  $("#cfg-tema", caixa).onchange = (ev) => definirTema(ev.target.value);

  $("#form-perfil-senha", caixa).onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      if (PERFIL.senha) {
        const atual = String(f.get("atual") || "");
        if (await hashSenha(atual, PERFIL.senha.salt) !== PERFIL.senha.hash)
          throw new Error("senha atual incorreta");
      }
      const nova = String(f.get("nova") || "");
      if (!nova) {
        PERFIL = store.atualizarPerfil(PERFIL.id, { senha: null });
        flash("Senha removida deste perfil.");
      } else {
        if (nova.length < 4) throw new Error("a nova senha precisa de 4+ caracteres");
        const salt = novoSalt();
        PERFIL = store.atualizarPerfil(PERFIL.id, {
          senha: { salt, hash: await hashSenha(nova, salt) } });
        flash("✓ Senha definida para este perfil.");
      }
      fecharModal();
    } catch (e) {
      flash("⚠ " + e.message);
    }
  };

  $("#pf-zerar", caixa).onclick = () => {
    if (!confirm("Apagar TODOS os dados deste perfil (lançamentos, recorrentes e investimentos)?")) return;
    DB = dbVazio();
    salvarDB();
    fecharModal();
    flash("Dados do perfil apagados.");
    render();
  };
  $("#pf-excluir", caixa).onclick = () => {
    if (!confirm(`Excluir a conta «${PERFIL.nome}» e todos os dados dela deste navegador?`)) return;
    if (!confirm("Tem certeza? Essa ação não tem volta.")) return;
    store.removerPerfil(PERFIL.id);
    location.reload();
  };
}

/* ================= render & eventos ================= */

const ROTAS = {
  "": paginaInicio, "#/": paginaInicio,
  "#/visao": paginaHome,
  "#/despesas": () => paginaLancs("despesa"),
  "#/rendimentos": () => paginaLancs("renda"),
  "#/investimentos": paginaInvest,
};

function render() {
  if (!PERFIL) return;   // fora do app (site público) não há o que renderizar
  const rota = ROTAS[location.hash] ? location.hash : "#/";
  const alvo = { "#/": "inicio", "#/visao": "home", "#/despesas": "despesas",
    "#/rendimentos": "rendas", "#/investimentos": "invest" }[rota] || "inicio";
  $$(".navlink").forEach(a => a.classList.toggle("ativo", a.dataset.rota === alvo));

  $("#seg-conta").replaceChildren(...[["tudo", "Tudo"], ["pessoal", "Pessoal"], ["mei", "PJ"]].map(([k, r]) => {
    const b = document.createElement("button");
    b.className = "seg" + (estado.conta === k ? " on" : "");
    b.textContent = r;
    b.onclick = () => { estado.conta = k; salvarEstado(); render(); };
    return b;
  }));

  const c = $("#conteudo");
  c.innerHTML = ROTAS[rota]();
  ligarCharts(c);

  const selP = $("#sel-p"), selC = $("#sel-comp");
  if (selP) selP.onchange = () => { estado.p = selP.value; salvarEstado(); render(); };
  if (selC) selC.onchange = () => { estado.comp = selC.value; salvarEstado(); render(); };

  const bImp = $("#btn-importacao");
  if (bImp) bImp.onclick = abrirImportacao;
  const bInv = $("#btn-form-invest");
  if (bInv) bInv.onclick = abrirFormInvest;
  $$("[data-form]", c).forEach(b => b.onclick = () => abrirFormLanc(b.dataset.form));
  $$("[data-usar-tema]", c).forEach(b => b.onclick = () => {
    definirTema(b.dataset.usarTema);
    render();   // atualiza o selo "seu tema" nos cartões do Início
  });

  c.onclick = (ev) => {
    const b = ev.target.closest("[data-acao]");
    if (!b) return;
    const id = +b.dataset.id;
    if (b.dataset.acao === "pagar") {
      const l = pagar(id);
      if (l) flash(`✓ ${rotulo(l)} ${l.tipo === "renda" ? "recebido" : "pago"} (${brl(l.valorPago)})`, l.id);
      render();
    } else if (b.dataset.acao === "desfazer") {
      const l = desfazer(id);
      if (l) flash(`${rotulo(l)} voltou para pendente`);
      render();
    } else if (b.dataset.acao === "excluir") {
      const l = lancPorId(id);
      if (l && confirm(`Excluir ${rotulo(l)}?`)) {
        const r = excluir(id);
        flash(r.pulado ? `${l.descricao}: ocorrência ignorada (recorrente segue ativa)` : `${rotulo(l)} excluído`);
        render();
      }
    } else if (b.dataset.acao === "inv-excluir") {
      const m = DB.invests.find(x => x.id === id);
      if (m && confirm(`Excluir ${ROTULO_MOV[m.mov].toLowerCase()} de ${brl(m.valor)} em ${m.tipoInvest}?`)) {
        DB.invests = DB.invests.filter(x => x.id !== id);
        salvarDB();
        flash("Movimentação excluída.");
        render();
      }
    }
  };
}

function ligarForm(form, aoCriar) {
  const rep = $("#f-rep", form), gRec = $("#f-grupo-rec", form), gParc = $("#f-grupo-parc", form);
  const chkCont = $("#f-continua", form), inFim = $("#f-fim", form);
  const atualiza = () => {
    gRec.hidden = rep.value !== "recorrente";
    gParc.hidden = rep.value !== "parcelada";
    inFim.disabled = chkCont.checked;
  };
  rep.onchange = atualiza;
  chkCont.onchange = atualiza;
  atualiza();

  form.onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const tipo = form.dataset.tipo;
    try {
      const valor = parseValor(f.get("valor"));
      const base = {
        tipo, conta: f.get("conta"), descricao: String(f.get("descricao")),
        categoria: String(f.get("categoria") || "Outros"), valor,
      };
      const vencTxt = String(f.get("venc") || "");
      if (f.get("repeticao") === "recorrente") {
        if (!/^\d{1,2}$/.test(vencTxt.trim()))
          throw new Error("recorrente precisa do dia do vencimento (1-31)");
        const fimMes = chkCont.checked ? "" : String(f.get("fim") || "");
        if (!chkCont.checked && !fimMes) throw new Error("informe até quando (ou marque contínua)");
        criarRecorrente({ ...base, diaVenc: +vencTxt, fim: fimMes });
        flash(`Recorrente criada: ${base.descricao} todo dia ${vencTxt}${fimMes ? " até " + fimMes : " (contínua)"}`);
      } else if (f.get("repeticao") === "parcelada") {
        const n = +f.get("parcelas");
        if (!(n >= 2)) throw new Error("informe o nº de parcelas (≥ 2)");
        const novos = criarParcelado({ ...base, n, primeiro: resolverVenc(vencTxt),
          valorPorParcela: !!f.get("valorParcela") });
        flash(`${base.descricao}: ${n}x de ${brl(novos[0].valor)} criado`);
      } else {
        criarAvulso({ ...base, venc: resolverVenc(vencTxt) });
        flash(`${tipo === "renda" ? "Rendimento" : "Despesa"} criado: ${base.descricao} (${brl(valor)})`);
      }
      form.reset();
      if (aoCriar) aoCriar();
      else render();
    } catch (e) {
      flash("⚠ " + e.message);
    }
  };
}

/* ================= dados de exemplo ================= */

function seedExemplo() {
  const h = hoje();
  const recsDef = [
    ["Salário", "Salário", 5200, 5, "renda", "pessoal"],
    ["Aluguel", "Moradia", 1550, 10, "despesa", "pessoal"],
    ["Energia", "Moradia", 184.5, 20, "despesa", "pessoal"],
    ["Internet", "Internet e telefone", 99.9, 15, "despesa", "pessoal"],
    ["Academia", "Academia", 89.9, 8, "despesa", "pessoal"],
    ["Streaming", "Assinaturas", 55.9, 12, "despesa", "pessoal"],
    ["Seguro do carro", "Seguros", 168, 14, "despesa", "pessoal"],
    ["Financiamento do carro", "Financiamento", 620, 18, "despesa", "pessoal"],
    ["DAS (imposto MEI)", "Impostos", 75.9, 20, "despesa", "mei"],
    ["Contador", "Serviços", 120, 10, "despesa", "mei"],
  ];
  const ini6 = addMeses(h, -5);
  const iniComp = `${ini6.a}-${String(ini6.m + 1).padStart(2, "0")}`;
  for (const [d, c, v, dia, t, ct] of recsDef) {
    DB.recSeq += 1;
    DB.recs.push({ id: DB.recSeq, tipo: t, conta: ct, descricao: d, categoria: c,
      valor: v, diaVenc: dia, inicio: iniComp, fim: "", ativo: true });
  }
  for (let k = -5; k <= 0; k++) {
    const { a, m } = addMeses(h, k);
    gerarMes(`${a}-${String(m + 1).padStart(2, "0")}`);
  }
  // parcelado 8x há 3 meses
  const p0 = addMeses(h, -3);
  criarParcelado({ tipo: "despesa", conta: "pessoal", descricao: "Notebook",
    categoria: "Compras", valor: 3200, n: 8, primeiro: clampDia(p0.a, p0.m, 6) });
  // avulsos variáveis
  for (let k = -5; k <= 0; k++) {
    const { a, m } = addMeses(h, k);
    const varr = ((a * 12 + m) * 37) % 120;
    const add = (dia, o) => DB.lancs.push(novoLanc({ ...o, venc: clampDia(a, m, dia) }));
    add(17, { tipo: "despesa", conta: "pessoal", descricao: "Mercado", categoria: "Mercado", valor: 420 + varr });
    add(9, { tipo: "despesa", conta: "pessoal", descricao: "iFood", categoria: "Delivery", valor: 84 + varr / 2 });
    add(22, { tipo: "despesa", conta: "pessoal", descricao: "Farmácia", categoria: "Farmácia", valor: 68 + varr / 3 });
    add(8, { tipo: "despesa", conta: "pessoal", descricao: "Combustível", categoria: "Carro", valor: 180 + varr / 2 });
    if (k % 2 === 0) add(13, { tipo: "despesa", conta: "pessoal", descricao: "Pet shop", categoria: "Pet", valor: 112 + varr / 4 });
    add(15, { tipo: "renda", conta: "mei", descricao: "Serviços prestados", categoria: "Serviços prestados", valor: 1450 + varr * 6 });
    if (k % 2 === 0) add(25, { tipo: "renda", conta: "pessoal", descricao: "Freela", categoria: "Renda extra", valor: 650 + varr * 2 });
  }
  // check-ins: passado 100% pago; mês atual até anteontem (Aluguel/Internet ficam vencidos)
  const compAtual = compDe(h);
  const abertas = new Set(["Aluguel", "Internet"]);
  for (const l of DB.lancs) {
    const venc = deIso(l.venc);
    const pagavel = l.comp < compAtual ||
      (l.comp === compAtual && venc <= addDias(h, -2) && !abertas.has(l.descricao));
    if (pagavel) { l.status = "pago"; l.pagoEm = l.venc; l.valorPago = l.valor; }
  }
  // investimentos de exemplo
  const invDef = [
    ["aplicacao", "CDB", 3000, -4], ["aplicacao", "Tesouro Direto", 2000, -3],
    ["aplicacao", "Ações", 1500, -2], ["rendimento", "CDB", 28.4, -1],
    ["rendimento", "Tesouro Direto", 19.9, -1], ["aplicacao", "CDB", 1000, -1],
    ["rendimento", "Ações", 45.2, 0], ["resgate", "Tesouro Direto", 500, 0],
  ];
  for (const [mov, t, v, dm] of invDef) {
    const { a, m } = addMeses(h, dm);
    DB.investSeq += 1;
    DB.invests.push({ id: DB.investSeq, mov, tipoInvest: t, descricao: "",
      valor: v, data: iso(clampDia(a, m, 12)), conta: "pessoal" });
  }
  salvarDB();
}

/* ================= login Google ================= */

function entrarComGoogle(info) {
  const perfis = store.perfis();
  let p = perfis.find(x => x.gsub === info.sub);
  if (p) p = store.atualizarPerfil(p.id, {
    nome: info.nome || p.nome, email: info.email || p.email, foto: info.foto || "" });
  else p = store.criarPerfil({
    nome: info.nome || "Conta Google", email: info.email || "",
    gsub: info.sub, foto: info.foto || "" });
  entrarPerfil(p);
}

function ligarLoginGoogle() {
  const slot = $("#slot-google"), btnG = $("#btn-google");
  const formGid = $("#form-gid"), trocar = $("#gid-trocar");
  const alternarForm = () => {
    $("#gid-valor").value = clientIdGoogle();
    formGid.hidden = !formGid.hidden;
  };
  btnG.onclick = alternarForm;
  trocar.onclick = alternarForm;
  formGid.onsubmit = (ev) => {
    ev.preventDefault();
    definirClientId($("#gid-valor").value);
    location.reload();
  };
  iniciarBotaoGoogle(slot, entrarComGoogle).then((ok) => {
    if (!ok) return;             // sem Client ID: fica o botão explicativo
    btnG.hidden = true;
    slot.hidden = false;
    trocar.hidden = false;
  }).catch((e) => flash("⚠ Google indisponível: " + e.message));
}

/* ================= página inicial (landing + escolha de perfil) ================= */

const SVG_CADEADO = '<svg class="perfil-cad" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-label="com senha"><rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';

// "Quem vai entrar?" — grade de perfis tipo Netflix (avatar = dino da skin)
function montarEscolhaPerfil() {
  const area = $("#area-perfis"), caixa = $("#login-caixa"), voltar = $("#voltar-perfis");
  const perfis = store.perfis();
  if (!perfis.length) {
    area.hidden = true;
    caixa.hidden = false;
    voltar.hidden = true;
    return;
  }
  area.innerHTML = `
<h2 class="perfis-titulo">Quem vai entrar?</h2>
<div class="perfis-grade">
  ${perfis.map(p => {
    const s = SKINS[skinDe(p)];
    return `
  <button class="perfil-tile" data-id="${esc(p.id)}" type="button">
    ${p.foto
      ? `<span class="perfil-foto" style="background-image:url('${esc(p.foto)}')"></span>`
      : `<svg class="perfil-dino" viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>`}
    <span class="perfil-nome">${p.senha ? SVG_CADEADO : ""}<span>${esc(p.nome)}</span></span>
  </button>`;
  }).join("")}
  <button class="perfil-tile" id="btn-novo-perfil" type="button">
    <span class="perfil-mais">+</span>
    <span class="perfil-nome"><span>Novo perfil</span></span>
  </button>
</div>`;
  area.hidden = false;
  caixa.hidden = true;
  $$(".perfil-tile[data-id]", area).forEach(b => b.onclick = () => {
    const p = store.perfis().find(x => x.id === b.dataset.id);
    if (p) entrarPerfil(p);
  });
  $("#btn-novo-perfil").onclick = () => {
    area.hidden = true;
    caixa.hidden = false;
    voltar.hidden = false;
  };
}

function mostrarLanding() {
  $("#tela-login").hidden = false;
  montarEscolhaPerfil();
  montarLandingSecoes();
  iniciarSlogan();
}

// seções do site público (galeria de dinos, rolagem suave e CTA) — uma vez só
let landingMontada = false;
function montarLandingSecoes() {
  if (landingMontada) return;
  landingMontada = true;
  $("#ld-dinos-grade").innerHTML = Object.entries(SKINS).map(([k, s]) => {
    const inf = DINO_INFO[k];
    return `
<div class="dino-cartao cartao" style="--dc:${s.tile || "var(--accent)"}">
  <div class="dino-cartao-topo">
    <svg class="dino-arte" viewBox="0 0 512 512"${tileSkinAttr(s)} aria-hidden="true"><use href="#dino-${s.dino}"/></svg>
    <div class="dino-cartao-id">
      <b>${esc(s.rotulo)}${k === "mono" ? ' <span class="etq">padrão</span>' : ""}</b>
      <i>${esc(s.nomeCompleto)}</i>
      <span class="chip-periodo">${esc(inf.periodo)}</span>
    </div>
  </div>
  <p class="dino-desc">${inf.desc}</p>
  <div class="dino-meta"><span>📍 ${esc(inf.onde)}</span><span>📏 ${esc(inf.porte)}</span></div>
</div>`;
  }).join("");
  $$("[data-rolar]").forEach(b => b.onclick = () =>
    document.getElementById(b.dataset.rolar)?.scrollIntoView({ behavior: "smooth" }));
  $("#ld-cta-btn").onclick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!$("#area-perfis").hidden) $("#btn-novo-perfil")?.click();   // abre o formulário
  };
}

// slogan estilo Stripe: "Organize suas finanças &… <palavra>" (máquina de escrever)
let sloganLigado = false;
function iniciarSlogan() {
  if (sloganLigado) return;
  const el = $("#hero-palavra");
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sloganLigado = true;
  const palavras = ["Dinossauros", "despesas", "rendimentos", "investimentos"];
  let i = 0, txt = "", apagando = false;
  const tique = () => {
    if ($("#tela-login").hidden) return;   // entrou no app: para de digitar
    const alvo = palavras[i % palavras.length];
    txt = apagando ? alvo.slice(0, txt.length - 1) : alvo.slice(0, txt.length + 1);
    el.textContent = txt;
    let espera = apagando ? 40 : 85;
    if (!apagando && txt === alvo) { apagando = true; espera = alvo === "Dinossauros" ? 3200 : 1500; }
    else if (apagando && !txt) { apagando = false; i += 1; espera = 380; }
    setTimeout(tique, espera);
  };
  setTimeout(tique, 900);
}

/* ================= boot ================= */

function boot() {
  const perfis = store.perfis();
  const ativo = perfis.find(p => p.id === store.ativoId());

  aplicarTema();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aplicarTema);
  for (const b of $$(".btn-tema")) b.onclick = alternarTema;

  ligarLoginGoogle();

  // miniaturas de tema no formulário de novo perfil + link de voltar aos perfis
  $("#novo-tema").innerHTML = htmlTemas("tema", "mono");
  $("#voltar-perfis").onclick = montarEscolhaPerfil;

  $("#form-perfil").onsubmit = (ev) => {
    ev.preventDefault();
    const nome = $("#perfil-nome").value.trim();
    if (!nome) return;
    const tema = $("#novo-tema input:checked")?.value || "mono";
    const p = store.criarPerfil({ nome, email: $("#perfil-email").value.trim(),
      tema: SKINS[tema] ? tema : "mono" });
    PERFIL = p;
    DB = dbVazio();
    if ($("#perfil-exemplo").checked) seedExemplo();
    salvarDB();
    entrarPerfilDireto(p);
  };

  $("#btn-menu").onclick = () => { const m = $("#menu-perfil"); m.hidden = !m.hidden; };
  $("#btn-perfil-card").onclick = abrirPerfil;   // cartão da lateral → Meu perfil
  $("#menu-temas").onclick = (ev) => {
    const b = ev.target.closest("[data-tema]");
    if (b) definirTema(b.dataset.tema);   // menu fica aberto: dá pra provar os 4
  };
  document.addEventListener("click", (ev) => {
    // alvo destacado do DOM (ex.: minis de tema re-renderizados) não conta como "fora"
    if (!ev.target.isConnected) return;
    if (!ev.target.closest(".perfil-area")) $("#menu-perfil").hidden = true;
  });
  $("#mi-perfil").onclick = () => { $("#menu-perfil").hidden = true; abrirPerfil(); };
  $("#mi-importar").onclick = () => { $("#menu-perfil").hidden = true; abrirImportacao(); };
  $("#mi-sync").onclick = () => { $("#menu-perfil").hidden = true; abrirSync(); };
  $("#mi-exportar").onclick = () => {
    const blob = new Blob([JSON.stringify({ perfil: PERFIL, dados: DB }, null, 2)],
      { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dinofinance-" + (PERFIL.nome || "perfil").toLowerCase().replace(/\s+/g, "-") + ".json";
    a.click();
  };
  $("#mi-sair").onclick = sairPerfil;

  // modal: fechar por ×/fundo/Esc
  const fundoModal = $("#modal");
  fundoModal.onclick = (ev) => {
    if (ev.target === fundoModal || ev.target.closest("[data-fechar]")) fecharModal();
  };
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !fundoModal.hidden) fecharModal();
  });

  // sincronização só existe quando o site é servido pelo server.py local
  pingLocal().then((ok) => { if (ok) $("#mi-sync").hidden = false; });

  window.addEventListener("hashchange", render);

  // easter egg da dança (só age quando a skin ativa é carnotauro)
  ligarDancaCarno($(".marca"));

  if (ativo) entrarPerfil(ativo);
  else mostrarLanding();
}

boot();
