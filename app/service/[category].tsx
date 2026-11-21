import { safeGoBack } from "@/lib/safe-navigation";
import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import { ref } from "firebase/database";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useState, useCallback } from "react";
import { ActivityIndicator, FlatList, Image, Linking, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataDb } from "@/lib/pathargata-firebase";

type ServiceItem = {
  id: string;
  kind: string;
  title: string;
  details?: string;
  image?: string;
  images?: string[];
  phone?: string;
  address?: string;
  website?: string;
  bloodGroup?: string;
  hidePhone?: boolean;
  available?: boolean;
  meta?: string;
};

type RecordValue = Record<string, unknown>;

function records(value: unknown): [string, RecordValue][] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).filter(([, item]) => Boolean(item && typeof item === "object")) as [string, RecordValue][];
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function imageList(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : [];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).filter((item): item is string => typeof item === "string" && item.length > 0);
}

function ageInDays(date: string) {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? Math.floor((Date.now() - parsed) / 86400000) : 0;
}

function genericItems(value: unknown): ServiceItem[] {
  return records(value).map(([id, item]) => ({
    id,
    kind: "generic",
    title: text(item.title || item.name) || "সেবা তথ্য",
    details: text(item.details || item.description || item.desc || item.content),
    image: text(item.image) || undefined,
    phone: text(item.phone) || undefined,
    address: text(item.address) || undefined,
    website: text(item.website) || undefined,
  }));
}

export default function ServiceDetailScreen() {
  const { category, title } = useLocalSearchParams<{ category: string; title?: string }>();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(Boolean(category));
  const [error, setError] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!category) return;
    if (category === "history_tourism") {
      router.replace("/service/tourism" as never);
      return;
    }
    let active = true;

    const replaceGroup = (kind: string, next: ServiceItem[]) => {
      if (!active) return;
      setItems((current) => [...current.filter((item) => item.kind !== kind), ...next]);
      setLoading(false);
    };
    const watch = (path: string, kind: string, mapper: (value: unknown) => ServiceItem[]) => onValue(
      ref(pathargataDb, path),
      (snapshot) => replaceGroup(kind, mapper(snapshot.val())),
      () => { if (active) { setError(true); setLoading(false); } },
    );

    if (category === "blood") {
      const donorsUnsubscribe = watch("donors_public", "blood", (value) => records(value).map(([id, item]) => {
        const lastDate = text(item.lastDate);
        const available = !lastDate || ageInDays(lastDate) >= 120;
        return { id, kind: "blood", title: text(item.name) || "রক্তদাতা", details: `${text(item.union) || "এলাকা উল্লেখ নেই"}${item.village ? ` · ${text(item.village)}` : ""}`, bloodGroup: text(item.bloodGroup) || "রক্তের গ্রুপ অজানা", hidePhone: true, available, meta: lastDate ? `শেষ দান: ${lastDate}` : "নতুন রক্তদাতা" };
      }));
      const requestsUnsubscribe = watch("blood_requests", "blood_request", (value) => records(value).sort((a, b) => Number(b[1].timestamp || 0) - Number(a[1].timestamp || 0)).map(([id, item]) => ({ id, kind: "blood_request", title: `${text(item.bloodGroup) || "রক্ত"} প্রয়োজন`, details: `${text(item.location) || "স্থান উল্লেখ নেই"}${item.details ? ` · ${text(item.details)}` : ""}`, meta: text(item.name) || "জরুরি অনুরোধ" })));
      return () => { active = false; donorsUnsubscribe(); requestsUnsubscribe(); };
    }

    if (category === "transport") {
      const rentUnsubscribe = watch("transport/rent_a_car", "rent_a_car", (value) => records(value).map(([id, item]) => ({ id, kind: "rent_a_car", title: text(item.driverName) || "রেন্ট-এ-কার চালক", details: `${text(item.carModel) || "গাড়ির তথ্য নেই"}${item.details ? ` · ${text(item.details)}` : ""}`, phone: text(item.phone) || undefined, address: text(item.village) || undefined, meta: "রেন্ট-এ-কার" })));
      const busUnsubscribe = watch("transport/bus", "bus", (value) => records(value).map(([id, item]) => ({ id, kind: "bus", title: text(item.name) || "বাস সার্ভিস", details: text(item.counterName) || "কাউন্টার তথ্য নেই", phone: text(item.phone) || undefined, website: text(item.website) || undefined, meta: "বাস" })));
      return () => { active = false; rentUnsubscribe(); busUnsubscribe(); };
    }

    if (category === "market") {
      const shopsUnsubscribe = watch("market_shops", "market_shop", (value) => records(value).map(([id, item]) => ({ id, kind: "market_shop", title: text(item.name) || "দোকান", details: text(item.desc) || text(item.category), phone: text(item.phone) || undefined, address: text(item.address) || undefined, image: text(item.logo) || undefined, meta: "দোকান" })));
      const productsUnsubscribe = watch("market_items", "market_product", (value) => records(value).map(([id, item]) => ({ id, kind: "market_product", title: text(item.title) || "পণ্য", details: `${text(item.price) || "দাম উল্লেখ নেই"}${item.desc ? ` · ${text(item.desc)}` : ""}`, images: imageList(item.images || item.image), phone: text(item.phone) || undefined, meta: text(item.seller) || "পণ্য" })));
      return () => { active = false; shopsUnsubscribe(); productsUnsubscribe(); };
    }

    if (category === "education") {
      const institutionUnsubscribe = watch("services/education/institutions", "institution", (value) => records(value).map(([id, item]) => ({ id, kind: "institution", title: text(item.name) || "শিক্ষা প্রতিষ্ঠান", details: text(item.head) ? `প্রধান: ${text(item.head)}` : "", phone: text(item.phone) || undefined, address: text(item.address) || undefined, meta: "প্রতিষ্ঠান" })));
      const tutorUnsubscribe = watch("services/education/tutors", "tutor", (value) => records(value).map(([id, item]) => ({ id, kind: "tutor", title: text(item.name) || "টিউটর", details: [text(item.classes), text(item.qualification)].filter(Boolean).join(" · "), phone: text(item.phone) || undefined, meta: "টিউটর" })));
      const noticeUnsubscribe = watch("services/education/notices", "education_notice", (value) => records(value).map(([id, item]) => ({ id, kind: "education_notice", title: text(item.title) || "শিক্ষা নোটিশ", details: text(item.desc), meta: text(item.tag) || "নোটিশ" })));
      return () => { active = false; institutionUnsubscribe(); tutorUnsubscribe(); noticeUnsubscribe(); };
    }

    if (category === "directory") {
      const unsubscribe = watch("directory", "directory", (value) => records(value).flatMap(([group, groupValue]) => records(groupValue).map(([id, item]) => ({ id: `${group}-${id}`, kind: "directory", title: text(item.name || item.title) || "ডিরেক্টরি তথ্য", details: text(item.designation || item.details || item.specialty), phone: text(item.phone) || undefined, address: text(item.address) || undefined, image: text(item.profile_pic || item.image) || undefined, meta: group }))));
      return () => { active = false; unsubscribe(); };
    }

    if (category === "emergency") {
      const unsubscribe = watch("emergency_alerts", "emergency", (value) => records(value).sort((a, b) => Number(b[1].timestamp || 0) - Number(a[1].timestamp || 0)).map(([id, item]) => ({ id, kind: "emergency", title: text(item.title) || "জরুরি এলার্ট", details: text(item.desc), meta: text(item.type) || "জরুরি" })));
      return () => { active = false; unsubscribe(); };
    }

    const unsubscribe = watch(`services/data/${category}`, "generic", genericItems);
    return () => { active = false; unsubscribe(); };
  }, [category]));

  const openLink = (url: string) => { void Linking.openURL(url); };

  return (
    <ScreenContainer className="bg-background">
      <View className="px-5 pt-3 pb-4 flex-row items-center border-b border-border">
        <TouchableOpacity className="h-10 w-10 rounded-full bg-surface items-center justify-center" onPress={() => safeGoBack("/(tabs)/services")} accessibilityRole="button" accessibilityLabel="পেছনে যান"><Ionicons name="arrow-back" size={21} color="#334155" /></TouchableOpacity>
        <View className="ml-3 flex-1"><Text className="text-xl font-bold text-foreground" numberOfLines={1}>{title || "সেবা"}</Text><Text className="text-xs text-muted mt-1">Live server data</Text></View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={{ padding: 20, paddingBottom: 30, flexGrow: 1 }}
        ListEmptyComponent={loading ? <View className="items-center pt-24"><ActivityIndicator color="#15803D" /><Text className="text-sm text-muted mt-3">সেবার তথ্য লোড হচ্ছে...</Text></View> : <View className="items-center pt-24"><Ionicons name={error ? "cloud-offline-outline" : "folder-open-outline"} size={58} color="#CBD5E1" /><Text className="text-base font-bold text-foreground mt-4">{error ? "তথ্য লোড করা যায়নি" : "তথ্য যুক্ত করা হয়নি"}</Text><Text className="text-sm text-muted text-center mt-2">সার্ভার data path বা rules যাচাই করুন।</Text></View>}
        renderItem={({ item }) => (
          <View className="rounded-3xl bg-surface border border-border overflow-hidden mb-4">
            {item.images?.length ? <View className="flex-row flex-wrap gap-2 p-3">{item.images.slice(0, 4).map((uri) => <Image key={uri} source={{ uri }} className="w-[48%] h-32 rounded-2xl" resizeMode="cover" />)}</View> : item.image ? <Image source={{ uri: item.image }} className="w-full h-40" resizeMode="cover" /> : null}
            <View className="p-4 flex-row items-center"><View className="flex-1 pr-3"><View className="flex-row items-center gap-2"><Text className="text-base font-bold text-foreground">{item.title}</Text>{item.meta ? <Text className="text-[12px] text-primary bg-green-50 px-2 py-1 rounded-full">{item.meta}</Text> : null}</View>{item.bloodGroup ? <Text className="text-lg font-bold text-red-600 mt-2">{item.bloodGroup}</Text> : null}{item.details ? <Text className="text-sm text-muted mt-2 leading-5">{item.details}</Text> : null}{item.address ? <Text className="text-xs text-muted mt-2">{item.address}</Text> : null}{item.kind === "blood" ? <Text className={`text-xs mt-2 ${item.available ? "text-green-700" : "text-red-600"}`}>{item.available ? "রক্তদানের জন্য উপলব্ধ" : "গত ১২০ দিনে রক্ত দিয়েছেন"}</Text> : null}</View>{item.phone && !(item.kind === "blood" && item.hidePhone) ? <TouchableOpacity className="h-11 w-11 rounded-full bg-primary items-center justify-center" onPress={() => openLink(`tel:${item.phone}`)} accessibilityRole="button" accessibilityLabel={`${item.title}-এ ফোন করুন`}><Ionicons name="call" size={20} color="white" /></TouchableOpacity> : null}</View>
            {item.website ? <TouchableOpacity className="mx-4 mb-4 rounded-2xl bg-green-50 py-3 items-center" onPress={() => openLink(item.website!.startsWith("http") ? item.website! : `https://${item.website}`)}><Text className="text-sm font-bold text-primary">ওয়েবসাইট / টিকিট দেখুন</Text></TouchableOpacity> : null}
          </View>
        )}
      />
    </ScreenContainer>
  );
}
