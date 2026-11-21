import {
  CustomProvider,
  getToken as getJavaScriptAppCheckToken,
  initializeAppCheck as initializeJavaScriptAppCheck,
  ReCaptchaV3Provider,
} from "firebase/app-check";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getApp as getNativeFirebaseApp } from "@react-native-firebase/app";
import {
  getToken as getNativeAppCheckToken,
  initializeAppCheck as initializeNativeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from "@react-native-firebase/app-check";
import { pathargataApp } from "@/lib/pathargata-firebase";

export type FirebaseAppCheckStatus = "idle" | "initializing" | "ready" | "not-configured" | "failed";

type StatusListener = (status: FirebaseAppCheckStatus) => void;

let initialization: Promise<void> | undefined;
let status: FirebaseAppCheckStatus = "idle";
const listeners = new Set<StatusListener>();

function setStatus(next: FirebaseAppCheckStatus) {
  status = next;
  listeners.forEach((listener) => listener(next));
}

export function getFirebaseAppCheckStatus() {
  return status;
}

export function subscribeFirebaseAppCheckStatus(listener: StatusListener) {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function publicExtra() {
  const extra = Constants.expoConfig?.extra;
  return extra && typeof extra === "object" ? extra as Record<string, unknown> : {};
}

function appCheckSiteKey() {
  const value = publicExtra().firebaseAppCheckRecaptchaSiteKey;
  return typeof value === "string" ? value.trim() : "";
}

function isAlreadyInitialized(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (
    error.code === "app-check/already-initialized" || error.code === "already-initialized"
  ));
}

async function ensureWebFirebaseAppCheck() {
  const siteKey = appCheckSiteKey();
  if (!siteKey) {
    setStatus("not-configured");
    return;
  }
  const provider = new ReCaptchaV3Provider(siteKey);
  try {
    const jsAppCheck = initializeJavaScriptAppCheck(pathargataApp, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    await getJavaScriptAppCheckToken(jsAppCheck, true);
  } catch (error) {
    if (!isAlreadyInitialized(error)) throw error;
  }
  setStatus("ready");
}

/**
 * Native builds use debug only for development and Play Integrity/App Attest
 * for release-style builds. Web uses an explicitly configured reCAPTCHA v3
 * site key. App Check remains an additional layer; Firebase Auth and Rules
 * authorization are still required separately.
 */
export function ensureNativeFirebaseAppCheck(): Promise<void> {
  if (initialization) return initialization;
  setStatus("initializing");

  initialization = (async () => {
    if (Platform.OS === "web") {
      await ensureWebFirebaseAppCheck();
      return;
    }

    const configuredProvider = publicExtra().appCheckProvider;
    const useDebugProvider = __DEV__ || configuredProvider === "debug";
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      // Internal preview APKs are sideloaded before Play Store release, so they
      // use a Firebase-registered debug token. Production stays attested.
      android: { provider: useDebugProvider ? "debug" : "playIntegrity" },
      apple: { provider: useDebugProvider ? "debug" : "appAttestWithDeviceCheckFallback" },
    });

    const nativeApp = getNativeFirebaseApp();
    const nativeAppCheck = initializeNativeAppCheck(nativeApp, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });

    let nativeToken: Awaited<ReturnType<typeof getNativeAppCheckToken>> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        nativeToken = await getNativeAppCheckToken(nativeAppCheck, attempt > 0);
        if (nativeToken.token) break;
      } catch (error) {
        lastError = error;
        await wait(500);
      }
    }
    if (!nativeToken?.token) {
      throw lastError instanceof Error ? lastError : new Error("Native Firebase App Check did not return a token.");
    }

    const nativeProvider = new CustomProvider({
      getToken: async () => {
        const result = await getNativeAppCheckToken(nativeAppCheck);
        return { token: result.token, expireTimeMillis: Date.now() + 50 * 60_000 };
      },
    });
    let jsAppCheck;
    try {
      jsAppCheck = initializeJavaScriptAppCheck(pathargataApp, {
        provider: nativeProvider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      if (!isAlreadyInitialized(error)) throw error;
      // JS App Check is already active during Fast Refresh; the native token
      // provider remains active and no second instance is created.
      setStatus("ready");
      return;
    }
    await getJavaScriptAppCheckToken(jsAppCheck, true);
  })().catch((error) => {
    // Do not cache a rejected promise: a user can fix connectivity, Play
    // Services or a registered debug token and retry without restarting.
    setStatus("failed");
    initialization = undefined;
    throw error;
  });

  return initialization;
}
