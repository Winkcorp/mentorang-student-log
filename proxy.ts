import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 proxy (구 middleware) — 모든 요청에서 서버사이드로 실행된다.
 *
 * 1. Supabase 세션 쿠키 갱신
 * 2. 역할(role) 기반 접근 제어:
 *    - 비로그인 → /login
 *    - role=null(승인 대기) → /pending만 허용
 *    - mentor/parent → 본인 영역만, admin → 전체 영역 접근 가능
 *
 * 클라이언트 리다이렉트가 아니라 서버에서 차단하므로 URL 직접 접근으로
 * 우회할 수 없다. 각 영역 layout에서도 한 번 더 검증한다(이중 방어).
 */

const PUBLIC_PATHS = ["/login", "/auth"];

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  mentor: "/mentor",
  parent: "/parent",
};

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default async function proxy(request: NextRequest) {
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
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 세션 검증 (getUser는 Supabase Auth 서버에 토큰을 검증한다)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };

  // 1) 비로그인
  if (!user) {
    if (isPublicPath(pathname)) return response;
    return redirectTo("/login");
  }

  // 2) 로그인됨 — role 조회 (RLS: 본인 profiles row만 조회 가능)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? null;

  // 2-a) 승인 대기 (role=null)
  if (!role) {
    if (pathname === "/pending") return response;
    return redirectTo("/pending");
  }

  const home = ROLE_HOME[role] ?? "/pending";

  // 2-b) 로그인 상태에서 /login, /pending, / 접근 → 역할 홈으로
  if (isPublicPath(pathname) || pathname === "/pending" || pathname === "/") {
    return redirectTo(home);
  }

  // 2-c) 역할 영역 접근 제어 — admin은 전체, 그 외는 본인 영역만
  if (role !== "admin") {
    const area = Object.values(ROLE_HOME).find(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (area && area !== home) {
      return redirectTo(home);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 리소스 제외 전체 경로
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
