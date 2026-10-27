# Explorador de bancos — acesso de observação PH

## Estado

O PH está integrado e validado. A política e os grants B3 foram aplicados manualmente em 2026-10-25: 13 tabelas/84 colunas autorizadas, bloqueios sensíveis preservados e aba Dados validada pelo responsável.

## Credencial

- Referência exata: `PRODEXY_SISTEMA_PH_OBSERVER_DB_PASSWORD`.
- Finalidade: senha exclusiva da role PostgreSQL `prodexy_sistema_ph_observer`, para a consulta de estrutura do database `prodexy_ph_outlet` pelo Prodexy Sistema.
- Destino local do valor: `D:\Prodexy\Prodexy-Sistema\.env`, arquivo privado e ignorado pelo Git. Em produção, variável server-side do projeto Prodexy Sistema na Vercel.
- Acesso ao valor: responsável e runtime server-side do Prodexy Sistema. Nunca enviar no chat, logs, commits, `NEXT_PUBLIC_*` ou documentação.
- A role runtime `prodexy_ph_outlet_app` e a senha dela não são utilizadas pelo explorador.

## 1. Provisionamento no DB Node — execução manual pelo responsável

Na sessão SSM da instância `prodexy-prod-db-node-01`, entre no `psql` local:

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres
```

Confira a ausência da role. O resultado esperado é `0 rows`:

```sql
SELECT rolname FROM pg_roles WHERE rolname = 'prodexy_sistema_ph_observer';
```

Se ela já existir, **pare** para conferir seu estado antes de qualquer `CREATE ROLE`. Se estiver ausente, execute:

```sql
CREATE ROLE prodexy_sistema_ph_observer
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  NOINHERIT CONNECTION LIMIT 2;
GRANT CONNECT ON DATABASE prodexy_ph_outlet TO prodexy_sistema_ph_observer;
ALTER ROLE prodexy_sistema_ph_observer SET default_transaction_read_only = on;
\q
```

Abra uma **nova** sessão `psql` no database PH. No Session Manager, execute cada comando interativo separadamente; não cole `\connect` ou `\password` junto com outras linhas:

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d prodexy_ph_outlet
```

Confira `SELECT current_database();` = `prodexy_ph_outlet`. Então execute **uma linha por vez**:

```sql
GRANT USAGE ON SCHEMA public TO prodexy_sistema_ph_observer;
GRANT SELECT ON TABLE public.migracoes_schema TO prodexy_sistema_ph_observer;
\password prodexy_sistema_ph_observer
ALTER ROLE prodexy_sistema_ph_observer LOGIN;
\q
```

O `\password` pede o valor interativamente sem incluí-lo no histórico do shell. Digite o mesmo valor que será armazenado em `PRODEXY_SISTEMA_PH_OBSERVER_DB_PASSWORD` no `.env` privado do Prodexy Sistema, sem enviá-lo ao agente. Nenhum `SELECT` é concedido sobre tabelas de negócio.

## 2. HBA — execução manual pelo responsável

Faça backup do arquivo e abra-o:

```bash
sudo cp -a /etc/postgresql/17/main/pg_hba.conf "/etc/postgresql/17/main/pg_hba.conf.pre-sistema-observer.$(date +%Y%m%d%H%M%S)"
sudo nano /etc/postgresql/17/main/pg_hba.conf
```

Adicione esta linha **logo abaixo** da regra existente de `prodexy_ph_outlet_app` e **antes** das rejeições remotas gerais:

```text
hostssl prodexy_ph_outlet prodexy_sistema_ph_observer 0.0.0.0/0 scram-sha-256
```

Não altere a regra runtime PH, rejeições finais, listener ou Security Group. O SG já possui 5432/IPv4 conforme D3; nenhuma nova porta é necessária.

Confira o parse e recarregue somente se não houver erro:

```bash
sudo -u postgres psql -X -P pager=off -d postgres -c "SELECT rule_number, type, database, user_name, address, auth_method, error FROM pg_hba_file_rules ORDER BY rule_number;"
sudo -u postgres psql -X -At -d postgres -c "SELECT pg_reload_conf();"
sudo systemctl is-active postgresql@17-main.service
```

O HBA deve mostrar a nova regra `hostssl` sem `error`, antes dos `reject`; `pg_reload_conf()` deve retornar `t`; o serviço deve permanecer `active`.

## 3. Pós-check de privilégios — sem valores privados

```bash
sudo -u postgres psql -X -P pager=off -d prodexy_ph_outlet -c "SELECT rolname, rolcanlogin, rolconnlimit, rolpassword LIKE 'SCRAM-SHA-256$%' AS scram_password_set FROM pg_authid WHERE rolname = 'prodexy_sistema_ph_observer'; SELECT has_database_privilege('prodexy_sistema_ph_observer', 'prodexy_ph_outlet', 'CONNECT') AS ph_connect, has_database_privilege('prodexy_sistema_ph_observer', 'postgres', 'CONNECT') AS postgres_connect; SELECT has_table_privilege('prodexy_sistema_ph_observer', 'public.migracoes_schema', 'SELECT') AS migrations_select, has_table_privilege('prodexy_sistema_ph_observer', 'public.lojas', 'SELECT') AS lojas_select, has_table_privilege('prodexy_sistema_ph_observer', 'public.usuarios', 'SELECT') AS usuarios_select;"
```

Esperado: `rolcanlogin=t`, `rolconnlimit=2`, `scram_password_set=t`, `ph_connect=t`, `postgres_connect=f`, `migrations_select=t`, `lojas_select=f`, `usuarios_select=f`. Se algo divergir, não configurar a aplicação ainda.

## 4. Conexão real e aplicação

Após os checks locais, teste de uma origem externa controlada com `psql`. A senha é digitada no prompt `-W`:

```bash
psql -X -W "host=db01.prodexylabs.com port=5432 dbname=prodexy_ph_outlet user=prodexy_sistema_ph_observer sslmode=verify-full sslrootcert=system" -c "SELECT current_database(), current_user, ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();"
```

Em `D:\Prodexy\Prodexy-Sistema\.env`, o responsável adiciona `PRODEXY_SISTEMA_PH_OBSERVER_DB_PASSWORD` com a mesma senha definida no PostgreSQL, sem aspas adicionais quando não necessárias. O código usa campos separados de conexão; não é preciso compor `DATABASE_URL` nem codificar caracteres especiais. Depois reinicie `npm run dev` e abra `/infraestrutura/bancos` com login administrativo real e `NEXT_PUBLIC_AUTH_ENABLED=true`.

O painel exibe tabelas, colunas, índices, constraints, migrations, consumo aproximado e linhas autorizadas. Antes de produção, configure a mesma referência como variável **server-side** no projeto Prodexy Sistema da Vercel e homologue com o DB Node ligado. Nenhum novo serviço ou mensalidade fixa de conectividade foi criado; as consultas usam a capacidade existente.

## 5. B3 — política de leitura de linhas

A interface continua sem SQL livre, escrita ou `COUNT(*)`. Cada consulta usa uma tabela e colunas fixas, até 100 linhas por página e no máximo 400 páginas. Busca e ordenação aceitam somente campos previstos na allowlist do código.

Colunas deliberadamente ocultadas:

- `usuarios.emissor_cognito` e `usuarios.sub_cognito`;
- `operacoes_estoque.chave_idempotencia` e `operacoes_estoque.impressao_requisicao`;
- `vendas.chave_idempotencia` e `vendas.impressao_requisicao`;
- `migracoes_schema.hash_sha256`.

As demais colunas das treze tabelas atuais ficam disponíveis somente ao administrador autenticado do Prodexy Sistema. A role continua `default_transaction_read_only=on`, sem `INSERT`, `UPDATE`, `DELETE` ou DDL.

### Grants aprovados e aplicados manualmente

Depois do aceite explícito, entrar no database PH como manutenção local e executar o bloco inteiro com `ON_ERROR_STOP=1`:

```sql
BEGIN;

REVOKE SELECT ON TABLE public.migracoes_schema FROM prodexy_sistema_ph_observer;

GRANT SELECT (versao, aplicada_em)
  ON public.migracoes_schema TO prodexy_sistema_ph_observer;
GRANT SELECT (id, nome, ativa, criada_em)
  ON public.lojas TO prodexy_sistema_ph_observer;
GRANT SELECT (id, nome_exibicao, perfil, ativo, criado_em)
  ON public.usuarios TO prodexy_sistema_ph_observer;
GRANT SELECT (usuario_id, loja_id, ativo)
  ON public.usuarios_lojas TO prodexy_sistema_ph_observer;
GRANT SELECT (loja_id, proximo_codigo)
  ON public.sequencias_categoria TO prodexy_sistema_ph_observer;
GRANT SELECT (id, loja_id, codigo, nome, tamanho, preco_centavos, arquivada_em, criada_em)
  ON public.categorias TO prodexy_sistema_ph_observer;
GRANT SELECT (categoria_id, loja_id, quantidade, atualizado_em)
  ON public.saldos_estoque TO prodexy_sistema_ph_observer;
GRANT SELECT (id, loja_id, autor_usuario_id, tipo, motivo, criada_em)
  ON public.operacoes_estoque TO prodexy_sistema_ph_observer;
GRANT SELECT (id, loja_id, autor_usuario_id, vendedor_usuario_id, total_centavos, realizada_em)
  ON public.vendas TO prodexy_sistema_ph_observer;
GRANT SELECT (id, venda_id, loja_id, categoria_id, codigo_registrado, nome_registrado, tamanho_registrado, preco_unitario_centavos, quantidade, total_linha_centavos)
  ON public.itens_venda TO prodexy_sistema_ph_observer;
GRANT SELECT (id, loja_id, categoria_id, autor_usuario_id, operacao_estoque_id, venda_id, variacao_quantidade, saldo_apos, motivo, criado_em)
  ON public.movimentos_estoque TO prodexy_sistema_ph_observer;
GRANT SELECT (id, loja_id, vendedor_usuario_id, nome, alvo_centavos, inicio_data, fim_data, versao, criada_por_usuario_id, atualizada_por_usuario_id, criada_em, atualizada_em)
  ON public.metas TO prodexy_sistema_ph_observer;
GRANT SELECT (id, meta_id, loja_id, vendedor_usuario_id, versao, nome, alvo_centavos, inicio_data, fim_data, tipo_alteracao, alterada_por_usuario_id, alterada_em)
  ON public.historico_metas TO prodexy_sistema_ph_observer;

COMMIT;
```

Este bloco não é migration do PH: ele altera somente privilégios da role de observação da plataforma. O rollback para o estado do B2 revoga os grants de linha e restaura somente a leitura da tabela de migrations:

```sql
BEGIN;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM prodexy_sistema_ph_observer;
GRANT SELECT ON TABLE public.migracoes_schema TO prodexy_sistema_ph_observer;
COMMIT;
```

## 6. Onboarding de outro database

Somente integrar um database que realmente exista:

1. registrar o projeto em `registry.ts` e a conexão server-side em `server/catalog.ts`;
2. criar uma role de observação exclusiva, read-only, com HBA específico e senha em uma referência server-side própria;
3. declarar as tabelas e colunas permitidas em `data-policy.ts`;
4. validar TLS, catálogo, linhas permitidas e negação de uma coluna não autorizada;
5. registrar primeiro no `RESOURCE_REGISTRY.md` e depois no `BUILD_LEDGER.md`.

Projetos financeiros não são conectados automaticamente. Cada integração usa pool máximo 1; o limite da role deve ser definido conforme a capacidade disponível no DB Node. O padrão não cria proxy, gateway ou mensalidade adicional.
