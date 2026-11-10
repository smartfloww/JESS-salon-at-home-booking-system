"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function MockCheckoutContent() {
  const params = useSearchParams();
  const session = params.get("session") ?? "";
  const router = useRouter();

  const [reference, setReference] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [loading, setLoading] = useState(!!session);
  const [busy, setBusy] = useState<"success" | "cancel" | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch(`/api/bookings/by-session?session=${encodeURIComponent(session)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setLookupFailed(true);
          setLoading(false);
          return;
        }
        if (!r.ok) {
          setLookupFailed(true);
          setLoading(false);
          return;
        }
        const data = (await r.json()) as { reference: string; status: string };
        setReference(data.reference);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLookupFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const onSuccess = async () => {
    if (!reference) return;
    setBusy("success");
    try {
      const res = await fetch("/api/bookings/mock-succeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Could not simulate payment.");
        setBusy(null);
        return;
      }
      router.push(
        `/book/result?ref=${encodeURIComponent(reference)}&status=success`,
      );
    } catch {
      toast.error("Something went wrong simulating payment.");
      setBusy(null);
    }
  };

  const onCancel = () => {
    if (!reference) return;
    setBusy("cancel");
    router.push(
      `/book/result?ref=${encodeURIComponent(reference)}&status=cancel`,
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f0e7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "#fff",
          border: "1px solid #e5dccb",
          padding: "36px 30px",
          boxShadow: "0 12px 40px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src="/logo.jpeg"
            alt=""
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              margin: "0 auto 14px",
            }}
          />
          <div
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "-.01em",
              color: "#1a1817",
              marginBottom: 6,
            }}
          >
            JESS Salon at Home
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#8a7443",
            }}
          >
            Mock Checkout
          </div>
        </div>

        <div
          className="policy-box"
          style={{ marginBottom: 22, marginTop: 0 }}
        >
          This is a simulated checkout for development. No real payment is
          processed.
        </div>

        {loading ? (
          <p
            style={{
              fontSize: 13,
              color: "#5d5247",
              textAlign: "center",
              padding: "14px 0",
            }}
          >
            Looking up your booking…
          </p>
        ) : lookupFailed || !reference ? (
          <div className="combo-warning" style={{ marginBottom: 18 }}>
            We couldn&apos;t find a booking for this checkout session. The link
            may have expired.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                color: "#5d5247",
                padding: "10px 0",
                borderBottom: "1px dashed rgba(98,87,75,.2)",
                marginBottom: 18,
              }}
            >
              <span>Booking reference</span>
              <strong style={{ color: "#1a1817" }}>{reference}</strong>
            </div>
            <button
              type="button"
              className="btn btn-gold btn-block"
              onClick={onSuccess}
              disabled={busy !== null}
              style={{ marginBottom: 10 }}
            >
              {busy === "success" ? "Processing…" : "Simulate successful payment"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={onCancel}
              disabled={busy !== null}
            >
              Simulate cancellation
            </button>
          </>
        )}

        <p
          style={{
            fontSize: 10,
            color: "#9a9081",
            textAlign: "center",
            marginTop: 22,
            letterSpacing: ".05em",
          }}
        >
          JESS Salon at Home — development environment
        </p>
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#f6f0e7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 22,
          }}
        >
          <div style={{ fontSize: 14, color: "#5d5247" }}>Loading…</div>
        </div>
      }
    >
      <MockCheckoutContent />
    </Suspense>
  );
}
