import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Atualiza a sessão (renova o token) e exige usuário logado. Redireciona para
// /login quem não estiver autenticado. Opcional: ALLOWED_EMAILS restringe quais
// e-mails podem entrar (defesa extra caso o cadastro público não seja desligado).
export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const ehApi = pathname.startsWith("/api");
  const ehLogin = pathname === "/login";

  // Não autenticado: bloqueia (API = 401, páginas = redireciona pro login).
  if (!user) {
    if (ehLogin) return response;
    if (ehApi) {
      return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Allowlist opcional de e-mails.
  const permitidos = process.env.ALLOWED_EMAILS;
  if (permitidos) {
    const lista = permitidos.split(",").map((e) => e.trim().toLowerCase());
    const email = (user.email || "").toLowerCase();
    if (!lista.includes(email)) {
      if (ehApi) {
        return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
      }
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("erro", "sem-permissao");
      return NextResponse.redirect(url);
    }
  }

  // Já logado tentando abrir /login: manda pro dashboard.
  if (ehLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
