import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import {
  endAt,
  limitToFirst,
  limitToLast,
  orderByChild,
  query as dbQuery,
  ref,
  startAt,
} from "firebase/database";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { getWithCache } from "@/lib/rtdb-cache";

type Result = {
  id: string;
  title?: string;
  name?: string;
  text?: string;
  content?: string;
  description?: string;
  image?: string;
  images?: string[];
  price?: string | number;
  profession?: string;
  village?: string;
  category?: string;
  phone?: string;
  details?: string;
  desc?: string;
  address?: string;
  area?: string;
  location?: string;
  bloodGroup?: string;
  serviceArea?: string;
  lastDate?: string;
  receiveBloodRequestNotifications?: boolean;
  temporarilyUnavailable?: boolean;
  route?: string;
  from?: string;
  to?: string;
  head?: string;
  classes?: string;
  qualification?: string;
  specialty?: string;
  designation?: string;
  kind?: string;
};
type SearchResults = {
  users: Result[];
  posts: Result[];
  market: Result[];
  directory: Result[];
  services: Result[];
};
const EMPTY_RESULTS: SearchResults = {
  users: [],
  posts: [],
  market: [],
  directory: [],
  services: [],
};
const norm = (value: unknown) => String(value || "").toLocaleLowerCase("bn-BD");
const matches = (item: Result, term: string, fields: string[]) =>
  fields.some((field) => norm(item[field as keyof Result]).includes(term));
export default function SearchScreen() {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const searchSequence = useRef(0);
  const search = useCallback(async (value: string) => {
    const requestId = ++searchSequence.current;
    setLoading(true);
    setResults(EMPTY_RESULTS);
    const searchTerm = norm(value);
    const latest = (path: string, field: string) =>
      dbQuery(ref(pathargataDb, path), orderByChild(field), limitToLast(200));
    const queries = [
      dbQuery(ref(pathargataDb, "people_index"), orderByChild("searchName"), startAt(searchTerm), endAt(`${searchTerm}\uf8ff`), limitToFirst(30)),
      latest("posts", "timestamp"),
      latest("market_items", "time"),
      latest("market_shops", "time"),
      ref(pathargataDb, "directory"),
      ref(pathargataDb, "services/data"),
      ref(pathargataDb, "services/categories"),
      ref(pathargataDb, "services/education/institutions"),
      ref(pathargataDb, "services/education/tutors"),
      ref(pathargataDb, "services/education/notices"),
      ref(pathargataDb, "transport/rent_a_car"),
      ref(pathargataDb, "transport/bus"),
      latest("emergency_alerts", "timestamp"),
      latest("notices", "timestamp"),
      dbQuery(ref(pathargataDb, "donors_public"), limitToFirst(200)),
    ];
    const sources: (Record<string, unknown> | null)[] = queries.map(() => null);
    const fields = ["name", "title", "text", "content", "description", "desc", "authorName", "shopName", "profession", "village", "union", "address", "area", "location", "bloodGroup", "category", "details", "route", "from", "to", "counterName", "driverName", "carModel", "head", "classes", "qualification", "specialty", "designation"];

    const publishResults = () => {
      if (searchSequence.current !== requestId) return;
      const raw = sources.map((source) => source || {});
      const makeMatches = (collection: Record<string, unknown>, kind: string, limit = 10) =>
        Object.entries(collection)
          .filter(([, value]) => value && typeof value === "object")
          .map(([id, value]) => ({ ...(value as Result), id, kind }))
          .filter((item) => matches(item, searchTerm, fields))
          .slice(0, limit);
      const users = makeMatches(raw[0], "user", 12).filter((item) => item.id !== pathargataAuth.currentUser?.uid);
      const posts = makeMatches(raw[1], "post", 10).reverse();
      const market = [
        ...makeMatches(raw[2], "product", 8),
        ...makeMatches(raw[3], "shop", 8),
      ].slice(0, 12);
      const directory: Result[] = [];
      Object.entries(raw[4]).forEach(([category, entries]) => {
        if (!entries || typeof entries !== "object") return;
        Object.entries(entries as Record<string, unknown>).forEach(([id, value]) => {
          if (value && typeof value === "object") {
            const item = { ...(value as Result), id: `${category}-${id}`, category, kind: "directory" };
            if (matches(item, searchTerm, fields)) directory.push(item);
          }
        });
      });
      const services: Result[] = [];
      const addRows = (collection: Record<string, unknown>, kind: string, label: string) => {
        for (const item of makeMatches(collection, kind, 10)) services.push({ ...item, category: label });
      };
      addRows(raw[6], "service", "সেবা");
      Object.entries(raw[5]).forEach(([group, entries]) => {
        if (!entries || typeof entries !== "object") return;
        Object.entries(entries as Record<string, unknown>).forEach(([id, value]) => {
          if (value && typeof value === "object") {
            const item = { ...(value as Result), id: `${group}-${id}`, kind: "service", category: group };
            if (matches(item, searchTerm, fields)) services.push(item);
          }
        });
      });
      addRows(raw[7], "education", "শিক্ষা প্রতিষ্ঠান");
      addRows(raw[8], "education", "গৃহশিক্ষক");
      addRows(raw[9], "education", "শিক্ষা নোটিশ");
      addRows(raw[10], "transport", "রেন্ট-এ-কার");
      addRows(raw[11], "transport", "বাস সার্ভিস");
      addRows(raw[12], "emergency", "জরুরি তথ্য");
      addRows(raw[13], "notice", "ঘোষণা");
      const donors = makeMatches(raw[14], "blood", 12).filter((item) => {
        const lastDate = item.lastDate ? Date.parse(item.lastDate) : 0;
        const donationEligible = !lastDate || !Number.isFinite(lastDate) || Date.now() - lastDate >= 120 * 24 * 60 * 60 * 1000;
        return item.receiveBloodRequestNotifications === true && !item.temporarilyUnavailable && Boolean(item.serviceArea?.trim()) && donationEligible;
      });
      for (const donor of donors) services.push({ ...donor, category: "রক্তদাতা" });
      setResults({ users, posts, market, directory: directory.slice(0, 12), services: services.slice(0, 16) });
    };

    try {
      await Promise.all(
        queries.map((query, index) =>
          getWithCache<Record<string, unknown>>(query, (cached) => {
            if (searchSequence.current !== requestId) return;
            sources[index] = cached;
            publishResults();
          }).then(({ value }) => {
            if (searchSequence.current !== requestId) return;
            sources[index] = value;
            publishResults();
          }),
        ),
      );
    } finally {
      if (searchSequence.current === requestId) setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      const value = term.trim();
      if (!value) {
        searchSequence.current += 1;
        setLoading(false);
        setResults(EMPTY_RESULTS);
        return;
      }
      const timer = setTimeout(() => void search(value), 240);
      return () => {
        clearTimeout(timer);
        searchSequence.current += 1;
      };
    }, [search, term]),
  );
  const count = useMemo(
    () => Object.values(results).reduce((sum, items) => sum + items.length, 0),
    [results],
  );
  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 35 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => safeGoBack("/(tabs)")}
            className="h-11 w-11 rounded-full bg-surface border border-border items-center justify-center"
          >
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </Pressable>
          <View className="flex-1 rounded-2xl bg-surface border border-border px-4 py-3 flex-row items-center">
            <Ionicons name="search-outline" size={20} color="#64748B" />
            <TextInput
              autoFocus
              value={term}
              onChangeText={setTerm}
              placeholder="অ্যাপের সবকিছু খুঁজুন"
              placeholderTextColor="#94A3B8"
              className="ml-3 flex-1 text-sm text-foreground"
            />
            <Pressable onPress={() => setTerm("")}>
              <Ionicons name="close-circle" size={19} color="#94A3B8" />
            </Pressable>
          </View>
        </View>
        {!term.trim() ? (
          <View className="pt-8">
            <View className="rounded-3xl bg-[#0B2D26] p-5">
              <View className="h-12 w-12 rounded-2xl bg-white/10 items-center justify-center"><Ionicons name="compass-outline" size={26} color="#BBF7D0" /></View>
              <Text className="text-xl font-extrabold text-white mt-4">এক্সপ্লোর করুন</Text>
              <Text className="text-sm leading-6 text-green-100 mt-2">মানুষ, পোস্ট, দোকান-পণ্য, ডিরেক্টরি, শিক্ষা, পরিবহন, জরুরি সেবা ও রক্তদাতার তথ্য থেকে খুঁজুন। লিখতে শুরু করলেই ফলাফল আসবে।</Text>
            </View>
            <Text className="text-sm font-bold text-foreground mt-6 mb-3">দ্রুত খুঁজুন</Text>
            <View className="flex-row flex-wrap gap-2">
              {[["স্কুল", "school-outline"], ["ডাক্তার", "medkit-outline"], ["বাজার", "storefront-outline"], ["বাস", "bus-outline"], ["রক্ত", "water-outline"], ["জরুরি", "warning-outline"], ["পর্যটন", "map-outline"]].map(([label, icon]) => <Pressable key={label} onPress={() => setTerm(label)} className="flex-row items-center rounded-full border border-border bg-surface px-3.5 py-2.5"><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color="#15803D" /><Text className="ml-2 text-xs font-semibold text-foreground">{label}</Text></Pressable>)}
            </View>
          </View>
        ) : loading && count === 0 ? (
          <View className="items-center pt-24">
            <ActivityIndicator color="#15803D" />
            <Text className="text-sm text-muted mt-3">
              একাধিক source থেকে খোঁজা হচ্ছে...
            </Text>
          </View>
        ) : count === 0 ? (
          <View className="items-center pt-24">
            <Ionicons name="file-tray-outline" size={58} color="#CBD5E1" />
            <Text className="text-base font-bold text-foreground mt-4">
              কিছু পাওয়া যায়নি
            </Text>
            <Text className="text-sm text-muted mt-2">
              অন্য কোনো নাম বা keyword দিয়ে চেষ্টা করুন
            </Text>
          </View>
        ) : (
          <View className="mt-6">
            <Text className="text-xs text-muted mb-4">
              “{term}” এর {count}টি ফলাফল{loading ? " · আপডেট হচ্ছে" : ""}
            </Text>
            <ResultSection
              title="মানুষ"
              icon="people-outline"
              items={results.users}
              onPress={(item) =>
                router.push({
                  pathname: "/profile/[uid]" as any,
                  params: { uid: item.id },
                })
              }
            />
            <ResultSection
              title="পোস্ট"
              icon="newspaper-outline"
              items={results.posts}
              onPress={(item) =>
                router.push({ pathname: "/post/[id]", params: { id: item.id } })
              }
            />
            <ResultSection
              title="হাট / পণ্য"
              icon="storefront-outline"
              items={results.market}
              onPress={() => router.push("/service/market")}
            />
            <ResultSection
              title="ডিরেক্টরি"
              icon="book-outline"
              items={results.directory}
            />
            <ResultSection
              title="সেবা"
              icon="layers-outline"
              items={results.services}
              onPress={() => router.push("/(tabs)/services")}
            />
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
function ResultSection({
  title,
  icon,
  items,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: Result[];
  onPress?: (item: Result) => void;
}) {
  if (!items.length) return null;
  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-3">
        <View className="h-8 w-8 rounded-xl bg-green-100 items-center justify-center">
          <Ionicons name={icon} size={18} color="#15803D" />
        </View>
        <Text className="text-base font-bold text-foreground ml-2">
          {title}
        </Text>
        <Text className="text-xs text-muted ml-2">{items.length}টি</Text>
      </View>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onPress?.(item)}
          className="rounded-2xl bg-surface border border-border p-3 mb-2 flex-row items-center"
        >
          <View className="h-10 w-10 rounded-xl bg-green-50 overflow-hidden items-center justify-center">
            {item.image || item.images?.[0] ? (
              <Image
                source={{ uri: item.image || item.images?.[0] }}
                className="h-full w-full"
              />
            ) : (
              <Ionicons name={icon} size={20} color="#15803D" />
            )}
          </View>
          <View className="flex-1 ml-3">
            <Text
              className="text-sm font-bold text-foreground"
              numberOfLines={1}
            >
              {item.name ||
                item.title ||
                item.content ||
                item.text ||
                item.description ||
                "ফলাফল"}
            </Text>
            <Text className="text-xs text-muted mt-1" numberOfLines={1}>
              {item.profession ||
                item.village ||
                item.category ||
                (item.price ? `৳ ${item.price}` : "Pathargata")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Pressable>
      ))}
    </View>
  );
}
