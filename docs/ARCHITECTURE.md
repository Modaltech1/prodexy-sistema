# Arquitetura — Prodexy Labs Manager

## Domínio

A Prodexy Labs é o workspace/holding. Projetos são unidades operacionais que podem ser `client`, `saas` ou `internal`. A holding não é forçada a virar um projeto fictício: transações e demandas podem existir sem `project_id`.

## Financeiro

A fonte de verdade são `financial_transactions` e `shared_cost_allocations`.

### Projeto

1. Receita bruta realizada.
2. Menos taxa financeira da receita.
3. Receita líquida.
4. Menos custos diretos pagos.
5. Menos rateios de custos compartilhados pagos.
6. Lucro/prejuízo do projeto.
7. Se houver lucro positivo, distribuição entre participantes conforme a vigência de `project_partners`.

`closing_distributions` não é despesa. É a fotografia da distribuição do lucro já apurado.

### Holding

O resultado gerencial pertencente à Prodexy considera:

- receitas diretas da holding;
- custos exclusivos da holding;
- parte não alocada de custos compartilhados, se houver;
- parcela Prodexy do lucro dos projetos;
- prejuízos dos projetos, que permanecem visíveis na parcela Prodexy até existir uma regra futura explícita de compartilhamento de prejuízo.

A UI de criação de custo compartilhado exige rateio total, então normalmente a parcela não alocada é zero. Recorrências financeiras compartilhadas também armazenam percentuais em `recurring_financial_allocations`; ao gerar a previsão, o sistema cria a despesa original e suas alocações na mesma rotina.

## Fechamentos

`close_project_month()` é uma função PostgreSQL para manter o fechamento e a geração das distribuições em uma operação única no banco. O fechamento grava snapshot de valores e percentuais. Alterar uma participação futura não altera o mês fechado.

Reabrir altera o status para `reopened`. O fechamento seguinte recalcula e substitui as distribuições daquele snapshot.

## Segurança

A V1 é single-user e não tem login interno. O browser não acessa Supabase diretamente. O Next.js usa um cliente admin server-only e as tabelas não dão acesso aos roles `anon`/`authenticated`.

`proxy.ts` não aplica autenticação por senha nesta versão. Se a aplicação precisar ficar restrita, use proteção externa de infraestrutura ou reintroduza um mecanismo de acesso explícito.

## Metas

Metas são planejadas manualmente. Realizado é derivado dos dados atuais. MRR e dinheiro recebido não são tratados como sinônimos.

## Demandas e planejamento

Demandas ficam em uma estrutura única, com projeto/cliente opcionais. O planejador calcula uma pontuação determinística baseada em prioridade, atraso, proximidade do prazo, vínculo com cliente, status e categoria. A razão da prioridade é retornada junto com a tarefa.

## Evolução futura

As integrações com Stripe, Cora, AWS, Vercel e Supabase Billing devem escrever/conciliar as mesmas entidades de domínio, em vez de criar módulos financeiros paralelos. Assim uma transação continua sendo uma transação independentemente da origem `manual`, `import`, `recurrence` ou `integration`.
