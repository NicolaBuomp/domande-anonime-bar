import { t } from "@/lib/strings";

// Placeholder di S0: il form vero arriva in S1 (docs/plan.md).
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">{t.form.title}</h1>
      <p className="mt-2 text-base opacity-80">{t.form.subtitle}</p>
    </main>
  );
}
