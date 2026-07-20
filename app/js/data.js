// Finanças — camada de dados do app estático.
//
// Interface `store`: hoje implementada sobre localStorage; o contrato abaixo é
// o que uma futura impl. remota (API/fetch) deve seguir — mesmos métodos e
// mesmas estruturas, podendo virar assíncrona (Promise) sem mudar os callers
// de domínio (estes já recebem o objeto `db` pronto):
//
//   store.perfis()                -> [{ id, nome, email, gsub?, foto? }]
//   store.criarPerfil({nome,email,...}) -> perfil criado (campos extras: gsub, foto)
//   store.atualizarPerfil(id, campos) -> perfil atualizado | null
//   store.ativoId()               -> string | null
//   store.definirAtivo(id)
//   store.limparAtivo()
//   store.carregarDados(id)       -> db migrado (schema v2)
//   store.salvarDados(id, db)
//   store.carregarEstado()        -> { p, comp, conta } (preferências de UI)
//   store.salvarEstado(estado)
//
// Schema do db (v2 — mesmo do app anterior + campo de versão):
//   { v: 2, lancs: [Lanc], recs: [Rec], seq, recSeq, catSlots }
// Chaves localStorage inalteradas: financas.perfis / financas.ativo /
// financas.estado / financas.dados.<id> — usuários existentes não perdem dados.
// Rótulo de conta na UI: "PJ" (valor interno gravado continua "mei").

/* ================= util ================= */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const MESES_ABR = ["jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez"];
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export const brl = (v) => "R$ " + (+v).toLocaleString("pt-BR",
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brlCurto = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  if (a >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return "R$ " + Math.round(v).toLocaleString("pt-BR");
};

export const hoje = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const deIso = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
export const compDe = (d) => iso(d).slice(0, 7);
export const fimDoMes = (a, m) => new Date(a, m + 1, 0).getDate(); // m 0-based
export const clampDia = (a, m, dia) => new Date(a, m, Math.min(dia, fimDoMes(a, m)));
export const addMeses = (d, n) => { const t = d.getFullYear() * 12 + d.getMonth() + n; return { a: Math.floor(t / 12), m: t % 12 }; };
export const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const ddmm = (d) => `${d.getDate()} ${MESES_ABR[d.getMonth()]}`;

export function parseValor(s) {
  let t = String(s || "").trim().replace("R$", "").trim();
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = parseFloat(t);
  if (!isFinite(v) || v <= 0) throw new Error("valor inválido — use 1234,56");
  return Math.round(v * 100) / 100;
}

export function resolverVenc(s) {
  const t = String(s || "").trim();
  const h = hoje();
  if (!t) return h;
  if (/^\d{1,2}$/.test(t)) {
    const dia = +t;
    if (dia < 1 || dia > 31) throw new Error("dia de vencimento inválido");
    if (dia >= h.getDate()) return clampDia(h.getFullYear(), h.getMonth(), dia);
    const { a, m } = addMeses(h, 1);
    return clampDia(a, m, dia);
  }
  const mm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mm) return new Date(+mm[3], +mm[2] - 1, +mm[1]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return deIso(t);
  throw new Error("vencimento inválido — use dia (1-31) ou DD/MM/AAAA");
}

/* ================= categorias (listas de finance.py) ================= */

export const CATEGORIAS_DESPESA = [
  "Moradia", "Mercado", "Delivery", "Restaurantes", "Farmácia", "Médica",
  "Dentista", "Psicólogo", "Academia", "Carro", "Transporte",
  "Financiamento", "Cartão de crédito", "Seguros", "Impostos",
  "Assinaturas", "Internet e telefone", "Educação", "Pet", "Família",
  "Vestuário", "Lazer", "Viagem", "Compras", "Presentes", "Serviços",
  "Empresa", "Investimentos", "Transferência", "Outros",
];
export const CATEGORIAS_RECEITA = [
  "Salário", "Renda extra", "Ganhos pontuais", "Serviços prestados",
  "Resgate de investimento", "Transferência", "Outros",
];

// transferência entre contas da própria pessoa (categoria "Transferência"):
// aparece nas listas, mas fica fora de toda soma de gasto/ganho — não é
// dinheiro que entrou nem saiu. Aceita variações ("Transferencia", plural…).
export const ehTransferencia = (l) =>
  /^transfer/.test(String(l.categoria || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());

// padrão do finance.py + categorias já usadas nos lançamentos do perfil,
// em ordem alfabética (pt-BR) com "Outros" sempre por último
export function categorias(db, tipo) {
  const base = tipo === "renda" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  const usadas = db.lancs.filter((l) => l.tipo === tipo).map((l) => l.categoria);
  const todas = [...new Set([...base, ...usadas])]
    .filter((c) => c && c !== "Outros")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  todas.push("Outros");
  return todas;
}

/* ================= store (impl. localStorage) ================= */

const LS = {
  perfis: "financas.perfis",
  ativo: "financas.ativo",
  estado: "financas.estado",
  dados: (id) => "financas.dados." + id,
};

const lerJson = (k, pad) => { try { return JSON.parse(localStorage.getItem(k)) ?? pad; } catch { return pad; } };
const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export const VERSAO_SCHEMA = 3;

export function dbVazio() {
  return {
    v: VERSAO_SCHEMA, lancs: [], recs: [], seq: 0, recSeq: 0, catSlots: {},
    invests: [], investSeq: 0,   // movimentações de investimento (v3)
    aprendCat: {},               // aprendizado: descrição normalizada -> categoria (v3)
  };
}

// v1 → v3: no-op no layout dos registros; só marca a versão e garante as
// chaves novas (v3 adiciona invests/investSeq/aprendCat).
export function migrar(db) {
  const vazio = dbVazio();
  for (const k of Object.keys(vazio)) if (db[k] === undefined) db[k] = vazio[k];
  db.v = VERSAO_SCHEMA;
  return db;
}

function criarStoreLocal() {
  return {
    perfis() { return lerJson(LS.perfis, []); },
    criarPerfil({ nome, email, ...extras }) {
      const p = { id: "p" + Date.now(), nome, email: email || "", ...extras };
      const lista = this.perfis();
      lista.push(p);
      gravar(LS.perfis, lista);
      return p;
    },
    atualizarPerfil(id, campos) {
      const lista = this.perfis();
      const p = lista.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, campos);
      gravar(LS.perfis, lista);
      return p;
    },
    removerPerfil(id) {
      gravar(LS.perfis, this.perfis().filter((x) => x.id !== id));
      localStorage.removeItem(LS.dados(id));
      if (this.ativoId() === id) this.limparAtivo();
    },
    ativoId() { return lerJson(LS.ativo, null); },
    definirAtivo(id) { gravar(LS.ativo, id); },
    limparAtivo() { localStorage.removeItem(LS.ativo); },
    carregarDados(id) { return migrar(lerJson(LS.dados(id), null) || dbVazio()); },
    salvarDados(id, db) { gravar(LS.dados(id), db); },
    carregarEstado() {
      return Object.assign({ p: "mes", comp: "anterior", conta: "tudo" },
        lerJson(LS.estado, {}));
    },
    salvarEstado(estado) { gravar(LS.estado, estado); },
  };
}

// Ponto único de troca: no futuro, `criarStoreAPI(baseUrl)` com fetch.
export const store = criarStoreLocal();

/* ================= domínio (funções puras sobre db) ================= */

export function novoLanc(db, o) {
  db.seq += 1;
  const venc = o.venc;
  return {
    id: db.seq, tipo: o.tipo, conta: o.conta || "pessoal",
    descricao: o.descricao.trim(), categoria: (o.categoria || "Outros").trim() || "Outros",
    valor: o.valor, venc: iso(venc), comp: compDe(venc),
    status: o.status || "pendente", pagoEm: o.pagoEm || "", valorPago: o.valorPago ?? null,
    origem: o.origem || "avulso", recId: o.recId ?? null,
    pNum: o.pNum ?? null, pTot: o.pTot ?? null,
  };
}

// materializa os lançamentos de recorrentes ativas na competência (AAAA-MM)
export function gerarMes(db, comp) {
  const [a, m] = comp.split("-").map(Number);
  const existentes = new Set(db.lancs.filter((l) => l.recId != null).map((l) => l.recId + "|" + l.comp));
  let criou = false;
  for (const r of db.recs) {
    if (!r.ativo) continue;
    if (comp < r.inicio) continue;
    if (r.fim && comp > r.fim) continue;               // "até quando"; vazio = contínua
    if (existentes.has(r.id + "|" + comp)) continue;
    db.lancs.push(novoLanc(db, {
      tipo: r.tipo, conta: r.conta, descricao: r.descricao, categoria: r.categoria,
      valor: r.valor, venc: clampDia(a, m - 1, r.diaVenc), origem: "recorrente", recId: r.id,
    }));
    criou = true;
  }
  return criou;
}

export function criarAvulso(db, o) { const l = novoLanc(db, o); db.lancs.push(l); return l; }

export function criarRecorrente(db, o) {
  db.recSeq += 1;
  const r = {
    id: db.recSeq, tipo: o.tipo, conta: o.conta, descricao: o.descricao.trim(),
    categoria: o.categoria || "Outros", valor: o.valor, diaVenc: o.diaVenc,
    inicio: compDe(hoje()), fim: o.fim || "", ativo: true,
  };
  db.recs.push(r);
  gerarMes(db, compDe(hoje()));
  return r;
}

export function criarParcelado(db, o) {
  const novos = [];
  const base = o.valorPorParcela ? o.valor : Math.round(o.valor / o.n * 100) / 100;
  for (let i = 0; i < o.n; i++) {
    const { a, m } = addMeses(o.primeiro, i);
    let v = base;
    if (!o.valorPorParcela && i === o.n - 1)
      v = Math.round((o.valor - base * (o.n - 1)) * 100) / 100;
    novos.push(novoLanc(db, {
      tipo: o.tipo, conta: o.conta, descricao: o.descricao, categoria: o.categoria,
      valor: v, venc: clampDia(a, m, o.primeiro.getDate()),
      origem: "parcelado", pNum: i + 1, pTot: o.n,
    }));
  }
  db.lancs.push(...novos);
  return novos;
}

export const lancPorId = (db, id) => db.lancs.find((l) => l.id === +id);

export function pagar(db, id) {
  const l = lancPorId(db, id);
  if (!l || l.status === "pago") return null;
  l.status = "pago";
  l.pagoEm = iso(hoje());
  l.valorPago = l.valor;
  return l;
}

export function desfazer(db, id) {
  const l = lancPorId(db, id);
  if (!l) return null;
  l.status = "pendente"; l.pagoEm = ""; l.valorPago = null;
  return l;
}

export function excluir(db, id) {
  const l = lancPorId(db, id);
  if (!l) return null;
  if (l.origem === "recorrente") { l.status = "pulado"; return { pulado: true, l }; }
  db.lancs = db.lancs.filter((x) => x.id !== l.id);
  return { pulado: false, l };
}

export const rotuloLanc = (l) => l.descricao + (l.pTot ? ` (${l.pNum}/${l.pTot})` : "");

/* ================= períodos, comparação e agregações ================= */

export const PERIODOS = [["mes", "Este mês"], ["30d", "Últimos 30 dias"], ["3m", "Últimos 3 meses"],
  ["6m", "Últimos 6 meses"], ["ano", "Este ano"]];

export function resolverPeriodo(p) {
  const h = hoje();
  if (p === "30d") return { ini: addDias(h, -29), fim: h, rotulo: "Últimos 30 dias" };
  if (p === "3m") { const { a, m } = addMeses(h, -2); return { ini: new Date(a, m, 1), fim: h, rotulo: "Últimos 3 meses" }; }
  if (p === "6m") { const { a, m } = addMeses(h, -5); return { ini: new Date(a, m, 1), fim: h, rotulo: "Últimos 6 meses" }; }
  if (p === "ano") return { ini: new Date(h.getFullYear(), 0, 1), fim: h, rotulo: "Este ano" };
  return { ini: new Date(h.getFullYear(), h.getMonth(), 1), fim: h, rotulo: "Este mês" };
}

export function comparacao(modo, ini, fim) {
  if (modo === "ano") {
    return {
      ini: new Date(ini.getFullYear() - 1, ini.getMonth(), Math.min(ini.getDate(), fimDoMes(ini.getFullYear() - 1, ini.getMonth()))),
      fim: new Date(fim.getFullYear() - 1, fim.getMonth(), Math.min(fim.getDate(), fimDoMes(fim.getFullYear() - 1, fim.getMonth()))),
      rotulo: "mesmo período do ano passado",
    };
  }
  const n = Math.round((fim - ini) / 864e5) + 1;
  return { ini: addDias(ini, -n), fim: addDias(ini, -1), rotulo: "período anterior" };
}

export const filtraConta = (conta) => (l) => conta === "tudo" || l.conta === conta;
export const efetivo = (l) => l.valorPago ?? l.valor;
export const soma = (arr) => arr.reduce((s, v) => s + v, 0);

// série do realizado (pagoEm) por dia (intervalos ≤45d) ou por mês
export function serie(db, tipo, ini, fim, conta) {
  const fc = filtraConta(conta);
  const sel = db.lancs.filter((l) => l.status === "pago" && l.pagoEm && l.tipo === tipo
    && fc(l) && !ehTransferencia(l) && l.pagoEm >= iso(ini) && l.pagoEm <= iso(fim));
  const dias = Math.round((fim - ini) / 864e5) + 1;
  if (dias <= 45) {
    const labels = [], vals = [];
    for (let d = new Date(ini); d <= fim; d = addDias(d, 1)) { labels.push(ddmm(d)); vals.push(0); }
    for (const l of sel) {
      const i = Math.round((deIso(l.pagoEm) - ini) / 864e5);
      if (i >= 0 && i < vals.length) vals[i] += efetivo(l);
    }
    return { labels, vals: vals.map((v) => Math.round(v * 100) / 100) };
  }
  const labels = [], chaves = [], vals = [];
  let a = ini.getFullYear(), m = ini.getMonth();
  while (a < fim.getFullYear() || (a === fim.getFullYear() && m <= fim.getMonth())) {
    chaves.push(`${a}-${String(m + 1).padStart(2, "0")}`);
    labels.push(MESES_ABR[m] + (a !== hoje().getFullYear() ? "/" + String(a).slice(2) : ""));
    vals.push(0);
    m += 1; if (m === 12) { m = 0; a += 1; }
  }
  for (const l of sel) {
    const i = chaves.indexOf(l.pagoEm.slice(0, 7));
    if (i >= 0) vals[i] += efetivo(l);
  }
  return { labels, vals: vals.map((v) => Math.round(v * 100) / 100) };
}

export function porCategoria(db, tipo, ini, fim, conta, topo = 5) {
  const fc = filtraConta(conta);
  const tot = {};
  for (const l of db.lancs) {
    if (l.status === "pago" && l.pagoEm && l.tipo === tipo && fc(l)
      && !ehTransferencia(l) && l.pagoEm >= iso(ini) && l.pagoEm <= iso(fim))
      tot[l.categoria] = (tot[l.categoria] || 0) + efetivo(l);
  }
  let ordem = Object.entries(tot).sort((x, y) => y[1] - x[1]);
  if (ordem.length > topo) {
    const resto = ordem.slice(topo).reduce((s, [, v]) => s + v, 0);
    ordem = ordem.slice(0, topo);
    ordem.push(["Outros", resto]);
  }
  return ordem;
}
