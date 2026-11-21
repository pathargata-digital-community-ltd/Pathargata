const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { buildPublicUserIndex } = require("./public-user-index");

const projectId = "pathargata-digital-comnity-ltd";
initializeApp({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
});

async function main() {
  const database = getDatabase();
  const usersSnapshot = await database.ref("users").get();
  const updates = {};
  let publicCount = 0;
  let removedCount = 0;

  usersSnapshot.forEach((child) => {
    if (!child.key) return false;
    const projection = buildPublicUserIndex(child.val(), child.key);
    updates[`people_index/${child.key}`] = projection;
    if (projection) publicCount += 1;
    else removedCount += 1;
    return false;
  });

  if (Object.keys(updates).length) await database.ref().update(updates);
  console.log(JSON.stringify({ scannedUsers: usersSnapshot.numChildren(), publicCount, removedCount }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
