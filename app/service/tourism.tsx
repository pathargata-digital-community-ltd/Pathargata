import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { get, push, ref } from "firebase/database";
import { router, useFocusEffect } from "expo-router";
import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, FlatList, Linking, Pressable, RefreshControl, Share, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { TourismContributionModal, type TourismContribution, type TourismContributionKind } from "@/components/tourism-contribution-modal";
import { TourismPlaceDetails } from "@/components/tourism-place-details";
import { TourismTripPlan, type TourismTripStop } from "@/components/tourism-trip-plan";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { attachTourismDistances, filterTourismPlaces, formatTourismDistance, nearestTourismServices, parseTourismDirectoryServices, parseTourismPlaces, sortTourismPlaces, tourismMapUrl, type TourismCategory, type TourismNearbyService, type TourismPlace, type TourismSort } from "@/lib/tourism";
import { omitUndefinedFields } from "@/lib/rtdb-safe-value";

type ViewMode = "explore" | "favorites";
const categories: { id: TourismCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "all", label: "সব স্থান", icon: "apps-outline" },
  { id: "nature", label: "প্রকৃতি", icon: "leaf-outline" },
  { id: "history", label: "ইতিহাস", icon: "time-outline" },
  { id: "food_resort", label: "খাবার ও রিসোর্ট", icon: "restaurant-outline" },
  { id: "culture", label: "সংস্কৃতি", icon: "color-palette-outline" },
  { id: "family", label: "পরিবার", icon: "people-outline" },
];
const sortOptions: { id: TourismSort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "newest", label: "নতুন", icon: "time-outline" },
  { id: "popular", label: "জনপ্রিয়", icon: "flame-outline" },
  { id: "nearby", label: "কাছাকাছি", icon: "navigate-outline" },
];
const directoryCategories = [
  ["health", "হাসপাতাল/স্বাস্থ্য"], ["doctor", "ডাক্তার"], ["ambulance", "অ্যাম্বুলেন্স"],
  ["police", "থানা পুলিশ"], ["fire", "ফায়ার সার্ভিস"], ["union", "ইউপি অফিস"],
] as const;
function preferenceKey() { return `tourism:preferences:v1:${pathargataAuth.currentUser?.uid || "guest"}`; }
function parsePreferences(raw: string | null): { favorites: string[]; tripStops: TourismTripStop[] } {
  try {
    const value = raw ? JSON.parse(raw) as { favorites?: unknown; tripStops?: unknown } : {};
    const favorites = Array.isArray(value.favorites) ? value.favorites.filter((id): id is string => typeof id === "string") : [];
    const tripStops = Array.isArray(value.tripStops) ? value.tripStops.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || typeof (entry as TourismTripStop).placeId !== "string") return [];
      const stop = entry as TourismTripStop;
      return [{ placeId: stop.placeId, time: typeof stop.time === "string" ? stop.time : "", note: typeof stop.note === "string" ? stop.note : "" }];
    }) : [];
    return { favorites, tripStops };
  } catch { return { favorites: [], tripStops: [] }; }
}
function shortDate(timestamp?: number) { if (!timestamp) return ""; try { return new Date(timestamp).toLocaleDateString("bn-BD"); } catch { return ""; } }

export default function TourismServiceScreen() {
  const [places, setPlaces] = useState<TourismPlace[]>([]);
  const [category, setCategory] = useState<TourismCategory>("all");
  const [sort, setSort] = useState<TourismSort>("newest");
  const [search, setSearch] = useState("");
  const [locality, setLocality] = useState("");
  const [mode, setMode] = useState<ViewMode>("explore");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [tripStops, setTripStops] = useState<TourismTripStop[]>([]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<TourismPlace | null>(null);
  const [nearby, setNearby] = useState<TourismNearbyService[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  const [showTripPlan, setShowTripPlan] = useState(false);
  const [contribution, setContribution] = useState<{ kind: TourismContributionKind; place?: TourismPlace } | null>(null);
  const [notice, setNotice] = useState("");
  const activePlaceId = useRef("");
  const lastScrollY = useRef(0);
  const scrollDirectionDistance = useRef(0);
  const [toolbarProgress] = useState(() => new Animated.Value(1));
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [toolbarNaturalHeight, setToolbarNaturalHeight] = useState(0);

  const updateToolbar = useCallback((visible: boolean) => {
    if (visible === toolbarVisible) return;
    setToolbarVisible(visible);
    Animated.timing(toolbarProgress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 420 : 280,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [toolbarProgress, toolbarVisible]);

  function handleFeedScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const currentY = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = currentY - lastScrollY.current;
    if (Math.sign(delta) !== Math.sign(scrollDirectionDistance.current)) {
      scrollDirectionDistance.current = delta;
    } else {
      scrollDirectionDistance.current += delta;
    }
    if (currentY <= 8) {
      scrollDirectionDistance.current = 0;
      updateToolbar(true);
    } else if (scrollDirectionDistance.current >= 24 && currentY > 40) {
      scrollDirectionDistance.current = 0;
      updateToolbar(false);
    } else if (scrollDirectionDistance.current <= -18) {
      scrollDirectionDistance.current = 0;
      updateToolbar(true);
    }
    lastScrollY.current = currentY;
  }

  useFocusEffect(useCallback(() => {
    void retryKey;
    let active = true;
    setLoading(true);
    setLoadError("");
    const unsubscribe = onValue(ref(pathargataDb, "services/data/history_tourism"), (snapshot) => {
      if (!active) return;
      setPlaces(parseTourismPlaces(snapshot.val()));
      setLoading(false);
      setLoadError("");
    }, (error) => {
      if (!active) return;
      setLoading(false);
      setLoadError(error.message || "পর্যটনের তথ্য আনা যায়নি। ইন্টারনেট ও সার্ভার অনুমতি দেখুন।");
    });
    return () => { active = false; unsubscribe(); };
  }, [retryKey]));

  useFocusEffect(useCallback(() => {
    let active = true;
    void AsyncStorage.getItem(preferenceKey()).then((raw) => {
      if (!active) return;
      const parsed = parsePreferences(raw);
      setFavorites(parsed.favorites);
      setTripStops(parsed.tripStops);
      setPreferenceError("");
      setPreferencesReady(true);
    }).catch(() => {
      if (!active) return;
      setPreferenceError("এই ডিভাইসে পছন্দ ও পরিকল্পনা লোড হয়নি। আবার চেষ্টা করুন।");
      setPreferencesReady(true);
    });
    return () => { active = false; };
  }, []));

  const persistPreferences = useCallback(async (nextFavorites: string[], nextStops: TourismTripStop[]) => {
    try {
      await AsyncStorage.setItem(preferenceKey(), JSON.stringify({ favorites: nextFavorites, tripStops: nextStops }));
      setPreferenceError("");
    } catch { setPreferenceError("তথ্য এই ডিভাইসে সংরক্ষণ হয়নি। জায়গাটি এখন খোলা অবস্থায় থাকবে, পরে আবার চেষ্টা করুন।"); }
  }, []);
  const toggleFavorite = useCallback((id: string) => {
    const next = favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
    setFavorites(next);
    void persistPreferences(next, tripStops);
  }, [favorites, tripStops, persistPreferences]);
  const isInPlan = useCallback((id: string) => tripStops.some((stop) => stop.placeId === id), [tripStops]);
  const toggleTrip = useCallback((id: string) => {
    const next = tripStops.some((stop) => stop.placeId === id) ? tripStops.filter((stop) => stop.placeId !== id) : [...tripStops, { placeId: id, time: "", note: "" }];
    setTripStops(next);
    void persistPreferences(favorites, next);
    setNotice(next.some((stop) => stop.placeId === id) ? "ভ্রমণ পরিকল্পনায় যোগ হয়েছে।" : "পরিকল্পনা থেকে স্থানটি সরানো হয়েছে।");
  }, [tripStops, favorites, persistPreferences]);
  const updateTripStop = useCallback((id: string, field: "time" | "note", value: string) => {
    const next = tripStops.map((stop) => stop.placeId === id ? { ...stop, [field]: value } : stop);
    setTripStops(next);
    void persistPreferences(favorites, next);
  }, [tripStops, favorites, persistPreferences]);
  const moveTripStop = useCallback((id: string, direction: -1 | 1) => {
    const index = tripStops.findIndex((stop) => stop.placeId === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= tripStops.length) return;
    const next = [...tripStops];
    [next[index], next[target]] = [next[target], next[index]];
    setTripStops(next);
    void persistPreferences(favorites, next);
  }, [tripStops, favorites, persistPreferences]);

  const displayPlaces = useMemo(() => attachTourismDistances(places, location || { latitude: 0, longitude: 0 }).map((place) => location ? place : { ...place, distanceKm: undefined }), [places, location]);
  const filtered = useMemo(() => {
    const base = filterTourismPlaces(displayPlaces, { query: search, category, locality });
    const view = mode === "favorites" ? base.filter((place) => favorites.includes(place.id)) : base;
    return sortTourismPlaces(view, sort);
  }, [displayPlaces, search, category, locality, mode, favorites, sort]);

  async function enableNearbySort() {
    if (locationBusy) return;
    setLocationBusy(true); setLocationMessage("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { setLocationMessage("লোকেশন অনুমতি দেওয়া হয়নি। অন্য ক্যাটাগরি/সাজানোর অপশন ব্যবহার করুন।"); return; }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const origin = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setLocation(origin); setSort("nearby"); setLocationMessage("আপনার বর্তমান অবস্থানের ভিত্তিতে সাজানো হয়েছে।");
    } catch { setLocationMessage("আপনার অবস্থান পাওয়া যায়নি। লোকেশন চালু করে আবার চেষ্টা করুন, অথবা অন্য সাজানোর অপশন ব্যবহার করুন।"); }
    finally { setLocationBusy(false); }
  }
  async function loadNearby(place: TourismPlace, retry = false) {
    activePlaceId.current = place.id;
    if (!retry) { setSelectedPlace(place); setNearby([]); }
    setNearbyLoading(true); setNearbyError("");
    const results = await Promise.allSettled(directoryCategories.map(async ([id, kind]) => {
      const snapshot = await get(ref(pathargataDb, `directory/${id}`));
      return parseTourismDirectoryServices(snapshot.val(), kind);
    }));
    if (activePlaceId.current !== place.id) return;
    const services = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const failedReads = results.filter((result) => result.status === "rejected").length;
    setNearby(nearestTourismServices([...place.nearbyServices, ...services], place.latitude !== undefined && place.longitude !== undefined ? { latitude: place.latitude, longitude: place.longitude } : undefined, 8));
    if (failedReads === results.length) setNearbyError("ডিরেক্টরির সেবা লোড করা যায়নি। পরে আবার চেষ্টা করুন।");
    else if (failedReads > 0) setNearbyError("কিছু ডিরেক্টরি ক্যাটাগরি লোড হয়নি; তালিকাটি অসম্পূর্ণ হতে পারে। আবার চেষ্টা করুন।");
    setNearbyLoading(false);
  }
  async function sharePlace(place: TourismPlace) {
    try { await Share.share({ title: place.title, message: `${place.title}\n${place.details}\n${place.address || "পাথরঘাটা"}\n${tourismMapUrl(place)}` }); }
    catch { setNotice("স্থানটি শেয়ার করা যায়নি। আবার চেষ্টা করুন।"); }
  }
  async function submitContribution(payload: TourismContribution) {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); throw new Error("অনুরোধ জমা দিতে লগইন করুন; লগইন শেষে আবার চেষ্টা করুন।"); }
    try {
      const { images, ...contributionFields } = payload;
      const request = omitUndefinedFields({
        ...contributionFields, ...(images.length ? { images } : {}),
        uid: user.uid, author: user.displayName || "পাথরঘাটা ডিজিটাল ব্যবহারকারী",
        timestamp: Date.now(), status: "open", moderationStatus: "pending",
      });
      await push(ref(pathargataDb, "service_requests/tourism"), request);
      setNotice(payload.requestType === "suggestion" ? "স্থান যোগ করার প্রস্তাব পাঠানো হয়েছে। যাচাইয়ের পর প্রকাশ করা হবে।" : payload.requestType === "correction" ? "তথ্য সংশোধনের অনুরোধ পাঠানো হয়েছে।" : payload.requestType === "review" ? "রিভিউটি প্রশাসকের যাচাইয়ের জন্য পাঠানো হয়েছে। অনুমোদনের পর প্রকাশ হবে।" : "রিপোর্ট পাঠানো হয়েছে। পর্যালোচনার পর ব্যবস্থা নেওয়া হবে।");
    } catch (error) {
      throw new Error(error instanceof Error ? `অনুরোধ জমা হয়নি: ${error.message}` : "অনুরোধ জমা হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।");
    }
  }
  function selectSort(value: TourismSort) { if (value === "nearby") { if (location) setSort(value); else void enableNearbySort(); } else { setSort(value); setLocationMessage(""); } }
  const selectedTripPlaces = useMemo(() => {
    const byId = new Map(places.map((place) => [place.id, place]));
    return tripStops.flatMap((stop) => { const place = byId.get(stop.placeId); return place ? [place] : []; });
  }, [places, tripStops]);

  return <ScreenContainer className="bg-background">
    <Animated.View
      pointerEvents={toolbarVisible ? "auto" : "none"}
      style={{
        height: toolbarProgress.interpolate({ inputRange: [0, 1], outputRange: [0, toolbarNaturalHeight] }),
        opacity: toolbarProgress,
        overflow: "hidden",
        transform: [{ translateY: toolbarProgress.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }],
      }}
    >
    <View onLayout={(event) => setToolbarNaturalHeight((current) => Math.abs(current - event.nativeEvent.layout.height) > 1 ? event.nativeEvent.layout.height : current)}>
    <View style={{ minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0", gap: 10 }}>
      <Pressable onPress={() => safeGoBack("/(tabs)/services")} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="পেছনে যান"><Ionicons name="arrow-back" size={22} color="#334155"/></Pressable>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 18, fontWeight: "900", color: "#0F172A" }}>পাথরঘাটা পর্যটন</Text><Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>স্থানীয় গাইড · ভ্রমণ পরিকল্পনা</Text></View>
      <Pressable onPress={() => { setContribution({ kind: "suggestion" }); setNotice(""); }} style={{ width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EDE9FE" }} accessibilityRole="button" accessibilityLabel="নতুন পর্যটন স্থান প্রস্তাব করুন"><Ionicons name="add" size={21} color="#6D28D9"/></Pressable>
      <Pressable onPress={() => setShowTripPlan(true)} style={{ width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#DCFCE7" }} accessibilityRole="button" accessibilityLabel={`আমার ভ্রমণ পরিকল্পনা, ${tripStops.length}টি স্থান`}><Ionicons name="map-outline" size={20} color="#15803D"/>{tripStops.length ? <View style={{ position: "absolute", top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: "#166534", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "white", fontSize: 12, fontWeight: "900" }}>{tripStops.length}</Text></View> : null}</Pressable>
    </View>
    <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
        {([ ["explore", "ঘুরে দেখুন", "compass-outline"], ["favorites", `পছন্দের জায়গা (${favorites.length})`, "heart-outline"] ] as [ViewMode, string, keyof typeof Ionicons.glyphMap][]).map(([id, label, icon]) => { const selected = mode === id; return <Pressable key={id} onPress={() => setMode(id)} accessibilityRole="tab" accessibilityState={{ selected }} style={{ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 13, backgroundColor: selected ? "#6D28D9" : "#F8FAFC", borderWidth: selected ? 1.5 : 1, borderColor: selected ? "#5B21B6" : "#CBD5E1" }}><Ionicons name={id === "favorites" && selected ? "heart" : icon} size={18} color={selected ? "white" : "#475569"}/><Text style={{ fontSize: 14, fontWeight: "800", color: selected ? "white" : "#334155" }}>{label}</Text></Pressable>; })}
      </View>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 5, borderRadius: 15, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "white" }}><Ionicons name="search-outline" size={18} color="#64748B"/><TextInput value={search} onChangeText={setSearch} placeholder="স্থান, ইতিহাস বা বিবরণ খুঁজুন" placeholderTextColor="#64748B" returnKeyType="search" style={{ flex: 1, paddingHorizontal: 9, color: "#0F172A", fontSize: 14 }}/>{search ? <Pressable onPress={() => setSearch("")} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="সার্চ মুছুন"><Ionicons name="close-circle" size={18} color="#64748B"/></Pressable> : null}</View>
      <TextInput value={locality} onChangeText={setLocality} placeholder="এলাকা দিয়ে ছাঁকুন (ঐচ্ছিক)" placeholderTextColor="#64748B" style={{ minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "white", color: "#0F172A", paddingHorizontal: 12, marginTop: 7, fontSize: 14 }}/>
      <FlatList horizontal data={categories} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 8 }} renderItem={({ item }) => { const selected = category === item.id; return <Pressable onPress={() => setCategory(item.id)} accessibilityRole="button" accessibilityState={{ selected }} style={{ minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, borderRadius: 21, backgroundColor: selected ? "#EDE9FE" : "white", borderWidth: selected ? 1.5 : 1, borderColor: selected ? "#7C3AED" : "#CBD5E1" }}><Ionicons name={item.icon} size={16} color={selected ? "#6D28D9" : "#475569"}/><Text style={{ fontSize: 14, fontWeight: "800", color: selected ? "#5B21B6" : "#334155" }}>{item.label}</Text></Pressable>; }}/>
      <View style={{ flexDirection: "row", gap: 7, paddingBottom: 7 }}>{sortOptions.map((option) => { const selected = sort === option.id; const busy = option.id === "nearby" && locationBusy; return <Pressable key={option.id} onPress={() => selectSort(option.id)} disabled={busy} accessibilityRole="button" accessibilityState={{ selected }} style={{ minHeight: 40, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 11, backgroundColor: selected ? "#DCFCE7" : "#F8FAFC", borderWidth: selected ? 1.5 : 1, borderColor: selected ? "#15803D" : "#E2E8F0" }}>{busy ? <ActivityIndicator size="small" color="#15803D"/> : <Ionicons name={option.icon} size={16} color={selected ? "#166534" : "#475569"}/>}<Text style={{ fontSize: 14, fontWeight: "800", color: selected ? "#14532D" : "#334155" }}>{option.label}</Text></Pressable>; })}</View>
      {locationMessage ? <Text style={{ color: location ? "#166534" : "#B91C1C", fontSize: 14, lineHeight: 18, paddingBottom: 5 }}>{locationMessage}</Text> : null}
      {notice ? <View style={{ padding: 10, borderRadius: 12, backgroundColor: "#ECFDF5", marginBottom: 6 }}><Text style={{ color: "#166534", fontSize: 15, fontWeight: "700" }}>{notice}</Text></View> : null}
      {preferenceError ? <Pressable onPress={() => { setPreferencesReady(false); void AsyncStorage.getItem(preferenceKey()).then((raw) => { const parsed = parsePreferences(raw); setFavorites(parsed.favorites); setTripStops(parsed.tripStops); setPreferenceError(""); }).catch(() => setPreferenceError("পছন্দ ও পরিকল্পনা লোড হয়নি। আবার চেষ্টা করুন।")).finally(() => setPreferencesReady(true)); }} style={{ minHeight: 42, justifyContent: "center" }}><Text style={{ color: "#B91C1C", fontSize: 14 }}>{preferenceError} · আবার চেষ্টা করুন</Text></Pressable> : null}
    </View>
    {loadError ? <View style={{ marginHorizontal: 14, marginTop: 8, padding: 14, borderRadius: 16, backgroundColor: "#FEF2F2" }}><Text style={{ color: "#991B1B", lineHeight: 21 }}>পর্যটনের তথ্য লোড হয়নি: {loadError}</Text><Pressable onPress={() => { setLoading(true); setRetryKey((value) => value + 1); }} style={{ minHeight: 46, justifyContent: "center" }} accessibilityRole="button"><Text style={{ color: "#991B1B", fontWeight: "900" }}>আবার চেষ্টা করুন</Text></Pressable></View> : null}
    </View>
    </Animated.View>
    {!preferencesReady && mode === "favorites" ? <View style={{ alignItems: "center", padding: 25 }}><ActivityIndicator color="#6D28D9"/><Text style={{ color: "#64748B", marginTop: 8 }}>পছন্দের তালিকা লোড হচ্ছে…</Text></View> : <FlatList
      key={mode}
      onScroll={handleFeedScroll}
      scrollEventThrottle={16}
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 5, paddingBottom: 30, flexGrow: 1 }}
      initialNumToRender={7}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={70}
      windowSize={5}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); setRetryKey((value) => value + 1); }} tintColor="#7C3AED"/>}
      ListHeaderComponent={<Text style={{ color: "#64748B", fontSize: 14, paddingBottom: 8 }}>{filtered.length}টি স্থান{sort === "nearby" && !location ? " · অবস্থান ছাড়া দূরত্ব সাজানো সম্ভব নয়" : ""}</Text>}
      ListEmptyComponent={loading ? <View style={{ alignItems: "center", paddingTop: 45 }}><ActivityIndicator size="large" color="#7C3AED"/><Text style={{ color: "#64748B", marginTop: 10 }}>পর্যটনের তথ্য আসছে…</Text></View> : <View style={{ alignItems: "center", paddingHorizontal: 22, paddingTop: 45 }}><Ionicons name={loadError ? "cloud-offline-outline" : mode === "favorites" ? "heart-outline" : "map-outline"} size={54} color="#CBD5E1"/><Text style={{ fontSize: 16, fontWeight: "800", color: "#334155", textAlign: "center", marginTop: 12 }}>{loadError ? "তথ্য লোড করা যায়নি" : mode === "favorites" ? "এখনো পছন্দের জায়গা নেই" : "কোনো স্থান পাওয়া যায়নি"}</Text><Text style={{ color: "#64748B", textAlign: "center", lineHeight: 21, marginTop: 6 }}>{mode === "favorites" ? "কোনো স্থানের হৃদয় আইকনে চাপলে এখানে সংরক্ষিত হবে।" : "সার্চ বা ফিল্টার বদলে দেখুন, অথবা নতুন স্থানের প্রস্তাব দিন।"}</Text>{mode === "explore" ? <Pressable onPress={() => setContribution({ kind: "suggestion" })} style={{ minHeight: 44, paddingHorizontal: 13, marginTop: 12, borderRadius: 14, backgroundColor: "#6D28D9", justifyContent: "center" }}><Text style={{ color: "white", fontWeight: "800" }}>নতুন স্থান প্রস্তাব করুন</Text></Pressable> : null}</View>}
      renderItem={({ item }) => <View style={{ marginBottom: 12, borderRadius: 18, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" }}>
        <View style={{ width: "100%", height: 168, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center" }}>
          {item.image ? <ExpoImage source={{ uri: item.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" transition={150} recyclingKey={item.image} accessibilityLabel={item.title}/> : <Ionicons name="map-outline" size={52} color="#A78BFA"/>}
          <Pressable onPress={() => void loadNearby(item)} accessibilityRole="button" accessibilityLabel={`${item.title} বিস্তারিত খুলুন`} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}/>
          <View pointerEvents="none" style={{ position: "absolute", left: 11, bottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, backgroundColor: "rgba(15,23,42,0.74)" }}><Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>{categories.find((entry) => entry.id === item.category)?.label || "স্থানীয় পর্যটন"}</Text></View>
          <Pressable onPress={() => toggleFavorite(item.id)} accessibilityRole="button" accessibilityState={{ selected: favorites.includes(item.id) }} accessibilityLabel={favorites.includes(item.id) ? "পছন্দ থেকে সরান" : "পছন্দে যোগ করুন"} style={{ position: "absolute", right: 10, top: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center" }}><Ionicons name={favorites.includes(item.id) ? "heart" : "heart-outline"} size={21} color={favorites.includes(item.id) ? "#E11D48" : "#475569"}/></Pressable>
        </View>
        <View style={{ padding: 13 }}><Pressable onPress={() => void loadNearby(item)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}><View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><Text style={{ flex: 1, fontSize: 17, fontWeight: "900", color: "#0F172A" }}>{item.title}</Text>{item.verified ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 12, backgroundColor: "#DCFCE7", paddingHorizontal: 7, paddingVertical: 4 }}><Ionicons name="checkmark-circle" size={18} color="#15803D"/><Text style={{ color: "#166534", fontSize: 12, fontWeight: "800" }}>যাচাইকৃত</Text></View> : null}</View><Text style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>{item.locality || item.address || "পাথরঘাটা"}{item.distanceKm !== undefined ? ` · ${formatTourismDistance(item.distanceKm)}` : ""}{item.popularity ? ` · ${item.popularity} জনপ্রিয়তা` : ""}{item.averageRating ? ` · ★ ${item.averageRating.toFixed(1)} (${item.reviewCount || 0})` : ""}</Text></Pressable><Text numberOfLines={3} style={{ color: "#475569", fontSize: 14, lineHeight: 20, marginTop: 8 }}>{item.details}</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}><Pressable onPress={() => void loadNearby(item)} style={{ minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, borderRadius: 12, backgroundColor: "#EDE9FE" }}><Ionicons name="information-circle-outline" size={18} color="#6D28D9"/><Text style={{ color: "#5B21B6", fontWeight: "800" }}>বিস্তারিত</Text></Pressable><Pressable onPress={() => { const url = tourismMapUrl(item); void Linking.openURL(url).catch(() => setNotice("ম্যাপ খোলা যায়নি। আবার চেষ্টা করুন।")); }} style={{ minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, borderRadius: 12, backgroundColor: "#DCFCE7" }}><Ionicons name="navigate-outline" size={18} color="#166534"/><Text style={{ color: "#14532D", fontWeight: "800" }}>ম্যাপ</Text></Pressable><Pressable onPress={() => { setContribution({ kind: "correction", place: item }); setNotice(""); }} style={{ minHeight: 44, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="তথ্য সংশোধনের অনুরোধ"><Ionicons name="create-outline" size={18} color="#475569"/></Pressable></View><Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 7 }}>{item.lastUpdated ? `হালনাগাদ: ${shortDate(item.lastUpdated)}` : "সময়/খরচ নিশ্চিত করতে স্থানীয়ভাবে যোগাযোগ করুন"}</Text></View>
      </View>}
    />}
    <TourismPlaceDetails key={selectedPlace?.id || "no-tourism-place"} visible={Boolean(selectedPlace)} place={selectedPlace} favorite={selectedPlace ? favorites.includes(selectedPlace.id) : false} inPlan={selectedPlace ? isInPlan(selectedPlace.id) : false} nearby={nearby} nearbyLoading={nearbyLoading} nearbyError={nearbyError} onClose={() => { activePlaceId.current = ""; setSelectedPlace(null); }} onToggleFavorite={() => selectedPlace && toggleFavorite(selectedPlace.id)} onTogglePlan={() => selectedPlace && toggleTrip(selectedPlace.id)} onReport={() => selectedPlace && setContribution({ kind: "report", place: selectedPlace })} onReview={() => selectedPlace && setContribution({ kind: "review", place: selectedPlace })} onRetryNearby={() => selectedPlace && void loadNearby(selectedPlace, true)} onShare={() => selectedPlace && void sharePlace(selectedPlace)}/>
    <TourismTripPlan visible={showTripPlan} stops={tripStops} places={selectedTripPlaces} onClose={() => setShowTripPlan(false)} onRemove={(id) => toggleTrip(id)} onMove={moveTripStop} onEdit={updateTripStop}/>
    {contribution ? <TourismContributionModal key={`${contribution.kind}-${contribution.place?.id || "new"}`} visible kind={contribution.kind} place={contribution.place} onClose={() => setContribution(null)} onSubmit={submitContribution}/> : null}
  </ScreenContainer>;
}
