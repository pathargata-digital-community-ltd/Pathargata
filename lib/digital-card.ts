export type DigitalCardProfile = {
  uid: string;
  name?: string;
  nickname?: string;
  email?: string;
  phone?: string;
  union?: string;
  village?: string;
  bio?: string;
  profession?: string;
  location?: string;
  facebook?: string;
  whatsapp?: string;
  website?: string;
  profile_pic?: string;
  joinDate?: string;
  isVerified?: boolean;
  role?: string;
  hide_phone?: boolean;
  privacy_hide_contact?: boolean;
};

type DigitalCardLinks = {
  referralUrl: string;
  appDownloadUrl?: string;
};

const VERIFIED_ROLES = new Set([
  "admin",
  "chairman",
  "doctor",
  "journalist",
  "member",
  "oc",
  "uno",
]);

export function isDigitalCardVerified(profile: Pick<DigitalCardProfile, "isVerified" | "role">) {
  return Boolean(
    profile.isVerified ||
      (profile.role && VERIFIED_ROLES.has(profile.role.toLowerCase())),
  );
}

export function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 512) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function plainText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Plain text is more widely understood by general-purpose QR scanners than a
 * vCard with custom fields. The referral URL is kept on its own line so scanners
 * can recognize it as a link when supported.
 */
export function buildDigitalCardQrText(
  profile: DigitalCardProfile,
  links: DigitalCardLinks,
) {
  const name = plainText(profile.name) || plainText(profile.nickname) || "Pathargata Digital member";
  const hiddenContacts = Boolean(profile.hide_phone || profile.privacy_hide_contact);
  const location = [profile.location, profile.village, profile.union]
    .map((part) => plainText(part, 80))
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(", ");
  const referralUrl = isPublicHttpsUrl(links.referralUrl)
    ? links.referralUrl.trim()
    : "";
  const appDownloadUrl = isPublicHttpsUrl(links.appDownloadUrl)
    ? links.appDownloadUrl.trim()
    : "";

  const lines = [
    "PATHARGATA DIGITAL | MEMBER CARD",
    `Name: ${name}`,
    `Status: ${isDigitalCardVerified(profile) ? "Verified" : "Community member"}`,
    `Member ID / referral code: ${plainText(profile.uid, 128) || "Unavailable"}`,
    profile.profession ? `Profession: ${plainText(profile.profession)}` : "",
    location ? `Area: ${location}` : "",
    !hiddenContacts && profile.phone?.trim()
      ? `Phone: ${plainText(profile.phone, 40)}`
      : "",
    !hiddenContacts && profile.email?.trim()
      ? `Email: ${plainText(profile.email, 120)}`
      : "",
    referralUrl ? "Referral / sign-up link:" : "",
    referralUrl,
    appDownloadUrl ? "App download link:" : "",
    appDownloadUrl,
  ].filter(Boolean);

  return lines.join("\n");
}
