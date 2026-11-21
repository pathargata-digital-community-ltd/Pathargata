export const BLOOD_REQUEST_STATUSES = [
  "new",
  "verification_in_progress",
  "awaiting_donor_response",
  "donor_responded",
  "arrangements_confirmed",
  "completed",
  "cancelled",
  "expired",
] as const;

export type BloodRequestStatus = (typeof BLOOD_REQUEST_STATUSES)[number];
export type DonorResponse = "can_donate" | "unavailable" | "need_information";

export const BLOOD_REQUEST_STATUS_LABELS: Record<BloodRequestStatus, string> = {
  new: "নতুন — যাচাইয়ের অপেক্ষায়",
  verification_in_progress: "যাচাই চলছে",
  awaiting_donor_response: "ডোনারের উত্তরের অপেক্ষায়",
  donor_responded: "ডোনার সাড়া দিয়েছেন",
  arrangements_confirmed: "ব্যবস্থা নিশ্চিত",
  completed: "সম্পন্ন",
  cancelled: "বাতিল",
  expired: "সময় শেষ",
};

export const DONOR_RESPONSE_LABELS: Record<DonorResponse, string> = {
  can_donate: "সাড়া দিতে পারব",
  unavailable: "এখন পারব না",
  need_information: "আরও তথ্য চাই",
};

export const GENERIC_BLOOD_NOTIFICATION = {
  title: "রক্তের অনুরোধ",
  body: "আপনার এলাকায় একটি রক্তের অনুরোধ এসেছে। বিস্তারিত দেখতে অ্যাপে সাইন ইন করুন।",
} as const;

export function getOwnDonorDeletionPath(
  currentUid: string | null | undefined,
  donorUid: string | null | undefined,
): string | null {
  if (!currentUid || !donorUid || currentUid !== donorUid) return null;
  return `donors/${currentUid}`;
}

export function canNotifyDonor(
  donor: {
    receiveBloodRequestNotifications?: boolean;
    temporarilyUnavailable?: boolean;
    bloodGroup?: string;
    serviceArea?: string;
  },
  request: { bloodGroup: string; area: string },
): boolean {
  if (donor.receiveBloodRequestNotifications !== true) return false;
  if (donor.temporarilyUnavailable === true) return false;
  if (donor.bloodGroup !== request.bloodGroup) return false;
  const area = (request.area || "").trim().toLocaleLowerCase();
  const serviceArea = (donor.serviceArea || "").trim().toLocaleLowerCase();
  return Boolean(
    area && serviceArea &&
    (area.includes(serviceArea) || serviceArea.includes(area)),
  );
}

export function isDonorResponse(value: unknown): value is DonorResponse {
  return value === "can_donate" || value === "unavailable" || value === "need_information";
}

export function isBloodRequestStatus(value: unknown): value is BloodRequestStatus {
  return BLOOD_REQUEST_STATUSES.includes(value as BloodRequestStatus);
}

export function getPrivateBloodRequestPath(requestId: string): string {
  return `blood_request_private/${requestId}`;
}

export function normalizeBangladeshMobile(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
}
