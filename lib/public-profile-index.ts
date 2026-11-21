import { remove, ref, set } from "firebase/database";
import { pathargataDb } from "@/lib/pathargata-firebase";

const PUBLIC_PROFILE_FIELDS = [
  "name",
  "nickname",
  "profile_pic",
  "union",
  "village",
  "profession",
  "isVerified",
  "verificationCategory",
  "status",
] as const;

type ProfileRecord = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildClientPublicProfileIndex(
  uid: string,
  profile: ProfileRecord,
  profileVisibility: unknown,
): ProfileRecord | null {
  if (profileVisibility !== "everyone") return null;
  if (profile.status === "deleted" || profile.status === "deactivated") return null;

  const name = text(profile.name);
  const nickname = text(profile.nickname);
  const projection: ProfileRecord = {
    uid,
    sortName: (name || nickname || uid).toLocaleLowerCase(),
    searchName: `${name} ${nickname} ${text(profile.union)} ${text(profile.village)} ${text(profile.profession)}`
      .trim()
      .toLocaleLowerCase(),
    profileVisibility: "everyone",
  };

  for (const field of PUBLIC_PROFILE_FIELDS) {
    const value = profile[field];
    if (field === "verificationCategory" && profile.isVerified !== true) continue;
    if (typeof value === "string") projection[field] = value;
    else if (field === "isVerified" && typeof value === "boolean") projection[field] = value;
  }

  const tagPermission = profile.settings && typeof profile.settings === "object"
    ? (profile.settings as ProfileRecord).tagPermission
    : undefined;
  if (tagPermission === "none" || tagPermission === "friends" || tagPermission === "everyone") {
    projection.tagPermission = tagPermission;
  }
  return projection;
}

export async function syncClientPublicProfileIndex(
  uid: string,
  profile: ProfileRecord,
  profileVisibility: unknown,
): Promise<void> {
  const indexRef = ref(pathargataDb, `people_index/${uid}`);
  const projection = buildClientPublicProfileIndex(uid, profile, profileVisibility);
  if (projection) await set(indexRef, projection);
  else await remove(indexRef);
}
