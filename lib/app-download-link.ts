import { get, ref } from "firebase/database";
import { safeHttpsUrl } from "@/lib/app-version";
import { pathargataDb } from "@/lib/pathargata-firebase";

const PREFERRED_KEYS = [
  "downloadUrl",
  "downloadURL",
  "download_url",
  "appDownloadUrl",
  "app_download_url",
  "appDownloadLink",
  "app_download_link",
  "androidDownloadUrl",
  "android_download_url",
  "apkUrl",
  "apk_url",
  "playStoreUrl",
  "play_store_url",
  "storeUrl",
  "store_url",
  "appUrl",
  "app_url",
];

type UnknownRecord = Record<string, unknown>;

function findDownloadLink(value: unknown, depth = 0): string | null {
  if (depth > 3 || value === null || value === undefined) return null;
  const direct = safeHttpsUrl(value);
  if (direct) return direct;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as UnknownRecord;
  for (const key of PREFERRED_KEYS) {
    const match = safeHttpsUrl(record[key]);
    if (match) return match;
  }
  for (const [key, child] of Object.entries(record)) {
    if (/download|apk|play.?store|app.?url|store.?url/i.test(key)) {
      const match = findDownloadLink(child, depth + 1);
      if (match) return match;
    }
  }
  return null;
}

/** Reads the public admin-configured app link without exposing arbitrary protocols. */
export async function loadAdminDownloadLink(): Promise<string | null> {
  try {
    const [adminSettings, appInfo] = await Promise.all([
      get(ref(pathargataDb, "admin_settings")),
      get(ref(pathargataDb, "app_info")),
    ]);
    return findDownloadLink(adminSettings.val()) || findDownloadLink(appInfo.val());
  } catch {
    return null;
  }
}
