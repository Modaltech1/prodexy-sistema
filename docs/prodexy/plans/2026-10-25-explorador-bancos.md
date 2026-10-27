# ExecPlan — Prodexy Sistema — explorador de bancos dos projetos

## Status

IN_PROGRESS. B1–B4 aceitos pelo responsável. Correções visuais pós-aceite entregues localmente e aguardando validação. Publicação não foi solicitada.

## Standard version

2.0.0 (`D:\Prodexy\platform.yaml`).

## Motivação

O responsável precisa consultar visualmente os bancos dos projetos, suas tabelas, colunas e dados de consulta, sem repetir comandos SSM para inspeções cotidianas. A interface de referência é o Table Editor do Supabase; a implementação deve manter a identidade visual do Prodexy Sistema e não copiar operações privilegiadas da referência.

## Estado atual observado

- O Prodexy Sistema usa Next.js App Router, Supabase Auth e Supabase como banco próprio; `src/lib/auth/access.ts` define `requireAdmin()`, mas a flag de bootstrap `NEXT_PUBLIC_AUTH_ENABLED=false` cria acesso administrativo legado. Este módulo deve falhar fechado quando a flag estiver desligada.
- A navegação administrativa fica em `src/components/app-shell.tsx`; não há explorador de PostgreSQL AWS ou conexão de observação instalada.
- `D:\Prodexy\Prodexy-Ph-Outlet` usa o database AWS `prodexy_ph_outlet`; o responsável apresentou evidências de migrations aplicadas. Não há credencial de observação para o Prodexy Sistema, nem permissão deste sistema para usar a role runtime PH ou `postgres`.
- O cadastro financeiro `projects` não é um inventário confiável de databases. Associação com banco deve ser explícita; ausência de integração aparece como tal.
- Branch `main`; working tree já contém alterações do usuário, inclusive arquivo privado não versionado. Preservá-las. Não ler `.env` ou valores privados.

## Estado alvo

Área administrativa **Infraestrutura → Bancos** com seleção de projeto/database, busca de tabelas, abas **Dados** e **Estrutura**, paginação e ordenação de leitura, índice de migrations e indicadores proporcionais de consumo. Apenas databases explicitamente registrados e provisionados ficam consultáveis. O browser recebe somente dados autorizados e nunca uma credencial ou SQL livre.

## Escopo

- Bancos PostgreSQL AWS de projetos integrados, iniciando por PH Outlet; inventário explícito que cresce por onboarding.
- Catálogo de schemas/tabelas/colunas/índices/constraints, versão de migration quando o projeto possuir controle conhecido, tamanho de banco/tabelas e linhas aproximadas quando disponível.
- Prévia paginada de registros em leitura, com ordenação/filtros controlados e limite de volume; tratamento explícito de colunas sensíveis antes de liberar dados reais.
- Admin interno somente; estado indisponível/sem integração distinto de banco vazio.

## Fora do escopo

- SQL editor, DDL/DML, Insert/Update/Delete, aplicação de migrations, alteração de grants, restore, criação de database ou role pela interface.
- Conectar automaticamente todos os projetos financeiros ou usar credenciais `postgres`, service role Supabase ou runtime de outros aplicativos.
- Migração do próprio Prodexy Sistema para AWS, mudança de Auth ou substituição do fluxo manual de aplicação de migrations.
- Garantia de disponibilidade do DB Node DIURNO fora do horário em que estiver ligado.

## Invariantes

- Um bloco por vez; ao fim atualizar checks e parar. Aceite do bloco e liberação do seguinte são distintos.
- Ações de consulta exigem `requireAdmin()` **e** Auth habilitado; nunca herdar o bypass de bootstrap como autorização para o explorador.
- Credenciais apenas server-side, TLS com validação completa, SCRAM, role de observação com privilégio mínimo, HBA explícita por database/role. Nenhum acesso ao banco via browser.
- Queries de exploração devem ser somente leitura, limitadas, parametrizadas quando aplicável; nomes de objeto vêm de catálogo autorizado, não de SQL arbitrário do browser.
- Não exibir secrets, hashes de senha, tokens ou linhas sensíveis por padrão. Não afirmar migration aplicada somente pela presença de arquivo local.
- Não alterar projeto PH nem Supabase atual neste plano. Infraestrutura AWS fica com Platform Agent/responsável e registry → ledger.

## Impacto arquitetural

- Código: nova feature local de inventário e exploração; rotas administrativas e adapter PostgreSQL isolado.
- Dados: nenhuma migration no Prodexy Sistema no B1; posterior integração lê metadados e dados autorizados do banco PH, sem escrita.
- Auth: reaproveita admin interno, com bloqueio explícito quando o bootstrap sem Auth está ativo.
- UI: rota administrativa nova, adaptada ao design existente e responsiva.
- Runtime: futura conexão PostgreSQL server-side na Vercel, pool pequeno e timeouts; verificar orçamento do DB Node antes de homologar.
- Infraestrutura: bloco separado para provisionar acesso de observação sem novo gateway ou mensalidade fixa; registrar role, HBA e referência do secret sem valor.

## Arquivos e módulos afetados

- B1: `src/components/app-shell.tsx`, `src/app/infraestrutura/bancos/`, `src/app/api/infraestrutura/bancos/`, `src/features/database-explorer/`, `src/app/globals.css`, documentação local.
- B2+: adapter `pg`, configuração server-only, testes e documentação operacional. Paths concretos serão registrados quando implementados.

## Marcos de implementação

### B1 — contrato, inventário não secreto e interface local (bloco atual)

- [x] Inventário explícito inicial do PH, sem credenciais e sem falsa indicação de conexão ativa (`registry.ts`).
- [x] API GET de inventário, somente admin com Auth habilitado; sem consulta remota (`/api/infraestrutura/bancos`).
- [x] Tela responsiva inspirada na navegação do Supabase: projeto → tabelas → Dados/Estrutura; estados de conexão pendente, vazio e erro honestos; nenhuma operação de escrita (`/infraestrutura/bancos`).
- [x] Checks locais disponíveis: `typecheck` passou, ESLint nos arquivos alterados passou, 3/3 testes do inventário passaram, `git diff --check` passou. O gate administrativo foi revisado no código, mas não testado por HTTP real. O lint global do repositório falha em 133 erros preexistentes fora do módulo. Build/QA visual não executados porque Next carregaria `.env` privado; faltam validações isoladas antes de deploy.
- [x] Execução local de B1 concluída e evidenciada; nenhuma integração real ou deploy.
- [x] Validação do responsável de B1 recebida em 2026-10-25.
- [x] Autorização explícita de B2 recebida em 2026-10-25.

### B2 — acesso de observação e catálogo real do PH

- [x] Role `prodexy_sistema_ph_observer`, grants mínimos, HBA e referência `PRODEXY_SISTEMA_PH_OBSERVER_DB_PASSWORD` implementados manualmente e evidenciados. Registry atualizado antes do ledger.
- [x] Adapter `pg` server-side com TLS validado, pool máximo 1, timeouts e database PH fixo; conexão TLS 1.3 real validada.
- [x] Consultas fixas de catálogo público, colunas, índices, constraints e migrations validadas no PH real. Nenhuma linha de negócio é consultada; tentativa em `lojas` foi negada pela role.
- [x] API diferencia integração não configurada e DB Node indisponível sem enviar erro bruto ao browser.
- [x] Navegação geral recolhida inicialmente; seletor de projeto/database movido para o topo, títulos redundantes removidos, migrations recolhidas e largura priorizada para tabelas/estrutura.
- [x] Responsável criou role/senha, concedeu apenas `SELECT` em `migracoes_schema`, adicionou HBA e enviou pós-checks sem segredo; TLS externo, read-only, catálogo/migrations e negação de tabela de negócio validados.
- [x] Responsável configurou a referência privada no runtime; tela autenticada exibiu conexão e catálogo PH reais.
- [x] RESOURCE_REGISTRY atualizado e, depois, BUILD_LEDGER atualizado com a evidência dos recursos reais.
- [x] Execução técnica e revisão visual validadas pelo responsável em 2026-10-25.
- [x] Autorização explícita de B3 recebida em 2026-10-25.

### B3 — aba Dados e consumo

- [x] Política de dados sensíveis/allowlist preparada, documentada e aprovada pelo responsável em 2026-10-25.
- [x] Grants por coluna aplicados manualmente: 11 tabelas/60 colunas; bloqueios de Cognito, idempotência e hash de migration confirmados.
- [x] `metas` e `historico_metas`, criadas depois da política inicial, adicionadas à allowlist e liberadas por grants incrementais.
- [x] Prévia read-only implementada localmente com até 100 linhas, limite de 400 páginas, busca e ordenação por allowlist; sem SQL livre, escrita ou `COUNT(*)`. Sem grants, a UI informa acesso ainda não autorizado.
- [x] Tamanho do database/tabelas e estimativa de linhas preparados via catálogos PostgreSQL, sem varrer tabelas. Homologação real desses indicadores pendente.
- [x] Testes locais de allowlist, injeção e limites passaram; QA real da aba Dados concluído pelo responsável após correção do consumo da API.
- [x] Execução validada e B4 autorizado pelo responsável.

### B4 — expansão e operação

- [x] Onboarding explícito documentado; registro público, conexão server-side e política por projeto separados. Projetos financeiros nunca geram conexão automática.
- [x] Adapter generalizado por `projectId`; projeto desconhecido e política de outro projeto são recusados em testes. Um segundo database real não foi inventado para simular homologação.
- [x] Consumo aproximado visível por database/tabela; runbook atualizado. Pool máximo 1 por integração e nenhum novo serviço ou mensalidade fixa.
- [ ] Homologação antes de deploy; publicação exige autorização separada.
- [x] Aceite final de B4 e do explorador recebido em 2026-10-25.

### Correções visuais pós-aceite

- [x] Controle de expandir/recolher a navegação lateral disponível em todas as telas desktop.
- [x] Lista de tabelas com rolagem independente e seção Migrations sempre acessível no rodapé.
- [x] Filtro de dados estruturado por coluna, operador e valor; entradas continuam validadas pela allowlist server-side.
- [x] Validação visual do responsável recebida em 2026-10-26.

## Migrations e dados

B1 não prepara nem aplica migration. B2 requer alterações de role/grants/HBA executadas pelo responsável sob orientação do Platform Agent; não são migrations de negócio do PH. B3 não poderá ler linhas até política explícita de colunas/tabelas sensíveis. Qualquer migration futura do próprio Prodexy Sistema é preparada pelo executor, aplicada manualmente pelo responsável e validada antes das etapas dependentes; não executar `schema.sql` em banco existente.

## Segurança e Auth

O proxy atual pode permitir acesso legado quando Auth está desabilitado; o explorador deve negar API nesse estado. Admin real é validado na rota server-side, não apenas no menu. Identificadores de database/tabela não viram SQL sem lookup no inventário/catálogo permitido. Sem cache de dados sensíveis no browser/service worker, logs ou HTML estático. Configuração privada fica em runtime server-side, não `NEXT_PUBLIC_*`.

## Testes e quality gates

`npm run typecheck`, `npm run lint`, `npm run build`; testes específicos com `node:test`/`tsx` ou ferramenta existente, sem tocar serviços externos por padrão. Testes locais não equivalem à homologação real do PH. O build não deve ler `.env` privado por conveniência; usar ambiente seguro isolado quando necessário. Testar role `partner`, Auth desligado, projeto não registrado, SQL injetado e erro de conexão antes de deploy.

No B1: `npm run test:database-explorer` (Node `node:test`) passou 3/3; `npm run typecheck` passou; ESLint somente dos arquivos do módulo e nav passou. `npm run lint` global falha em código preexistente (133 erros, 15 avisos) e não foi tratado por estar fora do bloco. Build, testes da rota HTTP com Auth real e QA visual em navegador ficam pendentes antes de publicação, sem afetar o gate B2 de implementação local.

## Rollback

B1: retirar a rota/nav/API local em revisão reversível; nenhum banco muda. B2: revogar a role de observação/HBA e desativar referência de secret após validação; nunca afetar role runtime PH. B3: desligar consulta de linhas por configuração server-side e manter catálogo, sem alterar dados. Infraestrutura exige operação separada autorizada.

## Evidências de conclusão

Checks por bloco, arquivos alterados, resultados de testes, screenshots da UI, evidência não secreta de conexão/autorizações e pós-checks. Não marcar integração real, migrations, deploy ou conexão com todos os projetos antes de prova.

## Atualização documental

Este ExecPlan é o checklist canônico. Atualizar `README.md`/`docs/ARCHITECTURE.md`/runbook local somente conforme blocos concluídos. Recursos AWS concretos: `D:\Prodexy\docs\platform\aws\RESOURCE_REGISTRY.md`, depois `BUILD_LEDGER.md`.

## Decisões em aberto

- Publicação e homologação em produção dependem de bloco e autorização separados.
- Novos databases serão integrados individualmente quando existirem na AWS; não fazem parte deste plano concluído.

## Log de progresso

2026-10-25 — Responsável autorizou construção do módulo no Prodexy Sistema e forneceu referência visual do Supabase. Plano dividido em quatro blocos com parada obrigatória. Branch e working tree lidos sem alterar mudanças preexistentes; estado real Supabase e ausência de integração AWS observados. B1 entregou rota/UI/admin gate/inventário PH com status pendente. Typecheck, lint dos arquivos afetados, 3/3 testes e diff check passaram; lint global tem falhas anteriores e build seguro/QA visual aguardam contexto apropriado. Nenhum acesso remoto, secret, migration ou deploy.

2026-10-25 — Responsável aceitou B1, autorizou B2 e pediu navegação lateral recolhida e mais espaço no explorador. Código local de B2, UI e procedimento manual preparados. Sem AWS CLI neste ambiente e sem credencial de observação, nenhuma role/HBA/secret foi criada ou conexão real testada. B3 permanece fechado.

2026-10-25 — Role de observação, HBA, TLS/read-only, catálogo real e negação de dados de negócio foram evidenciados; registry e ledger atualizados na ordem canônica. Após QA do responsável, a interface foi simplificada para um seletor compacto de projeto/database no topo, lista única de tabelas, migrations recolhidas e painel principal ampliado. Typecheck, ESLint do arquivo alterado, 5/5 testes do explorador e `git diff --check` passaram. B2 aguarda somente validação visual; B3 não foi iniciado.

2026-10-25 — Responsável aceitou B2 e autorizou B3. Viewer local de linhas, paginação, busca, ordenação, tamanho e estimativa foram preparados. Allowlist exclui identidade Cognito, chaves de idempotência, hashes de impressão e hash de migration; grants PostgreSQL permanecem não executados até aceite específico. Typecheck, ESLint dos arquivos do B3, 7/7 testes e `git diff --check` passaram. B4 não foi iniciado.

2026-10-25 — Responsável aprovou a política de leitura B3 e autorizou os grants propostos. Execução permanece manual e ainda não foi alegada como aplicada.

2026-10-25 — Responsável confirmou aplicação: 11 tabelas/60 colunas autorizadas e três checks sensíveis retornaram `f`. RESOURCE_REGISTRY foi atualizado e, depois, BUILD_LEDGER. Falta apenas validar a aba Dados com a aplicação local; B4 permanece fechado.

2026-10-25 — QA visual revelou que o frontend descartava a resposta da API por tipagem genérica incorreta; correção aplicada. O catálogo real também revelou `metas` e `historico_metas`, posteriores à política inicial; ambas foram adicionadas à allowlist local e aguardam grants incrementais. Typecheck, ESLint afetado, 7/7 testes e diff check passaram.

2026-10-25 — Responsável confirmou funcionamento e autorizou continuidade. B4 generalizou o adapter por projeto sem cadastrar recurso fictício, adicionou lookup isolado, documentou onboarding e consolidou operação/capacidade. Typecheck, ESLint afetado, 8/8 testes e diff check passaram. Nenhum deploy foi realizado.

2026-10-25 — Responsável aceitou B4 e solicitou três correções de usabilidade. Toggle lateral global, rolagem independente com Migrations fixo e filtro estruturado foram implementados. Typecheck, ESLint afetado, 9/9 testes e diff check passaram. Aguarda apenas validação visual; nenhum deploy ou migration.

2026-10-26 — Responsável validou visualmente as correções. B1–B4 e o bloco corretivo estão concluídos localmente. O explorador foi encerrado sem migration e sem deploy; publicação e homologação em produção permanecem uma atividade separada.

## Resultado final

CONCLUÍDO LOCALMENTE — explorador conectado ao database PH, com catálogo, estrutura, dados autorizados, consumo aproximado, filtro estruturado e navegação validada. Nenhuma migration foi necessária. Publicação e homologação em produção não foram executadas.
