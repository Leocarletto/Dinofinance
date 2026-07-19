# -*- coding: utf-8 -*-
"""
finance.py — núcleo de dados do app de finanças.

Os dados vivem em data/lancamentos.csv e data/recorrentes.csv.
Este script não tem dependências externas (só a biblioteca padrão).

Exemplos:
  python finance.py add "Internet" 99,90 --venc 15 --recorrente -c Casa
  python finance.py add "Notebook" 3200 --parcelas 8 --venc 6 -c Compras
  python finance.py add "Freela" 800 -t receita --venc 25/07/2026
  python finance.py gerar                 # materializa recorrentes do mês
  python finance.py pagar 12 14           # check-in de pagamento
  python finance.py receber 20            # check-in de recebimento
  python finance.py status                # resumo no terminal
  python finance.py app                   # home local: formulário + check-in
"""
from __future__ import annotations

import argparse
import csv
import sys
from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
ARQ_LANC = DATA / "lancamentos.csv"
ARQ_REC = DATA / "recorrentes.csv"

CAMPOS_LANC = [
    "id", "tipo", "conta", "descricao", "categoria", "valor", "vencimento",
    "competencia", "status", "pago_em", "valor_pago", "origem", "recorrente_id",
    "parcela_num", "parcela_total", "criado_em",
]
CAMPOS_REC = [
    "id", "tipo", "conta", "descricao", "categoria", "valor", "dia_venc",
    "inicio", "fim", "ativo", "criado_em",
]

CONTAS = ("pessoal", "mei")

CATEGORIAS_DESPESA = [
    "Moradia", "Mercado", "Delivery", "Restaurantes", "Farmácia", "Médica",
    "Dentista", "Psicólogo", "Academia", "Carro", "Transporte",
    "Financiamento", "Cartão de crédito", "Seguros", "Impostos",
    "Assinaturas", "Internet e telefone", "Educação", "Pet", "Família",
    "Vestuário", "Lazer", "Viagem", "Compras", "Presentes", "Serviços",
    "Empresa", "Outros",
]

CATEGORIAS_RECEITA = [
    "Salário", "Renda extra", "Ganhos pontuais", "Serviços prestados", "Outros",
]

# lista combinada (CLI e compatibilidade)
CATEGORIAS = CATEGORIAS_DESPESA + [c for c in CATEGORIAS_RECEITA
                                   if c not in CATEGORIAS_DESPESA]

MESES_ABR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
             "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


# ---------------------------------------------------------------- utilidades

def erro(msg: str) -> None:
    print(f"erro: {msg}")
    sys.exit(1)


def hoje() -> date:
    return date.today()


def parse_valor(s) -> float:
    txt = str(s).strip().replace("R$", "").strip()
    if "," in txt:
        txt = txt.replace(".", "").replace(",", ".")
    try:
        v = float(txt)
    except ValueError:
        raise ValueError(f"valor inválido: {s!r} (use 1234,56 ou 1234.56)") from None
    if v <= 0:
        raise ValueError("o valor deve ser positivo")
    return round(v, 2)


def fmt_brl(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def parse_data(s: str) -> date:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    raise ValueError(f"data inválida: {s!r} (use DD/MM/AAAA)")


def parse_mes(s: str) -> tuple[int, int]:
    try:
        a, m = s.strip().split("-")
        a, m = int(a), int(m)
        assert 1 <= m <= 12
        return a, m
    except Exception:
        raise ValueError(f"mês inválido: {s!r} (use AAAA-MM, ex.: 2026-07)") from None


def fim_do_mes(a: int, m: int) -> int:
    return monthrange(a, m)[1]


def clamp_data(a: int, m: int, dia: int) -> date:
    return date(a, m, min(dia, fim_do_mes(a, m)))


def add_meses(a: int, m: int, n: int) -> tuple[int, int]:
    total = a * 12 + (m - 1) + n
    return total // 12, total % 12 + 1


def resolver_venc(venc: str | None) -> date:
    """Dia do mês (1-31) → próxima ocorrência; ou data completa DD/MM/AAAA."""
    if venc is None:
        return hoje()
    s = venc.strip()
    if s.isdigit():
        dia = int(s)
        if not 1 <= dia <= 31:
            raise ValueError(f"dia de vencimento inválido: {dia}")
        h = hoje()
        if dia >= h.day:
            return clamp_data(h.year, h.month, dia)
        a, m = add_meses(h.year, h.month, 1)
        return clamp_data(a, m, dia)
    return parse_data(s)


# ------------------------------------------------------------------- IO CSV

def ler(arq: Path, campos: list[str]) -> list[dict]:
    if not arq.exists():
        return []
    with open(arq, newline="", encoding="utf-8") as f:
        linhas = [dict(r) for r in csv.DictReader(f)]
    for r in linhas:  # migração: dados antigos sem o campo conta
        if not r.get("conta"):
            r["conta"] = "pessoal"
    return linhas


def salvar(arq: Path, campos: list[str], linhas: list[dict]) -> None:
    DATA.mkdir(exist_ok=True)
    with open(arq, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        for r in linhas:
            w.writerow({c: r.get(c, "") for c in campos})


def prox_id(linhas: list[dict]) -> int:
    return max((int(r["id"]) for r in linhas if r.get("id")), default=0) + 1


def ordenar_lancs(lancs: list[dict]) -> list[dict]:
    return sorted(lancs, key=lambda r: (r["vencimento"], int(r["id"])))


def novo_lanc(prox: int, *, tipo: str, descricao: str, categoria: str, valor: float,
              venc: date, conta: str = "pessoal", origem: str = "avulso",
              recorrente_id: str = "", parcela_num: str = "", parcela_total: str = "",
              status: str = "pendente", pago_em: str = "", valor_pago: str = "") -> dict:
    return {
        "id": str(prox), "tipo": tipo, "conta": conta, "descricao": descricao.strip(),
        "categoria": categoria.strip(), "valor": f"{valor:.2f}",
        "vencimento": venc.isoformat(), "competencia": venc.strftime("%Y-%m"),
        "status": status, "pago_em": pago_em, "valor_pago": valor_pago,
        "origem": origem, "recorrente_id": recorrente_id,
        "parcela_num": parcela_num, "parcela_total": parcela_total,
        "criado_em": hoje().isoformat(),
    }


def validar_conta(conta: str) -> str:
    c = (conta or "pessoal").strip().lower()
    if c == "pf":
        c = "pessoal"
    if c in ("pj", "mei"):  # "mei" segue sendo o valor gravado nos CSVs
        c = "mei"
    if c not in CONTAS:
        raise ValueError(f"conta inválida: {conta!r} (use pessoal ou pj)")
    return c


def rotulo(l: dict) -> str:
    r = l["descricao"]
    if l["parcela_total"]:
        r += f" ({l['parcela_num']}/{l['parcela_total']})"
    return r


# --------------------------------------------------------------- operações

def gerar(mes: str | None = None) -> list[dict]:
    """Cria os lançamentos das recorrentes ativas para o mês (idempotente)."""
    if mes:
        a, m = parse_mes(mes)
    else:
        a, m = hoje().year, hoje().month
    comp = f"{a:04d}-{m:02d}"
    recs = ler(ARQ_REC, CAMPOS_REC)
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    existentes = {(r["recorrente_id"], r["competencia"]) for r in lancs if r["recorrente_id"]}
    criados = []
    prox = prox_id(lancs)
    for rec in recs:
        if rec["ativo"] != "1":
            continue
        if comp < rec["inicio"]:
            continue
        if rec["fim"] and comp > rec["fim"]:
            continue
        if (rec["id"], comp) in existentes:
            continue
        venc = clamp_data(a, m, int(rec["dia_venc"]))
        novo = novo_lanc(prox, tipo=rec["tipo"], descricao=rec["descricao"],
                         categoria=rec["categoria"], valor=float(rec["valor"]),
                         venc=venc, conta=rec.get("conta", "pessoal"),
                         origem="recorrente", recorrente_id=rec["id"])
        lancs.append(novo)
        criados.append(novo)
        prox += 1
    if criados:
        salvar(ARQ_LANC, CAMPOS_LANC, ordenar_lancs(lancs))
    return criados


def totais_do_mes(lancs: list[dict], comp: str, conta: str | None = None) -> dict:
    a, m = parse_mes(comp)
    fim = date(a, m, fim_do_mes(a, m)).isoformat()
    ativos = [l for l in lancs if l["status"] != "pulado"
              and (conta is None or l.get("conta") == conta)]

    def soma(itens):
        return round(sum(float(l["valor_pago"] or l["valor"]) for l in itens), 2)

    pend = [l for l in ativos if l["status"] == "pendente" and l["vencimento"] <= fim]
    pend_desp = [l for l in pend if l["tipo"] == "despesa"]
    pend_rec = [l for l in pend if l["tipo"] == "receita"]
    vencidos = [l for l in pend_desp if l["vencimento"] < hoje().isoformat()]
    pagos = [l for l in ativos if l["status"] == "pago" and l["competencia"] == comp]
    pago_desp = [l for l in pagos if l["tipo"] == "despesa"]
    receb = [l for l in pagos if l["tipo"] == "receita"]
    return {
        "a_pagar": soma(pend_desp), "n_a_pagar": len(pend_desp),
        "a_receber": soma(pend_rec), "n_a_receber": len(pend_rec),
        "vencidos": soma(vencidos), "n_vencidos": len(vencidos),
        "pago": soma(pago_desp), "n_pago": len(pago_desp),
        "recebido": soma(receb), "n_recebido": len(receb),
        "saldo": round(soma(receb) - soma(pago_desp), 2),
        "saldo_proj": round(soma(receb) + soma(pend_rec) - soma(pago_desp) - soma(pend_desp), 2),
    }


# --------------------------------------------------- núcleo de criação/baixa
# (usado pelo CLI e pelo mini-app local — server.py)

def criar_recorrente(descricao: str, valor: float, dia: int, *, tipo: str = "despesa",
                     categoria: str = "Geral", conta: str = "pessoal",
                     inicio: str | None = None, fim: str | None = None) -> tuple[dict, list[dict]]:
    if not 1 <= dia <= 31:
        raise ValueError(f"dia de vencimento inválido: {dia}")
    if not descricao.strip():
        raise ValueError("informe a descrição")
    recs = ler(ARQ_REC, CAMPOS_REC)
    rec = {
        "id": str(prox_id(recs)), "tipo": tipo, "conta": validar_conta(conta),
        "descricao": descricao.strip(),
        "categoria": categoria.strip() or "Outros", "valor": f"{valor:.2f}",
        "dia_venc": str(dia), "inicio": inicio or hoje().strftime("%Y-%m"),
        "fim": fim or "", "ativo": "1", "criado_em": hoje().isoformat(),
    }
    recs.append(rec)
    salvar(ARQ_REC, CAMPOS_REC, recs)
    return rec, gerar()


def criar_parcelado(descricao: str, valor: float, n: int, primeiro: date, *,
                    tipo: str = "despesa", categoria: str = "Geral",
                    conta: str = "pessoal", valor_e_parcela: bool = False) -> list[dict]:
    if n < 2:
        raise ValueError("parcelamento exige 2 ou mais parcelas")
    if not descricao.strip():
        raise ValueError("informe a descrição")
    if valor_e_parcela:
        vparc = [valor] * n
    else:
        base = round(valor / n, 2)
        vparc = [base] * (n - 1) + [round(valor - base * (n - 1), 2)]
    conta = validar_conta(conta)
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    prox = prox_id(lancs)
    novos = []
    for i in range(n):
        a, m = add_meses(primeiro.year, primeiro.month, i)
        venc = clamp_data(a, m, primeiro.day)
        novos.append(novo_lanc(prox, tipo=tipo, descricao=descricao,
                               categoria=categoria.strip() or "Outros", valor=vparc[i],
                               venc=venc, conta=conta, origem="parcelado",
                               parcela_num=str(i + 1), parcela_total=str(n)))
        prox += 1
    salvar(ARQ_LANC, CAMPOS_LANC, ordenar_lancs(lancs + novos))
    return novos


def criar_avulso(descricao: str, valor: float, venc: date, *, tipo: str = "despesa",
                 categoria: str = "Geral", conta: str = "pessoal") -> dict:
    if not descricao.strip():
        raise ValueError("informe a descrição")
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    novo = novo_lanc(prox_id(lancs), tipo=tipo, descricao=descricao,
                     categoria=categoria.strip() or "Outros", valor=valor, venc=venc,
                     conta=validar_conta(conta))
    lancs.append(novo)
    salvar(ARQ_LANC, CAMPOS_LANC, ordenar_lancs(lancs))
    return novo


def dar_baixa(ids, data_pg: date | None = None, valor: float | None = None) -> list[str]:
    if valor is not None and len(ids) > 1:
        raise ValueError("valor efetivo só pode ser usado com um único id")
    data_pg = data_pg or hoje()
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    por_id = {l["id"]: l for l in lancs}
    msgs = []
    for i in ids:
        l = por_id.get(str(i))
        if not l:
            raise ValueError(f"lançamento #{i} não encontrado")
        if l["status"] == "pago":
            msgs.append(f"#{i} {rotulo(l)} já estava pago (em {l['pago_em']}).")
            continue
        l["status"] = "pago"
        l["pago_em"] = data_pg.isoformat()
        l["valor_pago"] = f"{valor:.2f}" if valor is not None else l["valor"]
        verbo = "recebido" if l["tipo"] == "receita" else "pago"
        msgs.append(f"✓ #{i} {rotulo(l)} {fmt_brl(float(l['valor_pago']))} {verbo} "
                    f"em {data_pg.strftime('%d/%m/%Y')}")
    salvar(ARQ_LANC, CAMPOS_LANC, lancs)
    return msgs


def reverter(ids) -> list[str]:
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    por_id = {l["id"]: l for l in lancs}
    msgs = []
    for i in ids:
        l = por_id.get(str(i))
        if not l:
            raise ValueError(f"lançamento #{i} não encontrado")
        l["status"] = "pendente"
        l["pago_em"] = ""
        l["valor_pago"] = ""
        msgs.append(f"#{i} {rotulo(l)} voltou para pendente.")
    salvar(ARQ_LANC, CAMPOS_LANC, lancs)
    return msgs


def categorias_existentes() -> list[str]:
    cats = {l["categoria"] for l in ler(ARQ_LANC, CAMPOS_LANC)}
    cats |= {r["categoria"] for r in ler(ARQ_REC, CAMPOS_REC)}
    return sorted(c for c in cats if c)


def categorias_por_tipo(tipo: str) -> list[str]:
    """Categorias já usadas nos dados, separadas por despesa/receita."""
    cats = {l["categoria"] for l in ler(ARQ_LANC, CAMPOS_LANC) if l["tipo"] == tipo}
    cats |= {r["categoria"] for r in ler(ARQ_REC, CAMPOS_REC) if r["tipo"] == tipo}
    return sorted(c for c in cats if c)


# ----------------------------------------------------------------- comandos

def cmd_add(args) -> None:
    valor = parse_valor(args.valor)
    tipo = "receita" if args.tipo.startswith("r") else "despesa"
    conta = validar_conta(args.conta)

    if args.recorrente:
        if not (args.venc and args.venc.strip().isdigit()):
            raise ValueError("recorrente exige --venc DIA (ex.: --venc 10)")
        rec, criados = criar_recorrente(args.descricao, valor, int(args.venc),
                                        tipo=tipo, categoria=args.categoria,
                                        conta=conta, inicio=args.inicio, fim=args.fim)
        print(f"recorrente #{rec['id']} criada: {rec['descricao']} "
              f"({fmt_brl(valor)} todo dia {rec['dia_venc']}, {tipo}, {conta})")
        for c in criados:
            print(f"  + lançamento #{c['id']} gerado p/ {c['competencia']} (venc. {c['vencimento']})")
        return

    if args.parcelas and args.parcelas > 1:
        primeiro = resolver_venc(args.venc)
        novos = criar_parcelado(args.descricao, valor, args.parcelas, primeiro,
                                tipo=tipo, categoria=args.categoria, conta=conta,
                                valor_e_parcela=args.valor_parcela)
        total = round(sum(float(x["valor"]) for x in novos), 2)
        print(f"{args.descricao}: {len(novos)}x de {fmt_brl(float(novos[0]['valor']))} "
              f"(total {fmt_brl(total)}), 1ª parcela em {primeiro.strftime('%d/%m/%Y')}")
        return

    venc = resolver_venc(args.venc)
    novo = criar_avulso(args.descricao, valor, venc, tipo=tipo,
                        categoria=args.categoria, conta=conta)
    print(f"lançamento #{novo['id']}: {novo['descricao']} {fmt_brl(valor)} "
          f"({tipo}, {conta}, vence {venc.strftime('%d/%m/%Y')})")


def cmd_gerar(args) -> None:
    criados = gerar(args.mes)
    if not criados:
        print("nada a gerar (tudo já materializado para o mês).")
        return
    for c in criados:
        print(f"+ #{c['id']} {rotulo(c)} {fmt_brl(float(c['valor']))} venc. {c['vencimento']}")
    print(f"{len(criados)} lançamento(s) gerado(s).")


def cmd_pagar(args) -> None:
    data_pg = parse_data(args.data) if args.data else None
    valor = parse_valor(args.valor) if args.valor else None
    for m in dar_baixa(args.ids, data_pg, valor):
        print(m)


def cmd_desfazer(args) -> None:
    for m in reverter(args.ids):
        print(m)


def cmd_pular(args) -> None:
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    por_id = {l["id"]: l for l in lancs}
    for i in args.ids:
        l = por_id.get(str(i))
        if not l:
            erro(f"lançamento #{i} não encontrado")
        l["status"] = "pulado"
        print(f"#{i} {rotulo(l)} pulado (fora dos totais; não será regenerado).")
    salvar(ARQ_LANC, CAMPOS_LANC, lancs)


def cmd_rm(args) -> None:
    if args.recorrente is not None:
        recs = ler(ARQ_REC, CAMPOS_REC)
        rec = next((r for r in recs if r["id"] == str(args.recorrente)), None)
        if not rec:
            erro(f"recorrente #{args.recorrente} não encontrada")
        rec["ativo"] = "0"
        salvar(ARQ_REC, CAMPOS_REC, recs)
        print(f"recorrente #{rec['id']} {rec['descricao']} desativada "
              "(lançamentos já gerados foram mantidos).")
        return
    if not args.ids:
        erro("informe os ids a remover (ou --recorrente ID)")
    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    recs_ativas = {r["id"] for r in ler(ARQ_REC, CAMPOS_REC) if r["ativo"] == "1"}
    ids = {str(i) for i in args.ids}
    restam, removidos = [], []
    for l in lancs:
        (removidos if l["id"] in ids else restam).append(l)
    if not removidos:
        erro("nenhum id encontrado")
    salvar(ARQ_LANC, CAMPOS_LANC, restam)
    for l in removidos:
        print(f"- #{l['id']} {rotulo(l)} removido")
        if l["recorrente_id"] in recs_ativas:
            print("  aviso: item de recorrente ativa — 'gerar' vai recriá-lo. "
                  "Para ignorar só este mês use: python finance.py pular ID")


def _tabela(lancs: list[dict]) -> None:
    if not lancs:
        print("(vazio)")
        return
    h = hoje().isoformat()
    print(f"{'id':>4}  {'venc':<10}  {'descrição':<32}  {'categoria':<14}  "
          f"{'valor':>12}  status")
    for l in lancs:
        if l["status"] == "pago":
            st = ("recebido " if l["tipo"] == "receita" else "pago ") + \
                 datetime.fromisoformat(l["pago_em"]).strftime("%d/%m")
        elif l["status"] == "pulado":
            st = "pulado"
        elif l["vencimento"] < h:
            atraso = (hoje() - date.fromisoformat(l["vencimento"])).days
            st = f"VENCIDO há {atraso}d"
        else:
            st = "pendente"
        sinal = "+" if l["tipo"] == "receita" else " "
        print(f"{l['id']:>4}  {date.fromisoformat(l['vencimento']).strftime('%d/%m/%Y')}  "
              f"{rotulo(l)[:32]:<32}  {l['categoria'][:14]:<14}  "
              f"{sinal}{fmt_brl(float(l['valor'])):>11}  {st}")


def cmd_listar(args) -> None:
    lancs = ordenar_lancs(ler(ARQ_LANC, CAMPOS_LANC))
    if args.todos:
        _tabela(lancs)
        return
    comp = args.mes or hoje().strftime("%Y-%m")
    a, m = parse_mes(comp)
    fim = date(a, m, fim_do_mes(a, m)).isoformat()
    sel = [l for l in lancs if l["competencia"] == comp or
           (l["status"] == "pendente" and l["vencimento"] <= fim)]
    if args.pendentes:
        sel = [l for l in sel if l["status"] == "pendente"]
    _tabela(sel)


def cmd_recorrentes(args) -> None:
    recs = ler(ARQ_REC, CAMPOS_REC)
    if not recs:
        print("nenhuma recorrente cadastrada.")
        return
    print(f"{'id':>4}  {'descrição':<28}  {'categoria':<14}  {'valor':>12}  "
          f"{'venc':>6}  {'tipo':<8}  ativa")
    for r in recs:
        print(f"{r['id']:>4}  {r['descricao'][:28]:<28}  {r['categoria'][:14]:<14}  "
              f"{fmt_brl(float(r['valor'])):>12}  dia {int(r['dia_venc']):>2}  "
              f"{r['tipo']:<8}  {'sim' if r['ativo'] == '1' else 'não'}")


def cmd_status(args) -> None:
    gerar()
    comp = args.mes or hoje().strftime("%Y-%m")
    a, m = parse_mes(comp)
    t = totais_do_mes(ler(ARQ_LANC, CAMPOS_LANC), comp)
    print(f"— {MESES_ABR[m - 1]}/{a} —")
    print(f"  recebido   {fmt_brl(t['recebido']):>14}   ({t['n_recebido']} itens)")
    print(f"  a receber  {fmt_brl(t['a_receber']):>14}   ({t['n_a_receber']} itens)")
    print(f"  pago       {fmt_brl(t['pago']):>14}   ({t['n_pago']} itens)")
    print(f"  a pagar    {fmt_brl(t['a_pagar']):>14}   ({t['n_a_pagar']} itens, "
          f"{t['n_vencidos']} vencidos = {fmt_brl(t['vencidos'])})")
    print(f"  saldo      {fmt_brl(t['saldo']):>14}   (projetado {fmt_brl(t['saldo_proj'])})")


def cmd_app(args) -> None:
    import server
    server.rodar(porta=args.porta, abrir=not args.sem_navegador)


def cmd_zerar(args) -> None:
    if not args.forcar:
        erro("isso apaga TODOS os dados. Confirme com: python finance.py zerar --forcar")
    for arq in (ARQ_LANC, ARQ_REC):
        if arq.exists():
            arq.unlink()
    print("dados zerados (data/*.csv removidos).")


# ------------------------------------------------------------ dados exemplo

def cmd_exemplo(args) -> None:
    if ler(ARQ_LANC, CAMPOS_LANC) and not args.forcar:
        erro("já existem dados em data/. Para sobrescrever com o exemplo: "
             "python finance.py exemplo --forcar")
    for arq in (ARQ_LANC, ARQ_REC):
        if arq.exists():
            arq.unlink()

    h = hoje()
    ini_a, ini_m = add_meses(h.year, h.month, -5)
    inicio = f"{ini_a:04d}-{ini_m:02d}"
    recs = []
    defs = [  # descricao, categoria, valor, dia, tipo, conta
        ("Salário", "Salário", 5200.00, 5, "receita", "pessoal"),
        ("Aluguel", "Moradia", 1550.00, 10, "despesa", "pessoal"),
        ("Energia", "Moradia", 184.50, 20, "despesa", "pessoal"),
        ("Internet", "Moradia", 99.90, 15, "despesa", "pessoal"),
        ("Academia", "Academia", 89.90, 8, "despesa", "pessoal"),
        ("Streaming", "Assinaturas", 55.90, 12, "despesa", "pessoal"),
        ("Seguro do carro", "Seguros", 168.00, 14, "despesa", "pessoal"),
        ("Financiamento carro", "Financiamento", 620.00, 18, "despesa", "pessoal"),
        ("Fatura Nubank", "Cartão de crédito", 840.00, 8, "despesa", "pessoal"),
        ("Fatura Itaú", "Cartão de crédito", 390.00, 3, "despesa", "pessoal"),
        ("DAS (imposto)", "Impostos", 75.90, 20, "despesa", "mei"),
        ("Contador", "Serviços", 120.00, 10, "despesa", "mei"),
    ]
    for i, (d, c, v, dia, t, ct) in enumerate(defs, 1):
        recs.append({"id": str(i), "tipo": t, "conta": ct, "descricao": d,
                     "categoria": c, "valor": f"{v:.2f}", "dia_venc": str(dia),
                     "inicio": inicio, "fim": "", "ativo": "1",
                     "criado_em": h.isoformat()})
    salvar(ARQ_REC, CAMPOS_REC, recs)

    # materializa os 6 meses (5 passados + atual)
    for k in range(-5, 1):
        a, m = add_meses(h.year, h.month, k)
        gerar(f"{a:04d}-{m:02d}")

    lancs = ler(ARQ_LANC, CAMPOS_LANC)
    prox = prox_id(lancs)

    def add_(k, dia, **kw):
        nonlocal prox
        a, m = add_meses(h.year, h.month, k)
        lancs.append(novo_lanc(prox, venc=clamp_data(a, m, dia), **kw))
        prox += 1

    # notebook parcelado em 8x começando há 3 meses (pessoal)
    pa, pm = add_meses(h.year, h.month, -3)
    base = round(3200.00 / 8, 2)
    for i in range(8):
        a, m = add_meses(pa, pm, i)
        v = base if i < 7 else round(3200.00 - base * 7, 2)
        lancs.append(novo_lanc(prox, tipo="despesa", descricao="Notebook Dell",
                               categoria="Compras", valor=v, venc=clamp_data(a, m, 6),
                               origem="parcelado", parcela_num=str(i + 1),
                               parcela_total="8"))
        prox += 1

    # avulsos variáveis por mês
    for k in range(-5, 1):
        a, m = add_meses(h.year, h.month, k)
        var = ((a * 12 + m) * 37) % 120  # variação determinística
        add_(k, 17, tipo="despesa", descricao="Mercado", categoria="Mercado",
             valor=420.00 + var)
        add_(k, 9, tipo="despesa", descricao="iFood", categoria="Delivery",
             valor=84.00 + var / 2)
        add_(k, 22, tipo="despesa", descricao="Farmácia", categoria="Farmácia",
             valor=68.00 + var / 3)
        add_(k, 11, tipo="despesa", descricao="Uber", categoria="Transporte",
             valor=54.00 + var / 3)
        if k % 2 == 0:
            add_(k, 13, tipo="despesa", descricao="Pet shop", categoria="Pet",
                 valor=112.00 + var / 4)
        # receitas da conta PJ (notas variáveis)
        add_(k, 15, tipo="receita", descricao="Serviços prestados",
             categoria="Serviços prestados", conta="mei", valor=1450.00 + var * 6)
        if k in (-4, -2, 0):
            add_(k, 25, tipo="receita", descricao="Freela", categoria="Renda extra",
                 valor=650.00 + var * 2)

    # check-ins: meses passados 100% pagos; mês atual pago até anteontem,
    # deixando aluguel e internet vencidos para mostrar os estados
    comp_atual = h.strftime("%Y-%m")
    abertos = {"Aluguel", "Internet"}
    for l in lancs:
        venc = date.fromisoformat(l["vencimento"])
        if l["competencia"] < comp_atual:
            l["status"] = "pago"
            l["pago_em"] = venc.isoformat()
            l["valor_pago"] = l["valor"]
        elif l["competencia"] == comp_atual and venc <= h - timedelta(days=2) \
                and l["descricao"] not in abertos:
            l["status"] = "pago"
            l["pago_em"] = venc.isoformat()
            l["valor_pago"] = l["valor"]

    salvar(ARQ_LANC, CAMPOS_LANC, ordenar_lancs(lancs))
    print(f"dados de exemplo criados ({len(lancs)} lançamentos, {len(recs)} recorrentes, "
          "contas Pessoal + PJ).")
    print("para começar do zero depois: python finance.py zerar --forcar")


# ----------------------------------------------------------------- parser

def montar_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="finance.py", description="Gerencia os dados do app de finanças.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("add", help="novo lançamento / recorrente / parcelado")
    a.add_argument("descricao")
    a.add_argument("valor", help="ex.: 99,90 (com --parcelas é o valor TOTAL)")
    a.add_argument("-t", "--tipo", default="despesa", choices=["despesa", "receita", "d", "r"])
    a.add_argument("-c", "--categoria", default="Outros")
    a.add_argument("--conta", default="pessoal",
                   help="pessoal (padrão) ou pj")
    a.add_argument("--venc", help="dia do mês (1-31) ou data DD/MM/AAAA")
    a.add_argument("--parcelas", type=int, help="nº de parcelas mensais")
    a.add_argument("--valor-parcela", action="store_true",
                   help="tratar VALOR como o valor de cada parcela (não o total)")
    a.add_argument("--recorrente", action="store_true", help="repete todo mês")
    a.add_argument("--inicio", help="recorrente: primeiro mês AAAA-MM")
    a.add_argument("--fim", help="recorrente: último mês AAAA-MM")
    a.set_defaults(func=cmd_add)

    g = sub.add_parser("gerar", help="materializa recorrentes do mês")
    g.add_argument("--mes", help="AAAA-MM (padrão: mês atual)")
    g.set_defaults(func=cmd_gerar)

    for nome, ajuda in (("pagar", "check-in de pagamento"),
                        ("receber", "check-in de recebimento")):
        c = sub.add_parser(nome, help=ajuda)
        c.add_argument("ids", nargs="+", type=int)
        c.add_argument("--data", help="DD/MM/AAAA (padrão: hoje)")
        c.add_argument("--valor", help="valor efetivo, se diferente do previsto")
        c.set_defaults(func=cmd_pagar)

    d = sub.add_parser("desfazer", help="volta lançamentos para pendente")
    d.add_argument("ids", nargs="+", type=int)
    d.set_defaults(func=cmd_desfazer)

    pu = sub.add_parser("pular", help="ignora uma ocorrência (fora dos totais)")
    pu.add_argument("ids", nargs="+", type=int)
    pu.set_defaults(func=cmd_pular)

    r = sub.add_parser("rm", help="remove lançamentos / desativa recorrente")
    r.add_argument("ids", nargs="*", type=int)
    r.add_argument("--recorrente", type=int, metavar="ID",
                   help="desativa a recorrente (para de gerar)")
    r.set_defaults(func=cmd_rm)

    li = sub.add_parser("listar", help="lista lançamentos do mês + pendências")
    li.add_argument("--mes", help="AAAA-MM (padrão: mês atual)")
    li.add_argument("--pendentes", action="store_true")
    li.add_argument("--todos", action="store_true")
    li.set_defaults(func=cmd_listar)

    re_ = sub.add_parser("recorrentes", help="lista as recorrentes")
    re_.set_defaults(func=cmd_recorrentes)

    st = sub.add_parser("status", help="resumo do mês no terminal")
    st.add_argument("--mes", help="AAAA-MM (padrão: mês atual)")
    st.set_defaults(func=cmd_status)

    ap = sub.add_parser("app", help="home local: lançar contas e check-in com um clique")
    ap.add_argument("--porta", type=int, default=8787)
    ap.add_argument("--sem-navegador", action="store_true",
                    help="não abrir o navegador automaticamente")
    ap.set_defaults(func=cmd_app)

    ex = sub.add_parser("exemplo", help="cria dados de demonstração")
    ex.add_argument("--forcar", action="store_true")
    ex.set_defaults(func=cmd_exemplo)

    z = sub.add_parser("zerar", help="apaga todos os dados")
    z.add_argument("--forcar", action="store_true")
    z.set_defaults(func=cmd_zerar)
    return p


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = montar_parser().parse_args()
    try:
        args.func(args)
    except ValueError as e:
        erro(str(e))


if __name__ == "__main__":
    main()
