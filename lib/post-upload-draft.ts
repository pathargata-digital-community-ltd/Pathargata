import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "@pathargata/post-upload-draft/v1/";

export type PostUploadDraft = {
  uid: string;
  savedAt: number;
  text: string;
  privacy: string;
  themeId: string;
  media: Record<string, unknown>[];
  pollMode: boolean;
  pollOptions: string[];
  feeling: { text: string; emoji: string } | null;
  location: string;
  taggedFriends: { uid: string; name: string }[];
  ephemeral: boolean;
  mobile: string;
  socialLink: string;
  youtubeUrl?: string;
  youtubeTitle?: string;
  youtubeDraftUrl?: string;
  youtubeDraftTitle?: string;
  mediaTab?: string;
  recordingUri: string;
  recordingSeconds: number;
  postKey: string | null;
  uploadedMediaUrls: Record<string, string>;
};

export function postUploadDraftStorageKey(uid: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(uid)}`;
}

export function encodePostUploadDraft(draft: PostUploadDraft) {
  return JSON.stringify(draft);
}

export function decodePostUploadDraft(value: string | null, expectedUid: string): PostUploadDraft | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as Partial<PostUploadDraft>;
    if (draft.uid !== expectedUid || typeof draft.savedAt !== "number" || typeof draft.text !== "string") return null;
    if (!Array.isArray(draft.media) || !Array.isArray(draft.pollOptions) || typeof draft.uploadedMediaUrls !== "object" || !draft.uploadedMediaUrls) return null;
    return draft as PostUploadDraft;
  } catch {
    return null;
  }
}

export async function savePostUploadDraft(draft: PostUploadDraft) {
  await AsyncStorage.setItem(postUploadDraftStorageKey(draft.uid), encodePostUploadDraft(draft));
}

export async function loadPostUploadDraft(uid: string) {
  const value = await AsyncStorage.getItem(postUploadDraftStorageKey(uid));
  return decodePostUploadDraft(value, uid);
}

export async function clearPostUploadDraft(uid: string) {
  await AsyncStorage.removeItem(postUploadDraftStorageKey(uid));
}
