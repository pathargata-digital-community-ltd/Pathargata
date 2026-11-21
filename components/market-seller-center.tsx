import { useCallback, useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { equalTo, get, orderByChild, push, query, ref, remove, set, update } from "firebase/database";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { uploadImageFromUri } from "@/lib/media-upload";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { parseTakaPrice } from "@/lib/marketplace-catalog";
import { useColors } from "@/hooks/use-colors";

export type MarketShopRecord = { id: string; uid?: string; ownerName?: string; name: string; category?: string; phone?: string; address?: string; desc?: string; logo?: string; time?: number; updatedAt?: number };
export type MarketProductRecord = { id: string; shopId?: string; uid?: string; seller?: string; title: string; price?: string | number; category?: string; desc?: string; images?: string[]; image?: string; stock?: number; availability?: string; time?: number; updatedAt?: number };
type Photo = { uri: string; mimeType?: string | null };
type Kind = "shop" | "product";
const fieldClass = "mb-3 rounded-xl border border-border bg-surface px-4 py-3 text-foreground";

function decodeProducts(value: unknown): MarketProductRecord[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const image = typeof item.image === "string" ? item.image : "";
    const images = Array.isArray(item.images) ? item.images.filter((entry): entry is string => typeof entry === "string") : image ? [image] : [];
    return [{
      id,
      uid: typeof item.uid === "string" ? item.uid : undefined,
      shopId: typeof item.shopId === "string" ? item.shopId : undefined,
      seller: typeof item.seller === "string" ? item.seller : undefined,
      title: typeof item.title === "string" ? item.title : "পণ্য",
      price: typeof item.price === "number" || typeof item.price === "string" ? item.price : undefined,
      category: typeof item.category === "string" ? item.category : undefined,
      desc: typeof item.desc === "string" ? item.desc : undefined,
      image,
      images,
      stock: typeof item.stock === "number" ? item.stock : undefined,
      availability: typeof item.availability === "string" ? item.availability : undefined,
      time: typeof item.time === "number" ? item.time : undefined,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : undefined,
    }];
  });
}

function decodeShops(value: unknown): MarketShopRecord[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    return [{
      id,
      uid: typeof item.uid === "string" ? item.uid : undefined,
      ownerName: typeof item.ownerName === "string" ? item.ownerName : undefined,
      name: typeof item.name === "string" ? item.name : "দোকান",
      category: typeof item.category === "string" ? item.category : undefined,
      phone: typeof item.phone === "string" ? item.phone : undefined,
      address: typeof item.address === "string" ? item.address : undefined,
      desc: typeof item.desc === "string" ? item.desc : undefined,
      logo: typeof item.logo === "string" ? item.logo : undefined,
      time: typeof item.time === "number" ? item.time : undefined,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : undefined,
    }];
  });
}

export function MarketSellerCenter({ visible, uid, userName, shops, products, initialProductId, onClose }: { visible: boolean; uid: string; userName: string; shops: MarketShopRecord[]; products: MarketProductRecord[]; initialProductId?: string | null; onClose: () => void }) {
  const colors = useColors();
  const [kind, setKind] = useState<Kind>("shop");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [keptImages, setKeptImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<MarketProductRecord | null>(null);
  const [queriedShops, setQueriedShops] = useState<MarketShopRecord[]>([]);
  const [queriedProducts, setQueriedProducts] = useState<MarketProductRecord[]>([]);
  const [ownerProductsLoading, setOwnerProductsLoading] = useState(false);
  const [ownerProductsError, setOwnerProductsError] = useState("");
  const ownedShops = useMemo(() => {
    const rows = new Map<string, MarketShopRecord>();
    for (const shop of [...shops, ...queriedShops]) if (shop.uid === uid) rows.set(shop.id, shop);
    return [...rows.values()];
  }, [shops, queriedShops, uid]);
  const shopIds = useMemo(() => new Set(ownedShops.map(s => s.id)), [ownedShops]);
  const ownedProducts = useMemo(() => {
    const rows = new Map<string, MarketProductRecord>();
    for (const product of [...products, ...queriedProducts]) if (product.uid === uid || (!!product.shopId && shopIds.has(product.shopId))) rows.set(product.id, product);
    return [...rows.values()];
  }, [products, queriedProducts, uid, shopIds]);

  useEffect(() => {
    if (!visible || !uid) return;
    let active = true;
    async function loadOwnedProducts() {
      await Promise.resolve();
      if (!active) return;
      setOwnerProductsLoading(true);
      setOwnerProductsError("");
      try {
        const [ownedShopSnapshot, byOwner] = await Promise.all([
          get(query(ref(pathargataDb, "market_shops"), orderByChild("uid"), equalTo(uid))),
          get(query(ref(pathargataDb, "market_items"), orderByChild("uid"), equalTo(uid))),
        ]);
        const loadedShops = decodeShops(ownedShopSnapshot.val()).filter(shop => shop.uid === uid);
        if (!active) return;
        setQueriedShops(loadedShops);
        const records = new Map<string, MarketProductRecord>();
        for (const row of decodeProducts(byOwner.val())) records.set(row.id, row);
        setQueriedProducts([...records.values()]);
      } catch (loadError) {
        if (active) setOwnerProductsError(loadError instanceof Error ? loadError.message : "আপনার পণ্যের তালিকা লোড করা যায়নি।");
      } finally {
        if (active) setOwnerProductsLoading(false);
      }
    }
    void loadOwnedProducts();
    return () => { active = false; };
  }, [visible, uid, shops]);
  function reset() { setEditing(null); setForm({}); setPhotos([]); setKeptImages([]); setError(""); setSuccessMessage(""); }
  const startEdit = useCallback((type: Kind, id: string) => {
    const row = type === "shop" ? ownedShops.find(s => s.id === id) : ownedProducts.find(p => p.id === id);
    if (!row) return;
    setKind(type); setEditing(id); setPhotos([]);
    if (type === "shop") { const s = row as MarketShopRecord; setForm({ name: s.name || "", category: s.category || "", phone: s.phone || "", address: s.address || "", desc: s.desc || "" }); setKeptImages(s.logo ? [s.logo] : []); }
    else { const p = row as MarketProductRecord; setForm({ title: p.title || "", price: String(p.price ?? ""), category: p.category || "", desc: p.desc || "", stock: p.stock == null ? "" : String(p.stock), availability: p.availability === "unavailable" || p.availability === "paused" || p.stock === 0 ? "unavailable" : "available", shopId: p.shopId || "" }); setKeptImages(p.images?.length ? p.images : p.image ? [p.image] : []); }
    setError("");
    setSuccessMessage("");
  }, [ownedProducts, ownedShops]);
  useEffect(() => {
    if (!visible || !initialProductId || ownerProductsLoading || editing === initialProductId) return;
    if (!ownedProducts.some((product) => product.id === initialProductId)) return;
    const timer = setTimeout(() => startEdit("product", initialProductId), 0);
    return () => clearTimeout(timer);
  }, [visible, initialProductId, ownerProductsLoading, ownedProducts, editing, startEdit]);
  async function choosePhotos() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError("ছবি বাছতে গ্যালারির অনুমতি দিন।"); return; }
      const max = kind === "shop" ? 1 : 4;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: kind === "product", selectionLimit: Math.max(1, max - keptImages.length - photos.length), quality: 0.8 });
      if (!result.canceled) setPhotos(current => [...current, ...result.assets.slice(0, max - keptImages.length - current.length).map(a => ({ uri: a.uri, mimeType: a.mimeType }))]);
    } catch { setError("গ্যালারি খোলা যায়নি। আবার চেষ্টা করুন।"); }
  }
  async function save() {
    if (saving) return;
    if (pathargataAuth.currentUser?.uid !== uid) { setError("আপনার অ্যাকাউন্ট যাচাই করা যায়নি। আবার প্রবেশ করুন।"); return; }
    const field = (key: string) => typeof form[key] === "string" ? form[key].trim() : "";
    const title = field(kind === "shop" ? "name" : "title");
    if (!title) { setError(kind === "shop" ? "দোকানের নাম লিখুন।" : "পণ্যের নাম লিখুন।"); return; }
    if (kind === "shop" && (!field("phone") || !field("address"))) { setError("দোকানের ফোন নম্বর ও ঠিকানা অবশ্যই দিন।"); return; }
    setSaving(true); setError("");
    try {
      const urls = [...keptImages];
      for (const photo of photos) urls.push((await uploadImageFromUri(photo.uri, photo.mimeType || "image/jpeg")).url);
      // Re-check auth immediately before the database mutation.
      if (pathargataAuth.currentUser?.uid !== uid) throw new Error("আপনার অ্যাকাউন্ট যাচাই করা যায়নি। আবার প্রবেশ করুন।");
      const now = new globalThis.Date().getTime();
      if (kind === "shop") {
        const payload = { uid, ownerName: userName, name: title, category: field("category") || "সাধারণ", phone: field("phone"), address: field("address"), desc: field("desc"), logo: urls[0] || "", time: editing ? (ownedShops.find(s => s.id === editing)?.time || now) : now, updatedAt: now };
        if (editing) {
          if (!ownedShops.some(s => s.id === editing)) throw new Error("এই দোকানটি সম্পাদনার অনুমতি নেই।");
          await update(ref(pathargataDb, `market_shops/${editing}`), payload);
          setQueriedShops(current => [...current.filter(shop => shop.id !== editing), { ...payload, id: editing }]);
        } else {
          const shopRef = push(ref(pathargataDb, "market_shops"));
          await set(shopRef, payload);
          if (shopRef.key) setQueriedShops(current => [...current, { ...payload, id: shopRef.key! }]);
        }
      } else {
        if (!ownedShops.length) throw new Error("পণ্য যোগ করার আগে অন্তত একটি দোকান তৈরি করুন।");
        const shopId = form.shopId && shopIds.has(form.shopId) ? form.shopId : "";
        if (!shopId) throw new Error("পণ্য বিক্রি করতে একটি দোকান নির্বাচন করুন।");
        const priceValue = parseTakaPrice(field("price"));
        if (priceValue === null) throw new Error("পণ্যের সঠিক দাম লিখুন।");
        const stockText = field("stock");
        const stockValue = stockText === "" ? undefined : parseTakaPrice(stockText);
        if (stockText !== "" && (stockValue == null || !Number.isInteger(stockValue) || stockValue < 0)) throw new Error("মজুতের সংখ্যা শূন্য বা তার বেশি পূর্ণসংখ্যা দিন।");
        const availability = stockValue === 0 || form.availability === "unavailable" ? "unavailable" : "available";
        const payload: Record<string, unknown> = { shopId, uid, seller: userName, title, price: field("price"), category: field("category"), desc: field("desc"), images: urls, image: urls[0] || "", availability, stock: stockValue ?? null, time: editing ? (ownedProducts.find(p => p.id === editing)?.time || now) : now, updatedAt: now };
        if (editing) {
          if (!ownedProducts.some(p => p.id === editing)) throw new Error("এই পণ্যটি সম্পাদনার অনুমতি নেই।");
          await update(ref(pathargataDb, `market_items/${editing}`), payload);
          setQueriedProducts(current => [...current.filter(product => product.id !== editing), { ...payload, id: editing, stock: stockValue } as MarketProductRecord]);
        } else {
          const productRef = push(ref(pathargataDb, "market_items"));
          await set(productRef, payload);
          if (productRef.key) setQueriedProducts(current => [...current, { ...payload, id: productRef.key, stock: stockValue } as MarketProductRecord]);
        }
      }
      const wasEditing = Boolean(editing);
      const savedKind = kind;
      reset();
      setSuccessMessage(
        savedKind === "shop"
          ? wasEditing ? "দোকানের তথ্য সফলভাবে আপডেট হয়েছে।" : "দোকান সফলভাবে তৈরি হয়েছে।"
          : wasEditing ? "পণ্যের listing সফলভাবে আপডেট হয়েছে।" : "পণ্য সফলভাবে listing হয়েছে।",
      );
    } catch (e) { setError(e instanceof Error ? e.message : "তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"); }
    finally { setSaving(false); }
  }
  async function deleteProduct(product: MarketProductRecord) {
    if (busyId) return;
    if (pathargataAuth.currentUser?.uid !== uid) { setError("আপনার অ্যাকাউন্ট যাচাই করা যায়নি। আবার প্রবেশ করুন।"); setConfirm(null); return; }
    setBusyId(product.id); setError("");
    try { if (!ownedProducts.some(p => p.id === product.id)) throw new Error("এই পণ্যটি মুছতে অনুমতি নেই।"); if (pathargataAuth.currentUser?.uid !== uid) throw new Error("আপনার অ্যাকাউন্ট যাচাই করা যায়নি। আবার প্রবেশ করুন।"); await remove(ref(pathargataDb, `market_items/${product.id}`)); setQueriedProducts(current => current.filter(item => item.id !== product.id)); setConfirm(null); if (editing === product.id) reset(); }
    catch (e) { setError(e instanceof Error ? e.message : "পণ্য মুছতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"); }
    finally { setBusyId(null); }
  }
  const input = (key: string, label: string, opts: { multiline?: boolean; keyboardType?: "default" | "phone-pad" | "numeric" } = {}) => <TextInput accessibilityLabel={label} placeholder={label} value={form[key] || ""} onChangeText={value => setForm(current => ({ ...current, [key]: value }))} className={`${fieldClass} ${opts.multiline ? "min-h-24" : ""}`} multiline={opts.multiline} keyboardType={opts.keyboardType} />;
  const action = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{ minHeight: 54, borderRadius: 14, backgroundColor: disabled ? "#6EE7B7" : "#047857", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 }}>{disabled ? <ActivityIndicator color="white" /> : <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "800", color: "white" }}>{label}</Text>}</Pressable>;
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-4"><Text className="text-xl font-bold text-foreground">বিক্রেতা সেন্টার</Text><Pressable accessibilityRole="button" accessibilityLabel="বন্ধ করুন" onPress={onClose} style={{ minWidth: 56, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#ECFDF5" }}><Text style={{ fontSize: 16, fontWeight: "700", color: "#065F46" }}>বন্ধ</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-10">
        {successMessage ? <View accessibilityRole="alert" className="flex-row items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-600"><Text className="text-lg font-extrabold text-white">✓</Text></View><View className="ml-3 flex-1"><Text className="font-extrabold text-emerald-900">সফলভাবে সম্পন্ন হয়েছে</Text><Text className="mt-1 text-[13px] leading-5 text-emerald-800">{successMessage}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="সফলতার বার্তা বন্ধ করুন" onPress={() => setSuccessMessage("")}><Text className="px-2 text-xl font-bold text-emerald-700">×</Text></Pressable></View> : null}
        {error ? <View accessibilityRole="alert" className="rounded-xl bg-red-50 p-3"><Text className="text-red-800">{error}</Text></View> : null}
        <View className="flex-row gap-2">{(["shop", "product"] as const).map(tab => { const selected = kind === tab; return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { reset(); setKind(tab); }} style={{ flex: 1, minHeight: 56, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, backgroundColor: selected ? "#047857" : colors.surface, borderWidth: selected ? 2 : 1, borderColor: selected ? "#065F46" : colors.border }}><Text style={{ textAlign: "center", fontSize: 16, fontWeight: "800", color: selected ? "#FFFFFF" : colors.foreground }}>{tab === "shop" ? "আমার দোকান" : "আমার পণ্য"}</Text></Pressable>; })}</View>
        <View className="rounded-2xl bg-surface p-4"><Text className="mb-3 text-lg font-bold text-foreground">{editing ? "তথ্য সম্পাদনা" : kind === "shop" ? "নতুন দোকান" : "নতুন পণ্য"}</Text>
          {kind === "shop" ? <>{input("name", "দোকানের নাম *")}{input("category", "ক্যাটাগরি")}{input("phone", "ফোন", { keyboardType: "phone-pad" })}{input("address", "ঠিকানা")}{input("desc", "দোকানের বিবরণ", { multiline: true })}</> : <>{input("title", "পণ্যের নাম *")}{input("price", "দাম", { keyboardType: "numeric" })}{input("category", "ক্যাটাগরি")}{input("desc", "পণ্যের বিবরণ", { multiline: true })}{input("stock", "মজুত (ঐচ্ছিক)", { keyboardType: "numeric" })}<Text className="mb-2 font-medium text-foreground">স্টক স্ট্যাটাস</Text><View className="mb-3 flex-row gap-2"><Pressable onPress={() => setForm(f => ({ ...f, availability: "available" }))} accessibilityRole="button" accessibilityState={{ selected: form.availability !== "unavailable" }} style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: form.availability !== "unavailable" ? "#DCFCE7" : colors.surface, borderWidth: form.availability !== "unavailable" ? 2 : 1, borderColor: form.availability !== "unavailable" ? "#15803D" : colors.border }}><Text style={{ fontWeight: "800", color: "#166534" }}>Available</Text></Pressable><Pressable onPress={() => setForm(f => ({ ...f, availability: "unavailable", stock: "0" }))} accessibilityRole="button" accessibilityState={{ selected: form.availability === "unavailable" }} style={{ flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: form.availability === "unavailable" ? "#FEE2E2" : colors.surface, borderWidth: form.availability === "unavailable" ? 2 : 1, borderColor: form.availability === "unavailable" ? "#B91C1C" : colors.border }}><Text style={{ fontWeight: "800", color: "#B91C1C" }}>Stock out</Text></Pressable></View><Text className="mb-2 font-medium text-foreground">দোকান নির্বাচন করুন *</Text>{ownedShops.length ? <View className="mb-3 flex-row flex-wrap gap-2">{ownedShops.map(shop => <Pressable accessibilityRole="button" key={shop.id} accessibilityState={{ selected: form.shopId === shop.id }} onPress={() => setForm(f => ({ ...f, shopId: shop.id }))} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: form.shopId === shop.id ? "#D1FAE5" : colors.surface, borderWidth: form.shopId === shop.id ? 2 : 1, borderColor: form.shopId === shop.id ? "#047857" : colors.border }}><Text style={{ fontSize: 15, fontWeight: "700", color: "#064E3B" }}>{shop.name}</Text></Pressable>)}</View> : <Text className="mb-3 rounded-xl bg-amber-50 p-3 text-amber-800">পণ্য বিক্রি করতে আগে “আমার দোকান” ট্যাব থেকে একটি দোকান তৈরি করুন।</Text>}</>}
          <Pressable accessibilityRole="button" accessibilityLabel="ছবি যোগ করুন" onPress={() => { void choosePhotos(); }} style={{ minHeight: 52, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}><Text style={{ textAlign: "center", fontSize: 15, fontWeight: "800", color: "#065F46" }}>{kind === "shop" ? "দোকানের লোগো বাছুন" : "পণ্যের ছবি যোগ করুন (সর্বোচ্চ ৪টি)"}</Text></Pressable>
          <View className="mb-3 flex-row flex-wrap gap-2">{keptImages.map((uri, i) => <View key={`old-${uri}-${i}`} className="relative"><Image source={{ uri }} accessibilityLabel="সংরক্ষিত ছবি" className="h-16 w-16 rounded-lg"/><Pressable accessibilityRole="button" accessibilityLabel="ছবি সরান" onPress={() => setKeptImages(list => list.filter((_, index) => index !== i))} className="absolute right-0 rounded-full bg-red-700 px-2"><Text className="text-white">×</Text></Pressable></View>)}{photos.map((photo, i) => <View key={`new-${photo.uri}-${i}`} className="relative"><Image source={{ uri: photo.uri }} accessibilityLabel="নতুন নির্বাচিত ছবি" className="h-16 w-16 rounded-lg"/><Pressable accessibilityRole="button" accessibilityLabel="ছবি সরান" onPress={() => setPhotos(list => list.filter((_, index) => index !== i))} className="absolute right-0 rounded-full bg-red-700 px-2"><Text className="text-white">×</Text></Pressable></View>)}</View>
          {action(editing ? "পরিবর্তন সংরক্ষণ" : kind === "shop" ? "দোকান তৈরি করুন" : "পণ্য listing করুন", () => { void save(); }, saving)}{editing ? <Pressable accessibilityRole="button" onPress={reset} style={{ minHeight: 48, marginTop: 10, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>সম্পাদনা বাতিল</Text></Pressable> : null}
        </View>
        {ownerProductsError ? <Text accessibilityRole="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{ownerProductsError}</Text> : null}
        {ownerProductsLoading ? <View className="flex-row items-center justify-center gap-2"><ActivityIndicator color="#047857"/><Text className="text-xs text-muted">আপনার পণ্য লোড হচ্ছে…</Text></View> : null}
        <View className="gap-3"><Text className="text-lg font-bold text-foreground">{kind === "shop" ? "আমার দোকানসমূহ" : "আমার পণ্যসমূহ"}</Text>{kind === "shop" ? (ownedShops.length ? ownedShops.map(shop => <View key={shop.id} className="flex-row items-center justify-between rounded-xl bg-surface p-3"><View className="flex-1"><Text className="font-semibold text-foreground">{shop.name}</Text><Text className="text-muted">{shop.category || "ক্যাটাগরি নেই"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${shop.name} সম্পাদনা`} onPress={() => startEdit("shop", shop.id)} style={{ minWidth: 76, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#ECFDF5" }}><Text style={{ fontWeight: "700", color: "#065F46" }}>সম্পাদনা</Text></Pressable></View>) : <Text className="rounded-xl bg-surface p-4 text-muted">এখনও কোনো দোকান যোগ করা হয়নি।</Text>) : (ownedProducts.length ? ownedProducts.map(product => <View key={product.id} className="flex-row items-center justify-between rounded-xl bg-surface p-3"><View className="flex-1"><Text className="font-semibold text-foreground">{product.title}</Text><Text className="text-muted">{product.price || "দাম নেই"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`${product.title} সম্পাদনা`} onPress={() => startEdit("product", product.id)} style={{ minWidth: 76, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#ECFDF5" }}><Text style={{ fontWeight: "700", color: "#065F46" }}>সম্পাদনা</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${product.title} মুছুন`} onPress={() => setConfirm(product)} style={{ minWidth: 60, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#FEF2F2" }}><Text style={{ fontWeight: "700", color: "#B91C1C" }}>মুছুন</Text></Pressable></View>) : <Text className="rounded-xl bg-surface p-4 text-muted">এখনও কোনো পণ্য যোগ করা হয়নি।</Text>)}</View>
      </ScrollView>
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}><View className="flex-1 items-center justify-center bg-black/50 p-6"><View accessibilityViewIsModal className="w-full max-w-sm rounded-2xl bg-surface p-5"><Text className="mb-2 text-lg font-bold text-foreground">পণ্য মুছবেন?</Text><Text className="mb-4 text-muted">“{confirm?.title}” স্থায়ীভাবে মুছে যাবে।</Text><View className="flex-row gap-3"><Pressable accessibilityRole="button" onPress={() => setConfirm(null)} style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Text style={{ textAlign: "center", fontWeight: "700", color: colors.foreground }}>না, রাখুন</Text></Pressable><Pressable accessibilityRole="button" disabled={!!busyId} onPress={() => { if (confirm) void deleteProduct(confirm); }} style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: busyId ? "#FCA5A5" : "#B91C1C", alignItems: "center", justifyContent: "center" }}><Text style={{ textAlign: "center", fontWeight: "800", color: "white" }}>{busyId ? "মুছছে…" : "হ্যাঁ, মুছুন"}</Text></Pressable></View>{busyId ? <ActivityIndicator accessibilityLabel="মুছে ফেলা হচ্ছে" className="mt-3" /> : null}</View></View></Modal>
    </View>
  </Modal>;
}
