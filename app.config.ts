// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.pathargata.digital.ltd";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "পাথরঘাটা ডিজিটাল",
  appSlug: "pathargataapp",
  // The app branding artwork is stored locally in assets/images/pathargata-logo.png.
  logoUrl: "",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  // Must match google-services.json so Firebase Auth/Realtime Database work in Android builds.
  androidPackage: "com.pathargata.digital.ltd",
};

// Expo serializes this browser-safe subset into native and web bundles. The server-only
// MANUS_API_KEY and MANUS_JWT_SECRET must never enter this object.
const publicRuntime = {
  oauthPortalUrl:
    process.env.MANUS_OAUTH_PORTAL_URL ??
    process.env.VITE_OAUTH_PORTAL_URL ??
    process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ??
    "",
  oauthServerUrl:
    process.env.MANUS_OAUTH_API_URL ??
    process.env.OAUTH_SERVER_URL ??
    process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ??
    "",
  appId:
    process.env.MANUS_PROJECT_ID ??
    process.env.VITE_APP_ID ??
    process.env.EXPO_PUBLIC_APP_ID ??
    "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
  facebookAppId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? "2640529583054645",
  firebaseAppCheckRecaptchaSiteKey: process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY ?? "",
  // Internal APKs are sideloaded before Play Store publication; use Firebase's
  // debug provider there. Production stays protected by Play Integrity.
  appCheckProvider: process.env.APP_CHECK_PROVIDER === "debug" ? "debug" : "playIntegrity",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.4",
  extra: {
    ...publicRuntime,
    eas: { projectId: "5ad67478-f572-4c86-b360-466acb3afb15" },
  },
  orientation: "portrait",
  icon: "./assets/images/pathargata-original-logo.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/images/pathargata-original-logo.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    googleServicesFile: "./google-services.json",
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/pathargata-original-logo.png",
  },
  plugins: [
    "@react-native-firebase/app",
    "@react-native-firebase/app-check",
    ["expo-location", { locationWhenInUsePermission: "কাছাকাছি পর্যটন স্থান ও স্থানীয় সেবা সাজাতে আপনার বর্তমান অবস্থান ব্যবহার করা হবে। অনুমতি না দিলেও অ্যাপের বাকি অংশ ব্যবহার করা যাবে।" }],
    "expo-asset",
    "expo-router",
    "@react-native-community/datetimepicker",
    ["expo-notifications", { defaultChannel: "default" }],
    [
      "expo-audio",
      {
        microphonePermission:
          "ভয়েস মেসেজ রেকর্ড করতে পাথরঘাটা ডিজিটালকে microphone ব্যবহার করতে অনুমতি দিন।",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-light.png",
        imageWidth: 280,
        resizeMode: "contain",
        backgroundColor: "#F7FBF8",
        dark: {
          image: "./assets/images/splash-dark.png",
          backgroundColor: "#0A1812",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    baseUrl: "/Pathargata",
  },
};

export default config;
