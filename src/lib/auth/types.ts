export type AppRole = "admin" | "partner";

export type AppUserProfile = {
  id: string;
  displayName: string;
  role: AppRole;
  active: boolean;
  mustChangePassword: boolean;
};

export type CurrentAccess = AppUserProfile & {
  email: string | null;
  partnerId: string | null;
};

