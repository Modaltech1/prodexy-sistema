import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database";
import { getSupabasePublicConfig } from "@/lib/supabase/public-env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot persist cookies. The proxy refreshes them.
        }
      },
    },
  });
}

