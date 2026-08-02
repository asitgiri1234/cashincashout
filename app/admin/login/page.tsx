import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_COOKIE, isAdminOpen, sessionToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Password gate for the deployed site.
 *
 * In development this page immediately redirects into the dashboard —
 * building and demoing locally has no login step at all.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/admin", error } = await searchParams;

  if (isAdminOpen()) redirect(next);

  async function signIn(formData: FormData) {
    "use server";

    const supplied = String(formData.get("password") ?? "");
    const expected = process.env.ADMIN_PASSWORD;
    const target = String(formData.get("next") ?? "/admin");

    if (!expected || supplied !== expected) {
      redirect(`/admin/login?error=1&next=${encodeURIComponent(target)}`);
    }

    const jar = await cookies();
    jar.set(ADMIN_COOKIE, await sessionToken(expected), {
      httpOnly: true, // unreadable from JS, so an XSS cannot steal the session
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    redirect(target);
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <form action={signIn} className="w-[min(360px,100%)] border border-border p-6">
        <h1 className="text-[16px]">ADMIN</h1>
        <p className="meta mt-1 text-[10px] text-text-secondary">
          CASH IN CASH OUT
        </p>

        <input type="hidden" name="next" value={next} />

        <label
          className="meta mt-6 block text-[10px] text-text-secondary"
          htmlFor="password"
        >
          PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          className="meta mt-1.5 w-full border border-border bg-surface px-3 py-2.5 text-[13px] focus:border-text focus:outline-none"
        />

        {error && (
          <p role="alert" className="meta mt-3 text-[10px] text-text">
            INCORRECT PASSWORD.
          </p>
        )}

        <button
          type="submit"
          className="btn-press meta mt-5 w-full border border-text bg-text px-4 py-3 text-[11px] text-bg hover:opacity-80"
        >
          SIGN IN
        </button>
      </form>
    </div>
  );
}
