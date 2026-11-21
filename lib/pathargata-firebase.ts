import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
// Firebase selects its React Native conditional entrypoint for native builds.
// @ts-expect-error The browser type entrypoint omits this RN-only export.
import { getReactNativePersistence } from "@firebase/auth";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// These values are the public Firebase web configuration already used by Pathargata Web App.
// Firebase client configuration is not a private credential; Firebase rules remain the security boundary.
const firebaseConfig = {
  apiKey: "AIzaSyBfI-THOXOvhyL7LumZVKixtTVwF94CjsI",
  authDomain: "pathargata-digital-comnity-ltd.firebaseapp.com",
  databaseURL: "https://pathargata-digital-comnity-ltd-default-rtdb.firebaseio.com",
  projectId: "pathargata-digital-comnity-ltd",
  storageBucket: "pathargata-digital-comnity-ltd.firebasestorage.app",
  messagingSenderId: "991014085926",
  appId: "1:991014085926:android:b249e489d8424433ed4de7",
};

export const pathargataApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const app = pathargataApp;
export const pathargataDb = getDatabase(app);
export const pathargataFunctions = getFunctions(app, "us-central1");
let auth: Auth;
if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (error) {
    // Fast refresh can initialize Firebase more than once. Only reuse an existing
    // instance in that case; never hide a persistence initialization failure by
    // silently switching to the default in-memory auth implementation.
    if (error && typeof error === "object" && "code" in error && error.code === "auth/already-initialized") {
      auth = getAuth(app);
    } else {
      throw error;
    }
  }
}
export const pathargataAuth = auth;
