import { describe, expect, it } from "vitest";
import {
  BLOOD_REQUEST_STATUSES,
  GENERIC_BLOOD_NOTIFICATION,
  canNotifyDonor,
  getOwnDonorDeletionPath,
  getPrivateBloodRequestPath,
  isBloodRequestStatus,
  isDonorResponse,
  normalizeBangladeshMobile,
} from "../lib/blood-donor";

describe("getOwnDonorDeletionPath", () => {
  it("returns only the signed-in user's donor record path", () => {
    expect(getOwnDonorDeletionPath("user-1", "user-1")).toBe("donors/user-1");
  });

  it.each([
    [null, "user-1"],
    ["", "user-1"],
    ["user-1", null],
    ["user-1", ""],
    ["user-1", "user-2"],
  ])(
    "refuses deletion when current UID %s and donor UID %s do not match",
    (currentUid, donorUid) => {
      expect(getOwnDonorDeletionPath(currentUid, donorUid)).toBeNull();
    },
  );
});

describe("blood privacy workflow", () => {
  const request = { bloodGroup: "A+", area: "Kalmegha Union" };
  it("only matches opted-in, available donors in the requested area and group", () => {
    expect(canNotifyDonor({ receiveBloodRequestNotifications: true, bloodGroup: "A+", serviceArea: "Kalmegha Union" }, request)).toBe(true);
    expect(canNotifyDonor({ receiveBloodRequestNotifications: false, bloodGroup: "A+", serviceArea: "Kalmegha Union" }, request)).toBe(false);
    expect(canNotifyDonor({ receiveBloodRequestNotifications: true, temporarilyUnavailable: true, bloodGroup: "A+", serviceArea: "Kalmegha Union" }, request)).toBe(false);
    expect(canNotifyDonor({ receiveBloodRequestNotifications: true, bloodGroup: "B+", serviceArea: "Kalmegha Union" }, request)).toBe(false);
    expect(canNotifyDonor({ receiveBloodRequestNotifications: true, bloodGroup: "A+", serviceArea: "Raihanpur" }, request)).toBe(false);
  });

  it("keeps requester contact in a separate private queue path", () => {
    expect(getPrivateBloodRequestPath("req-1")).toBe("blood_request_private/req-1");
  });

  it("uses generic notification copy without patient or contact details", () => {
    expect(GENERIC_BLOOD_NOTIFICATION.body).not.toMatch(/01\\d{9}|hospital|patient/i);
    expect(GENERIC_BLOOD_NOTIFICATION.body).toContain("অ্যাপে সাইন ইন");
  });

  it("recognizes documented request lifecycle states and donor responses", () => {
    expect(BLOOD_REQUEST_STATUSES).toEqual(["new", "verification_in_progress", "awaiting_donor_response", "donor_responded", "arrangements_confirmed", "completed", "cancelled", "expired"]);
    expect(isBloodRequestStatus("awaiting_donor_response")).toBe(true);
    expect(isBloodRequestStatus("donor_responded")).toBe(true);
    expect(isBloodRequestStatus("expired")).toBe(true);
    expect(isBloodRequestStatus("unknown")).toBe(false);
    expect(isDonorResponse("can_donate")).toBe(true);
    expect(isDonorResponse("unavailable")).toBe(true);
    expect(isDonorResponse("need_information")).toBe(true);
    expect(isDonorResponse("approved")).toBe(false);
  });
});

describe("Bangladesh mobile input normalization", () => {
  it("converts Bengali numerals to the ASCII format required by database rules", () => {
    expect(normalizeBangladeshMobile("০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
    expect(normalizeBangladeshMobile("01712345678")).toBe("01712345678");
  });
});
