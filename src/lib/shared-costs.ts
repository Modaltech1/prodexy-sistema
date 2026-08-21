export interface SharedCostAllocationInput {
  project_id: string;
  allocated_amount_cents: number;
}

export interface SharedCostAllocationValidation {
  allocatedCents: number;
  holdingRemainderCents: number;
  error: string | null;
}

export function validateSharedCostAllocations(
  totalCostCents: number,
  allocations: SharedCostAllocationInput[],
): SharedCostAllocationValidation {
  const total = Math.round(Number(totalCostCents));

  if (!Number.isSafeInteger(total) || total <= 0) {
    return { allocatedCents: 0, holdingRemainderCents: 0, error: "O custo total deve ser maior que zero." };
  }

  if (!allocations.length) {
    return {
      allocatedCents: 0,
      holdingRemainderCents: total,
      error: "Selecione ao menos um projeto para o rateio.",
    };
  }

  const projectIds = new Set<string>();
  let allocatedCents = 0;

  for (const allocation of allocations) {
    const amount = Math.round(Number(allocation.allocated_amount_cents));
    if (!allocation.project_id || projectIds.has(allocation.project_id)) {
      return {
        allocatedCents,
        holdingRemainderCents: total - allocatedCents,
        error: "Cada projeto deve aparecer uma única vez no rateio.",
      };
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return {
        allocatedCents,
        holdingRemainderCents: total - allocatedCents,
        error: "Informe um valor maior que zero para cada projeto selecionado.",
      };
    }

    projectIds.add(allocation.project_id);
    allocatedCents += amount;
  }

  if (allocatedCents > total) {
    return {
      allocatedCents,
      holdingRemainderCents: total - allocatedCents,
      error: "O valor destinado aos projetos não pode ultrapassar o custo original.",
    };
  }

  return {
    allocatedCents,
    holdingRemainderCents: total - allocatedCents,
    error: null,
  };
}

export function splitEvenly(totalCents: number, projectIds: string[]) {
  if (!projectIds.length || totalCents <= 0) return [];

  const base = Math.floor(totalCents / projectIds.length);
  let remainder = totalCents - base * projectIds.length;

  return projectIds.map((projectId) => {
    const extraCent = remainder > 0 ? 1 : 0;
    remainder -= extraCent;
    return {
      project_id: projectId,
      allocated_amount_cents: base + extraCent,
    };
  });
}
