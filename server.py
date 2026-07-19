# -*- coding: utf-8 -*-
"""Mini-app local de finanças: visão geral com comparação de períodos +
página de lançamentos editável pelo navegador.

Uso: python finance.py app   →  http://127.0.0.1:8787
Sem dependências externas (http.server da biblioteca padrão).
"""
from __future__ import annotations

import json
import mimetypes
import shutil
import webbrowser
from datetime import date, datetime, timedelta
from html import escape as esc
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

import finance as fin

BASE = fin.BASE

PERIODOS = [
    ("mes", "Este mês"),
    ("30d", "Últimos 30 dias"),
    ("3m", "Últimos 3 meses"),
    ("6m", "Últimos 6 meses"),
    ("ano", "Este ano"),
]

# "mei" é o valor interno gravado nos CSVs; o rótulo exibido é PJ
CONTAS_UI = [("tudo", "Tudo"), ("pessoal", "Pessoal"), ("mei", "PJ")]

MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
               "agosto", "setembro", "outubro", "novembro", "dezembro"]
DIAS_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


# ------------------------------------------------------------------ períodos

def resolver_periodo(p: str) -> tuple[date, date, str]:
    h = fin.hoje()
    if p == "30d":
        return h - timedelta(days=29), h, "Últimos 30 dias"
    if p == "3m":
        a, m = fin.add_meses(h.year, h.month, -2)
        return date(a, m, 1), h, "Últimos 3 meses"
    if p == "6m":
        a, m = fin.add_meses(h.year, h.month, -5)
        return date(a, m, 1), h, "Últimos 6 meses"
    if p == "ano":
        return date(h.year, 1, 1), h, "Este ano"
    return date(h.year, h.month, 1), h, "Este mês"


def periodo_anterior(ini: date, fim: date) -> tuple[date, date]:
    n = (fim - ini).days + 1
    return ini - timedelta(days=n), ini - timedelta(days=1)


def rotulo_curto(d: date) -> str:
    return f"{d.day} {fin.MESES_ABR[d.month - 1].lower()}"


def serie_realizada(lancs: list[dict], ini: date, fim: date, conta: str | None,
                    tipo: str) -> tuple[list[str], list[float]]:
    """Somas do que foi pago/recebido (pago_em) por dia ou por mês no intervalo."""
    sel = [l for l in lancs
           if l["status"] == "pago" and l["pago_em"] and l["tipo"] == tipo
           and (conta is None or l["conta"] == conta)
           and ini.isoformat() <= l["pago_em"] <= fim.isoformat()]
    span = (fim - ini).days + 1
    if span <= 45:
        labels, vals = [], []
        d = ini
        while d <= fim:
            labels.append(rotulo_curto(d))
            vals.append(0.0)
            d += timedelta(days=1)
        for l in sel:
            i = (date.fromisoformat(l["pago_em"]) - ini).days
            vals[i] += float(l["valor_pago"] or l["valor"])
        return labels, [round(v, 2) for v in vals]
    labels, chaves, vals = [], [], []
    a, m = ini.year, ini.month
    while (a, m) <= (fim.year, fim.month):
        chaves.append(f"{a:04d}-{m:02d}")
        labels.append(fin.MESES_ABR[m - 1])
        vals.append(0.0)
        a, m = fin.add_meses(a, m, 1)
    idx = {c: i for i, c in enumerate(chaves)}
    for l in sel:
        i = idx.get(l["pago_em"][:7])
        if i is not None:
            vals[i] += float(l["valor_pago"] or l["valor"])
    return labels, [round(v, 2) for v in vals]


def gastos_por_categoria(lancs, ini: date, fim: date, conta: str | None,
                         topo: int = 5) -> list[tuple[str, float]]:
    tot: dict[str, float] = {}
    for l in lancs:
        if (l["status"] == "pago" and l["pago_em"] and l["tipo"] == "despesa"
                and (conta is None or l["conta"] == conta)
                and ini.isoformat() <= l["pago_em"] <= fim.isoformat()):
            tot[l["categoria"]] = tot.get(l["categoria"], 0.0) + float(l["valor_pago"] or l["valor"])
    ordem = sorted(tot.items(), key=lambda x: -x[1])
    if len(ordem) > topo:
        resto = sum(v for _, v in ordem[topo:])
        ordem = ordem[:topo] + [("Outros", resto)]
    return ordem


# ------------------------------------------------------------------ helpers

# As cores vivem no CSS (classes .c0…: rampa monocromática que se adapta ao
# tema claro/escuro; fatias já vêm ordenadas por valor, e a legenda carrega
# nome+valor+% — a identidade nunca depende só da cor). "Outros" é o mais claro.
N_CORES = 5
COR_PAGA, COR_AVENCER, COR_VENCIDA = "st-paga", "st-avencer", "st-vencida"


def cor_cat(i: int) -> str:
    return f"c{i}" if i < N_CORES else "c-outros"


ICONES = {
    "dinheiro": '<path d="M12 2.5v19M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3"/>',
    "tendencia": '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    "raio": '<path d="M13 2 4.5 13.5h6L11 22l8.5-11.5h-6L13 2z"/>',
    "cartao": '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
    "recibo": '<path d="M6 2.5h12V21l-3-2-3 2-3-2-3 2V2.5z"/><path d="M9.5 7.5h5M9.5 11.5h5"/>',
    "barras": '<path d="M5 20v-6M10 20V8M15 20v-9M20 20V4"/>',
    "pizza": '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>',
    "carteira": '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M15.5 12.5h3M5.5 6l2.5-3h8l2.5 3"/>',
    "mais": '<path d="M12 5v14M5 12h14"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
}


def ico(nome: str) -> str:
    return (f'<span class="ico-tile"><svg viewBox="0 0 24 24" fill="none" '
            f'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
            f'stroke-linejoin="round">{ICONES[nome]}</svg></span>')


def fmt(v: float) -> str:
    return fin.fmt_brl(v)


def fmt_inteiro(v: float) -> str:
    return "R$ " + f"{v:,.0f}".replace(",", ".")


def hora_agora() -> str:
    return datetime.now().strftime("%H:%M")


def rodape_cartao(link: str, rotulo_link: str) -> str:
    return (f'<div class="cartao-rodape"><span>Atualizado {hora_agora()}</span>'
            f'<a href="{link}">{rotulo_link}</a></div>')


def barra_segmentada(partes: list[tuple[str, float, str]]) -> str:
    """Barra horizontal proporcional (gap de 2px entre segmentos); cor via classe."""
    total = sum(v for _, v, _ in partes if v > 0)
    if total <= 0:
        return '<div class="seg-bar vazia"></div>'
    spans = "".join(
        f'<span class="seg-parte {cor}" style="flex:{v / total:.4f}" '
        f'title="{esc(nome)} · {esc(fmt(v))}"></span>'
        for nome, v, cor in partes if v > 0)
    return f'<div class="seg-bar">{spans}</div>'


def linhas_legenda(partes: list[tuple[str, float, str]], com_pct: bool = False) -> str:
    """Linhas de legenda: quadradinho de cor + nome + (%) + valor à direita."""
    total = sum(v for _, v, _ in partes if v > 0) or 1.0
    out = []
    for nome, v, cor in partes:
        pct = (f'<span class="leg-pct">{v / total * 100:.0f}%</span>'
               if com_pct and v > 0 else "")
        out.append(
            f'<div class="leg-linha"><span class="leg-dot {cor}"></span>'
            f'<span class="leg-nome">{esc(nome)}</span>{pct}'
            f'<b class="leg-val">{esc(fmt(v))}</b></div>')
    return "".join(out)


def donut_svg(partes: list[tuple[str, float, str]], rot1: str, rot2: str) -> str:
    """Rosca de proporção com total no centro (tooltip nativo por fatia)."""
    total = sum(v for _, v, _ in partes if v > 0)
    if total <= 0:
        return ""
    import math
    cx = cy = 110
    r = 78
    circ = 2 * math.pi * r
    visiveis = [p for p in partes if p[1] > 0]
    gap = 3.0 if len(visiveis) > 1 else 0.0
    off = 0.0
    arcos = []
    for nome, v, cor in visiveis:
        comp = v / total * circ
        traco = max(comp - gap, 1.4)
        arcos.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" class="{cor}" '
            f'stroke-width="30" stroke-dasharray="{traco:.2f} {circ - traco:.2f}" '
            f'stroke-dashoffset="{-off:.2f}">'
            f'<title>{esc(nome)} · {esc(fmt(v))} ({v / total * 100:.1f}%)</title></circle>')
        off += comp
    return f'''
<svg viewBox="0 0 220 220" class="donut" role="img" aria-label="{esc(rot1)} {esc(rot2)}: {esc(fmt(total))}">
  <g transform="rotate(-90 {cx} {cy})">{"".join(arcos)}</g>
  <text x="{cx}" y="92" text-anchor="middle" class="donut-rot">{esc(rot1)}</text>
  <text x="{cx}" y="107" text-anchor="middle" class="donut-rot">{esc(rot2)}</text>
  <text x="{cx}" y="134" text-anchor="middle" class="donut-val">{esc(fmt_inteiro(total))}</text>
</svg>'''


def fmt_compacto(v: float) -> str:
    if abs(v) >= 1_000_000:
        s = f"{v / 1_000_000:.1f}".replace(".", ",").removesuffix(",0")
        return f"R$ {s} mi"
    if abs(v) >= 1000:
        s = f"{v / 1000:.1f}".replace(".", ",").removesuffix(",0")
        return f"R$ {s} mil"
    return f"R$ {v:,.0f}".replace(",", ".")


def delta_html(atual: float, anterior: float, subir_e_bom: bool) -> str:
    if anterior <= 0:
        return '<span class="delta neutro">—</span>'
    pct = (atual - anterior) / anterior * 100
    seta = "↑" if pct >= 0 else "↓"
    bom = (pct >= 0) == subir_e_bom
    cls = "bom" if bom else "ruim"
    p = f"{abs(pct):.1f}".replace(".", ",")
    return f'<span class="delta {cls}">{seta} {p}%</span>'


def nice_teto(v: float) -> float:
    if v <= 0:
        return 100.0
    import math
    exp = math.floor(math.log10(v))
    base = 10 ** exp
    for k in (1, 2, 2.5, 5, 10):
        if v <= k * base:
            return k * base
    return 10 * base


# --------------------------------------------------------------- SVG charts

def grafico_svg(gid: str, labels: list[str], atual: list[float],
                anterior: list[float]) -> str:
    W, H = 640, 190
    pl, pr, pt, pb = 4, 56, 12, 24
    if len(labels) == 1:  # dia 1º do mês: duplica para traçar uma linha
        labels, atual, anterior = labels * 2, atual * 2, anterior * 2
    n = max(len(labels), 2)
    at = atual + [0.0] * (n - len(atual))
    an = (anterior + [0.0] * n)[:n]
    ymax = nice_teto(max(max(at, default=0), max(an, default=0), 1))

    def x(i):
        return pl + i * (W - pl - pr) / (n - 1)

    def y(v):
        return pt + (1 - v / ymax) * (H - pt - pb)

    def caminho(vals):
        return " ".join(f"{'M' if i == 0 else 'L'}{x(i):.1f},{y(v):.1f}"
                        for i, v in enumerate(vals))

    meio = ymax / 2
    grade = ""
    for gv in (0.0, meio, ymax):
        gy = y(gv)
        grade += (f'<line x1="{pl}" y1="{gy:.1f}" x2="{W - pr}" y2="{gy:.1f}" class="gr"/>'
                  f'<text x="{W - pr + 8}" y="{gy + 3.5:.1f}" class="ytick">{esc(fmt_compacto(gv))}</text>')

    ux, uy = x(n - 1), y(at[-1])
    base_y = y(0.0)
    area = (f'<path d="{caminho(at)} L{x(n - 1):.1f},{base_y:.1f} '
            f'L{x(0):.1f},{base_y:.1f} Z" class="area-atual"/>')
    raio_pt = 2.7 if n <= 16 else 2.1  # pontos no estilo da referência
    pontos = "".join(f'<circle cx="{x(i):.1f}" cy="{y(v):.1f}" r="{raio_pt}" class="pt"/>'
                     for i, v in enumerate(at))
    dados = esc(json.dumps({"labels": labels, "atual": at, "anterior": an},
                           ensure_ascii=False), quote=True)
    return f'''
<div class="chart" data-gid="{gid}">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="chart-svg">
    {grade}
    {area}
    <path d="{caminho(an)}" class="ln-prev"/>
    <path d="{caminho(at)}" class="ln-atual"/>
    {pontos}
    <circle cx="{ux:.1f}" cy="{uy:.1f}" r="4" class="dot-fim"/>
    <line id="{gid}-cx" x1="0" y1="{pt}" x2="0" y2="{H - pb}" class="crosshair" visibility="hidden"/>
    <circle id="{gid}-da" r="4" class="dot-hv atual" visibility="hidden"/>
    <circle id="{gid}-dp" r="3.5" class="dot-hv prev" visibility="hidden"/>
    <rect class="hit" x="{pl}" y="0" width="{W - pl - pr}" height="{H}" fill="transparent" data-dados="{dados}" data-pl="{pl}" data-pr="{pr}" data-pt="{pt}" data-pb="{pb}" data-ymax="{ymax}"/>
  </svg>
  <div class="xlabels"><span>{esc(labels[0])}</span><span>{esc(labels[-1])}</span></div>
  <div class="tooltip" id="{gid}-tt" hidden></div>
</div>'''


# ------------------------------------------------------------------- layout

# logo Dino Finanças (carnotauro) — tile segue var(--accent), corpo var(--accent-inv)
LOGO_DINO = (
    '<svg class="logo-dino" viewBox="0 0 512 512" aria-hidden="true">'
    '<rect width="512" height="512" rx="115" style="fill:var(--accent,#0a0a0a)"/>'
    '<g style="fill:var(--accent-inv,#ffffff)">'
    '<path d="M200 216C140 218 94 212 58 198C51 202 49 210 53 216C86 250 136 282 196 312Z"/>'
    '<ellipse cx="196" cy="316" rx="38" ry="52" transform="rotate(10 196 316)"/>'
    '<path d="M182 344C184 364 182 378 177 390L208 390C206 372 208 356 214 340Z"/>'
    '<rect x="154" y="376" width="72" height="20" rx="10"/>'
    '<ellipse cx="244" cy="270" rx="94" ry="66" transform="rotate(-12 244 270)"/>'
    '<ellipse cx="312" cy="202" rx="56" ry="40" transform="rotate(-40 312 202)"/>'
    '<ellipse cx="354" cy="270" rx="24" ry="10" transform="rotate(32 354 270)"/>'
    '<rect x="340" y="110" width="124" height="84" rx="26"/>'
    '<path d="M348 132C342 104 344 86 352 76C360 82 366 104 368 132Z"/>'
    '<path d="M400 130C402 98 410 80 422 74C428 82 430 100 426 128Z"/>'
    '<ellipse cx="286" cy="314" rx="40" ry="54" transform="rotate(-14 286 314)"/>'
    '<path d="M270 342C274 364 272 378 266 390L298 390C294 372 296 356 302 340Z"/>'
    '<rect x="258" y="376" width="84" height="20" rx="10"/>'
    '</g>'
    '<g style="fill:var(--accent,#0a0a0a)">'
    '<circle cx="410" cy="140" r="11"/>'
    '<circle cx="447" cy="129" r="4.5"/>'
    '<rect x="400" y="162" width="72" height="15" rx="7.5"/>'
    '</g>'
    '</svg>')


def qs_conta(conta: str | None) -> str:
    return {"pessoal": "pessoal", "mei": "mei"}.get(conta or "", "tudo")


def pagina(titulo: str, corpo: str, *, conta_ui: str, pagina_ativa: str,
           p_ativo: str = "mes") -> bytes:
    def nav_link(rota, rotulo, chave):
        cls = "ativo" if chave == pagina_ativa else ""
        return f'<a class="navlink {cls}" href="{rota}?conta={conta_ui}&p={p_ativo}">{rotulo}</a>'

    contas = "".join(
        f'<a class="seg {"on" if c == conta_ui else ""}" '
        f'href="?conta={c}&p={p_ativo}">{r}</a>'
        for c, r in CONTAS_UI)
    return f'''<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{esc(titulo)} · dinofinance</title>
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='115' fill='%230a0a0a'/><g fill='%23fff'><path d='M200 216C140 218 94 212 58 198C51 202 49 210 53 216C86 250 136 282 196 312Z'/><ellipse cx='196' cy='316' rx='38' ry='52' transform='rotate(10 196 316)'/><path d='M182 344C184 364 182 378 177 390L208 390C206 372 208 356 214 340Z'/><rect x='154' y='376' width='72' height='20' rx='10'/><ellipse cx='244' cy='270' rx='94' ry='66' transform='rotate(-12 244 270)'/><ellipse cx='312' cy='202' rx='56' ry='40' transform='rotate(-40 312 202)'/><ellipse cx='354' cy='270' rx='24' ry='10' transform='rotate(32 354 270)'/><rect x='340' y='110' width='124' height='84' rx='26'/><path d='M348 132C342 104 344 86 352 76C360 82 366 104 368 132Z'/><path d='M400 130C402 98 410 80 422 74C428 82 430 100 426 128Z'/><ellipse cx='286' cy='314' rx='40' ry='54' transform='rotate(-14 286 314)'/><path d='M270 342C274 364 272 378 266 390L298 390C294 372 296 356 302 340Z'/><rect x='258' y='376' width='84' height='20' rx='10'/></g><g fill='%230a0a0a'><circle cx='410' cy='140' r='11'/><circle cx='447' cy='129' r='4.5'/><rect x='400' y='162' width='72' height='15' rx='7.5'/></g></svg>">
</head><body>
<nav class="topo">
  <div class="topo-in">
    <span class="marca">{LOGO_DINO}dinofinance</span>
    <div class="navlinks">
      {nav_link("/", "Visão geral", "visao")}
      {nav_link("/lancar", "Lançamentos", "lancar")}
    </div>
    <div class="segmentos">{contas}</div>
  </div>
</nav>
<main class="conteudo">
{corpo}
</main>
<script src="/assets/app.js"></script>
</body></html>'''.encode("utf-8")


def flash_html(q: dict) -> str:
    ok = q.get("ok", [""])[0]
    er = q.get("erro", [""])[0]
    desf = q.get("desfazer", [""])[0]
    if er:
        return f'<div class="flash erro">{esc(er)}</div>'
    if ok:
        extra = ""
        if desf:
            extra = (f'<form method="post" action="/desfazer" class="inline">'
                     f'<input type="hidden" name="id" value="{esc(desf)}">'
                     f'<input type="hidden" name="volta" value="lancar">'
                     f'<button class="link">desfazer</button></form>')
        return f'<div class="flash ok">{esc(ok)} {extra}</div>'
    return ""


# -------------------------------------------------------------- página home

def pagina_visao(q: dict) -> bytes:
    conta_ui = qs_conta(q.get("conta", ["tudo"])[0])
    conta = None if conta_ui == "tudo" else conta_ui
    p = q.get("p", ["mes"])[0]
    ini, fim, rotulo_p = resolver_periodo(p)
    ant_i, ant_f = periodo_anterior(ini, fim)

    lancs = fin.ler(fin.ARQ_LANC, fin.CAMPOS_LANC)
    h = fin.hoje()

    # --- Hoje
    def soma_hoje(tipo):
        return sum(float(l["valor_pago"] or l["valor"]) for l in lancs
                   if l["status"] == "pago" and l["pago_em"] == h.isoformat()
                   and l["tipo"] == tipo and (conta is None or l["conta"] == conta))

    vence_hoje = [l for l in lancs if l["status"] == "pendente"
                  and l["vencimento"] == h.isoformat()
                  and (conta is None or l["conta"] == conta)]
    n_vh = len(vence_hoje)
    s_vh = sum(float(l["valor"]) for l in vence_hoje)
    dia_semana = DIAS_SEMANA[h.weekday()]

    # --- séries do período
    lb_a, sr_ent = serie_realizada(lancs, ini, fim, conta, "receita")
    _, sr_sai = serie_realizada(lancs, ini, fim, conta, "despesa")
    lb_p, sp_ent = serie_realizada(lancs, ant_i, ant_f, conta, "receita")
    _, sp_sai = serie_realizada(lancs, ant_i, ant_f, conta, "despesa")
    t_ent, t_sai = sum(sr_ent), sum(sr_sai)
    tp_ent, tp_sai = sum(sp_ent), sum(sp_sai)

    pills = "".join(
        f'<a class="pill-p {"on" if chave == p else ""}" '
        f'href="/?conta={conta_ui}&p={chave}">{rot}</a>'
        for chave, rot in PERIODOS)

    hoje_iso = h.isoformat()
    desp = [l for l in lancs if l["tipo"] == "despesa" and l["status"] != "pulado"
            and (conta is None or l["conta"] == conta)]

    # --- Pagamentos: despesas do período por status (bem sucedidos em destaque)
    pagas_v = sum(float(l["valor_pago"] or l["valor"]) for l in desp
                  if l["status"] == "pago" and l["pago_em"]
                  and ini.isoformat() <= l["pago_em"] <= fim.isoformat())
    pend_periodo = [l for l in desp if l["status"] == "pendente"
                    and ini.isoformat() <= l["vencimento"] <= fim.isoformat()]
    vencidas_v = sum(float(l["valor"]) for l in pend_periodo if l["vencimento"] < hoje_iso)
    avencer_v = sum(float(l["valor"]) for l in pend_periodo if l["vencimento"] >= hoje_iso)
    partes_status = [("Pagas", pagas_v, COR_PAGA),
                     ("A vencer", avencer_v, COR_AVENCER),
                     ("Vencidas", vencidas_v, COR_VENCIDA)]
    tem_status = any(v > 0 for _, v, _ in partes_status)
    card_status = ((barra_segmentada(partes_status) + linhas_legenda(partes_status))
                   if tem_status else '<div class="vazio">Sem despesas no período</div>')

    # --- Faturas de cartões (categoria "Cartão de crédito" com venc. no período)
    fat: dict[str, float] = {}
    for l in desp:
        if (l["categoria"] == "Cartão de crédito"
                and ini.isoformat() <= l["vencimento"] <= fim.isoformat()):
            fat[l["descricao"]] = fat.get(l["descricao"], 0.0) + float(l["valor_pago"] or l["valor"])
    faturas = sorted(fat.items(), key=lambda x: -x[1])[:5]
    partes_fat = [(n, v, cor_cat(i)) for i, (n, v) in enumerate(faturas)]
    card_faturas = ((barra_segmentada(partes_fat) + linhas_legenda(partes_fat))
                    if partes_fat else
                    '<div class="vazio">Sem faturas no período.<br>Lance a fatura de cada cartão '
                    'na categoria <b>Cartão de crédito</b>.</div>')

    # --- Contas a pagar (pendências até o fim do mês + pagas recentes)
    fim_mes = date(h.year, h.month, fin.fim_do_mes(h.year, h.month))
    apagar = sorted((l for l in desp if l["status"] == "pendente"
                     and l["vencimento"] <= fim_mes.isoformat()),
                    key=lambda l: (l["vencimento"], int(l["id"])))
    s_apagar = sum(float(l["valor"]) for l in apagar)
    linhas_inv = []
    for l in apagar[:5]:
        venc = date.fromisoformat(l["vencimento"])
        if l["vencimento"] < hoje_iso:
            chip = '<span class="chip vencido">Vencida</span>'
        elif l["vencimento"] == hoje_iso:
            chip = '<span class="chip hoje">Vence hoje</span>'
        else:
            chip = '<span class="chip aberta">Aberta</span>'
        linhas_inv.append(f'''
    <div class="inv-linha">
      <div class="inv-info"><b class="val-neutro">{fmt(float(l["valor"]))}</b>
        <div class="inv-sub">{esc(l["descricao"])} · vence {venc.strftime("%d/%m")}</div></div>
      {chip}
    </div>''')
    if len(linhas_inv) < 5:
        recentes = sorted((l for l in desp if l["status"] == "pago" and l["pago_em"]),
                          key=lambda l: (l["pago_em"], int(l["id"])), reverse=True)
        for l in recentes[:5 - len(linhas_inv)]:
            quando = date.fromisoformat(l["pago_em"]).strftime("%d/%m")
            linhas_inv.append(f'''
    <div class="inv-linha">
      <div class="inv-info"><b class="val-neutro">{fmt(float(l["valor_pago"] or l["valor"]))}</b>
        <div class="inv-sub">{esc(l["descricao"])} · paga em {quando}</div></div>
      <span class="chip paga">Paga</span>
    </div>''')
    card_apagar = "".join(linhas_inv) or '<div class="vazio">Nenhuma conta lançada ainda</div>'
    badge_apagar = (f'<span class="badge">{len(apagar)} · {fmt(s_apagar)}</span>'
                    if apagar else "")

    # --- Gastos por categoria (pagos no período) + donut de distribuição
    cats = gastos_por_categoria(lancs, ini, fim, conta)
    partes_cat = [(c, v, cor_cat(i)) for i, (c, v) in enumerate(cats)]
    card_cats = ((barra_segmentada(partes_cat) + linhas_legenda(partes_cat))
                 if partes_cat else '<div class="vazio">Sem saídas no período</div>')
    rot2_donut = f"em {MESES_LONGO[h.month - 1]}" if p == "mes" else rotulo_p.lower()
    donut = donut_svg(partes_cat, "Gasto total", rot2_donut)
    card_donut = (f'<div class="donut-flex">{donut}<div class="donut-leg">'
                  f'{linhas_legenda(partes_cat, com_pct=True)}</div></div>'
                  if donut else '<div class="vazio">Sem saídas no período</div>')

    saldo = t_ent - t_sai
    cls_saldo = "val-pos" if saldo >= 0 else "val-neg"
    link_lancar = f"/lancar?conta={conta_ui}"

    corpo = f'''
{flash_html(q)}
<h1 class="secao">Hoje <span class="secao-sub">{dia_semana}, {h.day} de {MESES_LONGO[h.month - 1]}</span></h1>
<div class="hoje-linha">
  <div class="hoje-item"><span class="rotulo">Entradas hoje</span><b class="val-pos">{fmt(soma_hoje("receita"))}</b></div>
  <div class="hoje-item"><span class="rotulo">Saídas hoje</span><b class="val-neg">{fmt(soma_hoje("despesa"))}</b></div>
  <div class="hoje-item"><span class="rotulo">Vencem hoje</span><b class="val-neutro">{n_vh} · {fmt(s_vh)}</b>
    <a class="mini-link" href="/lancar?conta={conta_ui}">ver pendências →</a></div>
</div>

<h1 class="secao">Visão geral</h1>
<div class="filtros">
  <span class="filtros-rot">Período</span>
  {pills}
  <span class="filtros-comp">— comparado com o período anterior <span class="chave-prev"></span></span>
</div>

<div class="grade3">
  <div class="cartao">
    <div class="cartao-topo">{ico("dinheiro")}
      <div class="topo-tx"><span class="rotulo">Volume recebido <i class="info" title="dinheiro que entrou (check-in de recebimento) no período">ⓘ</i></span>
        <div class="grande">{fmt(t_ent)} {delta_html(t_ent, tp_ent, True)}</div>
        <div class="anterior">{fmt(tp_ent)} no período anterior</div>
      </div>
    </div>
    {grafico_svg("g-ent", lb_a, sr_ent, sp_ent)}
    {rodape_cartao(link_lancar, "Ver lançamentos")}
  </div>
  <div class="cartao">
    <div class="cartao-topo">{ico("tendencia")}
      <div class="topo-tx"><span class="rotulo">Volume gasto <i class="info" title="dinheiro que saiu (check-in de pagamento) no período">ⓘ</i></span>
        <div class="grande">{fmt(t_sai)} {delta_html(t_sai, tp_sai, False)}</div>
        <div class="anterior">{fmt(tp_sai)} no período anterior</div>
      </div>
    </div>
    {grafico_svg("g-sai", lb_a, sr_sai, sp_sai)}
    {rodape_cartao(link_lancar, "Ver lançamentos")}
  </div>
  <div class="cartao">
    <div class="cartao-topo">{ico("raio")}<span class="rotulo">Pagamentos <i class="info" title="despesas do período por status — pagas (bem sucedidas), a vencer e vencidas">ⓘ</i></span></div>
    {card_status}
    {rodape_cartao(link_lancar, "Ver todas")}
  </div>
</div>

<div class="grade3">
  <div class="cartao">
    <div class="cartao-topo">{ico("cartao")}<span class="rotulo">Faturas de cartões <i class="info" title="lançamentos da categoria Cartão de crédito com vencimento no período, por cartão">ⓘ</i></span></div>
    {card_faturas}
    {rodape_cartao(link_lancar, "Ver todas")}
  </div>
  <div class="cartao">
    <div class="cartao-topo">{ico("recibo")}<span class="rotulo">Contas a pagar <i class="info" title="pendências até o fim do mês; completa com as pagas mais recentes">ⓘ</i></span>
      {badge_apagar}</div>
    {card_apagar}
    {rodape_cartao(link_lancar, "Ver todas")}
  </div>
  <div class="cartao">
    <div class="cartao-topo">{ico("barras")}<span class="rotulo">Gastos por categoria <i class="info" title="saídas pagas no período agrupadas por categoria">ⓘ</i></span></div>
    {card_cats}
    {rodape_cartao(link_lancar, "Ver lançamentos")}
  </div>
</div>

<div class="grade2">
  <div class="cartao">
    <div class="cartao-topo">{ico("pizza")}<span class="rotulo">Distribuição dos gastos <i class="info" title="proporção das saídas pagas no período">ⓘ</i></span></div>
    {card_donut}
  </div>
  <div class="cartao">
    <div class="cartao-topo">{ico("carteira")}<span class="rotulo">Resumo do período <span class="secao-sub">{esc(rotulo_p.lower())}</span></span></div>
    <div class="resumo-linha"><span>Entradas</span><b class="val-pos">{fmt(t_ent)}</b></div>
    <div class="resumo-linha"><span>Saídas</span><b class="val-neg">{fmt(t_sai)}</b></div>
    <div class="resumo-linha total"><span>Saldo</span><b class="{cls_saldo}">{fmt(saldo)}</b></div>
    <div class="resumo-nota">Somente valores com check-in (pagos/recebidos).
      O planejado do mês está em <a href="/lancar?conta={conta_ui}">Lançamentos</a>.</div>
  </div>
</div>

<div class="aviso-plano">
  <span class="aviso-ico">🏦</span>
  <div><b>Planejado para depois</b> — contas de usuário e importação/integração dos
  extratos bancários (CSV) para conciliar os lançamentos automaticamente.
  Por enquanto, o preenchimento é manual em <a href="/lancar?conta={conta_ui}">Lançamentos</a>.</div>
</div>'''
    return pagina("Visão geral", corpo, conta_ui=conta_ui, pagina_ativa="visao", p_ativo=p)


# --------------------------------------------------------- página lançamentos

def pagina_lancar(q: dict) -> bytes:
    conta_ui = qs_conta(q.get("conta", ["tudo"])[0])
    conta = None if conta_ui == "tudo" else conta_ui
    lancs = fin.ler(fin.ARQ_LANC, fin.CAMPOS_LANC)
    h = fin.hoje()
    fim_mes = date(h.year, h.month, fin.fim_do_mes(h.year, h.month))

    pend = sorted((l for l in lancs if l["status"] == "pendente"
                   and l["vencimento"] <= fim_mes.isoformat()
                   and (conta is None or l["conta"] == conta)),
                  key=lambda l: (l["vencimento"], int(l["id"])))
    pagos = sorted((l for l in lancs if l["status"] == "pago"
                    and (conta is None or l["conta"] == conta)),
                   key=lambda l: (l["pago_em"], int(l["id"])), reverse=True)[:6]

    cats_desp = list(dict.fromkeys(fin.CATEGORIAS_DESPESA + fin.categorias_por_tipo("despesa")))
    cats_rec = list(dict.fromkeys(fin.CATEGORIAS_RECEITA + fin.categorias_por_tipo("receita")))

    def opcoes_cat(cats: list[str]) -> str:
        return "".join(
            f'<option value="{esc(c)}"{" selected" if c == "Outros" else ""}>{esc(c)}</option>'
            for c in cats) + '<option value="__nova__">＋ Nova categoria…</option>'

    dados_cats = esc(json.dumps({"despesa": cats_desp, "receita": cats_rec},
                                ensure_ascii=False), quote=True)

    linhas = []
    for l in pend:
        venc = date.fromisoformat(l["vencimento"])
        dias = (venc - h).days
        receita = l["tipo"] == "receita"
        if dias < 0:
            chip = f'<span class="chip vencido">vencido há {-dias}d</span>'
            tom = "crit"
        elif dias == 0:
            chip = '<span class="chip hoje">vence hoje</span>'
            tom = "neu"
        else:
            chip = f'<span class="chip neutro">{venc.strftime("%d/%m")}</span>'
            tom = "neu"
        tags = ""
        if l["parcela_total"]:
            tags += f'<span class="etq">{l["parcela_num"]}/{l["parcela_total"]}</span>'
        if l["origem"] == "recorrente":
            tags += '<span class="etq">fixa</span>'
        if l["conta"] == "mei":
            tags += '<span class="etq pj">PJ</span>'
        val = (f'<b class="val-pos">+{fmt(float(l["valor"]))}</b>' if receita
               else f'<b class="val-neg">{fmt(float(l["valor"]))}</b>')
        botao = "Receber" if receita else "Pagar"
        linhas.append(f'''
<div class="linha">
  <div class="dia {tom}"><span class="d">{venc.day:02d}</span><span class="m">{fin.MESES_ABR[venc.month - 1]}</span></div>
  <div class="linha-info">
    <div class="linha-t">{esc(l["descricao"])}{tags}</div>
    <div class="linha-s">{esc(l["categoria"])} · <span class="mono">#{l["id"]}</span></div>
  </div>
  <div class="linha-dir">
    {val}
    {chip}
  </div>
  <div class="linha-acoes">
    <form method="post" action="/pagar" class="inline">
      <input type="hidden" name="id" value="{l["id"]}"><input type="hidden" name="conta" value="{conta_ui}">
      <button class="btn mini">{botao}</button>
    </form>
    <form method="post" action="/excluir" class="inline" onsubmit="return confirm('Excluir {esc(l["descricao"])}?')">
      <input type="hidden" name="id" value="{l["id"]}"><input type="hidden" name="conta" value="{conta_ui}">
      <button class="btn-x" title="excluir">×</button>
    </form>
  </div>
</div>''')
    lista_pend = "".join(linhas) or '<div class="vazio">Nada pendente até o fim do mês ✓</div>'

    linhas_pagos = []
    for l in pagos:
        receita = l["tipo"] == "receita"
        val = (f'<b class="val-pos">+{fmt(float(l["valor_pago"] or l["valor"]))}</b>' if receita
               else f'<b class="val-mut">{fmt(float(l["valor_pago"] or l["valor"]))}</b>')
        quando = date.fromisoformat(l["pago_em"]).strftime("%d/%m")
        linhas_pagos.append(f'''
<div class="linha compacta">
  <span class="ok-ico">✓</span>
  <div class="linha-info"><div class="linha-t">{esc(l["descricao"])}</div>
    <div class="linha-s">{"recebido" if receita else "pago"} em {quando}</div></div>
  <div class="linha-dir">{val}</div>
  <div class="linha-acoes">
    <form method="post" action="/desfazer" class="inline">
      <input type="hidden" name="id" value="{l["id"]}"><input type="hidden" name="conta" value="{conta_ui}">
      <input type="hidden" name="volta" value="lancar">
      <button class="link">desfazer</button>
    </form>
  </div>
</div>''')
    lista_pagos = "".join(linhas_pagos) or '<div class="vazio">Nenhum check-in ainda</div>'

    conta_form = "mei" if conta_ui == "mei" else "pessoal"
    corpo = f'''
{flash_html(q)}
<h1 class="secao">Lançamentos</h1>
<div class="grade-lancar">
  <div class="cartao form-card">
    <div class="cartao-topo">{ico("mais")}<span class="rotulo">Novo lançamento</span></div>
    <form method="post" action="/add" class="form">
      <div class="campo-linha">
        <div class="campo"><span>Tipo</span>
          <div class="segmentado">
            <label><input type="radio" name="tipo" value="despesa" checked><span>Despesa</span></label>
            <label><input type="radio" name="tipo" value="receita"><span>Receita</span></label>
          </div></div>
        <div class="campo"><span>Conta</span>
          <div class="segmentado">
            <label><input type="radio" name="conta" value="pessoal" {"checked" if conta_form == "pessoal" else ""}><span>Pessoal</span></label>
            <label><input type="radio" name="conta" value="mei" {"checked" if conta_form == "mei" else ""}><span>PJ</span></label>
          </div></div>
      </div>
      <label class="campo"><span>Descrição</span>
        <input name="descricao" required placeholder="ex.: Aluguel, Mercado, Fatura Nubank…"></label>
      <div class="campo-linha">
        <label class="campo"><span>Valor (R$)</span>
          <input name="valor" id="valor" required inputmode="decimal" placeholder="0,00"></label>
        <label class="campo"><span>Categoria</span>
          <select name="categoria" id="categoria" data-cats="{dados_cats}">{opcoes_cat(cats_desp)}</select></label>
      </div>
      <label class="campo" id="campo-nova-cat" hidden><span>Nome da nova categoria</span>
        <input name="categoria_nova" placeholder="ex.: Barbearia"></label>
      <div class="campo-linha">
        <label class="campo"><span>Repetição</span>
          <select name="repeticao" id="repeticao">
            <option value="unico">Único</option>
            <option value="recorrente">Recorrente (todo mês)</option>
            <option value="parcelado">Parcelado</option>
          </select></label>
        <label class="campo" id="campo-venc"><span id="rot-venc">Vencimento</span>
          <input type="date" name="venc" id="venc" value="{h.isoformat()}"></label>
        <label class="campo" id="campo-venc-dia" hidden><span>Todo dia</span>
          <input type="number" name="venc_dia" min="1" max="31" value="{h.day}"></label>
      </div>
      <div class="campo-linha" id="linha-parcelas" hidden>
        <label class="campo"><span>Nº de parcelas</span>
          <input name="parcelas" id="parcelas" type="number" min="2" max="120" value="2"></label>
        <label class="campo caixa"><input type="checkbox" name="valor_parcela" id="valor-parcela" value="1">
          <span>o valor é de <b>cada parcela</b></span></label>
      </div>
      <p class="form-preview" id="preview-parcelas" hidden></p>
      <button class="btn primario">Adicionar</button>
    </form>
  </div>

  <div class="coluna-listas">
    <div class="cartao">
      <div class="cartao-topo">{ico("recibo")}<span class="rotulo">Pendências até o fim do mês</span>
        <span class="badge">{len(pend)}</span></div>
      {lista_pend}
    </div>
    <div class="cartao">
      <div class="cartao-topo">{ico("check")}<span class="rotulo">Últimos check-ins</span></div>
      {lista_pagos}
    </div>
  </div>
</div>'''
    return pagina("Lançamentos", corpo, conta_ui=conta_ui, pagina_ativa="lancar")


# ----------------------------------------------------------------- handlers

def _redir_args(form: dict, padrao: str = "lancar") -> tuple[str, str]:
    conta = qs_conta(form.get("conta", ["tudo"])[0])
    volta = form.get("volta", [padrao])[0]
    rota = "/" if volta == "visao" else "/lancar"
    return rota, conta


# ------------------------------------------- API JSON (app estático em /app/)
# Converte entre o schema dos CSVs (tipo "receita", snake_case) e o do app
# estático (tipo "renda", camelCase). Usada pela sincronização do app.

def _num(s):
    return float(s) if s not in ("", None) else None


def _int(s):
    return int(s) if s not in ("", None) else None


def _lanc_para_app(l: dict) -> dict:
    return {
        "id": int(l["id"]),
        "tipo": "renda" if l["tipo"] == "receita" else "despesa",
        "conta": l.get("conta") or "pessoal",
        "descricao": l["descricao"], "categoria": l["categoria"] or "Outros",
        "valor": float(l["valor"]),
        "venc": l["vencimento"], "comp": l["competencia"],
        "status": l["status"] or "pendente",
        "pagoEm": l["pago_em"], "valorPago": _num(l["valor_pago"]),
        "origem": l["origem"] or "avulso",
        "recId": _int(l["recorrente_id"]),
        "pNum": _int(l["parcela_num"]), "pTot": _int(l["parcela_total"]),
    }


def _rec_para_app(r: dict) -> dict:
    return {
        "id": int(r["id"]),
        "tipo": "renda" if r["tipo"] == "receita" else "despesa",
        "conta": r.get("conta") or "pessoal",
        "descricao": r["descricao"], "categoria": r["categoria"] or "Outros",
        "valor": float(r["valor"]), "diaVenc": int(r["dia_venc"]),
        "inicio": r["inicio"], "fim": r["fim"], "ativo": r["ativo"] == "1",
    }


def _lanc_para_csv(l: dict) -> dict:
    venc = str(l.get("venc") or "")[:10]
    if len(venc) != 10:
        raise ValueError(f"lançamento sem vencimento válido: {l.get('descricao')!r}")
    valor = float(l.get("valor") or 0)
    if valor <= 0:
        raise ValueError(f"valor inválido em {l.get('descricao')!r}")
    status = l.get("status") or "pendente"
    if status not in ("pendente", "pago", "pulado"):
        status = "pendente"
    vp = l.get("valorPago")
    opc = lambda x: "" if x in (None, "") else str(int(x))
    return {
        "id": str(int(l["id"])),
        "tipo": "receita" if l.get("tipo") == "renda" else "despesa",
        "conta": fin.validar_conta(l.get("conta") or "pessoal"),
        "descricao": str(l.get("descricao") or "").strip() or "Lançamento",
        "categoria": str(l.get("categoria") or "Outros").strip() or "Outros",
        "valor": f"{valor:.2f}",
        "vencimento": venc, "competencia": venc[:7],
        "status": status, "pago_em": str(l.get("pagoEm") or "")[:10],
        "valor_pago": "" if vp in (None, "") else f"{float(vp):.2f}",
        "origem": l.get("origem") or "avulso",
        "recorrente_id": opc(l.get("recId")),
        "parcela_num": opc(l.get("pNum")), "parcela_total": opc(l.get("pTot")),
        "criado_em": fin.hoje().isoformat(),
    }


def _rec_para_csv(r: dict) -> dict:
    dia = int(r.get("diaVenc") or 0)
    if not 1 <= dia <= 31:
        raise ValueError(f"dia de vencimento inválido na recorrente {r.get('descricao')!r}")
    valor = float(r.get("valor") or 0)
    if valor <= 0:
        raise ValueError(f"valor inválido na recorrente {r.get('descricao')!r}")
    return {
        "id": str(int(r["id"])),
        "tipo": "receita" if r.get("tipo") == "renda" else "despesa",
        "conta": fin.validar_conta(r.get("conta") or "pessoal"),
        "descricao": str(r.get("descricao") or "").strip() or "Recorrente",
        "categoria": str(r.get("categoria") or "Outros").strip() or "Outros",
        "valor": f"{valor:.2f}", "dia_venc": str(dia),
        "inicio": str(r.get("inicio") or fin.hoje().strftime("%Y-%m"))[:7],
        "fim": str(r.get("fim") or "")[:7],
        "ativo": "1" if r.get("ativo") else "0",
        "criado_em": fin.hoje().isoformat(),
    }


def _backup_csvs() -> str:
    pasta = fin.DATA / ("backup-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    criado = False
    for arq in (fin.ARQ_LANC, fin.ARQ_REC):
        if arq.exists():
            pasta.mkdir(parents=True, exist_ok=True)
            shutil.copy2(arq, pasta / arq.name)
            criado = True
    return pasta.name if criado else ""


class Handler(BaseHTTPRequestHandler):
    server_version = "FinancasApp/1.0"

    def log_message(self, formato, *args):
        pass  # silencioso

    # ---------- infra
    def _html(self, corpo: bytes, codigo: int = 200):
        self.send_response(codigo)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _redirect(self, url: str):
        self.send_response(303)
        self.send_header("Location", url)
        self.end_headers()

    def _json(self, obj, codigo: int = 200):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _arquivo(self, caminho):
        alvo = (BASE / caminho.lstrip("/")).resolve()
        if not str(alvo).startswith(str(BASE.resolve())) or not alvo.is_file():
            self._html("<h1>404</h1>".encode(), 404)
            return
        tipo = mimetypes.guess_type(str(alvo))[0] or "application/octet-stream"
        dados = alvo.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    # ---------- GET
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        rota = u.path
        try:
            if rota == "/":
                self._html(pagina_visao(q))
            elif rota == "/lancar":
                self._html(pagina_lancar(q))
            elif rota == "/app":
                self._redirect("/app/")
            elif rota == "/app/":
                self._arquivo("app/index.html")
            elif rota.startswith("/assets/") or rota.startswith("/app/"):
                self._arquivo(rota)
            elif rota == "/api/ping":
                self._json({"ok": True, "app": "financas"})
            elif rota == "/api/dados":
                lancs = fin.ler(fin.ARQ_LANC, fin.CAMPOS_LANC)
                recs = fin.ler(fin.ARQ_REC, fin.CAMPOS_REC)
                self._json({"lancs": [_lanc_para_app(l) for l in lancs],
                            "recs": [_rec_para_app(r) for r in recs]})
            elif rota == "/favicon.ico":
                self._html(b"", 404)
            else:
                self._html("<h1>404</h1>".encode(), 404)
        except Exception as e:  # nunca derruba o servidor
            self._html(f"<pre>erro interno: {esc(str(e))}</pre>".encode("utf-8"), 500)

    # ---------- POST
    def do_POST(self):
        tam = int(self.headers.get("Content-Length", 0))
        bruto = self.rfile.read(tam)
        rota = urlparse(self.path).path
        if rota == "/api/dados":
            self._post_api_dados(bruto)
            return
        form = parse_qs(bruto.decode("utf-8"))
        try:
            if rota == "/add":
                self._post_add(form)
            elif rota == "/pagar":
                self._post_pagar(form)
            elif rota == "/desfazer":
                self._post_desfazer(form)
            elif rota == "/excluir":
                self._post_excluir(form)
            else:
                self._html("<h1>404</h1>".encode(), 404)
        except ValueError as e:
            volta, conta = _redir_args(form)
            self._redirect(f"{volta}?conta={conta}&erro=" + quote(str(e)))
        except Exception as e:
            self._html(f"<pre>erro interno: {esc(str(e))}</pre>".encode("utf-8"), 500)

    def _post_api_dados(self, bruto: bytes):
        """Substitui os CSVs pelos dados do app estático (backup antes)."""
        try:
            dados = json.loads(bruto.decode("utf-8"))
            lancs = [_lanc_para_csv(l) for l in dados.get("lancs", [])]
            recs = [_rec_para_csv(r) for r in dados.get("recs", [])]
            backup = _backup_csvs()
            fin.salvar(fin.ARQ_LANC, fin.CAMPOS_LANC, fin.ordenar_lancs(lancs))
            fin.salvar(fin.ARQ_REC, fin.CAMPOS_REC, recs)
            self._json({"ok": True, "backup": backup,
                        "lancs": len(lancs), "recs": len(recs)})
        except Exception as e:
            self._json({"ok": False, "erro": str(e)}, 400)

    def _post_add(self, form):
        pega = lambda k, pad="": form.get(k, [pad])[0].strip()
        descricao = pega("descricao")
        valor = fin.parse_valor(pega("valor"))
        tipo = "receita" if pega("tipo") == "receita" else "despesa"
        conta = fin.validar_conta(pega("conta", "pessoal"))
        categoria = pega("categoria") or "Outros"
        if categoria == "__nova__":
            categoria = pega("categoria_nova") or "Outros"
        venc = pega("venc") or None
        rep = pega("repeticao", "unico")

        if rep == "recorrente":
            dia = pega("venc_dia") or (venc if venc and venc.isdigit() else "")
            if not dia.isdigit():
                raise ValueError("recorrente precisa do dia do vencimento (1-31)")
            rec, _ = fin.criar_recorrente(descricao, valor, int(dia), tipo=tipo,
                                          categoria=categoria, conta=conta)
            msg = f"Recorrente criada: {descricao} todo dia {rec['dia_venc']}"
        elif rep == "parcelado":
            n = int(pega("parcelas", "0") or 0)
            novos = fin.criar_parcelado(descricao, valor, n, fin.resolver_venc(venc),
                                        tipo=tipo, categoria=categoria, conta=conta,
                                        valor_e_parcela=bool(pega("valor_parcela")))
            msg = f"{descricao}: {n}x de {fmt(float(novos[0]['valor']))} criado"
        else:
            novo = fin.criar_avulso(descricao, valor, fin.resolver_venc(venc),
                                    tipo=tipo, categoria=categoria, conta=conta)
            msg = f"Lançamento criado: {descricao} ({fmt(valor)})"
        self._redirect(f"/lancar?conta={qs_conta(conta)}&ok=" + quote(msg))

    def _post_pagar(self, form):
        i = form.get("id", [""])[0]
        msgs = fin.dar_baixa([i])
        volta, conta = _redir_args(form)
        self._redirect(f"{volta}?conta={conta}&desfazer={quote(i)}&ok=" + quote(msgs[0]))

    def _post_desfazer(self, form):
        i = form.get("id", [""])[0]
        msgs = fin.reverter([i])
        volta, conta = _redir_args(form)
        self._redirect(f"{volta}?conta={conta}&ok=" + quote(msgs[0]))

    def _post_excluir(self, form):
        i = form.get("id", [""])[0]
        lancs = fin.ler(fin.ARQ_LANC, fin.CAMPOS_LANC)
        alvo = next((l for l in lancs if l["id"] == str(i)), None)
        if not alvo:
            raise ValueError(f"lançamento #{i} não encontrado")
        if alvo["origem"] == "recorrente":
            alvo["status"] = "pulado"
            fin.salvar(fin.ARQ_LANC, fin.CAMPOS_LANC, lancs)
            msg = f"{alvo['descricao']}: ocorrência deste mês ignorada (recorrente continua ativa)"
        else:
            lancs = [l for l in lancs if l["id"] != str(i)]
            fin.salvar(fin.ARQ_LANC, fin.CAMPOS_LANC, lancs)
            msg = f"{fin.rotulo(alvo)} excluído"
        volta, conta = _redir_args(form)
        self._redirect(f"{volta}?conta={conta}&ok=" + quote(msg))


def rodar(porta: int = 8787, abrir: bool = True) -> None:
    fin.gerar()  # materializa o mês ao abrir o app
    servidor = ThreadingHTTPServer(("127.0.0.1", porta), Handler)
    url = f"http://127.0.0.1:{porta}"
    print(f"dinofinance no ar: {url}  (Ctrl+C para parar)")
    if abrir:
        webbrowser.open(url)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado.")


if __name__ == "__main__":
    rodar()
