export type TableDataPolicy = {
  schema: "public";
  table: string;
  columns: readonly string[];
  searchableColumns: readonly string[];
  defaultSort: string;
  defaultDirection: "asc" | "desc";
};

// Allowlist explícita do PH. Colunas de identidade Cognito, chaves de
// idempotência e hashes de impressão não chegam ao explorador.
const phPolicies = {
  migracoes_schema: policy("migracoes_schema", ["versao", "aplicada_em"], ["versao"], "aplicada_em", "desc"),
  lojas: policy("lojas", ["id", "nome", "ativa", "criada_em"], ["nome"], "nome"),
  usuarios: policy("usuarios", ["id", "nome_exibicao", "perfil", "ativo", "criado_em"], ["nome_exibicao", "perfil"], "nome_exibicao"),
  usuarios_lojas: policy("usuarios_lojas", ["usuario_id", "loja_id", "ativo"], [], "usuario_id"),
  sequencias_categoria: policy("sequencias_categoria", ["loja_id", "proximo_codigo"], [], "loja_id"),
  categorias: policy("categorias", ["id", "loja_id", "codigo", "nome", "tamanho", "preco_centavos", "arquivada_em", "criada_em"], ["codigo", "nome", "tamanho"], "codigo"),
  saldos_estoque: policy("saldos_estoque", ["categoria_id", "loja_id", "quantidade", "atualizado_em"], ["quantidade"], "atualizado_em", "desc"),
  operacoes_estoque: policy("operacoes_estoque", ["id", "loja_id", "autor_usuario_id", "tipo", "motivo", "criada_em"], ["tipo", "motivo"], "criada_em", "desc"),
  vendas: policy("vendas", ["id", "loja_id", "autor_usuario_id", "vendedor_usuario_id", "total_centavos", "realizada_em"], ["total_centavos"], "realizada_em", "desc"),
  itens_venda: policy("itens_venda", ["id", "venda_id", "loja_id", "categoria_id", "codigo_registrado", "nome_registrado", "tamanho_registrado", "preco_unitario_centavos", "quantidade", "total_linha_centavos"], ["codigo_registrado", "nome_registrado", "tamanho_registrado"], "codigo_registrado"),
  movimentos_estoque: policy("movimentos_estoque", ["id", "loja_id", "categoria_id", "autor_usuario_id", "operacao_estoque_id", "venda_id", "variacao_quantidade", "saldo_apos", "motivo", "criado_em"], ["motivo"], "criado_em", "desc"),
  metas: policy("metas", ["id", "loja_id", "vendedor_usuario_id", "nome", "alvo_centavos", "inicio_data", "fim_data", "versao", "criada_por_usuario_id", "atualizada_por_usuario_id", "criada_em", "atualizada_em"], ["nome"], "atualizada_em", "desc"),
  historico_metas: policy("historico_metas", ["id", "meta_id", "loja_id", "vendedor_usuario_id", "versao", "nome", "alvo_centavos", "inicio_data", "fim_data", "tipo_alteracao", "alterada_por_usuario_id", "alterada_em"], ["nome", "tipo_alteracao"], "alterada_em", "desc"),
} satisfies Record<string, TableDataPolicy>;

function policy(table: string, columns: readonly string[], searchableColumns: readonly string[], defaultSort: string, defaultDirection: "asc" | "desc" = "asc"): TableDataPolicy {
  return { schema: "public", table, columns, searchableColumns, defaultSort, defaultDirection };
}

export function getTableDataPolicy(projectId: string, schema: string, table: string): TableDataPolicy | null {
  if (projectId !== "ph-outlet" || schema !== "public") return null;
  return phPolicies[table as keyof typeof phPolicies] ?? null;
}

export function getPhDataPolicies(): readonly TableDataPolicy[] {
  return Object.values(phPolicies);
}
