export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL para habilitar o login.");
  if (!anonKey) throw new Error("Configure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para habilitar o login.");

  return { url, anonKey };
}
