"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  stock: StockLevel[];
};

type StockLevel = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  city: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

type ProductsResponse = {
  products: Product[];
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    setLoading(true);
    const response = await fetch("/api/products", { cache: "no-store" });
    const data = (await response.json()) as ProductsResponse;
    setProducts(data.products);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts().catch(() => {
      setError("Could not load products.");
      setLoading(false);
    });
  }, []);

  const totalAvailable = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum +
          product.stock.reduce(
            (stockSum, stockLevel) => stockSum + stockLevel.availableUnits,
            0,
          ),
        0,
      ),
    [products],
  );

  async function reserve(productId: string, warehouseId: string) {
    const key = `${productId}:${warehouseId}`;
    setBusyKey(key);
    setError(null);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not reserve stock.");
        await loadProducts();
        return;
      }

      router.push(`/reservations/${data.reservation.id}`);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-stone-950">
      <section className="border-b border-stone-300 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                Allo checkout holds
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">
                Inventory reservations
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="border border-stone-300 bg-stone-50 px-4 py-3">
                <p className="text-stone-500">Products</p>
                <p className="text-2xl font-semibold">{products.length}</p>
              </div>
              <div className="border border-stone-300 bg-stone-50 px-4 py-3">
                <p className="text-stone-500">Available</p>
                <p className="text-2xl font-semibold">{totalAvailable}</p>
              </div>
            </div>
          </div>

          {error ? (
            <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {loading ? (
          <div className="border border-stone-300 bg-white p-6 text-stone-600">
            Loading inventory...
          </div>
        ) : (
          <div className="grid gap-5">
            {products.map((product) => (
              <article
                key={product.id}
                className="border border-stone-300 bg-white p-5"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold">{product.name}</h2>
                      <span className="border border-stone-300 px-2 py-1 text-xs font-medium text-stone-600">
                        {product.sku}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                      {product.description}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    {formatMoney(product.priceCents)}
                  </p>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {product.stock.map((stockLevel) => {
                    const key = `${product.id}:${stockLevel.warehouseId}`;
                    const isBusy = busyKey === key;
                    const isUnavailable = stockLevel.availableUnits <= 0;

                    return (
                      <div
                        key={stockLevel.warehouseId}
                        className="flex min-h-44 flex-col justify-between border border-stone-200 bg-stone-50 p-4"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">
                                {stockLevel.warehouseCode}
                              </p>
                              <p className="text-sm text-stone-600">
                                {stockLevel.city}
                              </p>
                            </div>
                            <p className="text-2xl font-semibold">
                              {stockLevel.availableUnits}
                            </p>
                          </div>
                          <p className="mt-3 text-xs text-stone-500">
                            {stockLevel.reservedUnits} reserved from{" "}
                            {stockLevel.totalUnits} total units
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={isBusy || isUnavailable}
                          onClick={() =>
                            reserve(product.id, stockLevel.warehouseId)
                          }
                          className="mt-4 h-10 border border-stone-950 bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-500"
                        >
                          {isBusy
                            ? "Reserving..."
                            : isUnavailable
                              ? "No stock"
                              : "Reserve"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
