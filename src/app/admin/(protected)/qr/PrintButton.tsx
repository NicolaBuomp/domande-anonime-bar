"use client";

import { t } from "@/lib/strings";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-12 rounded-xl bg-amber-500 px-6 text-lg font-bold text-gray-950 hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
    >
      {t.qr.print}
    </button>
  );
}
