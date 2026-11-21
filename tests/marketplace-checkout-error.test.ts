import { describe, expect, it } from "vitest";
import { getMarketplaceCheckoutErrorMessage } from "../lib/marketplace-checkout-error";

describe("getMarketplaceCheckoutErrorMessage", () => {
  it("explains a missing deployed checkout callable", () => {
    expect(getMarketplaceCheckoutErrorMessage({ code: "functions/not-found" })).toContain("Functions deploy");
  });

  it("replaces a generic Internal error with an actionable server diagnosis", () => {
    expect(getMarketplaceCheckoutErrorMessage({ code: "functions/internal", message: "Internal" })).toContain("Firebase Functions deploy ও logs");
  });

  it("guides the user to sign in or register the App Check debug token", () => {
    expect(getMarketplaceCheckoutErrorMessage({ code: "functions/unauthenticated" })).toContain("লগইন");
    expect(getMarketplaceCheckoutErrorMessage({ code: "functions/permission-denied" })).toContain("App Check");
  });

  it("preserves useful server validation messages", () => {
    expect(getMarketplaceCheckoutErrorMessage({ code: "functions/failed-precondition", message: "Stock নেই।" })).toBe("Stock নেই।");
  });
});
