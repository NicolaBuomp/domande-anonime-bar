import { describe, expect, it } from "vitest";
import {
  deviceHash,
  getClientIp,
  getSalt,
  ipHash,
  isValidDeviceId,
  newDeviceId,
} from "@/lib/device";
import { ipMaxPerMinute, submissionsOpen } from "@/lib/limits";

const salt = "s".repeat(32);
const base = { ip: "1.2.3.4", userAgent: "UA", did: "d1", salt };

describe("deviceHash / ipHash", () => {
  it("è deterministico ed esadecimale da 64 caratteri", () => {
    expect(deviceHash(base)).toBe(deviceHash({ ...base }));
    expect(deviceHash(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash("1.2.3.4", salt)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["ip", { ip: "1.2.3.5" }],
    ["user agent", { userAgent: "UA2" }],
    ["did", { did: "d2" }],
    ["sale", { salt: "t".repeat(32) }],
  ])("cambia se cambia %s", (_, change) => {
    expect(deviceHash({ ...base, ...change })).not.toBe(deviceHash(base));
  });

  it("non contiene l'IP in chiaro e distingue device e ip", () => {
    expect(deviceHash(base)).not.toContain("1.2.3.4");
    expect(ipHash("1.2.3.4", salt)).not.toBe(deviceHash(base));
  });
});

describe("getClientIp", () => {
  it("preferisce x-real-ip, poi il primo di x-forwarded-for", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "9.9.9.9",
    );
    expect(getClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("device id", () => {
  it("genera UUID validi e rifiuta valori manipolati", () => {
    expect(isValidDeviceId(newDeviceId())).toBe(true);
    expect(isValidDeviceId(undefined)).toBe(false);
    expect(isValidDeviceId("x".repeat(5000))).toBe(false);
    expect(isValidDeviceId("not-a-uuid")).toBe(false);
  });
});

describe("getSalt", () => {
  it("richiede almeno 32 caratteri", () => {
    expect(() => getSalt({})).toThrow();
    expect(() => getSalt({ SUBMIT_SALT: "corto" })).toThrow();
    expect(getSalt({ SUBMIT_SALT: salt })).toBe(salt);
  });
});

describe("limits", () => {
  it("usa 30 per IP di default e accetta l'override positivo", () => {
    expect(ipMaxPerMinute({})).toBe(30);
    expect(ipMaxPerMinute({ RATE_LIMIT_IP_PER_MINUTE: "80" })).toBe(80);
    expect(ipMaxPerMinute({ RATE_LIMIT_IP_PER_MINUTE: "0" })).toBe(30);
    expect(ipMaxPerMinute({ RATE_LIMIT_IP_PER_MINUTE: "boh" })).toBe(30);
  });

  it("chiude la raccolta solo con SUBMISSIONS_OPEN=false", () => {
    expect(submissionsOpen({})).toBe(true);
    expect(submissionsOpen({ SUBMISSIONS_OPEN: "FALSE" })).toBe(false);
    expect(submissionsOpen({ SUBMISSIONS_OPEN: "true" })).toBe(true);
  });
});
