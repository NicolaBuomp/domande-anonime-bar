import type { Database } from "@/lib/database.types";

export type Question = Database["public"]["Tables"]["questions"]["Row"];

// Colonne esplicite: niente select("*"), così un campo aggiunto per sbaglio non finisce in UI.
export const QUESTION_COLUMNS = "id,text,nickname,status,created_at,on_air_at,read_at" as const;
