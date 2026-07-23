import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트/서버 액션/라우트 핸들러용 Supabase 클라이언트.
 * anon key + 사용자 세션 쿠키 — 모든 데이터 접근은 RLS로 제한된다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 쿠키 쓰기가 불가 — proxy가 세션을
            // 갱신하고 있으므로 무시해도 안전하다.
          }
        },
      },
    },
  );
}
