import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  // Never let the dashboard or the login screen into a search index.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Thin wrapper over every /admin route.
 *
 * The dashboard chrome — header, nav, sign out — lives in
 * `(dashboard)/layout.tsx` instead, so the login screen at /admin/login can
 * render standalone. Putting the chrome here would show a nav and a SIGN OUT
 * button to someone who is not signed in.
 */
export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
