import Image from "next/image";
import { site } from "@/config/site";
import { t } from "@/lib/strings";
import { QuestionForm } from "./QuestionForm";

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col">
      {/* testata nel nero del marchio: il logo ci si appoggia senza bordo */}
      <header className="bg-black px-5 pt-7 pb-8 text-white dark:bg-raised">
        <div className="mx-auto flex max-w-md flex-col gap-6">
          <Image
            src={site.logoSrc}
            alt={site.barName}
            width={56}
            height={56}
            unoptimized
            priority
          />
          <div className="flex flex-col gap-3">
            <h1 className="text-[2.125rem] leading-[1.05] font-bold tracking-[-0.02em] text-balance">
              {t.form.title}
            </h1>
            <p className="text-lg text-white/80">{t.form.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-5 pt-7 pb-8">
        <QuestionForm />
        <p className="mt-auto text-sm text-muted">{t.form.privacy}</p>
      </div>
    </main>
  );
}
