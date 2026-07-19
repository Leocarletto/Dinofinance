# 🗺️ Roadmap do dinofinance

> Documento de retomada: se você está voltando a mexer no projeto depois de um
> tempo, **comece por aqui**. Última atualização: 19/07/2026.

## ✅ Estado atual (o que já está pronto e no ar)

- **Site no ar**: [dinofinance.app](https://dinofinance.app) (Vercel, projeto
  importado do repo [Leocarletto/Dinofinance](https://github.com/Leocarletto/Dinofinance)).
  **Deploy é automático**: qualquer `git push` na `main` republica em ~20s.
- Landing pública (hero + vale animado + seções), entrada "Quem vai entrar?",
  dashboard com sidebar (Início · Visão geral · Despesas · Rendimentos ·
  Investimentos), importação CSV/OFX/PDF com aprendizado, login Google
  (Client ID fixo em `app/config.js`), 4 temas de dinossauro com habitat,
  favicon dinâmico e easter egg da dança do Carnotauro.
- Dados 100% no navegador (localStorage, schema v3) — sem backend.
- A raiz do domínio é servida via **rewrite** no [vercel.json](vercel.json)
  (`/*` → `/app/*`), porque o projeto foi importado sem Root Directory;
  se um dia você configurar *Root Directory = `app`* no painel, o arquivo
  passa a ser ignorado — funciona dos dois jeitos.

### Pendências rápidas (5 min, no painel)

- [ ] Adicionar `www.dinofinance.app` em *Domains* com **Redirect to
  dinofinance.app**;
- [ ] **Regenerar o Client Secret** do Google (console.cloud.google.com →
  Credentials → reset no campo *Client secret*) — o antigo circulou em chat.
  O site **não usa** o secret (só o Client ID), então isso não quebra nada;
- [ ] (opcional) *Settings → Build and Deployment → Root Directory = `app`*.

---

## 🎯 As 4 frentes do roadmap

### 1. ☁️ Backend — armazenamento em nuvem

**Objetivo:** o mesmo perfil no celular e no PC, com backup — hoje cada
navegador tem seus próprios dados (localStorage por origem).

- **Caminho planejado:** Supabase (ou similar). A camada de dados **já foi
  desenhada para essa troca**: todo acesso passa pelo contrato `store` em
  [app/js/data.js](app/js/data.js) (`perfis()`, `carregarDados()`,
  `salvarDados()`, `carregarEstado()`…) — é escrever um `criarStoreAPI()` e
  trocar a implementação num ponto único, podendo virar assíncrona sem mudar
  os callers.
- **Auth:** o login Google já existente vira a identidade natural
  (Supabase Auth aceita Google).
- **Modelagem mínima:** tabela `perfis` + tabela `dados` (o db JSON inteiro
  por perfil, como já é serializado hoje) com **RLS por usuário**; sync
  otimista com "última escrita vence" já resolve a v1.
- **Regra de ouro:** chave *anon* pode ir no código (é pública); chave
  *service/admin* **jamais** — nem em variável do front.
- Manter o modo local (localStorage) como padrão: nuvem é **opt-in** do
  perfil, coerente com o discurso de privacidade do site.

### 2. 🦕 Adicionar mais dinossauros

**Objetivo de longo prazo: TODOS os gêneros de dinossauro já descritos pela
paleontologia (mais de mil!)** como temas de perfil — cada um com arte,
período, habitat e paleta. Os 4 atuais (T. rex, Carnotauro, Oxalaia,
Braquiossauro) são as primeiras fichas do catálogo.

#### 🦴 Receita: como adicionar um dinossauro novo (uns 30–60 min cada)

Tudo se deriva de dois registros centrais — o resto (picker, menu, galerias,
favicon, marca) é automático. Exemplo com um "espinossauro":

1. **Arte** — [app/index.html](app/index.html), dentro do `<defs>`: copie um
   bloco `<g id="dino-...">` existente e desenhe com formas simples
   (ellipse/path/rect num viewBox 512×512, estilo blocão). Estrutura
   obrigatória (os fills via `var(...)` são o que fazem tema/silhueta/favicon
   funcionarem):
   ```html
   <g id="dino-espino">
     <rect width="512" height="512" rx="115" style="fill:var(--accent,#0a0a0a)"/>
     <g id="corpo-espino" style="fill:var(--dino-corpo,var(--accent-inv,#ffffff))">…formas…</g>
     <g id="olho-espino" style="fill:var(--dino-olho,var(--accent,#0a0a0a))">…olho/narina/boca…</g>
   </g>
   ```
2. **Registro** — [app/app.js](app/app.js), duas entradas:
   - `SKINS`: `espinossauro: { rotulo: "Espinossauro", nomeCompleto: "Spinosaurus aegyptiacus", dino: "espino", tile: "#0f766e" }`
   - `DINO_INFO`: `{ periodo, onde, porte, desc }` (aparece na galeria do
     Início, na landing e nos tooltips).
3. **Paleta** — [app/app.css](app/app.css), seção *"Skins temáticas"*: crie os
   **3 blocos** copiando um existente: `:root[data-skin="espinossauro"]`
   (claro), o par dentro de `@media (prefers-color-scheme: dark)` com
   `:not([data-tema="claro"])`, e o `[data-tema="escuro"]`. **Regra de ouro:
   toda variável definida no bloco claro PRECISA existir nos blocos escuros**
   (accent, accent-inv, anel, area, bg, card, hairline, linha-fina, tile,
   track, campo-borda).
4. **Habitat (opcional)** — um SVG `.amb-espino` no `.ambiente` do index
   (copie um cenário existente) + no CSS:
   `html[data-skin="espinossauro"] .amb-espino { display: block; }`.
5. `git push` → está no ar.

#### Quando o catálogo crescer (dezenas de dinos)

- Migrar `SKINS`/`DINO_INFO` para um `app/js/dinos.js` (ou JSON) próprio;
- Gerar os blocos CSS das skins a partir de 2 cores por dino (claro/escuro)
  via CSS vars, em vez de blocos escritos à mão;
- Na galeria e no picker, paginar/agrupar por período (Triássico · Jurássico ·
  Cretáceo) e adicionar busca.

### 3. 🔧 Melhorias

- **Conciliação extrato × lançamentos previstos** (a melhoria mais valiosa):
  hoje a importação deduplica por data+valor, mas não "casa" uma linha do
  extrato com uma pendência existente (ex.: o débito do aluguel deveria dar
  check-in no lançamento Aluguel em vez de criar outro). Onde mexer:
  `marcarDuplicadas` em [app/js/extrato.js](app/js/extrato.js) e a prévia de
  importação no [app/app.js](app/app.js).
- **PWA**: manifest + service worker para instalar no celular e abrir offline
  (combina com dados locais).
- Metas de gasto por categoria (orçamento mensal com barra de progresso);
- Busca/filtros nas listas de lançamentos; mais períodos de comparação;
- Acessibilidade: revisar contraste dos temas e navegação por teclado no
  picker/menus.

### 4. 🏦 Conectar Open Finance

**O sonho:** conectar a conta e o extrato entrar sozinho, sem importar nada.

- **Por que está parado (decisão de 2026):** participação direta no Open
  Finance exige instituição regulada; agregadores comerciais (Pluggy, Belvo,
  Klavi…) custavam na casa de **R$ 2,5 mil+/mês** quando pesquisado — inviável
  para um projeto grátis. Por isso a aposta foi na **importação CSV/OFX/PDF
  tão boa que dispense API** (e ela já cobre Nubank, Inter, Bradesco/Caixa,
  BB, OFX e faturas em PDF).
- **Gatilho para retomar:** surgir plano gratuito/dev barato de algum
  agregador (ficar de olho em sandboxes e planos para projetos pequenos).
- **Como encaixaria:** um módulo novo (ex.: `app/js/openfinance.js`) que puxa
  as transações e alimenta **o mesmo pipeline da importação** (prévia,
  aprendizado de categorias, coluna Repete, dedupe/conciliação) — o banco
  conectado vira só mais uma "origem de extrato". Atenção: agregadores exigem
  chave secreta → depende da frente 1 (backend) para o token não ficar no
  front.

---

## 🔧 Como retomar o desenvolvimento

```bash
python finance.py app        # roda local em http://127.0.0.1:8787/app/
# edite app/ → confira no navegador → git add/commit/push → Vercel publica
```

Arquivos-chave: `app/index.html` (estrutura, defs dos dinos, landing),
`app/app.js` (toda a lógica + SKINS/DINO_INFO), `app/app.css` (design system
+ skins + habitats), `app/js/data.js` (dados/contrato store),
`app/js/extrato.js` (parsers de importação).
