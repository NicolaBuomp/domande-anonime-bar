// Limiti antispam: unica fonte, passati come parametri a submit_question (plan §10).

export const COOLDOWN_S = 60;
export const MAX_PER_WINDOW = 10;
export const WINDOW_H = 12;
const DEFAULT_IP_MAX_PER_MIN = 30;

/** Tetto per IP al minuto, sovrascrivibile da RATE_LIMIT_IP_PER_MINUTE durante la serata. */
export function ipMaxPerMinute(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.RATE_LIMIT_IP_PER_MINUTE ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IP_MAX_PER_MIN;
}

/** Raccolta aperta salvo SUBMISSIONS_OPEN=false (kill switch). */
export function submissionsOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.SUBMISSIONS_OPEN?.trim().toLowerCase() !== "false";
}
