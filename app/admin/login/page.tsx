import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_COOKIE,
  sessionToken,
  verifyCredentials,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Admin sign-in. Email + password, always required — including in
 * development, so local behaviour matches production exactly.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/admin", error } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const raw = String(formData.get("next") ?? "/admin");

    // Only ever redirect within this site — an attacker-supplied absolute
    // URL here would turn the login into an open redirect.
    const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin";

    if (!verifyCredentials(email, password)) {
      // One message for both cases: saying which field was wrong would
      // confirm whether an email is the admin's.
      redirect(`/admin/login?error=1&next=${encodeURIComponent(target)}`);
    }

    const jar = await cookies();
    jar.set(ADMIN_COOKIE, await sessionToken(), {
      httpOnly: true, // unreadable from JS, so an XSS cannot lift the session
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    redirect(target);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5">
      <form
        action={signIn}
        className="w-[min(380px,100%)] border border-border p-7"
      >
        <h1 className="text-[18px]">CICO ADMIN</h1>
        <p className="meta mt-1 text-[10px] text-text-secondary">
          SIGN IN TO MANAGE PRODUCTS AND ORDERS
        </p>

        <input type="hidden" name="next" value={next} />

        <label
          className="meta mt-7 block text-[10px] text-text-secondary"
          htmlFor="email"
        >
          EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          className="meta mt-1.5 w-full border border-border bg-surface px-3 py-2.5 text-[13px] lowercase focus:border-text focus:outline-none"
        />

        <label
          className="meta mt-5 block text-[10px] text-text-secondary"
          htmlFor="password"
        >
          PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="meta mt-1.5 w-full border border-border bg-surface px-3 py-2.5 text-[13px] focus:border-text focus:outline-none"
        />

        {error && (
          <p role="alert" className="meta mt-4 border border-border px-3 py-2 text-[10px]">
            INCORRECT EMAIL OR PASSWORD.
          </p>
        )}

        <button
          type="submit"
          className="btn-press meta mt-6 w-full border border-text bg-text px-4 py-3 text-[11px] text-bg hover:opacity-80"
        >
          SIGN IN
        </button>
      </form>
    </div>
  );
}
