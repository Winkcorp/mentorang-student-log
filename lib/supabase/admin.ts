import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트 — RLS를 우회한다.
 *
 * 반드시 서버 전용 코드(서버 액션, 라우트 핸들러)에서만 import할 것.
 * "server-only" import가 클라이언트 번들에 섞이는 것을 빌드 타임에 차단한다.
 *
 * 사용처는 admin 권한 검증을 마친 뒤의 관리 작업(예: 사용자 role 부여)으로
 * 한정하고, 일반 데이터 조회는 전부 anon key(RLS 적용)로 할 것.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
