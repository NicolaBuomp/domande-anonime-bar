import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// unit: nessun DB. integration (+ rls): richiedono `supabase start`.
export default defineConfig({
  resolve: {
    alias: {
      "@": r("./src"),
      // fuori dal bundler di Next `server-only` lancia sempre: nei test è un no-op
      "server-only": r("./tests/setup/empty.ts"),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts", "tests/rls/**/*.test.ts"],
          globalSetup: ["tests/setup/global.ts"],
          setupFiles: ["tests/setup/env.ts"],
          // un solo DB condiviso: i file girano in sequenza
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
