import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import { networkDebug, networkFailure } from "@/lib/safe-logger";
import * as Auth from "./auth";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Determine the auth method:
  // - Native platform: use stored session token as Bearer auth
  // - Web (including iframe): use cookie-based auth (browser handles automatically)
  //   Cookie is set on backend domain via POST /api/auth/session after receiving token via postMessage
  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    networkDebug("request_prepared", { platform: "native" });
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
      networkDebug("request_auth_attached");
    }
  } else {
    networkDebug("request_prepared", { platform: "web" });
  }

  const baseUrl = getApiBaseUrl();
  // Ensure no double slashes between baseUrl and endpoint
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;
  try {
    networkDebug("request_started");
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    networkDebug("response_received", { status: response.status });
    if (!response.ok) {
      await response.text();
      networkFailure("request_rejected", undefined, { status: response.status });
      throw new Error("অনুরোধ সম্পন্ন করা যায়নি");
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      networkDebug("json_response_received");
      return data as T;
    }

    const text = await response.text();
    networkDebug("text_response_received");
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    networkFailure("request_failed", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred");
  }
}

// OAuth callback handler - exchange code for session token
// Calls /api/oauth/mobile endpoint which returns JSON with app_session_id and user
export async function exchangeOAuthCode(
  code: string,
  state: string,
): Promise<{ sessionToken: string; user: any }> {
  networkDebug("oauth_exchange_started");
  // Use GET with query params
  const params = new URLSearchParams({ code, state });
  const endpoint = `/api/oauth/mobile?${params.toString()}`;
  networkDebug("oauth_exchange_request_sent");
  const result = await apiCall<{ app_session_id: string; user: any }>(endpoint);

  // Convert app_session_id to sessionToken for compatibility
  const sessionToken = result.app_session_id;
  networkDebug("oauth_exchange_completed");

  return {
    sessionToken,
    user: result.user,
  };
}

// Logout
export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", {
    method: "POST",
  });
}

// Get current authenticated user (web uses cookie-based auth)
export async function getMe(): Promise<{
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
} | null> {
  try {
    const result = await apiCall<{ user: any }>("/api/auth/me");
    return result.user || null;
  } catch (error) {
    networkFailure("current_user_fetch_failed", error);
    return null;
  }
}

// Establish session cookie on the backend (3000-xxx domain)
// Called after receiving token via postMessage to get a proper Set-Cookie from the backend
export async function establishSession(token: string): Promise<boolean> {
  try {
    networkDebug("session_cookie_setup_started");
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/auth/session`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include", // Important: allows Set-Cookie to be stored
    });

    if (!response.ok) {
      networkFailure("session_cookie_setup_rejected", undefined, { status: response.status });
      return false;
    }

    networkDebug("session_cookie_setup_completed");
    return true;
  } catch (error) {
    networkFailure("session_cookie_setup_failed", error);
    return false;
  }
}
