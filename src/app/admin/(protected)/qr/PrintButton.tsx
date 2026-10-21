"use client";

import { t } from "@/lib/strings";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary min-h-12 px-6 text-lg"
    >
      {t.qr.print}
    </button>
  );
}
