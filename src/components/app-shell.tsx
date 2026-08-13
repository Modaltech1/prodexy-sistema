"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, FolderKanban, ListTodo, WalletCards, Gauge, ReceiptText, GitCompareArrows,
  Split, HandCoins, LockKeyhole, Sheet, Target, UsersRound, BriefcaseBusiness, Settings,
  ChevronDown, Menu, X
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { GlobalSearch } from "./global-search";
import { QuickAdd } from "./quick-add";

const primary = [
  { href: "/", label: "Hoje", icon: CalendarDays },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/demandas", label: "Demandas", icon: ListTodo },
];

const finance = [
  { href: "/financeiro", label: "Visão geral", icon: Gauge },
  { href: "/financeiro/lancamentos", label: "Lançamentos", icon: ReceiptText },
  { href: "/financeiro/projetos", label: "Projetos", icon: GitCompareArrows },
  { href: "/financeiro/custos-compartilhados", label: "Custos compartilhados", icon: Split },
  { href: "/financeiro/distribuicoes", label: "Distribuição de lucro", icon: HandCoins },
  { href: "/financeiro/fechamentos", label: "Fechamentos", icon: LockKeyhole },
  { href: "/financeiro/conferencia", label: "Conferência", icon: Sheet },
];

const secondary = [
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
  { href: "/comercial", label: "Comercial", icon: BriefcaseBusiness },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function NavItem({ href, label, icon: Icon, exact = false, onClick }: { href: string; label: string; icon: any; exact?: boolean; onClick?: () => void }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return <Link href={href} onClick={onClick} className={`nav-item ${active ? "active" : ""}`}><Icon size={17}/><span>{label}</span></Link>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(pathname.startsWith("/financeiro"));
  const close = () => setMobileOpen(false);

  const sidebar = <aside className="sidebar">
    <div className="brand"><img src="/prodexy-icon-dark.ico" alt=""/><div><strong>Prodexy Labs</strong><span>Management</span></div></div>
    <nav>
      <div className="nav-group">{primary.map((item) => <NavItem {...item} key={item.href} onClick={close}/>)}</div>
      <div className="nav-group">
        <button className={`nav-section-button ${pathname.startsWith("/financeiro") ? "active" : ""}`} onClick={() => setFinanceOpen((v) => !v)}><WalletCards size={17}/><span>Financeiro</span><ChevronDown size={15} className={financeOpen ? "rotated" : ""}/></button>
        {financeOpen && <div className="nav-subitems">{finance.map((item) => <NavItem {...item} key={item.href} exact={item.href === "/financeiro"} onClick={close}/>)}</div>}
      </div>
      <div className="nav-group">{secondary.map((item) => <NavItem {...item} key={item.href} onClick={close}/>)}</div>
    </nav>
    <div className="sidebar-footer"><span>Workspace</span><strong>Prodexy Labs</strong><small>Uso interno</small></div>
  </aside>;

  return <div className="app-shell">
    <div className={`mobile-sidebar ${mobileOpen ? "open" : ""}`}><div className="mobile-close"><button onClick={close}><X size={20}/></button></div>{sidebar}</div>
    {mobileOpen && <button className="mobile-backdrop" onClick={close} aria-label="Fechar menu"/>}
    <div className="desktop-sidebar">{sidebar}</div>
    <div className="app-main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20}/></button><GlobalSearch/><QuickAdd/></header>
      <main className="content">{children}</main>
    </div>
  </div>;
}
