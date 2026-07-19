// Finanças — interações da página (sem dependências)

document.addEventListener("DOMContentLoaded", () => {
  // ---- formulário de lançamento ----
  const rep = document.getElementById("repeticao");
  const lp = document.getElementById("linha-parcelas");
  const campoVenc = document.getElementById("campo-venc");
  const campoVencDia = document.getElementById("campo-venc-dia");
  const cat = document.getElementById("categoria");
  const campoNovaCat = document.getElementById("campo-nova-cat");
  const valor = document.getElementById("valor");
  const parcelas = document.getElementById("parcelas");
  const valorParcela = document.getElementById("valor-parcela");
  const preview = document.getElementById("preview-parcelas");

  const brl = (v) => "R$ " + v.toLocaleString("pt-BR",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function parseValor(s) {
    let t = String(s || "").replace("R$", "").trim();
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const v = parseFloat(t);
    return isFinite(v) && v > 0 ? v : null;
  }

  function atualizaPreview() {
    if (!preview) return;
    const parcelado = rep && rep.value === "parcelado";
    const v = parseValor(valor && valor.value);
    const n = parcelas ? parseInt(parcelas.value, 10) : 0;
    if (!parcelado || !v || !n || n < 2) { preview.hidden = true; return; }
    const cada = valorParcela && valorParcela.checked;
    const vp = cada ? v : v / n;
    const total = cada ? v * n : v;
    preview.hidden = false;
    preview.textContent = `${n}× de ${brl(vp)} — total ${brl(total)}`;
  }

  const rotVenc = document.getElementById("rot-venc");

  function atualizaForm() {
    if (!rep) return;
    const r = rep.value;
    if (lp) lp.hidden = r !== "parcelado";
    if (campoVenc) campoVenc.hidden = r === "recorrente";
    if (campoVencDia) campoVencDia.hidden = r !== "recorrente";
    if (rotVenc) rotVenc.textContent = r === "parcelado" ? "1ª parcela" : "Vencimento";
    atualizaPreview();
  }

  if (rep) {
    rep.addEventListener("change", atualizaForm);
    atualizaForm();
  }
  for (const el of [valor, parcelas, valorParcela]) {
    if (el) {
      el.addEventListener("input", atualizaPreview);
      el.addEventListener("change", atualizaPreview);
    }
  }

  // categoria: campo "nova" + lista filtrada pelo tipo (despesa × receita)
  const inputNovaCat = campoNovaCat && campoNovaCat.querySelector("input");
  function atualizaNovaCat(focar) {
    if (!cat || !campoNovaCat) return;
    const nova = cat.value === "__nova__";
    campoNovaCat.hidden = !nova;
    if (inputNovaCat) {
      inputNovaCat.required = nova;
      if (nova && focar) inputNovaCat.focus();
    }
  }
  if (cat) {
    cat.addEventListener("change", () => atualizaNovaCat(true));
    atualizaNovaCat(false);
  }

  const radiosTipo = [...document.querySelectorAll('input[name="tipo"]')];
  let listasCat = null;
  try { listasCat = cat && JSON.parse(cat.dataset.cats); } catch { /* sem filtro */ }
  function trocaCategorias() {
    if (!cat || !listasCat) return;
    const tipo = (radiosTipo.find((r) => r.checked) || {}).value || "despesa";
    const lista = listasCat[tipo] || [];
    const atual = cat.value;
    cat.replaceChildren();
    for (const c of lista) cat.add(new Option(c, c));
    cat.add(new Option("＋ Nova categoria…", "__nova__"));
    cat.value = lista.includes(atual) ? atual : "Outros";
    atualizaNovaCat(false);
  }
  for (const r of radiosTipo) r.addEventListener("change", trocaCategorias);

  // gráficos: crosshair + tooltip (atual × período anterior)
  document.querySelectorAll(".chart").forEach((ch) => {
    const svg = ch.querySelector("svg");
    const hit = ch.querySelector(".hit");
    if (!svg || !hit) return;
    let dados;
    try { dados = JSON.parse(hit.dataset.dados); } catch { return; }
    const n = dados.labels.length;
    if (n < 2) return;

    const pl = +hit.dataset.pl, pr = +hit.dataset.pr;
    const pt = +hit.dataset.pt, pb = +hit.dataset.pb;
    const ymax = +hit.dataset.ymax;
    const W = 640, H = 190;
    const gid = ch.dataset.gid;
    const cx = document.getElementById(gid + "-cx");
    const da = document.getElementById(gid + "-da");
    const dp = document.getElementById(gid + "-dp");
    const tt = document.getElementById(gid + "-tt");

    const X = (i) => pl + (i * (W - pl - pr)) / (n - 1);
    const Y = (v) => pt + (1 - v / ymax) * (H - pt - pb);
    const brl = (v) => "R$ " + v.toLocaleString("pt-BR",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function linhaTT(cls, nome, valor) {
      const l = document.createElement("div");
      l.className = "tt-linha";
      const k = document.createElement("span");
      k.className = "tt-chave " + cls;
      const s = document.createElement("span");
      s.className = "tt-nome";
      s.textContent = nome;
      const b = document.createElement("b");
      b.className = "tt-val";
      b.textContent = brl(valor);
      l.append(k, s, b);
      return l;
    }

    function mover(ev) {
      const r = svg.getBoundingClientRect();
      const fx = ((ev.clientX - r.left) / r.width) * W;
      let i = Math.round((fx - pl) / ((W - pl - pr) / (n - 1)));
      i = Math.max(0, Math.min(n - 1, i));
      const px = X(i);

      cx.setAttribute("x1", px);
      cx.setAttribute("x2", px);
      cx.removeAttribute("visibility");
      da.setAttribute("cx", px);
      da.setAttribute("cy", Y(dados.atual[i]));
      da.removeAttribute("visibility");
      dp.setAttribute("cx", px);
      dp.setAttribute("cy", Y(dados.anterior[i]));
      dp.removeAttribute("visibility");

      tt.hidden = false;
      tt.replaceChildren();
      const cab = document.createElement("div");
      cab.className = "tt-data";
      cab.textContent = dados.labels[i];
      tt.append(cab,
        linhaTT("", "Atual", dados.atual[i]),
        linhaTT("prev", "Anterior", dados.anterior[i]));

      const ttw = tt.offsetWidth || 170;
      let lx = (px / W) * r.width + 14;
      if (lx + ttw > r.width - 6) lx = (px / W) * r.width - ttw - 14;
      tt.style.left = Math.max(0, lx) + "px";
    }

    function sair() {
      tt.hidden = true;
      for (const el of [cx, da, dp]) el.setAttribute("visibility", "hidden");
    }

    hit.addEventListener("mousemove", mover);
    hit.addEventListener("mouseleave", sair);
  });
});
