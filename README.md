# 🦖 dinofinance

**Organize suas finanças &… Dinossauros** — [dinofinance.app](https://dinofinance.app)

Painel de finanças pessoais **grátis, sem backend e sem cadastro**: seus dados
ficam no **seu navegador** (localStorage), em perfis separados por pessoa — e
cada perfil é um **dinossauro**, que muda o tema inteiro do app.

## Intuito

O dinofinance nasceu de uma ideia simples: ter um painel financeiro bonito
como os melhores do mercado (a inspiração visual é o painel da Stripe), **sem
pagar nada e sem entregar seus dados a ninguém** — nem a nós, porque não
existe servidor: é um site 100% estático (HTML+CSS+JS puros). E com
dinossauros, porque organizar dinheiro não precisa ser sem graça.

- 💸 **Pessoal + PJ** no mesmo lugar, com comparação período a período
- 🔒 **Privacidade por arquitetura**: nada sai da sua máquina
- 🦕 **Perfis temáticos de dinossauro**, com habitat, período geológico e tudo
- 🆓 Grátis, sem plano pago, sem anúncio

## O que tem

- **Site público** com vale jurássico animado, e entrada estilo Netflix
  (**"Quem vai entrar?"**) quando já há perfis no navegador;
- **Início** — boas-vindas com o seu dinossauro, resumo do mês e a galeria
  dos temas;
- **Visão geral** — gasto de hoje × ontem, entradas/saídas do período contra
  o **período anterior** ou o **mesmo período do ano passado**, variação %,
  categorias e pendências;
- **Despesas e Rendimentos** — lista do mês com **check-in de um clique**,
  selos de vencida/aberta/paga e gráfico de círculo monocromático no tom do
  tema; lançamento único, **recorrente** (contínua ou "até quando") ou
  **parcelado**;
- **Investimentos** — carteira por tipo (CDB, Tesouro, Ações, Cripto…),
  aportes, resgates e rendimento sobre o investido;
- **Importação de extrato** — CSV, OFX e **PDF** (Nubank, Inter,
  Bradesco/Caixa, BB e genéricos; fatura com senha pede a senha na hora).
  Sugere categorias, **aprende** as suas escolhas e detecta o que se repete
  todo mês (coluna **Repete** cria a recorrente na hora);
- **Login Google opcional** (só identifica o perfil), **senha de perfil**
  opcional, exportação em JSON, tema claro/escuro automático.

## Os dinossauros

| Tema | Espécie | Período | Habitat no app |
| --- | --- | --- | --- |
| **T. rex** ⚫ *(padrão)* | *Tyrannosaurus rex* | Cretáceo Superior · 68–66 Ma | preto/branco clássico |
| **Carnotauro** 🔴 | *Carnotaurus sastrei* | Cretáceo Superior · ~71 Ma | deserto vulcânico com vulcão fumegando |
| **Oxalaia** 🔵 | *Oxalaia quilombensis* 🇧🇷 | Cretáceo · ~95 Ma | rio de mangue com a vela dorsal cruzando a água |
| **Braquiossauro** 🟢 | *Brachiosaurus altithorax* | Jurássico Superior · 154–150 Ma | floresta de araucárias |

O tema muda o acento, os gráficos, a marca, o **favicon** e o ambiente
inteiro (superfícies tingidas + cenário do habitat no rodapé). Escolha ao
criar o perfil, na página Início, no menu da engrenagem ou em *Meu perfil*.

🥚 **Easter egg:** no tema Carnotauro, clique **3× seguidas** no dinossauro
do topo e veja a dança.

## ⚠️ Em desenvolvimento

> **Voltando a mexer no projeto?** Comece pelo **[ROADMAP.md](ROADMAP.md)** —
> ele tem o estado atual, as pendências e a receita passo a passo de como
> adicionar um dinossauro novo.

O dinofinance está quase pronto — mas o objetivo final é bem maior:

- ⚠️ **Adicionar TODOS os dinossauros catalogados até hoje** (são mais de mil
  gêneros descritos pela paleontologia!) como temas de perfil — cada um com
  sua arte, seu período, seu habitat e sua paleta. Os quatro atuais são só as
  primeiras fichas do catálogo. 🦴
- Conciliação automática do extrato importado com os lançamentos previstos
  (hoje a importação deduplica, mas não faz o "casamento" com pendências);
- Sincronização entre dispositivos (backend opcional no futuro — a camada
  `store` em [app/js/data.js](app/js/data.js) já foi desenhada para essa troca).

## Como usar

- **Online**: [dinofinance.app](https://dinofinance.app) — crie um perfil e
  pronto (dica: marque "incluir dados de exemplo" para conhecer tudo).
- **Local** (Python 3.11+, zero dependências):

  ```bash
  python finance.py app   # abre http://127.0.0.1:8787/app/
  ```

  No modo local aparece **Sincronizar CSVs locais** no menu — os dados também
  podem viver em `data/*.csv`, editáveis à mão, com o app local clássico
  (Visão geral + Lançamentos) e uma CLI (`python finance.py add/pagar/status`,
  todo comando aceita `-h`).
- **Hospedar a sua instância**: faça fork e importe no
  [Vercel](https://vercel.com) — **Root Directory = `app`**, preset *Other*,
  sem build. Login Google: crie um OAuth Client ID (tipo *Web*), autorize a
  URL do seu site nas *origens JavaScript* e cole o ID em
  [app/config.js](app/config.js).

## Privacidade

Sem backend, sem analytics, sem cookies de terceiros. Os dados moram no
localStorage do seu navegador; o login Google (opcional) serve apenas para
identificar o perfil naquele navegador. Backup é com você: menu →
**Exportar dados (JSON)**. O leitor de PDF ([pdf.js](https://mozilla.github.io/pdf.js/),
Apache-2.0) roda localmente e vem junto em `app/vendor/pdfjs/`.
