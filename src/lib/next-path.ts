// Destinazione dopo il login: solo percorsi interni sotto /admin (niente open redirect).
export function safeAdminPath(next: unknown): string {
  if (typeof next !== "string") return "/admin";
  if (next !== "/admin" && !next.startsWith("/admin/")) return "/admin";
  if (next.includes("\\") || next.startsWith("/admin/login")) return "/admin";
  return next;
}
