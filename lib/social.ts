import { getWithCache, onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { get, ref, remove, set, update } from "firebase/database";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import localPeopleIndex from "@/assets/people-index-safe.json";

export type SocialProfile = {
  uid: string;
  name?: string;
  nickname?: string;
  profession?: string;
  village?: string;
  union?: string;
  bio?: string;
  location?: string;
  phone?: string;
  email?: string;
  profile_pic?: string;
  cover_pic?: string;
  facebook?: string;
  whatsapp?: string;
  website?: string;
  joinDate?: string;
  isVerified?: boolean;
  verificationCategory?: string;
  role?: string;
  status?: string;
  profile_locked?: boolean;
  hide_phone?: boolean;
  privacy_hide_contact?: boolean;
  friends?: Record<string, boolean>;
};

export type FriendshipStatus =
  | "self"
  | "friend"
  | "incoming"
  | "outgoing"
  | "none";

export async function getUserProfile(
  uid: string,
): Promise<SocialProfile | null> {
  const { value } = await getWithCache<string>(
    ref(pathargataDb, `users/${uid}/name`),
  );
  return typeof value === "string" ? { uid, name: value } : null;
}

/** Read only the public projection; the bundled index is an offline last resort. */
export async function getPublicProfile(
  uid: string,
): Promise<SocialProfile | null> {
  const result = await getWithCache<Record<string, unknown>>(
    ref(pathargataDb, `people_index/${uid}`),
  );
  const value = result.value || (localPeopleIndex as Record<string, unknown>)[uid];
  return value && typeof value === "object"
    ? ({ uid, ...(value as Omit<SocialProfile, "uid">) } as SocialProfile)
    : null;
}

export async function getFriendshipStatus(
  targetUid: string,
): Promise<FriendshipStatus> {
  const current = pathargataAuth.currentUser;
  if (!current) return "none";
  if (current.uid === targetUid) return "self";
  const [friend, incoming, outgoing] = await Promise.all([
    get(ref(pathargataDb, `users/${current.uid}/friends/${targetUid}`)),
    get(ref(pathargataDb, `friend_requests/${current.uid}/${targetUid}`)),
    get(ref(pathargataDb, `friend_requests/${targetUid}/${current.uid}`)),
  ]);
  if (friend.exists()) return "friend";
  if (incoming.exists()) return "incoming";
  if (outgoing.exists()) return "outgoing";
  return "none";
}

export async function getBlockStatus(targetUid: string): Promise<boolean> {
  const current = pathargataAuth.currentUser;
  if (!current || current.uid === targetUid) return false;
  const snapshot = await get(
    ref(pathargataDb, `user_blocks/${current.uid}/${targetUid}`),
  );
  return snapshot.val() === true;
}

export async function blockUser(targetUid: string) {
  const current = pathargataAuth.currentUser;
  if (!current || current.uid === targetUid) throw new Error("AUTH_REQUIRED");
  await Promise.all([
    set(ref(pathargataDb, `user_blocks/${current.uid}/${targetUid}`), true),
    set(ref(pathargataDb, `users/${current.uid}/blocked_users/${targetUid}`), true),
    remove(ref(pathargataDb, `user_chats/${current.uid}/${targetUid}`)),
  ]);
}

export async function unblockUser(targetUid: string) {
  const current = pathargataAuth.currentUser;
  if (!current) throw new Error("AUTH_REQUIRED");
  await Promise.all([
    remove(ref(pathargataDb, `user_blocks/${current.uid}/${targetUid}`)),
    remove(ref(pathargataDb, `users/${current.uid}/blocked_users/${targetUid}`)),
  ]);
}

export async function reportUser(
  targetUid: string,
  reason = "ব্যবহারকারীর রিপোর্ট",
) {
  const current = pathargataAuth.currentUser;
  if (!current || current.uid === targetUid) throw new Error("AUTH_REQUIRED");
  await set(ref(pathargataDb, `user_reports/${targetUid}/${current.uid}`), {
    reason: reason.trim() || "ব্যবহারকারীর রিপোর্ট",
    timestamp: Date.now(),
  });
}

export async function sendFriendRequest(target: SocialProfile) {
  const current = pathargataAuth.currentUser;
  if (!current || current.uid === target.uid) throw new Error("AUTH_REQUIRED");
  const profile = await getUserProfile(current.uid);
  await set(ref(pathargataDb, `friend_requests/${target.uid}/${current.uid}`), {
    fromName: profile?.name || current.displayName || "একজন ব্যবহারকারী",
    fromUid: current.uid,
    timestamp: Date.now(),
  });
}

export async function cancelFriendRequest(targetUid: string) {
  const current = pathargataAuth.currentUser;
  if (!current) throw new Error("AUTH_REQUIRED");
  await remove(
    ref(pathargataDb, `friend_requests/${targetUid}/${current.uid}`),
  );
}

export async function acceptFriendRequest(fromUid: string) {
  const current = pathargataAuth.currentUser;
  if (!current) throw new Error("AUTH_REQUIRED");
  await update(ref(pathargataDb), {
    [`users/${current.uid}/friends/${fromUid}`]: true,
    [`users/${fromUid}/friends/${current.uid}`]: true,
    [`friend_requests/${current.uid}/${fromUid}`]: null,
  });
}

export async function deleteFriendRequest(fromUid: string) {
  const current = pathargataAuth.currentUser;
  if (!current) throw new Error("AUTH_REQUIRED");
  await remove(ref(pathargataDb, `friend_requests/${current.uid}/${fromUid}`));
}

export async function unfriend(targetUid: string) {
  const current = pathargataAuth.currentUser;
  if (!current) throw new Error("AUTH_REQUIRED");
  await update(ref(pathargataDb), {
    [`users/${current.uid}/friends/${targetUid}`]: null,
    [`users/${targetUid}/friends/${current.uid}`]: null,
  });
}

export function listenFriendRequests(
  uid: string,
  callback: (
    requests: Record<
      string,
      { fromUid: string; fromName?: string; timestamp?: number }
    >,
  ) => void,
) {
  return onValue(ref(pathargataDb, `friend_requests/${uid}`), (snapshot) =>
    callback(
      (snapshot.val() || {}) as Record<
        string,
        { fromUid: string; fromName?: string; timestamp?: number }
      >,
    ),
  );
}
