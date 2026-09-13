import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  validatePassword,
  parseCredentials,
  parseEmail,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/validation";

describe("isValidEmail", () => {
  it("accepts a normal email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });
  it("rejects malformed emails", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    expect(validatePassword("short")).toContain(String(MIN_PASSWORD_LENGTH));
  });
  it("accepts long-enough passwords", () => {
    expect(validatePassword("longenough")).toBeNull();
  });
});

describe("parseCredentials", () => {
  it("trims and returns valid credentials", () => {
    const result = parseCredentials({
      email: "  user@example.com ",
      password: "password123",
    });
    expect(result).toEqual({
      ok: true,
      data: { email: "user@example.com", password: "password123" },
    });
  });
  it("fails on invalid email", () => {
    const result = parseCredentials({ email: "bad", password: "password123" });
    expect(result.ok).toBe(false);
  });
  it("fails on short password", () => {
    const result = parseCredentials({
      email: "user@example.com",
      password: "x",
    });
    expect(result.ok).toBe(false);
  });
  it("handles non-string input safely", () => {
    const result = parseCredentials({ email: 42, password: null });
    expect(result.ok).toBe(false);
  });
});

describe("parseEmail", () => {
  it("normalizes a valid email", () => {
    expect(parseEmail(" User@Example.com ")).toEqual({
      ok: true,
      email: "User@Example.com",
    });
  });
  it("fails on invalid email", () => {
    expect(parseEmail("nope").ok).toBe(false);
  });
});
