import fs from "node:fs";
import { getConfig } from "@expo/config";

const expectedPackage = "com.pathargata.digital.ltd";
const expectedProjectId = "pathargata-digital-comnity-ltd";
const expectedEasProjectId = "5ad67478-f572-4c86-b360-466acb3afb15";

const expo = getConfig(process.cwd(), { skipSDKVersionRequirement: true }).exp;
if (expo.android?.package !== expectedPackage) {
  throw new Error(`Unexpected Android package: ${expo.android?.package || "missing"}`);
}
if (expo.extra?.eas?.projectId !== expectedEasProjectId) {
  throw new Error(`Unexpected EAS project ID: ${expo.extra?.eas?.projectId || "missing"}`);
}

const googleServices = JSON.parse(
  fs.readFileSync(new URL("../google-services.json", import.meta.url), "utf8"),
);
if (googleServices.project_info?.project_id !== expectedProjectId) {
  throw new Error(
    `google-services.json belongs to ${googleServices.project_info?.project_id || "an unknown project"}`,
  );
}

const matchingClients = (googleServices.client || []).filter(
  (client) => client.client_info?.android_client_info?.package_name === expectedPackage,
);
if (matchingClients.length !== 1) {
  throw new Error(
    `Expected exactly one google-services client for ${expectedPackage}, found ${matchingClients.length}`,
  );
}

const client = matchingClients[0];
const appId = client.client_info?.mobilesdk_app_id;
if (!/^1:\d+:android:[a-f0-9]+$/.test(String(appId || ""))) {
  throw new Error("The matching Firebase Android app ID is missing or malformed");
}

console.log(
  `Android config validation passed: ${expectedPackage} -> ${expectedProjectId} (${appId})`,
);
