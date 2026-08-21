export type ProjectType = "client" | "saas" | "internal";
export type ProjectStatus = "active" | "paused" | "closed" | "archived";
export type TransactionType = "revenue" | "cost";
export type TransactionStatus = "planned" | "received" | "paid" | "overdue" | "cancelled";
export type CostScope = "direct" | "shared" | "holding";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "inbox" | "backlog" | "planned" | "in_progress" | "waiting" | "done" | "cancelled";

export interface Project {
  id: string;
  name: string;
  project_type: ProjectType;
  status: ProjectStatus;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  primary_client_id?: string | null;
  notes?: string | null;
}

export interface Client {
  id: string;
  name: string;
  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  entry_date?: string | null;
  notes?: string | null;
}

export interface FinancialCategory {
  id: string;
  name: string;
  applies_to: "any" | "revenue" | "cost";
  goal_bucket: "recurring" | "implementation" | "other";
  active: boolean;
}

export interface FeeProfile {
  id: string;
  name: string;
  percentage: number | string;
  fixed_amount_cents: number;
  active: boolean;
  notes?: string | null;
}

export interface FinancialTransaction {
  id: string;
  project_id?: string | null;
  client_id?: string | null;
  transaction_date: string;
  competence_month: string;
  transaction_type: TransactionType;
  category_id?: string | null;
  description: string;
  quantity: number | string;
  unit_amount_cents: number;
  gross_amount_cents: number;
  fee_profile_id?: string | null;
  fee_amount_cents: number;
  net_amount_cents: number;
  status: TransactionStatus;
  due_date?: string | null;
  realized_at?: string | null;
  cost_scope: CostScope;
  provider?: string | null;
  subscription_id?: string | null;
  customer_payment_status?: "scheduled" | "paid" | "failed" | "refunded" | null;
  customer_paid_at?: string | null;
  expected_receipt_date?: string | null;
  source?: "manual" | "import" | "integration" | "recurrence";
  notes?: string | null;
  archived: boolean;
}

export interface Subscription {
  id: string;
  project_id: string;
  client_id: string;
  plan_id?: string | null;
  monthly_amount_cents: number;
  billing_day?: number | null;
  fee_profile_id?: string | null;
  payout_day?: number | null;
  payout_month_offset: number;
  automatic_billing: boolean;
  automatic_billing_start_month?: string | null;
  last_billing_sync_at?: string | null;
  status: "active" | "trial" | "overdue" | "cancelled";
  start_date: string;
  cancellation_date?: string | null;
  notes?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  client_id?: string | null;
  category_id?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at?: string | null;
  estimated_minutes?: number | null;
  next_action?: string | null;
  origin?: string | null;
  waiting_since?: string | null;
  notes?: string | null;
  completed_at?: string | null;
  archived: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  interest_project_id?: string | null;
  interest_label?: string | null;
  temperature: "cold" | "warm" | "hot";
  stage: "new" | "qualification" | "contact" | "meeting" | "proposal" | "negotiation" | "won" | "lost";
  estimated_setup_cents: number;
  estimated_monthly_cents: number;
  last_contact_at?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  notes?: string | null;
}

export interface ProjectFinancialSummary {
  project_id: string;
  project_name: string;
  project_type: ProjectType;
  revenue_gross_cents: number;
  revenue_fees_cents: number;
  revenue_net_cents: number;
  direct_costs_cents: number;
  shared_costs_cents: number;
  profit_cents: number;
  margin_percentage: number | null;
  prodexy_share_cents: number;
  external_share_cents: number;
  participation_sum_percentage?: number;
  participation_valid?: boolean;
}
