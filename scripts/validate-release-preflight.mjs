import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@expo/config";

const root = process.cwd();
const expectedPackage = "com.pathargata.digital.ltd";
const expectedProjectId = "pathargata-digital-comnity-ltd";
const expectedEasProjectId = "5ad67478-f572-4c86-b360-466acb3afb15";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expo = getConfig(root, { skipSDKVersionRequirement: true }).exp;
const eas = readJson("eas.json");
const firebase = readJson("firebase.json");
const firebaseAlias = readJson(".firebaserc");
const googleServices = readJson("google-services.json");

assert(expo.version && /^\d+\.\d+\.\d+$/.test(expo.version), "Expo version must be a stable semver value");
assert(expo.android?.package === expectedPackage, `Unexpected Android package: ${expo.android?.package || "missing"}`);
assert(expo.extra?.eas?.projectId === expectedEasProjectId, "Unexpected EAS project ID");
assert(firebaseAlias.projects?.default === expectedProjectId, "Unexpected Firebase project alias");
assert(firebase.database?.rules === "database.rules.json", "Firebase Database Rules source mismatch");
assert(firebase.functions?.source === "functions", "Firebase Functions source mismatch");
assert(googleServices.project_info?.project_id === expectedProjectId, "google-services.json project mismatch");

const matchingClients = (googleServices.client || []).filter(
  (client) => client.client_info?.android_client_info?.package_name === expectedPackage,
);
assert(matchingClients.length === 1, `Expected one Android Firebase client, found ${matchingClients.length}`);

assert(eas.build?.preview?.distribution === "internal", "Preview must remain internal distribution");
assert(eas.build?.preview?.android?.buildType === "apk", "Preview Android artifact must be an APK");
assert(eas.build?.production?.android?.buildType === "app-bundle", "Production Android artifact must be an AAB");

const appCheckSource = fs.readFileSync(path.join(root, "lib", "firebase-app-check.ts"), "utf8");
assert(appCheckSource.includes('android: { provider: useDebugProvider ? "debug" : "playIntegrity" }'), "Release Android App Check provider must be Play Integrity");
assert(appCheckSource.includes('const useDebugProvider = __DEV__ || configuredProvider === "debug"'), "App Check debug mode must be limited to development or explicit preview configuration");
assert(appCheckSource.includes("initialization = undefined"), "App Check failures must be retryable");
const layoutSource = fs.readFileSync(path.join(root, "app", "_layout.tsx"), "utf8");
assert(layoutSource.includes("appCheckFailed"), "App Check failure state must be observable in the root layout");
assert(layoutSource.includes("নিরাপদ সংযোগ যাচাই হয়নি"), "Release App Check failure must show a safe blocking state");

console.log("Release preflight passed.");
console.log(`Version: ${expo.version}`);
console.log(`Android package: ${expectedPackage}`);
console.log(`Firebase project: ${expectedProjectId}`);
console.log(`EAS project: ${expectedEasProjectId}`);
console.log("Preview artifact: internal APK");
console.log("Production artifact: Android App Bundle (AAB)");
console.log("Release App Check: Play Integrity");
console.log("No EAS build, Firebase network call, device action, or production mutation was performed.");
