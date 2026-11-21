import { describe, expect, it } from "vitest";
import { mergeFriendVisibleProfilePage, type CombinedProfileCursor, type ProfilePostIndexEntry } from "../lib/profile-post-pagination";

type Entry = ProfilePostIndexEntry<{ body: string }>;
const combinedCursor = (publicId: string | null = null, friendCursor: CombinedProfileCursor["friendCursor"] = null): CombinedProfileCursor => ({
  kind: "combined",
  publicId,
  friendCursor,
});

function entry(id: string, timestamp: number): Entry {
  return { id, timestamp, value: { body: id } };
}

describe("mergeFriendVisibleProfilePage", () => {
  it("merges public and friends-only entries by timestamp and advances both cursors", () => {
    const result = mergeFriendVisibleProfilePage(
      [entry("p-new", 300), entry("p-old", 100)],
      [entry("f-new", 400), entry("f-mid", 200)],
      combinedCursor(),
      3,
    );

    expect(result.page.map(({ id }) => id)).toEqual(["f-new", "p-new", "f-mid"]);
    expect(result.cursor).toEqual({
      kind: "combined",
      publicId: "p-new",
      friendCursor: { kind: "timestamp", timestamp: 200, id: "f-mid" },
    });
    expect(result.hasMore).toBe(true);
  });

  it("deduplicates a post present in both sources while retaining both source cursors", () => {
    const result = mergeFriendVisibleProfilePage(
      [entry("same", 100), entry("public-only", 90)],
      [entry("same", 100), entry("friend-only", 80)],
      combinedCursor(),
      3,
    );

    expect(result.page.map(({ id }) => id)).toEqual(["same", "public-only", "friend-only"]);
    expect(result.page[0]).toMatchObject({ fromPublic: true, fromFriends: true });
    expect(result.cursor.publicId).toBe("public-only");
    expect(result.cursor.friendCursor).toEqual({ kind: "timestamp", timestamp: 80, id: "friend-only" });
    expect(result.hasMore).toBe(false);
  });

  it("keeps an unconsumed source cursor unchanged so its items remain for the next page", () => {
    const previous = combinedCursor("p-cursor", null);
    const result = mergeFriendVisibleProfilePage(
      [entry("p-older", 100), entry("p-oldest", 50)],
      [entry("f-newest", 300), entry("f-next", 200), entry("f-last", 150)],
      previous,
      2,
    );

    expect(result.page.map(({ id }) => id)).toEqual(["f-newest", "f-next"]);
    expect(result.cursor.publicId).toBe("p-cursor");
    expect(result.cursor.friendCursor).toEqual({ kind: "timestamp", timestamp: 200, id: "f-next" });
    expect(result.hasMore).toBe(true);
  });

  it("continues through interleaved public and friend pages without skipping posts", () => {
    const publicRows = [entry("p5", 500), entry("p3", 300), entry("p1", 100)];
    const friendRows = [entry("f4", 400), entry("f2", 200), entry("f0", 0)];
    let cursor = combinedCursor();
    const loaded: string[] = [];
    for (let page = 0; page < 3; page += 1) {
      const publicPage = publicRows.filter((row) => !cursor.publicId || row.id < cursor.publicId);
      const friendPage = friendRows.filter((row) => !cursor.friendCursor
        || row.timestamp < cursor.friendCursor.timestamp
        || (row.timestamp === cursor.friendCursor.timestamp && row.id < cursor.friendCursor.id));
      const result = mergeFriendVisibleProfilePage(publicPage, friendPage, cursor, 2);
      loaded.push(...result.page.map(({ id }) => id));
      cursor = result.cursor;
    }

    expect(loaded).toEqual(["p5", "f4", "p3", "f2", "p1", "f0"]);
  });

  it("uses RTDB key ordering as a deterministic timestamp tie-breaker", () => {
    const result = mergeFriendVisibleProfilePage(
      [entry("post-b", 100), entry("post-a", 100)],
      [],
      combinedCursor(),
      2,
    );

    expect(result.page.map(({ id }) => id)).toEqual(["post-b", "post-a"]);
    expect(result.cursor.publicId).toBe("post-a");
  });
});
