import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PendingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role) redirect(`/${profile.role}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200/70 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-bold text-gray-900">승인 대기 중</h1>
        <p className="mb-6 text-sm text-gray-500">
          관리자가 계정을 승인하면 이용할 수 있습니다.
          <br />
          가입 계정: {profile.email}
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
