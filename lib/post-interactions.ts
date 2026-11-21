import { get, push, ref, remove, runTransaction, set } from "firebase/database";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { recordFeedInteraction, type FeedPreferencePost } from "@/lib/feed-preferences";
import { invalidateRtdbSnapshotCache } from "@/lib/rtdb-cache";
import { buildPublicFeedPostProjection } from "@/lib/public-post-projection";

async function requireUser() {
  const user = pathargataAuth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");
  return user;
}

async function persistSavedPostState(user: NonNullable<typeof pathargataAuth.currentUser>, postId: string, shouldSave: boolean, preferencePost: FeedPreferencePost) {
  const savedRef = ref(pathargataDb, `users/${user.uid}/saved_posts/${postId}`);
  if (shouldSave) await set(savedRef, true);
  else await remove(savedRef);
  await invalidateRtdbSnapshotCache([`users/${user.uid}`]);
  await recordFeedInteraction(user.uid, preferencePost, shouldSave ? "save" : "unsave");
  return shouldSave;
}

export async function setSavedPost(postId: string, shouldSave: boolean, preferencePost: FeedPreferencePost = {}) {
  const user = await requireUser();
  return persistSavedPostState(user, postId, shouldSave, preferencePost);
}

export async function toggleSavedPost(postId: string, preferencePost: FeedPreferencePost = {}) {
  const user = await requireUser();
  const savedRef = ref(pathargataDb, `users/${user.uid}/saved_posts/${postId}`);
  const snapshot = await get(savedRef);
  return persistSavedPostState(user, postId, !(snapshot.exists() && snapshot.val() === true), preferencePost);
}

export async function toggleMutedPost(postId: string) {
  const user = await requireUser();
  const mutedRef = ref(pathargataDb, `users/${user.uid}/muted_posts/${postId}`);
  const snapshot = await get(mutedRef);
  if (snapshot.exists()) { await remove(mutedRef); return false; }
  await set(mutedRef, true); return true;
}

export async function repostPost(postId: string, message = "") {
  const user = await requireUser();
  const initial = (await get(ref(pathargataDb, `posts/${postId}`))).val();
  if (!initial) throw new Error("POST_NOT_FOUND");
  const initialPost = initial as Record<string, unknown>;
  if (initialPost.privacy && initialPost.privacy !== "public" && initialPost.privacy !== "everyone") throw new Error("POST_NOT_PUBLIC");
  const originalPostId = typeof initialPost.originalPostId === "string" ? initialPost.originalPostId : postId;
  const original = originalPostId === postId ? initialPost : ((await get(ref(pathargataDb, `posts/${originalPostId}`))).val() as Record<string, unknown> | null) || initialPost;
  const profile = (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
  const originalAuthor = String(initialPost.originalPostAuthor || original.author || original.userName || original.name || "একজন সদস্য");
  const originalAuthorUid = String(initialPost.originalPostAuthorUid || original.uid || "");
  const originalAuthorPic = initialPost.originalPostAuthorPic || original.authorPic || null;
  const originalBody = String(original.description || original.content || original.text || original.body || "");
  const originalTitle = String(original.title || "");
  const rawImages = original.images || (original.image ? [original.image] : []);
  const repostRef = await push(ref(pathargataDb, "posts"), {
    uid: user.uid,
    author: profile.name || user.displayName || "একজন ব্যবহারকারী",
    authorPic: profile.profile_pic || user.photoURL || null,
    authorRole: profile.role || "user",
    authorVerified: Boolean(profile.isVerified),
    content: message.trim(),
    repostMessage: message.trim(),
    type: "repost",
    originalPostId,
    originalPostAuthorUid: originalAuthorUid,
    originalPostAuthor: originalAuthor,
    originalPostAuthorPic: originalAuthorPic,
    originalPostTitle: originalTitle,
    originalPostBody: originalBody,
    originalPostImages: rawImages,
    originalPostAudio: typeof original.audio === "string" ? original.audio : null,
    originalPostType: typeof original.type === "string" ? original.type : "text",
    originalPostMediaType: typeof original.mediaType === "string" ? original.mediaType : null,
    originalPostFeeling: typeof original.feeling === "string" ? original.feeling : null,
    originalPostCheckInLocation: typeof original.checkInLocation === "string" ? original.checkInLocation : null,
    timestamp: Date.now(),
    likes: {},
    comments: {},
    repostCount: 0,
    privacy: "public",
  });
  if (repostRef.key) {
    const repostTimestamp = Number((await get(ref(pathargataDb, `posts/${repostRef.key}/timestamp`))).val()) || Date.now();
    await set(ref(pathargataDb, `user_post_index/${user.uid}/${repostRef.key}`), { timestamp: repostTimestamp });
    await set(ref(pathargataDb, `public_posts/${repostRef.key}`), buildPublicFeedPostProjection({
      uid: user.uid,
      author: profile.name || user.displayName || "একজন ব্যবহারকারী",
      authorPic: profile.profile_pic || user.photoURL || null,
      authorRole: profile.role || "user",
      authorVerified: Boolean(profile.isVerified),
      content: message.trim(),
      repostMessage: message.trim(),
      type: "repost",
      originalPostId,
      originalPostAuthorUid: originalAuthorUid,
      originalPostAuthor: originalAuthor,
      originalPostAuthorPic: originalAuthorPic,
      originalPostTitle: originalTitle,
      originalPostBody: originalBody,
      originalPostImages: rawImages,
      originalPostAudio: typeof original.audio === "string" ? original.audio : null,
      originalPostType: typeof original.type === "string" ? original.type : "text",
      originalPostMediaType: typeof original.mediaType === "string" ? original.mediaType : null,
      originalPostFeeling: typeof original.feeling === "string" ? original.feeling : null,
      originalPostCheckInLocation: typeof original.checkInLocation === "string" ? original.checkInLocation : null,
      timestamp: repostTimestamp,
      repostCount: 0,
      privacy: "public",
    }));
  }
  await invalidateRtdbSnapshotCache(["posts", "public_posts"]);
  await recordFeedInteraction(user.uid, initialPost as FeedPreferencePost, "repost");
  if (originalAuthorUid && originalAuthorUid !== user.uid && originalPostId) {
    await push(ref(pathargataDb, `notifications/${originalAuthorUid}`), {
      type: "repost",
      fromUid: user.uid,
      fromName: profile.name || user.displayName || "একজন ব্যবহারকারী",
      fromPhoto: profile.profile_pic || user.photoURL || null,
      postId: originalPostId,
      postPreview: [originalTitle, originalBody].filter(Boolean).join(" · ").slice(0, 140),
      timestamp: Date.now(),
      read: false,
    });
  }
  return true;
}

export async function reportPost(postId: string, reason: string, preferencePost?: FeedPreferencePost) {
  const user = await requireUser();
  const profile = (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
  await set(ref(pathargataDb, `reports/${postId}/${user.uid}`), { reason: reason.trim(), timestamp: Date.now(), reporterName: profile.name || user.displayName || "Unknown User" });
  const post = preferencePost || ((await get(ref(pathargataDb, `posts/${postId}`))).val() || {}) as FeedPreferencePost;
  await recordFeedInteraction(user.uid, post, "report");
}

export async function togglePostLike(postId: string) {
  const user = pathargataAuth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");
  const likeRef = ref(pathargataDb, `posts/${postId}/likes/${user.uid}`);
  const likeResult = await runTransaction(likeRef, (current) => current === true ? null : true);
  if (!likeResult.committed) throw new Error("LIKE_NOT_COMMITTED");
  const liked = likeResult.snapshot.exists() && likeResult.snapshot.val() === true;
  void (async () => {
    try {
      await invalidateRtdbSnapshotCache([`posts/${postId}`, "posts", `public_posts/${postId}`, "public_posts"]);
      const post = ((await get(ref(pathargataDb, `posts/${postId}`))).val() || {}) as FeedPreferencePost & { uid?: string; title?: unknown; description?: unknown; content?: unknown; text?: unknown };
      await recordFeedInteraction(user.uid, post, liked ? "like" : "unlike");
      if (liked && post.uid && post.uid !== user.uid) {
        await push(ref(pathargataDb, `notifications/${post.uid}`), {
          type: "like",
          fromUid: user.uid,
          fromName: user.displayName || "একজন ব্যবহারকারী",
          fromPhoto: user.photoURL || null,
          postId,
          postPreview: String(post.title || post.description || post.content || post.text || "").slice(0, 140),
          timestamp: Date.now(),
          read: false,
        });
      }
    } catch {
      // A notification, lookup, or local cache failure must not undo a committed like in the UI.
    }
  })();
  return liked;
}

export async function addPostComment(postId: string, text: string) {
  const user = pathargataAuth.currentUser;
  if (!user) throw new Error("AUTH_REQUIRED");
  const cleanText = text.trim();
  if (!cleanText) throw new Error("EMPTY_COMMENT");
  const profile = (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
  await push(ref(pathargataDb, `posts/${postId}/comments`), { author: profile.name || user.displayName || "একজন ব্যবহারকারী", authorUid: user.uid, authorPic: profile.profile_pic || user.photoURL || null, authorRole: profile.role || "user", text: cleanText, time: Date.now() });
  await invalidateRtdbSnapshotCache([`posts/${postId}`, "posts", `public_posts/${postId}`, "public_posts"]);
  const post = (await get(ref(pathargataDb, `posts/${postId}`))).val();
  await recordFeedInteraction(user.uid, (post || {}) as FeedPreferencePost, "comment");
  if (post?.uid && post.uid !== user.uid) await push(ref(pathargataDb, `notifications/${post.uid}`), { type: "comment", fromUid: user.uid, fromName: profile.name || user.displayName || "একজন ব্যবহারকারী", fromPhoto: profile.profile_pic || user.photoURL || null, postId, postPreview: String(post.title || post.description || post.content || post.text || "").slice(0, 140), timestamp: Date.now(), read: false });
}
