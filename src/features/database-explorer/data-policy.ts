export type TableDataPolicy = {
  schema: "public";
  table: string;
  columns: readonly string[];
  keyColumns: readonly string[];
  searchableColumns: readonly string[];
  defaultSort: string;
  defaultDirection: "asc" | "desc";
  deleteEnabled: boolean;
};

// Allowlist explícita do PH. Colunas de identidade Cognito, chaves de
// idempotência e hashes de impressão não chegam ao explorador.
const phPolicies = {
  migracoes_schema: policy("migracoes_schema", ["versao", "aplicada_em"], ["versao"], ["versao"], "aplicada_em", "desc", false),
  lojas: policy("lojas", ["id", "nome", "ativa", "criada_em"], ["id"], ["nome"], "nome"),
  usuarios: policy("usuarios", ["id", "nome_exibicao", "perfil", "ativo", "criado_em"], ["id"], ["nome_exibicao", "perfil"], "nome_exibicao"),
  usuarios_lojas: policy("usuarios_lojas", ["usuario_id", "loja_id", "ativo"], ["usuario_id", "loja_id"], [], "usuario_id"),
  sequencias_categoria: policy("sequencias_categoria", ["loja_id", "proximo_codigo"], ["loja_id"], [], "loja_id"),
  categorias: policy("categorias", ["id", "loja_id", "codigo", "nome", "tamanho", "preco_centavos", "arquivada_em", "criada_em"], ["id"], ["codigo", "nome", "tamanho"], "codigo"),
  saldos_estoque: policy("saldos_estoque", ["categoria_id", "loja_id", "quantidade", "atualizado_em"], ["categoria_id", "loja_id"], ["quantidade"], "atualizado_em", "desc"),
  operacoes_estoque: policy("operacoes_estoque", ["id", "loja_id", "autor_usuario_id", "tipo", "motivo", "criada_em"], ["id"], ["tipo", "motivo"], "criada_em", "desc"),
  vendas: policy("vendas", ["id", "loja_id", "autor_usuario_id", "vendedor_usuario_id", "total_centavos", "realizada_em"], ["id"], ["total_centavos"], "realizada_em", "desc"),
  itens_venda: policy("itens_venda", ["id", "venda_id", "loja_id", "categoria_id", "codigo_registrado", "nome_registrado", "tamanho_registrado", "preco_unitario_centavos", "quantidade", "total_linha_centavos"], ["id"], ["codigo_registrado", "nome_registrado", "tamanho_registrado"], "codigo_registrado"),
  movimentos_estoque: policy("movimentos_estoque", ["id", "loja_id", "categoria_id", "autor_usuario_id", "operacao_estoque_id", "venda_id", "variacao_quantidade", "saldo_apos", "motivo", "criado_em"], ["id"], ["motivo"], "criado_em", "desc"),
  metas: policy("metas", ["id", "loja_id", "vendedor_usuario_id", "nome", "alvo_centavos", "inicio_data", "fim_data", "versao", "criada_por_usuario_id", "atualizada_por_usuario_id", "criada_em", "atualizada_em"], ["id"], ["nome"], "atualizada_em", "desc"),
  historico_metas: policy("historico_metas", ["id", "meta_id", "loja_id", "vendedor_usuario_id", "versao", "nome", "alvo_centavos", "inicio_data", "fim_data", "tipo_alteracao", "alterada_por_usuario_id", "alterada_em"], ["id"], ["nome", "tipo_alteracao"], "alterada_em", "desc"),
} satisfies Record<string, TableDataPolicy>;

// Allowlist explícita do Oficina Mais. Esta liberação é somente leitura:
// identidades Cognito, payloads de webhook, identificadores do provedor de
// cobrança e chaves internas de storage não chegam ao explorador.
const oficinaMaisPolicies = {
  migracoes_schema: policy("migracoes_schema", ["versao", "descricao", "aplicado_em", "aplicado_por"], ["versao"], ["versao", "descricao"], "aplicado_em", "desc", false),
  billing_subscriptions: policy("billing_subscriptions", ["tenant_id", "provider", "provider_price_id", "status", "current_period_end", "cancel_at_period_end", "checkout_attempt", "checkout_expires_at", "checkout_reserved_until", "provider_updated_at", "criado_em", "atualizado_em"], ["tenant_id"], ["provider", "status"], "atualizado_em", "desc", false),
  billing_webhook_events: policy("billing_webhook_events", ["id", "provider", "tipo", "processado_em", "erro", "criado_em"], ["id"], ["provider", "tipo", "erro"], "criado_em", "desc", false),
  clientes: policy("clientes", ["id", "tenant_id", "nome", "cpf_cnpj", "telefone", "email", "cidade", "bairro", "nascimento", "whatsapp_opt_in", "criado_por", "criado_em", "atualizado_em"], ["id"], ["nome", "cpf_cnpj", "telefone", "email", "cidade", "bairro"], "nome", "asc", false),
  manutencoes_veiculo: policy("manutencoes_veiculo", ["id", "tenant_id", "veiculo_id", "servico_id", "tipo", "descricao", "periodicidade_meses", "periodicidade_km", "ultima_data", "ultima_km", "proxima_data", "proxima_km", "status", "ultima_os_id", "criado_em", "atualizado_em"], ["id"], ["tipo", "descricao", "status"], "atualizado_em", "desc", false),
  movimentos_estoque: policy("movimentos_estoque", ["id", "tenant_id", "produto_id", "os_id", "tipo", "quantidade", "saldo_anterior", "saldo_posterior", "motivo", "criado_por", "criado_em"], ["id"], ["tipo", "motivo"], "criado_em", "desc", false),
  ordem_diagnosticos: policy("ordem_diagnosticos", ["id", "tenant_id", "os_id", "descricao", "criado_em"], ["id"], ["descricao"], "criado_em", "desc", false),
  ordem_fotos: policy("ordem_fotos", ["id", "tenant_id", "os_id", "foto_url", "criado_em"], ["id"], ["foto_url"], "criado_em", "desc", false),
  ordem_produtos: policy("ordem_produtos", ["id", "tenant_id", "os_id", "produto_id", "quantidade", "valor_unitario", "valor_custo_unitario", "codigo_produto", "observacao", "criado_em"], ["id"], ["codigo_produto", "observacao"], "criado_em", "desc", false),
  ordem_servicos: policy("ordem_servicos", ["id", "tenant_id", "os_id", "servico_id", "valor", "quantidade", "codigo_peca", "observacao", "criado_em"], ["id"], ["codigo_peca", "observacao"], "criado_em", "desc", false),
  ordens_de_servico: policy("ordens_de_servico", ["id", "tenant_id", "numero", "cliente_id", "veiculo_id", "responsavel_id", "veiculo_placa", "veiculo_marca", "veiculo_modelo", "veiculo_ano", "veiculo_cor", "veiculo_tem_seguro", "km_entrada", "mao_de_obra", "acrescimos", "desconto", "valor_total", "valor_final", "forma_pagamento", "status", "observacoes", "criado_por", "criado_em", "atualizado_em"], ["id"], ["numero", "veiculo_placa", "veiculo_marca", "veiculo_modelo", "status"], "criado_em", "desc", false),
  perfis: policy("perfis", ["id", "nome", "email", "criado_em", "atualizado_em"], ["id"], ["nome", "email"], "nome", "asc", false),
  produtos: policy("produtos", ["id", "tenant_id", "nome", "marca_modelo", "codigo", "quantidade_estoque", "valor_compra", "valor_venda", "valor_total_estoque", "valor_potencial_venda", "lucro_potencial_estoque", "criado_em", "atualizado_em"], ["id"], ["nome", "marca_modelo", "codigo"], "nome", "asc", false),
  servicos: policy("servicos", ["id", "tenant_id", "nome", "valor", "is_periodico", "periodicidade_meses", "criado_em", "atualizado_em"], ["id"], ["nome"], "nome", "asc", false),
  tenant_memberships: policy("tenant_memberships", ["tenant_id", "user_id", "papel", "ativo", "criado_em", "atualizado_em"], ["tenant_id", "user_id"], ["papel"], "criado_em", "desc", false),
  tenant_settings: policy("tenant_settings", ["tenant_id", "nome_exibicao", "documento", "responsavel", "telefone", "whatsapp", "email_contato", "site", "endereco", "cidade", "estado", "informacao_consumidor_os", "logo_url", "cor_primaria", "cor_secundaria", "cor_destaque", "pagina_publica_ativa", "descricao_publica", "publicar_telefone", "publicar_email", "publicar_endereco", "publicar_servicos", "branding_versao", "timezone", "criado_em", "atualizado_em"], ["tenant_id"], ["nome_exibicao", "documento", "responsavel", "email_contato", "cidade"], "nome_exibicao", "asc", false),
  tenants: policy("tenants", ["id", "nome", "slug", "owner_user_id", "status", "criado_em", "atualizado_em"], ["id"], ["nome", "slug", "status"], "nome", "asc", false),
  veiculos: policy("veiculos", ["id", "tenant_id", "cliente_id", "placa", "marca", "modelo", "ano", "cor", "km_atual", "observacoes", "tem_seguro", "criado_em", "atualizado_em"], ["id"], ["placa", "marca", "modelo", "cor"], "placa", "asc", false),
} satisfies Record<string, TableDataPolicy>;

function policy(table: string, columns: readonly string[], keyColumns: readonly string[], searchableColumns: readonly string[], defaultSort: string, defaultDirection: "asc" | "desc" = "asc", deleteEnabled = true): TableDataPolicy {
  return { schema: "public", table, columns, keyColumns, searchableColumns, defaultSort, defaultDirection, deleteEnabled };
}

export function getTableDataPolicy(projectId: string, schema: string, table: string): TableDataPolicy | null {
  if (schema !== "public") return null;
  if (projectId === "ph-outlet") return phPolicies[table as keyof typeof phPolicies] ?? null;
  if (projectId === "oficina-mais") return oficinaMaisPolicies[table as keyof typeof oficinaMaisPolicies] ?? null;
  return null;
}

export function getPhDataPolicies(): readonly TableDataPolicy[] {
  return Object.values(phPolicies);
}

export function getOficinaMaisDataPolicies(): readonly TableDataPolicy[] {
  return Object.values(oficinaMaisPolicies);
}
