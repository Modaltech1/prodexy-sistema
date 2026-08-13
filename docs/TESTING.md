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
