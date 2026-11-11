'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClientSafe } from '@/lib/supabase/browser';
import '@/components/booking/booking.css';

function AdminLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if already signed in.
    fetch('/api/admin/session')
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.configured));
        if (d.authenticated) router.replace(next);
      })
      .catch(() => setConfigured(false));
  }, [router, next]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const supabase = createBrowserClientSafe();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message || 'Invalid email or password.');
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Sign-in failed. Check that Supabase is configured.',
      );
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-box">
        <Link href="/" className="brand" style={{ justifyContent: 'center' }}>
          <img className="brand-logo" src="/imgs/logo.jpeg" alt="" />
          <span className="brand-wordmark">
            <span className="brand-name">JESS<span className="brand-period">.</span></span>
            <span className="brand-caption">SALON AT HOME</span>
          </span>
        </Link>
        <h1>Admin sign in</h1>
        <p>Private dashboard for JESS. Only authorized accounts can access bookings.</p>

        {configured === false && (
          <div className="err">
            Supabase is not configured. Set the required environment variables before signing in.
            See <b>.env.example</b>.
          </div>
        )}
        {error && <div className="err">{error}</div>}

        <form onSubmit={signIn}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>
          <div className="book-actions" style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={loading || configured === false} style={{ width: '100%' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="admin-login">Loading…</div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
