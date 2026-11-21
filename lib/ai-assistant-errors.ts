const aiAssistantCallableErrors: Record<string, string> = {
  "functions/not-found": "AI সহকারীর backend এখনো চালু হয়নি। অ্যাপের সহায়তা বিভাগে জানান।",
  "functions/unauthenticated": "AI সহকারী ব্যবহার করতে আগে লগইন করুন।",
  "functions/permission-denied": "এই অনুরোধের অনুমতি নেই। অ্যাপ আপডেট করুন বা সহায়তায় জানান।",
  "functions/failed-precondition": "AI সহকারী বর্তমানে বন্ধ আছে। পরে আবার চেষ্টা করুন।",
  "functions/internal": "AI সার্ভারে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
  "functions/unavailable": "AI সার্ভিস সাময়িকভাবে পাওয়া যাচ্ছে না। একটু পরে চেষ্টা করুন।",
  "functions/deadline-exceeded": "AI সহকারীর উত্তর পেতে বেশি সময় লাগছে। আবার চেষ্টা করুন।",
  "functions/network-request-failed": "ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
};

export function getAiAssistantErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code).toLowerCase()
      : "";
  const normalizedCode = code.startsWith("functions/") ? code : `functions/${code}`;
  return (
    aiAssistantCallableErrors[normalizedCode] ||
    "AI সহকারীর অনুরোধ সম্পন্ন করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।"
  );
}
