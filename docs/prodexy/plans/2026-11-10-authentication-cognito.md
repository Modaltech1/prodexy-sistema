# ExecPlan — Prodexy Sistema — administração central do Cognito

## Status

IN_PROGRESS. Blocos A e B validados. Credencial do Bloco C criada e armazenada; publicação e homologação real permanecem com o Responsável.

## Standard version

2.0.0

## Motivação

O Responsável precisa administrar, em uma única interface interna, os usuários Cognito dos projetos atuais e futuros da Prodexy, com experiência próxima ao Authentication do Supabase e sem acessar o Console AWS para operações rotineiras.

## Estado atual observado

- O Prodexy Sistema usa Next.js App Router e já possui gate administrativo server-side em `src/lib/auth/access.ts`.
- A identidade IAM `prodexy-prod-sistema-cognito-admin` está validada, cobre `userpool/*` da conta Prodexy em `us-east-1` e possui uma única access key ativa para o runtime server-side.
- As referências privadas são `PRODEXY_SISTEMA_COGNITO_AWS_ACCESS_KEY_ID` e `PRODEXY_SISTEMA_COGNITO_AWS_SECRET_ACCESS_KEY`; a região é `PRODEXY_SISTEMA_COGNITO_REGION=us-east-1`. O Responsável confirmou o armazenamento no `.env` local não versionado e na Vercel.
- Não existe módulo de administração Cognito no código atual.

## Estado alvo

Área `Infraestrutura / Authentication` exclusivamente administrativa, com seleção explícita do User Pool, listagem e busca de usuários, detalhes e operações administrativas permitidas pela policy IAM. Todas as chamadas AWS são server-side; nenhuma credencial ou SDK AWS chega ao browser.

## Escopo

- Descoberta dos User Pools cadastrados na conta e região autorizadas.
- Listagem, busca e leitura resumida dos usuários por pool.
- Em blocos posteriores: criação, atributos, habilitação/bloqueio, senha, encerramento de sessões e exclusão.
- Interface inspirada no fluxo do Supabase, limitada às capacidades reais do Cognito e da policy existente.

## Fora do escopo

- Criar ou alterar User Pools, App Clients, domínios, grupos ou IAM.
- Login das aplicações clientes, migração de Auth ou mudanças em projetos filhos.
- Deploy, criação de access key e homologação em produção neste bloco.

## Invariantes

- Somente `requireAdmin()` com Auth real habilitado acessa API e interface.
- O browser nunca recebe credenciais AWS.
- O usuário escolhe explicitamente o pool antes de consultar usuários.
- Erros não expõem secrets, stack traces ou respostas integrais do SDK.
- Cada bloco para para validação do Responsável.

## Impacto arquitetural

- Código: novo feature module server-side e página administrativa.
- Dados: nenhuma migration ou persistência local.
- Auth: administração de usuários Cognito; não altera o login do Prodexy Sistema.
- UI: nova entrada em Infraestrutura e workspace de pools/usuários.
- Runtime: cliente AWS SDK v3 exclusivamente server-side.
- Infraestrutura: nenhuma mudança neste bloco.

## Arquivos e módulos afetados

- `src/features/cognito-admin/*`
- `src/app/api/infraestrutura/authentication/*`
- `src/app/infraestrutura/authentication/*`
- `src/components/app-shell.tsx`
- `src/app/globals.css`
- `tests/cognito-admin.test.mjs`

## Marcos de implementação

### Bloco A — leitura administrativa local

- [x] Registrar contratos e cliente Cognito server-side com credenciais explícitas.
- [x] Criar API protegida para listar pools e usuários.
- [x] Criar interface com seleção explícita de pool, busca e tabela de usuários.
- [x] Adicionar navegação e estados de credencial ausente/erro/vazio.
- [x] Executar testes, typecheck, lint afetado e `git diff --check`.
- [ ] Responsável valida visualmente e autoriza somente o Bloco B.

### Bloco B — mutações administrativas

- [x] Criar/editar usuário, habilitar/bloquear, definir/redefinir senha, encerrar sessões e excluir com confirmações proporcionais ao risco.
- [x] Testar validação de payload, pool inválido, ações e erros do Cognito.
- [x] Organizar usuários pelo mesmo cadastro explícito de projeto/database usado no Explorador e SQL Editor, resolvendo o User Pool somente no servidor.
- [x] Responsável valida localmente e autoriza somente o Bloco C.

### Bloco C — credencial e homologação

- [x] Agente Coordenador cria uma única access key após a implementação server-side estar aceita.
- [x] Responsável armazena os valores somente nas referências privadas aprovadas.
- [ ] Responsável publica e homologa; nenhum valor é enviado por chat ou documentado.

## Migrations e dados

Não aplicável. O módulo consulta e administra o Cognito por API; não cria schema nem migration.

## Segurança e Auth

Credenciais explícitas evitam herdar uma identidade AWS inesperada. A API exige administrador real e `Cache-Control: private, no-store`. A policy IAM existente limita recursos a User Pools da conta `130854680883` em `us-east-1` e não permite configurar os pools.

## Testes e quality gates

Testar normalização de atributos, busca, ausência de credencial, isolamento por pool e gate administrativo. Executar testes focados, `npm run typecheck`, ESLint dos arquivos afetados e `git diff --check`. Build seguro e homologação real permanecem separados.

## Rollback

Remover rota, página e navegação. Como o Bloco A não cria credencial nem altera AWS, o rollback é somente de código.

## Evidências de conclusão

Arquivos alterados, testes aprovados e validação visual do Responsável. Não alegar integração AWS real antes da credencial e homologação.

## Atualização documental

Atualizar este ExecPlan. Após homologação, atualizar README/operação local; metadados AWS permanecem no registry e ledger da plataforma.

## Decisões em aberto

- Bloco B depende do aceite visual do Bloco A.
- A access key depende do aceite do código server-side e de autorização específica.

## Log de progresso

2026-11-10 — Responsável confirmou que o Authentication é responsabilidade transversal do Agente Coordenador e autorizou o início. Bloco A aberto; nenhuma credencial ou operação AWS executada.

2026-11-10 — Bloco A concluído localmente com cliente AWS SDK v3 server-side, API administrativa, seleção explícita de User Pool, busca e tabela de usuários. Explorador também corrigido para abrir tabelas em Dados por padrão. Testes do explorador 18/18 e do Cognito 2/2, typecheck, ESLint afetado e `git diff --check` passaram. Nenhuma access key, operação AWS ou publicação foi executada.

2026-11-10 — Responsável autorizou a continuação e o Bloco B foi concluído localmente. API e interface agora cobrem convite, edição de e-mail, senha temporária/permanente, redefinição, bloqueio/reativação, encerramento global de sessões e exclusão. Payloads são validados antes do SDK, pools são reconferidos no inventário e erros AWS são sanitizados. Testes Cognito 4/4 e do explorador 18/18, typecheck, ESLint afetado e `git diff --check` passaram. Nenhuma chamada AWS, access key ou publicação foi executada.

2026-11-10 — Responsável aceitou o Bloco B, autorizou continuação e solicitou separação por database. Authentication passou a exigir seleção explícita no mesmo formato das demais telas: PH Outlet vinculado ao pool compartilhado de projetos dedicados e Oficina Mais ao pool próprio do produto. O browser envia somente o ID cadastrado do projeto; database e User Pool são resolvidos no servidor. Testes Cognito 5/5, explorador 18/18, typecheck, ESLint afetado e `git diff --check` passaram. A AWS CLI 2.39.5 está instalada, mas a sessão temporária expirou; Bloco C aguarda autorização específica para `aws login`.

2026-11-10 — Responsável autorizou explicitamente uma única access key persistente. A sessão AWS foi autenticada na conta `130854680883`; a chave foi criada para `prodexy-prod-sistema-cognito-admin`, sem exibição dos valores, e a releitura sanitizada confirmou uma chave `Active`. O Responsável confirmou o armazenamento no `.env` local e na Vercel. O arquivo privado e sua pasta temporária foram removidos e a ausência de ambos foi validada. Publicação e homologação real permanecem pendentes.

## Resultado final

Blocos A e B concluídos e validados. No Bloco C, credencial criada, armazenada e artefato temporário removido; faltam publicação e homologação real pelo Responsável.
