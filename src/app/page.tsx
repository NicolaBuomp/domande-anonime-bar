import Image from "next/image";
import { site } from "@/config/site";
import { t } from "@/lib/strings";
import { QuestionForm } from "./QuestionForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <Image src={site.logoSrc} alt={site.barName} width={72} height={72} unoptimized priority />
        <h1 className="text-2xl font-bold leading-tight text-balance">{t.form.title}</h1>
        <p className="text-base text-gray-700 dark:text-gray-300">{t.form.subtitle}</p>
      </header>

      <QuestionForm />

      <p className="mt-auto text-center text-sm text-gray-600 dark:text-gray-400">
        {t.form.privacy}
      </p>
    </main>
  );
}
