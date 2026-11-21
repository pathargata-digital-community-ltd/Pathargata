import { describe, expect, it } from "vitest";
import { getAiAssistantErrorMessage } from "../lib/ai-assistant-errors";

describe("AI assistant Firebase callable error messages", () => {
  it.each([
    ["functions/not-found", "AI সহকারীর backend এখনো চালু হয়নি। অ্যাপের সহায়তা বিভাগে জানান।"],
    ["functions/unauthenticated", "AI সহকারী ব্যবহার করতে আগে লগইন করুন।"],
    ["functions/permission-denied", "এই অনুরোধের অনুমতি নেই। অ্যাপ আপডেট করুন বা সহায়তায় জানান।"],
    ["functions/failed-precondition", "AI সহকারী বর্তমানে বন্ধ আছে। পরে আবার চেষ্টা করুন।"],
    ["functions/internal", "AI সার্ভারে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"],
    ["functions/unavailable", "AI সার্ভিস সাময়িকভাবে পাওয়া যাচ্ছে না। একটু পরে চেষ্টা করুন।"],
    ["functions/deadline-exceeded", "AI সহকারীর উত্তর পেতে বেশি সময় লাগছে। আবার চেষ্টা করুন।"],
    ["functions/network-request-failed", "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"],
  ])("maps %s to an actionable Bengali message", (code, expected) => {
    expect(getAiAssistantErrorMessage({ code })).toBe(expected);
  });

  it("does not expose raw provider or backend error text", () => {
    const message = getAiAssistantErrorMessage({
      code: "functions/internal",
      message: "private provider diagnostic: secret-value",
    });
    expect(message).not.toContain("private provider");
    expect(message).not.toContain("secret-value");
  });

  it("does not mislabel unknown Firebase errors as internet failures", () => {
    expect(getAiAssistantErrorMessage({ code: "functions/unknown" })).not.toContain("ইন্টারনেট");
  });
});
