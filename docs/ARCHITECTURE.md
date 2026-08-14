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

Supabase Auth é a fonte de identidade. `app_users` guarda o perfil interno (`admin` ou `partner`), estado ativo e exigência de troca de senha; `partner_user_links` associa um login de sócio a um registro de `partners`. A relação já existente em `project_partners` permite que esse mesmo sócio participe de vários projetos sem duplicar identidade.

`proxy.ts` renova cookies de sessão e impede navegação entre as áreas. Isso não substitui a autorização no servidor: cada Route Handler administrativo chama `requireAdmin()`, que valida no banco se o perfil continua ativo e com o papel correto.

O browser não acessa tabelas do Supabase diretamente. O cliente `service_role` permanece server-only, e as tabelas continuam sem permissão para `anon` e `authenticated`. Não existe signup público.

`NEXT_PUBLIC_AUTH_ENABLED` controla apenas a implantação inicial. Deve ser ativada depois da migration e do bootstrap do primeiro administrador, evitando que uma versão nova bloqueie o operador antes de existir uma identidade válida.

### Administração de acessos

A gestão fica em `Configurações / Acessos` e chama exclusivamente `/api/admin/accesses`. A rota não aceita criação ou promoção de administradores: o único papel administrável pela interface é `partner`.

O banco é a fonte autoritativa para papel, status, vínculo e troca obrigatória de senha. Metadados do Supabase Auth são uma projeção usada pelo proxy para roteamento antecipado. Operações que atravessam Auth e banco usam compensação: uma criação incompleta remove a identidade recém-criada, e uma redefinição de senha restaura o indicador anterior quando a credencial não puder ser atualizada.

Não há exclusão física de acessos pela interface. A desativação bloqueia novas operações sem remover a identidade, o parceiro, as participações ou os snapshots financeiros.

### Portal do sócio

O portal é somente leitura e usa `/api/partner/report`. A rota chama `requirePartner()` e recebe apenas a competência; os projetos autorizados são derivados no servidor a partir do `partner_id` da sessão, de `project_partners` e dos snapshots de distribuição. O filtro de projeto da interface atua somente sobre o conjunto já autorizado e não amplia o escopo da consulta.

`src/lib/partner-report/service.ts` concentra a política de leitura:

- competência fechada usa `monthly_closings` e `closing_distributions`;
- competência aberta usa `v_project_monthly_financials` e a composição vigente;
- estimativa positiva só é exibida quando a composição soma 100%;
- resultado não positivo mantém a participação do sócio em zero;
- a resposta não expõe outros sócios, lançamentos administrativos ou operações de escrita.

Esse contrato permite evoluir a apresentação ou criar exportações do próprio portal sem duplicar autorização e cálculo financeiro.

## Metas

Metas são planejadas manualmente. Realizado é derivado dos dados atuais. MRR e dinheiro recebido não são tratados como sinônimos.

## Demandas e planejamento

Demandas ficam em uma estrutura única, com projeto/cliente opcionais. O planejador calcula uma pontuação determinística baseada em prioridade, atraso, proximidade do prazo, vínculo com cliente, status e categoria. A razão da prioridade é retornada junto com a tarefa.

## Evolução futura

As integrações com Stripe, Cora, AWS, Vercel e Supabase Billing devem escrever/conciliar as mesmas entidades de domínio, em vez de criar módulos financeiros paralelos. Assim uma transação continua sendo uma transação independentemente da origem `manual`, `import`, `recurrence` ou `integration`.
