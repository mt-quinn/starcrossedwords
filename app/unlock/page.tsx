import type { Metadata } from "next";

import { isSiteLockEnabled, normalizeNextPath } from "@/lib/site-lock";

export const metadata: Metadata = {
  title: "Protected",
  description: "Enter the site password to continue.",
};

export default async function UnlockPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; next?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const nextPath = normalizeNextPath(resolvedSearchParams.next);
  const showError = resolvedSearchParams.error === "1";

  return (
    <main className="menu-shell">
      <section className="menu-card">
        <p className="menu-eyebrow">Protected Site</p>
        <h1>{isSiteLockEnabled() ? "Enter password" : "Site password not configured"}</h1>
        <p className="menu-copy">
          {isSiteLockEnabled()
            ? "This site is locked. Enter the password to continue."
            : "Set `SITE_PASSWORD` in the environment to enable the lock screen."}
        </p>

        {showError ? <p className="menu-error">Incorrect password.</p> : null}

        {isSiteLockEnabled() ? (
          <form action="/api/unlock" className="menu-actions" method="post">
            <input name="next" type="hidden" value={nextPath} />
            <label className="menu-field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                autoFocus
                name="password"
                spellCheck={false}
                type="password"
              />
            </label>
            <button className="primary-button menu-button" type="submit">
              Unlock
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
