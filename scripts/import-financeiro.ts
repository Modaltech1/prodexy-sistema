/**
 * Importador opcional da planilha legada "Financeiro Prodexy".
 *
 * Uso:
 *   npm run import:financeiro -- "/caminho/Financeiro Prodexy.xlsx"
 *   npm run import:financeiro -- "/caminho/Financeiro Prodexy.xlsx" --dry-run
 *
 * Regras importantes:
 * - ignora abas de resumo;
 * - não importa a antiga retenção pessoal de 10%;
 * - recalcula o líquido no banco como bruto - taxa (receita) ou -(bruto + taxa) (custo);
 * - a aba "Prodexy" é importada como holding para não inferir projeto sem certeza;
 * - usa external_reference para tornar novas execuções idempotentes.
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (!fileArg) {
  console.error('Informe o caminho do arquivo. Ex.: npm run import:financeiro -- "./Financeiro Prodexy.xlsx"');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !key)) {
  console.error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local antes de importar.");
  process.exit(1);
}

const supabase = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const workbook = XLSX.readFile(path.resolve(fileArg), { cellDates: true, cellFormula: false });

const sheetProjectMap: Record<string, string | null> = {
  "Prodexy": null,
  "Vale do Itaunas": "Vale do Itaúnas",
  "Vale do Itaúnas": "Vale do Itaúnas",
  "Escolinha Pro": "Escolinha Pro",
  "Oficina Mais": "Oficina Mais",
};

const normalize = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const moneyToCents = (v: unknown) => {
  if (typeof v === "number") return Math.round(v * 100);
  const text = String(v ?? "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const quantityNumber = (v: unknown) => {
  const n = Number(String(v ?? 1).replace(",", "."));
  return Number.isFinite(n) ? n : 1;
};
const isoDate = (v: unknown) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const text = String(v ?? "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
};

function findHeader(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const headers = row.map(normalize);
    return headers.includes("data") && headers.includes("tipo") && headers.includes("descricao") && headers.some((h) => h.includes("valor bruto"));
  });
}

function headerIndex(headers: unknown[], ...names: string[]) {
  const hs = headers.map(normalize);
  for (const name of names.map(normalize)) {
    const exact = hs.indexOf(name);
    if (exact >= 0) return exact;
  }
  for (const name of names.map(normalize)) {
    const contains = hs.findIndex((h) => h.includes(name));
    if (contains >= 0) return contains;
  }
  return -1;
}

async function main() {
  const wantedSheets = workbook.SheetNames.filter((name) => Object.prototype.hasOwnProperty.call(sheetProjectMap, name));
  if (!wantedSheets.length) throw new Error("Nenhuma aba financeira conhecida foi encontrada.");

  let projects = new Map<string, string>();
  let categories = new Map<string, string>();
  if (supabase) {
    const [pRes, cRes] = await Promise.all([
      supabase.from("projects").select("id,name"),
      supabase.from("financial_categories").select("id,name"),
    ]);
    if (pRes.error) throw pRes.error;
    if (cRes.error) throw cRes.error;
    projects = new Map((pRes.data ?? []).map((p) => [normalize(p.name), p.id]));
    categories = new Map((cRes.data ?? []).map((c) => [normalize(c.name), c.id]));
  }

  let found = 0;
  let imported = 0;
  let skipped = 0;

  for (const sheetName of wantedSheets) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    const headerRow = findHeader(rows);
    if (headerRow < 0) {
      console.warn(`[${sheetName}] cabeçalho financeiro não encontrado; aba ignorada.`);
      continue;
    }
    const headers = rows[headerRow];
    const idx = {
      date: headerIndex(headers, "Data"),
      month: headerIndex(headers, "Mês", "Mes"),
      type: headerIndex(headers, "Tipo"),
      category: headerIndex(headers, "Categoria"),
      description: headerIndex(headers, "Descrição", "Descricao"),
      quantity: headerIndex(headers, "Quantidade", "Qtd"),
      unit: headerIndex(headers, "Valor unitário", "Valor unitario"),
      gross: headerIndex(headers, "Valor bruto"),
      applyFee: headerIndex(headers, "Aplicar taxa?", "Aplicar taxa"),
      fee: headerIndex(headers, "Taxa"),
    };

    const projectName = sheetProjectMap[sheetName];
    const projectId = projectName ? projects.get(normalize(projectName)) ?? null : null;
    if (!dryRun && projectName && !projectId) throw new Error(`Projeto "${projectName}" não existe no Supabase. Rode schema.sql primeiro.`);

    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const typeText = normalize(row[idx.type]);
      if (!typeText.includes("receita") && !typeText.includes("custo")) continue;
      const date = isoDate(row[idx.date]);
      const description = String(row[idx.description] ?? "").trim();
      if (!date || !description) continue;
      found++;

      const transactionType = typeText.includes("receita") ? "revenue" : "cost";
      const quantity = idx.quantity >= 0 ? quantityNumber(row[idx.quantity]) : 1;
      const unitCents = idx.unit >= 0 ? moneyToCents(row[idx.unit]) : 0;
      let grossCents = idx.gross >= 0 ? moneyToCents(row[idx.gross]) : Math.round(quantity * unitCents);
      if (!grossCents && unitCents) grossCents = Math.round(quantity * unitCents);
      const feeCents = idx.fee >= 0 ? Math.max(0, moneyToCents(row[idx.fee])) : 0;
      const categoryName = idx.category >= 0 ? String(row[idx.category] ?? "").trim() : "";
      let categoryId = categoryName ? categories.get(normalize(categoryName)) ?? null : null;

      if (!dryRun && supabase && categoryName && !categoryId) {
        const appliesTo = transactionType === "revenue" ? "revenue" : "cost";
        const { data: createdCategory, error } = await supabase
          .from("financial_categories")
          .insert({ name: categoryName, applies_to: appliesTo, goal_bucket: "other" })
          .select("id,name")
          .single();
        if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
        if (createdCategory) {
          categoryId = createdCategory.id;
          categories.set(normalize(createdCategory.name), createdCategory.id);
        } else {
          const { data } = await supabase.from("financial_categories").select("id,name").ilike("name", categoryName).maybeSingle();
          categoryId = data?.id ?? null;
        }
      }

      const externalReference = `legacy-xlsx:${sheetName}:${r + 1}`;
      const payload = {
        project_id: projectId,
        client_id: null,
        transaction_date: date,
        competence_month: `${date.slice(0, 7)}-01`,
        transaction_type: transactionType,
        category_id: categoryId,
        description,
        quantity,
        unit_amount_cents: unitCents,
        gross_amount_cents: grossCents,
        fee_profile_id: null,
        fee_amount_cents: feeCents,
        status: transactionType === "revenue" ? "received" : "paid",
        realized_at: date,
        cost_scope: transactionType === "revenue" ? (projectId ? "direct" : "holding") : (projectId ? "direct" : "holding"),
        source: "import",
        external_reference: externalReference,
        notes: sheetName === "Prodexy"
          ? "Importado da aba legada Prodexy como lançamento da holding. Revise e reclassifique para um projeto se necessário."
          : `Importado da planilha legada (${sheetName}).`,
      };

      if (dryRun || !supabase) {
        console.log(`[DRY] ${externalReference} | ${transactionType} | ${description} | R$ ${(grossCents / 100).toFixed(2)}`);
        imported++;
        continue;
      }

      const { data: existing, error: findError } = await supabase
        .from("financial_transactions")
        .select("id")
        .eq("external_reference", externalReference)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("financial_transactions").insert(payload);
      if (error) throw error;
      imported++;
    }
  }

  console.log("\nImportação concluída.");
  console.log(`Linhas financeiras encontradas: ${found}`);
  console.log(`${dryRun ? "Simuladas" : "Importadas"}: ${imported}`);
  console.log(`Ignoradas por já existirem: ${skipped}`);
  console.log("Observação: a antiga regra pessoal de 10% não é importada nem aplicada pelo sistema.");
}

main().catch((error) => {
  console.error("Falha na importação:", error instanceof Error ? error.message : error);
  process.exit(1);
});
