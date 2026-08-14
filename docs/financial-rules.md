# Regras financeiras

Este documento resume as regras financeiras confirmadas no schema e no codigo atual. Trate mudancas aqui como alto impacto.

## Ordem de calculo

```text
Receita bruta
- taxas financeiras
= receita liquida

Receita liquida
- custos diretos
- custos compartilhados alocados
= lucro liquido do projeto

Lucro liquido positivo
-> distribuicao societaria
-> parcela Prodexy + parcelas de socios externos
```

Essa ordem aparece em `v_project_monthly_financials`, `close_project_month()` e `src/lib/server-finance.ts`.

## Receita, taxas e moeda

- Valores monetarios sao armazenados em centavos (`*_cents`).
- A moeda operacional e BRL; locale `pt-BR`; timezone `America/Sao_Paulo`.
- Receitas possuem `gross_amount_cents`, `fee_amount_cents` e `net_amount_cents` gerado pelo banco.
- Taxas sao configuraveis por `fee_profiles`, com percentual e componente fixo em centavos.
- Nao hardcode percentuais de gateway no codigo.

## Competencia e caixa

- `competence_month` representa o mes economico e sempre usa o primeiro dia do mes.
- `realized_at` representa recebimento/pagamento efetivo.
- A visao por competencia e a base do fechamento societario.
- A visao de caixa e gerencial e deve usar recebimentos/pagamentos realizados.

## Custos

- `cost_scope = direct`: custo exclusivo de um projeto.
- `cost_scope = shared`: despesa unica da holding com alocacoes por projeto.
- `cost_scope = holding`: custo da operacao Prodexy sem projeto.
- Custos compartilhados nunca devem ser somados duas vezes no consolidado. A transacao original representa o custo real; `shared_cost_allocations` distribui esse custo gerencialmente.
- O endpoint de custo compartilhado exige que a soma das alocacoes seja exatamente igual ao valor original mais taxa.

## Distribuicao

- Distribuicao de socio nao e despesa operacional.
- `closing_distributions` e snapshot da distribuicao do lucro ja apurado.
- A parcela da Prodexy representa resultado economico da holding, nao pagamento para ela mesma.
- Se o lucro do projeto for menor ou igual a zero, nao ha distribuicao positiva para socios externos.
- Ate existir regra explicita de compartilhamento de prejuizo, o prejuizo permanece visivel no resultado Prodexy.

## Fechamento mensal

- `monthly_closings` guarda snapshot de receita, taxas, custos, lucro e margem.
- `closing_distributions` guarda snapshot de participantes, percentuais e valores.
- `close_project_month()` calcula o snapshot dentro do PostgreSQL.
- `reopen_project_month()` reabre um fechamento, mas bloqueia reabertura quando existe distribuicao externa paga.
- Alteracoes atuais em participantes nao devem modificar silenciosamente meses fechados.

## Relatorio do socio

- Mes fechado usa somente os snapshots de `monthly_closings` e `closing_distributions`.
- Mes aberto e provisorio: usa `v_project_monthly_financials` e a participacao vigente na competencia.
- Uma estimativa positiva so pode ser calculada quando as participacoes vigentes totalizam 100%.
- Resultado menor ou igual a zero mostra parcela do socio igual a zero; prejuizo nao vira saldo negativo a pagar.
- Status de pagamento pertence a distribuicao fechada. Mes aberto nao possui pagamento confirmado.
- O escopo de projetos deve ser derivado do socio autenticado no servidor, nunca de um identificador confiado ao browser.

## Pontos proibidos sem pedido explicito

- Criar retencao automatica de 10%.
- Tratar MRR como caixa recebido.
- Tratar repasse a socio como custo.
- Corrigir dados historicos silenciosamente.
- Recalcular fechamentos antigos fora de um fluxo explicito de reabertura e novo fechamento.
