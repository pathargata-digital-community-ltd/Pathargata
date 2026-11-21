import { ThemedView } from "@/components/themed-view";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { authDebug, authFailure } from "@/lib/safe-logger";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      authDebug("oauth_callback_started");
      try {
        // Check for sessionToken in params first (web OAuth callback from server redirect)
        if (params.sessionToken) {
          authDebug("oauth_session_received");
          await Auth.setSessionToken(params.sessionToken);

          // Decode and store user info if available
          if (params.user) {
            try {
              // Use atob for base64 decoding (works in both web and React Native)
              const userJson =
                typeof atob !== "undefined"
                  ? atob(params.user)
                  : Buffer.from(params.user, "base64").toString("utf-8");
              const userData = JSON.parse(userJson);
              const userInfo: Auth.User = {
                id: userData.id,
                openId: userData.openId,
                name: userData.name,
                email: userData.email,
                loginMethod: userData.loginMethod,
                lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
              };
              await Auth.setUserInfo(userInfo);
              authDebug("oauth_identity_stored");
            } catch {
              authFailure("oauth_identity_parse_failed");
            }
          }

          setStatus("success");
          authDebug("oauth_authentication_completed");
          setTimeout(() => {
            router.replace("/(tabs)");
          }, 1000);
          return;
        }

        // Get URL from params or Linking
        let url: string | null = null;

        // Try to get from local search params first (works with expo-router)
        if (params.code || params.state || params.error) {
          authDebug("oauth_route_params_found");
          // Extract from params
          const urlParams = new URLSearchParams();
          if (params.code) urlParams.set("code", params.code);
          if (params.state) urlParams.set("state", params.state);
          if (params.error) urlParams.set("error", params.error);
          url = `?${urlParams.toString()}`;
          authDebug("oauth_callback_url_constructed");
        } else {
          authDebug("oauth_initial_url_lookup_started");
          // Fallback: try to get from Linking
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            authDebug("oauth_initial_url_found");
            url = initialUrl;
          } else {
            authDebug("oauth_initial_url_missing");
          }
        }

        // Check for error
        const error =
          params.error || (url ? new URL(url, "http://dummy").searchParams.get("error") : null);
        if (error) {
          authFailure("oauth_provider_rejected");
          setStatus("error");
          setErrorMessage("Authentication could not be completed. Please try again.");
          return;
        }

        // Check for code and state
        let code: string | null = null;
        let state: string | null = null;
        let sessionToken: string | null = null;

        // Try to get from params first
        if (params.code && params.state) {
          authDebug("oauth_code_state_from_params");
          code = params.code;
          state = params.state;
        } else if (url) {
          authDebug("oauth_callback_url_parsing_started");
          // Parse from URL
          try {
            const urlObj = new URL(url);
            code = urlObj.searchParams.get("code");
            state = urlObj.searchParams.get("state");
            sessionToken = urlObj.searchParams.get("sessionToken");
            authDebug("oauth_callback_url_parsed");
          } catch {
            authDebug("oauth_callback_url_fallback_parser");
            // Try parsing as relative URL with query params
            const match = url.match(/[?&](code|state|sessionToken)=([^&]+)/g);
            if (match) {
              match.forEach((param) => {
                const [key, value] = param.substring(1).split("=");
                if (key === "code") code = decodeURIComponent(value);
                if (key === "state") state = decodeURIComponent(value);
                if (key === "sessionToken") sessionToken = decodeURIComponent(value);
              });
              authDebug("oauth_callback_query_parsed");
            }
          }
        }

        // If we have sessionToken directly from URL, use it
        if (sessionToken) {
          authDebug("oauth_session_from_url");
          await Auth.setSessionToken(sessionToken);
          authDebug("oauth_session_stored");
          // User info is already in the OAuth callback response
          // No need to fetch from API
          setStatus("success");
          authDebug("oauth_redirect_scheduled");
          setTimeout(() => {
            router.replace("/(tabs)");
          }, 1000);
          return;
        }

        // Otherwise, exchange code for session token
        if (!code || !state) {
          authFailure("oauth_callback_parameters_missing");
          setStatus("error");
          setErrorMessage("Missing code or state parameter");
          return;
        }

        // Exchange code for session token
        authDebug("oauth_code_exchange_started");
        const result = await Api.exchangeOAuthCode(code, state);
        authDebug("oauth_code_exchange_completed");

        if (result.sessionToken) {
          authDebug("oauth_session_received");
          // Store session token
          await Auth.setSessionToken(result.sessionToken);
          authDebug("oauth_session_stored");

          // Store user info if available
          if (result.user) {
            authDebug("oauth_identity_received");
            const userInfo: Auth.User = {
              id: result.user.id,
              openId: result.user.openId,
              name: result.user.name,
              email: result.user.email,
              loginMethod: result.user.loginMethod,
              lastSignedIn: new Date(result.user.lastSignedIn || Date.now()),
            };
            await Auth.setUserInfo(userInfo);
            authDebug("oauth_identity_stored");
          } else {
            authDebug("oauth_identity_missing");
          }

          setStatus("success");
          authDebug("oauth_authentication_completed");

          // Redirect to home after a short delay
          setTimeout(() => {
            authDebug("oauth_redirect_executed");
            router.replace("/(tabs)");
          }, 1000);
        } else {
          authFailure("oauth_session_missing");
          setStatus("error");
          setErrorMessage("No session token received");
        }
      } catch (error) {
        authFailure("oauth_callback_failed", error);
        setStatus("error");
        setErrorMessage("Authentication could not be completed. Please try again.");
      }
    };

    handleCallback();
  }, [params.code, params.state, params.error, params.sessionToken, params.user, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Completing authentication...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">
              Authentication successful!
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              Redirecting...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              Authentication failed
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
