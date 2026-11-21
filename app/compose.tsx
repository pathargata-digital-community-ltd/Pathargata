import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { LinearGradient } from "expo-linear-gradient";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorderState,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { router, useLocalSearchParams } from "expo-router";
import { get, push, ref, remove, set } from "firebase/database";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { PostAudioPlayer, PostYoutubeCard } from "@/components/post-rich-media";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { playAppSound } from "@/lib/app-sounds";
import { uploadImageFromUri } from "@/lib/media-upload";
import { uploadUserMedia } from "@/lib/chat-media";
import { getFreshWithCache, invalidateRtdbSnapshotCache } from "@/lib/rtdb-cache";
import { buildPublicFeedPostProjection } from "@/lib/public-post-projection";
import { clearPostUploadDraft, loadPostUploadDraft, savePostUploadDraft, type PostUploadDraft } from "@/lib/post-upload-draft";
import {
  getPostAudioFormat,
  MAX_POST_AUDIO_DURATION_SECONDS,
  validatePostAudioFileSize,
} from "@/lib/post-media-policy";
import { parsePostMediaContent } from "@/lib/post-media";
import { useRemoteControls } from "@/hooks/use-remote-controls";

type Feeling = { text: string; emoji: string };
type Privacy = "public" | "friends" | "only_me";
type PickerMode = "none" | "feeling" | "location" | "tags" | "privacy" | "media";
type MediaTab = "image" | "video";
type ComposerMedia = ImagePicker.ImagePickerAsset;
type PostTheme = { id: string; label: string; value: string; colors: [string, string]; textColor: string };

const MAX_POST_MEDIA = 4;
const MAX_POST_TEXT = 1000;
const MAX_TAGS = 20;
const MAX_POST_IMAGE_DIMENSION = 1600;
const POST_IMAGE_QUALITY = 0.85;

const POST_THEMES: PostTheme[] = [
  { id: "plain", label: "সাধারণ", value: "", colors: ["#FFFFFF", "#F8FAFC"], textColor: "#26352D" },
  { id: "blue", label: "নীল", value: "#1877F2", colors: ["#1877F2", "#4FACFE"], textColor: "#FFFFFF" },
  { id: "pink", label: "গোলাপি", value: "#E42C64", colors: ["#E42C64", "#FF758C"], textColor: "#FFFFFF" },
  { id: "green", label: "সবুজ", value: "#00A400", colors: ["#00A400", "#4ADE80"], textColor: "#FFFFFF" },
  { id: "orange", label: "কমলা", value: "#FF8C00", colors: ["#FF8C00", "#FACC15"], textColor: "#FFFFFF" },
  { id: "love", label: "উষ্ণ ভালোবাসা", value: "linear-gradient(to top, #ff0844 0%, #ffb199 100%)", colors: ["#FF0844", "#FFB199"], textColor: "#FFFFFF" },
  { id: "deep", label: "ডিপ সি", value: "linear-gradient(to bottom, #1e3c72 0%, #2a5298 100%)", colors: ["#1E3C72", "#2A5298"], textColor: "#FFFFFF" },
  { id: "sunset", label: "সূর্যাস্ত", value: "linear-gradient(to right, #fa709a 0%, #fee140 100%)", colors: ["#FA709A", "#FEE140"], textColor: "#FFFFFF" },
  { id: "galaxy", label: "গ্যালাক্সি", value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", colors: ["#667EEA", "#764BA2"], textColor: "#FFFFFF" },
  { id: "dream", label: "ড্রিমি", value: "radial-gradient(circle at bottom left, #a18cd1 0%, #fbc2eb 100%)", colors: ["#A18CD1", "#FBC2EB"], textColor: "#3C3150" },
  { id: "fire", label: "ক্রেজি ফায়ার", value: "linear-gradient(to right, #f83600 0%, #f9d423 100%)", colors: ["#F83600", "#F9D423"], textColor: "#FFFFFF" },
  { id: "dark", label: "ডার্ক", value: "linear-gradient(to right, #434343 0%, #000000 100%)", colors: ["#434343", "#000000"], textColor: "#FFFFFF" },
];

const FEELINGS: Feeling[] = [
  { text: "Happy", emoji: "😊" }, { text: "Loved", emoji: "🥰" }, { text: "Sad", emoji: "😔" }, { text: "Excited", emoji: "🤩" },
  { text: "Angry", emoji: "😠" }, { text: "Blessed", emoji: "😇" }, { text: "Tired", emoji: "😫" }, { text: "Sleepy", emoji: "😴" },
  { text: "Cool", emoji: "😎" }, { text: "Crazy", emoji: "🤪" }, { text: "Sick", emoji: "🤒" }, { text: "Celebrating", emoji: "🎉" },
];
const POPULAR_LOCATIONS = ["পাথরঘাটা গোলচত্বর", "পাথরঘাটা লঞ্চঘাট", "হরিণঘাটা পর্যটন কেন্দ্র", "লালদিয়া সমুদ্র সৈকত", "বিএফডিসি মৎস্য অবতরণ কেন্দ্র"];
const PRIVACY_OPTIONS: { value: Privacy; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "public", label: "Public", description: "পাথরঘাটা কমিউনিটির সবাই দেখতে পারবেন", icon: "globe-outline" },
  { value: "friends", label: "Friends", description: "শুধু আপনার বন্ধুরা দেখতে পারবেন", icon: "people-outline" },
  { value: "only_me", label: "Only Me", description: "শুধু আপনি দেখতে পারবেন", icon: "lock-closed-outline" },
];

function displayPrivacy(value: Privacy) { return PRIVACY_OPTIONS.find((option) => option.value === value) || PRIVACY_OPTIONS[0]; }
async function getLocalMediaSize(uri: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("MEDIA_READ_FAILED");
    return (await response.blob()).size;
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof info.size !== "number") throw new Error("MEDIA_SIZE_UNAVAILABLE");
  return info.size;
}

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent><View className="flex-1 justify-end bg-black/45"><Pressable className="flex-1" onPress={onClose} /><View className="max-h-[88%] rounded-t-[30px] bg-background px-5 pb-7 pt-3"><View className="mb-4 items-center"><View className="h-1.5 w-12 rounded-full bg-slate-200" /></View>{children}</View></View></Modal>;
}
function SectionLabel({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) { return <View className="mb-2 flex-row items-center gap-2"><Ionicons name={icon} size={18} color="#496258" /><Text className="text-[13px] font-extrabold uppercase tracking-[1.1px] text-muted">{children}</Text></View>; }
function ComposerTextArea({ text, setText, theme }: { text: string; setText: (value: string) => void; theme: PostTheme }) {
  const input = <TextInput value={text} onChangeText={setText} multiline autoFocus placeholder="আপনার মনে কী আছে?" placeholderTextColor={theme.value ? "rgba(255,255,255,0.75)" : "#9AA9A0"} textAlignVertical="top" maxLength={MAX_POST_TEXT} className="min-h-[150px] flex-1 px-4 py-3 text-[18px] leading-7" style={{ backgroundColor: "transparent", color: theme.value ? theme.textColor : "#26352D", fontWeight: theme.value ? "700" : "400", textAlign: theme.value ? "center" : "left", paddingTop: theme.value ? 46 : 12 }} />;
  return theme.value ? <LinearGradient colors={theme.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 150, borderRadius: 16, overflow: "hidden" }}>{input}</LinearGradient> : <View className="min-h-[150px] rounded-2xl">{input}</View>;
}

export default function ComposeScreen() {
  const { flags, emergency } = useRemoteControls();
  const params = useLocalSearchParams<{ retryDraft?: string; autoRetry?: string }>();
  const currentUid = pathargataAuth.currentUser?.uid ?? "";
  const [text, setText] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [theme, setTheme] = useState<PostTheme>(POST_THEMES[0]);
  const [media, setMedia] = useState<ComposerMedia[]>([]);
  const [pollMode, setPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState(["", "", "", ""]);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [location, setLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [taggedFriends, setTaggedFriends] = useState<{ uid: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ uid: string; name: string }[]>([]);
  const [tagFriendIds, setTagFriendIds] = useState<Set<string>>(new Set());
  const [tagSearch, setTagSearch] = useState("");
  const [tagFriendsLoading, setTagFriendsLoading] = useState(false);
  const [tagFriendsHasMore, setTagFriendsHasMore] = useState(false);
  const [tagFriendsPage, setTagFriendsPage] = useState(0);
  const tagFriendsLoadingRef = useRef(false);
  const [picker, setPicker] = useState<PickerMode>("none");
  const [ephemeral, setEphemeral] = useState(false);
  const [mobile, setMobile] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeDraftUrl, setYoutubeDraftUrl] = useState("");
  const [youtubeDraftTitle, setYoutubeDraftTitle] = useState("");
  const [mediaTab, setMediaTab] = useState<MediaTab>("image");
  const [recording, setRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [error, setError] = useState("");
  const [draftLoadSettled, setDraftLoadSettled] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [shouldAutoRetry, setShouldAutoRetry] = useState(false);
  const restoringDraft = params.retryDraft === "1" && !draftLoadSettled;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const displayedRecordingSeconds = recording ? Math.min(MAX_POST_AUDIO_DURATION_SECONDS, Math.floor(recorderState.durationMillis / 1000)) : recordingSeconds;
  const publishLock = useRef(false);
  const postKeyRef = useRef<string | null>(null);
  const uploadedMediaUrlsRef = useRef<Record<string, string>>({});
  const stopRecordingLock = useRef(false);
  const recordingActiveRef = useRef(false);
  const autoRetryAttemptedRef = useRef(false);
  const publishCallbackRef = useRef<(() => Promise<void>) | null>(null);
  const filteredPeople = useMemo(() => { const term = tagSearch.trim().toLocaleLowerCase(); return people.filter((person) => !term || person.name.toLocaleLowerCase().includes(term)); }, [people, tagSearch]);
  const selectedPrivacy = displayPrivacy(privacy);
  function setComposerError(message: string) { setError(message); }

  useEffect(() => () => {
    if (!recordingActiveRef.current) return;
    recordingActiveRef.current = false;
    void recorder.stop().catch(() => undefined);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  }, [recorder]);

  useEffect(() => {
    if (params.retryDraft !== "1" || !currentUid) return undefined;
    let active = true;
    void loadPostUploadDraft(currentUid).then((draft) => {
      if (!active) return;
      if (!draft) {
        setError("আবার চেষ্টা করার জন্য সংরক্ষিত ড্রাফট পাওয়া যায়নি। পোস্টটি নতুন করে তৈরি করুন।");
        return;
      }
      setText(draft.text);
      setPrivacy(draft.privacy as Privacy);
      setTheme(POST_THEMES.find((item) => item.id === draft.themeId) || POST_THEMES[0]);
      setMedia(draft.media as ComposerMedia[]);
      setPollMode(draft.pollMode);
      setPollOptions(draft.pollOptions);
      setFeeling(draft.feeling);
      setLocation(draft.location);
      setTaggedFriends(draft.taggedFriends);
      setEphemeral(draft.ephemeral);
      setMobile(draft.mobile);
      setSocialLink(draft.socialLink);
      setYoutubeUrl(draft.youtubeUrl || "");
      setYoutubeTitle(draft.youtubeTitle || "");
      setYoutubeDraftUrl(draft.youtubeDraftUrl || "");
      setYoutubeDraftTitle(draft.youtubeDraftTitle || "");
      setMediaTab(draft.mediaTab === "video" ? "video" : "image");
      setRecordingUri(draft.recordingUri);
      setRecordingSeconds(draft.recordingSeconds);
      postKeyRef.current = draft.postKey;
      uploadedMediaUrlsRef.current = draft.uploadedMediaUrls;
      setRestoredDraft(true);
      setError("আগের পোস্টটি ব্যর্থ হয়েছিল। সংরক্ষিত ড্রাফট থেকে আবার চেষ্টা করা হচ্ছে।");
      if (params.autoRetry === "1") setShouldAutoRetry(true);
    }).catch(() => {
      if (active) setError("সংরক্ষিত ড্রাফট খোলা যায়নি। আবার চেষ্টা করুন।");
    }).finally(() => { if (active) setDraftLoadSettled(true); });
    return () => { active = false; };
  }, [currentUid, params.autoRetry, params.retryDraft]);

  const loadTagFriends = useCallback(async (page = 0) => {
    const user = pathargataAuth.currentUser;
    if (!user || tagFriendsLoadingRef.current) return;
    const ids = [...tagFriendIds].filter((uid) => uid !== user.uid).sort();
    const pageIds = ids.slice(page * 20, (page + 1) * 20);
    if (!pageIds.length) { setTagFriendsHasMore(false); return; }
    tagFriendsLoadingRef.current = true;
    setTagFriendsLoading(true);
    try {
      const rows = (await Promise.all(pageIds.map(async (uid) => {
        const result = await getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, `people_index/${uid}`), 10 * 60 * 1000);
        const value = result.value || {};
        if (value.tagPermission === "none") return null;
        return { uid, name: String(value.name || "Pathargata user") };
      }))).filter(Boolean) as { uid: string; name: string }[];
      setPeople((current) => page === 0 ? rows : [...current, ...rows.filter((row) => !current.some((item) => item.uid === row.uid))]);
      setTagFriendsPage(page);
      setTagFriendsHasMore((page + 1) * 20 < ids.length);
    } catch { setComposerError("বন্ধুদের তালিকা আনা যায়নি।"); }
    finally { tagFriendsLoadingRef.current = false; setTagFriendsLoading(false); }
  }, [tagFriendIds]);

  useEffect(() => {
    if (picker !== "tags" || !tagFriendIds.size) return;
    const timer = setTimeout(() => void loadTagFriends(0), 0);
    return () => clearTimeout(timer);
  }, [picker, tagFriendIds, loadTagFriends]);

  async function pickMedia() {
    if (!flags.mediaUpload || emergency.readOnly) { setComposerError("Media upload আপাতত বন্ধ আছে।"); return; }
    if (youtubeUrl) { setComposerError("এক পোস্টে ছবি অথবা YouTube ভিডিও দিন—দুটো একসাথে নয়। আগে ভিডিও সরান।"); return; }
    if (media.length >= MAX_POST_MEDIA) { setComposerError(`একটি পোস্টে সর্বোচ্চ ${MAX_POST_MEDIA}টি ছবি দেওয়া যাবে।`); return; }
    setPickingMedia(true); setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setComposerError("ছবি বাছাই করতে gallery permission দিন।"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, allowsMultipleSelection: true, selectionLimit: MAX_POST_MEDIA - media.length, quality: 1, exif: false });
      if (result.canceled) return;
      const picked = result.assets.filter((asset) => Boolean(asset.uri));
      if (!picked.length) { setComposerError("নির্বাচিত media পাওয়া যায়নি। আবার চেষ্টা করুন।"); return; }
      if (picked.some((asset) => asset.type === "video" || asset.mimeType?.toLowerCase().startsWith("video/"))) { setComposerError("ছবি tab-এ শুধু ছবি বাছুন। YouTube ভিডিও দিতে ভিডিও tab ব্যবহার করুন।"); return; }
      const sanitized = await Promise.all(picked.map(async (asset) => {
        const resize = asset.width > MAX_POST_IMAGE_DIMENSION || asset.height > MAX_POST_IMAGE_DIMENSION
          ? [{ resize: asset.width >= asset.height ? { width: MAX_POST_IMAGE_DIMENSION } : { height: MAX_POST_IMAGE_DIMENSION } }]
          : [];
        const clean = await manipulateAsync(asset.uri, resize, { compress: POST_IMAGE_QUALITY, format: SaveFormat.JPEG });
        return { ...asset, uri: clean.uri, mimeType: "image/jpeg", file: undefined };
      }));
      setMedia((current) => { const existing = new Set(current.map((asset) => asset.assetId || asset.uri)); const unique = sanitized.filter((asset) => !existing.has(asset.assetId || asset.uri)); return [...current, ...unique].slice(0, MAX_POST_MEDIA); });
      setTheme(POST_THEMES[0]);
      setYoutubeDraftUrl(""); setYoutubeDraftTitle(""); setPicker("none");
    } catch (pickError) { setComposerError(pickError instanceof Error ? pickError.message : "ছবির metadata remove করা যায়নি। আবার চেষ্টা করুন।"); } finally { setPickingMedia(false); }
  }
  function openMediaPicker() {
    setMediaTab(youtubeUrl ? "video" : "image");
    setYoutubeDraftUrl(youtubeUrl);
    setYoutubeDraftTitle(youtubeTitle);
    setError("");
    setPicker("media");
  }
  function chooseMediaTab(tab: MediaTab) { setMediaTab(tab); setError(""); }
  function addYoutubeVideo() {
    if (!flags.mediaUpload || emergency.readOnly) { setComposerError("Media upload আপাতত বন্ধ আছে।"); return; }
    if (media.length) { setComposerError("YouTube ভিডিও যোগ করার আগে নির্বাচিত ছবিগুলো সরান।"); return; }
    const url = youtubeDraftUrl.trim();
    const parsed = parsePostMediaContent(url);
    if (!parsed.youtubeId) { setComposerError("সঠিক YouTube video link দিন।"); return; }
    setYoutubeUrl(url);
    setYoutubeTitle(youtubeDraftTitle.trim());
    setError("");
    setPicker("none");
  }
  function removeYoutubeVideo() { setYoutubeUrl(""); setYoutubeTitle(""); setYoutubeDraftUrl(""); setYoutubeDraftTitle(""); setError(""); }
  function removeMedia(index: number) { setMedia((current) => current.filter((_, currentIndex) => currentIndex !== index)); }

  const stopVoiceRecording = useCallback(async () => {
    if (stopRecordingLock.current) return;
    stopRecordingLock.current = true;
    recordingActiveRef.current = false;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri || recorderState.url;
      if (!uri) throw new Error("POST_AUDIO_MISSING");
      const size = await getLocalMediaSize(uri);
      validatePostAudioFileSize(size);
      setRecordingUri(uri);
      setRecordingSeconds(Math.min(MAX_POST_AUDIO_DURATION_SECONDS, Math.ceil(recorderState.durationMillis / 1000)));
      setError("");
    } catch (recordError) {
      const uri = recorder.uri || recorderState.url;
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      const code = recordError instanceof Error ? recordError.message : "";
      setComposerError(code === "POST_AUDIO_SIZE_INVALID" ? "রেকর্ডিং ১০ MB-এর বেশি হয়েছে। ছোট করে আবার রেকর্ড করুন।" : "রেকর্ডিং সংরক্ষণ করা যায়নি। আবার রেকর্ড করুন।");
    } finally { stopRecordingLock.current = false; }
  }, [recorder, recorderState.durationMillis, recorderState.url]);

  async function cancelVoiceRecording() {
    let uri = recordingUri;
    recordingActiveRef.current = false;
    setRecording(false);
    if (recorderState.isRecording) {
      await recorder.stop().catch(() => undefined);
      uri = recorder.uri || recorderState.url || uri;
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    setRecordingUri(""); setRecordingSeconds(0);
  }

  async function toggleVoiceRecording() {
    if (!flags.mediaUpload || emergency.readOnly) { setComposerError("Media upload আপাতত বন্ধ আছে।"); return; }
    if (recording) {
      await stopVoiceRecording();
      return;
    }
    if (pollMode) { setComposerError("পোলের সঙ্গে voice recording যোগ করা যাবে না।"); return; }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { setComposerError("ভয়েস পোস্টের জন্য microphone permission প্রয়োজন। Settings থেকে permission চালু করুন।"); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_POST_AUDIO_DURATION_SECONDS });
      recordingActiveRef.current = true;
      setRecording(true); setRecordingUri(""); setRecordingSeconds(0); setError("");
    } catch { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined); setComposerError("রেকর্ডিং শুরু করা যায়নি। microphone permission আবার পরীক্ষা করুন।"); }
  }

  useEffect(() => {
    if (!recording || recorderState.durationMillis < MAX_POST_AUDIO_DURATION_SECONDS * 1000) return;
    const timer = setTimeout(() => void stopVoiceRecording(), 0);
    return () => clearTimeout(timer);
  }, [recording, recorderState.durationMillis, stopVoiceRecording]);

  async function openTagPicker() {
    try {
      const user = pathargataAuth.currentUser; if (!user) { router.push("/auth"); return; }
      const meResult = await getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, `users/${user.uid}`), 10 * 60 * 1000);
      const myProfile = meResult.value || {};
      const friends = myProfile.friends && typeof myProfile.friends === "object" ? myProfile.friends as Record<string, unknown> : {};
      const myFriends = new Set(Object.keys(friends).filter((uid) => Boolean(friends[uid])));
      setTagFriendIds(myFriends); setTagSearch(""); setPeople([]); setTagFriendsPage(0); setTagFriendsHasMore(myFriends.size > 0); setPicker("tags");
    } catch { setComposerError("ব্যবহারকারীর তালিকা আনা যায়নি।"); }
  }
  function toggleTag(person: { uid: string; name: string }) { setTaggedFriends((current) => { const exists = current.some((entry) => entry.uid === person.uid); if (exists) return current.filter((entry) => entry.uid !== person.uid); if (current.length >= MAX_TAGS) { setComposerError(`একটি পোস্টে সর্বোচ্চ ${MAX_TAGS} জনকে tag করা যাবে।`); return current; } return [...current, person]; }); }
  function chooseLocation(value: string) { setLocation(value.trim()); setCustomLocation(""); setPicker("none"); }
  function chooseCustomLocation() { if (!customLocation.trim()) { setComposerError("একটি location লিখে সেট করুন।"); return; } chooseLocation(customLocation); }
  function createUploadDraft(uid: string): PostUploadDraft {
    return {
      uid, savedAt: Date.now(), text, privacy, themeId: theme.id,
      media: media.map(({ file: _file, ...asset }) => asset as unknown as Record<string, unknown>),
      pollMode, pollOptions, feeling, location, taggedFriends, ephemeral, mobile, socialLink,
      youtubeUrl, youtubeTitle, youtubeDraftUrl, youtubeDraftTitle, mediaTab,
      recordingUri, recordingSeconds, postKey: postKeyRef.current,
      uploadedMediaUrls: { ...uploadedMediaUrlsRef.current },
    };
  }
  function resetComposer() { if (recordingUri) void FileSystem.deleteAsync(recordingUri, { idempotent: true }).catch(() => undefined); postKeyRef.current = null; uploadedMediaUrlsRef.current = {}; setText(""); setPrivacy("public"); setTheme(POST_THEMES[0]); setMedia([]); setPollMode(false); setPollOptions(["", "", "", ""]); setFeeling(null); setLocation(""); setCustomLocation(""); setTaggedFriends([]); setEphemeral(false); setMobile(""); setSocialLink(""); setYoutubeUrl(""); setYoutubeTitle(""); setYoutubeDraftUrl(""); setYoutubeDraftTitle(""); setMediaTab("image"); setRecordingUri(""); setRecordingSeconds(0); setError(""); }

  async function publish() {
    const content = text.trim(); const user = pathargataAuth.currentUser;
    if (!flags.postCreation || emergency.readOnly) { setComposerError(emergency.readOnly ? "জরুরি read-only mode চালু আছে। এখন নতুন post প্রকাশ করা যাচ্ছে না।" : "নতুন post প্রকাশ আপাতত বন্ধ আছে।"); return; }
    if ((media.length > 0 || Boolean(recordingUri) || Boolean(youtubeUrl.trim())) && !flags.mediaUpload) { setComposerError("Media upload আপাতত বন্ধ আছে। শুধু লেখা post চেষ্টা করুন।"); return; }
    if (loading || restoringDraft || recording || publishLock.current) return;
    if (!user) { setComposerError("পোস্ট করতে আগে login করুন।"); router.push("/auth"); return; }
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (pollMode && (!content || options.length < 2)) { setComposerError("পোলের প্রশ্ন ও অন্তত দুটি উত্তর দিন।"); return; }
    const parsedYoutube = parsePostMediaContent(youtubeUrl.trim());
    if (youtubeUrl.trim() && !parsedYoutube.youtubeId) { setComposerError("সঠিক YouTube video link দিন।"); return; }
    if (media.length && parsedYoutube.youtubeId) { setComposerError("এক পোস্টে ছবি ও YouTube ভিডিও একসাথে দেওয়া যাবে না। একটি media type বেছে নিন।"); return; }
    if (!pollMode && !content && !media.length && !recordingUri && !feeling && !parsedYoutube.youtubeId) { setComposerError("কিছু লিখুন, ছবি দিন, YouTube video যোগ করুন, অনুভূতি বাছুন অথবা voice record করুন।"); return; }
    if (mobile && !/^[+\d][\d\s-]{6,18}$/.test(mobile)) { setComposerError("মোবাইল নম্বরটি সঠিকভাবে লিখুন।"); return; }
    if (socialLink && !/^https?:\/\//i.test(socialLink)) { setComposerError("সোশ্যাল link-এর শুরুতে https:// দিন।"); return; }
    if (recordingUri && privacy !== "public") { setComposerError("বর্তমান audio URL public হওয়ায় voice post শুধু Public audience-এ দেওয়া যাবে।"); return; }
    publishLock.current = true;
    setLoading(true); setError("");
    const progressPath = user ? `users/${user.uid}/post_upload` : "";
    const reportProgress = async (value: Record<string, unknown>) => {
      if (!progressPath) return;
      // Progress is only a UI convenience. An outdated rules deployment must
      // never prevent the actual post write from reaching the database.
      await set(ref(pathargataDb, progressPath), value).catch(() => undefined);
    };
    try {
      if (!postKeyRef.current) postKeyRef.current = push(ref(pathargataDb, "posts")).key;
      if (!postKeyRef.current) throw new Error("POST_ID_UNAVAILABLE");
      await savePostUploadDraft(createUploadDraft(user.uid)).catch(() => undefined);
      const profile = (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
      await reportProgress({ status: "uploading", progress: 5, label: "পোস্ট প্রস্তুত হচ্ছে…", timestamp: Date.now() });
      const mediaUrls: string[] = [];
      for (let index = 0; index < media.length; index += 1) {
        if (pathargataAuth.currentUser?.uid !== user.uid) throw new Error("POST_SESSION_CHANGED");
        const uri = media[index].uri;
        let uploadedUrl = uploadedMediaUrlsRef.current[uri];
        if (!uploadedUrl) {
          const uploaded = await uploadImageFromUri(uri, "image/jpeg", undefined);
          uploadedUrl = uploaded.url;
          uploadedMediaUrlsRef.current[uri] = uploadedUrl;
          await savePostUploadDraft(createUploadDraft(user.uid)).catch(() => undefined);
        }
        mediaUrls.push(uploadedUrl);
        await reportProgress({ status: "uploading", progress: 15 + Math.round(((index + 1) / media.length) * 55), label: `ছবি ${index + 1}/${media.length} upload হচ্ছে…`, timestamp: Date.now() });
      }
      let voiceUrl: string | null = null;
      if (recordingUri) {
        if (pathargataAuth.currentUser?.uid !== user.uid) throw new Error("POST_SESSION_CHANGED");
        await reportProgress({ status: "uploading", progress: 78, label: "ভয়েস upload হচ্ছে… 0%", timestamp: Date.now() });
        const audioFormat = getPostAudioFormat(Platform.OS === "web" ? "web" : "other");
        voiceUrl = uploadedMediaUrlsRef.current[recordingUri];
        if (!voiceUrl) {
          voiceUrl = await uploadUserMedia(recordingUri, audioFormat.mimeType, audioFormat.extension, "post-audio", (progress) => {
            void reportProgress({ status: "uploading", progress: 78 + Math.round(progress * 0.08), label: `ভয়েস upload হচ্ছে… ${progress}%`, timestamp: Date.now() });
          });
          uploadedMediaUrlsRef.current[recordingUri] = voiceUrl;
          await savePostUploadDraft(createUploadDraft(user.uid)).catch(() => undefined);
        }
      }
      await reportProgress({ status: "uploading", progress: 88, label: "পোস্ট প্রকাশ হচ্ছে…", timestamp: Date.now() });
      if (pathargataAuth.currentUser?.uid !== user.uid) throw new Error("POST_SESSION_CHANGED");
      const mediaType = media.length ? "image" : null;
      const postPayload = {
        uid: user.uid, author: profile.name || user.displayName || "Pathargata user", authorPic: profile.profile_pic || user.photoURL || null,
        title: parsedYoutube.youtubeId ? youtubeTitle.trim() : "", content, youtubeUrl: parsedYoutube.youtubeId ? youtubeUrl.trim() : "", youtubeTitle: parsedYoutube.youtubeId ? youtubeTitle.trim() : "", images: mediaUrls, image: mediaUrls[0] || "", mediaType,
        type: pollMode ? "poll" : voiceUrl && !content && !mediaUrls.length ? "voice" : "text", audio: voiceUrl,
        bgColor: mediaUrls.length || voiceUrl || pollMode ? "" : theme.value, feeling, checkInLocation: location || null,
        taggedFriends: taggedFriends.length ? taggedFriends : null, expiresAt: ephemeral ? Date.now() + 24 * 60 * 60 * 1000 : null,
        mobile: mobile || null, socialLink: socialLink || null, ...(pollMode ? { options: options.map((option) => ({ text: option, votes: 0 })) } : {}),
        timestamp: Date.now(), likes: {}, comments: {}, repostCount: 0, privacy, union: profile.union || "", village: profile.village || "", authorRole: profile.role || "user", authorVerified: Boolean(profile.isVerified), adminScore: 0,
      };
      const postRef = ref(pathargataDb, `posts/${postKeyRef.current}`);
      if (!postRef.key) throw new Error("POST_ID_UNAVAILABLE");
      await savePostUploadDraft(createUploadDraft(user.uid)).catch(() => undefined);
      await set(postRef, postPayload);
      if (postRef.key) {
        await set(ref(pathargataDb, `user_post_index/${user.uid}/${postRef.key}`), { timestamp: postPayload.timestamp });
        if (privacy === "public") {
          await set(
            ref(pathargataDb, `public_posts/${postRef.key}`),
            buildPublicFeedPostProjection(postPayload),
          );
        }
        if (privacy === "friends") await set(ref(pathargataDb, `friends_post_index/${user.uid}/${postRef.key}`), { timestamp: postPayload.timestamp }).catch(() => undefined);
      }
      await invalidateRtdbSnapshotCache(["posts", "public_posts", `user_post_index/${user.uid}`]);
      if (postRef.key && taggedFriends.length) await Promise.all(taggedFriends.map((friend) => push(ref(pathargataDb, `notifications/${friend.uid}`), { type: "post_tag", fromUid: user.uid, fromName: profile.name || user.displayName || "একজন ব্যবহারকারী", fromPhoto: profile.profile_pic || user.photoURL || null, postId: postRef.key, postPreview: content.trim().slice(0, 140), timestamp: Date.now(), read: false })));
      await reportProgress({ status: "complete", progress: 100, label: "পোস্ট সফলভাবে upload হয়েছে", postId: postRef.key || "", timestamp: Date.now() });
      await clearPostUploadDraft(user.uid).catch(() => undefined);
      setTimeout(() => { void remove(ref(pathargataDb, progressPath)).catch(() => undefined); }, 4500);
      playAppSound("send");
      resetComposer();
      router.replace("/(tabs)");
    } catch (publishError) {
      playAppSound("error");
      const message = publishError instanceof Error ? publishError.message : "পোস্ট প্রকাশ করা যায়নি। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।";
      if (message === "POST_SESSION_CHANGED") { postKeyRef.current = null; uploadedMediaUrlsRef.current = {}; }
      if (message !== "POST_SESSION_CHANGED") await savePostUploadDraft(createUploadDraft(user.uid)).catch(() => undefined);
      await reportProgress({ status: "error", progress: 0, label: message, timestamp: Date.now() });
      setComposerError(message === "POST_SESSION_CHANGED" ? "Upload চলাকালে account বদলেছে। বর্তমান account দিয়ে media আবার বাছাই করুন।" : message.includes("permission-denied") || message.includes("PERMISSION_DENIED") ? "পোস্ট করার অনুমতি নেই। আপনার account status এবং server rules যাচাই করুন।" : message);
    }
    finally { publishLock.current = false; setLoading(false); }
  }

  useEffect(() => { publishCallbackRef.current = publish; });
  useEffect(() => {
    if (!shouldAutoRetry || !restoredDraft || autoRetryAttemptedRef.current) return undefined;
    autoRetryAttemptedRef.current = true;
    const timer = setTimeout(() => { void publishCallbackRef.current?.(); }, 0);
    return () => clearTimeout(timer);
  }, [restoredDraft, shouldAutoRetry]);

  return <ScreenContainer className="bg-background"><KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}><View className="flex-1">
    <View className="flex-row items-center justify-between border-b border-border bg-surface px-5 pb-3 pt-3"><TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-surface" onPress={() => safeGoBack("/(tabs)")} accessibilityLabel="ফিরে যান"><Ionicons name="arrow-back" size={21} color="#334E40" /></TouchableOpacity><View className="items-center"><Text className="text-[18px] font-extrabold text-foreground">পোস্ট তৈরি করুন</Text><Text className="mt-0.5 text-[12px] text-muted">{restoringDraft ? "ব্যর্থ পোস্টের ড্রাফট ফিরিয়ে আনা হচ্ছে…" : "আপনার কমিউনিটির সঙ্গে শেয়ার করুন"}</Text></View><TouchableOpacity className="rounded-full bg-[#0A6652] px-4 py-2.5 shadow-sm" onPress={() => void publish()} disabled={loading || restoringDraft || pickingMedia || recording}>{loading || restoringDraft ? <ActivityIndicator color="white" size="small" /> : <Text className="text-[14px] font-extrabold text-white">পোস্ট করুন</Text>}</TouchableOpacity></View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 180, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} showsVerticalScrollIndicator={false}><View className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-sm">
      <View className="flex-row items-center border-b border-border px-4 py-4"><View className="h-12 w-12 items-center justify-center overflow-hidden rounded-[17px] border border-border bg-surface"><Ionicons name="person-circle-outline" size={30} color="#0A8065" /></View><View className="ml-3 flex-1"><Text className="text-[15px] font-extrabold text-foreground">আপনার পোস্ট</Text><TouchableOpacity onPress={() => setPicker("privacy")} className="mt-1.5 flex-row items-center gap-1.5 self-start rounded-full bg-surface px-2.5 py-1"><Ionicons name={selectedPrivacy.icon} size={14} color="#3E5A4B" /><Text className="text-[12px] font-bold text-muted">{selectedPrivacy.label}</Text><Ionicons name="chevron-down" size={13} color="#718078" /></TouchableOpacity></View>{ephemeral ? <View className="items-center rounded-xl bg-[#FFF1E7] px-2.5 py-1.5"><Ionicons name="stopwatch-outline" size={18} color="#E36B26" /><Text className="mt-0.5 text-[11px] font-bold text-[#C9551D]">২৪ ঘণ্টা</Text></View> : null}</View>
      <View className="px-4 pt-4">{feeling || location || taggedFriends.length ? <View className="mb-3 flex-row flex-wrap gap-2">{feeling ? <View className="flex-row items-center gap-1.5 rounded-full bg-[#FFF4E7] px-3 py-1.5"><Text className="text-sm">{feeling.emoji}</Text><Text className="text-[12px] font-bold text-[#8A6137]">{feeling.text}</Text><TouchableOpacity onPress={() => setFeeling(null)}><Ionicons name="close-circle" size={18} color="#B88B5B" /></TouchableOpacity></View> : null}{location ? <View className="flex-row items-center gap-1.5 rounded-full bg-[#EDF7F0] px-3 py-1.5"><Ionicons name="location" size={18} color="#0A8065" /><Text numberOfLines={1} className="max-w-[150px] text-[12px] font-bold text-[#24704F]">{location}</Text><TouchableOpacity onPress={() => setLocation("")}><Ionicons name="close-circle" size={18} color="#77A68B" /></TouchableOpacity></View> : null}{taggedFriends.length ? <View className="flex-row items-center gap-1.5 rounded-full bg-[#EEF4FF] px-3 py-1.5"><Ionicons name="people" size={18} color="#3C72BA" /><Text className="text-[12px] font-bold text-[#3C72BA]">{taggedFriends.length} জন tag</Text><TouchableOpacity onPress={() => setTaggedFriends([])}><Ionicons name="close-circle" size={18} color="#82A5D6" /></TouchableOpacity></View> : null}</View> : null}<ComposerTextArea text={text} setText={setText} theme={theme} /></View>
      {!media.length && !recordingUri && !pollMode ? <View className="px-4 pb-1 pt-3"><SectionLabel icon="color-palette-outline">পোস্টের background</SectionLabel><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9, paddingBottom: 3 }}>{POST_THEMES.map((option) => <TouchableOpacity key={option.id} onPress={() => setTheme(option)} accessibilityLabel={`${option.label} background`} className={`h-9 w-9 overflow-hidden rounded-xl border-2 ${theme.id === option.id ? "border-[#0A6652]" : "border-white"}`}><LinearGradient colors={option.colors} style={{ flex: 1 }} /></TouchableOpacity>)}</ScrollView></View> : null}
      {media.length ? <View className="px-4 pb-2 pt-3"><View className="mb-2 flex-row items-center justify-between"><SectionLabel icon="images-outline">{`ছবি preview · ${media.length}/${MAX_POST_MEDIA}`}</SectionLabel><TouchableOpacity onPress={() => setMedia([])}><Text className="text-[12px] font-bold text-[#C24F55]">সব সরান</Text></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{media.map((asset, index) => <View key={`${asset.assetId || asset.uri}-${index}`} className="h-36 w-36 overflow-hidden rounded-2xl bg-[#17251F]"><Image source={{ uri: asset.uri }} className="h-full w-full" resizeMode="contain" /><View className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1"><Text className="text-[12px] font-bold text-white">{index + 1}/{media.length}</Text></View><TouchableOpacity className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-black/65" onPress={() => removeMedia(index)} disabled={loading} accessibilityLabel={`${index + 1} নম্বর photo সরান`}><Ionicons name="close" size={19} color="white" /></TouchableOpacity></View>)}</ScrollView></View> : null}
      {youtubeUrl ? <View className="px-4 pb-2 pt-3"><View className="mb-2 flex-row items-center justify-between"><SectionLabel icon="logo-youtube">YouTube ভিডিও</SectionLabel><TouchableOpacity onPress={removeYoutubeVideo} disabled={loading} accessibilityLabel="YouTube ভিডিও সরান"><Ionicons name="close-circle" size={22} color="#C24F55" /></TouchableOpacity></View><PostYoutubeCard content={youtubeUrl} title={youtubeTitle} previewOnly /></View> : null}

      {pollMode ? <View className="mx-4 mb-3 rounded-2xl border border-[#CFE2F7] bg-[#F5FAFF] p-3"><View className="mb-2 flex-row items-center gap-2"><View className="h-8 w-8 items-center justify-center rounded-xl bg-[#DCEEFF]"><Ionicons name="stats-chart" size={18} color="#3479BE" /></View><View className="flex-1"><Text className="text-[14px] font-extrabold text-[#245985]">কমিউনিটি পোল</Text><Text className="text-[11px] text-[#6C8CA7]">প্রশ্নের নিচে অন্তত ২টি উত্তর দিন</Text></View><TouchableOpacity onPress={() => setPollMode(false)}><Ionicons name="close-circle" size={20} color="#7898B3" /></TouchableOpacity></View>{pollOptions.map((option, index) => <TextInput key={index} value={option} onChangeText={(value) => setPollOptions((current) => current.map((entry, i) => i === index ? value : entry))} placeholder={`উত্তর ${index + 1}${index < 2 ? " (আবশ্যক)" : " (ঐচ্ছিক)"}`} placeholderTextColor="#9CB0BF" maxLength={100} className="mb-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-foreground" />)}</View> : null}
      {recordingUri ? <View className="mx-4 mb-3 rounded-2xl border border-[#D5C7F4] bg-[#F6F1FF] px-3 py-3"><View className="mb-2 flex-row items-center justify-between"><Text className="text-[13px] font-extrabold text-[#5E3E91]">ভয়েস রেকর্ড প্রস্তুত · {displayedRecordingSeconds} সেকেন্ড</Text><TouchableOpacity onPress={() => void cancelVoiceRecording()} accessibilityLabel="ভয়েস recording বাতিল"><Ionicons name="trash-outline" size={20} color="#B24D75" /></TouchableOpacity></View><PostAudioPlayer uri={recordingUri} /></View> : null}
      {recording ? <View className="mx-4 mb-3 flex-row items-center rounded-2xl border border-[#F5C9D0] bg-[#FFF2F4] px-3 py-3"><View className="h-3 w-3 rounded-full bg-[#D84D63]" /><View className="ml-3 flex-1"><Text className="text-[13px] font-extrabold text-[#AD3E53]">রেকর্ডিং চলছে… {displayedRecordingSeconds}/{MAX_POST_AUDIO_DURATION_SECONDS} সেকেন্ড</Text><Text className="mt-0.5 text-[11px] text-[#B56B79]">১০ MB-এর বেশি হলে সংরক্ষণ হবে না</Text></View><TouchableOpacity onPress={() => void stopVoiceRecording()} className="mr-2 h-9 w-9 items-center justify-center rounded-xl bg-[#D84D63]" accessibilityLabel="ভয়েস রেকর্ডিং থামান"><Ionicons name="stop" size={19} color="white" /></TouchableOpacity><TouchableOpacity onPress={() => void cancelVoiceRecording()} className="h-9 w-9 items-center justify-center rounded-xl bg-white" accessibilityLabel="ভয়েস রেকর্ডিং বাতিল"><Ionicons name="close" size={19} color="#B24D75" /></TouchableOpacity></View> : null}
      <View className="px-4 pb-2 pt-4"><SectionLabel icon="add-circle-outline">পোস্টে যুক্ত করুন</SectionLabel><View className="flex-row flex-wrap gap-2.5"><AddOption icon={youtubeUrl ? "logo-youtube" : "images-outline"} label={media.length ? `ছবি ${media.length}/${MAX_POST_MEDIA}` : youtubeUrl ? "ভিডিও" : "মিডিয়া"} tone="green" active={media.length > 0 || Boolean(youtubeUrl)} onPress={openMediaPicker} disabled={loading || pickingMedia} loading={pickingMedia} /><AddOption icon="location-outline" label={location ? "স্থান বদলান" : "চেক-ইন / স্থান"} tone="red" active={Boolean(location)} onPress={() => setPicker("location")} disabled={loading} /><AddOption icon="happy-outline" label={feeling ? "অনুভূতি বদলান" : "অনুভূতি"} tone="amber" active={Boolean(feeling)} onPress={() => setPicker("feeling")} disabled={loading} /><AddOption icon="person-add-outline" label={taggedFriends.length ? `${taggedFriends.length} জন tag` : "বন্ধু tag"} tone="blue" active={taggedFriends.length > 0} onPress={() => void openTagPicker()} disabled={loading} /><AddOption icon="stats-chart-outline" label={pollMode ? "Poll চালু" : "Poll"} tone="blue" active={pollMode} onPress={() => { setPollMode((value) => !value); setRecordingUri(""); }} disabled={loading || media.length > 0} /><AddOption icon="mic-outline" label={recording ? "থামান" : recordingUri ? "Voice ready" : "ভয়েস"} tone="purple" active={recording || Boolean(recordingUri)} onPress={() => void toggleVoiceRecording()} disabled={loading || pollMode || Boolean(recordingUri)} /></View></View>
      <View className="mx-4 mb-3 flex-row items-center justify-between rounded-2xl border border-[#F4D4BA] bg-[#FFF8F1] px-3.5 py-3"><View className="flex-row items-center gap-3"><View className="h-9 w-9 items-center justify-center rounded-xl bg-[#FFE9D5]"><Ionicons name="stopwatch-outline" size={19} color="#E36B26" /></View><View><Text className="text-[14px] font-extrabold text-[#9C531E]">স্টোরি স্টাইল পোস্ট</Text><Text className="mt-0.5 text-[11px] text-[#B9794B]">২৪ ঘণ্টা পর feed থেকে সরে যাবে</Text></View></View><TouchableOpacity onPress={() => setEphemeral((value) => !value)} className={`h-7 w-12 justify-center rounded-full px-1 ${ephemeral ? "bg-[#E9782E]" : "bg-[#D9DED9]"}`} accessibilityRole="switch" accessibilityState={{ checked: ephemeral }}><View className={`h-5 w-5 rounded-full bg-surface shadow-sm ${ephemeral ? "self-end" : "self-start"}`} /></TouchableOpacity></View>
      <View className="px-4 pb-3"><SectionLabel icon="call-outline">যোগাযোগের তথ্য (ঐচ্ছিক)</SectionLabel><View className="flex-row gap-2"><TextInput value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="মোবাইল নম্বর" placeholderTextColor="#9AA9A0" className="flex-1 rounded-xl border border-[#E1E8E2] bg-[#F9FBF9] px-3 py-2.5 text-[13px] text-[#24352B]" maxLength={20} /><TextInput value={socialLink} onChangeText={setSocialLink} autoCapitalize="none" keyboardType="url" placeholder="WhatsApp / social link" placeholderTextColor="#9AA9A0" className="flex-1 rounded-xl border border-[#E1E8E2] bg-[#F9FBF9] px-3 py-2.5 text-[13px] text-[#24352B]" maxLength={200} /></View></View>
      {error ? <View className="mx-4 mb-3 flex-row items-start gap-2 rounded-2xl border border-[#F2C9C9] bg-[#FFF5F5] px-3 py-2.5"><Ionicons name="alert-circle" size={18} color="#C24F55" /><Text className="flex-1 text-[13px] leading-4 text-[#A3413A]">{error}</Text>{!loading && !restoringDraft ? <TouchableOpacity onPress={() => void publish()} accessibilityRole="button" accessibilityLabel="আবার upload চেষ্টা করুন"><Text className="text-[12px] font-extrabold text-primary">আবার চেষ্টা</Text></TouchableOpacity> : null}<TouchableOpacity onPress={() => setError("")}><Ionicons name="close" size={18} color="#B56B79" /></TouchableOpacity></View> : null}
      <View className="flex-row items-center justify-between border-t border-border px-4 py-3"><Text className="text-[12px] text-[#829087]">{text.length}/{MAX_POST_TEXT}</Text><Text className="flex-1 px-3 text-right text-[11px] text-[#95A199]">সত্য, সহায়ক ও সম্মানজনক তথ্য শেয়ার করুন</Text><TouchableOpacity onPress={() => void publish()} disabled={loading || pickingMedia || recording} className="h-10 min-w-[104px] items-center justify-center rounded-xl bg-[#0A6652] px-4">{loading ? <ActivityIndicator color="white" size="small" /> : <Text className="text-[14px] font-extrabold text-white">পোস্ট করুন</Text>}</TouchableOpacity></View>
    </View></ScrollView>
  </View></KeyboardAvoidingView>

  <BottomSheet visible={picker === "media"} onClose={() => setPicker("none")}>
    <View className="mb-4 flex-row items-center justify-between"><View><Text className="text-[20px] font-extrabold text-foreground">মিডিয়া যোগ করুন</Text><Text className="mt-1 text-[13px] text-muted">একটি পোস্টে ছবি অথবা YouTube ভিডিও</Text></View><TouchableOpacity onPress={() => setPicker("none")} accessibilityLabel="মিডিয়া বাছাই বন্ধ করুন"><Ionicons name="close-circle" size={24} color="#718078" /></TouchableOpacity></View>
    <View className="mb-4 flex-row gap-3">
      <TouchableOpacity onPress={() => chooseMediaTab("image")} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-3 py-3 ${mediaTab === "image" ? "border-[#0A8065] bg-[#EFF8F1]" : "border-border bg-surface"}`}><Ionicons name="images-outline" size={19} color={mediaTab === "image" ? "#0A8065" : "#718078"} /><Text className={`text-[14px] font-extrabold ${mediaTab === "image" ? "text-[#0A8065]" : "text-muted"}`}>ইমেজ</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => chooseMediaTab("video")} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-3 py-3 ${mediaTab === "video" ? "border-[#D54A5D] bg-[#FFF1F3]" : "border-border bg-surface"}`}><Ionicons name="logo-youtube" size={19} color={mediaTab === "video" ? "#D54A5D" : "#718078"} /><Text className={`text-[14px] font-extrabold ${mediaTab === "video" ? "text-[#D54A5D]" : "text-muted"}`}>ভিডিও</Text></TouchableOpacity>
    </View>
    {error ? <Text className="mb-3 rounded-xl bg-[#FFF2F1] px-3 py-2 text-[12px] font-semibold text-[#A3413A]">{error}</Text> : null}
    {mediaTab === "image" ? <View>
      <Text className="mb-3 text-[13px] leading-5 text-muted">গ্যালারি থেকে সর্বোচ্চ {MAX_POST_MEDIA}টি ছবি বাছুন। ছবি ও YouTube ভিডিও একই পোস্টে যোগ করা যাবে না।</Text>
      {youtubeUrl ? <View className="rounded-2xl border border-[#F1D2D0] bg-[#FFF5F4] p-3"><Text className="text-[13px] font-semibold text-[#A3413A]">এই পোস্টে YouTube ভিডিও যোগ করা আছে। ছবি দিতে আগে ভিডিও সরান।</Text><TouchableOpacity onPress={removeYoutubeVideo} className="mt-3 self-start rounded-xl bg-white px-4 py-2.5"><Text className="text-[13px] font-extrabold text-[#C24F55]">ভিডিও সরিয়ে ছবি বাছুন</Text></TouchableOpacity></View> : <TouchableOpacity onPress={() => void pickMedia()} disabled={loading || pickingMedia || !flags.mediaUpload || emergency.readOnly || media.length >= MAX_POST_MEDIA} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#0A6652] px-4 py-4"><Ionicons name="images-outline" size={20} color="white" />{pickingMedia ? <ActivityIndicator color="white" size="small" /> : <Text className="text-[14px] font-extrabold text-white">গ্যালারি থেকে ছবি বাছুন</Text>}</TouchableOpacity>}
      {media.length ? <Text className="mt-3 text-center text-[12px] font-semibold text-[#496258]">{media.length}/{MAX_POST_MEDIA}টি ছবি নির্বাচিত</Text> : null}
    </View> : <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
      <Text className="text-[13px] leading-5 text-muted">YouTube ভিডিওর link দিন। ভিডিও tab-এ ছবি upload হবে না, আর ছবির সঙ্গে YouTube ভিডিও দেওয়া যাবে না।</Text>
      {media.length ? <View className="rounded-2xl border border-[#F1D2D0] bg-[#FFF5F4] p-3"><Text className="text-[13px] font-semibold text-[#A3413A]">এই পোস্টে {media.length}টি ছবি আছে। YouTube ভিডিও যোগ করতে আগে ছবিগুলো সরাতে হবে।</Text><TouchableOpacity onPress={() => setMedia([])} className="mt-3 self-start rounded-xl bg-white px-4 py-2.5"><Text className="text-[13px] font-extrabold text-[#C24F55]">ছবি সরিয়ে ভিডিও যোগ করুন</Text></TouchableOpacity></View> : <>
        <TextInput value={youtubeDraftUrl} onChangeText={setYoutubeDraftUrl} autoCapitalize="none" keyboardType="url" placeholder="YouTube video link দিন" placeholderTextColor="#8C9ABD" className="rounded-xl border border-[#D6E0F4] bg-white px-3 py-3 text-[13px] text-[#24355E]" maxLength={300} />
        <TextInput value={youtubeDraftTitle} onChangeText={setYoutubeDraftTitle} placeholder="ভিডিওর title (ঐচ্ছিক)" placeholderTextColor="#8C9ABD" className="rounded-xl border border-[#D6E0F4] bg-white px-3 py-3 text-[13px] text-[#24355E]" maxLength={160} />
        {parsePostMediaContent(youtubeDraftUrl.trim()).youtubeId ? <PostYoutubeCard content={youtubeDraftUrl} title={youtubeDraftTitle} previewOnly /> : <Text className="text-[11px] text-[#7B8990]">সঠিক YouTube link দিলে thumbnail preview দেখা যাবে।</Text>}
        <TouchableOpacity onPress={addYoutubeVideo} disabled={!parsePostMediaContent(youtubeDraftUrl.trim()).youtubeId || loading || !flags.mediaUpload || emergency.readOnly} className={`mt-1 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3.5 ${parsePostMediaContent(youtubeDraftUrl.trim()).youtubeId && flags.mediaUpload && !emergency.readOnly ? "bg-[#C93046]" : "bg-[#D7DCDD]"}`}><Ionicons name="logo-youtube" size={18} color="white" /><Text className="text-[14px] font-extrabold text-white">ভিডিওটি পোস্টে যোগ করুন</Text></TouchableOpacity>
      </>}
    </ScrollView>}
  </BottomSheet>
  <BottomSheet visible={picker === "privacy"} onClose={() => setPicker("none")}><Text className="mb-1 text-[20px] font-extrabold text-foreground">কারা দেখতে পাবেন?</Text><Text className="mb-4 text-[13px] text-muted">আপনার পোস্টের audience বেছে নিন</Text>{PRIVACY_OPTIONS.map((option) => <TouchableOpacity key={option.value} onPress={() => { setPrivacy(option.value); setPicker("none"); }} className={`mb-2 flex-row items-center rounded-2xl border p-3.5 ${privacy === option.value ? "border-[#0A8065] bg-[#EFF8F1]" : "border-[#E6ECE7] bg-surface"}`}><View className={`h-10 w-10 items-center justify-center rounded-xl ${privacy === option.value ? "bg-[#D5F0DC]" : "bg-surface"}`}><Ionicons name={option.icon} size={20} color={privacy === option.value ? "#0A8065" : "#6A7A70"} /></View><View className="ml-3 flex-1"><Text className="text-[15px] font-extrabold text-foreground">{option.label}</Text><Text className="mt-1 text-[12px] text-muted">{option.description}</Text></View>{privacy === option.value ? <Ionicons name="checkmark-circle" size={22} color="#0A8065" /> : <Ionicons name="ellipse-outline" size={22} color="#B4C0B7" />}</TouchableOpacity>)}</BottomSheet>
  <BottomSheet visible={picker === "feeling"} onClose={() => setPicker("none")}><Text className="mb-1 text-[20px] font-extrabold text-foreground">কী অনুভব করছেন?</Text><Text className="mb-4 text-[13px] text-muted">আপনার mood পোস্টের সঙ্গে যোগ করুন</Text><View className="flex-row flex-wrap gap-2.5">{FEELINGS.map((item) => <TouchableOpacity key={item.text} onPress={() => { setFeeling(feeling?.text === item.text ? null : item); setPicker("none"); }} className={`w-[31%] items-center rounded-2xl border px-2 py-3 ${feeling?.text === item.text ? "border-[#D5A86C] bg-[#FFF5E8]" : "border-border bg-[#FAFCFA]"}`}><Text className="text-2xl">{item.emoji}</Text><Text className="mt-1 text-center text-[12px] font-bold text-[#53645A]">{item.text}</Text></TouchableOpacity>)}</View></BottomSheet>
  <BottomSheet visible={picker === "location"} onClose={() => setPicker("none")}><View className="mb-4 flex-row items-center gap-3"><View className="h-10 w-10 items-center justify-center rounded-xl bg-[#FDEBEB]"><Ionicons name="location" size={20} color="#C24F55" /></View><View><Text className="text-[20px] font-extrabold text-foreground">চেক-ইন / স্থান</Text><Text className="mt-0.5 text-[13px] text-muted">কোথায় আছেন তা জানান</Text></View></View><View className="mb-4 flex-row items-center rounded-2xl border border-border bg-surface px-3"><Ionicons name="create-outline" size={18} color="#7C8A81" /><TextInput value={customLocation} onChangeText={setCustomLocation} placeholder="নিজের location লিখুন" placeholderTextColor="#9AA9A0" className="flex-1 px-2 py-3 text-[14px] text-foreground" returnKeyType="done" onSubmitEditing={chooseCustomLocation} /><TouchableOpacity onPress={chooseCustomLocation} className="rounded-xl bg-[#C24F55] px-3 py-2"><Text className="text-[12px] font-extrabold text-white">সেট</Text></TouchableOpacity></View><SectionLabel icon="star-outline">জনপ্রিয় স্থানসমূহ</SectionLabel>{POPULAR_LOCATIONS.map((item) => <TouchableOpacity key={item} onPress={() => chooseLocation(item)} className="mb-2 flex-row items-center gap-3 rounded-2xl border border-border bg-background px-3 py-3"><View className="h-8 w-8 items-center justify-center rounded-full bg-[#FDEBEB]"><Ionicons name="location-outline" size={18} color="#C24F55" /></View><Text className="flex-1 text-[14px] font-bold text-foreground">{item}</Text><Ionicons name="chevron-forward" size={18} color="#A0ADA4" /></TouchableOpacity>)}</BottomSheet>
  <BottomSheet visible={picker === "tags"} onClose={() => setPicker("none")}><View className="mb-3 flex-row items-center justify-between"><View><Text className="text-[20px] font-extrabold text-foreground">বন্ধুদের tag করুন</Text><Text className="mt-1 text-[13px] text-muted">{taggedFriends.length}/{MAX_TAGS} জন নির্বাচিত</Text></View><TouchableOpacity onPress={() => setPicker("none")} className="rounded-full bg-[#0A6652] px-4 py-2"><Text className="text-[13px] font-extrabold text-white">সম্পন্ন</Text></TouchableOpacity></View><View className="mb-3 flex-row items-center rounded-2xl border border-border bg-surface px-3"><Ionicons name="search-outline" size={18} color="#809087" /><TextInput value={tagSearch} onChangeText={setTagSearch} placeholder="নাম দিয়ে খুঁজুন" placeholderTextColor="#9AA9A0" className="flex-1 px-2 py-3 text-[14px] text-foreground" /></View><FlatList data={filteredPeople} keyExtractor={(person) => person.uid} keyboardShouldPersistTaps="handled" className="max-h-[52%]" onEndReached={() => { if (tagFriendsHasMore && !tagFriendsLoading) void loadTagFriends(tagFriendsPage + 1); }} onEndReachedThreshold={0.6} ListEmptyComponent={<View className="items-center py-8"><Ionicons name="people-outline" size={32} color="#C4CEC6" /><Text className="mt-2 text-[13px] text-[#819087]">{tagFriendsLoading ? "বন্ধুদের তালিকা লোড হচ্ছে…" : "কোনো বন্ধু পাওয়া যায়নি"}</Text></View>} ListFooterComponent={tagFriendsLoading ? <View className="items-center py-3"><ActivityIndicator color="#0A6652" /><Text className="mt-1 text-[12px] text-muted">আরও বন্ধু লোড হচ্ছে…</Text></View> : null} renderItem={({ item: person }) => { const selected = taggedFriends.some((entry) => entry.uid === person.uid); return <TouchableOpacity onPress={() => toggleTag(person)} className="flex-row items-center border-b border-border py-3"><View className={`h-9 w-9 items-center justify-center rounded-xl ${selected ? "bg-[#D9F0DF]" : "bg-surface"}`}><Text className="text-[14px] font-extrabold text-[#24624F]">{person.name.slice(0, 1)}</Text></View><Text className="ml-3 flex-1 text-[14px] font-bold text-foreground">{person.name}</Text><Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? "#0A8065" : "#B0BBB2"} /></TouchableOpacity>; }} /></BottomSheet>
  </ScreenContainer>;
}

function AddOption({ icon, label, tone, active, onPress, disabled, loading }: { icon: keyof typeof Ionicons.glyphMap; label: string; tone: "green" | "red" | "amber" | "blue" | "purple"; active?: boolean; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const styles = { green: { bg: "bg-[#EFF9F1]", border: "border-[#CBE8D0]", text: "#23834B" }, red: { bg: "bg-[#FFF2F1]", border: "border-[#F1D2D0]", text: "#C24F55" }, amber: { bg: "bg-[#FFF8E9]", border: "border-[#F3E0B7]", text: "#B47A27" }, blue: { bg: "bg-[#F0F5FF]", border: "border-[#D2E0FA]", text: "#4776BA" }, purple: { bg: "bg-[#F6F0FF]", border: "border-[#DFD1F7]", text: "#7550A6" } }[tone];
  return <TouchableOpacity onPress={onPress} disabled={disabled} className={`min-w-[30%] flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-3 ${styles.bg} ${styles.border} ${active ? "border-2" : ""}`}><View className="h-7 w-7 items-center justify-center rounded-xl bg-surface/70">{loading ? <ActivityIndicator size="small" color={styles.text} /> : <Ionicons name={icon} size={18} color={styles.text} />}</View><Text numberOfLines={1} className="shrink text-[12px] font-extrabold" style={{ color: styles.text }}>{label}</Text></TouchableOpacity>;
}
