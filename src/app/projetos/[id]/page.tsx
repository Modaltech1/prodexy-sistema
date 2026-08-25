import { ProjectDetail } from "@/components/project-detail";
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ProjectDetail projectId={id} initialTab={query.aba === "clientes" ? "Clientes" : "Visão geral"} />;
}
