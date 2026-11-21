import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  buildDigitalCardQrText,
  isDigitalCardVerified,
  isPublicHttpsUrl,
} from "../lib/digital-card";

const links = {
  referralUrl: "https://pathargata-digital-community-ltd.github.io/Pathargata/auth?ref=member-123",
};
const linksWithAdminDownload = {
  ...links,
  appDownloadUrl: "https://example.org/pathargata.apk",
};

describe("digital card QR text", () => {
  it("recognizes explicit verification and trusted community roles", () => {
    expect(isDigitalCardVerified({ isVerified: true })).toBe(true);
    expect(isDigitalCardVerified({ role: "journalist" })).toBe(true);
    expect(isDigitalCardVerified({ role: "user" })).toBe(false);
  });

  it("contains readable profile details and separate scanner-detectable HTTPS links", () => {
    const card = buildDigitalCardQrText(
      {
        uid: "member-123",
        name: "রহিম উদ্দিন",
        profession: "শিক্ষক",
        village: "কাকচিড়া",
        union: "কাকচিড়া",
        phone: "01712345678",
        email: "member@example.org",
        isVerified: true,
      },
      linksWithAdminDownload,
    );

    expect(card).toContain("PATHARGATA DIGITAL | MEMBER CARD");
    expect(card).toContain("Name: রহিম উদ্দিন");
    expect(card).toContain("Status: Verified");
    expect(card).toContain("Member ID / referral code: member-123");
    expect(card).toContain("Profession: শিক্ষক");
    expect(card).toContain("Area: কাকচিড়া");
    expect(card).toContain("Phone: 01712345678");
    expect(card).toContain("Email: member@example.org");
    expect(card).toContain(`\n${links.referralUrl}`);
    expect(card).toContain("App download link:");
    expect(card).toContain(`\n${linksWithAdminDownload.appDownloadUrl}`);
    expect(card).not.toContain("BEGIN:VCARD");
  });

  it("does not expose phone or email when contact privacy is enabled", () => {
    const hiddenPhone = buildDigitalCardQrText(
      { uid: "member-123", phone: "01712345678", email: "member@example.org", hide_phone: true },
      links,
    );
    const hiddenContacts = buildDigitalCardQrText(
      { uid: "member-123", phone: "01712345678", email: "member@example.org", privacy_hide_contact: true },
      links,
    );

    expect(hiddenPhone).not.toContain("01712345678");
    expect(hiddenPhone).not.toContain("member@example.org");
    expect(hiddenContacts).not.toContain("01712345678");
    expect(hiddenContacts).not.toContain("member@example.org");
  });

  it("prevents profile text from injecting fake lines or links", () => {
    const card = buildDigitalCardQrText(
      { uid: "member-123", name: "Rahim\nDownload: https://bad.example" },
      links,
    );
    expect(card).toContain("Name: Rahim Download: https://bad.example");
    expect(card).not.toContain("\nDownload: https://bad.example");
  });

  it("includes only a bounded HTTPS Admin-managed app download URL in the user QR payload", () => {
    const card = buildDigitalCardQrText(
      { uid: "member-123", name: "Rahim" },
      linksWithAdminDownload,
    );
    expect(card).toContain(linksWithAdminDownload.appDownloadUrl);
    expect(card).not.toContain("appDownloadUrl");

    const invalidUrlCard = buildDigitalCardQrText(
      { uid: "member-123", name: "Rahim" },
      { ...links, appDownloadUrl: "http://example.org/pathargata.apk" },
    );
    expect(invalidUrlCard).not.toContain("App download link:");
    expect(invalidUrlCard).not.toContain("example.org/pathargata.apk");
  });

  it("fits a representative member QR at a phone-friendly 280-pixel display size", () => {
    const card = buildDigitalCardQrText(
      {
        uid: "member-test-123456",
        name: "পাথরঘাটা ডিজিটাল সদস্য",
        profession: "শিক্ষক",
        village: "কাকচিড়া",
        union: "পাথরঘাটা",
        phone: "01712345678",
        email: "member@example.org",
        isVerified: true,
      },
      linksWithAdminDownload,
    );
    const qr = QRCode.create(card, { errorCorrectionLevel: "M" });
    expect(280 / qr.modules.size).toBeGreaterThanOrEqual(2.4);
  });

  it("accepts only bounded HTTPS referral URLs", () => {
    expect(isPublicHttpsUrl("https://example.org/app.apk")).toBe(true);
    expect(isPublicHttpsUrl("http://example.org/app.apk")).toBe(false);
    expect(isPublicHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicHttpsUrl("not a URL")).toBe(false);
    expect(isPublicHttpsUrl(`https://example.org/${"x".repeat(512)}`)).toBe(false);
    expect(isPublicHttpsUrl("https://user:password@example.org/app.apk")).toBe(false);
  });
});
