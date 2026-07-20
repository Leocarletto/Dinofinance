// Dino Finanças — importação de extrato bancário (módulo puro, sem DOM).
//
// parseExtrato(texto) -> { formato, linhas: [{ data: "AAAA-MM-DD", descricao,
//   valor (positivo), tipo: "despesa"|"renda", categoria, categoriaSugerida,
//   ignorarPadrao?, dup? }] }
// parseExtratoPdf(paginas) -> mesmo retorno, a partir do texto posicionado
//   extraído pelo pdf.js (paginas = [[{ str, x, y }…]…]).
//
// Formatos reconhecidos automaticamente:
//   - Nubank conta   (Data,Valor,Identificador,Descrição) — valor negativo = saída
//   - Nubank cartão  (date,title,amount) — valor positivo = compra (despesa)
//   - Inter/genérico (Data Lançamento;Histórico;Descrição;Valor;Saldo…)
//   - Crédito/Débito em colunas separadas (Bradesco, Caixa…)
//   - coluna "Tipo Lançamento"/D-C dando o sinal do valor (BB, Sicoob…)
//   - OFX 1.x/2.x (blocos <STMTTRN>) — conta e fatura de cartão
//   - PDF com tabela (Data/Histórico/Valor/Saldo) ou em linhas (fatura "12 ABR",
//     extrato com a data como cabeçalho de seção, estilo Inter/Nubank)
//   - qualquer CSV com colunas de data, descrição e valor (com ou sem cabeçalho)

/* ================= células e separador ================= */

function dividirCsv(linha, sep) {
  const celulas = [];
  let atual = "", dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentro) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else dentro = false;
      } else atual += c;
    } else if (c === '"') dentro = true;
    else if (c === sep) { celulas.push(atual.trim()); atual = ""; }
    else atual += c;
  }
  celulas.push(atual.trim());
  return celulas;
}

// usa a moda das contagens de colunas (ignorando linhas de preâmbulo com 1
// coluna, comuns em extratos do Inter/Caixa antes da tabela em si)
function detectarSep(linhas) {
  let melhor = ",", melhorNota = -1;
  for (const sep of [";", ",", "\t"]) {
    const contagens = linhas.slice(0, 12).map((l) => dividirCsv(l, sep).length)
      .filter((n) => n >= 2);
    if (!contagens.length) continue;
    const freq = new Map();
    for (const n of contagens) freq.set(n, (freq.get(n) || 0) + 1);
    const [, vezes] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    const nota = vezes * 10 + Math.min([...freq.keys()].sort((a, b) => b - a)[0], 8);
    if (nota > melhorNota) { melhorNota = nota; melhor = sep; }
  }
  return melhor;
}

/* ================= datas e valores ================= */

export function parseDataExtrato(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);                    // ISO (c/ ou s/ hora)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);     // DD/MM/AAAA
  if (m) {
    let a = +m[3];
    if (a < 100) a += 2000;
    const dia = +m[1], mes = +m[2];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || a < 1990 || a > 2100) return null;
    return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return null;
}

export function parseValorExtrato(s) {
  let t = String(s || "").trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }     // (12,34) = negativo
  if (t.startsWith("-")) { neg = true; t = t.slice(1); }
  else if (t.startsWith("+")) t = t.slice(1);
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const ponto = t.lastIndexOf("."), virg = t.lastIndexOf(",");
  if (virg >= 0 && ponto >= 0)
    t = virg > ponto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (virg >= 0) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // 1.234 = milhar
  const v = parseFloat(t);
  if (!isFinite(v)) return null;
  return Math.round((neg ? -v : v) * 100) / 100;
}

/* ================= colunas ================= */

const semAcento = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const NOMES_DATA = ["data", "date", "data lancamento", "data do lancamento",
  "dt lancamento", "data mov", "data movimento", "dia"];
const NOMES_DESC = ["descricao", "description", "title", "titulo", "historico",
  "lancamento", "memo", "estabelecimento", "detalhes"];
const NOMES_VALOR = ["valor", "amount", "valor (r$)", "value", "quantia", "montante"];
const NOMES_CREDITO = ["credito", "credito (r$)", "valor credito", "entrada", "entradas", "deposito"];
const NOMES_DEBITO = ["debito", "debito (r$)", "valor debito", "saida", "saidas", "retirada"];
const NOMES_TIPO = ["tipo lancamento", "tipo de lancamento", "natureza", "operacao", "d/c", "dc", "tipo"];

// prioridade pela ordem dos NOMES_*, não pela posição da coluna (no Inter,
// "Descrição" deve vencer "Histórico" mesmo vindo depois)
function acharColuna(cab, nomes) {
  const cels = cab.map(semAcento);
  for (const n of nomes) {
    const i = cels.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of nomes) {
    const i = cels.findIndex((c) => c && c.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

// procura a linha de cabeçalho nas primeiras linhas (extratos do Inter, por
// exemplo, têm um preâmbulo antes da tabela em si)
function acharCabecalho(linhas, sep) {
  for (let i = 0; i < Math.min(linhas.length, 12); i++) {
    const cab = dividirCsv(linhas[i], sep);
    if (cab.length < 2) continue;
    const achados = [acharColuna(cab, NOMES_DATA), acharColuna(cab, NOMES_DESC),
      acharColuna(cab, NOMES_VALOR), acharColuna(cab, NOMES_CREDITO),
      acharColuna(cab, NOMES_DEBITO)].filter((x) => x >= 0).length;
    if (achados >= 2) return i;
  }
  return -1;
}

// sem cabeçalho: adivinha as colunas pelo conteúdo de uma amostra
function adivinharColunas(matriz) {
  const nCols = Math.max(...matriz.map((r) => r.length));
  const notaData = Array(nCols).fill(0), notaValor = Array(nCols).fill(0),
    tamTexto = Array(nCols).fill(0);
  for (const r of matriz.slice(0, 20)) {
    for (let c = 0; c < nCols; c++) {
      const cel = r[c] ?? "";
      if (parseDataExtrato(cel)) notaData[c]++;
      else if (parseValorExtrato(cel) != null) notaValor[c]++;
      else tamTexto[c] += cel.length;
    }
  }
  const iData = notaData.indexOf(Math.max(...notaData));
  notaValor[iData] = -1;
  const iValor = notaValor.indexOf(Math.max(...notaValor));
  tamTexto[iData] = -1; tamTexto[iValor] = -1;
  const iDesc = tamTexto.indexOf(Math.max(...tamTexto));
  if (Math.max(...notaData) === 0 || Math.max(...notaValor) === 0)
    return null;
  return { iData, iDesc, iValor };
}

/* ================= categorização por palavras-chave ================= */

const REGRAS_DESPESA = [
  [/supermerc|mercad(?!o ?(livre|pago))|carrefour|assai|atacad|hortifruti|sacolao|pao de acucar|paodeacucar|zaffari|sams? ?club/, "Mercado"],
  [/ifood|\bifd\b|rappi|ubereats|uber ?eats|aiqfome|delivery/, "Delivery"],
  [/restauran|lanchon|pizzar|burger|hamburg|padaria|cafeter|sushi|churrasc|mcdonald|mc ?donald|habibs|subway|outback|\bkfc\b|giraffas|spoleto|starbucks|cacau show|sorvet|\bacai\b/, "Restaurantes"],
  [/farmac|drogar|drogasil|pague menos|panvel|droga ?raia|ultrafarma|nissei/, "Farmácia"],
  [/posto|combustivel|ipiranga|shell|petrobras|br mania|gasolina|estaciona|sem parar|conectcar|veloe|estapar|lava ?(jato|rapido)|oficina|mecanic|pneu|autopec|auto ?center/, "Carro"],
  [/\buber\b|\b99\b|99app|99 ?pop|99 tecnologia|cabify|buser|metro|onibus|bilhete unico|passagem urbana/, "Transporte"],
  [/netflix|spotify|disney|hbo|\bmax\b|prime video|youtube|globoplay|deezer|icloud|google one|apple\.com|google play|crunchyroll|paramount|telecine|chatgpt|openai|anthropic|\bcanva\b|adobe/, "Assinaturas"],
  [/aluguel|condominio|imobiliar/, "Moradia"],
  [/energia|enel|cemig|copel|light|celesc|coelba|cpfl|equatorial|neoenergia|energisa|sanea|sabesp|copasa|caesb|embasa|cagece|compesa|corsan|casan|\bagua\b|\bgas\b|comgas/, "Moradia"],
  [/internet|\bvivo\b|\bclaro\b|\btim\b|\boi\b|telefon|net servicos|starlink|brisanet|algar/, "Internet e telefone"],
  [/academia|smartfit|gympass|wellhub|crossfit|bluefit|selfit/, "Academia"],
  [/\bpet\b|petz|cobasi|veterinar|petlove/, "Pet"],
  [/escola|faculdade|universi|curso|udemy|alura|colegio|coursera|duolingo|wizard|ccaa|fisk|estacio/, "Educação"],
  // "seguro" e abreviações de fatura/extrato: SEG VID, SEG AUTO, SEGVID…
  [/segur|\bseg\b|segvid/, "Seguros"],
  [/\bdas\b|darf|imposto|tribut|prefeitura|receita federal|iptu|ipva|detran|inss|simples nacional/, "Impostos"],
  [/cinema|kinoplex|ingresso|show|teatro|steam|playstation|xbox|nintendo|epic games|riot games|blizzard|twitch/, "Lazer"],
  [/airbnb|hotel|pousada|latam|\bgol\b|azul linhas|booking|decolar|viagem/, "Viagem"],
  [/amazon|shopee|mercado ?livre|mercadolivre|magalu|magazine|americanas|aliexpress|shein|temu|kabum|casas bahia|ponto frio|fast ?shop|renner|riachuelo|\bzara\b|decathlon|centauro|netshoes|leroy|havan|tok ?stok/, "Compras"],
  [/medic|clinica|hospital|laborator|exame|consulta|unimed|amil|hapvida|plano de saude/, "Médica"],
  [/dentist|odonto/, "Dentista"],
  [/psicolog|terapia/, "Psicólogo"],
];

const REGRAS_RENDA = [
  [/salario|folha de pagamento|pagto salario|provento|pro ?labore/, "Salário"],
  [/nota fiscal|\bnf\b|nfs-?e|servico prestado|honorari/, "Serviços prestados"],
  [/rendimento|juros|dividendo|restitui|cashback|reembolso|estorno/, "Ganhos pontuais"],
];

// transferência entre contas da mesma pessoa: aplicação/resgate de investimento,
// TEV, "mesma titularidade"… — vira a categoria "Transferência", que o app
// lista mas não soma como gasto nem como ganho
const RE_TRANSFERENCIA = /mesma titularidade|entre contas|conta propria|contas proprias|aplicacao|\baplic\b|apl aut|resgate|res aut|\brdb\b|\brdc\b|\bcdb\b|\blca\b|\blci\b|poupanca|tesouro direto|rende facil/;
// rendimento creditado (juros da poupança etc.) é ganho de verdade, não transferência
const RE_GANHO_REAL = /rendimento|juros|dividendo/;

export function sugerirCategoria(descricao, tipo) {
  const d = semAcento(descricao);
  if (RE_TRANSFERENCIA.test(d) && !RE_GANHO_REAL.test(d)) return "Transferência";
  const regras = tipo === "renda" ? REGRAS_RENDA : REGRAS_DESPESA;
  for (const [re, cat] of regras) if (re.test(d)) return cat;
  return "Outros";
}

/* ================= núcleo compartilhado ================= */

// linhas informativas que não são lançamentos (o BB grava até "S A L D O")
const DESC_SALDO = /^(s\s?a\s?l\s?d\s?o\b|saldos?\b|total(is)?\b|limite\b)/i;
// pagamento da fatura dentro da própria fatura: importar é quase sempre duplicar
const RE_PGTO_FATURA = /pagamento (recebido|efetuado|de fatura)|pgto\.? ?(de )?(deb|debito|fatura)/i;

// cria uma linha normalizada; `bruto` vem com sinal (negativo = saída, exceto
// em fatura de cartão — positivoEhDespesa — onde a compra vem positiva)
function novaLinha(data, descricao, bruto, opts = {}) {
  const { positivoEhDespesa = false, marcarPgtoFatura = positivoEhDespesa } = opts;
  descricao = String(descricao || "").replace(/\s+/g, " ").trim() || "Lançamento";
  if (DESC_SALDO.test(descricao)) return null;
  const tipo = positivoEhDespesa
    ? (bruto > 0 ? "despesa" : "renda")
    : (bruto < 0 ? "despesa" : "renda");
  const categoriaSugerida = {
    despesa: sugerirCategoria(descricao, "despesa"),
    renda: sugerirCategoria(descricao, "renda"),
  };
  return {
    data, descricao, valor: Math.abs(bruto), tipo,
    categoria: categoriaSugerida[tipo], categoriaSugerida,
    ignorarPadrao: marcarPgtoFatura && RE_PGTO_FATURA.test(descricao),
  };
}

// matriz de células + índices de colunas -> linhas (serve o CSV e a tabela de PDF)
function montarLinhas(dados, idx, opts = {}) {
  const { iData, iDesc, iValor = -1, iCred = -1, iDeb = -1, iTipo = -1 } = idx;
  const linhas = [];
  for (const cels of dados) {
    const data = parseDataExtrato(cels[iData]);
    if (!data) continue;
    let bruto = iValor >= 0 ? parseValorExtrato(cels[iValor]) : null;
    if (bruto != null && iTipo >= 0) {
      // coluna de natureza dá o sinal (BB: "Entrada"/"Saída"; Sicoob: C/D)
      const t = semAcento(cels[iTipo]);
      if (/saldo/.test(t)) continue;
      if (/^(d\b|s\b|deb|debito|saida|despesa)/.test(t)) bruto = -Math.abs(bruto);
      else if (/^(c\b|e\b|cred|credito|entrada|receita|renda)/.test(t)) bruto = Math.abs(bruto);
    }
    if (bruto == null && (iCred >= 0 || iDeb >= 0)) {
      // crédito e débito em colunas separadas (Bradesco, Caixa…)
      const cred = iCred >= 0 ? parseValorExtrato(cels[iCred]) : null;
      const deb = iDeb >= 0 ? parseValorExtrato(cels[iDeb]) : null;
      if (cred) bruto = Math.abs(cred);
      else if (deb) bruto = -Math.abs(deb);
    }
    if (bruto == null || bruto === 0) continue;
    const linha = novaLinha(data, cels[iDesc], bruto, opts);
    if (linha) linhas.push(linha);
  }
  return linhas;
}

/* ================= parse principal (CSV / OFX) ================= */

export function parseExtrato(texto) {
  const brutas = String(texto || "").replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "");
  if (/<OFX>|OFXHEADER/i.test(texto)) return parseOfx(texto);
  if (brutas.length < 2)
    throw new Error("arquivo vazio ou sem linhas de lançamentos");

  const sep = detectarSep(brutas);
  const iCab = acharCabecalho(brutas, sep);

  let formato = "generico", dados;
  const idx = { iData: -1, iDesc: -1, iValor: -1, iCred: -1, iDeb: -1, iTipo: -1 };
  if (iCab >= 0) {
    const cabCels = dividirCsv(brutas[iCab], sep);
    const cab = cabCels.map(semAcento);
    idx.iData = acharColuna(cabCels, NOMES_DATA);
    idx.iDesc = acharColuna(cabCels, NOMES_DESC);
    idx.iValor = acharColuna(cabCels, NOMES_VALOR);
    idx.iCred = acharColuna(cabCels, NOMES_CREDITO);
    idx.iDeb = acharColuna(cabCels, NOMES_DEBITO);
    idx.iTipo = acharColuna(cabCels, NOMES_TIPO);
    dados = brutas.slice(iCab + 1).map((l) => dividirCsv(l, sep));
    if (cab.join(",") === "date,title,amount") formato = "nubank-cartao";
    else if (cab.includes("identificador")) formato = "nubank-conta";
    else if (idx.iCred >= 0 || idx.iDeb >= 0 ||
      cab.some((c) => c.includes("historico") || c.includes("saldo")))
      formato = "extrato-banco";
    if (idx.iDesc < 0) idx.iDesc = idx.iData === 0 ? 1 : 0;   // melhor esforço
    if (idx.iData < 0 || (idx.iValor < 0 && idx.iCred < 0 && idx.iDeb < 0)) {
      const adv = adivinharColunas(dados);
      if (!adv) throw new Error("não encontrei as colunas de data e valor no CSV");
      if (idx.iData < 0) idx.iData = adv.iData;
      if (idx.iValor < 0 && idx.iCred < 0 && idx.iDeb < 0) idx.iValor = adv.iValor;
    }
  } else {
    dados = brutas.map((l) => dividirCsv(l, sep));
    const adv = adivinharColunas(dados);
    if (!adv) throw new Error("isto não parece um extrato (não achei data e valor)");
    Object.assign(idx, adv);
  }

  // fatura de cartão: compra vem positiva; nos extratos de conta, saída é negativa
  const linhas = montarLinhas(dados, idx,
    { positivoEhDespesa: formato === "nubank-cartao" });
  return { formato, linhas };
}

/* ================= OFX ================= */

// OFX 1.x (SGML) e 2.x (XML): um bloco <STMTTRN> por lançamento. Fatura de
// cartão (<CCSTMT…>) segue a spec: compra negativa, pagamento da fatura positivo.
function parseOfx(texto) {
  const cartao = /<CCSTMT|CREDITCARDMSGS/i.test(texto);
  const tag = (b, t) => {
    const m = b.match(new RegExp("<" + t + ">([^<]*)", "i"));
    return m ? m[1].trim() : "";
  };
  const linhas = [];
  for (const b of texto.split(/<STMTTRN>/i).slice(1)) {
    const dt = tag(b, "DTPOSTED").match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dt || +dt[2] < 1 || +dt[2] > 12 || +dt[3] < 1 || +dt[3] > 31) continue;
    const bruto = parseValorExtrato(tag(b, "TRNAMT"));
    if (bruto == null || bruto === 0) continue;
    const linha = novaLinha(`${dt[1]}-${dt[2]}-${dt[3]}`,
      tag(b, "MEMO") || tag(b, "NAME"), bruto, { marcarPgtoFatura: cartao });
    if (linha) linhas.push(linha);
  }
  if (!linhas.length) throw new Error("não achei lançamentos (<STMTTRN>) no OFX");
  return { formato: cartao ? "ofx-cartao" : "ofx", linhas };
}

/* ================= PDF (texto posicionado do pdf.js) ================= */

// paginas = [[{ str, x, y, w }…]…] — como app.js extrai de getTextContent().
// Estratégia: reconstruir as linhas visuais pela coordenada y; se houver um
// cabeçalho de tabela (Data/Histórico/Valor…), mapear células por x e reusar
// o mesmo caminho do CSV; senão, heurística linha a linha (fatura "12 ABR",
// data como cabeçalho de seção estilo Inter/Nubank, sufixo D/C do Itaú).

const MESES_NOME = { jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7,
  ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12 };

const pad2 = (n) => String(n).padStart(2, "0");

// agrupa itens próximos no eixo x em "células" (título e texto quebram em runs)
function agruparCelulas(itens, folga = 6) {
  const cels = [];
  for (const it of itens) {
    const ant = cels[cels.length - 1];
    if (ant && it.x - ant.fim <= folga) {
      ant.str += (it.x - ant.fim > 0.5 ? " " : "") + it.str;
      ant.fim = it.x + (it.w || 0);
    } else cels.push({ str: it.str, ini: it.x, fim: it.x + (it.w || 0) });
  }
  for (const c of cels) c.cx = (c.ini + c.fim) / 2;
  return cels;
}

// itens do pdf.js -> linhas visuais (agrupadas por y, ordenadas de cima p/ baixo)
function linhasDoPdf(paginas) {
  const linhas = [];
  for (const itens of paginas) {
    const porY = [];
    for (const it of itens) {
      const s = String(it.str || "");
      if (!s.trim()) continue;
      let alvo = porY.find((r) => Math.abs(r.y - it.y) <= 3);
      if (!alvo) { alvo = { y: it.y, itens: [] }; porY.push(alvo); }
      alvo.itens.push({ str: s.trim(), x: it.x, w: it.w || 0 });
    }
    porY.sort((a, b) => b.y - a.y);                    // no PDF, y cresce p/ cima
    for (const r of porY) {
      r.itens.sort((a, b) => a.x - b.x);
      linhas.push({ itens: r.itens,
        texto: r.itens.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim() });
    }
  }
  return linhas;
}

// dinheiro em formato brasileiro (centavos obrigatórios — não casa "2026" nem
// parcela "04/10"); sinal por -, parênteses, R$ -… ou sufixo D (débito)
function dinheiroDoItem(str) {
  const t = semAcento(str);
  const m = t.match(/(-\s?)?(?:r\$\s?)?(-\s?)?(\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?)(?!\d)\s?([dc])?\s?(-)?/);
  if (!m) return null;
  let v = parseValorExtrato(m[3]);
  if (v == null) return null;
  if (m[1] || m[2] || m[5] || m[4] === "d") v = -Math.abs(v);
  return v;
}

function dinheirosDaLinha(row) {
  const out = [];
  for (const it of row.itens) {
    const v = dinheiroDoItem(it.str);
    if (v != null) out.push({ v, item: it });
  }
  return out;
}

// data dentro de uma linha de PDF: "12/04/2026", "12/04" (início), "12 ABR",
// "12 de abril de 2026"; sem ano explícito usa anoPadrao (e recua um ano se
// o resultado cair mais de 40 dias no futuro — fatura de janeiro lista dezembro)
function dataDoTexto(t, anoPadrao, hoje) {
  const ajustarAno = (ano, mes, dia, temAno) => {
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
    let iso = `${ano}-${pad2(mes)}-${pad2(dia)}`;
    if (!temAno) {
      const lim = new Date(hoje.getTime() + 40 * 864e5);
      if (new Date(iso + "T12:00:00") > lim) iso = `${ano - 1}-${pad2(mes)}-${pad2(dia)}`;
    }
    return iso;
  };
  let m = t.match(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}/);
  if (m) { const d = parseDataExtrato(m[0]); if (d) return d; }
  m = t.match(/(\d{1,2})\s(?:de\s)?([a-z]{3,9})\b\.?(?:\s(?:de\s)?(20\d{2}))?/);
  if (m && MESES_NOME[m[2]])
    return ajustarAno(m[3] ? +m[3] : anoPadrao, MESES_NOME[m[2]], +m[1], !!m[3]);
  m = t.match(/^(\d{1,2})[/](\d{1,2})(\s|$)/);        // "12/04 MERCADO…" (Itaú)
  if (m) return ajustarAno(anoPadrao, +m[2], +m[1], false);
  return null;
}

// cabeçalho de tabela nas primeiras linhas -> colunas por x + índices p/ montarLinhas
function acharTabelaPdf(linhas) {
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const cels = agruparCelulas(linhas[i].itens);
    const nomes = cels.map((c) => c.str);
    const idx = {
      iData: acharColuna(nomes, NOMES_DATA), iDesc: acharColuna(nomes, NOMES_DESC),
      iValor: acharColuna(nomes, NOMES_VALOR), iCred: acharColuna(nomes, NOMES_CREDITO),
      iDeb: acharColuna(nomes, NOMES_DEBITO), iTipo: acharColuna(nomes, NOMES_TIPO),
    };
    const achados = Object.values(idx).filter((x) => x >= 0).length;
    const temValor = idx.iValor >= 0 || idx.iCred >= 0 || idx.iDeb >= 0;
    if (idx.iData >= 0 && temValor && achados >= 3)
      return { i, centros: cels.map((c) => c.cx), idx };
  }
  return null;
}

// distribui as células de cada linha pela coluna de centro mais próximo
function tabelaDoPdf(linhas, cab) {
  const dados = [];
  for (const row of linhas.slice(cab.i + 1)) {
    const cels = agruparCelulas(row.itens);
    if (!cels.length) continue;
    const linha = Array(cab.centros.length).fill("");
    for (const c of cels) {
      let melhor = 0, dist = Infinity;
      cab.centros.forEach((cx, j) => {
        const d = Math.abs(c.cx - cx);
        if (d < dist) { dist = d; melhor = j; }
      });
      linha[melhor] = (linha[melhor] ? linha[melhor] + " " : "") + c.str;
    }
    dados.push(linha);
  }
  return dados;
}

// linhas informativas de fatura/extrato que não são lançamentos
const RUIDO_PDF = /(^|\s)(saldo|total|subtotal|limite|pagamento minimo|melhor dia|vencimento|encargos|creditos? futuros?|fatura anterior|proxima fatura)(\s|$|:)/;

function linhasSoltasDoPdf(linhas, anoPadrao, fatura) {
  const hoje = new Date();
  let dataAtual = null;
  const out = [];
  for (const row of linhas) {
    const t = semAcento(row.texto);
    if (RUIDO_PDF.test(t)) continue;
    const grana = dinheirosDaLinha(row);
    if (!grana.length) {
      // linha só com data = cabeçalho de seção ("12 de abril de 2026")
      const d = t.length <= 30 ? dataDoTexto(t, anoPadrao, hoje) : null;
      if (d) dataAtual = d;
      continue;
    }
    // extrato costuma ter a coluna saldo à direita do valor: usa o primeiro;
    // fatura não tem saldo: usa o último
    const g = fatura ? grana[grana.length - 1] : grana[0];
    const data = dataDoTexto(t, anoPadrao, hoje) || dataAtual;
    if (!data) continue;
    let desc = row.itens.filter((it) => !grana.some((x) => x.item === it))
      .map((i) => i.str).join(" ");
    desc = desc
      .replace(/^\s*\d{1,2}[/.\-]\d{1,2}([/.\-]\d{2,4})?\s*/, "")
      .replace(/^\s*\d{1,2}\s+(de\s+)?[A-Za-zÀ-ÿ]{3,9}\.?(\s+(de\s+)?20\d{2})?\s+/, "")
      .trim();
    const linha = novaLinha(data, desc, g.v, { positivoEhDespesa: fatura });
    if (linha) out.push(linha);
  }
  return out;
}

export function parseExtratoPdf(paginas) {
  const linhas = linhasDoPdf(paginas || []);
  if (!linhas.length)
    throw new Error("não encontrei texto neste PDF — se for digitalizado (imagem), exporte o CSV ou OFX no app do banco");
  const docTexto = semAcento(linhas.map((l) => l.texto).join(" "));
  const fatura = /fatura|cartao de credito/.test(docTexto.slice(0, 2000));

  const cab = acharTabelaPdf(linhas);
  if (cab) {
    const dados = tabelaDoPdf(linhas, cab);
    const ext = montarLinhas(dados, cab.idx, { positivoEhDespesa: fatura });
    if (ext.length) return { formato: "pdf-tabela", linhas: ext };
  }

  // ano mais frequente no documento (para datas sem ano, tipo "12 ABR")
  const anos = docTexto.match(/\b20\d{2}\b/g) || [];
  const freq = new Map();
  for (const a of anos) freq.set(+a, (freq.get(+a) || 0) + 1);
  const anoPadrao = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? new Date().getFullYear();

  const ext = linhasSoltasDoPdf(linhas, anoPadrao, fatura);
  if (!ext.length)
    throw new Error("não reconheci lançamentos neste PDF — tente o CSV ou OFX do banco");
  return { formato: fatura ? "pdf-fatura" : "pdf-extrato", linhas: ext };
}

/* ================= duplicatas contra o banco do perfil ================= */

// marca linha a linha (ciente de quantidade: 2 iguais no perfil casam 2 do arquivo)
export function marcarDuplicadas(linhas, db) {
  const chaves = new Map();
  const poe = (k) => chaves.set(k, (chaves.get(k) || 0) + 1);
  for (const l of db.lancs) {
    if (l.status === "pulado") continue;
    const v = (+(l.valorPago ?? l.valor)).toFixed(2);
    poe(`${l.pagoEm || l.venc}|${v}|${l.tipo}`);
    if (l.pagoEm && l.pagoEm !== l.venc) poe(`${l.venc}|${v}|${l.tipo}`);
  }
  for (const linha of linhas) {
    const k = `${linha.data}|${linha.valor.toFixed(2)}|${linha.tipo}`;
    const resta = chaves.get(k) || 0;
    linha.dup = resta > 0;
    if (resta > 0) chaves.set(k, resta - 1);
  }
  return linhas;
}
