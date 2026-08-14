export type ManagedProjectSummary = {
  id: string;
  name: string;
  participationPercentage: number;
};

export type ManagedAccess = {
  id: string;
  displayName: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  partnerId: string;
  partnerName: string;
  partnerActive: boolean;
  projects: ManagedProjectSummary[];
  lastLoginAt: string | null;
  createdAt: string;
};

export type PartnerAccessOption = {
  id: string;
  name: string;
  active: boolean;
  linkedUserId: string | null;
};

export type AccessManagementData = {
  users: ManagedAccess[];
  partners: PartnerAccessOption[];
};

export type CreatePartnerAccessInput = {
  displayName: string;
  email: string;
  temporaryPassword: string;
  partnerId: string;
};

export function normalizeAccessEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidAccessEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAccessEmail(value));
}

export function passwordValidationMessage(password: string) {
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Use ao menos 10 caracteres, com letra maiúscula, minúscula e número.";
  }
  return null;
}
