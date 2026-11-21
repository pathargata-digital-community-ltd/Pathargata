const PUBLIC_USER_FIELDS = [
  "uid",
  "name",
  "nickname",
  "profile_pic",
  "cover_pic",
  "union",
  "village",
  "profession",
  "isVerified",
  "tagPermission",
  "status",
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPublicUserIndex(value, uid) {
  if (!value || typeof value !== "object") return null;
  const source = value;
  if (source.status === "deleted" || source.status === "deactivated") return null;
  if (source.settings?.profileVisibility !== "everyone") return null;
  const name = normalizeText(source.name);
  const nickname = normalizeText(source.nickname);
  const projection = { uid };
  for (const field of PUBLIC_USER_FIELDS) {
    if (field === "uid") continue;
    const value = source[field];
    if (typeof value === "string") projection[field] = value;
    else if (field === "isVerified" && typeof value === "boolean") projection[field] = value;
  }
  const tagPermission = source.settings?.tagPermission;
  if (tagPermission === "none" || tagPermission === "friends" || tagPermission === "everyone") {
    projection.tagPermission = tagPermission;
  }
  projection.sortName = (name || nickname || uid).toLocaleLowerCase();
  projection.searchName = `${name} ${nickname} ${normalizeText(source.union)} ${normalizeText(source.village)} ${normalizeText(source.profession)}`
    .trim()
    .toLocaleLowerCase();
  projection.profileVisibility = "everyone";
  return projection;
}

module.exports = { PUBLIC_USER_FIELDS, buildPublicUserIndex };
