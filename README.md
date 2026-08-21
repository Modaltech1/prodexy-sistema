# Prodexy Labs Manager

Sistema interno de gestão da Prodexy Labs: financeiro por projeto, custos compartilhados, sociedade/distribuição de lucro, fechamentos mensais, metas, clientes/SaaS, demandas, tempo e pipeline comercial.

## Stack

- Next.js + React + TypeScript
- Supabase/PostgreSQL
- CSS próprio, sem dependência de framework visual
- ExcelJS para exportação XLSX
- Recorrências financeiras e de demandas

## 1. Instalação local

```bash
npm install
cp .env.example .env.local
```

Edite `.env.local`:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=COLE_A_SERVICE_ROLE_KEY_AQUI
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=COLE_A_PUBLISHABLE_KEY_AQUI
NEXT_PUBLIC_AUTH_ENABLED=false
NEXT_PUBLIC_APP_NAME=Prodexy Labs
```

> `SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente no servidor Next.js. Não crie uma variável `NEXT_PUBLIC_` para ela e não envie essa chave ao browser.

## 2. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor**.
3. Copie e execute todo o conteúdo de `schema.sql` (a mesma versão também está em `supabase/schema.sql`).
4. O script cria tabelas, índices, views, funções de fechamento, RLS e os dados iniciais conhecidos.

O schema já cria:

- Vale do Itaúnas
- Angel Cosméticos
- Oficina Mais
- Escolinha Pro
- relações de clientes conhecidas
- categorias financeiras iniciais
- participante interno `Prodexy Labs`
- metas legadas conhecidas de agosto/2026 a março/2027

Participações societárias e planos não são inventados; cadastre-os pelo sistema.

## 3. Rodar

```bash
npm run dev
```

Acesse `http://localhost:3000`.

Depois do `npm install`, rode também:

```bash
npm run check
```

Esse comando executa typecheck, lint e build de produção.

Para validar rapidamente banco + variáveis, abra `http://localhost:3000/api/health`.

## 4. Ativar o login interno

Em um banco existente, execute primeiro as migrations pendentes em `supabase/migrations`, nesta ordem:

```text
20260813_add_managed_user_access.sql
20260813_zz_add_access_management_fields.sql
20260821_add_saas_billing_cycles.sql
20260821_allow_partial_shared_cost_allocations.sql
```

Crie o primeiro administrador antes de ativar a proteção. Este bootstrap é executado localmente e usa a `service_role`; ele não cria uma tela pública de cadastro. No PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@exemplo.com"
$env:ADMIN_PASSWORD="Uma-senha-inicial-forte-2026"
$env:ADMIN_NAME="Seu nome"
npm run auth:create-admin
Remove-Item Env:ADMIN_PASSWORD
```

Depois do sucesso, altere `NEXT_PUBLIC_AUTH_ENABLED=true` e reinicie o servidor ou refaça o deploy. A flag existe para impedir bloqueio acidental durante a migração; em produção ela deve permanecer habilitada.

Não existe signup público. Depois da ativação, acessos de sócio são criados e administrados em **Configurações → Acessos**. Cada login fica vinculado a um registro externo de `partners` que já possua participação vigente em pelo menos um projeto. O mesmo parceiro pode participar de vários projetos sem receber contas duplicadas.

A interface permite editar o parceiro representado, desativar/reativar o acesso e gerar uma nova senha temporária. Desativação não apaga identidade, participação societária nem histórico financeiro.

O sócio entra em `/portal`, uma área somente leitura com relatório por competência e projeto. Meses em andamento mostram uma estimativa calculada sobre os valores atuais; meses fechados mostram exclusivamente os snapshots de `monthly_closings` e `closing_distributions`. O servidor descobre os projetos pelo parceiro da sessão e não aceita um projeto arbitrário enviado pelo navegador.

## 5. Deploy na Vercel

1. Suba este projeto para o Git.
2. Importe o repositório na Vercel.
3. Cadastre as mesmas variáveis de `.env.local` em **Project Settings → Environment Variables**.
4. Faça o deploy.

## 6. Recorrências

Em **Configurações → Recorrências** você pode cadastrar receitas/custos periódicos. Ao clicar em **Gerar vencidas agora**, o sistema cria lançamentos como `Previsto`; nada é considerado recebido/pago sem você marcar a realização. Custos compartilhados recorrentes podem armazenar o rateio por projeto e geram a despesa original + alocações gerenciais sem duplicação no consolidado.

## 7. Importar a planilha antiga (opcional)

Depois de criar o banco e configurar `.env.local`:

```bash
npm run import:financeiro -- "/caminho/Financeiro Prodexy.xlsx" --dry-run
```

Se a simulação estiver correta:

```bash
npm run import:financeiro -- "/caminho/Financeiro Prodexy.xlsx"
```

O importador:

- ignora abas de resumo;
- importa Vale do Itaúnas, Escolinha Pro e Oficina Mais para seus respectivos projetos;
- importa a aba `Prodexy` como holding, sem adivinhar a qual projeto cada linha pertence;
- ignora a antiga destinação pessoal de 10%;
- usa `external_reference` para evitar duplicar linhas ao executar novamente.

Depois da importação, revise principalmente os lançamentos da antiga aba `Prodexy` e reclassifique para projetos quando necessário.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run auth:create-admin
npm run import:financeiro -- "/arquivo.xlsx"
```

## Competência x caixa

O financeiro possui duas leituras:

- **Competência**: usa o mês econômico do lançamento e é a base do fechamento societário.
- **Caixa realizado**: usa `realized_at` para mostrar o que efetivamente entrou/saiu no período.

A distribuição oficial de lucro é gerada pelo fechamento por competência. A visão de caixa é gerencial.

## Regra financeira central

```text
Receita bruta
- taxas financeiras
= receita líquida

Receita líquida
- custos diretos
- custos compartilhados alocados
= lucro líquido do projeto

Lucro líquido positivo
→ distribuição societária
→ parcela Prodexy + parcelas dos sócios externos
```

Distribuição de sócio **não é custo operacional**. Prejuízo não gera distribuição positiva.

Custos compartilhados são registrados uma vez. As alocações servem apenas para distribuir o custo gerencialmente entre projetos; o consolidado não soma o custo original novamente.

## Segurança de acesso

O sistema usa Supabase Auth com sessão em cookies e dois papéis fechados: `admin` e `partner`. Para não colocar uma chave privilegiada do Supabase no navegador:

- todas as leituras/escritas passam por Route Handlers do Next.js;
- a `service_role` fica apenas no servidor;
- as tabelas públicas têm RLS habilitado e acesso `anon/authenticated` revogado;
- `proxy.ts` renova a sessão e separa as áreas administrativa e do sócio;
- cada Route Handler administrativo também valida o perfil ativo no banco;
- senha temporária exige troca antes do primeiro acesso aos dados;
- não há signup público nem acesso direto do browser às tabelas.

## Arquivos importantes

- `schema.sql` — banco completo para o SQL Editor
- `supabase/schema.sql` — cópia organizada do schema
- `src/lib/server-finance.ts` — consolidação financeira
- `src/lib/partner-report/service.ts` — relatório financeiro autorizado do sócio
- `src/app/api/partner/report/route.ts` — leitura exclusiva do portal do sócio
- `src/app/api/closings/route.ts` — fechamento/reabertura
- `src/app/api/shared-costs/route.ts` — custos compartilhados
- `src/lib/saas-billing/service.ts` — ciclos mensais idempotentes das assinaturas SaaS
- `src/app/api/saas/billing/sync/route.ts` — sincronização por calendário das mensalidades
- `src/app/api/work-plan/route.ts` — priorização determinística da sessão de trabalho
- `scripts/import-financeiro.ts` — importador opcional da planilha legada
- `docs/ARCHITECTURE.md` — decisões arquiteturais e regras
- `docs/TESTING.md` — roteiro de smoke test antes de começar a usar dados reais

## Observação sobre o primeiro uso

Antes de lançar dados reais em volume, cadastre as participações de cada projeto em **Configurações / projeto → Sócios**, confirme que totalizam 100% e faça um fechamento de teste. A tela **Financeiro → Conferência** foi criada justamente para comparar os resultados com sua planilha durante a transição.
