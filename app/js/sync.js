// Finanças — sincronização com os CSVs locais (data/*.csv).
//
// Só funciona quando o site é servido pelo server.py (python finance.py app):
// as rotas /api/* são same-origin; num host estático (GitHub Pages) o ping
// falha e o app simplesmente esconde a opção.
//
// Os dados trafegam já no schema do app (tipo "renda", campos camelCase);
// a conversão de/para o formato dos CSVs (tipo "receita", snake_case) é
// responsabilidade do server.py.

import { novoLanc, deIso } from "./data.js";

export async function pingLocal() {
  try {
    const r = await fetch("/api/ping", { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return false;
    const j = await r.json();
    return j.app === "financas";
  } catch {
    return false;
  }
}

export async function baixarDados() {
  const r = await fetch("/api/dados");
  if (!r.ok) throw new Error("o servidor local não respondeu (" + r.status + ")");
  return r.json();
}

export async function enviarDados(dados) {
  const r = await fetch("/api/dados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.erro || "falha ao gravar nos CSVs locais");
  return j;
}

/* ================= mescla (CSVs → perfil) ================= */

const chaveLanc = (l) => [l.tipo, l.conta, l.venc, (+l.valor).toFixed(2),
  String(l.descricao || "").trim().toLowerCase()].join("|");
const chaveRec = (r) => [r.tipo, r.conta, r.diaVenc, (+r.valor).toFixed(2),
  String(r.descricao || "").trim().toLowerCase()].join("|");

// Mescla os dados vindos dos CSVs no db do perfil, sem apagar nada:
//   - recorrente igual (tipo+conta+dia+valor+descrição) é reaproveitada;
//     novas ganham id local e os lançamentos delas são re-apontados;
//   - lançamento igual (tipo+conta+venc+valor+descrição) é ignorado — mas o
//     check-in (pago) é copiado se aqui ainda estiver pendente;
//   - "pulado" é preservado para a recorrente não regenerar a ocorrência.
export function mesclar(db, remoto) {
  const mapaRec = new Map();      // id no CSV -> id local
  const locaisRec = new Map(db.recs.map((r) => [chaveRec(r), r]));
  let novasRecs = 0;
  for (const r of remoto.recs || []) {
    const jaTem = locaisRec.get(chaveRec(r));
    if (jaTem) { mapaRec.set(r.id, jaTem.id); continue; }
    db.recSeq += 1;
    const nova = {
      id: db.recSeq, tipo: r.tipo, conta: r.conta || "pessoal",
      descricao: r.descricao, categoria: r.categoria || "Outros",
      valor: +r.valor, diaVenc: +r.diaVenc,
      inicio: r.inicio || "", fim: r.fim || "", ativo: !!r.ativo,
    };
    db.recs.push(nova);
    locaisRec.set(chaveRec(nova), nova);
    mapaRec.set(r.id, nova.id);
    novasRecs += 1;
  }

  const locaisLanc = new Map();   // chave -> fila (ciente de repetições)
  for (const l of db.lancs) {
    const k = chaveLanc(l);
    if (!locaisLanc.has(k)) locaisLanc.set(k, []);
    locaisLanc.get(k).push(l);
  }
  let novos = 0, atualizados = 0;
  for (const l of remoto.lancs || []) {
    const fila = locaisLanc.get(chaveLanc(l));
    const local = fila && fila.length ? fila.shift() : null;
    if (local) {
      if (l.status === "pago" && local.status === "pendente") {
        local.status = "pago";
        local.pagoEm = l.pagoEm || l.venc;
        local.valorPago = l.valorPago ?? l.valor;
        atualizados += 1;
      }
      continue;
    }
    db.lancs.push(novoLanc(db, {
      tipo: l.tipo, conta: l.conta || "pessoal", descricao: l.descricao,
      categoria: l.categoria || "Outros", valor: +l.valor, venc: deIso(l.venc),
      status: l.status || "pendente", pagoEm: l.pagoEm || "",
      valorPago: l.valorPago ?? null, origem: l.origem || "avulso",
      recId: l.recId != null ? (mapaRec.get(l.recId) ?? null) : null,
      pNum: l.pNum ?? null, pTot: l.pTot ?? null,
    }));
    novos += 1;
  }
  return { novos, atualizados, novasRecs };
}
