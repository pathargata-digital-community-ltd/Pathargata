import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import { ref } from "firebase/database";
import { router, useFocusEffect } from "expo-router";
import { useMemo, useState, useCallback } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataDb } from "@/lib/pathargata-firebase";

type ServiceCategory = {
  id: string;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const defaultCategories: ServiceCategory[] = [
  { id: "directory", title: "ডিরেক্টরি", detail: "স্থানীয় মানুষ ও প্রতিষ্ঠান", icon: "people-outline", color: "#2563EB" },
  { id: "blood", title: "রক্তদান", detail: "রক্তদাতা ও জরুরি অনুরোধ", icon: "water-outline", color: "#DC2626" },
  { id: "emergency", title: "জরুরি এলার্ট", detail: "জরুরি তথ্য ও সহায়তা", icon: "warning-outline", color: "#B91C1C" },
  { id: "history_tourism", title: "পর্যটন", detail: "ঘুরে দেখুন পাথরঘাটা", icon: "map-outline", color: "#7C3AED" },
  { id: "transport", title: "পরিবহন", detail: "যাতায়াতের তথ্য", icon: "bus-outline", color: "#0F766E" },
  { id: "education", title: "শিক্ষা", detail: "প্রতিষ্ঠান, টিউটর ও নোটিশ", icon: "school-outline", color: "#CA8A04" },
  { id: "complaints", title: "অভিযোগ", detail: "নাগরিক অভিযোগ জানান", icon: "archive-outline", color: "#DC2626" },
  { id: "market", title: "হাট", detail: "স্থানীয় কেনাবেচা", icon: "storefront-outline", color: "#EA580C" },
  { id: "birth_reg", title: "জন্ম নিবন্ধন", detail: "অনলাইন সরকারি সেবা", icon: "card-outline", color: "#2563EB" },
  { id: "tin_cert", title: "টিন সার্টিফিকেট", detail: "ট্যাক্স সংক্রান্ত সেবা", icon: "document-text-outline", color: "#4F46E5" },
  { id: "agriculture", title: "কৃষি", detail: "কৃষি তথ্য ও সহায়তা", icon: "leaf-outline", color: "#16A34A" },
  { id: "result", title: "বোর্ড রেজাল্ট", detail: "শিক্ষা ফলাফল দেখুন", icon: "ribbon-outline", color: "#DB2777" },
];

const hiddenCategoryIds = new Set(["verification", "profile_verification", "invite", "invite_parent", "crazy"]);

function normalizeCategory(id: string, value: unknown): ServiceCategory {
  const remote = (value || {}) as Partial<ServiceCategory> & { name?: string };
  const fallback = defaultCategories.find((item) => item.id === id);
  const icon = typeof remote.icon === "string" && remote.icon in Ionicons.glyphMap
    ? (remote.icon as keyof typeof Ionicons.glyphMap)
    : fallback?.icon || "grid-outline";
  return {
    id: typeof id === "string" ? id : String(id || "service"),
    title: String(remote.title || remote.name || fallback?.title || id),
    detail: String(remote.detail || fallback?.detail || "স্থানীয় সেবা ও তথ্য"),
    icon,
    color: typeof remote.color === "string" && remote.color.trim() ? remote.color : fallback?.color || "#15803D",
  };
}

export default function ServicesScreen() {
  const [categories, setCategories] = useState<ServiceCategory[]>(defaultCategories);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    const categoriesRef = ref(pathargataDb, "services/categories");
    return onValue(
      categoriesRef,
      (snapshot) => {
        const remote = (snapshot.val() || {}) as Record<string, unknown>;
        const ids = Array.from(new Set([...defaultCategories.map((item) => item.id), ...Object.keys(remote)]));
        setCategories(
          ids
            .map((id) => normalizeCategory(id, remote[id]))
            .filter((item) => !hiddenCategoryIds.has(item.id.toLowerCase()) && item.title.trim().toLowerCase() !== "crazy"),
        );
        setFailed(false);
        setLoading(false);
      },
      () => {
        setCategories(defaultCategories);
        setFailed(true);
        setLoading(false);
      },
      { maxAgeMs: 10 * 60 * 1000 },
    );
  }, []));

  const subtitle = useMemo(
    () => (failed ? "অফলাইন তালিকা দেখানো হচ্ছে" : "প্রয়োজনীয় local service এক জায়গায়"),
    [failed],
  );

  const openService = (item: ServiceCategory) => {
    if (item.id === "directory") {
      router.push("/service/directory" as any);
      return;
    }
    const routes: Record<string, string> = {
      emergency: "/emergency",
      blood: "/service/blood",
      transport: "/service/transport",
      education: "/service/education",
      history_tourism: "/service/tourism",
      market: "/service/market",
      complaints: "/service/complaints",
      verification: "/verification",
      invite: "/invite",
    };
    const route = routes[item.id];
    if (route) {
      router.push(route as any);
      return;
    }
    const externalLinks: Record<string, string> = {
      birth_reg: "https://bdris.gov.bd/",
      tin_cert: "https://secure.incometax.gov.bd/TINHome",
      result: "https://eboardresults.com/v2/home",
    };
    const externalLink = externalLinks[item.id];
    if (externalLink) {
      void Linking.openURL(externalLink);
      return;
    }
    router.push({
      pathname: "/service/[category]" as any,
      params: { category: item.id, title: item.title },
    });
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
        <Text className="text-2xl font-bold text-foreground">সেবা</Text>
        <Text className="text-sm text-muted mt-1 mb-6">{subtitle}</Text>
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#15803D" />
            <Text className="text-sm text-muted mt-3">সেবার তালিকা লোড হচ্ছে...</Text>
          </View>
        ) : null}
        <View className="gap-3">
          {categories.map((item) => (
            <TouchableOpacity
              key={item.id}
              className="rounded-3xl bg-surface border border-border p-4 flex-row items-center active:opacity-80"
              onPress={() => openService(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title} সেবা খুলুন`}
            >
              <View className="h-14 w-14 rounded-2xl items-center justify-center" style={{ backgroundColor: `${item.color}18` }}>
                <Ionicons name={item.icon} size={26} color={item.color} />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-base font-bold text-foreground">{item.title}</Text>
                <Text className="text-sm text-muted mt-1">{item.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
