# Prodexy Labs Manager - Agent Guide

Este arquivo registra as regras duradouras de trabalho para manutencao do Prodexy Labs Manager. O codigo-fonte continua sendo a fonte de verdade tecnica; as regras de negocio abaixo sao invariantes conceituais que devem orientar qualquer alteracao.

## Produto

Prodexy Labs Manager e o sistema interno de gestao da Prodexy Labs, combinando financeiro por projeto, clientes, SaaS, socios, custos compartilhados, metas, demandas, tempo, comercial e fechamento mensal.

O sistema usa acessos internos gerenciados com papeis `admin` e `partner`. Nao introduza signup publico, equipes, convites, permissoes genericas ou multi-tenancy sem pedido explicito. Socios acessam somente o portal restrito aos projetos vinculados ao seu cadastro de parceiro.

Um acesso `partner` novo ou reatribuido exige parceiro externo ativo com participacao vigente em pelo menos um projeto. A mesma identidade representa o socio em todos os projetos vinculados; nao crie um login por projeto.

## Stack e seguranca

- Next.js App Router, React, TypeScript e CSS proprio.
- Supabase/PostgreSQL como banco e infraestrutura.
- O browser nao deve acessar o Supabase diretamente com chaves privilegiadas.
- `SUPABASE_SERVICE_ROLE_KEY` e outros secrets ficam somente no servidor.

## Regras financeiras invariantes

Calculo economico do projeto:

```text
Receita bruta
- taxas financeiras
= receita liquida

Receita liquida
- custos diretos
- custos compartilhados alocados
= lucro liquido do projeto

Lucro liquido positivo
-> distribuicao entre Prodexy e socios externos
```

- Distribuicao de socio nao e custo operacional.
- Custo compartilhado e registrado uma vez; alocacoes sao rateios gerenciais e nao novas despesas.
- Prejuizo nao gera distribuicao positiva.
- Fechamento mensal e snapshot historico; configuracoes atuais nao podem alterar meses fechados silenciosamente.
- MRR nao e caixa recebido.
- Valores monetarios devem ser calculados em centavos inteiros, salvo quando o banco exigir percentual `numeric`.
- Nao existe regra de retencao automatica de 10%.
- Relatorios de socio devem derivar o escopo do parceiro autenticado no servidor; nunca confie em `project_id` enviado pelo browser.
- Mes fechado no portal do socio usa snapshots. Mes aberto pode mostrar apenas estimativa identificada e com composicao societaria valida.

## Como trabalhar

Antes de alterar funcionalidade relevante:

1. Leia os arquivos envolvidos.
2. Entenda o fluxo UI -> Route Handler/API -> servico -> Supabase/PostgreSQL -> UI.
3. Identifique impactos em financeiro, fechamento, distribuicoes, metas, dashboard e exportacoes.
4. Prefira mudancas localizadas e compativeis com dados existentes.
5. Nao invente regras de negocio ausentes.
6. Nunca faca migracoes destrutivas ou correcao de dados historicos sem avaliacao explicita.

## Arquivos importantes

- `README.md` - instalacao, operacao local e resumo do produto.
- `schema.sql` e `supabase/schema.sql` - schema completo para bootstrap do banco.
- `src/lib/server-finance.ts` - consolidacao financeira para dashboard.
- `src/lib/finance.ts` e `src/lib/money.ts` - helpers financeiros.
- `src/app/api/closings/route.ts` - fechamento e reabertura.
- `src/app/api/shared-costs/route.ts` - criacao de custos compartilhados e rateios.
- `docs/ARCHITECTURE.md` - arquitetura atual.
- `docs/financial-rules.md` - regras financeiras criticas.
- `docs/database.md` - mapa resumido do banco.
- `docs/TESTING.md` - smoke tests funcionais.

## Validacao

Leia `package.json` antes de assumir scripts. Nesta versao, use quando possivel:

```bash
npm run typecheck
npm run lint
npm run build
```

O script `npm run check` executa os tres.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
