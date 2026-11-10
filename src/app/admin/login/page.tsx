"use client";

/**
 * JESS admin sign-in page.
 *
 * Standalone page (NOT wrapped in <AppShell>). Renders a centered
 * `.login-shell` (full-viewport onyx) with a `.login-card` and a Supabase
 * Auth password form. On success, navigates to /admin.
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("Invalid email or password.");
        return;
      }

      const response = await fetch("/api/admin/bookings?status=paid", {
        cache: "no-store",
      });
      if (response.status === 401) {
        await supabase.auth.signOut();
        setError("This account is not authorized to access the JESS admin area.");
        return;
      }
      if (!response.ok) {
        throw new Error("Admin access could not be verified. Please try again.");
      }

      router.replace("/admin");
    } catch (signInFailure) {
      setError(
        signInFailure instanceof Error
          ? signInFailure.message
          : "Sign in failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <p className="eyebrow">JESS SALON AT HOME</p>
        <h1>Admin sign in</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting}
              placeholder="you@jesssalonathome.ph"
            />
          </div>

          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-gold btn-block"
            disabled={submitting || !email || !password}
            style={{ marginTop: 18 }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p
          style={{
            marginTop: 22,
            fontSize: 11,
            letterSpacing: ".04em",
            color: "#9a8d7c",
            textAlign: "center",
          }}
        >
          This area is private. JESS only.
        </p>
      </div>
    </main>
  );
}
