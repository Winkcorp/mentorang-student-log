"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none text-gray-600 hover:bg-gray-100"
    >
      로그아웃
    </button>
  );
}
