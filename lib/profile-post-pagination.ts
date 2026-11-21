import { compareMarketplaceRtdbKeys } from "./marketplace-catalog";

export type ProfileIndexCursor = { kind: "timestamp"; timestamp: number; id: string };
export type CombinedProfileCursor = {
  kind: "combined";
  publicId: string | null;
  friendCursor: ProfileIndexCursor | null;
};
export type PublicProfileCursor = { kind: "public"; id: string };
export type ProfilePostCursor = ProfileIndexCursor | CombinedProfileCursor | PublicProfileCursor;
export type ProfilePostIndexEntry<T = Record<string, unknown>> = {
  id: string;
  timestamp: number;
  value?: T;
};
export type CombinedProfilePost<T = Record<string, unknown>> = ProfilePostIndexEntry<T> & {
  fromPublic: boolean;
  fromFriends: boolean;
};

export function mergeFriendVisibleProfilePage<T>(
  publicEntries: readonly ProfilePostIndexEntry<T>[],
  friendEntries: readonly ProfilePostIndexEntry<T>[],
  cursor: CombinedProfileCursor,
  pageSize: number,
): { page: CombinedProfilePost<T>[]; cursor: CombinedProfileCursor; hasMore: boolean } {
  const byId = new Map<string, CombinedProfilePost<T>>();
  const add = (entry: ProfilePostIndexEntry<T>, source: "public" | "friends") => {
    const current = byId.get(entry.id);
    if (current) {
      current.timestamp = Math.max(current.timestamp, entry.timestamp);
      current.value = entry.value ?? current.value;
      if (source === "public") current.fromPublic = true;
      else current.fromFriends = true;
      return;
    }
    byId.set(entry.id, {
      ...entry,
      fromPublic: source === "public",
      fromFriends: source === "friends",
    });
  };

  publicEntries.forEach((entry) => add(entry, "public"));
  friendEntries.forEach((entry) => add(entry, "friends"));
  const sorted = [...byId.values()].sort((a, b) =>
    b.timestamp - a.timestamp || compareMarketplaceRtdbKeys(b.id, a.id),
  );
  const page = sorted.slice(0, pageSize);
  const selectedPublic = page.filter((entry) => entry.fromPublic);
  const selectedFriends = page.filter((entry) => entry.fromFriends);
  const publicId = selectedPublic.length
    ? selectedPublic.reduce((oldest, entry) => compareMarketplaceRtdbKeys(entry.id, oldest.id) < 0 ? entry : oldest).id
    : cursor.publicId;
  const friendCursor = selectedFriends.length
    ? selectedFriends.reduce((oldest, entry) =>
        entry.timestamp < oldest.timestamp || (entry.timestamp === oldest.timestamp && compareMarketplaceRtdbKeys(entry.id, oldest.id) < 0) ? entry : oldest,
      )
    : cursor.friendCursor;

  return {
    page,
    cursor: { kind: "combined", publicId, friendCursor: friendCursor ? { kind: "timestamp", timestamp: friendCursor.timestamp, id: friendCursor.id } : null },
    hasMore: sorted.length > page.length || publicEntries.length > selectedPublic.length || friendEntries.length > selectedFriends.length,
  };
}
