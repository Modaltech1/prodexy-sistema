import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api";
import { MONTHS_PT, competenceRange } from "@/lib/date";
import { requireAdmin } from "@/lib/auth/access";

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const DEFAULT_HEADERS = [
  "Data", "Realizado em", "Competência", "Projeto", "Cliente", "Tipo", "Categoria", "Descrição", "Quantidade",
  "Valor unitário", "Valor bruto", "Taxa", "Valor líquido", "Status", "Escopo", "Provedor", "Observação",
];

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getSupabaseAdmin();
    const params = request.nextUrl.searchParams;
    const format = params.get("format") || "csv";
    const projectId = params.get("project_id");
    const holdingOnly = params.get("holding") === "1";
    const month = params.get("month");
    const year = params.get("year");
    const basis = params.get("basis") === "cash" ? "cash" : "competence";
    const transactionType = params.get("transaction_type");
    const status = params.get("status");
    const categoryId = params.get("category_id");
    const clientId = params.get("client_id");
    const costScope = params.get("cost_scope");
    const q = params.get("q")?.trim().toLowerCase() || "";

    let query = supabase
      .from("financial_transactions")
      .select("*")
      .eq("archived", false)
      .order("transaction_date", { ascending: true })
      .limit(10000);

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      if (basis === "cash") {
        const range = competenceRange(month);
        query = query.gte("realized_at", range.start).lt("realized_at", range.endExclusive);
      } else query = query.eq("competence_month", `${month}-01`);
    }
    if (year && /^\d{4}$/.test(year)) {
      if (basis === "cash") query = query.gte("realized_at", `${year}-01-01`).lt("realized_at", `${Number(year) + 1}-01-01`);
      else query = query.gte("competence_month", `${year}-01-01`).lte("competence_month", `${year}-12-01`);
    }
    if (transactionType && ["revenue", "cost"].includes(transactionType)) query = query.eq("transaction_type", transactionType);
    if (status && status !== "all") query = query.eq("status", status);
    if (categoryId) query = query.eq("category_id", categoryId);
    if (clientId) query = query.eq("client_id", clientId);
    if (costScope && ["direct", "shared", "holding"].includes(costScope)) query = query.eq("cost_scope", costScope);

    const [transactionsRes, projectsRes, clientsRes, categoriesRes, allocationsRes] = await Promise.all([
      query,
      supabase.from("projects").select("id,name").limit(5000),
      supabase.from("clients").select("id,name").limit(10000),
      supabase.from("financial_categories").select("id,name").limit(1000),
      supabase.from("shared_cost_allocations").select("transaction_id,project_id,allocated_amount_cents").limit(20000),
    ]);
    for (const r of [transactionsRes, projectsRes, clientsRes, categoriesRes, allocationsRes]) if (r.error) throw r.error;

    const projectMap = new Map((projectsRes.data ?? []).map((x) => [x.id, x.name]));
    const clientMap = new Map((clientsRes.data ?? []).map((x) => [x.id, x.name]));
    const categoryMap = new Map((categoriesRes.data ?? []).map((x) => [x.id, x.name]));
    const allTransactions = transactionsRes.data ?? [];

    const filteredTransactions = allTransactions.filter((t) => {
      if (holdingOnly && t.project_id) return false;
      if (projectId && t.project_id !== projectId) return false;
      if (q) {
        const haystack = `${t.description || ""} ${t.provider || ""} ${clientMap.get(t.client_id) || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const rows = filteredTransactions.map((t) => ({
      Data: t.transaction_date,
      "Realizado em": t.realized_at || "",
      Competência: t.competence_month?.slice(0, 7),
      Projeto: t.project_id ? projectMap.get(t.project_id) || "" : "Prodexy Labs / Holding",
      Cliente: t.client_id ? clientMap.get(t.client_id) || "" : "",
      Tipo: t.transaction_type === "revenue" ? "Receita" : "Custo",
      Categoria: t.category_id ? categoryMap.get(t.category_id) || "" : "",
      Descrição: t.description,
      Quantidade: Number(t.quantity),
      "Valor unitário": Number(t.unit_amount_cents) / 100,
      "Valor bruto": Number(t.gross_amount_cents) / 100,
      Taxa: Number(t.fee_amount_cents) / 100,
      "Valor líquido": Number(t.net_amount_cents) / 100,
      Status: t.status,
      Escopo: t.cost_scope,
      Provedor: t.provider || "",
      Observação: t.notes || "",
    }));

    const filenameBase = `prodexy-financeiro-${month || year || "export"}`;

    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Prodexy Labs Manager";
      workbook.created = new Date();

      const sheet = workbook.addWorksheet("Lançamentos");
      const headers = rows.length ? Object.keys(rows[0]) : DEFAULT_HEADERS;
      sheet.columns = headers.map((header) => ({ header, key: header, width: Math.min(36, Math.max(12, header.length + 2)) }));
      rows.forEach((row) => sheet.addRow(row));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(headers.length).letter}1` };
      for (const colName of ["Valor unitário", "Valor bruto", "Taxa", "Valor líquido"]) sheet.getColumn(colName).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';

      // A planilha de conferência ganha também um resumo mensal. Para projeto
      // individual, o resumo acrescenta os rateios sem transformá-los em novas despesas.
      const summary = workbook.addWorksheet("Resumo mensal");
      summary.columns = [
        { header: "Mês", key: "month", width: 18 },
        { header: "Receita bruta", key: "gross", width: 18 },
        { header: "Taxas", key: "fees", width: 16 },
        { header: "Receita líquida", key: "net", width: 18 },
        { header: "Custos", key: "costs", width: 18 },
        { header: "Lucro", key: "profit", width: 18 },
        { header: "Margem", key: "margin", width: 14 },
      ];
      summary.getRow(1).font = { bold: true };
      summary.views = [{ state: "frozen", ySplit: 1 }];

      const allocations = allocationsRes.data ?? [];
      const selectedYear = year || month?.slice(0, 4) || String(new Date().getUTCFullYear());
      const monthlyRows = Array.from({ length: 12 }, (_, index) => {
        const monthKey = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
        const monthAll = allTransactions.filter((t) => basis === "cash" ? t.realized_at?.startsWith(monthKey) : t.competence_month?.startsWith(monthKey));
        let base = monthAll;
        if (holdingOnly) base = monthAll.filter((t) => !t.project_id);
        else if (projectId) base = monthAll.filter((t) => t.project_id === projectId);

        let gross = 0;
        let fees = 0;
        let costs = 0;
        for (const t of base) {
          if (t.transaction_type === "revenue" && t.status === "received") {
            gross += Number(t.gross_amount_cents);
            fees += Number(t.fee_amount_cents);
          } else if (t.transaction_type === "cost" && t.status === "paid") {
            if (projectId && t.cost_scope !== "direct") continue;
            costs += Number(t.gross_amount_cents) + Number(t.fee_amount_cents);
          }
        }

        if (projectId) {
          const sharedIds = new Set(monthAll.filter((t) => t.transaction_type === "cost" && t.status === "paid" && t.cost_scope === "shared").map((t) => t.id));
          costs += allocations
            .filter((a) => a.project_id === projectId && sharedIds.has(a.transaction_id))
            .reduce((sum, a) => sum + Number(a.allocated_amount_cents), 0);
        }

        const net = gross - fees;
        const profit = net - costs;
        return { month: MONTHS_PT[index], gross: gross / 100, fees: fees / 100, net: net / 100, costs: costs / 100, profit: profit / 100, margin: gross ? profit / gross : null };
      });
      monthlyRows.forEach((row) => summary.addRow(row));
      const total = monthlyRows.reduce((acc, row) => ({ gross: acc.gross + row.gross, fees: acc.fees + row.fees, net: acc.net + row.net, costs: acc.costs + row.costs, profit: acc.profit + row.profit }), { gross: 0, fees: 0, net: 0, costs: 0, profit: 0 });
      summary.addRow({ month: "Total anual", ...total, margin: total.gross ? total.profit / total.gross : null });
      summary.getRow(summary.rowCount).font = { bold: true };
      for (const col of ["B", "C", "D", "E", "F"]) summary.getColumn(col).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
      summary.getColumn("G").numFmt = "0.0%";

      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(Buffer.from(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      });
    }

    const headers = rows.length ? Object.keys(rows[0]) : DEFAULT_HEADERS;
    const csv = [headers.map(csvEscape).join(";"), ...rows.map((row) => headers.map((h) => csvEscape((row as Record<string, unknown>)[h])).join(";"))].join("\n");
    return new Response(`\uFEFF${csv}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filenameBase}.csv"` },
    });
  } catch (error) {
    return serverError(error);
  }
}
