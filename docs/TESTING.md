# Smoke test — Prodexy Labs Manager

Execute depois de configurar o Supabase e o `.env.local`.

## Qualidade técnica

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run dev
```

Confirme `GET /api/health` retornando banco conectado.

## Acesso

1. Execute `20260813_add_managed_user_access.sql` e `20260813_zz_add_access_management_fields.sql`, nesta ordem, e crie o administrador com `npm run auth:create-admin`.
2. Ative `NEXT_PUBLIC_AUTH_ENABLED=true` e reinicie o servidor.
3. Sem sessao, confirme que uma pagina administrativa redireciona para `/login` e uma API administrativa retorna `401`.
4. Entre como administrador e confirme acesso as telas e APIs atuais.
5. Em um login de socio com senha temporaria, confirme o redirecionamento obrigatorio para `/alterar-senha`.
6. Confirme que o socio acessa `/portal`, nao acessa telas administrativas e nao consegue executar APIs administrativas.
7. Desative o perfil em `app_users` e confirme que uma nova requisicao de API e recusada.
8. Em Configuracoes / Acessos, confirme que a tela orienta cadastrar o socio e vincula-lo a um projeto quando ainda nao houver candidato elegivel.
9. Crie um sublogin para um socio externo ativo, com participacao vigente e ainda sem login.
10. Confirme que um socio sem participacao vigente nao pode receber um acesso pela API.
11. Confirme que o mesmo socio enxerga todos os projetos com participacao vigente, sem cadastrar o acesso novamente.
12. Redefina a senha e confirme a troca obrigatoria no proximo login.
13. Desative e reative o acesso; confirme que nenhuma participacao ou distribuicao financeira foi removida.

## Portal do socio

1. Entre com um acesso `partner` vinculado a dois projetos e confirme que apenas esses projetos aparecem em `/portal`.
2. Consulte uma competencia aberta com composicao total de 100% e confira a estimativa: `max(lucro, 0) x percentual do socio`.
3. Deixe a composicao de um projeto aberto diferente de 100% e confirme que a parcela positiva fica indisponivel, sem valor parcial enganoso.
4. Consulte um projeto com prejuizo e confirme parcela do socio igual a zero.
5. Feche uma competencia e confirme que o portal usa os valores e o percentual do snapshot, inclusive depois de alterar a participacao futura.
6. Marque a distribuicao como paga e confira o status no portal.
7. Tente abrir uma API administrativa com o login de socio e confirme `403`.
8. Tente chamar `/api/partner/report` como administrador e confirme `403`.
9. Confirme que `/api/partner/report` nao aceita `project_id` e nunca retorna projetos de outro socio.
10. Valide o portal em 390 px e 1280 px, sem rolagem horizontal, sobreposicao ou controles de escrita.

## Financeiro

1. Cadastre uma receita recebida de R$ 1.000 em um projeto, sem taxa.
2. Cadastre custo direto pago de R$ 100 no mesmo projeto.
3. Cadastre custo compartilhado pago de R$ 200 e distribua 50% para esse projeto e 50% para outro.
4. No projeto testado, o lucro deve considerar R$ 1.000 - R$ 100 - R$ 100 = R$ 800.
5. No consolidado, o custo compartilhado original deve continuar sendo R$ 200, nunca R$ 400.
6. Cadastre participantes somando 100%, por exemplo 60% Prodexy e 40% sócio externo.
7. Feche o mês. Para lucro de R$ 800, o snapshot deve distribuir R$ 480 / R$ 320.
8. Altere a participação vigente futura e confirme que o fechamento antigo não muda.
9. Marque a distribuição externa como paga.
10. Reabertura deve ser bloqueada se houver distribuição externa paga.

## Prejuízo

1. Use um projeto/mês com receita líquida menor que os custos.
2. Feche o mês.
3. Confirme que nenhuma obrigação positiva para sócio externo é gerada.

## Recorrências

1. Cadastre custo mensal direto e execute “Gerar vencidas agora”.
2. Confirme que nasce como `Previsto`, não como `Pago`.
3. Cadastre custo compartilhado recorrente com rateio de 100%.
4. Gere a recorrência e confirme que a despesa nasce com as alocações, sem duplicar custo no consolidado.

## Metas

1. Cadastre/edite uma meta mensal.
2. Lance receita recebida nas categorias de implantação/recorrente.
3. Confirme Planejado × Realizado e quantidade de clientes.

## Demandas / Hoje

1. Capture uma demanda apenas com título.
2. Classifique prioridade, projeto, prazo e estimativa.
3. Informe 6 horas na página Hoje e gere o plano.
4. Reordene/remova itens e salve a sessão.
5. Inicie/finalize cronômetro e confira o tempo no projeto.

## Comercial

1. Crie um lead quente com próxima ação hoje.
2. Confirme que aparece no Comercial e em Hoje.
3. Marque como ganho e converta em cliente somente após confirmação.

## Conferência

1. Abra Financeiro → Conferência.
2. Compare o projeto/mês com a planilha legada.
3. Exporte XLSX e confira Lançamentos + Resumo mensal.
