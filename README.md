# Fluxo Financial OS

Aplicação pessoal de planejamento financeiro construída para Cloudflare Pages, Pages Functions, D1 e Android PWA.

## O que existe hoje

- Visão geral com dinheiro livre, receitas esperadas, despesas pendentes, saldo projetado e necessidade de receita adicional.
- Fluxo com zoom por dia, semana, mês, ano e período personalizado; busca, filtros, agrupamento e comparação com período anterior.
- Contas a pagar e receber com baixa total ou parcial, vencimentos e histórico financeiro.
- Receitas e despesas com filtros próprios.
- Fontes de receita com valor mensal esperado; o sistema calcula recebido, agendado e valor ainda sem previsão.
- Despesas/receitas recorrentes semanais, quinzenais, mensais e anuais.
- Contas financeiras separadas das contas a pagar/receber.
- Ledger por conta: saldo é derivado do saldo inicial + movimentos do livro-caixa.
- Reservas/cofrinhos distribuíveis entre várias contas físicas.
- Cartões, fechamento, vencimento, limite, compras e parcelamentos.
- Cada parcela do cartão gera uma obrigação futura no Fluxo e no Planejamento.
- Meta de saldo livre no fim do mês e detecção do primeiro risco de falta de caixa.
- Edição, exclusão/reversão e auditoria.
- Painel administrativo para contas, fontes, categorias, reservas, cartões, recorrências e compras parceladas.
- Sessão server-side, cookie HttpOnly, rate limit de login e Turnstile opcional.
- PWA Android, IndexedDB e fila offline para novos lançamentos.
- Backup JSON completo pelo painel administrativo.

## Stack

- Preact
- TypeScript
- Vite
- CSS próprio
- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare D1
- IndexedDB
- vite-plugin-pwa / Workbox

## Organização

```text
src/
  app/             shell e navegação
  components/      componentes reutilizáveis e modais
  data/            API, cache IndexedDB e sincronização
  lib/             moeda e utilitários
  pages/           telas do produto
  styles/          tokens, base, shell e CSS por página

functions/api/     rotas HTTP do Cloudflare Pages Functions
server/            regras, auth, ledger, recorrências e planejamento
shared/            tipos compartilhados
migrations/        schema versionado do D1
scripts/           automação de infraestrutura/deploy
public/            manifest, headers, redirects e ícones PWA
```

O frontend não é a fonte oficial dos cálculos financeiros. Saldo, planejamento e regras críticas são calculados pelo servidor/D1.

## Dinheiro no banco

Valores monetários são persistidos em centavos inteiros.

```text
R$ 129,90 => 12990
```

Isso evita erros de ponto flutuante.

O saldo de uma conta financeira não é um campo que sofre incrementos aleatórios. Ele é calculado por:

```text
saldo inicial + soma(account_ledger.delta_cents)
```

Excluir um lançamento já liquidado cria reversões no ledger antes do soft-delete.

## Desenvolvimento local

Requisitos:

- Node.js 22+
- npm

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run build
npm run cf:dev
```

Nunca versione `.dev.vars`, senhas ou tokens.

## CI

`.github/workflows/ci.yml` roda em push/PR para `main`:

1. instalação limpa;
2. aplicação das migrations em D1 local de CI;
3. typecheck do frontend;
4. typecheck das Pages Functions;
5. build Vite/PWA.

Se qualquer etapa falhar, o deploy de produção não é iniciado.

## Deploy automático para Cloudflare

O repositório possui `.github/workflows/deploy-cloudflare.yml` e `scripts/cloudflare-bootstrap.mjs`.

Depois que os secrets abaixo forem configurados no GitHub, um CI verde na `main` aciona automaticamente o bootstrap/deploy.

### Repository Secrets obrigatórios

Em **GitHub > Settings > Secrets and variables > Actions > New repository secret**:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `ADMIN_PASSWORD`
- `SESSION_SECRET` recomendado

O token Cloudflare precisa poder administrar Pages e D1 nessa conta.

Para gerar uma `SESSION_SECRET` localmente:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Se `SESSION_SECRET` não for informado, o bootstrap gera uma chave forte durante o deploy. Para manter o mesmo segredo entre deploys, configure-o no GitHub.

### Turnstile opcional

Também podem ser configurados:

- `TURNSTILE_SECRET`
- `TURNSTILE_SITE_KEY`

O app só exige o desafio depois de repetidas falhas de login. O rate limit server-side continua funcionando mesmo sem Turnstile.

### Repository Variables opcionais

- `CLOUDFLARE_PAGES_PROJECT` — padrão `finan-as`
- `CLOUDFLARE_D1_PROD` — padrão `finan-as-prod`
- `CLOUDFLARE_D1_PREVIEW` — padrão `finan-as-preview`
- `SESSION_TTL_DAYS` — padrão `30`

### O que o bootstrap faz

Na primeira execução válida:

1. procura ou cria `finan-as-prod` no D1;
2. procura ou cria `finan-as-preview`;
3. procura ou cria o projeto Pages `finan-as` com `main` como production branch;
4. gera `wrangler.generated.jsonc` sem versioná-lo;
5. aplica todas as migrations em produção e preview;
6. configura os secrets do Pages;
7. publica `dist` + Pages Functions;
8. disponibiliza a aplicação em `https://finan-as.pages.dev` se esse nome estiver disponível na conta.

Nas execuções seguintes o processo é idempotente: reutiliza os recursos existentes e aplica apenas migrations pendentes.

## Produção x Preview

O Wrangler gerado usa dois bancos separados:

```text
produção -> finan-as-prod
preview  -> finan-as-preview
```

Assim testes e previews não alteram seus dados financeiros reais.

`wrangler.example.jsonc` documenta o formato gerado automaticamente.

## Segurança

- nenhuma senha está no bundle do frontend;
- toda `/api/*` exige sessão, exceto login e consulta de sessão;
- sessão usa token aleatório e o D1 guarda apenas o hash do token;
- cookie: `HttpOnly; Secure; SameSite=Strict`;
- origem de login é armazenada como HMAC, não IP puro;
- 5 falhas recentes geram bloqueio temporário;
- após repetidas falhas, Turnstile pode ser exigido quando configurado;
- admin mostra sessões e permite revogar outras sessões;
- audit log registra mutações importantes;
- backup não inclui senha, tokens de sessão nem chaves de login.

## PWA Android

O app inclui:

- manifest standalone;
- ícones 192, 512 e maskable;
- theme/background em grafite;
- service worker;
- cache dos assets estáticos;
- API sempre network-only no service worker;
- cache estruturado no IndexedDB;
- outbox offline para novos lançamentos;
- bottom navigation no mobile;
- safe-area e `100dvh`.

No Android/Chrome, após publicar, use **Adicionar à tela inicial / Instalar app**.

## Migrações

Nunca altere o banco de produção manualmente para adicionar colunas/tabelas. Crie uma nova migration numerada em `migrations/`.

Atualmente:

- `0001_initial.sql` — modelo financeiro, autenticação e auditoria;
- `0002_card_installment_entries.sql` — ligação de parcelas de cartão ao fluxo de caixa.

## Regra de contribuição

Não colocar regra financeira crítica em componentes de UI. A separação esperada é:

```text
UI -> API -> services/repository -> D1
```

O D1 é a fonte da verdade. IndexedDB é cache/offline, não banco principal.
