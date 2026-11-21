import { getFreshWithCache, invalidateRtdbSnapshotCache, onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { endBefore, equalTo, get, limitToLast, orderByChild, query, ref, update } from "firebase/database";
import { signOut, updateProfile } from "firebase/auth";
import { router, useFocusEffect } from "expo-router";
import * as Linking from "expo-linking";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  InteractionManager,
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ProfilePostCard, type ProfilePostData } from "@/components/profile-post-card";
import { ProfessionVerificationBadge } from "@/components/profession-verification-badge";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { uploadUserMedia } from "@/lib/chat-media";
import { mediaUploadErrorMessage } from "@/lib/media-upload";
import { subscribeToTabReselect } from "@/lib/tab-reselect";
import { buildDigitalCardQrText, isDigitalCardVerified } from "@/lib/digital-card";
import { loadAdminDownloadLink } from "@/lib/app-download-link";
import { captureCardImage } from "@/lib/card-capture";
import { saveCardToGallery } from "@/lib/card-gallery";
import { getPublicProfile } from "@/lib/social";

type ProfileData = {
  name?: string;
  nickname?: string;
  email?: string;
  phone?: string;
  union?: string;
  village?: string;
  bio?: string;
  profession?: string;
  location?: string;
  facebook?: string;
  whatsapp?: string;
  website?: string;
  role?: string;
  isVerified?: boolean;
  verificationCategory?: string;
  profile_pic?: string;
  cover_pic?: string;
  joinDate?: string;
  profile_locked?: boolean;
  hide_phone?: boolean;
  privacy_hide_contact?: boolean;
  friends?: Record<string, boolean>;
  saved_posts?: Record<string, boolean>;
  saved?: Record<string, boolean>;
};
type Friend = {
  uid: string;
  name?: string;
  profile_pic?: string;
  profession?: string;
};
type ProfilePost = ProfilePostData;
const PROFILE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const PRESENCE_CACHE_MAX_AGE_MS = 30 * 1000;
const PROFILE_FIELDS = ["name", "nickname", "email", "phone", "union", "village", "bio", "profession", "location", "facebook", "whatsapp", "website", "role", "isVerified", "verificationCategory", "profile_pic", "cover_pic", "joinDate", "profile_locked", "hide_phone", "privacy_hide_contact"] as const;
const SAVED_POSTS_PAGE_SIZE = 50;
export default function ProfileScreen() {
  const user = pathargataAuth.currentUser;
  const [profile, setProfile] = useState<ProfileData>({});
  const [friends, setFriends] = useState<Friend[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [profession, setProfession] = useState("");
  const [location, setLocation] = useState("");
  const [village, setVillage] = useState("");
  const [bio, setBio] = useState("");
  const [facebook, setFacebook] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");
  const [profileLocked, setProfileLocked] = useState(false);
  const [hidePhone, setHidePhone] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [ownPosts, setOwnPosts] = useState<ProfilePost[]>([]);
  const [ownPostCursor, setOwnPostCursor] = useState<{ timestamp: number; id: string } | null>(null);
  const [ownPostsHasMore, setOwnPostsHasMore] = useState(true);
  const [ownPostsLoadingMore, setOwnPostsLoadingMore] = useState(false);
  const [savedPosts, setSavedPosts] = useState<ProfilePost[]>([]);
  const [savedPostSets, setSavedPostSets] = useState<{ primary: string[]; legacy: string[] }>({ primary: [], legacy: [] });
  const savedPostIds = useMemo(() => [...new Set([...savedPostSets.primary, ...savedPostSets.legacy])], [savedPostSets]);
  const [profileTab, setProfileTab] = useState<"posts" | "saved">("posts");
  const [visiblePostsCount, setVisiblePostsCount] = useState(5);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [cardActionMessage, setCardActionMessage] = useState("");
  const [cardDownloading, setCardDownloading] = useState(false);
  const [appDownloadLinkState, setAppDownloadLinkState] = useState<{ uid: string; url: string | null } | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [savedLoading, setSavedLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [postsError, setPostsError] = useState("");
  const [savedError, setSavedError] = useState("");
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const profileScrollRef = useRef<ScrollView | null>(null);
  const cardRef = useRef<View | null>(null);
  const appDownloadUrl = appDownloadLinkState && appDownloadLinkState.uid === user?.uid ? appDownloadLinkState.url : null;
  const referralUrl = `https://pathargata-digital-community-ltd.github.io/Pathargata/auth?ref=${encodeURIComponent(user?.uid || "")}`;
  const cardPayload = user
    ? buildDigitalCardQrText(
        {
          ...profile,
          uid: user.uid,
          name: profile.name || user.displayName || "পাথরঘাটা ডিজিটাল সদস্য",
          email: profile.email || user.email || undefined,
          phone: profile.phone || user.phoneNumber || undefined,
          profile_pic: profile.profile_pic || user.photoURL || undefined,
        },
        { referralUrl, appDownloadUrl: appDownloadUrl ?? undefined },
      )
    : "";
  useEffect(() => {
    let active = true;
    if (!user?.uid) return () => { active = false; };
    void loadAdminDownloadLink().then((url) => {
      if (active) setAppDownloadLinkState({ uid: user.uid, url });
    });
    return () => {
      active = false;
    };
  }, [user?.uid]);
  const loadOwnPostPage = useCallback(async (cursor: { timestamp: number; id: string } | null, replace: boolean) => {
    if (!user) return;
    const indexRef = ref(pathargataDb, `user_post_index/${user.uid}`);
    const indexQuery = cursor
      ? query(indexRef, orderByChild("timestamp"), endBefore(cursor.timestamp, cursor.id), limitToLast(13))
      : query(indexRef, orderByChild("timestamp"), limitToLast(13));
    const indexResult = await getFreshWithCache<Record<string, Record<string, unknown>>>(indexQuery, PROFILE_CACHE_MAX_AGE_MS);
    let indexed = Object.entries(indexResult.value || {})
      .map(([id, value]) => ({ id, timestamp: Number((value as Record<string, unknown>)?.timestamp || 0) }))
      .filter((entry) => entry.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
    if (indexed.length === 0 && !cursor) {
      const legacyResult = await getFreshWithCache<Record<string, unknown>>(query(ref(pathargataDb, "public_posts"), orderByChild("uid"), equalTo(user.uid), limitToLast(12)), PROFILE_CACHE_MAX_AGE_MS);
      indexed = Object.entries(legacyResult.value || {})
        .map(([id, value]) => ({ id, timestamp: Number((value as Record<string, unknown>)?.timestamp || 0) }))
        .filter((entry) => entry.timestamp > 0)
        .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
    }
    const hasMore = indexed.length > 12;
    const page = indexed.slice(0, 12);
    const posts = (await Promise.all(page.map(async ({ id }) => {
      const postResult = await getFreshWithCache<Record<string, unknown>>(ref(pathargataDb, `posts/${id}`), PROFILE_CACHE_MAX_AGE_MS);
      const value = postResult.value;
      return value ? ({ ...(value as Record<string, unknown>), id } as ProfilePost) : null;
    }))).filter(Boolean) as ProfilePost[];
    const nextCursor = page.length ? { timestamp: page[page.length - 1].timestamp, id: page[page.length - 1].id } : null;
    setPostCount((current) => replace ? posts.length : current + posts.length);
    setOwnPosts((current) => {
      const merged = replace ? posts : [...current, ...posts.filter((post) => !current.some((item) => item.id === post.id))];
      return merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    });
    setOwnPostCursor(nextCursor);
    setOwnPostsHasMore(hasMore);
  }, [user]);

  const loadMoreOwnPosts = useCallback(async () => {
    if (!ownPostCursor || !ownPostsHasMore || ownPostsLoadingMore) return;
    setOwnPostsLoadingMore(true);
    try {
      await loadOwnPostPage(ownPostCursor, false);
    } catch {
      setPostsError("আরও পোস্ট লোড করা যায়নি।");
    } finally {
      setOwnPostsLoadingMore(false);
    }
  }, [loadOwnPostPage, ownPostCursor, ownPostsHasMore, ownPostsLoadingMore]);
  useEffect(() => subscribeToTabReselect((tab) => {
    if (tab !== "profile") return;
    profileScrollRef.current?.scrollTo({ y: 0, animated: true });
    setVisiblePostsCount(5);
    setProfileReloadKey((value) => value + 1);
  }), []);
  useFocusEffect(
    useCallback(() => {
      const reloadCycle = profileReloadKey;
      if (!user || reloadCycle < 0) return;
      let active = true;
      setProfileLoading(true);
      setPostsLoading(true);
      setProfileError("");
      setPostsError("");
      setPostCount(0);
      setSavedPostSets({ primary: [], legacy: [] });
      void Promise.all(PROFILE_FIELDS.map(async (field) => {
        const snapshot = await get(ref(pathargataDb, `users/${user.uid}/${field}`));
        return [field, snapshot.val()] as const;
      })).then((entries) => {
        if (!active) return;
        const next = Object.fromEntries(entries) as ProfileData;
        setProfile((current) => ({ ...current, ...next }));
        setName(next.name || user.displayName || "");
        setNickname(next.nickname || "");
        setProfession(next.profession || "");
        setLocation(next.location || "");
        setVillage(next.village || "");
        setBio(next.bio || "");
        setFacebook(next.facebook || "");
        setWhatsapp(next.whatsapp || "");
        setWebsite(next.website || "");
        setProfileLocked(Boolean(next.profile_locked));
        setHidePhone(Boolean(next.hide_phone || next.privacy_hide_contact));
        setProfileLoading(false);
      }).catch(() => {
        if (!active) return;
        setProfileLoading(false);
        setProfileError("প্রোফাইল তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
      });
      const friendsUnsubscribe = onValue(
        ref(pathargataDb, `users/${user.uid}/friends`),
        (snapshot) => {
          if (!active) return;
          const friendMap = snapshot.val() || {};
          setProfile((current) => ({ ...current, friends: friendMap }));
          const friendIds = Object.entries(friendMap)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([friendUid]) => friendUid);
          setFriends([]);
          if (!friendIds.length) return;
          InteractionManager.runAfterInteractions(() => {
            void Promise.all(friendIds.slice(0, 6).map(async (uid) => {
              try {
                const friendValue = await getPublicProfile(uid);
                if (!friendValue) return null;
                const { uid: _profileUid, ...profileValue } = friendValue;
                return { uid, ...profileValue };
              } catch {
                return null;
              }
            })).then((friendProfiles) => {
              if (active) setFriends(friendProfiles.filter(Boolean) as Friend[]);
            });
          });
        },
      );
      const savedPostsUnsubscribe = onValue(
        query(ref(pathargataDb, `users/${user.uid}/saved_posts`), limitToLast(SAVED_POSTS_PAGE_SIZE)),
        (snapshot) => {
          if (!active) return;
          setSavedPostSets((current) => ({ ...current, primary: Object.keys(snapshot.val() || {}) }));
          setSavedLoaded(false);
        },
      );
      const legacySavedUnsubscribe = onValue(
        query(ref(pathargataDb, `users/${user.uid}/saved`), limitToLast(SAVED_POSTS_PAGE_SIZE)),
        (snapshot) => {
          if (!active) return;
          setSavedPostSets((current) => ({ ...current, legacy: Object.keys(snapshot.val() || {}) }));
          setSavedLoaded(false);
        },
      );
      setOwnPostCursor(null);
      setOwnPostsHasMore(true);
      void loadOwnPostPage(null, true)
        .then(() => { if (active) { setPostsLoading(false); setPostsError(""); } })
        .catch(() => { if (active) { setPostsLoading(false); setPostsError("আপনার পোস্টগুলো লোড করা যায়নি।"); } });
      const presenceUnsubscribe = onValue(
        ref(pathargataDb, `status/${user.uid}`),
        (snapshot) => setIsOnline(snapshot.val()?.state === "online"),
        undefined,
        { maxAgeMs: PRESENCE_CACHE_MAX_AGE_MS },
      );
      return () => {
        active = false;
        friendsUnsubscribe();
        savedPostsUnsubscribe();
        legacySavedUnsubscribe();
        presenceUnsubscribe();
      };
    }, [loadOwnPostPage, profileReloadKey, user]),
  );
  useEffect(() => {
    if (profileTab !== "saved" || !user || savedLoaded) return;
    let active = true;
    void (async () => {
      setSavedLoading(true);
      setSavedError("");
      try {
        const entries = await Promise.all(
          savedPostIds.slice(0, 50).map(async (id) => [id, (await get(ref(pathargataDb, `posts/${id}`))).val()] as const),
        );
        if (!active) return;
        setSavedPosts(
          entries
            .map(([id, value]) => (value ? { ...(value as Record<string, unknown>), id } as ProfilePost : null))
            .filter(Boolean) as ProfilePost[],
        );
        setSavedLoaded(true);
      } catch {
        if (active) setSavedError("সংরক্ষিত পোস্ট লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        if (active) setSavedLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profileTab, savedLoaded, savedPostIds, user]);
  async function chooseAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("ছবি বাছতে photo permission প্রয়োজন।");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri || !user) return;
    setUploading(true);
    setMessage("");
    try {
      const url = await uploadUserMedia(
        result.assets[0].uri,
        result.assets[0].mimeType || "image/jpeg",
        "jpg",
        "profile-media",
      );
      await update(ref(pathargataDb, `users/${user.uid}`), {
        profile_pic: url,
      });
      await updateProfile(user, { photoURL: url });
      setProfile((current) => ({ ...current, profile_pic: url }));
    } catch (error) {
      setMessage(mediaUploadErrorMessage(error, "প্রোফাইল ছবি আপলোড হয়নি।"));
    } finally {
      setUploading(false);
    }
  }
  async function chooseCover() {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setMessage("কভার ছবি বাছতে photo permission প্রয়োজন।"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 7], quality: 0.85 });
    if (result.canceled || !result.assets[0]?.uri) return;
    setCoverUploading(true); setMessage("");
    try {
      const url = await uploadUserMedia(result.assets[0].uri, result.assets[0].mimeType || "image/jpeg", "jpg", "profile-media");
      await update(ref(pathargataDb, `users/${user.uid}`), { cover_pic: url });
      setProfile((current) => ({ ...current, cover_pic: url }));
      setMessage("কভার ছবি আপডেট হয়েছে।");
    } catch (error) { setMessage(mediaUploadErrorMessage(error, "কভার ছবি আপলোড হয়নি।")); }
    finally { setCoverUploading(false); }
  }
  async function shareProfileCard() {
    if (!user) return;
    const nativeReferralUrl = Platform.OS === "web" ? null : Linking.createURL("/auth", { queryParams: { ref: user.uid } });
    try {
      const downloadLink = await loadAdminDownloadLink();
      const details = [
        `${profile.name || user.displayName || "পাথরঘাটা ডিজিটাল সদস্য"}`,
        isDigitalCardVerified(profile) ? "✓ যাচাইকৃত সদস্য" : "কমিউনিটি সদস্য",
        `সদস্য আইডি: ${user.uid}`,
        `রেফার কোড: ${user.uid}`,
        `রেফার লিংক: ${referralUrl}`,
        nativeReferralUrl ? `অ্যাপের রেফার লিংক: ${nativeReferralUrl}` : null,
        downloadLink ? `অ্যাপ ডাউনলোড: ${downloadLink}` : null,
      ].filter(Boolean).join("\n");
      await Share.share({ title: "আমার পাথরঘাটা ডিজিটাল প্রোফাইল", message: details, ...(downloadLink ? { url: downloadLink } : {}) });
    }
    catch { Alert.alert("শেয়ার করা যায়নি", "আবার চেষ্টা করুন।"); }
  }
  async function downloadDigitalCard() {
    if (!cardRef.current || cardDownloading) return;
    setCardDownloading(true);
    setCardActionMessage("");
    try {
      const uri = await captureCardImage(cardRef);
      const saved = await saveCardToGallery(uri);
      if (!saved) {
        setCardActionMessage("কার্ড Gallery-তে রাখতে Photos/Media permission প্রয়োজন।");
        return;
      }
      setCardActionMessage(Platform.OS === "web" ? "ডিজিটাল কার্ড PNG হিসেবে ডাউনলোড হয়েছে।" : "Digital card ফোনের Gallery-তে সংরক্ষণ হয়েছে।");
    } catch {
      setCardActionMessage("কার্ড Gallery-তে সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setCardDownloading(false);
    }
  }

  function openDigitalCard() {
    setCardActionMessage("");
    setShowProfileCard(true);
  }
  async function copyReferralLink() {
    if (!user) return;
    try {
      await Clipboard.setStringAsync(referralUrl);
      setCardActionMessage("Referral link কপি হয়েছে।");
    } catch {
      setCardActionMessage("Referral link কপি করা যায়নি। আবার চেষ্টা করুন।");
    }
  }
  async function save() {
    if (!user || !name.trim()) {
      setMessage("নাম আবশ্যক।");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await update(ref(pathargataDb, `users/${user.uid}`), {
        name: name.trim(),
        nickname: nickname.trim(),
        profession: profession.trim(),
        location: location.trim(),
        village: village.trim(),
        bio: bio.trim().slice(0, 50),
        facebook: facebook.trim() || null,
        whatsapp: whatsapp.trim() || null,
        website: website.trim() || null,
        profile_locked: profileLocked,
        hide_phone: hidePhone,
        privacy_hide_contact: hidePhone,
      });
      // The RTDB profile is the source of truth for this app. A Firebase Auth
      // display-name sync must not make an otherwise successful profile save
      // look like a failure.
      await updateProfile(user, { displayName: name.trim() }).catch(() => undefined);
      await invalidateRtdbSnapshotCache([`users/${user.uid}`, `people_index/${user.uid}`]);
      setProfile((current) => ({
        ...current,
        name: name.trim(),
        nickname: nickname.trim(),
        profession: profession.trim(),
        location: location.trim(),
        bio: bio.trim().slice(0, 50),
        facebook: facebook.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        website: website.trim() || undefined,
        profile_locked: profileLocked,
        hide_phone: hidePhone,
        privacy_hide_contact: hidePhone,
      }));
      setEditing(false);
      setMessage("প্রোফাইল আপডেট হয়েছে।");
    } catch {
      setMessage("প্রোফাইল আপডেট করা যায়নি।");
    } finally {
      setSaving(false);
    }
  }
  function closeEditing() {
    setEditing(false);
    setName(profile.name || user?.displayName || "");
    setNickname(profile.nickname || "");
    setProfession(profile.profession || "");
    setLocation(profile.location || "");
    setVillage(profile.village || "");
    setBio(profile.bio || "");
    setFacebook(profile.facebook || "");
    setWhatsapp(profile.whatsapp || "");
    setWebsite(profile.website || "");
    setProfileLocked(Boolean(profile.profile_locked));
    setHidePhone(Boolean(profile.hide_phone || profile.privacy_hide_contact));
  }
  async function openLink(url: string) {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    if (await Linking.canOpenURL(normalized)) await Linking.openURL(normalized);
  }
  if (!user)
    return (
      <ScreenContainer className="bg-background px-5">
        <View className="flex-1 items-center justify-center">
          <View className="h-20 w-20 items-center justify-center rounded-[28px] bg-[#DCEDE5]"><Ionicons name="person-outline" size={34} color="#0A6652" /></View>
          <Text className="mt-5 text-xl font-bold text-foreground">আপনার পরিচয় তৈরি করুন</Text>
          <Text className="mt-2 max-w-[280px] text-center text-sm leading-6 text-[#728077]">নিজের প্রোফাইল, পোস্ট ও কমিউনিটির সঙ্গে যুক্ত হতে লগইন করুন।</Text>
          <TouchableOpacity className="mt-6 rounded-2xl bg-[#0A6652] px-6 py-3.5" onPress={() => router.push("../auth")}><Text className="font-bold text-white">লগইন / নিবন্ধন</Text></TouchableOpacity>
        </View>
      </ScreenContainer>
    );

  const postsToShow = profileTab === "posts" ? ownPosts : savedPosts;
  const totalFriends = Object.keys(profile.friends || {}).filter((friendUid) => Boolean(profile.friends?.[friendUid])).length;

  return (
    <ScreenContainer className="bg-background">
      <ScrollView ref={profileScrollRef} onScroll={(event) => { if (profileTab === "posts" && event.nativeEvent.layoutMeasurement.height + event.nativeEvent.contentOffset.y >= event.nativeEvent.contentSize.height - 500) void loadMoreOwnPosts(); }} scrollEventThrottle={200} contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between bg-[#0B2D26] px-5 pb-4 pt-3">
          <View>
            <Text className="text-[11px] font-bold uppercase tracking-[3px] text-[#A5C6B9]">PATHARGATA · MEMBER SPACE</Text>
            <Text className="mt-1 text-[21px] font-extrabold tracking-tight text-white">আমার পরিচয়</Text>
          </View>
          <TouchableOpacity accessibilityLabel="সেটিংস" onPress={() => router.push("/settings" as any)} className="h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-surface/10"><Ionicons name="settings-outline" size={20} color="#E9F3EE" /></TouchableOpacity>
        </View>
        {profileLoading && !profile.name && !profileError ? <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3"><ActivityIndicator color="#0A6652" size="small" /><Text className="text-[12px] font-semibold text-muted">প্রোফাইল প্রস্তুত হচ্ছে...</Text></View> : null}
        {profileError ? <TouchableOpacity onPress={() => { setProfileError(""); setProfileReloadKey((value) => value + 1); }} className="mx-4 mt-3 flex-row items-center gap-2 rounded-2xl border border-[#F1C9C2] bg-[#FFF8F7] px-4 py-3"><Ionicons name="cloud-offline-outline" size={19} color="#A04B42" /><Text className="flex-1 text-[12px] font-semibold text-[#A04B42]">{profileError}</Text><Text className="text-[12px] font-bold text-[#A04B42]">আবার চেষ্টা</Text></TouchableOpacity> : null}

        {/* Cover artwork contains no copy: uploaded images and fallback art stay clear of identity text. */}
        <View className="relative h-[178px] overflow-hidden bg-[#0F5547]">
          {profile.cover_pic ? (
            <TouchableOpacity activeOpacity={0.95} onPress={() => setImagePreviewUri(profile.cover_pic || null)} className="h-full w-full"><Image source={{ uri: profile.cover_pic }} className="h-full w-full" resizeMode="cover" /></TouchableOpacity>
          ) : (
            <View className="h-full w-full overflow-hidden bg-[#0F5547]">
              <View className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-[#C4E4D6]/15" />
              <View className="absolute -right-4 -top-16 h-56 w-56 rounded-full border border-[#C4E4D6]/20" />
              <View className="absolute right-8 -top-10 h-40 w-40 rounded-full border border-[#C4E4D6]/20" />
              <View className="absolute -bottom-20 -left-8 h-52 w-52 rounded-full bg-[#B7D977]/10" />
              <View className="absolute bottom-7 left-0 right-0 h-px bg-surface/10" />
              <View className="absolute bottom-0 left-8 top-0 w-px bg-surface/10" />
              <View className="absolute bottom-0 left-20 top-0 w-px bg-surface/10" />
              <View className="absolute bottom-0 right-20 top-0 w-px bg-surface/10" />
            </View>
          )}
          <View className="absolute inset-x-0 bottom-0 h-10 bg-black/10" />
          <TouchableOpacity accessibilityLabel="কভার ছবি বদলান" onPress={() => void chooseCover()} disabled={coverUploading} className="absolute right-4 top-4 h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-[#082E27]/75">
            {coverUploading ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="camera-outline" size={19} color="white" />}
          </TouchableOpacity>
        </View>

        <View className="mx-4 -mt-4 rounded-[28px] border border-border bg-surface p-5 shadow-sm">
          <View className="flex-row items-center">
            <View className="relative h-[82px] w-[82px] shrink-0 items-center justify-center rounded-[26px] border-[3px] border-white bg-[#E2F0E8] shadow-md">
              <TouchableOpacity activeOpacity={0.9} onPress={() => profile.profile_pic ? setImagePreviewUri(profile.profile_pic) : void chooseAvatar()} className="h-full w-full items-center justify-center overflow-hidden rounded-[22px]">
                {profile.profile_pic ? <Image source={{ uri: profile.profile_pic }} className="h-full w-full" resizeMode="cover" /> : <Text className="text-3xl font-extrabold text-[#0A6652]">{(profile.name || user.displayName || "পা").slice(0, 1)}</Text>}
              </TouchableOpacity>
              {uploading ? <View className="absolute inset-0 items-center justify-center rounded-[22px] bg-black/40"><ActivityIndicator color="white" /></View> : null}
              <TouchableOpacity accessibilityLabel="প্রোফাইল ছবি বদলান" onPress={() => void chooseAvatar()} disabled={uploading} className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-xl border-2 border-white bg-[#C18444]"><Ionicons name="camera" size={18} color="white" /></TouchableOpacity>
              <View className={`absolute -bottom-1 -left-1 h-4 w-4 rounded-full border-[3px] border-white ${isOnline ? "bg-[#39A875]" : "bg-[#AAB5AE]"}`} />
            </View>
            <View className="ml-4 min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5"><Text className="flex-1 text-[20px] font-extrabold leading-6 text-foreground" numberOfLines={2}>{profile.name || user.displayName || "Pathargata Member"}</Text>{profile.isVerified ? <ProfessionVerificationBadge category={profile.verificationCategory} size="compact" /> : profile.role === "journalist" ? <Ionicons name="checkmark-circle" size={18} color="#0A8065" /> : null}</View>
              <Text className="mt-1 text-[13px] font-semibold text-[#68776D]">{profile.profession || (profile.role === "journalist" ? "সাংবাদিক" : "পাথরঘাটা কমিউনিটির সদস্য")}</Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-1.5"><View className="rounded-lg bg-surface px-2 py-1"><Text className="text-[11px] font-bold text-[#23614D]">{profile.union || "ইউনিয়ন যোগ হয়নি"}</Text></View><Text className="text-[12px] text-muted">{profile.village || "গ্রাম যোগ হয়নি"}</Text>{profile.profile_locked ? <Ionicons name="lock-closed" size={14} color="#7A867D" /> : null}</View>
            </View>
          </View>

          {editing ? (
            <TextInput value={name} onChangeText={setName} className="mt-4 rounded-xl border border-border bg-surface px-3.5 py-3 text-[16px] font-semibold text-foreground" placeholder="আপনার নাম" placeholderTextColor="#8A968D" />
          ) : null}
          {profile.bio ? <Text className="mt-4 border-l-[3px] border-[#C18444] pl-3 text-[15px] leading-[21px] text-[#58675E]">{profile.bio}</Text> : null}
          <View className="mt-5 flex-row gap-2">
            <TouchableOpacity onPress={() => editing ? closeEditing() : setEditing(true)} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#0B2D26] py-3"><Ionicons name={editing ? "close" : "create-outline"} size={18} color="white" /><Text className="text-[13px] font-bold text-white">{editing ? "বাতিল করুন" : "প্রোফাইল সাজান"}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void openDigitalCard()} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3"><Ionicons name="qr-code-outline" size={18} color="#0A6652" /><Text className="text-[13px] font-bold text-[#0A6652]">ডিজিটাল কার্ড</Text></TouchableOpacity>
            <TouchableOpacity accessibilityLabel="প্রোফাইল শেয়ার করুন" onPress={() => void shareProfileCard()} className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"><Ionicons name="share-social-outline" size={18} color="#0A6652" /></TouchableOpacity>
          </View>
        </View>

        {editing ? (
          <View className="mx-4 mt-4 rounded-[26px] border border-border bg-surface p-5">
            <Text className="mb-4 text-[15px] font-extrabold uppercase tracking-wider text-[#0A6652]">পরিচিতির তথ্য</Text>
            <EditField label="ডাক নাম" value={nickname} onChangeText={setNickname} placeholder="যেমন: রানা" />
            <EditField label="পেশা" value={profession} onChangeText={setProfession} placeholder="যেমন: শিক্ষক, ব্যবসায়ী" />
            <EditField label="বর্তমান ঠিকানা" value={location} onChangeText={setLocation} placeholder="বিস্তারিত ঠিকানা" />
            <View className="mb-4 rounded-xl border border-border bg-surface p-3"><Text className="text-[12px] font-bold text-muted">ইউনিয়ন / গ্রাম</Text><Text className="mt-1 text-[15px] font-semibold text-foreground">{[profile.village, profile.union].filter(Boolean).join(" · ") || "তথ্য যোগ করা হয়নি"}</Text></View>
            <Text className="mb-2 text-[14px] font-semibold text-foreground">সংক্ষিপ্ত পরিচিতি · ৫০ অক্ষর</Text>
            <TextInput value={bio} onChangeText={setBio} maxLength={50} multiline className="mb-4 min-h-20 rounded-xl border border-border bg-surface px-3.5 py-3 text-[15px] leading-5 text-foreground" placeholder="নিজের সম্পর্কে লিখুন" placeholderTextColor="#8A968D" />
            <EditField label="Facebook link" value={facebook} onChangeText={setFacebook} placeholder="https://facebook.com/..." />
            <EditField label="WhatsApp number" value={whatsapp} onChangeText={setWhatsapp} placeholder="017XXXXXXXX" />
            <EditField label="Website" value={website} onChangeText={setWebsite} placeholder="https://..." />
            <Toggle label="প্রোফাইল লক করুন" value={profileLocked} onChange={setProfileLocked} />
            <Toggle label="মোবাইল / ইমেইল গোপন রাখুন" value={hidePhone} onChange={setHidePhone} />
            <TouchableOpacity className="mt-3 items-center rounded-xl bg-[#0B2D26] py-3.5" onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color="white" /> : <Text className="text-[14px] font-bold text-white">পরিবর্তন সংরক্ষণ করুন</Text>}</TouchableOpacity>
          </View>
        ) : null}

        <View className="mx-4 mt-4 flex-row gap-2">
          <View className="flex-1 rounded-2xl border border-border bg-surface p-3.5"><Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">পোস্ট</Text><Text className="mt-1 text-[21px] font-extrabold text-foreground">{postCount}{ownPostsHasMore ? "+" : ""}</Text><View className="mt-2 h-1 w-9 rounded-full bg-[#0A8065]" /></View>
          <TouchableOpacity onPress={() => router.push("/friends" as any)} className="flex-1 rounded-2xl border border-border bg-surface p-3.5"><Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">বন্ধু</Text><Text className="mt-1 text-[21px] font-extrabold text-foreground">{totalFriends}</Text><View className="mt-2 h-1 w-9 rounded-full bg-[#C18444]" /></TouchableOpacity>
          <View className="flex-1 rounded-2xl border border-border bg-surface p-3.5"><Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">সদস্য</Text><Text className="mt-1 text-[15px] font-extrabold text-foreground" numberOfLines={1}>{profile.joinDate || "—"}</Text><View className="mt-2 h-1 w-9 rounded-full bg-[#718A9B]" /></View>
        </View>

        {message ? <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-xl border border-[#D8EAE0] bg-[#EBF5EF] px-3 py-2.5"><Ionicons name="checkmark-circle-outline" size={18} color="#0A6652" /><Text className="flex-1 text-[13px] text-[#0A6652]">{message}</Text><TouchableOpacity onPress={() => setMessage("")}><Ionicons name="close" size={18} color="#0A6652" /></TouchableOpacity></View> : null}

        {!editing ? (
          <>
            <View className="mx-4 mt-5 rounded-[26px] border border-border bg-surface p-5">
              <View className="mb-4 flex-row items-center justify-between"><View><Text className="text-[15px] font-extrabold text-foreground">পরিচিতির বিবরণ</Text><Text className="mt-0.5 text-[12px] text-muted">আপনার নির্বাচিত কমিউনিটি তথ্য</Text></View><Ionicons name="finger-print-outline" size={20} color="#C18444" /></View>
              <InfoRow icon="location-outline" text={[profile.location, profile.village, profile.union].filter(Boolean).join(" · ") || "ঠিকানা যোগ করা হয়নি"} />
              <InfoRow icon="briefcase-outline" text={profile.profession || "পেশা যোগ করা হয়নি"} />
              <InfoRow icon="mail-outline" text={profile.privacy_hide_contact || profile.hide_phone ? "ইমেইল গোপন রাখা হয়েছে" : profile.email || user.email || "ইমেইল নেই"} />
              <InfoRow icon="call-outline" text={profile.hide_phone || profile.privacy_hide_contact ? "মোবাইল গোপন রাখা হয়েছে" : profile.phone || "মোবাইল যোগ করা হয়নি"} />
              {profile.facebook || profile.whatsapp || profile.website ? <View className="mt-2 flex-row items-center gap-2 border-t border-border pt-4"><Text className="mr-1 text-[12px] font-bold uppercase tracking-wider text-muted">লিংক</Text>{profile.facebook ? <SocialButton icon="logo-facebook" color="#1877F2" onPress={() => void openLink(profile.facebook!)} /> : null}{profile.whatsapp ? <SocialButton icon="logo-whatsapp" color="#25D366" onPress={() => void openLink(`https://wa.me/${profile.whatsapp!.replace(/\D/g, "")}`)} /> : null}{profile.website ? <SocialButton icon="globe-outline" color="#0A6652" onPress={() => void openLink(profile.website!)} /> : null}</View> : <TouchableOpacity onPress={() => setEditing(true)} className="mt-3 flex-row items-center gap-2"><Ionicons name="add-circle-outline" size={18} color="#0A6652" /><Text className="text-[13px] font-semibold text-[#0A6652]">সামাজিক লিংক যোগ করুন</Text></TouchableOpacity>}
            </View>

            <View className="mx-4 mt-5 rounded-[26px] border border-border bg-surface p-5">
              <View className="mb-4 flex-row items-center justify-between"><View><Text className="text-[15px] font-extrabold text-foreground">কমিউনিটি সংযোগ</Text><Text className="mt-0.5 text-[12px] text-muted">আপনার বন্ধুদের এক নজরে</Text></View><TouchableOpacity onPress={() => router.push("/friends" as any)} className="flex-row items-center gap-1"><Text className="text-[12px] font-bold text-[#0A6652]">সব বন্ধু</Text><Ionicons name="arrow-forward" size={18} color="#0A6652" /></TouchableOpacity></View>
              {friends.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{friends.map((friend) => <TouchableOpacity key={friend.uid} onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: friend.uid } })} className="w-[76px] items-center rounded-2xl bg-surface px-2 py-3"><View className="h-12 w-12 items-center justify-center overflow-hidden rounded-[17px] border border-border bg-surface">{friend.profile_pic ? <Image source={{ uri: friend.profile_pic }} className="h-full w-full" /> : <Text className="text-base font-bold text-[#0A6652]">{(friend.name || "পা").slice(0, 1)}</Text>}</View><Text className="mt-2 w-full text-center text-[11px] font-semibold text-foreground" numberOfLines={1}>{friend.name || "সদস্য"}</Text></TouchableOpacity>)}</ScrollView> : <TouchableOpacity onPress={() => router.push("/people" as any)} className="flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3"><View><Text className="text-[13px] font-semibold text-foreground">আপনার নেটওয়ার্ক তৈরি করুন</Text><Text className="mt-1 text-[11px] text-muted">কমিউনিটির মানুষ খুঁজে বন্ধু যোগ করুন</Text></View><Ionicons name="arrow-forward-circle" size={23} color="#0A6652" /></TouchableOpacity>}
            </View>
          </>
        ) : null}

        <View className="mt-6">
          <View className="mb-3 flex-row items-end justify-between"><View><Text className="text-[11px] font-bold uppercase tracking-[2px] text-[#0A8065]">COMMUNITY JOURNAL</Text><Text className="mt-1 text-[20px] font-extrabold text-foreground">আমার প্রকাশনা</Text></View><TouchableOpacity onPress={() => router.push("/compose" as any)} className="flex-row items-center gap-1.5 rounded-xl bg-[#0B2D26] px-3 py-2.5"><Ionicons name="add" size={18} color="white" /><Text className="text-[12px] font-bold text-white">নতুন পোস্ট</Text></TouchableOpacity></View>
          <View className="mb-4 flex-row rounded-2xl border border-border bg-surface p-1.5">
            <TouchableOpacity onPress={() => { setProfileTab("posts"); setVisiblePostsCount(5); }} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${profileTab === "posts" ? "bg-[#0B2D26]" : ""}`}><Ionicons name="document-text-outline" size={18} color={profileTab === "posts" ? "white" : "#718078"} /><Text className={`text-[12px] font-bold ${profileTab === "posts" ? "text-white" : "text-muted"}`}>আমার পোস্ট · {ownPosts.length}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setProfileTab("saved"); setVisiblePostsCount(5); }} className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 ${profileTab === "saved" ? "bg-[#0B2D26]" : ""}`}><Ionicons name="bookmark-outline" size={18} color={profileTab === "saved" ? "white" : "#718078"} /><Text className={`text-[12px] font-bold ${profileTab === "saved" ? "text-white" : "text-muted"}`}>সংরক্ষিত · {savedPosts.length}</Text></TouchableOpacity>
          </View>
          {profileTab === "posts" && postsLoading || profileTab === "saved" && savedLoading ? <View className="items-center rounded-[26px] border border-border bg-surface px-6 py-10"><ActivityIndicator color="#0A6652" /><Text className="mt-3 text-[13px] font-semibold text-muted">{profileTab === "saved" ? "সংরক্ষিত পোস্ট প্রস্তুত হচ্ছে..." : "আপনার পোস্ট লোড হচ্ছে..."}</Text></View> : profileTab === "posts" && postsError || profileTab === "saved" && savedError ? <TouchableOpacity onPress={() => { if (profileTab === "posts") { setPostsError(""); setProfileReloadKey((value) => value + 1); } else { setSavedLoaded(false); } }} className="items-center rounded-[26px] border border-[#F1C9C2] bg-[#FFF8F7] px-6 py-10"><Ionicons name="cloud-offline-outline" size={30} color="#A04B42" /><Text className="mt-3 text-center text-[13px] font-semibold text-[#A04B42]">{profileTab === "posts" ? postsError : savedError}</Text><Text className="mt-2 text-[12px] font-bold text-[#A04B42]">আবার চেষ্টা করুন</Text></TouchableOpacity> : postsToShow.length ? postsToShow.slice(0, profileTab === "posts" ? postsToShow.length : visiblePostsCount).map((post) => <ProfilePostCard key={post.id} post={post} profileName={profile.name || user.displayName || "পাথরঘাটা কমিউনিটি"} profilePhoto={profile.profile_pic || user.photoURL || undefined} isSaved={profileTab === "saved" || savedPosts.some((saved) => saved.id === post.id)} showEngagementCounts={false} onDeleted={(deletedPostId) => { setOwnPosts((current) => current.filter((item) => item.id !== deletedPostId)); setSavedPosts((current) => current.filter((item) => item.id !== deletedPostId)); setPostCount((current) => Math.max(0, current - 1)); }} />) : (
            <View className="items-center rounded-[26px] border border-dashed border-[#C9D7CD] bg-surface px-6 py-10"><View className="h-14 w-14 items-center justify-center rounded-[20px] bg-surface"><Ionicons name={profileTab === "posts" ? "document-text-outline" : "bookmark-outline"} size={24} color="#0A6652" /></View><Text className="mt-4 text-[15px] font-bold text-foreground">{profileTab === "posts" ? "এখনো কোনো পোস্ট প্রকাশ করেননি" : "সংরক্ষিত পোস্ট এখানে দেখা যাবে"}</Text><Text className="mt-1 max-w-[250px] text-center text-[12px] leading-5 text-muted">{profileTab === "posts" ? "আপনার প্রথম পোস্ট দিয়ে কমিউনিটির সঙ্গে কিছু শেয়ার করুন।" : "পোস্টের বুকমার্ক বাটনে চাপ দিলে পরে এখানে পাবেন।"}</Text>{profileTab === "posts" ? <TouchableOpacity onPress={() => router.push("/compose" as any)} className="mt-4 rounded-xl bg-[#0B2D26] px-4 py-2.5"><Text className="text-[12px] font-bold text-white">প্রথম পোস্ট লিখুন</Text></TouchableOpacity> : null}</View>
          )}
          {profileTab === "posts" && ownPostsLoadingMore ? <View className="items-center py-3"><ActivityIndicator color="#0A6652" /><Text className="mt-1 text-[12px] text-muted">আরও পোস্ট লোড হচ্ছে...</Text></View> : null}
          {profileTab === "posts" && ownPostsHasMore && !ownPostsLoadingMore ? <TouchableOpacity onPress={() => void loadMoreOwnPosts()} className="mb-3 items-center rounded-xl border border-border bg-surface py-3"><Text className="text-[13px] font-bold text-[#0A6652]">আরও পোস্ট দেখুন</Text></TouchableOpacity> : null}
          {profileTab === "posts" && !ownPostsHasMore && ownPosts.length > 0 ? <Text className="mb-3 text-center text-[12px] text-muted">সব পোস্ট দেখানো হয়েছে</Text> : null}
          {profileTab === "saved" && postsToShow.length > visiblePostsCount ? <TouchableOpacity onPress={() => setVisiblePostsCount((count) => count + 5)} className="mb-4 items-center rounded-xl border border-border bg-surface py-3"><Text className="text-[13px] font-bold text-[#0A6652]">আরও ৫টি দেখুন</Text></TouchableOpacity> : null}
        </View>

        <TouchableOpacity className="mx-4 mt-5 flex-row items-center justify-center gap-2 rounded-2xl border border-[#E7D5D1] bg-[#FFF8F7] py-3.5" onPress={() => void signOut(pathargataAuth)}><Ionicons name="log-out-outline" size={18} color="#A04B42" /><Text className="text-[13px] font-bold text-[#A04B42]">অ্যাকাউন্ট থেকে লগআউট</Text></TouchableOpacity>
      </ScrollView>

      <Modal visible={showProfileCard} transparent animationType="fade" onRequestClose={() => setShowProfileCard(false)}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 18 }} className="bg-[#071A15]/90">
          <View ref={cardRef} collapsable={false} className="mx-auto aspect-[1.586] w-full max-w-sm overflow-hidden rounded-[22px] border border-white/15 bg-[#0B2D26] shadow-2xl">
            <View className="flex-row items-center justify-between border-b border-white/10 bg-[#0E3A31] px-5 py-3.5">
              <View><Text className="text-[9px] font-bold uppercase tracking-[2px] text-[#ABD5C3]">PATHARGATA DIGITAL · MEMBER</Text><Text className="mt-1 text-[17px] font-extrabold text-white">ডিজিটাল কার্ড</Text></View>
              <View className="h-10 w-10 items-center justify-center rounded-xl border border-[#D4AC72]/40 bg-[#D4AC72]/10"><Ionicons name="card-outline" size={21} color="#D4AC72" /></View>
            </View>
            <View className="flex-1 flex-row items-center gap-4 px-5 py-3.5">
              <View className="h-[70px] w-[70px] items-center justify-center overflow-hidden rounded-[17px] border-2 border-[#D4AC72] bg-white/10">{profile.profile_pic || user.photoURL ? <Image source={{ uri: profile.profile_pic || user.photoURL || undefined }} className="h-full w-full" resizeMode="cover" /> : <Text className="text-2xl font-bold text-white">{(profile.name || user.displayName || "পা").slice(0, 1)}</Text>}</View>
              <View className="min-w-0 flex-1"><View className="flex-row items-center gap-1"><Text numberOfLines={1} className="shrink text-[17px] font-extrabold text-white">{profile.name || user.displayName || "সদস্য"}</Text>{isDigitalCardVerified(profile) ? <Ionicons name="checkmark-circle" size={18} color="#59D0AC" /> : null}</View><Text className="mt-1 text-[11px] font-semibold text-[#C7DED3]">{profile.profession || "কমিউনিটি সদস্য"}</Text><Text numberOfLines={1} className="mt-1 text-[11px] text-[#C7DED3]">{[profile.village, profile.union].filter(Boolean).join(" · ") || "পাথরঘাটা"}</Text>{isDigitalCardVerified(profile) ? <Text className="mt-1 text-[9px] font-bold text-[#81E2C3]">যাচাইকৃত প্রোফাইল</Text> : null}</View>
              <View className="h-[104px] w-[104px] items-center justify-center rounded-xl bg-white p-1.5"><QRCode value={cardPayload} size={92} quietZone={2} backgroundColor="#ffffff" color="#0B2D26" ecl="M" /></View>
            </View>
            <View className="mx-5 mb-3 flex-row items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2"><View><Text className="text-[8px] font-bold uppercase tracking-wider text-[#ABD5C3]">MEMBER ID</Text><Text numberOfLines={1} className="mt-0.5 font-mono text-[10px] font-bold text-white">{user.uid.slice(0, 16).toUpperCase()}</Text></View><Text className="text-[9px] text-[#C7DED3]">QR-এ পূর্ণ তথ্য</Text></View>
          </View>
      <View className="mx-auto mt-4 w-full max-w-sm"><Text className="mb-3 text-center text-[11px] leading-4 text-[#D8E8DF]">QR scan করলে public profile, referral link এবং সেট করা থাকলে app download link পাওয়া যাবে।</Text>{cardActionMessage ? <Text accessibilityRole="alert" className="mb-3 text-center text-[11px] leading-4 text-[#81E2C3]">{cardActionMessage}</Text> : null}<View className="flex-row gap-2"><TouchableOpacity onPress={() => void copyReferralLink()} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-3"><Ionicons name="copy-outline" size={16} color="#D8E8DF" /><Text className="text-[11px] font-bold text-white">রেফার কপি</Text></TouchableOpacity><TouchableOpacity onPress={() => void downloadDigitalCard()} disabled={cardDownloading} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#0A8065] py-3"><Ionicons name="download-outline" size={16} color="white" /><Text className="text-[11px] font-bold text-white">{cardDownloading ? "সংরক্ষণ হচ্ছে…" : Platform.OS === "web" ? "PNG ডাউনলোড" : "Gallery-তে রাখুন"}</Text></TouchableOpacity><TouchableOpacity onPress={() => void shareProfileCard()} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-3"><Ionicons name="share-social-outline" size={16} color="#D8E8DF" /><Text className="text-[11px] font-bold text-white">শেয়ার</Text></TouchableOpacity><TouchableOpacity accessibilityLabel="কার্ড বন্ধ করুন" onPress={() => setShowProfileCard(false)} className="h-11 w-11 items-center justify-center rounded-xl border border-white/15"><Ionicons name="close" size={19} color="white" /></TouchableOpacity></View></View>
        </ScrollView>
      </Modal>
      <Modal visible={Boolean(imagePreviewUri)} transparent animationType="fade" onRequestClose={() => setImagePreviewUri(null)}>
        <View className="flex-1 items-center justify-center bg-black"><TouchableOpacity onPress={() => setImagePreviewUri(null)} className="absolute right-5 top-12 z-10 h-11 w-11 items-center justify-center rounded-2xl bg-surface/15"><Ionicons name="close" size={23} color="white" /></TouchableOpacity>{imagePreviewUri ? <Image source={{ uri: imagePreviewUri }} className="h-full w-full" resizeMode="contain" /> : null}</View>
      </Modal>
    </ScreenContainer>
  );
}
function CardDetail({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start gap-2.5">
      <Ionicons name={icon} size={14} color="#9BC6B1" />
      <Text className="w-[58px] text-[10px] font-semibold text-[#9BB6A8]">{label}</Text>
      <Text className="min-w-0 flex-1 text-[11px] leading-4 text-[#E1EEE7]">{value}</Text>
    </View>
  );
}
function SocialButton({
  icon,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="h-10 w-10 rounded-full bg-background items-center justify-center"
    >
      <Ionicons name={icon} size={21} color={color} />
    </TouchableOpacity>
  );
}
function EditField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-foreground mb-2">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        className="rounded-2xl bg-background border border-border px-4 py-3 text-sm text-foreground"
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
      />
    </View>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      className="flex-row items-center justify-between py-3"
    >
      <Text className="text-sm text-foreground">{label}</Text>
      <View
        className={`h-7 w-12 rounded-full p-1 ${value ? "bg-primary" : "bg-border"}`}
      >
        <View
          className={`h-5 w-5 rounded-full bg-surface ${value ? "ml-5" : "ml-0"}`}
        />
      </View>
    </TouchableOpacity>
  );
}
function InfoRow({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View className="flex-row items-center mb-4">
      <Ionicons name={icon} size={20} color="#15803D" />
      <Text className="ml-3 text-sm text-foreground flex-1">{text}</Text>
    </View>
  );
}
