import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const expectedProjectId = "pathargata-digital-comnity-ltd";
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
const firebaseAlias = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8"));
const rules = JSON.parse(fs.readFileSync(path.join(root, "database.rules.json"), "utf8"));
const functionsPackage = JSON.parse(
  fs.readFileSync(path.join(root, "functions", "package.json"), "utf8"),
);

const actualProjectId = firebaseAlias.projects?.default;
if (actualProjectId !== expectedProjectId) {
  throw new Error(`Unexpected Firebase project alias: ${actualProjectId ?? "missing"}`);
}
if (firebaseConfig.database?.rules !== "database.rules.json") {
  throw new Error("Firebase Database Rules must point to database.rules.json");
}
if (firebaseConfig.functions?.source !== "functions") {
  throw new Error("Firebase Functions source must point to functions/");
}
if (firebaseConfig.functions?.runtime !== "nodejs22") {
  throw new Error("Firebase Functions runtime must remain nodejs22");
}
if (functionsPackage.engines?.node !== "22") {
  throw new Error("Functions package must target Node.js 22");
}
if (!rules.rules || typeof rules.rules !== "object") {
  throw new Error("database.rules.json does not contain a rules object");
}

console.log(`Firebase deploy preflight passed for ${expectedProjectId}.`);
console.log("No Firebase network call or production mutation was performed.");
