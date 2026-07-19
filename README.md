# dinofinance — app local + site estático (dinofinance.app)

## Novidade: app estático para terceiros (`app/`)

`app/` é um site **100% estático** (HTML+CSS+JS puros, sem backend) pensado
para ser hospedado (ex.: GitHub Pages) e usado por outras pessoas: cada uma
cria um perfil e os dados ficam **no navegador dela** (localStorage).

- **Site público estilo Stripe** (o que um visitante vê antes de entrar):
  - **Hero** com o slogan **“Organize suas finanças &… Dinossauros”** (a
    palavra final digita e troca sozinha) sobre um **vale jurássico animado**
    — cânion em camadas, sol na cor do tema, nuvens, um pterossauro planando
    e os quatro dinossauros passeando (tudo SVG + CSS; respeita
    `prefers-reduced-motion`);
  - rolando a página: faixa de **destaques** (R$ 0 · 100% no navegador · 3
    formatos de extrato · 4 dinossauros), seção de **recursos** (6 cartões:
    visão comparativa, check-in, investimentos, importação, recorrentes,
    privacidade), a galeria **“Escolha seu dinossauro”** (com período
    geológico e descrição de cada um), **CTA** “Criar meu perfil 🦖” e rodapé;
  - o botão *“conhecer o dinofinance ↓”* rola do hero para os recursos.
    Dentro do app, a primeira página é o **Início** (dashboard de
    boas-vindas — não confundir com este site público).
- **Entrada tipo Netflix**: com perfis salvos no navegador, a página inicial
  vira **“Quem vai entrar?”** — cada perfil aparece como um tile com o
  dinossauro do seu tema (ou a foto do Google), cadeado quando tem senha, e um
  tile **“+ Novo perfil”** para abrir o formulário de sempre.
- **Página Início** (primeira da navegação): boas-vindas com o seu dinossauro,
  resumo do mês (pagos · a pagar · a receber) e a **galeria dos dinossauros**
  — cada tema com nome científico, **período geológico**, onde viveu, porte e
  uma descrição; dá para trocar de tema direto pelo cartão ("Usar este tema").
- **Perfis temáticos de dinossauro** (escolha ao criar o perfil, na página
  Início, no menu da engrenagem ou em *Meu perfil → Tema do perfil*):
  - **T. rex** (*Tyrannosaurus rex*, Cretáceo Superior) — **o padrão**: um
    Tiranossauro Rex **negro** no tema claro (branco no escuro);
  - **Carnotauro** (*Carnotaurus sastrei*, Cretáceo Superior) — vermelho
    predador, a mascote original;
  - **Oxalaia** (*Oxalaia quilombensis*, Cretáceo, o espinossaurídeo
    brasileiro do Maranhão) — azul-petróleo aquático;
  - **Braquiossauro** (*Brachiosaurus altithorax*, Jurássico Superior) —
    verde herbívoro.

  O tema do perfil muda o acento da interface, os gráficos, o dinossauro da
  marca no topo, o **favicon** e o **ambiente inteiro do app**: fundo,
  cartões, linhas e bordas ganham o clima do habitat, e no rodapé aparece o
  **cenário do dinossauro** — deserto vulcânico com mesetas e um **vulcão
  soltando fumaça** (Carnotauro), rio de mangue com juncos e a **vela dorsal
  do Oxalaia cruzando a água**, e **floresta de araucárias** com samambaias
  (Braquiossauro). 🥚 **Easter egg:** no tema Carnotauro, clique **3×
  seguidas** no dinossauro do topo para ver a **dança do carnotauro** (com
  direito a notinhas musicais).
- **Navegação lateral estilo Stripe**: Visão geral, Despesas, Rendimentos e
  Investimentos ficam numa **sidebar com ícones** à esquerda, encabeçada pelo
  **cartão do perfil** (o dinossauro do seu tema + nome/e-mail — clique para
  abrir *Meu perfil*). No canto superior direito ficam o botão claro/escuro e
  a **engrenagem**, que abre o menu (troca rápida de tema com os 4 minis,
  importar/exportar, sincronizar e sair). No celular a lateral vira uma faixa
  de abas rolável.
- Visual Stripe: seção **Hoje** (gasto de hoje × ontem + acumulado do mês),
  **Visão geral** com Entradas/Saídas (linha do período × pontilhada da
  comparação), variação %, breakdown por categoria em barra segmentada,
  pendências com badges e recorrentes.
- Comparação: **período anterior** ou **mesmo período do ano passado**.
- Páginas separadas de **Despesas**, **Rendimentos** e **Investimentos**.
  Despesas/Rendimentos abrem com um **gráfico de círculo** (pagas × em aberto ×
  vencidas, com legenda) + a lista do mês. Os gráficos redondos são
  **monocromáticos**: cada lançamento num tom do acento do tema — **preto no
  claro, branco no escuro** e, nos perfis de dinossauro, tons da cor do dino;
  o status fica nos selos da legenda. Novo
  lançamento entra **apenas pelos botões** "+ Despesa"/"+ Rendimento" (os dois
  na Visão geral; um em cada página), que abrem o formulário em modal: única ·
  recorrente (**contínua** ou "até quando") · parcelada, categorias em ordem
  alfabética filtradas pelo tipo, conta Pessoal/PJ e check-in de um clique.
- **Investimentos**: registre aplicações, resgates e rendimentos por tipo
  (CDB, Tesouro Direto, Ações, FIIs, Cripto…). A página mostra a rosca da
  carteira com o **total investido** no centro e legenda por tipo, e o
  **rendimento por tipo** (valor e % sobre o investido). Nas categorias de
  lançamento existem **Investimentos** (despesa) e **Resgate de investimento**
  (renda) para classificar o extrato.
- **Tema claro/escuro**: botão visível no topo (e na tela de entrada); sem
  clique, segue o tema do sistema.
- **Meu perfil** (cartão do perfil na lateral, ou menu da engrenagem):
  alterar nome/e-mail, **tema do perfil**
  (as skins de dinossauro acima, aplicadas na hora), **senha do perfil**
  (pedida ao entrar; fica só neste navegador), forma de pagamento padrão,
  **apagar os dados** e **excluir a conta**.
- Acesso local: `python finance.py app` → `http://127.0.0.1:8787/app/`
  (ou hospede a pasta `app/` em qualquer host estático).
- **Login Google** (opcional): botão oficial do Google Identity Services.
  Precisa de um OAuth **Client ID** — crie em
  [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
  (tipo *Aplicativo da Web*), adicione a URL do site em *Origens JavaScript
  autorizadas* e cole o ID em `app/config.js` (vale para todos) ou na própria
  tela de entrada (clicando em "Entrar com Google" → salvar o Client ID, vale
  só para aquele navegador). Sem backend: o login apenas identifica o perfil;
  os dados continuam no navegador da pessoa.
- **Importar extrato (CSV, OFX e PDF)**: menu da engrenagem → *Importar
  extrato*.
  Reconhece automaticamente Nubank (conta e fatura de cartão), Inter,
  Bradesco/Caixa (Crédito e Débito em colunas separadas), BB (coluna "Tipo
  Lançamento" dá o sinal) e CSVs genéricos — detecta separador, encoding
  (UTF-8/Latin-1), formato de data e decimal brasileiro. Também aceita **OFX**
  (todo banco exporta; é o formato mais confiável) e **extratos e faturas em
  PDF** — tanto em tabela (Data/Histórico/Valor/Saldo) quanto em linhas
  ("12 ABR · estabelecimento · R$ 56,70"); PDF com senha pede a senha na hora;
  PDF escaneado (imagem) não tem texto — nesse caso use o CSV/OFX do banco.
  Sugere categoria por palavras-chave, marca o que já existe no perfil e
  importa como lançamentos **pagos** na data do extrato. O leitor de PDF
  (pdf.js, da Mozilla, Apache-2.0) vem junto em `app/vendor/pdfjs/` e só é
  carregado se você importar um PDF. Há também um botão **Importação** sempre
  visível na Visão geral e nas páginas de Despesas/Rendimentos.
  - **Coluna "Repete"**: em cada linha da prévia dá para marcar *Sempre*,
    *Nº vezes* ou *Até…* (com o calendário do navegador) — a importação cria a
    recorrente correspondente e já vincula o lançamento do mês.
  - **Aprendizado**: a categoria que você escolher para uma descrição fica
    memorizada no perfil (selo *aprendida* nas próximas importações), e quando
    a mesma descrição aparece em meses seguidos com o mesmo valor (ou dia
    próximo) a linha ganha o selo *padrão* e a repetição já vem sugerida.
- **Sincronizar com os CSVs locais**: quando o app é aberto pelo
  `python finance.py app`, aparece *Sincronizar CSVs locais* no menu —
  **Trazer** mescla `data/*.csv` no perfil (sem apagar nada; check-ins são
  copiados) e **Enviar** substitui os CSVs pelos dados do perfil (com backup
  automático em `data/backup-…`). Em um host estático a opção fica oculta.


## Publicar em dinofinance.app (Vercel)

O domínio **dinofinance.app** já está no Vercel; o site é a pasta `app/`
(estático puro, sem build):

1. Suba o repositório no GitHub (`git init` → commit → push) — se `data/`
   tiver dados reais, descomente `/data/` no `.gitignore` antes.
2. Em [vercel.com](https://vercel.com) → **Add New… → Project** → importe o
   repositório.
3. Configure: **Framework Preset = Other**, **Root Directory = `app`**, sem
   Build Command e sem Output Directory (é servido como está).
4. **Deploy**. Depois, em **Settings → Domains**, confirme `dinofinance.app`
   (e adicione `www.dinofinance.app` como redirect) — como o domínio foi
   comprado no próprio Vercel, o DNS já aponta sozinho.
5. Login Google no site publicado: em
   [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials),
   adicione `https://dinofinance.app` (e `https://www.dinofinance.app`) em
   **Origens JavaScript autorizadas** do Client ID e fixe o ID em
   `app/config.js` para valer para todo mundo.
6. Cada deploy novo é só dar push — o Vercel republica sozinho.

No site publicado a opção *Sincronizar CSVs locais* fica oculta (ela só
existe rodando `python finance.py app` na sua máquina).


Controle de finanças **Pessoal + PJ** com visual próprio (claro/escuro
automáticos, acento monocromático e verde-menta) e a marca **dinofinance** —
o dinossauro da skin ativa (**T. rex negro** por padrão; carnotauro, oxalaia
ou braquiossauro nos temas), que aparece no topo, na tela de entrada e no
favicon seguindo o tema claro/escuro e a skin do perfil:

- **`python finance.py app`** → abre `http://127.0.0.1:8787` — o site editável
  pelo navegador: visão geral com gráficos comparativos por período (atual ×
  período anterior), formulário para lançar contas e check-in com um clique.
  São só duas páginas: **Visão geral** e **Lançamentos**.
- Os dados vivem em `data/*.csv` (fonte de verdade, editável à mão).

## Requisitos

- Python 3.11+ — sem dependências (o `app/` é HTML+CSS+JS puros e roda em
  qualquer host estático, até sem Python).

## Começando

```bash
python finance.py exemplo   # dados de demonstração (Pessoal + PJ)
python finance.py app       # abre o site local
python finance.py zerar --forcar   # limpa tudo para começar de verdade
```

## O site (finance.py app)

- **Visão geral** (layout inspirado no painel da Stripe) — Hoje
  (entradas/saídas/vencimentos do dia) e os cartões:
  - **Volume recebido** e **Volume gasto** — linha do período atual ×
    pontilhada do período anterior e variação %;
  - **Pagamentos** — despesas do período por status (pagas · a vencer ·
    vencidas) em barra segmentada;
  - **Faturas de cartões** — lançamentos da categoria *Cartão de crédito*
    agrupados por cartão;
  - **Contas a pagar** — pendências com chips Aberta / Vence hoje / Vencida /
    Paga;
  - **Gastos por categoria** — barra segmentada + valores;
  - **Distribuição dos gastos** — rosca de proporção com o gasto total do
    período no centro.

  Períodos: Este mês · 30 dias · 3 meses · 6 meses · Este ano. O seletor
  **Tudo / Pessoal / PJ** filtra tudo.
- **Lançamentos** — formulário enxuto: Tipo e Conta em botões segmentados,
  **calendário** para o vencimento (recorrente usa "todo dia N"; campos só
  aparecem quando fazem sentido), categorias pré-estabelecidas **filtradas
  pelo tipo** (+ "Nova categoria…"), prévia do parcelamento em tempo real
  ("6× de R$ 400,00 — total R$ 2.400,00") + pendências do mês com botão
  **Pagar/Receber**, excluir e desfazer.

## CLI (opcional, mesmo dado)

```bash
python finance.py add "Aluguel" 1550 --venc 10 --recorrente -c Moradia
python finance.py add "Nota fiscal" 2000 -t receita --conta pj --venc 15
python finance.py add "Notebook" 3200 --parcelas 8 --venc 6 -c Compras
python finance.py pagar 12 14        # check-in por id
python finance.py status             # resumo no terminal
```

Todo comando aceita `-h`. Vencimento: `--venc 15` = próxima ocorrência do dia
15; datas passadas usam `DD/MM/AAAA`. Parcelas: o valor informado é o total
(use `--valor-parcela` para informar o valor de cada parcela).

## Observações

- Categorias padrão de **despesa**: Moradia, Mercado, Delivery, Restaurantes,
  Farmácia, Médica, Dentista, Psicólogo, Academia, Carro, Transporte,
  Financiamento, **Cartão de crédito** (usada pelo cartão "Faturas de
  cartões"), Seguros, Impostos, Assinaturas, Internet e telefone, Educação,
  Pet, Família, Vestuário, Lazer, Viagem, Compras, Presentes, Serviços,
  Empresa, Investimentos, Outros. De **receita**: Salário, Renda extra,
  Ganhos pontuais, Serviços prestados, Resgate de investimento, Outros. Os
  formulários mostram tudo em **ordem alfabética** (Outros por último),
  filtram pelo tipo e aceitam criar novas.
- No app estático (`app/`), o preenchimento manual já convive com a
  importação de extratos CSV e com o login Google (perfil por conta Google).
  **Planejado para depois:** conciliação automática extrato × lançamentos
  previstos (hoje a importação deduplica por data+valor, mas não casa um
  lançamento pendente com a linha do extrato).
- Nos CSVs a conta PJ é gravada com o valor interno `mei` (na interface o
  rótulo é PJ); a CLI aceita `--conta pj`.
- Se o repositório for público no GitHub, descomente `/data/` no `.gitignore`
  para não versionar seus dados financeiros.
- O site roda só na sua máquina (127.0.0.1). Para virar um site hospedado no
  futuro, a lógica já está separada em `finance.py` (dados) e `server.py` (web).
