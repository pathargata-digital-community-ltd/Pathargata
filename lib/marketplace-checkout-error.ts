type CheckoutErrorLike = {
  code?: unknown;
  message?: unknown;
};

export function getMarketplaceCheckoutErrorMessage(error: unknown): string {
  const candidate = error && typeof error === "object" ? error as CheckoutErrorLike : {};
  const code = typeof candidate.code === "string"
    ? candidate.code.replace(/^functions\//, "")
    : "";
  if (code === "not-found") {
    return "অর্ডার সার্ভার চালু নেই বা deploy হয়নি। অ্যাপের admin-কে Firebase Functions deploy করতে বলুন।";
  }
  if (code === "internal") {
    return "অর্ডার সার্ভারে সমস্যা হয়েছে। Firebase Functions deploy ও logs পরীক্ষা করে আবার চেষ্টা করুন।";
  }
  if (code === "unauthenticated") {
    return "অর্ডার করতে লগইন করুন, তারপর আবার চেষ্টা করুন।";
  }
  if (code === "permission-denied") {
    return "নিরাপত্তা যাচাই ব্যর্থ হয়েছে। App Check debug token register করা আছে কি না দেখুন।";
  }
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.slice(0, 240);
  }
  return "অর্ডার পাঠানো যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।";
}
