import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";
import { authDebug, authFailure } from "@/lib/safe-logger";

export type User = {
  id: number | string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

export async function getSessionToken(): Promise<string | null> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      authDebug("session_retrieval_skipped", { platform: "web" });
      return null;
    }

    // Use SecureStore for native
    authDebug("session_retrieval_started", { platform: "native" });
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    authDebug("session_retrieval_completed", { present: Boolean(token) });
    return token;
  } catch {
    authFailure("session_retrieval_failed");
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      authDebug("session_storage_skipped", { platform: "web" });
      return;
    }

    // Use SecureStore for native
    authDebug("session_storage_started", { platform: "native" });
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    authDebug("session_storage_completed");
  } catch (error) {
    authFailure("session_storage_failed", error);
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    // Web platform uses cookie-based auth, logout is handled by server clearing cookie
    if (Platform.OS === "web") {
      authDebug("session_removal_skipped", { platform: "web" });
      return;
    }

    // Use SecureStore for native
    authDebug("session_removal_started", { platform: "native" });
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    authDebug("session_removal_completed");
  } catch (error) {
    authFailure("session_removal_failed", error);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    authDebug("cached_identity_read_started");

    let info: string | null = null;
    if (Platform.OS === "web") {
      // Use localStorage for web
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      authDebug("cached_identity_missing");
      return null;
    }
    const user = JSON.parse(info);
    authDebug("cached_identity_read_completed");
    return user;
  } catch (error) {
    authFailure("cached_identity_read_failed", error);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    authDebug("cached_identity_write_started");

    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      authDebug("cached_identity_write_completed", { platform: "web" });
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
    authDebug("cached_identity_write_completed", { platform: "native" });
  } catch (error) {
    authFailure("cached_identity_write_failed", error);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch (error) {
    authFailure("cached_identity_clear_failed", error);
  }
}
