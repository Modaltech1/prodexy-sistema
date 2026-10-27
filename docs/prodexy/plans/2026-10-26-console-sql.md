# ExecPlan — Prodexy Sistema — Console SQL

## Status

IN_PROGRESS

## Standard version

2.0.0

## Bloco atual

S2 — INFRAESTRUTURA CONCLUÍDA — publicação e smoke test da aplicação pendentes com o responsável.

## Motivação

Permitir que o responsável execute consultas e migrations dos databases registrados sem copiar arquivos para uma sessão SSM. A experiência deve seguir o modelo direto do SQL Editor do Supabase: escolher database, escrever SQL, executar e ver o resultado.

## Estado atual observado

- O explorador em `/infraestrutura/bancos` já lista estrutura e dados autorizados do PH.
- O Explorador e o SQL Editor foram consolidados na role compartilhada `prodexy_sistema_sql_executor`; o Explorador mantém sua sessão forçada para somente leitura.
- O sistema já possui autenticação administrativa server-side e conexão PostgreSQL com TLS.

## Estado alvo

- Rota `/infraestrutura/sql` com editor amplo, seleção de database, execução por `Ctrl+Enter`, resultados e histórico local.
- Backend executa exatamente o SQL informado no database selecionado por uma role administrativa compartilhada da plataforma.
- Primeiro database integrado: `prodexy_ph_outlet`.

## Escopo

- Console SQL administrativo no Prodexy Sistema.
- Uma role compartilhada `prodexy_sistema_sql_executor` para databases registrados.
- Resultado tabular e mensagens de comandos PostgreSQL.

## Fora do escopo

- Alterar automaticamente outros databases ainda não cadastrados.
- Editor colaborativo, IA para gerar SQL ou agendamento de consultas.
- Deploy, que é realizado pelo responsável.

## Invariantes

- Executar somente um bloco autorizado por vez e parar para validação.
- A credencial PostgreSQL permanece apenas no servidor.
- A API exige o usuário administrador real e não funciona com Auth desabilitado.
- O SQL é executado no database escolhido na interface, sem credencial no navegador.

## Impacto arquitetural

- Código: nova página, rota API e adapter PostgreSQL de execução.
- Dados: S1 não altera banco; S2 cria a role e libera o database PH.
- Auth: somente `admin` autenticado.
- UI: novo item `SQL Editor` em Infraestrutura.
- Runtime: pool PostgreSQL separado, com uma conexão.
- Infraestrutura: uma role compartilhada e uma referência server-side.

## Arquivos e módulos afetados

- `src/app/infraestrutura/sql/page.tsx`
- `src/app/api/infraestrutura/sql/[projectId]/route.ts`
- `src/features/database-explorer/server/sql-executor.ts`
- `src/features/database-explorer/contracts.ts`
- `src/components/app-shell.tsx`
- `src/app/globals.css`
- `tests/database-explorer.test.mjs`
- documentação operacional do explorador

## Marcos de implementação

### S1 — interface e contrato local

- [x] Criar navegação e tela do SQL Editor.
- [x] Implementar editor, execução por botão/atalho, resultado e histórico local.
- [x] Criar API e adapter server-side, inativos enquanto a referência privada não existir.
- [x] Validar typecheck, lint afetado, testes, build e diff.
- [x] Validação do responsável recebida em 2026-10-26.
- [x] Autorização explícita de S2 recebida em 2026-10-26.

### S2 — role compartilhada e conexão real do PH

- [x] Responsável criou `prodexy_sistema_sql_executor`, configurou SCRAM/LOGIN, autorizou o PH e transferiu o controle dos objetos públicos existentes; pós-check validado em 2026-10-27.
- [x] Código consolidado para a mesma role no Explorador e no SQL Editor; remoção de `prodexy_sistema_ph_observer` autorizada em 2026-10-27.
- [x] Responsável removeu a regra HBA e a role `prodexy_sistema_ph_observer`; ausência final e serviço ativo confirmados em 2026-10-27.
- [ ] Responsável configura `PRODEXY_SISTEMA_SQL_EXECUTOR_DB_PASSWORD` no runtime local e na Vercel.
- [ ] Validar conexão TLS e execução real pelo Console SQL.
- [ ] Atualizar primeiro `RESOURCE_REGISTRY.md`, depois `BUILD_LEDGER.md`.
- [ ] Validação final do responsável.

## Migrations e dados

Nenhuma migration do Prodexy Sistema. O Console executará futuramente o SQL fornecido pelo responsável. S1 não executa SQL remoto.

## Segurança e Auth

A credencial fica em `PRODEXY_SISTEMA_SQL_EXECUTOR_DB_PASSWORD`, somente server-side. O browser envia texto SQL para uma rota autenticada e recebe somente o resultado.

## Testes e quality gates

- `npm run typecheck`
- ESLint dos arquivos alterados
- `npm run test:database-explorer`
- `git diff --check`
- Teste real somente em S2.

## Rollback

Remover rota, item de navegação e referência privada. Em S2, revogar acesso ou remover a role compartilhada.

## Evidências de conclusão

Tela funcional local, checks aprovados e, em S2, resultado de uma consulta real no database PH sem exposição da senha.

## Atualização documental

Atualizar o runbook local. Após evidência de S2, registrar o recurso AWS no registry e no ledger.

## Decisões em aberto

Nenhuma para S1.

## Log de progresso

2026-10-26 — Responsável aprovou o Console SQL simplificado e autorizou iniciar pelo PH. S1 iniciado sem alteração remota.

2026-10-26 — S1 entregue localmente. Nova rota, navegação, editor, atalho, resultados, histórico de sessão e API foram implementados. Typecheck, lint afetado, 10/10 testes, build e `git diff --check` passaram. A execução real permanece desabilitada até S2.

2026-10-26 — Responsável aprovou S1, autorizou S2 e pediu Banco de dados como grupo de navegação, com Explorador e SQL Editor como subtelas. Correção incorporada ao S2.

2026-10-27 — Role compartilhada criada e validada localmente. Atributos sem administração de cluster, isolamento do database `postgres` e ownership dos objetos públicos do PH confirmados. Registry atualizado antes do ledger. HBA, referência privada no runtime e teste real permanecem pendentes.

2026-10-27 — Responsável decidiu simplificar para duas roles remotas: runtime por projeto e administração compartilhada da plataforma. O código do Explorador passou a reutilizar `prodexy_sistema_sql_executor` em sessão read-only; a role antiga de observação foi autorizada para remoção.

2026-10-27 — Responsável confirmou a remoção bem-sucedida da role e da regra HBA antigas. Registry atualizado antes do ledger. O bloco de infraestrutura está concluído; publicação e smoke test das duas telas permanecem sob responsabilidade do operador.

## Resultado final

Pendente até S2 e aceite final.
