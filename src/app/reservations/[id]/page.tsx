"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Reservation = {
  id: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  product: {
    name: string;
    sku: string;
    priceCents: number;
  };
  warehouse: {
    code: string;
    name: string;
    city: string;
  };
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatRemaining(ms: number) {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ReservationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"confirm" | "release" | null>(
    null,
  );
  const [now, setNow] = useState(0);

  const loadReservation = useCallback(async () => {
    const response = await fetch(`/api/reservations/${params.id}`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Could not load reservation.");
      setReservation(null);
      return;
    }

    setReservation(data.reservation);
  }, [params.id]);

  useEffect(() => {
    loadReservation()
      .catch(() => setError("Could not load reservation."))
      .finally(() => setLoading(false));
  }, [loadReservation]);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingMs = useMemo(() => {
    if (!reservation) {
      return 0;
    }

    return new Date(reservation.expiresAt).getTime() - now;
  }, [now, reservation]);

  async function submit(action: "confirm" | "release") {
    setSubmitting(action);
    setError(null);

    try {
      const response = await fetch(`/api/reservations/${params.id}/${action}`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Request failed.");
        await loadReservation();
        return;
      }

      setReservation(data.reservation);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  const pending = reservation?.status === "PENDING";

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-stone-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8 sm:px-8">
        <Link
          href="/"
          className="w-fit text-sm font-semibold text-teal-700 hover:text-teal-900"
        >
          Back to inventory
        </Link>

        <div className="border border-stone-300 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Checkout reservation
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Hold details
          </h1>

          {error ? (
            <div className="mt-5 border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="mt-6 text-stone-600">Loading reservation...</p>
          ) : reservation ? (
            <div className="mt-6 grid gap-5">
              <div className="grid gap-3 border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-stone-500">Product</p>
                  <p className="font-semibold">{reservation.product.name}</p>
                  <p className="text-sm text-stone-600">
                    {reservation.product.sku}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-stone-500">Warehouse</p>
                  <p className="font-semibold">{reservation.warehouse.code}</p>
                  <p className="text-sm text-stone-600">
                    {reservation.warehouse.city}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-stone-500">Quantity</p>
                  <p className="font-semibold">{reservation.quantity}</p>
                </div>
                <div>
                  <p className="text-sm text-stone-500">Total</p>
                  <p className="font-semibold">
                    {formatMoney(
                      reservation.product.priceCents * reservation.quantity,
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 border border-stone-300 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm text-stone-500">Status</p>
                  <p className="text-xl font-semibold">{reservation.status}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm text-stone-500">Expires in</p>
                  <p className="font-mono text-3xl font-semibold">
                    {pending ? formatRemaining(remainingMs) : "0:00"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={!pending || submitting !== null}
                  onClick={() => submit("confirm")}
                  className="h-11 flex-1 border border-stone-950 bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
                >
                  {submitting === "confirm" ? "Confirming..." : "Confirm purchase"}
                </button>
                <button
                  type="button"
                  disabled={!pending || submitting !== null}
                  onClick={() => submit("release")}
                  className="h-11 flex-1 border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-950 transition hover:border-red-700 hover:text-red-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500"
                >
                  {submitting === "release" ? "Cancelling..." : "Cancel"}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-stone-600">Reservation not found.</p>
          )}
        </div>
      </section>
    </main>
  );
}
