import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const outputDir = resolve(process.argv[2] || "dist");
const basePath = "/Pathargata";
const publicOrigin = "https://pathargata-digital-community-ltd.github.io";
const homeUrl = `${publicOrigin}${basePath}/`;
const marker = "<!-- Pathargata Pages metadata -->";

async function listHtml(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listHtml(path));
    else if (entry.isFile() && entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

const htmlFiles = await listHtml(outputDir);
if (!htmlFiles.some((path) => path === join(outputDir, "index.html"))) {
  throw new Error(`Expo export is missing ${join(outputDir, "index.html")}`);
}

for (const path of htmlFiles) {
  let html = await readFile(path, "utf8");
  if (html.includes(marker)) continue;
  html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, "");
  const relativeHtml = relative(outputDir, path).replaceAll("\\", "/");
  const isHome = relativeHtml === "index.html";
  const title = "পাথরঘাটা ডিজিটাল | পাথরঘাটার তথ্য ও সেবা";
  const routePath = isHome ? `${basePath}/` : `${basePath}/${relativeHtml.replace(/\.html$/, "")}`;
  const canonical = isHome ? `<link rel="canonical" href="${homeUrl}">` : "";
  const tags = `
${marker}
<title>${title}</title>
<meta name="description" content="পাথরঘাটা উপজেলার স্থানীয় তথ্য, জরুরি সেবা, পর্যটন, ডিরেক্টরি ও নাগরিক কমিউনিটি এক জায়গায়।">
<meta name="theme-color" content="#16a34a">
<meta name="application-name" content="পাথরঘাটা ডিজিটাল">
<meta property="og:type" content="website">
<meta property="og:site_name" content="পাথরঘাটা ডিজিটাল">
<meta property="og:locale" content="bn_BD">
<meta property="og:title" content="${title}">
<meta property="og:description" content="পাথরঘাটা উপজেলার স্থানীয় তথ্য, জরুরি সেবা, পর্যটন, ডিরেক্টরি ও নাগরিক কমিউনিটি এক জায়গায়।">
<meta property="og:url" content="${publicOrigin}${routePath}">
<meta property="og:image" content="${publicOrigin}${basePath}/logo-512.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${basePath}/logo-192.png" type="image/png">
<link rel="manifest" href="${basePath}/manifest.json">
${canonical}
<script>
  if ("serviceWorker" in navigator && location.pathname.startsWith("${basePath}/")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("${basePath}/service-worker.js", { scope: "${basePath}/" }).catch(() => {});
    });
  }
</script>`;
  if (!html.includes("</head>")) throw new Error(`No closing </head> in ${relativeHtml}`);
  html = html.replace("</head>", `${tags}\n</head>`);
  await writeFile(path, html);
}

const serviceWorkerPath = join(outputDir, "service-worker.js");
let serviceWorker = await readFile(serviceWorkerPath, "utf8");
const buildTag = (process.env.GITHUB_SHA || "local").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "local";
serviceWorker = serviceWorker.replaceAll("__BUILD_TAG__", buildTag);
await writeFile(serviceWorkerPath, serviceWorker);
await copyFile(join(outputDir, "index.html"), join(outputDir, "404.html"));
await writeFile(join(outputDir, ".nojekyll"), "");
console.log(`Prepared ${htmlFiles.length} Expo route documents plus 404 fallback for ${basePath}/`);
