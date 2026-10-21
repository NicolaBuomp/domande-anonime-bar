import { describe, expect, it } from "vitest";
import { safeAdminPath } from "@/lib/next-path";

describe("safeAdminPath", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/qr", "/admin/qr"],
  ])("accetta %s", (input, out) => {
    expect(safeAdminPath(input)).toBe(out);
  });

  it.each([
    undefined,
    "",
    "https://evil.example/admin",
    "//evil.example/admin",
    "/admin\\..\\evil",
    "/screen",
    "/adminfoo",
    "/admin/login",
    ["/admin"],
  ])("rifiuta %s → /admin", (input) => {
    expect(safeAdminPath(input)).toBe("/admin");
  });
});
