import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appCheckSource = fs.readFileSync(path.join(root, "lib", "firebase-app-check.ts"), "utf8");
const appConfigSource = fs.readFileSync(path.join(root, "app.config.ts"), "utf8");

if (!appCheckSource.includes('provider: __DEV__ ? "debug" : "playIntegrity"')) {
  throw new Error("Android App Check must use debug only for __DEV__ and playIntegrity for release builds.");
}
if (!appCheckSource.includes('appAttestWithDeviceCheckFallback')) {
  throw new Error("Apple App Check must use App Attest with DeviceCheck fallback.");
}
if (!appCheckSource.includes("ReCaptchaV3Provider")) {
  throw new Error("Web App Check must include the reCAPTCHA v3 provider.");
}
if (!appConfigSource.includes("EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY")) {
  throw new Error("Web App Check site key must come from a public Expo environment variable.");
}

const trackedFiles = [];
for (const relative of ["lib", "app", "components", "scripts", "docs", "functions"]) {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) continue;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else trackedFiles.push(file);
    }
  }
}
const forbidden = /(?:debugToken\s*[:=]|app.?check.*token\s*[:=]\s*["'][A-Za-z0-9_-]{20,}|firebase.?app.?check.*secret\s*[:=])/i;
for (const file of trackedFiles) {
  if (file.includes(`${path.sep}docs${path.sep}`)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (forbidden.test(text) && !file.endsWith("firebase-app-check.ts") && !file.endsWith("validate-app-check.mjs")) {
    throw new Error(`Possible App Check debug token or secret found in ${path.relative(root, file)}`);
  }
}

console.log("App Check static preflight passed.");
console.log("No debug token, secret, Firebase network call, or enforcement mutation was performed.");
