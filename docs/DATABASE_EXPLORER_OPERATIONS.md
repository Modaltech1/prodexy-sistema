# Banco de dados — operação administrativa

## Estado

O PH está integrado ao Prodexy Sistema. O Explorador e o SQL Editor usam a mesma role administrativa compartilhada, `prodexy_sistema_sql_executor`, por pools server-side separados.

## Credencial

- Referência: `PRODEXY_SISTEMA_SQL_EXECUTOR_DB_PASSWORD`.
- Destino local: `.env` privado do Prodexy Sistema.
- Destino publicado: variável server-side do projeto na Vercel.
- Acesso ao valor: responsável e runtime server-side.
- O valor nunca vai para o browser, documentação ou `NEXT_PUBLIC_*`.

## Funções

- `/infraestrutura/bancos`: catálogo e dados; a conexão força `default_transaction_read_only=on`.
- `/infraestrutura/sql`: SQL administrativo informado pelo responsável.
- A role runtime `prodexy_ph_outlet_app` continua exclusiva da aplicação PH.
- A role antiga `prodexy_sistema_ph_observer` foi substituída e deve permanecer ausente após a remoção operacional autorizada.

## Onboarding de outro database

1. Autorizar `prodexy_sistema_sql_executor` no database e no HBA com TLS/SCRAM.
2. Registrar o database nos adapters server-side do Explorador e do SQL Editor.
3. Configurar a política de apresentação das tabelas no Explorador.
4. Validar conexão, catálogo, leitura e SQL Editor.
5. Registrar primeiro no `RESOURCE_REGISTRY.md` e depois no `BUILD_LEDGER.md`.

Cada database mantém sua própria role runtime. Não é necessária uma nova role de observação para cada projeto.
