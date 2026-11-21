import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const LEGACY_SAVED_ACCOUNTS_KEY = "pathargata_saved_accounts_v1";
const LEGACY_CREDENTIAL_KEY_PREFIX = "pathargata_saved_login_v1_";

function readLegacyAccountUids(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return [
      ...new Set(
        parsed
          .map((entry) =>
            entry && typeof entry === "object" && "uid" in entry
              ? entry.uid
              : null,
          )
          .filter(
            (uid): uid is string =>
              typeof uid === "string" && uid.length > 0 && uid.length <= 128,
          ),
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * Remove email/password records created by the former app-managed saved-login
 * feature. The registry is read only to enumerate its per-user SecureStore keys;
 * no values are returned to the application or used for authentication.
 *
 * This is intentionally safe to run on each native startup: successful cleanup
 * removes the registry, and failures can be retried on the next launch.
 */
export async function clearLegacySavedLogins(): Promise<void> {
  if (Platform.OS === "web") return;

  const legacyAccounts = await SecureStore.getItemAsync(
    LEGACY_SAVED_ACCOUNTS_KEY,
  );
  const accountUids = readLegacyAccountUids(legacyAccounts);

  for (const uid of accountUids) {
    await SecureStore.deleteItemAsync(`${LEGACY_CREDENTIAL_KEY_PREFIX}${uid}`);
  }

  await SecureStore.deleteItemAsync(LEGACY_SAVED_ACCOUNTS_KEY);
}
