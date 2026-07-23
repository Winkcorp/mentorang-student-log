/**
 * 최초 admin 승격 스크립트.
 * 사용법: node scripts/make-admin.mjs 이메일@example.com
 * (이후 계정 승인은 앱의 관리자 → 계정 승인 화면에서)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const email = process.argv[2];
if (!email) {
  console.error("사용법: node scripts/make-admin.mjs 이메일@example.com");
  process.exit(1);
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data, error } = await admin
  .from("profiles")
  .update({ role: "admin" })
  .eq("email", email)
  .select("id, email, role");

if (error) {
  console.error("실패:", error.message);
  process.exit(1);
}
if (!data.length) {
  console.error(`해당 이메일의 프로필이 없습니다: ${email} — 먼저 앱에서 가입하세요.`);
  process.exit(1);
}
console.log(`✅ admin 승격 완료: ${data[0].email}`);
