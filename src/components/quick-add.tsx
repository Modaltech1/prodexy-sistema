"use client";
import Link from "next/link";
import { Plus, ListTodo, ArrowDownCircle, ArrowUpCircle, UserRound, Target } from "lucide-react";
import { useState } from "react";
import { Modal } from "./ui/modal";

const actions = [
  { href: "/demandas?novo=1", label: "Demanda", text: "Registrar um pedido, bug, ideia ou atividade.", icon: ListTodo },
  { href: "/financeiro/lancamentos?novo=receita", label: "Receita", text: "Adicionar um recebimento ou valor previsto.", icon: ArrowUpCircle },
  { href: "/financeiro/lancamentos?novo=custo", label: "Custo", text: "Adicionar uma despesa direta ou da holding.", icon: ArrowDownCircle },
  { href: "/clientes?novo=1", label: "Cliente", text: "Cadastrar cliente e depois vinculá-lo a projetos.", icon: UserRound },
  { href: "/comercial?novo=1", label: "Lead", text: "Registrar uma oportunidade comercial.", icon: Target },
];

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="topbar-add" onClick={() => setOpen(true)}><Plus size={17}/> Adicionar</button>
    <Modal open={open} title="Adicionar" onClose={() => setOpen(false)} width="620px">
      <div className="quick-add-grid">
        {actions.map(({ href, label, text, icon: Icon }) => <Link href={href} onClick={() => setOpen(false)} className="quick-add-item" key={label}>
          <Icon size={20}/><div><strong>{label}</strong><span>{text}</span></div>
        </Link>)}
      </div>
    </Modal>
  </>;
}
