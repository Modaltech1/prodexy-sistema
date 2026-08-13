/* eslint-disable @typescript-eslint/no-explicit-any */

type LooseRow = Record<string, any>;

type LooseTable = {
  Row: LooseRow;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

type LooseFunction = {
  Args: Record<string, any>;
  Returns: any;
};

type PublicTableName =
  | "app_settings"
  | "projects"
  | "clients"
  | "project_clients"
  | "plans"
  | "subscriptions"
  | "financial_categories"
  | "fee_profiles"
  | "recurring_financial_templates"
  | "recurring_financial_allocations"
  | "financial_transactions"
  | "shared_cost_allocations"
  | "partners"
  | "project_partners"
  | "monthly_closings"
  | "closing_distributions"
  | "goals"
  | "task_categories"
  | "recurring_task_templates"
  | "tasks"
  | "task_dependencies"
  | "task_time_entries"
  | "work_sessions"
  | "work_session_items"
  | "leads"
  | "lead_activities";

type PublicViewName = "v_project_monthly_financials" | "v_consolidated_monthly_cash";

export type Database = {
  public: {
    Tables: Record<PublicTableName, LooseTable>;
    Views: Record<PublicViewName, LooseTable>;
    Functions: {
      close_project_month: {
        Args: { p_project_id: string; p_competence_month: string };
        Returns: string;
      };
      reopen_project_month: {
        Args: { p_closing_id: string };
        Returns: string;
      };
    } & Record<string, LooseFunction>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
