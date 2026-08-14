# Banco de dados

O banco e PostgreSQL via Supabase. O schema de bootstrap fica em `supabase/schema.sql` e e espelhado em `schema.sql` para o fluxo descrito no README.

## Principais grupos

### Workspace, projetos e clientes

- `app_settings`: configuracoes globais do workspace, incluindo moeda, locale e timezone.
- `projects`: projetos como dados, com tipos `client`, `saas` e `internal`.
- `clients`: cadastro central de clientes.
- `project_clients`: relacionamento muitos-para-muitos entre projetos e clientes.
- `plans` e `subscriptions`: estrutura SaaS de planos e assinaturas.

### Financeiro

- `financial_categories`: categorias de receita/custo e bucket de meta.
- `fee_profiles`: perfis de taxa com percentual e valor fixo.
- `financial_transactions`: lancamentos financeiros. `net_amount_cents` e coluna gerada:
  - receita: `gross_amount_cents - fee_amount_cents`;
  - custo: `-1 * (gross_amount_cents + fee_amount_cents)`.
- `shared_cost_allocations`: rateios de uma transacao compartilhada para projetos.
- `recurring_financial_templates` e `recurring_financial_allocations`: recorrencias financeiras e seus rateios.

### Socios e fechamentos

- `partners`: participantes, com tipos `holding` e `external`.
- `project_partners`: participacoes por projeto com vigencia.
- `monthly_closings`: snapshot mensal do resultado por projeto.
- `closing_distributions`: snapshot das distribuicoes do fechamento.

### Identidade e acesso

- `auth.users`: identidade e credenciais administradas pelo Supabase Auth.
- `app_users`: perfil interno, e-mail normalizado, papel, estado ativo, criador, ultimo login e troca obrigatoria de senha.
- `partner_user_links`: vinculo um-para-um entre um login de socio e `partners`.
- O mesmo `partner` pode pertencer a varios projetos por `project_partners`.
- O e-mail possui indice unico sem diferenciar maiusculas e minusculas.

### Metas, demandas e tempo

- `goals`: metas por competencia para projeto, holding ou conjunto de projetos de cliente.
- `task_categories`, `tasks`, `task_dependencies`: demandas, categorias e dependencias.
- `recurring_task_templates`: demandas recorrentes.
- `task_time_entries`: registros de tempo por demanda/projeto.
- `work_sessions` e `work_session_items`: planejamento deterministico de sessoes de trabalho.

### Comercial

- `leads`: pipeline comercial simples.
- `lead_activities`: historico de contatos, reunioes, propostas, notas e mudancas de etapa.

## Views e funcoes

- `v_project_monthly_financials`: consolidado por projeto e competencia, com receita bruta, taxas, receita liquida, custos diretos, custos compartilhados alocados, lucro e margem.
- `v_consolidated_monthly_cash`: consolidado de caixa realizado por mes.
- `close_project_month(p_project_id, p_competence_month)`: cria ou substitui o snapshot fechado de um projeto/mes e suas distribuicoes.
- `reopen_project_month(p_closing_id)`: reabre fechamento quando nao ha distribuicao externa paga.

## Integridade e seguranca

- Chaves estrangeiras preservam relacoes entre projetos, clientes, transacoes, alocacoes e fechamentos.
- `competence_month` exige dia 1 por constraint.
- Tabelas publicas tem RLS habilitado e acesso revogado para `anon` e `authenticated`.
- O app usa `service_role` apenas em codigo server-only.
- Route Handlers administrativos validam sessao e perfil ativo antes de acessar os dados.

## Migrations

Ao alterar schema:

1. Prefira migration SQL compativel com dados existentes.
2. Atualize `supabase/schema.sql`.
3. Mantenha `schema.sql` sincronizado.
4. Atualize tipos TypeScript e queries relacionadas.
5. Revalide calculos financeiros quando a mudanca tocar financeiro, rateios, fechamentos ou distribuicoes.
