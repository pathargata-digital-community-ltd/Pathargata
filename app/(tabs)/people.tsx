import { Ionicons } from "@expo/vector-icons";
import { getFreshWithCache } from "@/lib/rtdb-cache";
import { endAt, get, limitToFirst, orderByChild, orderByKey, ref, query, startAt } from "firebase/database";
import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, Text, TextInput, TouchableOpacity, View, type ViewToken } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { acceptFriendRequest, cancelFriendRequest, deleteFriendRequest, listenFriendRequests, sendFriendRequest, unfriend, type FriendshipStatus, type SocialProfile } from "@/lib/social";
import localPeopleIndex from "@/assets/people-index-safe.json";
import { useRemoteControls } from "@/hooks/use-remote-controls";

type Person = SocialProfile & { uid: string };
type Request = { fromUid: string; fromName?: string; timestamp?: number };
type Filter = "all" | "nearby" | "friends" | "suggested" | "requests";
const PEOPLE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const PEOPLE_PAGE_SIZE = 20;
const PEOPLE_FOCUS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RELATIONSHIP_STATUS_REFRESH_INTERVAL_MS = 60 * 1000;
const EMPTY_RELATIONSHIP_STATUSES: Record<string, FriendshipStatus> = {};
const PEOPLE_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };
type DirectoryPath = "people_index" | "users";
type DirectoryCursor = { id: string; orderValue: string } | null;

function peopleFromValue(value: unknown, currentUid: string): Person[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([uid, item]) => ({ uid, ...(item as Omit<Person, "uid">) }))
    .filter((person) => person.uid !== currentUid && person.status !== "deleted" && person.status !== "deactivated");
}

function directoryQuery(path: DirectoryPath, cursor: DirectoryCursor, term: string) {
  const directoryRef = ref(pathargataDb, path);
  if (path === "people_index") {
    const orderField = term ? "searchName" : "sortName";
    const startValue = cursor?.orderValue || term || "";
    return term
      ? query(directoryRef, orderByChild(orderField), startAt(startValue, cursor?.id), endAt(`${term}\uf8ff`), limitToFirst(PEOPLE_PAGE_SIZE + 1))
      : query(directoryRef, orderByChild(orderField), startAt(startValue, cursor?.id), limitToFirst(PEOPLE_PAGE_SIZE + 1));
  }
  return query(directoryRef, orderByKey(), startAt(cursor?.id || ""), limitToFirst(PEOPLE_PAGE_SIZE + 1));
}

export default function PeopleScreen() {
  const { flags } = useRemoteControls();
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<Record<string, Request>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [myUnion, setMyUnion] = useState("");
  const [myVillage, setMyVillage] = useState("");
  const [myProfession, setMyProfession] = useState("");
  const [myFriendIds, setMyFriendIds] = useState<string[]>([]);
  const [relationshipStatuses, setRelationshipStatuses] = useState<Record<string, FriendshipStatus>>({});
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<DirectoryCursor>(null);
  const directoryPathRef = useRef<DirectoryPath>("people_index");
  const localFallbackRef = useRef(false);
  const searchRef = useRef("");
  const focusedRef = useRef(false);
  const hasLoadedPageRef = useRef(false);
  const lastDirectoryFetchAtRef = useRef(0);
  const handledReloadKeyRef = useRef(0);
  const hydratedStatusAtRef = useRef(new Map<string, number>());
  const statusRequestsRef = useRef(new Set<string>());
  const friendIdsRef = useRef(new Set<string>());
  const incomingRequestIdsRef = useRef(new Set<string>());
  const visiblePeopleRef = useRef<Person[]>([]);
  const user = pathargataAuth.currentUser;
  const requestCount = Object.keys(requests).length;
  const outgoingCount = Object.values(relationshipStatuses).filter((status) => status === "outgoing").length;

  const hydrateStatuses = useCallback(async (rows: Person[], force = false) => {
    const now = Date.now();
    const pendingRows = rows.filter((person) => {
      const fetchedAt = hydratedStatusAtRef.current.get(person.uid) || 0;
      return !statusRequestsRef.current.has(person.uid) &&
        (force || now - fetchedAt >= RELATIONSHIP_STATUS_REFRESH_INTERVAL_MS);
    });
    if (!pendingRows.length) return;
    pendingRows.forEach((person) => statusRequestsRef.current.add(person.uid));
    const currentUid = pathargataAuth.currentUser?.uid;
    const entries = await Promise.all(pendingRows.map(async (person) => {
      if (friendIdsRef.current.has(person.uid)) return [person.uid, "friend" as FriendshipStatus] as const;
      if (incomingRequestIdsRef.current.has(person.uid)) return [person.uid, "incoming" as FriendshipStatus] as const;
      const outgoing = currentUid
        ? await get(ref(pathargataDb, `friend_requests/${person.uid}/${currentUid}`)).catch(() => null)
        : null;
      return [person.uid, outgoing?.exists() ? "outgoing" as FriendshipStatus : "none" as FriendshipStatus] as const;
    }));
    const fetchedAt = Date.now();
    entries.forEach(([uid]) => {
      statusRequestsRef.current.delete(uid);
      hydratedStatusAtRef.current.set(uid, fetchedAt);
    });
    setRelationshipStatuses((current) => {
      let changed = false;
      const next = { ...current };
      for (const [uid, status] of entries) {
        if (next[uid] !== status) { next[uid] = status; changed = true; }
      }
      return changed ? next : current;
    });
  }, []);
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const visiblePeople = viewableItems.filter((item) => item.isViewable).map((item) => item.item as Person);
    visiblePeopleRef.current = visiblePeople;
    void hydrateStatuses(visiblePeople);
  }, [hydrateStatuses]);
  const viewabilityConfig = PEOPLE_VIEWABILITY_CONFIG;

  const loadFirstPage = useCallback(async (term = "", force = false) => {
    if (!user) return;
    setLoading(!hasLoadedPageRef.current);
    setError("");
    setCursor(null);
    setHasMore(true);
    searchRef.current = term;
    try {
      let path = directoryPathRef.current;
      let pageResult = await getFreshWithCache<Record<string, unknown>>(
        directoryQuery(path, null, term),
        force ? 0 : PEOPLE_CACHE_MAX_AGE_MS,
      );
      // The lightweight index may not exist yet. Fall back to a bounded users page,
      // never to the complete users collection.
      if (path === "people_index" && !pageResult.value) {
        path = "users";
        directoryPathRef.current = path;
        pageResult = await getFreshWithCache<Record<string, unknown>>(
          directoryQuery(path, null, term),
          force ? 0 : PEOPLE_CACHE_MAX_AGE_MS,
        );
      }
      // Keep the People screen useful while the server-side index is being provisioned.
      // This bundled projection contains only privacy-safe public fields and is used
      // only when both authenticated Firebase directory reads are unavailable.
      if (!pageResult.value) {
        path = "people_index";
        directoryPathRef.current = path;
        localFallbackRef.current = true;
        pageResult = { value: localPeopleIndex as Record<string, unknown>, source: "cache" };
      } else {
        localFallbackRef.current = false;
      }
      const entries = Object.entries(pageResult.value || {}).sort(([aId, a], [bId, b]) => {
        if (path !== "people_index") return aId.localeCompare(bId);
        return String((a as Record<string, unknown>).sortName || aId).localeCompare(String((b as Record<string, unknown>).sortName || bId), "bn");
      }).filter(([, value]) => !term || String((value as Record<string, unknown>).searchName || "").includes(term));
      const pageEntries = entries.slice(0, PEOPLE_PAGE_SIZE);
      const last = pageEntries[pageEntries.length - 1];
      const orderField = path === "people_index" ? (term ? "searchName" : "sortName") : "id";
      const nextCursor = last ? { id: last[0], orderValue: String(orderField === "id" ? last[0] : (last[1] as Record<string, unknown>)[orderField] || last[0]) } : null;
      const [unionResult, villageResult, professionResult, friendsSnapshot] = await Promise.all([
        getFreshWithCache<string>(ref(pathargataDb, `users/${user.uid}/union`), force ? 0 : PEOPLE_CACHE_MAX_AGE_MS),
        getFreshWithCache<string>(ref(pathargataDb, `users/${user.uid}/village`), force ? 0 : PEOPLE_CACHE_MAX_AGE_MS),
        getFreshWithCache<string>(ref(pathargataDb, `users/${user.uid}/profession`), force ? 0 : PEOPLE_CACHE_MAX_AGE_MS),
        get(ref(pathargataDb, `users/${user.uid}/friends`)),
      ]);
      setMyUnion(typeof unionResult.value === "string" ? unionResult.value : "");
      setMyVillage(typeof villageResult.value === "string" ? villageResult.value : "");
      setMyProfession(typeof professionResult.value === "string" ? professionResult.value : "");
      const ownFriends = friendsSnapshot.val() || {};
      const friendIds = Object.keys(ownFriends).filter((friendUid) => Boolean(ownFriends[friendUid]));
      friendIdsRef.current = new Set(friendIds);
      setMyFriendIds(friendIds);
      const firstPeople = peopleFromValue(Object.fromEntries(pageEntries), user.uid);
      setPeople(firstPeople);
      void hydrateStatuses(firstPeople, force);
      hasLoadedPageRef.current = true;
      lastDirectoryFetchAtRef.current = Date.now();
      setCursor(nextCursor);
      setHasMore(entries.length > PEOPLE_PAGE_SIZE);
      if (pageResult.error && !pageResult.value) setError("মানুষের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।");
    } catch {
      setError("মানুষের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [flags.publicProfiles, hydrateStatuses, user]);

  const loadMore = useCallback(async () => {
    if (!user || loading || loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const term = searchRef.current;
      const path = directoryPathRef.current;
      let entries: [string, unknown][];
      if (localFallbackRef.current) {
        entries = Object.entries(localPeopleIndex as Record<string, unknown>)
          .filter(([, value]) => !term || String((value as Record<string, unknown>).searchName || "").includes(term))
          .sort(([aId, a], [bId, b]) => String((a as Record<string, unknown>).sortName || aId).localeCompare(String((b as Record<string, unknown>).sortName || bId), "bn"));
        const cursorIndex = entries.findIndex(([id]) => id === cursor.id);
        entries = cursorIndex >= 0 ? entries.slice(cursorIndex + 1) : entries;
      } else {
        const result = await getFreshWithCache<Record<string, unknown>>(
          directoryQuery(path, cursor, term),
          PEOPLE_CACHE_MAX_AGE_MS,
        );
        entries = Object.entries(result.value || {}).filter(([id]) => id !== cursor.id);
      }
      const pageEntries = entries.slice(0, PEOPLE_PAGE_SIZE);
      const last = pageEntries[pageEntries.length - 1];
      const orderField = path === "people_index" ? (term ? "searchName" : "sortName") : "id";
      const next = peopleFromValue(Object.fromEntries(pageEntries), user.uid);
      void hydrateStatuses(next);
      setPeople((current) => [...current, ...next.filter((item) => !current.some((existing) => existing.uid === item.uid))]);
      setCursor(last ? { id: last[0], orderValue: String(orderField === "id" ? last[0] : (last[1] as Record<string, unknown>)[orderField] || last[0]) } : null);
      setHasMore(entries.length > PEOPLE_PAGE_SIZE);
    } catch {
      setError("আরও সদস্য লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, hydrateStatuses, loading, loadingMore, user]);

  const handleFriendRequests = useCallback((nextRequests: Record<string, Request>) => {
    const previousIncoming = incomingRequestIdsRef.current;
    const nextIncoming = new Set(Object.keys(nextRequests));
    incomingRequestIdsRef.current = nextIncoming;
    const now = Date.now();
    for (const uid of nextIncoming) hydratedStatusAtRef.current.set(uid, now);
    for (const uid of previousIncoming) {
      if (!nextIncoming.has(uid)) hydratedStatusAtRef.current.delete(uid);
    }
    setRequests(nextRequests);
    setRelationshipStatuses((current) => {
      const next = { ...current };
      let changed = false;
      for (const uid of nextIncoming) {
        const status = friendIdsRef.current.has(uid) ? "friend" : "incoming";
        if (next[uid] !== status) { next[uid] = status; changed = true; }
      }
      for (const uid of previousIncoming) {
        if (!nextIncoming.has(uid) && next[uid] === "incoming") {
          next[uid] = friendIdsRef.current.has(uid) ? "friend" : "none";
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  useFocusEffect(useCallback(() => {
    if (!user || reloadKey < 0) { setLoading(false); return; }
    focusedRef.current = true;
    const retryRequested = reloadKey !== handledReloadKeyRef.current;
    if (!hasLoadedPageRef.current || Date.now() - lastDirectoryFetchAtRef.current >= PEOPLE_FOCUS_REFRESH_INTERVAL_MS || retryRequested) {
      handledReloadKeyRef.current = reloadKey;
      void loadFirstPage(searchRef.current, retryRequested);
    }
    void hydrateStatuses(visiblePeopleRef.current, true);
    const requestUnsubscribe = listenFriendRequests(user.uid, handleFriendRequests);
    return () => { focusedRef.current = false; requestUnsubscribe(); };
  }, [handleFriendRequests, hydrateStatuses, loadFirstPage, reloadKey, user]));

  useEffect(() => {
    if (!focusedRef.current || !user) return;
    const timer = setTimeout(() => void loadFirstPage(search.trim().toLowerCase()), 350);
    return () => clearTimeout(timer);
  }, [loadFirstPage, search, user]);

  const refreshDirectory = useCallback(() => {
    if (!user) return;
    setRefreshing(true);
    void loadFirstPage(searchRef.current, true);
  }, [loadFirstPage, user]);
  const handleStatusChange = useCallback((uid: string, nextStatus: FriendshipStatus) => {
    hydratedStatusAtRef.current.set(uid, Date.now());
    if (nextStatus === "friend") friendIdsRef.current.add(uid);
    else friendIdsRef.current.delete(uid);
    if (nextStatus === "incoming") incomingRequestIdsRef.current.add(uid);
    else incomingRequestIdsRef.current.delete(uid);
    setRelationshipStatuses((current) => current[uid] === nextStatus ? current : { ...current, [uid]: nextStatus });
  }, []);

  const renderPerson = useCallback(({ item }: { item: Person }) => (
    <PersonCard person={item} status={relationshipStatuses[item.uid] || "none"} onStatusChange={handleStatusChange} />
  ), [handleStatusChange, relationshipStatuses]);

  const friendIdSet = useMemo(() => new Set(myFriendIds), [myFriendIds]);
  const statusesForFilter = filter === "suggested" || filter === "requests" ? relationshipStatuses : EMPTY_RELATIONSHIP_STATUSES;
  const filtered = useMemo(() => {
    let rows = people;
    if (filter === "nearby") rows = rows.filter((person) => Boolean(myUnion && person.union === myUnion));
    if (filter === "friends") rows = rows.filter((person) => friendIdSet.has(person.uid));
    if (filter === "suggested") rows = rows.filter((person) => !friendIdSet.has(person.uid) && !["friend", "outgoing", "incoming", "self"].includes(statusesForFilter[person.uid] || "none"));
    if (filter === "requests") rows = rows.filter((person) => statusesForFilter[person.uid] === "outgoing");
    const term = search.trim().toLowerCase();
    if (term) rows = rows.filter((person) => `${person.name || ""} ${person.nickname || ""} ${person.village || ""} ${person.union || ""} ${person.profession || ""}`.toLowerCase().includes(term));
    return [...rows].sort((a, b) => {
      if (filter !== "suggested") return (a.name || "").localeCompare(b.name || "", "bn");
      const score = (person: Person) => (person.village && person.village === myVillage ? 5 : 0) + (person.union && person.union === myUnion ? 3 : 0) + (person.profession && myProfession && person.profession === myProfession ? 2 : 0) + (person.isVerified ? 1 : 0);
      return score(b) - score(a) || (a.name || "").localeCompare(b.name || "", "bn");
    });
  }, [people, search, filter, myUnion, myVillage, myProfession, friendIdSet, statusesForFilter]);

  // Suggestions always try to maintain a full batch of 20 eligible people.
  useEffect(() => {
    const shouldLoad = (filter === "suggested" && filtered.length < PEOPLE_PAGE_SIZE) || filter === "requests";
    if (!shouldLoad || !hasMore || loadingMore || loading) return;
    const timer = setTimeout(() => void loadMore(), 0);
    return () => clearTimeout(timer);
  }, [filter, filtered.length, hasMore, loading, loadingMore, loadMore]);

  if (!flags.publicProfiles) return <ScreenContainer className="bg-background px-5"><View className="flex-1 items-center justify-center"><View className="h-20 w-20 items-center justify-center rounded-[28px] bg-surface"><Ionicons name="people-outline" size={37} color="#0A6652" /></View><Text className="mt-5 text-[21px] font-extrabold text-foreground">People discovery সাময়িক বন্ধ</Text><Text className="mt-2 text-center text-[14px] leading-5 text-muted">Super Admin-এর জরুরি settings অনুযায়ী public profile discovery এখন সাময়িকভাবে বন্ধ আছে।</Text></View></ScreenContainer>;

  if (!user) return <ScreenContainer className="bg-background px-5"><View className="flex-1 items-center justify-center"><View className="h-20 w-20 items-center justify-center rounded-[28px] bg-surface"><Ionicons name="people" size={37} color="#0A6652" /></View><Text className="mt-5 text-[21px] font-extrabold text-foreground">আপনার কমিউনিটি</Text><Text className="mt-2 text-center text-[14px] leading-5 text-muted">পরিচিত মানুষ খুঁজুন, বন্ধু হোন এবং এলাকার সঙ্গে যুক্ত থাকুন।</Text><TouchableOpacity className="mt-5 rounded-2xl bg-[#0B2D26] px-6 py-3.5" onPress={() => router.push("/auth")}><Text className="text-[14px] font-bold text-white">লগইন করুন</Text></TouchableOpacity></View></ScreenContainer>;

  return <ScreenContainer className="bg-background">
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.uid}
      showsVerticalScrollIndicator={false}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      contentContainerStyle={{ paddingBottom: 28 }}
      ListHeaderComponent={<>
        <View className="overflow-hidden bg-[#0E4035] px-5 pb-5 pt-4">
          <View className="absolute -right-12 -top-20 h-48 w-48 rounded-full border border-white/10"/><View className="absolute right-3 -top-12 h-32 w-32 rounded-full border border-white/10"/>
          <View className="flex-row items-center justify-between"><View><Text className="text-[11px] font-bold uppercase tracking-[2px] text-[#B8D8C7]">PATHARGATA COMMUNITY</Text><Text className="mt-1 text-[25px] font-extrabold text-white">মানুষ</Text></View><TouchableOpacity onPress={() => router.push("/search")} className="h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-surface/10"><Ionicons name="search" size={20} color="white"/></TouchableOpacity></View>
          <Text className="mt-1 text-[13px] text-[#D4E4DB]">আপনার এলাকার মানুষ ও পরিচিতজন</Text>
          <View className="mt-4 flex-row gap-2"><TouchableOpacity accessibilityRole="button" accessibilityLabel="পাঠানো friend request দেখুন" onPress={() => setFilter("requests")} className="flex-1 flex-row items-center gap-2 rounded-2xl border border-white/15 bg-surface/10 px-3.5 py-2.5"><Ionicons name="paper-plane-outline" size={18} color="#D9E9DF"/><Text className="text-[13px] font-semibold text-white">রিকোয়েস্ট পাঠানো · {outgoingCount}</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push("/friends" as any)} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#D7E8DA] px-3 py-2.5"><Ionicons name="person-add-outline" size={18} color="#174C3F"/><Text className="text-[13px] font-bold text-[#174C3F]">আমার বন্ধুরা</Text></TouchableOpacity></View>
        </View>
        <View className="px-4 pt-4">
          <View className="flex-row items-center rounded-2xl border border-border bg-surface px-3.5 py-1"><Ionicons name="search-outline" size={19} color="#758179"/><TextInput value={search} onChangeText={setSearch} placeholder="নাম, পেশা বা এলাকা খুঁজুন" placeholderTextColor="#98A29B" className="ml-2.5 h-11 flex-1 text-[14px] text-foreground" returnKeyType="search"/><TouchableOpacity onPress={() => setSearch("")} className="h-8 w-8 items-center justify-center">{search ? <Ionicons name="close-circle" size={18} color="#98A29B"/> : <Ionicons name="options-outline" size={18} color="#758179"/>}</TouchableOpacity></View>
          <View className="mt-3 flex-row flex-wrap gap-2">{([{ id: "suggested", label: "আপনার জন্য", icon: "sparkles-outline" }, { id: "nearby", label: "আমার এলাকা", icon: "location-outline" }, { id: "friends", label: "বন্ধুরা", icon: "heart-outline" }, { id: "requests", label: "রিকোয়েস্ট", icon: "paper-plane-outline" }] as const).map((item) => <TouchableOpacity key={item.id} onPress={() => setFilter(item.id)} className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${filter === item.id ? "bg-[#0B2D26]" : "border border-[#E0E7E1] bg-surface"}`}><Ionicons name={item.icon} size={18} color={filter === item.id ? "white" : "#69776E"}/><Text className={`text-[12px] font-bold ${filter === item.id ? "text-white" : "text-[#66746B]"}`}>{item.label}</Text></TouchableOpacity>)}</View>
          {error ? <View className="mt-3 flex-row items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5"><Ionicons name="cloud-offline-outline" size={18} color="#B91C1C"/><Text className="flex-1 text-[12px] text-red-800">{error}</Text><TouchableOpacity onPress={() => setReloadKey((value) => value + 1)}><Text className="text-[12px] font-extrabold text-red-700">আবার চেষ্টা করুন</Text></TouchableOpacity></View> : null}
          {requestCount > 0 ? <View className="mt-4 overflow-hidden rounded-[22px] border border-[#F0DFC1] bg-[#FFFCF5]"><View className="flex-row items-center justify-between border-b border-[#F1E7D3] px-4 py-3"><View className="flex-row items-center gap-2"><View className="h-8 w-8 items-center justify-center rounded-xl bg-[#F8E9CA]"><Ionicons name="person-add-outline" size={18} color="#9A6B22"/></View><View><Text className="text-[14px] font-extrabold text-[#46391F]">বন্ধুর অনুরোধ</Text><Text className="text-[11px] text-[#8C7A55]">আপনার সঙ্গে যুক্ত হতে চান</Text></View></View><View className="rounded-full bg-[#F2E2BF] px-2.5 py-1"><Text className="text-[12px] font-extrabold text-[#805A1C]">{requestCount}</Text></View></View>{Object.values(requests).slice(0, 3).map((request) => <RequestRow key={request.fromUid} request={request}/>)}</View> : null}
          <View className="mb-2 mt-5 flex-row items-end justify-between"><View><Text className="text-[16px] font-extrabold text-foreground">আপনার কমিউনিটি</Text><Text className="mt-0.5 text-[12px] text-[#7C8980]">{search || filter !== "all" ? `${filtered.length} জন পাওয়া গেছে` : "মানুষের সঙ্গে পরিচিত হোন"}</Text></View><TouchableOpacity accessibilityLabel="তালিকা রিফ্রেশ করুন" onPress={refreshDirectory} className="h-8 w-8 items-center justify-center rounded-xl bg-surface"><Ionicons name="refresh-outline" size={18} color="#52645A"/></TouchableOpacity></View>
        </View>
      </>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshDirectory} tintColor="#0A6652"/>}
      ListEmptyComponent={<View className="mx-4 mt-5 items-center rounded-[26px] border border-dashed border-[#CFDAD1] bg-surface px-6 py-9"><View className="h-14 w-14 items-center justify-center rounded-[20px] bg-surface"><Ionicons name={loading ? "hourglass-outline" : error ? "cloud-offline-outline" : "search-outline"} size={23} color="#43806A"/></View><Text className="mt-3 text-[15px] font-extrabold text-foreground">{loading ? "তালিকা লোড হচ্ছে" : error ? "তালিকা লোড করা যায়নি" : search ? "কাউকে পাওয়া যায়নি" : "এখানে এখনো কেউ নেই"}</Text><Text className="mt-1 text-center text-[12px] leading-5 text-muted">{loading ? "কমিউনিটির সদস্যদের তথ্য আনা হচ্ছে।" : error ? "ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।" : filter === "suggested" ? "আপনার এলাকা ও profile-এর সঙ্গে মিল আছে এমন মানুষ এখনো পাওয়া যায়নি।" : "নাম বা এলাকার বানান বদলে আবার চেষ্টা করুন।"}</Text>{loading ? <ActivityIndicator color="#0A6652" className="mt-3"/> : error ? <TouchableOpacity onPress={() => setReloadKey((value) => value + 1)} className="mt-3 rounded-xl bg-[#0B2D26] px-4 py-2.5"><Text className="text-[12px] font-bold text-white">আবার চেষ্টা করুন</Text></TouchableOpacity> : null}</View>}
      ListFooterComponent={loadingMore ? <View className="items-center py-4"><ActivityIndicator color="#0A6652" /><Text className="mt-2 text-[12px] text-muted">আরও সদস্য লোড হচ্ছে...</Text></View> : null}
      renderItem={renderPerson}
    />
  </ScreenContainer>;
}

function RequestRow({ request }: { request: Request }) {
  const [busy, setBusy] = useState(false);
  async function respond(accept: boolean) { setBusy(true); try { if (accept) await acceptFriendRequest(request.fromUid); else await deleteFriendRequest(request.fromUid); } catch { /* Live requests remain visible when the write is denied. */ } finally { setBusy(false); } }
  return <View className="flex-row items-center px-4 py-3"><TouchableOpacity onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: request.fromUid } })} className="h-10 w-10 items-center justify-center rounded-[14px] bg-[#F7EDD9]"><Text className="text-[15px] font-extrabold text-[#805A1C]">{(request.fromName || "স").slice(0, 1)}</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: request.fromUid } })} className="ml-2.5 flex-1"><Text numberOfLines={1} className="text-[13px] font-bold text-[#3C3527]">{request.fromName || "একজন সদস্য"}</Text><Text className="mt-0.5 text-[11px] text-[#8C7A55]">আপনাকে বন্ধু হতে অনুরোধ করেছেন</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void respond(true)} className="rounded-xl bg-[#0B2D26] px-3 py-2"><Text className="text-[11px] font-bold text-white">{busy ? "…" : "গ্রহণ"}</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void respond(false)} className="ml-2 h-8 w-8 items-center justify-center rounded-xl bg-surface"><Ionicons name="close" size={18} color="#79857D"/></TouchableOpacity></View>;
}

const PersonCard = memo(function PersonCard({ person, status, onStatusChange }: { person: Person; status: FriendshipStatus; onStatusChange: (uid: string, status: FriendshipStatus) => void }) {
  const [busy, setBusy] = useState(false);
  async function action() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (status === "none") { await sendFriendRequest(person); onStatusChange(person.uid, "outgoing"); }
      else if (status === "outgoing") { await cancelFriendRequest(person.uid); onStatusChange(person.uid, "none"); }
      else if (status === "incoming") { await acceptFriendRequest(person.uid); onStatusChange(person.uid, "friend"); }
      else if (status === "friend") { await unfriend(person.uid); onStatusChange(person.uid, "none"); }
    } catch { /* Keep current relationship state if Firebase rejects the operation. */ }
    finally { setBusy(false); }
  }
  const relationLabel = status === "friend" ? "বন্ধু" : status === "outgoing" ? "পাঠানো হয়েছে" : status === "incoming" ? "গ্রহণ করুন" : "বন্ধু হোন";
  const place = [person.village, person.union].filter(Boolean).join(" · ");
  return <View className="mx-4 mb-2.5 overflow-hidden rounded-[22px] border border-border bg-surface">
    <View className="flex-row items-center px-3.5 py-3"><TouchableOpacity onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: person.uid } })} className="relative h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-[18px] border border-border bg-surface">{person.profile_pic ? <Image source={{ uri: person.profile_pic }} className="h-full w-full" resizeMode="cover"/> : <Text className="text-[20px] font-extrabold text-[#0A6652]">{(person.name || "স").slice(0, 1)}</Text>}</TouchableOpacity><TouchableOpacity onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: person.uid } })} className="ml-3 min-w-0 flex-1"><View className="flex-row items-center gap-1"><Text numberOfLines={1} className="shrink text-[15px] font-extrabold text-foreground">{person.name || "Pathargata Member"}</Text>{person.isVerified || person.role === "journalist" ? <Ionicons name="checkmark-circle" size={18} color="#0A8065"/> : null}</View><Text numberOfLines={1} className="mt-1 text-[12px] text-muted">{person.profession || "কমিউনিটি সদস্য"}</Text><View className="mt-1.5 flex-row items-center gap-1"><Ionicons name="location-outline" size={13} color="#9A7A4B"/><Text numberOfLines={1} className="flex-1 text-[11px] text-muted">{place || "পাথরঘাটা কমিউনিটি"}</Text></View></TouchableOpacity><TouchableOpacity accessibilityLabel="প্রোফাইল খুলুন" onPress={() => router.push({ pathname: "/profile/[uid]" as any, params: { uid: person.uid } })} className="ml-2 h-9 w-9 items-center justify-center rounded-xl bg-surface"><Ionicons name="chevron-forward" size={18} color="#56665B"/></TouchableOpacity></View>
    {person.bio ? <Text numberOfLines={2} className="mx-3.5 mb-2.5 rounded-xl bg-surface px-3 py-2 text-[12px] leading-[16px] text-muted">{person.bio}</Text> : null}
    <View className="mx-3.5 mb-3 flex-row gap-2"><TouchableOpacity disabled={busy} onPress={() => void action()} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${status === "friend" ? "border border-[#DBE7DE] bg-surface" : status === "outgoing" ? "bg-[#F3F5F3]" : "bg-[#0B2D26]"}`}>{busy ? <ActivityIndicator size="small" color="#24624F"/> : <><Ionicons name={status === "friend" ? "checkmark-circle-outline" : status === "outgoing" ? "time-outline" : status === "incoming" ? "person-add-outline" : "person-add"} size={18} color={status === "friend" || status === "outgoing" ? "#496053" : "white"}/><Text className={`text-[12px] font-bold ${status === "friend" || status === "outgoing" ? "text-[#496053]" : "text-white"}`}>{relationLabel}</Text></>}</TouchableOpacity><TouchableOpacity accessibilityLabel="মেসেজ পাঠান" onPress={() => router.push({ pathname: "/messages" as any, params: { uid: person.uid, name: person.name || "User" } })} className="h-[37px] w-[46px] items-center justify-center rounded-xl border border-[#DCE5E8] bg-surface"><Ionicons name="chatbubble-ellipses-outline" size={18} color="#376B7D"/></TouchableOpacity></View>
  </View>;
});
