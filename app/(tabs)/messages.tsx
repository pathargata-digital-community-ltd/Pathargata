import { getFreshWithCache, onValueWithCache as onValue } from "@/lib/rtdb-cache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import { get, limitToLast, orderByChild, push, query, ref, remove, set, update } from "firebase/database";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ChatListRow } from "@/components/chat-list-row";
import { pathargataAuth, pathargataDb, pathargataFunctions } from "@/lib/pathargata-firebase";
import { httpsCallable } from "firebase/functions";
import { playAppSound, setActiveChatPeerUid } from "@/lib/app-sounds";
import { decryptChatText, decryptLocalChatDraft, encryptChatText, encryptLocalChatDraft, ensureChatKeyPair, type EncryptedChatText } from "@/lib/chat-crypto";
import { decryptChatImage, decryptChatVoice, encryptAndUploadChatImage, encryptAndUploadChatVoice, forwardEncryptedChatMedia, type EncryptedChatImage, type EncryptedChatVoice } from "@/lib/chat-media";
import { decodeLegacyChatText as decode } from "@/lib/chat-legacy";
import { useRemoteControls } from "@/hooks/use-remote-controls";

type ChatPreview = { uid: string; name: string; lastMessage?: string; timestamp?: number; unread?: number; archived?: boolean; isRequest?: boolean; requestPending?: boolean; requestRejected?: boolean; requestAccepted?: boolean; photo?: string; online?: boolean };
type BlockedPeer = { uid: string; name: string };
type MessagePrivacy = "everyone" | "requests" | "friends";
type ChatMessage = { id: string; sender: string; text?: string; encryptedText?: EncryptedChatText; encryptedImage?: EncryptedChatImage; encryptedVoice?: EncryptedChatVoice; image?: string; voice?: string; timestamp?: number; status?: string; replyTo?: string; unsent?: boolean };
type ChatActionState = { item: ChatPreview; blockedByMe: boolean; blockedByPeer: boolean } | null;
const MESSAGE_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 15 };
function chatId(a: string, b: string) { return a < b ? `${a}_${b}` : `${b}_${a}`; }
function timeLabel(value?: number) { if (!value) return ""; return new Date(value).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" }); }
function safeChatName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "User";
}
const ensureChatMembership = httpsCallable<{ peerUid: string }, { chatId: string }>(pathargataFunctions, "ensureChatMembership");

function VoiceMessageBubble({ uri, mine }: { uri: string; mine: boolean }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  useEffect(() => () => {
    if (Platform.OS !== "web" && uri.includes("/chat-voice-")) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }, [uri]);
  return <TouchableOpacity className={`rounded-full px-3 py-2 flex-row items-center gap-2 ${mine ? "bg-green-700" : "bg-background"}`} onPress={() => status.playing ? player.pause() : player.play()}><Ionicons name={status.playing ? "pause" : "play"} size={18} color={mine ? "white" : "#15803D"} /><Text className={`text-xs font-bold ${mine ? "text-white" : "text-primary"}`}>{status.playing ? "চলছে..." : "ভয়েস মেসেজ"}</Text></TouchableOpacity>;
}

function ActionRow({ icon, title, onPress, danger = false }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void; danger?: boolean }) { return <TouchableOpacity onPress={onPress} className="flex-row items-center border-b border-border py-3.5"><View className={`h-10 w-10 items-center justify-center rounded-xl ${danger ? "bg-red-50" : "bg-surface"}`}><Ionicons name={icon} size={20} color={danger ? "#B91C1C" : "#0A8065"} /></View><Text className={`ml-3 flex-1 text-sm font-bold ${danger ? "text-red-700" : "text-foreground"}`}>{title}</Text><Ionicons name="chevron-forward" size={18} color="#94A3B8" /></TouchableOpacity>; }

export default function MessagesScreen() {
  const { flags, emergency } = useRemoteControls();
  const user = pathargataAuth.currentUser;
  const params = useLocalSearchParams<{ uid?: string; name?: string }>();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [selected, setSelected] = useState<ChatPreview | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceDraftUri, setVoiceDraftUri] = useState("");
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const [inboxError, setInboxError] = useState("");
  const [conversationError, setConversationError] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"all" | "unread" | "requests">("all");
  const [inboxRetry, setInboxRetry] = useState(0);
  const [conversationRetry, setConversationRetry] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [chatAction, setChatAction] = useState<ChatActionState>(null);
  const [showMessageSettings, setShowMessageSettings] = useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = useState(false);
  const [blockedPeers, setBlockedPeers] = useState<BlockedPeer[]>([]);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [decryptedTexts, setDecryptedTexts] = useState<Record<string, string>>({});
  const hiddenMessageIdsRef = useRef(hiddenMessageIds);
  const decryptedCacheRef = useRef(new Map<string, string>());
  const decryptingKeysRef = useRef(new Set<string>());
  const [visibleMessageIds, setVisibleMessageIds] = useState<string[]>([]);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: ChatMessage; isViewable: boolean }[] }) => {
    setVisibleMessageIds(viewableItems.filter((entry) => entry.isViewable).map((entry) => entry.item.id));
  }, []);
  const draftRef = useRef(draft);
  useEffect(() => { hiddenMessageIdsRef.current = hiddenMessageIds; }, [hiddenMessageIds]);
  useEffect(() => {
    for (const [key, value] of Object.entries(decryptedTexts)) {
      if (value) decryptedCacheRef.current.set(key, value);
    }
  }, [decryptedTexts]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerPic, setPeerPic] = useState("");
  const [peerLastSeen, setPeerLastSeen] = useState<number | null>(null);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(false);
  const [messagePrivacy, setMessagePrivacy] = useState<MessagePrivacy>("everyone");
  const [keyReady, setKeyReady] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [membershipState, setMembershipState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [membershipRetry, setMembershipRetry] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const messageListRef = useRef<FlatList<ChatMessage>>(null);

  async function openBlockedUsers() {
    if (!user) return;
    try {
      const snapshot = await get(ref(pathargataDb, `user_blocks/${user.uid}`));
      const entries = Object.keys(snapshot.val() || {});
      const peers = await Promise.all(entries.map(async (uid) => {
        const chat = chats.find((item) => item.uid === uid);
        if (chat) return { uid, name: chat.name };
        try {
          const profile = await get(ref(pathargataDb, `people_index/${uid}/name`));
          return { uid, name: safeChatName(profile.val()) };
        } catch { return { uid, name: `সদস্য · ${uid.slice(0, 6)}` }; }
      }));
      setBlockedPeers(peers);
      setShowBlockedUsers(true);
    } catch {
      setError("Block তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  async function unblockPeer(peer: BlockedPeer) {
    if (!user) return;
    try {
      await Promise.all([
        remove(ref(pathargataDb, `user_blocks/${user.uid}/${peer.uid}`)),
        remove(ref(pathargataDb, `users/${user.uid}/blocked_users/${peer.uid}`)),
      ]);
      setBlockedPeers((current) => current.filter((item) => item.uid !== peer.uid));
      setError(`${peer.name}-কে unblock করা হয়েছে।`);
    } catch {
      setError("Unblock করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  async function toggleReadReceipts() {
    if (!user) return;
    const next = !readReceiptsEnabled;
    try {
      await set(ref(pathargataDb, `users/${user.uid}/settings/readReceipts`), next);
      setReadReceiptsEnabled(next);
    } catch {
      setError("Read receipt setting সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  async function chooseMessagePrivacy(value: MessagePrivacy) {
    if (!user) return;
    try {
      await set(ref(pathargataDb, `users/${user.uid}/settings/messagePrivacy`), value);
      setMessagePrivacy(value);
    } catch {
      setError("Message privacy সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।");
    }
  }

  useEffect(() => {
    if (!recording || !recordingStartedAt) return;
    const timer = setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [recording, recordingStartedAt]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void ensureChatKeyPair(user.uid).then(() => { if (active) { setKeyReady(true); setKeyError(""); } }).catch((error) => {
      if (active) setKeyError(error instanceof Error && error.message === "CHAT_SECURE_STORAGE_UNAVAILABLE" ? "এই ডিভাইসে secure key storage নেই—E2E chat চালু করা যায়নি।" : "E2E key প্রস্তুত হয়নি। সার্ভার security rules ও connection যাচাই করুন।");
    });
    return () => { active = false; };
  }, [user]);

  const currentUserUid = user?.uid;
  const currentPeerUid = selected?.uid;

  useEffect(() => {
    if (!currentUserUid || !currentPeerUid) return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setMembershipState("loading");
        setConversationError("");
      }
    });
    void ensureChatMembership({ peerUid: currentPeerUid }).then(() => {
      if (active) setMembershipState("ready");
    }).catch((cause) => {
      if (!active) return;
      setMembershipState("error");
      const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code?: string }).code) : "";
      setConversationError(code.includes("permission-denied")
        ? "এই ব্যবহারকারীর সঙ্গে conversation অনুমোদিত নয় বা block করা আছে।"
        : "নিরাপদ conversation এখনো server-এ প্রস্তুত হয়নি। নতুন message শুরু করতে Firebase Functions deploy বা admin provisioning প্রয়োজন।");
    });
    return () => { active = false; };
  }, [currentPeerUid, currentUserUid, membershipRetry]);

  useEffect(() => {
    setActiveChatPeerUid(currentPeerUid || null);
    return () => setActiveChatPeerUid(null);
  }, [currentPeerUid]);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    void inboxRetry;
    void get(ref(pathargataDb, `users/${user.uid}/settings/readReceipts`)).then((snapshot) => setReadReceiptsEnabled(snapshot.val() === true)).catch(() => setReadReceiptsEnabled(false));
    void get(ref(pathargataDb, `users/${user.uid}/settings/messagePrivacy`)).then((snapshot) => {
      const value = snapshot.val();
      if (value === "everyone" || value === "requests" || value === "friends") setMessagePrivacy(value);
      else setMessagePrivacy("everyone");
    }).catch(() => setMessagePrivacy("everyone"));
    return onValue(query(ref(pathargataDb, `user_chats/${user.uid}`), orderByChild("timestamp"), limitToLast(100)), (snapshot) => {
      const raw = snapshot.val() || {};
      setChats(Object.entries(raw).map(([uid, info]) => {
        const item = (info && typeof info === "object" ? info : {}) as Partial<ChatPreview>;
        return { ...item, uid, name: safeChatName(item.name) };
      }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      setInboxError("");
    }, (listenerError) => setInboxError(listenerError.message || "Inbox আপডেট করা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"));
  }, [user, inboxRetry]));

  useEffect(() => {
    if (!currentUserUid || !currentPeerUid) return;
    const draftKey = `pathargata-chat-draft:${currentUserUid}:${chatId(currentUserUid, currentPeerUid)}`;
    let active = true;
    void AsyncStorage.getItem(draftKey).then(async (saved) => {
      if (!active || !saved || draftRef.current) return;
      const plaintext = await decryptLocalChatDraft(saved, currentUserUid);
      if (active && !draftRef.current) setDraft(plaintext);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [currentPeerUid, currentUserUid]);

  useEffect(() => {
    if (!currentUserUid || !currentPeerUid) return;
    const draftKey = `pathargata-chat-draft:${currentUserUid}:${chatId(currentUserUid, currentPeerUid)}`;
    const timer = setTimeout(() => {
      void (async () => {
        if (!draft.trim()) return AsyncStorage.removeItem(draftKey);
        const encrypted = await encryptLocalChatDraft(draft, currentUserUid);
        await AsyncStorage.setItem(draftKey, encrypted);
      })().catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, currentPeerUid, currentUserUid]);
  useEffect(() => {
    if (params.uid && params.uid !== user?.uid && !selected) {
      const timeout = setTimeout(() => setSelected({ uid: String(params.uid), name: String(params.name || "User"), unread: 0 }), 0);
      return () => clearTimeout(timeout);
    }
  }, [params.uid, params.name, user?.uid, selected]);
  useFocusEffect(useCallback(() => {
    if (!user || !selected || membershipState !== "ready") return;
    void conversationRetry;
    const activeChatId = chatId(user.uid, selected.uid);
    void get(ref(pathargataDb, `user_chats/${user.uid}/${selected.uid}`)).then((snapshot) => {
      const metadata = snapshot.val();
      if (metadata) setSelected((current) => {
        if (current?.uid !== selected.uid) return current;
        const merged = { ...current, ...metadata };
        return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
      });
    }).catch(() => undefined);
    void get(ref(pathargataDb, `users/${user.uid}/hidden_messages/${activeChatId}`)).then((snapshot) => {
      const ids = Object.keys(snapshot.val() || {});
      setHiddenMessageIds((current) => current.join("|") === ids.join("|") ? current : ids);
    }).catch(() => undefined);
    void get(ref(pathargataDb, `users/${user.uid}/settings/readReceipts`)).then((snapshot) => setReadReceiptsEnabled(snapshot.val() === true)).catch(() => setReadReceiptsEnabled(false));
    const conversationQuery = query(ref(pathargataDb, `chats/${activeChatId}`), limitToLast(50));
    const unsubscribe = onValue(conversationQuery, (snapshot) => {
      const raw = snapshot.val() || {};
      const nextMessages = Object.entries(raw).map(([id, value]) => ({ id, ...(value as Omit<ChatMessage, "id">) })).filter((item) => !hiddenMessageIdsRef.current.includes(item.id) && (item.text || item.encryptedText || item.encryptedImage || item.encryptedVoice || item.image || item.voice || item.sender)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setMessages(nextMessages);
      setConversationError("");
      const seenUpdates: Record<string, unknown> = {};
      for (const item of nextMessages) {
        if (readReceiptsEnabled && item.sender !== user.uid && item.status !== "seen" && !item.unsent) {
          seenUpdates[`chats/${activeChatId}/${item.id}/status`] = "seen";
        }
      }
      if (Object.keys(seenUpdates).length) void update(ref(pathargataDb), seenUpdates).catch(() => setConversationError("Read receipt আপডেট হয়নি। পরে আবার চেষ্টা করুন।"));
    }, (listenerError) => setConversationError(listenerError.message || "মেসেজ লোড করা যায়নি। cached মেসেজ থাকলে সেগুলো দেখা যাবে; সংযোগ পেলে আবার চেষ্টা করুন."));
    const typingUnsubscribe = onValue(ref(pathargataDb, `chats_typing/${user.uid}/${selected.uid}`), (snapshot) => setTyping(Boolean(snapshot.val())));
    const profileUnsubscribe = onValue(ref(pathargataDb, `people_index/${selected.uid}`), (snapshot) => setPeerPic(typeof snapshot.val()?.profile_pic === "string" ? snapshot.val().profile_pic : ""));
    const presenceUnsubscribe = onValue(ref(pathargataDb, `status/${selected.uid}`), (snapshot) => {
      const state = snapshot.val() || {};
      setPeerOnline(state.state === "online");
      setPeerLastSeen(typeof state.last_changed === "number" ? state.last_changed : null);
    }, () => { setPeerOnline(false); setPeerLastSeen(null); });
    update(ref(pathargataDb, `user_chats/${user.uid}/${selected.uid}`), { unread: 0 }).catch(() => undefined);
    return () => { unsubscribe(); typingUnsubscribe(); presenceUnsubscribe(); profileUnsubscribe(); set(ref(pathargataDb, `chats_typing/${selected.uid}/${user.uid}`), false).catch(() => undefined); };
  }, [selected, user, membershipState, conversationRetry, readReceiptsEnabled]));

  useEffect(() => {
    if (!user || !selected || !visibleMessageIds.length) return;
    const visibleIds = new Set(visibleMessageIds);
    const pending: { key: string; task: Promise<string> }[] = [];
    for (const item of messages) {
      if (!visibleIds.has(item.id)) continue;
      const candidates: { key: string; decrypt: () => Promise<string> }[] = [];
      if (item.encryptedText) candidates.push({ key: item.id, decrypt: () => decryptChatText(item.encryptedText!, user.uid) });
      if (item.encryptedImage) candidates.push({ key: `image:${item.id}`, decrypt: () => decryptChatImage(item.encryptedImage!, user.uid) });
      if (item.encryptedVoice) candidates.push({ key: `voice:${item.id}`, decrypt: () => decryptChatVoice(item.encryptedVoice!, user.uid) });
      for (const candidate of candidates) {
        if (decryptedCacheRef.current.has(candidate.key) || decryptingKeysRef.current.has(candidate.key)) continue;
        decryptingKeysRef.current.add(candidate.key);
        pending.push({ key: candidate.key, task: candidate.decrypt() });
      }
    }
    if (!pending.length) return;
    void Promise.all(pending.map(async ({ key, task }) => {
      try {
        return [key, await task] as const;
      } catch {
        return [key, key.startsWith("image:") || key.startsWith("voice:") ? "__decrypt_failed__" : "এই মেসেজটি এই ডিভাইসে decrypt করা যায়নি"] as const;
      }
    })).then((entries) => {
      for (const [key] of entries) decryptingKeysRef.current.delete(key);
      const batch = Object.fromEntries(entries);
      for (const [key, value] of entries) decryptedCacheRef.current.set(key, value);
      setDecryptedTexts((current) => ({ ...current, ...batch }));
    });
  }, [messages, selected, user, visibleMessageIds]);

  const messageById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const unreadTotal = useMemo(() => chats.reduce((sum, item) => sum + (item.unread || 0), 0), [chats]);
  const filteredChats = useMemo(() => { const term = search.trim().toLowerCase(); return chats.filter((item) => !item.archived && (inboxFilter !== "unread" || Boolean(item.unread)) && (inboxFilter !== "requests" || Boolean(item.isRequest)) && (!term || `${safeChatName(item.name)} ${decode(item.lastMessage)}`.toLowerCase().includes(term))); }, [chats, search, inboxFilter]);
  function handleDraft(value: string) { setDraft(value); if (user && selected) set(ref(pathargataDb, `chats_typing/${selected.uid}/${user.uid}`), Boolean(value.trim())).catch(() => undefined); }

  async function readPeerSendPolicy(peerUid: string) {
    if (!user) throw new Error("AUTH_REQUIRED");
    const [ownBlock, peerBlock, privacy, friendship, ownChatSnapshot, peerChatSnapshot] = await Promise.all([
      get(ref(pathargataDb, `user_blocks/${user.uid}/${peerUid}`)),
      get(ref(pathargataDb, `user_blocks/${peerUid}/${user.uid}`)),
      getFreshWithCache(ref(pathargataDb, `users/${peerUid}/settings/messagePrivacy`), 5 * 60_000),
      getFreshWithCache(ref(pathargataDb, `users/${peerUid}/friends/${user.uid}`), 60_000),
      get(ref(pathargataDb, `user_chats/${user.uid}/${peerUid}`)),
      get(ref(pathargataDb, `user_chats/${peerUid}/${user.uid}`)),
    ]);
    if (ownBlock.val() || peerBlock.val()) throw new Error("CHAT_BLOCKED");
    if ((privacy.error && privacy.value == null) || (friendship.error && friendship.value == null)) throw new Error("CHAT_POLICY_UNAVAILABLE");
    const ownChat = ownChatSnapshot.val() || {};
    if (ownChat.isRequest) throw new Error("CHAT_REQUEST_NOT_ACCEPTED");
    if (ownChat.requestPending || ownChat.requestRejected) throw new Error("CHAT_REQUEST_PENDING");
    const isRequest = !ownChatSnapshot.exists() && (privacy.value === "requests" || (privacy.value === "friends" && friendship.value == null));
    return { isRequest, ownChat, peerChat: peerChatSnapshot.val() || {} };
  }

  async function toggleVoiceRecording() {
    if (!user || !selected || selected.isRequest || selected.requestPending || !keyReady) return;
    if (recording) {
      setRecording(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (!recorder.uri) throw new Error("VOICE_FILE_MISSING");
        setVoiceDraftUri(recorder.uri);
        setError("");
      } catch {
        setError("ভয়েস রেকর্ডিং সংরক্ষণ করা যায়নি। আবার রেকর্ড করুন।");
      }
      return;
    }
    if (voiceDraftUri || sending || attaching) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { setError("ভয়েস মেসেজ পাঠাতে microphone permission দিন।"); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingStartedAt(Date.now());
      setRecordingSeconds(0);
      setRecording(true);
      setError("");
    } catch {
      setError("রেকর্ডিং শুরু করা যায়নি। microphone permission ও audio device পরীক্ষা করুন।");
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
  }

  async function sendVoiceMessage() {
    if (!flags.messaging || emergency.readOnly) { setError(emergency.readOnly ? "জরুরি read-only mode চালু আছে। Message পাঠানো যাচ্ছে না।" : "Messaging আপাতত বন্ধ আছে।"); return; }
    if (!user || !selected || !voiceDraftUri || recording || sending || !keyReady) return;
    setSending(true); setError("");
    try {
      const policy = await readPeerSendPolicy(selected.uid);
      const encryptedVoice = await encryptAndUploadChatVoice(voiceDraftUri, user.uid, selected.uid);
      const conversation = chatId(user.uid, selected.uid);
      const messageRef = push(ref(pathargataDb, `chats/${conversation}`));
      if (!messageRef.key) throw new Error("MESSAGE_KEY_UNAVAILABLE");
      const timestamp = Date.now();
      const ownPath = `user_chats/${user.uid}/${selected.uid}`;
      const peerPath = `user_chats/${selected.uid}/${user.uid}`;
      await update(ref(pathargataDb), {
        [`chats/${conversation}/${messageRef.key}`]: { sender: user.uid, timestamp, status: "sent", encryptedVoice, encryption: "nacl-box-v1", ...(replyTarget ? { replyTo: replyTarget.id } : {}) },
        [`${ownPath}/name`]: selected.name,
        [`${ownPath}/photo`]: peerPic || selected.photo || null,
        [`${ownPath}/lastMessage`]: "🔒 Voice message",
        [`${ownPath}/timestamp`]: timestamp,
        [`${ownPath}/requestPending`]: policy.isRequest,
        [`${ownPath}/requestRejected`]: false,
        [`${peerPath}/name`]: user.displayName || "Pathargata user",
        [`${peerPath}/photo`]: user.photoURL || null,
        [`${peerPath}/lastMessage`]: "🔒 Voice message",
        [`${peerPath}/timestamp`]: timestamp,
        [`${peerPath}/unread`]: (Number(policy.peerChat.unread) || 0) + 1,
        [`${peerPath}/isRequest`]: policy.isRequest,
      });
      setDecryptedTexts((current) => ({ ...current, [`voice:${messageRef.key}`]: voiceDraftUri }));
      void push(ref(pathargataDb, `notifications/${selected.uid}`), { type: "chat", fromUid: user.uid, fromName: user.displayName || "একজন ব্যবহারকারী", timestamp, read: false }).catch(() => undefined);
      setVoiceDraftUri(""); setRecordingSeconds(0); setReplyTarget(null);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "CHAT_BLOCKED" ? "এই কথোপকথনে message পাঠানো যাচ্ছে না; block status পরীক্ষা করুন।" : code === "CHAT_REQUEST_NOT_ACCEPTED" ? "আগে message request গ্রহণ বা প্রত্যাখ্যান করুন।" : code === "CHAT_REQUEST_PENDING" ? "আপনার message request-এর উত্তরের অপেক্ষায় থাকুন।" : code === "CHAT_POLICY_UNAVAILABLE" ? "Privacy তথ্য পাওয়া যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।" : code === "CHAT_IMAGE_SIZE_INVALID" ? "ভয়েস রেকর্ডিংটি ৮ MB-এর বেশি। ছোট করে আবার রেকর্ড করুন।" : "ভয়েস মেসেজ নিরাপদভাবে পাঠানো যায়নি। আবার চেষ্টা করুন।");
    } finally { setSending(false); }
  }

  async function forwardMessageTo(target: ChatPreview, item: ChatMessage, timestamp: number) {
    if (!user || !selected || item.unsent || attaching) return;
    setAttaching(true); setError("");
    try {
      const policy = await readPeerSendPolicy(target.uid);
      const conversation = chatId(user.uid, target.uid);
      const messageRef = push(ref(pathargataDb, `chats/${conversation}`));
      if (!messageRef.key) throw new Error("MESSAGE_KEY_UNAVAILABLE");
      const payload: Record<string, unknown> = { sender: user.uid, timestamp, status: "sent", forwardedFrom: item.sender, forwardedAt: timestamp, encryption: "nacl-box-v1" };
      if (item.encryptedText || item.text) {
        const plaintext = item.encryptedText ? (decryptedTexts[item.id] && !decryptedTexts[item.id].startsWith("এই মেসেজ") ? decryptedTexts[item.id] : await decryptChatText(item.encryptedText, user.uid)) : decode(item.text);
        payload.encryptedText = await encryptChatText(plaintext, user.uid, target.uid);
      }
      if (item.encryptedImage) payload.encryptedImage = await forwardEncryptedChatMedia(item.encryptedImage, user.uid, target.uid);
      if (item.encryptedVoice) payload.encryptedVoice = await forwardEncryptedChatMedia(item.encryptedVoice, user.uid, target.uid);
      if (!payload.encryptedText && !payload.encryptedImage && !payload.encryptedVoice) throw new Error("MESSAGE_NOT_FORWARDABLE");
      const ownPath = `user_chats/${user.uid}/${target.uid}`;
      const peerPath = `user_chats/${target.uid}/${user.uid}`;
      const preview = item.encryptedImage ? "🔒 Forwarded photo" : item.encryptedVoice ? "🔒 Forwarded voice" : "🔒 Forwarded message";
      await update(ref(pathargataDb), {
        [`chats/${conversation}/${messageRef.key}`]: payload,
        [`${ownPath}/name`]: target.name,
        [`${ownPath}/photo`]: target.photo || null,
        [`${ownPath}/lastMessage`]: `You: ${preview}`,
        [`${ownPath}/timestamp`]: timestamp,
        [`${ownPath}/requestPending`]: policy.isRequest,
        [`${ownPath}/requestRejected`]: false,
        [`${peerPath}/name`]: user.displayName || "Pathargata user",
        [`${peerPath}/photo`]: user.photoURL || null,
        [`${peerPath}/lastMessage`]: preview,
        [`${peerPath}/timestamp`]: timestamp,
        [`${peerPath}/unread`]: (Number(policy.peerChat.unread) || 0) + 1,
        [`${peerPath}/isRequest`]: policy.isRequest,
      });
      if (payload.encryptedText && item.encryptedText) setDecryptedTexts((current) => ({ ...current, [messageRef.key!]: decryptedTexts[item.id] || "Forwarded message" }));
      void push(ref(pathargataDb, `notifications/${target.uid}`), { type: "chat", fromUid: user.uid, fromName: user.displayName || "একজন ব্যবহারকারী", timestamp, read: false }).catch(() => undefined);
      setForwardingMessage(null); setForwardSearch(""); setError("মেসেজ ফরওয়ার্ড করা হয়েছে।");
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      setError(code === "CHAT_BLOCKED" ? "এই ব্যবহারকারীকে message পাঠানো যাচ্ছে না।" : code === "CHAT_REQUEST_NOT_ACCEPTED" ? "এই কথোপকথনের request আগে গ্রহণ করুন।" : code === "CHAT_REQUEST_PENDING" ? "আপনার message request-এর উত্তরের অপেক্ষায় থাকুন।" : "মেসেজটি নিরাপদভাবে forward করা যায়নি।");
    } finally { setAttaching(false); }
  }

  function jumpToMessage(id: string) {
    const index = messages.findIndex((message) => message.id === id);
    if (index < 0) { setError("উল্লেখ করা আগের মেসেজটি এখন লোড করা নেই।"); return; }
    messageListRef.current?.scrollToIndex({ index, animated: true });
  }

  async function sendMessage() {
    if (!flags.messaging || emergency.readOnly) { setError(emergency.readOnly ? "জরুরি read-only mode চালু আছে। Message পাঠানো যাচ্ছে না।" : "Messaging আপাতত বন্ধ আছে।"); return; }
    if (!user || !selected || !draft.trim()) return;
    const text = draft.trim(); const timestamp = Date.now(); setSending(true); setError("");
    try {
      // Rules intentionally keep chat_members server-provisioned. Re-check the
      // callable here so a first message cannot race the membership effect.
      await ensureChatMembership({ peerUid: selected.uid });
      setMembershipState("ready");
      const currentChatPath = `user_chats/${user.uid}/${selected.uid}`;
      const [ownBlock, peerBlock, recipientProfile, friendship, currentChat] = await Promise.all([
        get(ref(pathargataDb, `user_blocks/${user.uid}/${selected.uid}`)),
        get(ref(pathargataDb, `user_blocks/${selected.uid}/${user.uid}`)),
        getFreshWithCache(ref(pathargataDb, `users/${selected.uid}/settings/messagePrivacy`), 5 * 60_000),
        getFreshWithCache(ref(pathargataDb, `users/${selected.uid}/friends/${user.uid}`), 60_000),
        get(ref(pathargataDb, currentChatPath)),
      ]);
      if (ownBlock.val() || peerBlock.val()) { setError("এই কথোপকথনে message পাঠানো যাচ্ছে না। Block status পরীক্ষা করুন।"); return; }
      if ((recipientProfile.error && recipientProfile.value == null) || (friendship.error && friendship.value == null)) throw new Error("CHAT_POLICY_UNAVAILABLE");
      const chatMeta = currentChat.val() || {};
      if (chatMeta.isRequest) { setError("আগে message request গ্রহণ বা প্রত্যাখ্যান করুন।"); return; }
      if (chatMeta.requestPending || chatMeta.requestRejected) { setError(chatMeta.requestRejected ? "আপনার message request গ্রহণ করা হয়নি।" : "আপনার message request-এর উত্তরের অপেক্ষায় থাকুন।"); return; }
      const privacy = recipientProfile.value;
      const isRequest = !currentChat.exists() && (privacy === "requests" || (privacy === "friends" && friendship.value == null));
      const encryptedText = await encryptChatText(text, user.uid, selected.uid);
      const conversation = chatId(user.uid, selected.uid);
      const messageRef = push(ref(pathargataDb, `chats/${conversation}`));
      const preview = "🔒 Encrypted message";
      const peerChatPath = `user_chats/${selected.uid}/${user.uid}`;
      const peerChatSnapshot = await get(ref(pathargataDb, peerChatPath));
      const peerMeta = peerChatSnapshot.val() || {};
      const updates: Record<string, unknown> = {
        [`chats/${conversation}/${messageRef.key}`]: { sender: user.uid, timestamp, status: "sent", encryptedText, encryption: "nacl-box-v1", ...(replyTarget ? { replyTo: replyTarget.id } : {}) },
        [`${currentChatPath}/name`]: selected.name,
        [`${currentChatPath}/photo`]: peerPic || selected.photo || null,
        [`${currentChatPath}/lastMessage`]: `You: ${preview}`,
        [`${currentChatPath}/timestamp`]: timestamp,
        [`${currentChatPath}/requestPending`]: isRequest,
        [`${currentChatPath}/requestRejected`]: false,
        [`${peerChatPath}/name`]: user.displayName || "Pathargata user",
        [`${peerChatPath}/photo`]: user.photoURL || null,
        [`${peerChatPath}/lastMessage`]: preview,
        [`${peerChatPath}/timestamp`]: timestamp,
        [`${peerChatPath}/unread`]: (Number(peerMeta.unread) || 0) + 1,
        [`${peerChatPath}/isRequest`]: isRequest,
      };
      await update(ref(pathargataDb), updates);
      void push(ref(pathargataDb, `notifications/${selected.uid}`), { type: "chat", fromUid: user.uid, fromName: user.displayName || "একজন ব্যবহারকারী", timestamp, read: false }).catch(() => undefined);
      if (messageRef.key) setDecryptedTexts((current) => ({ ...current, [messageRef.key!]: text }));
      await AsyncStorage.removeItem(`pathargata-chat-draft:${user.uid}:${conversation}`).catch(() => undefined);
      setDraft(""); setReplyTarget(null); await set(ref(pathargataDb, `chats_typing/${selected.uid}/${user.uid}`), false).catch(() => undefined);
    } catch (error) {
      playAppSound("error");
      const detail = error instanceof Error ? error.message : "";
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
      if (code.includes("functions/unavailable") || code.includes("functions/not-found") || code.includes("functions/internal")) {
        setMembershipState("error");
      }
      setError(detail === "CHAT_PEER_KEY_MISSING"
        ? "এই ব্যক্তি এখনো E2E key তৈরি করেননি। তাকে আপডেট করা অ্যাপ একবার খুলতে বলুন, তারপর আবার পাঠান।"
        : detail === "CHAT_SECURE_STORAGE_UNAVAILABLE"
          ? "এই ডিভাইসে secure key storage নেই।"
          : detail === "CHAT_POLICY_UNAVAILABLE"
            ? "Privacy তথ্য পাওয়া যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
            : code.includes("functions/not-found") || code.includes("functions/unavailable") || code.includes("functions/internal")
              ? "নতুন conversation-এর নিরাপদ membership server-এ প্রস্তুত হয়নি। Firebase Functions deploy না হওয়া পর্যন্ত এই নতুন chat শুরু করা যাবে না।"
              : code.includes("functions/permission-denied") || detail.toLowerCase().includes("permission")
                ? "এই conversation-এর নিরাপদ membership অনুমোদিত নয় বা block করা আছে।"
                : "মেসেজ পাঠানো যায়নি। খসড়াটি সংরক্ষিত আছে—আবার চেষ্টা করুন।");
    }
    finally { setSending(false); }
  }

  async function respondToMessageRequest(item: ChatPreview, accept: boolean) {
    if (!user) return;
    const updates: Record<string, unknown> = {
      [`user_chats/${user.uid}/${item.uid}/isRequest`]: false,
      [`user_chats/${user.uid}/${item.uid}/requestAccepted`]: accept,
      [`user_chats/${item.uid}/${user.uid}/requestPending`]: false,
      [`user_chats/${item.uid}/${user.uid}/requestRejected`]: !accept,
      [`user_chats/${item.uid}/${user.uid}/requestAccepted`]: accept,
    };
    if (!accept) {
      updates[`user_chats/${user.uid}/${item.uid}/archived`] = true;
    }
    try {
      await update(ref(pathargataDb), updates);
      setSelected((current) => current?.uid === item.uid ? { ...current, isRequest: false, requestAccepted: accept } : current);
      if (!accept && selected?.uid === item.uid) setSelected(null);
    } catch {
      setError("Message request আপডেট হয়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।");
    }
  }
  async function pickImage() {
    if (!flags.messaging || emergency.readOnly) { setError(emergency.readOnly ? "জরুরি read-only mode চালু আছে। Media পাঠানো যাচ্ছে না।" : "Messaging আপাতত বন্ধ আছে।"); return; }
    if (!user || !selected || selected.isRequest || selected.requestPending || attaching) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("ছবি পাঠাতে photo library permission দিন।"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.78 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAttaching(true); setError("");
    try {
      const [ownBlock, peerBlock, peerProfile, friendship, ownChatSnapshot, peerChatSnapshot] = await Promise.all([
        get(ref(pathargataDb, `user_blocks/${user.uid}/${selected.uid}`)),
        get(ref(pathargataDb, `user_blocks/${selected.uid}/${user.uid}`)),
        getFreshWithCache(ref(pathargataDb, `users/${selected.uid}/settings/messagePrivacy`), 5 * 60_000),
        getFreshWithCache(ref(pathargataDb, `users/${selected.uid}/friends/${user.uid}`), 60_000),
        get(ref(pathargataDb, `user_chats/${user.uid}/${selected.uid}`)),
        get(ref(pathargataDb, `user_chats/${selected.uid}/${user.uid}`)),
      ]);
      if (ownBlock.val() || peerBlock.val()) throw new Error("CHAT_BLOCKED");
      if ((peerProfile.error && peerProfile.value == null) || (friendship.error && friendship.value == null)) throw new Error("CHAT_POLICY_UNAVAILABLE");
      const ownChat = ownChatSnapshot.val() || {};
      if (ownChat.isRequest) throw new Error("CHAT_REQUEST_NOT_ACCEPTED");
      if (ownChat.requestPending || ownChat.requestRejected) throw new Error("CHAT_REQUEST_PENDING");
      const privacy = peerProfile.value;
      const isRequest = !ownChatSnapshot.exists() && (privacy === "requests" || (privacy === "friends" && friendship.value == null));
      const contentType = asset.mimeType || "image/jpeg";
      const encryptedImage = await encryptAndUploadChatImage(asset.uri, contentType, user.uid, selected.uid);
      const timestamp = Date.now();
      const conversation = chatId(user.uid, selected.uid);
      const messageRef = push(ref(pathargataDb, `chats/${conversation}`));
      if (!messageRef.key) throw new Error("MESSAGE_KEY_UNAVAILABLE");
      await update(ref(pathargataDb), {
        [`chats/${conversation}/${messageRef.key}`]: { sender: user.uid, timestamp, status: "sent", encryptedImage, encryption: "nacl-box-v1", ...(replyTarget ? { replyTo: replyTarget.id } : {}) },
        [`user_chats/${user.uid}/${selected.uid}/name`]: selected.name,
        [`user_chats/${user.uid}/${selected.uid}/photo`]: peerPic || selected.photo || null,
        [`user_chats/${user.uid}/${selected.uid}/lastMessage`]: "🔒 Encrypted photo",
        [`user_chats/${user.uid}/${selected.uid}/timestamp`]: timestamp,
        [`user_chats/${user.uid}/${selected.uid}/requestPending`]: isRequest,
        [`user_chats/${selected.uid}/${user.uid}/name`]: user.displayName || "Pathargata user",
        [`user_chats/${selected.uid}/${user.uid}/photo`]: user.photoURL || null,
        [`user_chats/${selected.uid}/${user.uid}/lastMessage`]: "🔒 Encrypted photo",
        [`user_chats/${selected.uid}/${user.uid}/timestamp`]: timestamp,
        [`user_chats/${selected.uid}/${user.uid}/unread`]: (Number(peerChatSnapshot.val()?.unread) || 0) + 1,
        [`user_chats/${selected.uid}/${user.uid}/isRequest`]: isRequest,
      });
      setDecryptedTexts((current) => ({ ...current, [`image:${messageRef.key}`]: asset.uri }));
      setReplyTarget(null);
      void push(ref(pathargataDb, `notifications/${selected.uid}`), { type: "chat", fromUid: user.uid, fromName: user.displayName || "একজন ব্যবহারকারী", timestamp, read: false }).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "CHAT_IMAGE_SIZE_INVALID" ? "ছবিটি ৮ MB-এর বেশি। ছোট ছবি বেছে আবার চেষ্টা করুন।" : cause instanceof Error && cause.message === "CHAT_BLOCKED" ? "এই কথোপকথনে message পাঠানো যাচ্ছে না। Block status পরীক্ষা করুন।" : cause instanceof Error && cause.message === "CHAT_REQUEST_PENDING" ? "আপনার message request-এর উত্তরের অপেক্ষায় থাকুন।" : cause instanceof Error && cause.message === "CHAT_REQUEST_NOT_ACCEPTED" ? "আগে message request গ্রহণ বা প্রত্যাখ্যান করুন।" : cause instanceof Error && cause.message === "CHAT_POLICY_UNAVAILABLE" ? "Privacy তথ্য পাওয়া যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।" : "ছবি নিরাপদভাবে পাঠানো যায়নি। আবার চেষ্টা করুন.");
    } finally { setAttaching(false); }
  }

  function showMessageActions(item: ChatMessage) {
    if (!user || !selected) return;
    const path = `chats/${chatId(user.uid, selected.uid)}/${item.id}`;
    Alert.alert("মেসেজ অপশন", "করণীয় বাছুন", [
      { text: "উত্তর দিন", onPress: () => setReplyTarget(item) },
      ...(!item.unsent ? [{ text: "Forward করুন…", onPress: () => { setForwardSearch(""); setForwardingMessage(item); } }] : []),
      ...(item.sender === user.uid && !item.unsent ? [{ text: "সবার কাছ থেকে Unsend", style: "destructive" as const, onPress: () => Alert.alert("মেসেজ unsend করবেন?", "দুই পক্ষের chat-এ মেসেজটি unsent হিসেবে দেখাবে।", [{ text: "বাতিল", style: "cancel" }, { text: "Unsend", style: "destructive", onPress: () => void update(ref(pathargataDb, path), { text: null, encryptedText: null, encryptedImage: null, encryptedVoice: null, image: null, voice: null, unsent: true, unsentAt: Date.now() }).catch((error) => setError(`মেসেজ ফেরত নেওয়া যায়নি: ${String(error)}`)) }]) }] : []),
      { text: "শুধু আমার chat থেকে সরান", style: "destructive", onPress: () => { const next = [...new Set([...hiddenMessageIds, item.id])]; setHiddenMessageIds(next); set(ref(pathargataDb, `users/${user.uid}/hidden_messages/${chatId(user.uid, selected.uid)}/${item.id}`), true).catch((error) => setError(`মেসেজটি সরানো যায়নি: ${String(error)}`)); setMessages((current) => current.filter((message) => message.id !== item.id)); } },
      ...(decryptedTexts[item.id] ? [{ text: "লেখা কপি করুন", onPress: () => void Clipboard.setStringAsync(decryptedTexts[item.id]).then(() => setError("মেসেজের লেখা কপি হয়েছে।")) }] : []),
      { text: "মেসেজ রিপোর্ট করুন", style: "destructive", onPress: () => Alert.alert("মেসেজ রিপোর্ট", "এই মেসেজটি moderation team-কে রিপোর্ট করবেন?", [{ text: "বাতিল", style: "cancel" }, { text: "রিপোর্ট", style: "destructive", onPress: () => void set(ref(pathargataDb, `message_reports/${chatId(user.uid, selected.uid)}/${item.id}/${user.uid}`), { reason: "user_report", timestamp: Date.now() }).then(() => setError("রিপোর্ট জমা হয়েছে।")).catch((error) => setError(`রিপোর্ট করা যায়নি: ${String(error)}`)) }]) },
      { text: "বন্ধ", style: "cancel" },
    ]);
  }

  async function showChatActions(item: ChatPreview) {
    if (!user) return;
    try {
      const [ownBlock, peerBlock] = await Promise.all([get(ref(pathargataDb, `user_blocks/${user.uid}/${item.uid}`)), get(ref(pathargataDb, `user_blocks/${item.uid}/${user.uid}`))]);
      setChatAction({ item, blockedByMe: Boolean(ownBlock.val()), blockedByPeer: Boolean(peerBlock.val()) });
    } catch { setError("Block status পাওয়া যায়নি। আবার চেষ্টা করুন।"); }
  }

  function renderChatActionsSheet() { if (!chatAction || !user) return null; const close = () => setChatAction(null); const { item, blockedByMe, blockedByPeer } = chatAction; const archive = () => { close(); void set(ref(pathargataDb, `user_chats/${user.uid}/${item.uid}/archived`), !item.archived); }; const removeChat = () => { close(); void remove(ref(pathargataDb, `user_chats/${user.uid}/${item.uid}`)); }; const toggleBlock = () => { close(); if (blockedByPeer) return setError("অপর পক্ষ আপনাকে block করেছেন।"); const path = `user_blocks/${user.uid}/${item.uid}`; void (blockedByMe ? remove(ref(pathargataDb, path)) : set(ref(pathargataDb, path), true)); }; return <Modal visible transparent animationType="slide" onRequestClose={close}><View className="flex-1 justify-end bg-black/50"><TouchableOpacity className="flex-1" onPress={close} /><View className="rounded-t-[30px] bg-background px-5 pb-8 pt-3"><View className="mb-4 items-center"><View className="h-1 w-12 rounded-full bg-border" /></View><Text className="mb-4 text-xl font-extrabold text-foreground">{safeChatName(item.name)}</Text>{item.isRequest ? <ActionRow icon="checkmark-circle-outline" title="Message request গ্রহণ করুন" onPress={() => { close(); void respondToMessageRequest(item, true); }} /> : null}<ActionRow icon="archive-outline" title={item.archived ? "Archive থেকে ফিরিয়ে আনুন" : "Archive করুন"} onPress={archive} /><ActionRow icon="trash-outline" title="শুধু আমার তালিকা থেকে সরান" danger onPress={removeChat} /><ActionRow icon={blockedByMe ? "lock-open-outline" : "ban-outline"} title={blockedByMe ? "Unblock করুন" : blockedByPeer ? "এই ব্যবহারকারী আপনাকে block করেছেন" : "Block করুন"} danger={!blockedByPeer} onPress={toggleBlock} /><TouchableOpacity onPress={close} className="mt-2 items-center rounded-2xl bg-surface py-3.5"><Text className="font-extrabold text-muted">বাতিল</Text></TouchableOpacity></View></View></Modal>; }

  if (!user) return <ScreenContainer className="bg-background p-5"><View className="flex-1 items-center justify-center"><View className="h-20 w-20 rounded-full bg-surface items-center justify-center mb-4"><Ionicons name="chatbubbles-outline" size={38} color="#15803D" /></View><Text className="text-lg font-bold text-foreground">মেসেজ করতে লগইন করুন</Text><Text className="text-sm text-muted text-center mt-2">আপনার community conversations দেখতে account-এ প্রবেশ করুন।</Text><TouchableOpacity className="rounded-full bg-primary px-5 py-3 mt-5" onPress={() => router.push("../auth")}><Text className="font-bold text-white">লগইন করুন</Text></TouchableOpacity></View></ScreenContainer>;

  if (selected) return <ScreenContainer className="bg-background"><KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
    <View className="px-5 pt-3 pb-4 flex-row items-center border-b border-border"><TouchableOpacity accessibilityLabel="ইনবক্সে ফিরুন" className="h-10 w-10 rounded-full bg-surface items-center justify-center" onPress={() => { setDraft(""); setSelected(null); }}><Ionicons name="arrow-back" size={21} color="#94A3B8" /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${safeChatName(selected.name)}-এর প্রোফাইল খুলুন`} onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: selected.uid } })} className="ml-3 flex-row items-center"><View className="relative h-10 w-10 items-center justify-center overflow-visible rounded-[15px] bg-surface">{peerPic || selected.photo ? <Image source={{ uri: peerPic || selected.photo }} className="h-full w-full rounded-[15px]"/> : <Text className="font-bold text-primary">{safeChatName(selected.name).slice(0, 1)}</Text>}{peerOnline ? <View className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-[#22A06B]"/> : null}</View><View className="ml-3"><Text className="text-lg font-bold text-foreground">{safeChatName(selected.name)}</Text><Text className={`text-xs mt-0.5 ${typing ? "text-primary font-bold" : "text-muted"}`}>{typing ? "লিখছেন..." : peerOnline ? "সক্রিয় · 🔒 E2E encrypted" : peerLastSeen ? `শেষ সক্রিয় ${timeLabel(peerLastSeen)}` : "🔒 E2E encrypted"}</Text></View></TouchableOpacity><TouchableOpacity accessibilityLabel="কথোপকথনের অপশন" onPress={() => showChatActions(selected)} className="ml-auto h-10 w-10 items-center justify-center rounded-2xl bg-surface"><Ionicons name="ellipsis-vertical" size={19} color="#516158"/></TouchableOpacity></View>
    {selected.isRequest ? <View className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3"><Text className="text-sm font-bold text-amber-900">নতুন message request</Text><Text className="mt-1 text-xs leading-5 text-amber-800">গ্রহণ না করা পর্যন্ত এই ব্যক্তি আর message পাঠাতে পারবেন না। গ্রহণ করলে কথোপকথন আপনার inbox-এ থাকবে।</Text><View className="mt-3 flex-row gap-2"><TouchableOpacity accessibilityRole="button" onPress={() => void respondToMessageRequest(selected, false)} className="flex-1 items-center rounded-xl border border-amber-300 bg-surface py-2.5"><Text className="text-xs font-bold text-amber-900">প্রত্যাখ্যান</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => void respondToMessageRequest(selected, true)} className="flex-1 items-center rounded-xl bg-primary py-2.5"><Text className="text-xs font-bold text-white">গ্রহণ করুন</Text></TouchableOpacity></View></View> : selected.requestPending ? <View className="mx-4 mt-3 rounded-2xl bg-surface p-3"><Text className="text-center text-xs font-semibold text-muted">আপনার message request পাঠানো হয়েছে। উত্তরের অপেক্ষায় থাকুন।</Text></View> : null}
    {membershipState === "loading" ? <View className="mx-4 mt-2 flex-row items-center rounded-xl bg-emerald-50 px-3 py-2"><ActivityIndicator size="small" color="#15803D" /><Text className="ml-2 flex-1 text-xs text-emerald-800">নিরাপদ conversation প্রস্তুত হচ্ছে…</Text></View> : null}
    {conversationError ? <View className="mx-4 mt-2 flex-row items-center justify-between rounded-xl bg-red-50 px-3 py-2"><Text className="mr-2 flex-1 text-xs text-red-800">{conversationError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => { setMembershipRetry((value) => value + 1); setConversationRetry((value) => value + 1); }}><Text className="text-xs font-bold text-red-800">আবার চেষ্টা</Text></TouchableOpacity></View> : null}
    <FlatList ref={messageListRef} data={messages} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={MESSAGE_VIEWABILITY_CONFIG} contentContainerStyle={{ padding: 16, paddingBottom: 24, flexGrow: 1 }} onScrollToIndexFailed={({ index, averageItemLength }) => setTimeout(() => messageListRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true }), 120)} ListEmptyComponent={<View className="items-center pt-20"><Text className="text-sm text-muted">কথোপকথন শুরু করুন</Text></View>} renderItem={({ item }) => { const mine = item.sender === user.uid; const repliedTo = item.replyTo ? messageById.get(item.replyTo) : undefined; const replyPreview = repliedTo ? repliedTo.encryptedImage ? "ছবি" : repliedTo.encryptedVoice || repliedTo.voice ? "ভয়েস মেসেজ" : decryptedTexts[repliedTo.id] || (repliedTo.text ? decode(repliedTo.text) : "মেসেজ…") : "মূল মেসেজটি লোড করা নেই"; const voiceUri = item.encryptedVoice ? decryptedTexts[`voice:${item.id}`] : item.voice; return <TouchableOpacity activeOpacity={1} onLongPress={() => showMessageActions(item)}><View className={`max-w-[82%] rounded-3xl px-3 py-3 mb-2 ${mine ? "bg-primary self-end rounded-br-md" : "bg-surface self-start rounded-bl-md border border-border"}`}>{item.replyTo ? <TouchableOpacity accessibilityRole="button" onPress={() => repliedTo && jumpToMessage(repliedTo.id)} className={`mb-2 rounded-xl border-l-2 px-2 py-1 ${mine ? "border-green-200 bg-green-800/30" : "border-primary bg-background"}`}><Text className={`text-[10px] font-bold ${mine ? "text-green-100" : "text-primary"}`}>উত্তরে</Text><Text numberOfLines={1} className={`text-xs ${mine ? "text-white" : "text-foreground"}`}>{replyPreview}</Text></TouchableOpacity> : null}{item.unsent ? <Text className={`text-xs italic ${mine ? "text-green-100" : "text-muted"}`}>এই মেসেজটি unsend করা হয়েছে</Text> : <>{item.encryptedImage ? (decryptedTexts[`image:${item.id}`] && decryptedTexts[`image:${item.id}`] !== "__decrypt_failed__" ? <Image source={{ uri: decryptedTexts[`image:${item.id}`] }} accessibilityLabel="End-to-end encrypted photo" className="w-60 h-52 rounded-2xl mb-2 bg-slate-900" resizeMode="contain" /> : <Text className={`mb-2 text-xs ${mine ? "text-green-100" : "text-muted"}`}>{decryptedTexts[`image:${item.id}`] === "__decrypt_failed__" ? "ছবি decrypt করা যায়নি" : "ছবি নিরাপদভাবে decrypt হচ্ছে…"}</Text>) : item.image ? <Image source={{ uri: item.image }} className="w-60 h-52 rounded-2xl mb-2 bg-slate-900" resizeMode="contain" /> : null}{item.encryptedVoice ? voiceUri && voiceUri !== "__decrypt_failed__" ? <VoiceMessageBubble uri={voiceUri} mine={mine} /> : <Text className={`mb-2 text-xs ${mine ? "text-green-100" : "text-muted"}`}>{voiceUri === "__decrypt_failed__" ? "ভয়েস decrypt করা যায়নি" : "ভয়েস নিরাপদভাবে decrypt হচ্ছে…"}</Text> : item.voice ? <VoiceMessageBubble uri={item.voice} mine={mine} /> : null}{item.text || item.encryptedText ? <Text className={mine ? "text-sm leading-5 text-white" : "text-sm leading-5 text-foreground"}>{decryptedTexts[item.id] || (item.text ? decode(item.text) : "Decrypt হচ্ছে…")}</Text> : null}</>}<View className="flex-row items-center justify-end gap-1 mt-1"><Text className={`text-[12px] ${mine ? "text-green-100" : "text-muted"}`}>{timeLabel(item.timestamp)}</Text>{mine ? <><Ionicons accessibilityLabel={item.status === "seen" ? "দেখা হয়েছে" : "পাঠানো হয়েছে"} name={item.status === "seen" ? "checkmark-done" : "checkmark"} size={14} color={item.status === "seen" ? "#BBF7D0" : "#DCFCE7"} /><Text className="text-[10px] text-green-100">{item.status === "seen" ? "দেখা" : "পাঠানো"}</Text></> : null}</View></View></TouchableOpacity>; }} />
    <View className="border-t border-border p-3 bg-background">{!flags.messaging || emergency.readOnly ? <View className="rounded-2xl bg-amber-50 px-3 py-3"><Text className="text-center text-xs font-bold text-amber-800">{emergency.readOnly ? "জরুরি read-only mode চালু আছে।" : "Messaging আপাতত বন্ধ আছে।"}</Text></View> : null}{replyTarget ? <TouchableOpacity onPress={() => setReplyTarget(null)} className="mb-2 rounded-xl bg-green-50 p-2"><Text className="text-xs text-primary">Reply করছেন: {decryptedTexts[replyTarget.id] || (replyTarget.encryptedImage ? "ছবি" : replyTarget.encryptedVoice || replyTarget.voice ? "ভয়েস মেসেজ" : replyTarget.text ? decode(replyTarget.text) : "Encrypted message")} · বাতিল</Text></TouchableOpacity> : null}{voiceDraftUri ? <View className="mb-2 flex-row items-center justify-between rounded-2xl bg-green-50 p-2"><VoiceMessageBubble uri={voiceDraftUri} mine={false} /><Text className="mx-2 text-xs font-semibold text-foreground">{recordingSeconds} সেকেন্ড</Text><TouchableOpacity accessibilityLabel="ভয়েস রেকর্ডিং বাতিল" onPress={() => { setVoiceDraftUri(""); setRecordingSeconds(0); }}><Ionicons name="close-circle-outline" size={22} color="#B91C1C" /></TouchableOpacity><TouchableOpacity accessibilityLabel="ভয়েস মেসেজ পাঠান" disabled={sending || membershipState !== "ready"} onPress={() => void sendVoiceMessage()} className="ml-2 rounded-xl bg-primary px-3 py-2">{sending ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="send" size={17} color="white" />}</TouchableOpacity></View> : null}{recording ? <View accessibilityRole="alert" className="mb-2 flex-row items-center justify-between rounded-xl bg-red-50 px-3 py-2"><Text className="text-xs font-bold text-red-700">রেকর্ড হচ্ছে · {recordingSeconds} সেকেন্ড</Text><TouchableOpacity accessibilityRole="button" onPress={() => void toggleVoiceRecording()}><Text className="text-xs font-bold text-red-700">থামান</Text></TouchableOpacity></View> : null}{keyError ? <Text className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-[12px] text-amber-800">{keyError}</Text> : null}{error ? <View accessibilityRole="alert" className="mb-2 flex-row items-center justify-between rounded-xl bg-red-50 px-3 py-2"><Text className="mr-2 flex-1 text-xs text-red-800">{error}</Text>{draft.trim() && !selected.isRequest && !selected.requestPending ? <TouchableOpacity accessibilityRole="button" onPress={() => void sendMessage()} disabled={sending || membershipState !== "ready"}><Text className="text-xs font-bold text-red-800">আবার পাঠান</Text></TouchableOpacity> : error.includes("ছবি") ? <TouchableOpacity accessibilityRole="button" onPress={() => void pickImage()} disabled={attaching}><Text className="text-xs font-bold text-red-800">ছবি আবার বাছুন</Text></TouchableOpacity> : null}</View> : null}<View className="mb-2 flex-row items-center justify-between"><Text className="text-[10px] text-muted">🔒 End-to-end encrypted · খসড়া এই ডিভাইসে সংরক্ষিত</Text></View><View className="flex-row items-end gap-2"><TouchableOpacity accessibilityRole="button" accessibilityLabel={recording ? "রেকর্ডিং থামান" : "ভয়েস মেসেজ রেকর্ড করুন"} disabled={selected.isRequest || selected.requestPending || sending || attaching || Boolean(voiceDraftUri) || membershipState !== "ready"} className={`h-11 w-11 rounded-full items-center justify-center border ${recording ? "border-red-300 bg-red-50" : "border-border bg-surface"}`} onPress={() => void toggleVoiceRecording()}><Ionicons name={recording ? "stop" : "mic-outline"} size={20} color={recording ? "#B91C1C" : "#15803D"} /></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="End-to-end encrypted photo attach" disabled={attaching || selected.isRequest || selected.requestPending || membershipState !== "ready"} className="h-11 w-11 rounded-full bg-surface border border-border items-center justify-center" onPress={() => void pickImage()}>{attaching ? <ActivityIndicator size="small" color="#15803D" /> : <Ionicons name="image-outline" size={20} color="#15803D" />}</TouchableOpacity><TextInput value={draft} onChangeText={handleDraft} placeholder={selected.requestPending ? "Request-এর উত্তরের অপেক্ষায়" : selected.isRequest ? "Request গ্রহণ করার পর reply দিন" : membershipState === "loading" ? "নিরাপদ conversation প্রস্তুত হচ্ছে…" : "নিরাপদ message লিখুন…"} placeholderTextColor="#94A3B8" multiline editable={!selected.isRequest && !selected.requestPending && membershipState === "ready"} accessibilityLabel="Message লিখুন" className="flex-1 max-h-28 rounded-3xl bg-surface border border-border px-4 py-3 text-sm text-foreground" /><TouchableOpacity accessibilityRole="button" accessibilityLabel="Message পাঠান" className="h-11 w-11 rounded-full bg-primary items-center justify-center" onPress={() => void sendMessage()} disabled={sending || recording || Boolean(voiceDraftUri) || !keyReady || membershipState !== "ready" || selected.isRequest || selected.requestPending || !draft.trim()}>{sending ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="send" size={19} color="white" />}</TouchableOpacity></View></View>
  </KeyboardAvoidingView><Modal visible={Boolean(forwardingMessage)} transparent animationType="slide" onRequestClose={() => setForwardingMessage(null)}><View className="flex-1 justify-end bg-black/45"><View className="max-h-[78%] rounded-t-[28px] bg-background px-5 pb-7 pt-4"><View className="mb-4 flex-row items-center justify-between"><View><Text className="text-lg font-bold text-foreground">মেসেজ ফরওয়ার্ড</Text><Text className="mt-1 text-xs text-muted">যে কথোপকথনে পাঠাতে চান বাছুন</Text></View><TouchableOpacity accessibilityLabel="ফরওয়ার্ড বন্ধ করুন" onPress={() => setForwardingMessage(null)}><Ionicons name="close" size={23} color="#64748B" /></TouchableOpacity></View><View className="mb-3 flex-row items-center rounded-2xl border border-border bg-surface px-3 py-2"><Ionicons name="search-outline" size={18} color="#64748B" /><TextInput value={forwardSearch} onChangeText={setForwardSearch} placeholder="কথোপকথন খুঁজুন" placeholderTextColor="#94A3B8" className="ml-2 flex-1 text-sm text-foreground" /></View><FlatList data={chats.filter((chat) => chat.uid !== selected.uid && !chat.archived && safeChatName(chat.name).toLowerCase().includes(forwardSearch.trim().toLowerCase()))} keyExtractor={(item) => item.uid} ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">ফরওয়ার্ড করার মতো অন্য conversation পাওয়া যায়নি।</Text>} renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" disabled={attaching} onPress={() => { if (forwardingMessage) void forwardMessageTo(item, forwardingMessage, Date.now()); }} className="flex-row items-center border-b border-border py-3"><View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-surface"><Text className="font-bold text-primary">{safeChatName(item.name).slice(0, 1)}</Text></View><View className="flex-1"><Text className="font-semibold text-foreground">{safeChatName(item.name)}</Text><Text numberOfLines={1} className="text-xs text-muted">{item.lastMessage || "কথোপকথন"}</Text></View>{attaching ? <ActivityIndicator size="small" color="#15803D" /> : <Ionicons name="arrow-redo-outline" size={19} color="#15803D" />}</TouchableOpacity>} /></View></View></Modal>{renderChatActionsSheet()}</ScreenContainer>;

  return <ScreenContainer className="bg-background"><View className="px-5 pt-3 pb-4"><View className="flex-row items-center justify-between"><View><Text className="text-2xl font-bold text-foreground">মেসেজ</Text><Text className="text-sm text-muted mt-1">{unreadTotal ? `${unreadTotal}টি unread message` : "আপনার কথোপকথন"}</Text></View><View className="flex-row items-center gap-2"><TouchableOpacity accessibilityLabel="মেসেজ খুঁজুন" className="h-11 w-11 rounded-full bg-surface border border-border items-center justify-center" onPress={() => { setShowSearch((value) => !value); if (showSearch) setSearch(""); }}><Ionicons name="search-outline" size={20} color="#516158" /></TouchableOpacity><TouchableOpacity accessibilityLabel="মেসেজ সেটিংস" className="h-11 w-11 rounded-full bg-surface border border-border items-center justify-center" onPress={() => setShowMessageSettings(true)}><Ionicons name="settings-outline" size={20} color="#516158" /></TouchableOpacity><TouchableOpacity accessibilityLabel="নতুন message শুরু করুন" className="h-11 w-11 rounded-full bg-primary items-center justify-center" onPress={() => router.push("/people")}><Ionicons name="create-outline" size={21} color="white" /></TouchableOpacity></View></View><View className="mt-4 flex-row gap-2">{(["all", "unread", "requests"] as const).map((filter) => <TouchableOpacity key={filter} accessibilityRole="button" accessibilityState={{ selected: inboxFilter === filter }} onPress={() => setInboxFilter(filter)} className={`flex-1 items-center rounded-full px-3 py-2 ${inboxFilter === filter ? "bg-primary" : "bg-surface border border-border"}`}><Text className={`text-xs font-bold ${inboxFilter === filter ? "text-white" : "text-foreground"}`}>{filter === "all" ? "সব" : filter === "unread" ? "অপঠিত" : `Requests${chats.filter((item) => item.isRequest).length ? ` · ${chats.filter((item) => item.isRequest).length}` : ""}`}</Text></TouchableOpacity>)}</View><View className="mt-3 rounded-2xl bg-surface border border-border px-4 py-3 flex-row items-center">{showSearch ? <><Ionicons name="search-outline" size={20} color="#0A8065" /><TextInput autoFocus value={search} onChangeText={setSearch} placeholder="নাম দিয়ে chat খুঁজুন" placeholderTextColor="#94A3B8" accessibilityLabel="কথোপকথন খুঁজুন" className="ml-3 flex-1 text-sm text-foreground" /><TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={19} color="#94A3B8" /></TouchableOpacity></> : <Text className="text-xs text-muted">সার্চ আইকনে ট্যাপ করে কথোপকথন খুঁজুন</Text>}</View></View>{inboxError ? <View accessibilityRole="alert" className="mx-5 mb-2 flex-row items-center justify-between rounded-xl bg-red-50 px-3 py-2"><Text className="mr-2 flex-1 text-xs text-red-800">{inboxError}</Text><TouchableOpacity onPress={() => setInboxRetry((value) => value + 1)}><Text className="text-xs font-bold text-red-800">আবার চেষ্টা</Text></TouchableOpacity></View> : null}<FlatList data={filteredChats} keyExtractor={(item) => item.uid} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 }} ListEmptyComponent={<View className="flex-1 items-center pt-28"><View className="h-20 w-20 rounded-full bg-surface items-center justify-center mb-4"><Ionicons name={search ? "search-outline" : "chatbubbles-outline"} size={38} color="#15803D" /></View><Text className="text-lg font-bold text-foreground">{search ? "কোনো chat পাওয়া যায়নি" : inboxFilter === "requests" ? "কোনো message request নেই" : inboxFilter === "unread" ? "সব মেসেজ পড়া হয়েছে" : "এখনো কোনো মেসেজ নেই"}</Text><Text className="text-sm text-muted text-center mt-2">{search ? "অন্য নামে চেষ্টা করুন অথবা নতুন chat-এর জন্য People tab ব্যবহার করুন।" : "People tab থেকে পরিচিত মানুষকে খুঁজে message শুরু করুন।"}</Text></View>} renderItem={({ item }) => <ChatListRow item={item} onOpen={() => { setDraft(""); setSelected(item); }} onActions={() => showChatActions(item)} />} /><Modal visible={showMessageSettings} transparent animationType="slide" onRequestClose={() => setShowMessageSettings(false)}><View className="flex-1 justify-end bg-black/40"><View className="rounded-t-[28px] bg-background px-5 pb-8 pt-5"><View className="mb-4 flex-row items-center justify-between"><View><Text className="text-xl font-extrabold text-foreground">মেসেজ সেটিংস</Text><Text className="mt-1 text-xs text-muted">আপনার inbox ও privacy নিয়ন্ত্রণ করুন</Text></View><TouchableOpacity accessibilityLabel="সেটিংস বন্ধ করুন" onPress={() => setShowMessageSettings(false)} className="h-10 w-10 items-center justify-center rounded-full bg-surface"><Ionicons name="close" size={22} color="#64748B" /></TouchableOpacity></View><TouchableOpacity onPress={() => { setShowMessageSettings(false); router.push("/message-archive" as any); }} className="flex-row items-center border-b border-border py-4"><Ionicons name="archive-outline" size={21} color="#15803D" /><View className="ml-3 flex-1"><Text className="font-bold text-foreground">Archived conversations</Text><Text className="mt-1 text-xs text-muted">আর্কাইভ করা chat-এর আলাদা তালিকা দেখুন</Text></View><Ionicons name="chevron-forward" size={18} color="#94A3B8" /></TouchableOpacity><TouchableOpacity onPress={() => { setShowMessageSettings(false); void openBlockedUsers(); }} className="flex-row items-center border-b border-border py-4"><Ionicons name="ban-outline" size={21} color="#B91C1C" /><View className="ml-3 flex-1"><Text className="font-bold text-foreground">Blocked users</Text><Text className="mt-1 text-xs text-muted">Block তালিকা দেখুন বা unblock করুন</Text></View><Ionicons name="chevron-forward" size={18} color="#94A3B8" /></TouchableOpacity><View className="flex-row items-center py-4"><Ionicons name="checkmark-done-outline" size={21} color="#15803D" /><View className="ml-3 flex-1"><Text className="font-bold text-foreground">Read receipts</Text><Text className="mt-1 text-xs text-muted">মেসেজ পড়লে অপর পক্ষকে দেখান</Text></View><TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: readReceiptsEnabled }} onPress={() => void toggleReadReceipts()} className={`h-8 w-14 justify-center rounded-full px-1 ${readReceiptsEnabled ? "bg-primary" : "bg-slate-300"}`}><View className={`h-6 w-6 rounded-full bg-white ${readReceiptsEnabled ? "self-end" : "self-start"}`} /></TouchableOpacity></View><View className="border-t border-border pt-4"><Text className="font-bold text-foreground">কে আপনাকে প্রথমে message করতে পারবেন</Text><Text className="mt-1 text-xs text-muted">নতুন conversation-এর জন্য আপনার পছন্দ</Text><View className="mt-3 flex-row gap-2">{([ ["everyone", "সবাই"], ["requests", "Request"], ["friends", "বন্ধু"] ] as [MessagePrivacy, string][]).map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ selected: messagePrivacy === value }} onPress={() => void chooseMessagePrivacy(value)} className={`flex-1 items-center rounded-xl border px-2 py-2.5 ${messagePrivacy === value ? "border-primary bg-green-50" : "border-border bg-surface"}`}><Text className={`text-xs font-bold ${messagePrivacy === value ? "text-primary" : "text-muted"}`}>{label}</Text></TouchableOpacity>)}</View></View></View></View></Modal>{showBlockedUsers ? <Modal visible transparent animationType="slide" onRequestClose={() => setShowBlockedUsers(false)}><View className="flex-1 justify-end bg-black/40"><View className="max-h-[75%] rounded-t-[28px] bg-background px-5 pb-8 pt-5"><View className="mb-4 flex-row items-center justify-between"><Text className="text-xl font-extrabold text-foreground">Blocked users</Text><TouchableOpacity onPress={() => setShowBlockedUsers(false)}><Ionicons name="close" size={23} color="#64748B" /></TouchableOpacity></View><FlatList data={blockedPeers} keyExtractor={(item) => item.uid} ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted">আপনি কাউকে block করেননি।</Text>} renderItem={({ item }) => <View className="flex-row items-center border-b border-border py-3"><Text className="flex-1 font-semibold text-foreground">{item.name}</Text><TouchableOpacity onPress={() => void unblockPeer(item)} className="rounded-xl bg-primary px-4 py-2"><Text className="font-bold text-white">Unblock</Text></TouchableOpacity></View>} /></View></View></Modal> : null}{renderChatActionsSheet()}</ScreenContainer>;
}
