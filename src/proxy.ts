import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/config";
import { getSupabasePublicConfig } from "@/lib/supabase/public-env";

function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export async function proxy(request: NextRequest) {
  if (!authEnabled) return NextResponse.next();

  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isAuthApi = pathname.startsWith("/api/auth/");
  const isPublicApi = isAuthApi || pathname === "/api/health";

  if (!user) {
    if (isLogin || isPublicApi) return response;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão expirada ou inexistente." }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  const role = user.app_metadata?.role;
  const mustChangePassword = user.app_metadata?.must_change_password === true;
  if (user.app_metadata?.active === false) {
    if (isLogin || isAuthApi) return response;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Este acesso está inativo." }, { status: 403 });
    }
    return redirectWithCookies(request, response, "/login");
  }
  if (isLogin) {
    if (role !== "admin" && role !== "partner") return response;
    return redirectWithCookies(request, response, mustChangePassword ? "/alterar-senha" : role === "admin" ? "/" : "/portal");
  }

  if (isAuthApi) return response;
  if (mustChangePassword && pathname !== "/alterar-senha") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Troque a senha temporária antes de continuar." }, { status: 403 });
    }
    return redirectWithCookies(request, response, "/alterar-senha");
  }

  if (role === "partner") {
    if (pathname.startsWith("/api/partner/")) return response;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Este acesso não possui permissão administrativa." }, { status: 403 });
    }
    if (!pathname.startsWith("/portal") && pathname !== "/alterar-senha") {
      return redirectWithCookies(request, response, "/portal");
    }
    return response;
  }

  if (role !== "admin") return redirectWithCookies(request, response, "/login");
  if (pathname.startsWith("/portal")) return redirectWithCookies(request, response, "/");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|prodexy-icon-dark.ico|prodexy-icon-light.ico).*)"],
};
