import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl, toAppError } from "./fileService";

describe("external URL validation", () => {
  it("allows http and https", () => {
    expect(isAllowedExternalUrl("https://example.com")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com/page?q=1")).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "mailto:someone@example.com",
    "tauri://localhost",
  ])("blocks %s", (url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });

  it("blocks relative and malformed URLs", () => {
    expect(isAllowedExternalUrl("/local/path")).toBe(false);
    expect(isAllowedExternalUrl("#section")).toBe(false);
    expect(isAllowedExternalUrl("")).toBe(false);
    expect(isAllowedExternalUrl("not a url at all")).toBe(false);
  });
});

describe("error normalization", () => {
  it("passes a structured error from Rust through unchanged", () => {
    const fromRust = {
      code: "PERMISSION_DENIED",
      message: "Permission denied.",
      details: "os error 13",
    };

    expect(toAppError(fromRust)).toEqual(fromRust);
  });

  it("wraps a thrown Error without exposing it as the main message", () => {
    const result = toAppError(
      new Error("TypeError: undefined is not a function"),
    );

    expect(result.code).toBe("UNKNOWN");
    // Raw technical text belongs in details, never in the primary message.
    expect(result.message).toBe("Something went wrong.");
    expect(result.details).toContain("undefined is not a function");
  });

  it("wraps a thrown string", () => {
    const result = toAppError("something broke");

    expect(result.code).toBe("UNKNOWN");
    expect(result.details).toBe("something broke");
  });

  it("handles a thrown value with no useful information", () => {
    expect(toAppError(null).code).toBe("UNKNOWN");
    expect(toAppError(undefined).code).toBe("UNKNOWN");
    expect(toAppError({ nope: true }).code).toBe("UNKNOWN");
  });
});
