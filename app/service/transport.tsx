import { safeGoBack } from "@/lib/safe-navigation";
import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import { limitToLast, query, ref } from "firebase/database";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Linking, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

type CategoryId = "local" | "bus" | "car" | "water";
type TransportItem = {
  id: string;
  kind: CategoryId | "cng" | "auto" | "motorcycle";
  title: string;
  vehicleType: string;
  serviceArea?: string;
  route?: string;
  details?: string;
  fare?: string;
  availability?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  location?: string;
  village?: string;
  verified?: boolean;
  updatedAt?: number;
};
type RecordValue = Record<string, unknown>;
type Category = { id: CategoryId; label: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; color: string; paths: { path: string; kind: TransportItem["kind"] }[] };

const PAGE_SIZE = 12;
const CATEGORIES: Category[] = [
  { id: "local", label: "স্থানীয় যাতায়াত", subtitle: "CNG · Auto · Motorcycle", icon: "speedometer-outline", color: "#0F766E", paths: [{ path: "transport/cng", kind: "cng" }, { path: "transport/auto_rickshaw", kind: "auto" }, { path: "transport/motorcycle", kind: "motorcycle" }] },
  { id: "bus", label: "দূরপাল্লার বাস", subtitle: "ঢাকা · বরিশাল · বরগুনা", icon: "bus-outline", color: "#15803D", paths: [{ path: "transport/bus", kind: "bus" }] },
  { id: "car", label: "রেন্ট-এ-কার", subtitle: "Car · Microbus · Pickup", icon: "car-sport-outline", color: "#7C3AED", paths: [{ path: "transport/rent_a_car", kind: "car" }] },
  { id: "water", label: "নৌপথ ও ঘাট", subtitle: "ঘাটের তথ্য ও notice", icon: "boat-outline", color: "#0369A1", paths: [{ path: "transport/waterway", kind: "water" }, { path: "transport/launch", kind: "water" }, { path: "transport/boat", kind: "water" }] },
];

const localKinds = new Set(["cng", "auto", "motorcycle"]);
function rows(value: unknown): [string, RecordValue][] { return value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).filter(([, item]) => Boolean(item && typeof item === "object")) as [string, RecordValue][] : []; }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function bool(value: unknown) { return value === true || value === "true" || value === 1; }
function mapRecord(id: string, raw: RecordValue, kind: TransportItem["kind"]): TransportItem {
  const vehicleType = kind === "cng" ? "CNG" : kind === "auto" ? "Auto Rickshaw" : kind === "motorcycle" ? "Motorcycle" : kind === "bus" ? "দূরপাল্লার বাস" : kind === "water" ? "নৌপথ" : text(raw.carModel) || "রেন্ট-এ-কার";
  const title = text(raw.driverName || raw.name || raw.ownerName || raw.providerName) || (kind === "bus" ? "বাস সার্ভিস" : kind === "water" ? "নৌযান / ঘাট" : kind === "car" ? "রেন্ট-এ-কার চালক" : vehicleType);
  const serviceArea = text(raw.serviceArea || raw.area || raw.village || raw.union || raw.counterName);
  const route = text(raw.route || raw.destination || raw.destinations || (kind === "bus" ? raw.counterName : ""));
  const details = text(raw.details || raw.description || raw.desc || raw.schedule);
  return { id, kind, title, vehicleType, serviceArea: serviceArea || undefined, route: route || undefined, details: details || undefined, fare: text(raw.fare || raw.price || raw.estimatedFare) || undefined, availability: text(raw.availability || raw.status) || (bool(raw.available) ? "এখন available" : undefined), phone: text(raw.phone || raw.contact) || undefined, whatsapp: text(raw.whatsapp || raw.whatsappNumber) || undefined, website: text(raw.website || raw.bookingUrl) || undefined, location: text(raw.location || raw.mapUrl) || undefined, village: text(raw.village) || undefined, verified: bool(raw.verified || raw.isVerified), updatedAt: Number(raw.updatedAt || raw.timestamp) || undefined, };
}

function openExternal(url: string, errorMessage = "লিংকটি খোলা যায়নি।") { void Linking.openURL(url).catch(() => Alert.alert("সমস্যা হয়েছে", errorMessage)); }
function normalizeUrl(url: string) { return /^https?:\/\//i.test(url) ? url : `https://${url}`; }

function EmptyState({ category, search, error, onRetry }: { category: Category; search: string; error: string; onRetry: () => void }) {
  if (error) return <View className="items-center px-8 py-16"><Ionicons name="cloud-offline-outline" size={54} color="#CBD5E1" /><Text className="mt-4 text-center text-base font-extrabold text-foreground">তথ্য লোড করা যায়নি</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">ইন্টারনেট বা সার্ভার data path পরীক্ষা করে আবার চেষ্টা করুন।</Text><TouchableOpacity onPress={onRetry} className="mt-5 rounded-2xl bg-[#0F766E] px-5 py-3"><Text className="font-bold text-white">আবার চেষ্টা করুন</Text></TouchableOpacity></View>;
  return <View className="items-center px-8 py-16"><View className="h-16 w-16 items-center justify-center rounded-3xl bg-[#F1F5F3]"><Ionicons name={category.icon} size={32} color="#A8B7AE" /></View><Text className="mt-4 text-center text-base font-extrabold text-foreground">{search ? "কোনো matching তথ্য নেই" : `${category.label}-এর তথ্য এখনো নেই`}</Text><Text className="mt-2 text-center text-sm leading-5 text-muted">{search ? "অন্য keyword দিয়ে খুঁজে দেখুন।" : "তথ্য যুক্ত হলে এখানে দেখা যাবে।"}</Text></View>;
}

function TransportCard({ item, color }: { item: TransportItem; color: string }) {
  const local = localKinds.has(item.kind);
  const whatsapp = item.whatsapp;
  return <View className="mb-3 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"><View className="p-4"><View className="flex-row items-center"><View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}16` }}><Ionicons name={item.kind === "cng" ? "car-outline" : item.kind === "auto" ? "car-sport-outline" : item.kind === "motorcycle" ? "bicycle-outline" : item.kind === "bus" ? "bus-outline" : item.kind === "water" ? "boat-outline" : "car-sport-outline"} size={25} color={color} /></View><View className="ml-3 flex-1"><View className="flex-row items-center gap-2"><Text numberOfLines={1} className="flex-1 text-[15px] font-extrabold text-foreground">{item.title}</Text>{item.verified ? <Ionicons name="checkmark-circle" size={18} color="#0A8065" /> : null}</View><View className="mt-1 flex-row flex-wrap items-center gap-1.5"><Text className="rounded-full px-2 py-1 text-[11px] font-bold" style={{ backgroundColor: `${color}16`, color }}>{item.vehicleType}</Text>{item.availability ? <Text className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-green-700">{item.availability}</Text> : null}</View></View></View>{item.serviceArea || item.route ? <View className="mt-3 rounded-2xl bg-background px-3 py-2.5"><View className="flex-row items-start gap-2">{item.route ? <Ionicons name="swap-horizontal-outline" size={18} color={color} /> : <Ionicons name="location-outline" size={18} color={color} />}<Text className="flex-1 text-[13px] font-semibold leading-4 text-foreground">{item.route || item.serviceArea}</Text></View>{item.route && item.serviceArea ? <Text className="mt-1 pl-6 text-[12px] text-muted">সেবা এলাকা: {item.serviceArea}</Text> : null}</View> : null}{item.details ? <Text className="mt-3 text-[14px] leading-5 text-muted">{item.details}</Text> : null}<View className="mt-3 flex-row flex-wrap items-center gap-2">{item.fare ? <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5"><Ionicons name="cash-outline" size={18} color="#B7791F" /><Text className="text-[12px] font-bold text-amber-700">ভাড়া: {item.fare}</Text></View> : null}{item.village ? <View className="flex-row items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1.5"><Ionicons name="pin-outline" size={18} color="#64748B" /><Text className="text-[12px] font-semibold text-slate-600">{item.village}</Text></View> : null}</View></View><View className="flex-row gap-2 border-t border-border bg-background px-4 py-3">{item.phone ? <TouchableOpacity onPress={() => openExternal(`tel:${item.phone}`, "ফোন করা যায়নি।")} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#0F766E] py-2.5"><Ionicons name="call" size={18} color="white" /><Text className="text-[12px] font-extrabold text-white">কল করুন</Text></TouchableOpacity> : null}{whatsapp ? <TouchableOpacity onPress={() => openExternal(`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`, "WhatsApp খোলা যায়নি।")} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#E9F8EE] py-2.5"><Ionicons name="logo-whatsapp" size={18} color="#16803A" /><Text className="text-[12px] font-extrabold text-green-700">WhatsApp</Text></TouchableOpacity> : null}{item.website ? <TouchableOpacity onPress={() => openExternal(normalizeUrl(item.website || ""), "ওয়েবসাইট খোলা যায়নি।")} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-blue-50 py-2.5"><Ionicons name="open-outline" size={18} color="#2563EB" /><Text className="text-[12px] font-extrabold text-blue-700">বিস্তারিত</Text></TouchableOpacity> : null}{item.location && !local ? <TouchableOpacity onPress={() => openExternal(item.location || "", "লোকেশন খোলা যায়নি।")} className="h-10 w-10 items-center justify-center rounded-xl bg-violet-50"><Ionicons name="map-outline" size={18} color="#7C3AED" /></TouchableOpacity> : null}</View></View>;
}

export default function TransportServiceScreen() {
  const [categoryId, setCategoryId] = useState<CategoryId>("local");
  const [items, setItems] = useState<TransportItem[]>([]);
  const [banners, setBanners] = useState<string[]>([]);
  const [queryText, setQueryText] = useState("");
  const [village, setVillage] = useState("");
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const category = CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0];

  useFocusEffect(useCallback(() => {
    void reloadKey;
    let active = true;
    setLoading(true); setError(""); setItems([]);
    const unsubscribers: (() => void)[] = [];
    const groupedKinds = new Set<string>();
    for (const source of category.paths) {
      const unsubscribe = onValue(query(ref(pathargataDb, source.path), limitToLast(pageLimit)), (snapshot) => {
        if (!active) return;
        groupedKinds.add(source.kind);
        const next = rows(snapshot.val()).map(([id, value]) => mapRecord(id, value, source.kind));
        setItems((current) => [...current.filter((item) => item.kind !== source.kind), ...next].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        setLoading(false);
      }, () => { if (active) { setError("এই category-এর তথ্য এখন পাওয়া যাচ্ছে না।"); setLoading(false); } });
      unsubscribers.push(unsubscribe);
    }
    const user = pathargataAuth.currentUser;
    const userUnsubscribe = user ? onValue(ref(pathargataDb, `users/${user.uid}`), (snapshot) => { if (active) setVillage(text(snapshot.val()?.village)); }) : undefined;
    const bannerUnsubscribe = onValue(ref(pathargataDb, "admin_settings/transport_banners"), (snapshot) => { if (!active) return; const value = snapshot.val(); setBanners(typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).filter((item): item is string => typeof item === "string") : []); }, () => undefined);
    return () => { active = false; unsubscribers.forEach((unsubscribe) => unsubscribe()); userUnsubscribe?.(); bannerUnsubscribe(); };
  }, [category, pageLimit, reloadKey]));

  const visibleItems = useMemo(() => {
    const term = queryText.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const villageMatch = categoryId !== "local" || !village || !item.village || item.village === village;
      const searchable = [item.title, item.vehicleType, item.serviceArea, item.route, item.details, item.fare, item.village].filter(Boolean).join(" ").toLocaleLowerCase();
      return villageMatch && (!term || searchable.includes(term));
    });
  }, [items, queryText, village, categoryId]);

  function selectCategory(next: CategoryId) { setCategoryId(next); setPageLimit(PAGE_SIZE); setQueryText(""); }
  function loadMore() { if (!loading && items.length >= pageLimit) setPageLimit((value) => value + PAGE_SIZE); }

  return <ScreenContainer className="bg-background"><FlatList data={visibleItems} keyExtractor={(item) => `${item.kind}-${item.id}`} renderItem={({ item }) => <TransportCard item={item} color={category.color} />} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} onEndReached={loadMore} onEndReachedThreshold={0.55} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, flexGrow: 1 }} ListHeaderComponent={<View><View className="flex-row items-center border-b border-border pb-4 pt-3"><TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-surface" onPress={() => safeGoBack("/(tabs)/services")} accessibilityLabel="ফিরে যান"><Ionicons name="arrow-back" size={21} color="#334155" /></TouchableOpacity><View className="ml-3 flex-1"><Text className="text-xl font-extrabold text-foreground">পরিবহন</Text><Text className="mt-1 text-xs text-muted">পাথরঘাটার ভিতরে ও বাইরে যাতায়াত</Text></View><TouchableOpacity onPress={() => router.push("/service/transport-provider" as any)} className="flex-row items-center gap-1.5 rounded-xl bg-[#0F766E] px-3 py-2"><Ionicons name="add-circle-outline" size={18} color="white" /><Text className="text-[12px] font-extrabold text-white">তথ্য দিন</Text></TouchableOpacity></View>{banners.length ? <FlatList horizontal pagingEnabled showsHorizontalScrollIndicator={false} data={banners} keyExtractor={(item, index) => `${item}-${index}`} className="-mx-5 mt-4 h-36" renderItem={({ item }) => <Image source={{ uri: item }} className="w-screen h-36" resizeMode="cover" />} /> : <View className="mt-4 h-32 items-center justify-center rounded-3xl bg-[#E8F5F1]"><Ionicons name="navigate-outline" size={39} color="#0F766E" /><Text className="mt-2 text-sm font-extrabold text-[#115E59]">পাথরঘাটার স্মার্ট যাতায়াত</Text></View>}<View className="mt-4 rounded-2xl border border-[#D6E8E0] bg-[#F3FAF6] px-4 py-3"><Text className="text-[13px] font-extrabold uppercase tracking-[1px] text-[#0F766E]">আজ কোথায় যেতে চান?</Text><Text className="mt-1 text-[12px] leading-4 text-[#567168]">স্থানীয় CNG, Auto ও Motorcycle-এর service area বেছে নিয়ে দ্রুত যোগাযোগ করুন।</Text></View><FlatList horizontal showsHorizontalScrollIndicator={false} data={CATEGORIES} keyExtractor={(item) => item.id} className="-mx-1 mt-4" contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }} renderItem={({ item }) => <TouchableOpacity onPress={() => selectCategory(item.id)} className={`w-[142px] rounded-2xl border p-3 ${categoryId === item.id ? "border-[#0F766E] bg-[#E8F5F1]" : "border-border bg-surface"}`}><View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${item.color}18` }}><Ionicons name={item.icon} size={20} color={item.color} /></View><Text numberOfLines={1} className="mt-2 text-[13px] font-extrabold text-foreground">{item.label}</Text><Text numberOfLines={1} className="mt-1 text-[11px] text-muted">{item.subtitle}</Text></TouchableOpacity>} /><View className="mt-4 flex-row items-center rounded-2xl border border-border bg-surface px-3"><Ionicons name="search-outline" size={19} color="#94A3B8" /><TextInput value={queryText} onChangeText={setQueryText} placeholder={categoryId === "local" && village ? `${village}-এর পরিবহন খুঁজুন` : `${category.label} খুঁজুন`} placeholderTextColor="#94A3B8" className="flex-1 px-2.5 py-3 text-sm text-foreground" /></View>{categoryId === "local" && village ? <Text className="mt-2 text-[12px] text-muted">আপনার profile-এর village: {village}</Text> : null}{error ? <View className="mt-3 flex-row items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5"><Ionicons name="alert-circle-outline" size={18} color="#C24F55" /><Text className="flex-1 text-[13px] leading-4 text-red-800">{error}</Text><TouchableOpacity onPress={() => { setReloadKey((value) => value + 1); }}><Text className="text-[12px] font-extrabold text-red-700">Retry</Text></TouchableOpacity></View> : null}<View className="mb-2 mt-5 flex-row items-center justify-between"><Text className="text-base font-extrabold text-foreground">{category.label}</Text><Text className="text-[12px] text-muted">{visibleItems.length}টি তথ্য</Text></View></View>} ListEmptyComponent={loading ? <View className="items-center py-16"><ActivityIndicator color={category.color} /><Text className="mt-3 text-sm text-muted">{category.label} লোড হচ্ছে...</Text></View> : <EmptyState category={category} search={queryText} error={error} onRetry={() => setReloadKey((value) => value + 1)} />} ListFooterComponent={loading && items.length > 0 ? <View className="items-center py-4"><ActivityIndicator color={category.color} /><Text className="mt-2 text-[12px] text-muted">আরও তথ্য লোড হচ্ছে...</Text></View> : <TouchableOpacity onPress={() => router.push("/service/transport-provider" as any)} className="mt-2 rounded-2xl border border-[#BFE1D3] bg-[#F0FBF4] py-3.5"><Text className="text-center text-[13px] font-extrabold text-[#0F766E]">Provider হিসেবে আপনার পরিবহন service যুক্ত করার আবেদন করুন</Text></TouchableOpacity>} /></ScreenContainer>;
}
