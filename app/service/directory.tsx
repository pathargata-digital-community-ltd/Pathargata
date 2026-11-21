import { safeGoBack } from "@/lib/safe-navigation";
import { getFreshWithCache } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { limitToFirst, query as databaseQuery, ref, set } from "firebase/database";
import { router, type Href, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import {
  buildDirectoryReviewPayload,
  type SavedDirectoryEntry,
} from "@/lib/directory-interactions";
import AsyncStorage from "@react-native-async-storage/async-storage";

type DirectoryCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  section: string;
};
type DirectoryItem = {
  id: string;
  name?: string;
  designation?: string;
  details?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  chat_uid?: string;
  availability?: string;
  hours?: string;
  is_active_24_7?: boolean;
  profile_pic?: string;
  image?: string;
  lat?: number | string;
  lng?: number | string;
  specialty?: string;
  chamber_time?: string;
  days_available?: string;
  hospital_chamber?: string;
  rating?: number | string;
  total_reviews?: number | string;
};

const DIRECTORY_PAGE_SIZE = 20;
const DIRECTORY_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

const categories: DirectoryCategory[] = [
  {
    id: "uno",
    title: "ইউএনও অফিস",
    subtitle: "উপজেলা প্রশাসন",
    icon: "business-outline",
    color: "#2563EB",
    section: "প্রশাসনিক দপ্তর",
  },
  {
    id: "acland",
    title: "ভূমি অফিস",
    subtitle: "ভূমি ও রাজস্ব সেবা",
    icon: "document-text-outline",
    color: "#059669",
    section: "প্রশাসনিক দপ্তর",
  },
  {
    id: "police",
    title: "থানা পুলিশ",
    subtitle: "নিরাপত্তা ও আইনশৃঙ্খলা",
    icon: "shield-checkmark-outline",
    color: "#4F46E5",
    section: "প্রশাসনিক দপ্তর",
  },
  {
    id: "health",
    title: "হাসপাতাল",
    subtitle: "স্বাস্থ্যসেবা ও চিকিৎসা",
    icon: "medkit-outline",
    color: "#DC2626",
    section: "জরুরি সেবা",
  },
  {
    id: "electricity",
    title: "বিদ্যুৎ",
    subtitle: "পল্লী বিদ্যুৎ সহায়তা",
    icon: "flash-outline",
    color: "#D97706",
    section: "জরুরি সেবা",
  },
  {
    id: "fire",
    title: "ফায়ার সার্ভিস",
    subtitle: "অগ্নিনির্বাপণ সহায়তা",
    icon: "flame-outline",
    color: "#EA580C",
    section: "জরুরি সেবা",
  },
  {
    id: "doctor",
    title: "ডাক্তার",
    subtitle: "বিশেষজ্ঞ চিকিৎসক",
    icon: "person-outline",
    color: "#0284C7",
    section: "অন্যান্য সেবা",
  },
  {
    id: "ambulance",
    title: "অ্যাম্বুলেন্স",
    subtitle: "দ্রুত জরুরি পরিবহন",
    icon: "car-outline",
    color: "#E11D48",
    section: "অন্যান্য সেবা",
  },
  {
    id: "union",
    title: "ইউপি অফিস",
    subtitle: "ইউনিয়ন পরিষদ",
    icon: "business-outline",
    color: "#0F766E",
    section: "অন্যান্য সেবা",
  },
  {
    id: "agriculture",
    title: "কৃষি সহায়তা",
    subtitle: "কৃষি তথ্য ও পরামর্শ",
    icon: "leaf-outline",
    color: "#16A34A",
    section: "অন্যান্য সেবা",
  },
];

function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function asItems(value: unknown): DirectoryItem[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item && typeof item === "object")
    .map(([id, item]) => ({ ...(item as DirectoryItem), id }));
}
function isOpenNow(timeRange?: string) {
  if (!timeRange) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return timeRange.split(",").some((range) => {
    const [start, end] = range.trim().split("-");
    if (!start || !end) return false;
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    return (
      minutes >= startHour * 60 + startMinute &&
      minutes <= endHour * 60 + endMinute
    );
  });
}
function mapsUrl(item: DirectoryItem) {
  const query =
    item.lat && item.lng
      ? `${item.lat},${item.lng}`
      : `${item.name || "পাথরঘাটা"} ${item.hospital_chamber || item.address || "পাথরঘাটা"}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function whatsappUrl(phone: string, name: string) {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = `88${clean}`;
  return `https://api.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(`আসসালামু আলাইকুম ${name} সাহেব, পাথরঘাটা ডিজিটাল অ্যাপের ডিরেক্টরি থেকে যোগাযোগ করছি।`)}`;
}

function CategoryTile({
  item,
  onPress,
}: {
  item: DirectoryCategory;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="w-[31.5%] rounded-3xl bg-surface border border-border p-3 mb-3 active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={`${item.title} খুলুন`}
    >
      <View
        className="h-12 w-12 rounded-2xl items-center justify-center mb-3"
        style={{ backgroundColor: `${item.color}18` }}
      >
        <Ionicons name={item.icon} size={24} color={item.color} />
      </View>
      <Text
        className="text-xs font-bold text-foreground leading-4"
        numberOfLines={2}
      >
        {item.title}
      </Text>
      <Text className="text-[12px] text-muted mt-1 leading-3" numberOfLines={2}>
        {item.subtitle}
      </Text>
    </Pressable>
  );
}

function DirectoryCard({
  item,
  category,
  bookmarked,
  onBookmark,
  onRate,
}: {
  item: DirectoryItem;
  category: DirectoryCategory;
  bookmarked: boolean;
  onBookmark: () => void;
  onRate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const name = asText(item.name) || "নাম উল্লেখ নেই";
  const designation =
    asText(item.designation || item.details) || "পদবী উল্লেখ নেই";
  const phone = asText(item.phone);
  const email = asText(item.email).trim();
  const chatUid = asText(item.chat_uid).trim();
  const specialty = asText(item.specialty);
  const chamberOpen = isOpenNow(item.chamber_time);
  const rating = Number(item.rating || 0);
  const image = asText(item.profile_pic || item.image);
  return (
    <View className="rounded-3xl bg-surface border border-border p-3 mb-2 shadow-sm">
      <View className="flex-row items-start">
        {image ? (
          <Image
            source={{ uri: image }}
            className="h-12 w-12 rounded-xl"
            resizeMode="cover"
          />
        ) : (
          <View
            className="h-12 w-12 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${category.color}18` }}
          >
            <Ionicons
              name={specialty ? "medkit-outline" : category.icon}
              size={23}
              color={category.color}
            />
          </View>
        )}
        <View className="ml-3 flex-1">
          <Text
            className="text-base font-bold text-foreground"
            numberOfLines={2}
          >
            {name}
          </Text>
          <Text
            className="text-xs font-semibold mt-1"
            style={{ color: category.color }}
            numberOfLines={2}
          >
            {designation}
          </Text>
          {specialty ? (
            <Text
              className="text-[11px] font-bold text-sky-700 mt-1"
              numberOfLines={1}
            >
              বিশেষজ্ঞ: {specialty}
            </Text>
          ) : null}
          {rating > 0 ? (
            <View className="flex-row items-center mt-2">
              <Ionicons name="star" size={18} color="#F59E0B" />
              <Text className="text-xs text-muted ml-1">
                {rating.toFixed(1)} · {asText(item.total_reviews) || "0"}{" "}
                reviews
              </Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          {chatUid ? (
            <Pressable
              onPress={() => {
                const user = pathargataAuth.currentUser;
                if (!user) {
                  router.push("/auth");
                  return;
                }
                if (chatUid === user.uid) {
                  Alert.alert("চ্যাট খোলা যাচ্ছে না", "নিজেকেই মেসেজ পাঠানো যাবে না।");
                  return;
                }
                router.push({ pathname: "/messages", params: { uid: chatUid, name } });
              }}
              className="h-8 w-8 rounded-full bg-blue-50 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={`${name}-কে মেসেজ পাঠান`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={15} color="#2563EB" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/directory-suggest",
                params: {
                  categoryId: category.id,
                  itemId: "__new__",
                  requestMode: "new",
                },
              } as unknown as Href)
            }
            className="h-8 w-8 rounded-full bg-emerald-50 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="নতুন তথ্য যোগ করার অনুরোধ করুন"
          >
            <Ionicons name="add-circle-outline" size={16} color="#047857" />
          </Pressable>
          <Pressable
            onPress={onBookmark}
            className="h-8 w-8 rounded-full bg-background items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? "বুকমার্ক সরান" : "বুকমার্ক করুন"}
          >
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={16}
              color={bookmarked ? "#D97706" : "#94A3B8"}
            />
          </Pressable>
        </View>
      </View>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        className="mt-3 flex-row items-center justify-between rounded-xl bg-background px-3 py-2"
        accessibilityRole="button"
        accessibilityLabel={`${name} এর ${expanded ? "কম" : "সব"} তথ্য দেখুন`}
      >
        <Text className="text-[11px] font-extrabold text-muted">
          {expanded ? "অতিরিক্ত তথ্য বন্ধ করুন" : "আরও তথ্য দেখুন"}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color="#64748B"
        />
      </Pressable>
      {expanded &&
      (item.hospital_chamber || item.days_available || item.chamber_time) ? (
        <View className="mt-4 rounded-2xl bg-sky-50 border border-sky-100 p-3">
          {item.hospital_chamber ? (
            <Text className="text-xs text-slate-600 mt-2">
              চেম্বার: {item.hospital_chamber}
            </Text>
          ) : null}
          {item.days_available ? (
            <Text className="text-xs text-slate-600 mt-1">
              দিন: {item.days_available}
            </Text>
          ) : null}
          {item.chamber_time ? (
            <Text className="text-xs text-slate-600 mt-1">
              সময়: {item.chamber_time}
            </Text>
          ) : null}
          <View className="flex-row items-center mt-2">
            <View
              className={`h-2 w-2 rounded-full ${chamberOpen ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            <Text
              className={`text-[13px] font-bold ml-2 ${chamberOpen ? "text-emerald-700" : "text-slate-500"}`}
            >
              {chamberOpen ? "চেম্বার খোলা" : "চেম্বার বর্তমানে বন্ধ"}
            </Text>
          </View>
        </View>
      ) : null}
      {expanded && item.address ? (
        <View className="flex-row items-start mt-4">
          <Ionicons name="location-outline" size={18} color="#64748B" />
          <Text className="text-xs text-muted ml-2 flex-1 leading-5">
            {item.address}
          </Text>
        </View>
      ) : null}
      {expanded && email ? (
        <View className="flex-row items-center mt-3">
          <Ionicons name="mail-outline" size={18} color="#64748B" />
          <Text
            className="text-xs text-muted ml-2 flex-1"
            numberOfLines={2}
            selectable
          >
            {email}
          </Text>
        </View>
      ) : null}
      {expanded && item.website ? (
        <Pressable
          onPress={() =>
            void Linking.openURL(
              item.website!.startsWith("http")
                ? item.website!
                : `https://${item.website}`,
            )
          }
          className="flex-row items-center mt-3"
          accessibilityRole="button"
          accessibilityLabel={`${name} এর ওয়েবসাইট খুলুন`}
        >
          <Ionicons name="globe-outline" size={17} color="#7C3AED" />
          <Text className="text-xs font-bold text-violet-700 ml-2" numberOfLines={1}>
            ওয়েবসাইট দেখুন
          </Text>
        </Pressable>
      ) : null}
      {expanded && (item.availability || item.hours || item.is_active_24_7) ? (
        <View className="self-start rounded-full bg-amber-50 px-2.5 py-1 mt-3">
          <Text className="text-[12px] font-bold text-amber-700">
            {item.is_active_24_7
              ? "২৪ ঘণ্টা খোলা"
              : item.availability || item.hours}
          </Text>
        </View>
      ) : null}
      <Text className="mt-3 pt-3 border-t border-border text-[11px] font-extrabold text-muted">
        যোগাযোগ ও সেবা
      </Text>
      <View className="flex-row gap-2 mt-2">
        <Pressable
          onPress={() => void Linking.openURL(mapsUrl(item))}
          className="flex-1 min-h-[44px] rounded-xl bg-blue-50 px-1 py-2 items-center justify-center"
        >
          <Ionicons name="map-outline" size={16} color="#2563EB" />
          <Text className="text-[11px] font-bold text-blue-700 mt-0.5">
            ম্যাপ
          </Text>
        </Pressable>
        <Pressable
          disabled={!phone}
          onPress={() => phone && void Linking.openURL(whatsappUrl(phone, name))}
          className={`flex-1 min-h-[44px] rounded-xl bg-green-50 px-1 py-2 items-center justify-center ${phone ? "" : "opacity-40"}`}
        >
          <Ionicons name="logo-whatsapp" size={16} color="#16A34A" />
          <Text className="text-[11px] font-bold text-green-700 mt-0.5">WhatsApp</Text>
        </Pressable>
        <Pressable
          disabled={!phone}
          onPress={() => phone && void Linking.openURL(`tel:${phone}`)}
          className={`flex-1 min-h-[44px] rounded-xl bg-emerald-50 px-1 py-2 items-center justify-center ${phone ? "" : "opacity-40"}`}
        >
          <Ionicons name="call-outline" size={16} color="#059669" />
          <Text className="text-[11px] font-bold text-emerald-700 mt-0.5">কল</Text>
        </Pressable>
      </View>
      <Text className="mt-3 text-[11px] font-extrabold text-muted">
        তথ্য যাচাই ও মতামত
      </Text>
      <View className="flex-row justify-between gap-2 mt-2">
        <Pressable
          onPress={() =>
          router.push({
            pathname: "/directory-suggest",
            params: {
              categoryId: category.id,
              itemId: item.id,
              name,
              phone,
            },
          } as unknown as Href)
        }
          className="flex-1 min-h-[44px] flex-row items-center justify-center rounded-xl bg-emerald-50 px-2 py-2"
        accessibilityRole="button"
        accessibilityLabel={`${name} তথ্য সংশোধনের আবেদন করুন`}
      >
        <Ionicons name="create-outline" size={16} color="#047857" />
        <Text className="text-[11px] font-bold text-emerald-700 ml-1.5">
          তথ্য সংশোধনের আবেদন
        </Text>
        </Pressable>
        <Pressable
          onPress={onRate}
          className="flex-1 min-h-[44px] flex-row items-center justify-center rounded-xl bg-amber-50 px-2 py-2"
          accessibilityRole="button"
          accessibilityLabel={`${name}-কে রেটিং ও রিভিউ দিন`}
        >
          <Ionicons name="star-outline" size={16} color="#D97706" />
          <Text className="text-[11px] font-bold text-amber-700 ml-1.5">
            রেটিং ও রিভিউ দিন
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type DirectoryReviewTarget = {
  itemId: string;
  categoryId: string;
  name: string;
};

function DirectoryReviewModal({
  target,
  onClose,
}: {
  target: DirectoryReviewTarget;
  onClose: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submitReview() {
    const user = pathargataAuth.currentUser;
    if (!user) {
      setError("রিভিউ দিতে লগইন করুন।");
      return;
    }
    if (saving) return;

    let payload;
    try {
      payload = buildDirectoryReviewPayload(
        { rating, comment, userName: user.displayName },
        Date.now(),
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "রেটিং যাচাই করা যায়নি।",
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      await set(
        ref(
          pathargataDb,
          `directory_reviews/${target.categoryId}/${target.itemId}/${user.uid}`,
        ),
        payload,
      );
      onClose();
      Alert.alert("ধন্যবাদ", "আপনার রেটিং জমা হয়েছে।");
    } catch {
      setError("রেটিং জমা দেওয়া যায়নি। সার্ভার permission যাচাই করুন।");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (!saving) onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center bg-black/50 px-5">
        <Pressable
          className="absolute inset-0"
          onPress={close}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="রিভিউ ফর্ম বন্ধ করুন"
        />
        <View className="w-full max-w-md rounded-[28px] border border-border bg-background p-5">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-foreground">
                রেটিং ও রিভিউ
              </Text>
              <Text className="text-sm text-muted mt-1" numberOfLines={2}>
                {target.name}
              </Text>
            </View>
            <Pressable
              onPress={close}
              disabled={saving}
              className="h-9 w-9 rounded-full bg-surface items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="বন্ধ করুন"
            >
              <Ionicons name="close" size={20} color="#475569" />
            </Pressable>
          </View>

          <Text className="text-xs font-semibold text-muted text-center mt-6">
            আপনার অভিজ্ঞতা অনুযায়ী ১–৫ স্টার বেছে নিন
          </Text>
          <View className="flex-row items-center justify-center gap-3 mt-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  setRating(value);
                  setError("");
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: rating === value }}
                accessibilityLabel={`${value} স্টার`}
                className="p-1"
              >
                <Ionicons
                  name={value <= rating ? "star" : "star-outline"}
                  size={34}
                  color={value <= rating ? "#F59E0B" : "#CBD5E1"}
                />
              </Pressable>
            ))}
          </View>
          <Text className="text-xs text-center text-amber-700 font-bold mt-2">
            {rating ? `${rating} / 5` : "রেটিং নির্বাচন করুন"}
          </Text>

          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="আপনার মতামত লিখুন (ঐচ্ছিক)"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={500}
            textAlignVertical="top"
            className="min-h-[112px] rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground mt-5"
          />
          <Text className="text-[12px] text-muted mt-2 leading-4">
            একই account-এর নতুন রিভিউ আগের রেটিংটি হালনাগাদ করবে।
          </Text>
          {error ? (
            <Text className="text-xs font-semibold text-red-600 mt-3">
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void submitReview()}
            disabled={saving || rating === 0}
            className={`rounded-2xl py-3.5 items-center mt-4 ${saving || rating === 0 ? "bg-amber-300" : "bg-amber-500"}`}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-white">রেটিং জমা দিন</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function DirectoryScreen() {
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const categoryId = Array.isArray(categoryParam)
    ? categoryParam[0] || ""
    : typeof categoryParam === "string"
      ? categoryParam
      : "";
  const activeCategoryId = categories.some((item) => item.id === categoryId)
    ? categoryId
    : "";
  const [authReady, setAuthReady] = useState(Boolean(pathargataAuth.currentUser));
  const [authUid, setAuthUid] = useState(pathargataAuth.currentUser?.uid || null);
  const selected = categories.find((item) => item.id === activeCategoryId) || null;
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [savedEntries, setSavedEntries] = useState<SavedDirectoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageLimit, setPageLimit] = useState(DIRECTORY_PAGE_SIZE);
  const [error, setError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState(false);
  const [savedRetryKey, setSavedRetryKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [bookmarkRecords, setBookmarkRecords] = useState<SavedDirectoryEntry[]>([]);
  const bookmarkRecordsRef = useRef<SavedDirectoryEntry[]>([]);
  const [bookmarksLoaded, setBookmarksLoaded] = useState(false);
  const [reviewTarget, setReviewTarget] =
    useState<DirectoryReviewTarget | null>(null);

  useEffect(() => {
    let active = true;
    return onAuthStateChanged(pathargataAuth, (user) => {
      if (!active) return;
      setAuthUid(user?.uid || null);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem("directory_bookmarks"),
      AsyncStorage.getItem("directory_bookmark_records"),
    ]).then(([value, recordsValue]) => {
        if (!active) return;
        try {
          const parsed: unknown = value ? JSON.parse(value) : [];
          const ids = Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
          setBookmarks(ids);
          const records = recordsValue ? JSON.parse(recordsValue) : [];
          const parsedRecords = Array.isArray(records) ? records : [];
          bookmarkRecordsRef.current = parsedRecords;
          setBookmarkRecords(parsedRecords);
          if (ids.length === 0) setSavedLoading(false);
        } catch {
          setBookmarks([]);
          setSavedLoading(false);
        }
        setBookmarksLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setBookmarks([]);
        setSavedLoading(false);
        setBookmarksLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function toggleBookmark(id: string, categoryId: string, item?: DirectoryItem) {
    const next = bookmarks.includes(id)
      ? bookmarks.filter((value) => value !== id)
      : [...bookmarks, id];
    const nextRecords = bookmarks.includes(id)
      ? bookmarkRecords.filter((entry) => entry.id !== id)
      : item
        ? [...bookmarkRecords.filter((entry) => !(entry.id === id && entry.categoryId === categoryId)), { id, categoryId, item }]
        : bookmarkRecords;
    setBookmarks(next);
    bookmarkRecordsRef.current = nextRecords;
    setBookmarkRecords(nextRecords);
    await AsyncStorage.setItem("directory_bookmarks", JSON.stringify(next));
    await AsyncStorage.setItem("directory_bookmark_records", JSON.stringify(nextRecords));
  }

  useFocusEffect(useCallback(() => {
    void savedRetryKey;
    if (!showBookmarks || !bookmarksLoaded) return;
    setSavedEntries(bookmarkRecords.filter((entry) => bookmarks.includes(entry.id)).slice(0, 50));
    setSavedError(false);
    setSavedLoading(false);
  }, [showBookmarks, bookmarksLoaded, bookmarks, bookmarkRecords, savedRetryKey]));

  useFocusEffect(useCallback(() => {
    void retryKey;
    if (!selected) return;
    if (!authReady) {
      setLoading(true);
      setError(false);
      setLoadError("");
      return;
    }
    if (!authUid) {
      setItems([]);
      setLoading(false);
      setError(true);
      setLoadError("লগইন সেশন প্রস্তুত হয়নি");
      return;
    }
    let active = true;
    const loadDirectoryPage = async () => {
      try {
        const result = await getFreshWithCache<Record<string, unknown>>(
          databaseQuery(ref(pathargataDb, `directory/${selected.id}`), limitToFirst(pageLimit + 1)),
          DIRECTORY_CACHE_MAX_AGE_MS,
        );
        if (!active) return;
        const fetchedItems = asItems(result.value);
        const nextItems = fetchedItems.slice(0, pageLimit);
        setItems(nextItems);
        setHasMore(fetchedItems.length > pageLimit);
        const known = new Set(bookmarks);
        if (known.size) {
          const nextRecords = [
            ...bookmarkRecordsRef.current.filter((entry) => entry.categoryId !== selected.id || !known.has(entry.id)),
            ...nextItems.filter((item) => known.has(item.id)).map((item) => ({ id: item.id, categoryId: selected.id, item })),
          ];
          bookmarkRecordsRef.current = nextRecords;
          setBookmarkRecords(nextRecords);
          void AsyncStorage.setItem("directory_bookmark_records", JSON.stringify(nextRecords));
        }
        setError(Boolean(result.error && !result.value));
        setLoadError(result.error?.message || "");
      } catch (loadException) {
        if (!active) return;
        setItems([]);
        setError(true);
        setLoadError(loadException instanceof Error ? loadException.message : "সার্ভার থেকে তথ্য পড়া যায়নি");
      } finally {
        if (active) { setLoading(false); setLoadingMore(false); }
      }
    };
    void loadDirectoryPage();
    return () => { active = false; };
  }, [selected, retryKey, bookmarks, pageLimit, authReady, authUid]));

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [
        item.name,
        item.designation,
        item.details,
        item.address,
        item.specialty,
      ].some((value) => asText(value).toLowerCase().includes(needle)),
    );
  }, [items, query]);
  const openCategory = (item: DirectoryCategory) => {
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setPageLimit(DIRECTORY_PAGE_SIZE);
    setError(false);
    setLoadError("");
    setQuery("");
    // Route params are the single source of truth for deep links and category selection.
    router.replace({ pathname: "/service/directory", params: { category: item.id } } as never);
  };
  const loadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      setLoadingMore(true);
      setPageLimit((value) => value + DIRECTORY_PAGE_SIZE);
    }
  };
  const openBookmarks = () => {
    setSavedEntries([]);
    setSavedError(false);
    setSavedLoading(!bookmarksLoaded || bookmarks.length > 0);
    setShowBookmarks(true);
  };
  const openReview = (item: DirectoryItem, category: DirectoryCategory) => {
    if (!pathargataAuth.currentUser) {
      router.push("/auth");
      return;
    }
    setReviewTarget({
      itemId: item.id,
      categoryId: category.id,
      name: asText(item.name) || "নাম উল্লেখ নেই",
    });
  };
  const savedItems = useMemo(
    () => savedEntries.filter((entry) => bookmarks.includes(entry.id)),
    [savedEntries, bookmarks],
  );
  const grouped = ["প্রশাসনিক দপ্তর", "জরুরি সেবা", "অন্যান্য সেবা"].map(
    (section) => ({
      section,
      data: categories.filter((item) => item.section === section),
    }),
  );

  if (showBookmarks)
    return (
      <ScreenContainer className="bg-background">
        <View className="px-5 pt-3 pb-4 border-b border-border flex-row items-center">
          <Pressable
            onPress={() => setShowBookmarks(false)}
            className="h-10 w-10 rounded-full bg-surface items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="ডিরেক্টরিতে ফিরে যান"
          >
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </Pressable>
          <View className="ml-3 flex-1">
            <Text className="text-xl font-bold text-foreground">
              আমার বুকমার্ক
            </Text>
            <Text className="text-xs text-muted mt-1">
              সংরক্ষিত Directory তথ্য
            </Text>
          </View>
          <View className="h-10 w-10 rounded-full bg-amber-50 items-center justify-center">
            <Ionicons name="bookmark" size={20} color="#D97706" />
          </View>
        </View>
        <FlatList
          data={savedItems}
          keyExtractor={(entry) => `${entry.categoryId}:${entry.id}`}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <Text className="text-sm font-bold text-foreground mb-3">
              {savedItems.length}টি সংরক্ষিত তথ্য
            </Text>
          }
          ListEmptyComponent={
            savedLoading ? (
              <View className="items-center pt-20">
                <ActivityIndicator color="#D97706" size="large" />
                <Text className="text-sm text-muted mt-3">
                  বুকমার্ক লোড হচ্ছে...
                </Text>
              </View>
            ) : savedError ? (
              <View className="items-center pt-20 px-5">
                <Ionicons
                  name="cloud-offline-outline"
                  size={52}
                  color="#CBD5E1"
                />
                <Text className="text-base font-bold text-foreground mt-4">
                  বুকমার্ক লোড করা যায়নি
                </Text>
                <Text className="text-sm text-muted text-center mt-2">
                  ইন্টারনেট বা সার্ভার permission যাচাই করে আবার চেষ্টা করুন।
                </Text>
                <Pressable
                  onPress={() => {
                    setSavedError(false);
                    setSavedLoading(true);
                    setSavedRetryKey((value) => value + 1);
                  }}
                  className="mt-4 rounded-full bg-primary px-5 py-3"
                >
                  <Text className="text-sm font-bold text-white">
                    আবার চেষ্টা করুন
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="items-center pt-20 px-5">
                <Ionicons name="bookmark-outline" size={54} color="#CBD5E1" />
                <Text className="text-base font-bold text-foreground mt-4">
                  {bookmarks.length === 0
                    ? "এখনো কোনো বুকমার্ক নেই"
                    : "সংরক্ষিত তথ্য পাওয়া যায়নি"}
                </Text>
                <Text className="text-sm text-muted text-center mt-2">
                  Directory card-এর বুকমার্ক আইকন থেকে তথ্য সংরক্ষণ করুন।
                </Text>
              </View>
            )
          }
          renderItem={({ item: entry }) => {
            const category = categories.find(
              (candidate) => candidate.id === entry.categoryId,
            );
            if (!category) return null;
            return (
              <DirectoryCard
                item={entry.item as DirectoryItem}
                category={category}
                bookmarked
                onBookmark={() => void toggleBookmark(entry.id, category.id, entry.item as DirectoryItem)}
                onRate={() => openReview(entry.item as DirectoryItem, category)}
              />
            );
          }}
        />
        {reviewTarget ? (
          <DirectoryReviewModal
            target={reviewTarget}
            onClose={() => setReviewTarget(null)}
          />
        ) : null}
      </ScreenContainer>
    );

  if (!selected)
    return (
      <ScreenContainer className="bg-background">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <View className="bg-[#0F5132] px-5 pt-5 pb-8 rounded-b-[36px]">
            <View className="flex-row items-center">
              <Pressable
                onPress={() => safeGoBack("/(tabs)/services")}
                className="h-10 w-10 rounded-full bg-white/15 items-center justify-center"
              >
                <Ionicons name="arrow-back" size={20} color="white" />
              </Pressable>
              <View className="ml-3 flex-1">
                <Text className="text-white text-2xl font-bold">ডিরেক্টরি</Text>
                <Text className="text-green-100 text-xs mt-1">
                  প্রয়োজনীয় মানুষ ও সেবা এক জায়গায়
                </Text>
              </View>
              <Pressable
                onPress={openBookmarks}
                className="h-10 w-10 rounded-full bg-white/15 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="আমার বুকমার্ক খুলুন"
              >
                <Ionicons name="bookmark-outline" size={20} color="white" />
              </Pressable>
            </View>
            <View className="mt-7">
              <Text className="text-green-100 text-xs font-semibold">
                পাথরঘাটা ডিজিটাল
              </Text>
              <Text className="text-white text-xl font-bold mt-1 leading-7">
                বিশ্বস্ত তথ্য, দ্রুত যোগাযোগ
              </Text>
            </View>
          </View>
          <View className="px-5 pt-6">
            {grouped.map((group) => (
              <View key={group.section} className="mb-5">
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-3">
                  {group.section}
                </Text>
                <View className="flex-row flex-wrap justify-between">
                  {group.data.map((item) => (
                    <CategoryTile
                      key={item.id}
                      item={item}
                      onPress={() => openCategory(item)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
    );

  return (
    <ScreenContainer className="bg-background">
      <View className="px-5 pt-3 pb-4 border-b border-border">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              router.replace("/service/directory" as never);
            }}
            className="h-10 w-10 rounded-full bg-surface items-center justify-center"
          >
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </Pressable>
          <View className="ml-3 flex-1">
            <Text className="text-xl font-bold text-foreground">
              {selected.title}
            </Text>
            <Text className="text-xs text-muted mt-1">
              {selected.subtitle} · Live server data
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View
              className="h-10 w-10 rounded-full items-center justify-center"
              style={{ backgroundColor: `${selected.color}18` }}
            >
              <Ionicons name={selected.icon} size={21} color={selected.color} />
            </View>
            <Pressable
              onPress={openBookmarks}
              className="h-10 w-10 rounded-full bg-amber-50 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="আমার বুকমার্ক খুলুন"
            >
              <Ionicons name="bookmark-outline" size={20} color="#D97706" />
            </Pressable>
          </View>
        </View>
        <View className="h-12 rounded-2xl bg-surface border border-border flex-row items-center px-3 mt-4">
          <Ionicons name="search-outline" size={20} color="#94A3B8" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="নাম, পদবী বা ঠিকানা দিয়ে খুঁজুন"
            placeholderTextColor="#94A3B8"
            className="flex-1 ml-2 text-sm text-foreground"
          />
        </View>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/directory-suggest",
              params: {
                categoryId: selected.id,
                itemId: "__new__",
                requestMode: "new",
              },
            } as unknown as Href)
          }
          className="mt-3 min-h-[46px] flex-row items-center justify-center rounded-xl border border-[#B7DCC8] bg-[#F0FBF4] px-3"
          accessibilityRole="button"
          accessibilityLabel={`${selected.title} এর নতুন তথ্য যোগ করার অনুরোধ করুন`}
        >
          <Ionicons name="add-circle-outline" size={18} color="#047857" />
          <Text className="ml-2 text-[12px] font-extrabold text-emerald-700">
            এই ট্যাবে নতুন তথ্য যোগ করার অনুরোধ
          </Text>
        </Pressable>
      </View>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.55}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={{ padding: 20, paddingBottom: 30, flexGrow: 1 }}
        ListHeaderComponent={
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-bold text-foreground">
              {filteredItems.length}টি তথ্য
            </Text>
            {loading ? (
              <ActivityIndicator size="small" color={selected.color} />
            ) : (
              <Text className="text-xs text-muted">রিয়েল-টাইম আপডেট</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center pt-20">
              <ActivityIndicator color={selected.color} size="large" />
              <Text className="text-sm text-muted mt-3">
                {selected.title} এর তথ্য লোড হচ্ছে...
              </Text>
            </View>
          ) : (
            <View className="items-center pt-20">
              <Ionicons
                name={error ? "cloud-offline-outline" : "file-tray-outline"}
                size={58}
                color="#CBD5E1"
              />
              <Text className="text-base font-bold text-foreground mt-4">
                {error ? "তথ্য লোড করা যায়নি" : "এখনও কোনো তথ্য নেই"}
              </Text>
              <Text className="text-sm text-muted text-center mt-2">
                {error
                  ? `ইন্টারনেট, সার্ভার/App Check permission যাচাই করুন। (${loadError || "RTDB listener denied"})`
                  : `সার্ভারে ${selected.title} এর তথ্য যোগ হলে এখানে দেখা যাবে।`}
              </Text>
              {error ? (
                <Pressable
                  onPress={() => {
                    setError(false);
                    setLoadError("");
                    setLoading(true);
                    setRetryKey((value) => value + 1);
                  }}
                  className="mt-4 rounded-full bg-primary px-5 py-3"
                >
                  <Text className="text-sm font-bold text-white">
                    আবার চেষ্টা করুন
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        renderItem={({ item }) => (
          <DirectoryCard
            item={item}
            category={selected}
            bookmarked={bookmarks.includes(item.id)}
            onBookmark={() => void toggleBookmark(item.id, selected.id, item)}
            onRate={() => openReview(item, selected)}
          />
        )}
        ListFooterComponent={loadingMore ? <View className="items-center py-4"><ActivityIndicator color={selected.color} /><Text className="mt-2 text-xs text-muted">আরও তথ্য লোড হচ্ছে...</Text></View> : hasMore ? <Text className="py-3 text-center text-xs text-muted">আরও তথ্য দেখতে scroll করুন</Text> : null}
      />
      {reviewTarget ? (
        <DirectoryReviewModal
          target={reviewTarget}
          onClose={() => setReviewTarget(null)}
        />
      ) : null}
    </ScreenContainer>
  );
}
