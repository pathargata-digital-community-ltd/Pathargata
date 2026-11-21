import { safeGoBack } from "@/lib/safe-navigation";
import { MarketOrderInboxLauncher } from "@/components/market-order-inbox";
import { MarketSellerCenter } from "@/components/market-seller-center";
import { MarketplaceProductDetails } from "@/components/marketplace-product-details";
import { ScreenContainer } from "@/components/screen-container";
import { useMarketplaceCatalog, type MarketProductRecord, type MarketShopRecord } from "@/hooks/use-marketplace-catalog";
import { filterMarketplaceCatalog, getMarketplaceCategoryOptions, parseTakaPrice, sortMarketplaceCatalog, type MarketplaceSort } from "@/lib/marketplace-catalog";
import { buildMarketplaceOrderPayload, type MarketplaceDeliveryMethod, type MarketplacePaymentMethod } from "@/lib/market-orders";
import { createMarketplaceCheckoutIdempotencyKey } from "@/lib/marketplace-checkout-key";
import { getMarketplaceCheckoutErrorMessage } from "@/lib/marketplace-checkout-error";
import { parseMarketplaceCart, serializeMarketplaceCart, type MarketplaceCartItem } from "@/lib/marketplace-cart";
import { pathargataAuth, pathargataDb, pathargataFunctions } from "@/lib/pathargata-firebase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { httpsCallable } from "firebase/functions";
import { push, ref, remove, set, update } from "firebase/database";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type MarketTab = "products" | "shops" | "favorites";
type FavoriteListRow =
  | { key: string; kind: "heading"; label: string }
  | { key: string; kind: "products"; items: MarketProductRecord[] }
  | { key: string; kind: "shop"; item: MarketShopRecord }
  | { key: string; kind: "empty"; label: string };
const orange = "#EA580C";
const PAGE_FOOTER = <View className="h-5" />;

function isMissingCheckoutFunction(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code.replace(/^functions\//, "") : "";
  // On the current Spark project, an undeployed callable can surface as
  // either not-found or internal depending on the Firebase client/runtime.
  return code === "not-found" || code === "internal";
}

async function createFreePlanMarketplaceOrders(
  items: MarketplaceCartItem[],
  buyer: { uid: string; name: string; phone: string; address: string; deliveryMethod: MarketplaceDeliveryMethod; paymentMethod: MarketplacePaymentMethod },
): Promise<void> {
  const updates: Record<string, unknown> = {};
  const now = Date.now();
  items.forEach(({ product, quantity }, index) => {
    const orderRef = push(ref(pathargataDb, "market_orders"));
    if (!orderRef.key || !product.uid) throw new Error("পণ্যের বিক্রেতা account শনাক্ত করা যায়নি।");
    updates[`market_orders/${orderRef.key}`] = buildMarketplaceOrderPayload({
      productId: product.id,
      productTitle: product.title,
      productPrice: product.price,
      productImage: product.images[0] || product.image || "",
      sellerUid: product.uid,
      sellerName: product.seller,
      buyerUid: buyer.uid,
      buyerName: buyer.name,
      buyerPhone: buyer.phone,
      buyerAddress: buyer.address,
      quantity,
      deliveryMethod: buyer.deliveryMethod,
      paymentMethod: buyer.paymentMethod,
    }, now + index);
  });
  await update(ref(pathargataDb), updates);
}

function ErrorBanner({ message, onRetry }: { message?: string; onRetry: () => void }) {
  if (!message) return null;
  return <View className="mx-4 mt-3 rounded-2xl border border-red-200 bg-red-50 p-3">
    <View className="flex-row items-start"><Ionicons name="cloud-offline-outline" size={19} color="#B91C1C"/><Text className="ml-2 flex-1 text-xs leading-5 text-red-800">তথ্য লোড করা যায়নি: {message}</Text></View>
    <Pressable onPress={onRetry} className="self-start mt-2 rounded-lg bg-red-100 px-3 py-2" accessibilityRole="button"><Text className="text-xs font-bold text-red-800">আবার চেষ্টা করুন</Text></Pressable>
  </View>;
}

function ProductCard({ item, favorite, onOpen, onFavorite, onOrder, onEdit }: { item: MarketProductRecord; favorite: boolean; onOpen: () => void; onFavorite: () => void; onOrder?: () => void; onEdit?: () => void }) {
  const unavailable = item.availability === "unavailable" || item.availability === "paused" || (typeof item.stock === "number" && item.stock <= 0);
  const image = item.images[0] || item.image;
  const availabilityLabel = unavailable ? "স্টক নেই" : "Available";
  return <View className="mb-3 flex-1 overflow-hidden rounded-3xl border border-border bg-surface">
    <View style={{ height: 112, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.title} ছবিসহ বিস্তারিত খুলুন`} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}>
        {image ? <ExpoImage source={{ uri: image }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" transition={120} recyclingKey={image} /> : <Ionicons name="image-outline" size={38} color="#FDBA74"/>}
      </Pressable>
      <Pressable onPress={onFavorite} hitSlop={6} accessibilityRole="button" accessibilityLabel={favorite ? "পছন্দ থেকে সরান" : "পছন্দে যোগ করুন"} style={{ position: "absolute", right: 6, top: 6, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "rgba(255,255,255,0.96)" }}><Ionicons name={favorite ? "heart" : "heart-outline"} size={17} color={favorite ? "#EF4444" : "#475569"}/></Pressable>
    </View>
    <View style={{ minHeight: 76, paddingHorizontal: 9, paddingVertical: 8, justifyContent: "center" }}>
      <Text className="text-[15px] font-bold leading-5 text-foreground" numberOfLines={2}>{item.title}</Text><View className="mt-1 flex-row items-center justify-between gap-2"><Text className="flex-1 text-sm font-extrabold text-orange-700">৳ {item.price}</Text><View className={`rounded-full px-2 py-0.5 ${unavailable ? "bg-red-50" : "bg-emerald-50"}`}><Text className={`text-[10px] font-extrabold ${unavailable ? "text-red-700" : "text-emerald-700"}`}>{availabilityLabel}</Text></View></View><Text className="mt-1 text-[13px] text-muted" numberOfLines={1}>{item.seller}{item.category ? ` · ${item.category}` : ""}</Text>
      {onEdit ? <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${item.title} সম্পাদনা করুন`} style={{ minHeight: 40, marginTop: 8, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" }}><Text style={{ fontSize: 13, fontWeight: "800", color: "#047857" }}>এডিট</Text></Pressable> : onOrder ? <Pressable disabled={unavailable} onPress={onOrder} accessibilityRole="button" style={{ minHeight: 40, marginTop: 8, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: unavailable ? "#E2E8F0" : "#C2410C" }}><Text style={{ fontSize: 13, fontWeight: "800", color: unavailable ? "#64748B" : "white" }}>{unavailable ? "স্টক নেই" : "অর্ডার করুন"}</Text></Pressable> : null}
    </View>
  </View>;
}

function ShopCard({ shop, favorite, onOpen, onFavorite }: { shop: MarketShopRecord; favorite: boolean; onOpen: () => void; onFavorite: () => void }) {
  return <View className="mb-3 rounded-3xl border border-border bg-surface p-4">
    <View className="flex-row items-center">
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${shop.name} দোকানের বিবরণ`} style={{ minHeight: 64, flex: 1, flexDirection: "row", alignItems: "center" }}>
        <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-orange-50">{shop.logo ? <ExpoImage source={{ uri: shop.logo }} className="h-full w-full" contentFit="cover" cachePolicy="memory-disk"/> : <Ionicons name="storefront-outline" size={25} color={orange}/>}</View>
        <View className="ml-3 flex-1"><View className="flex-row items-center gap-1"><Text className="font-bold text-foreground" numberOfLines={1}>{shop.name}</Text>{shop.verified ? <Ionicons name="checkmark-circle" size={18} color="#15803D"/> : null}</View><Text className="mt-1 text-sm text-orange-800">{shop.category}{shop.verified ? " · যাচাইকৃত" : ""}</Text><Text className="mt-1 text-sm text-muted" numberOfLines={1}>{shop.address}</Text></View>
      </Pressable>
      <Pressable onPress={onFavorite} accessibilityRole="button" accessibilityLabel={favorite ? "পছন্দের দোকান থেকে সরান" : "পছন্দের দোকানে যোগ করুন"} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: favorite ? "#FFF1F2" : "#F8FAFC" }}><Ionicons name={favorite ? "heart" : "heart-outline"} size={23} color={favorite ? "#E11D48" : "#475569"}/></Pressable>
    </View>
    {shop.desc ? <Pressable onPress={onOpen} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingTop: 8 }}><Text className="text-sm leading-5 text-muted" numberOfLines={2}>{shop.desc}</Text></Pressable> : null}
    <View className="mt-3 flex-row items-center justify-between border-t border-border pt-2"><Text className="flex-1 text-sm text-muted">{[shop.village, shop.union].filter(Boolean).join(" · ") || "স্থানীয় দোকান"}</Text><Pressable onPress={onOpen} accessibilityRole="button" style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: "center", borderRadius: 12, backgroundColor: "#FFF7ED" }}><Text className="text-sm font-bold text-orange-800">দোকান দেখুন ›</Text></Pressable></View>
  </View>;
}

function MarketplaceFilterOption({ label, selected, tone = "orange", onPress }: { label: string; selected: boolean; tone?: "orange" | "green" | "blue"; onPress: () => void }) {
  const colors = tone === "green"
    ? { background: "#DCFCE7", border: "#15803D", text: "#14532D", icon: "#15803D" }
    : tone === "blue"
      ? { background: "#DBEAFE", border: "#1D4ED8", text: "#1E3A8A", icon: "#1D4ED8" }
      : { background: "#FFEDD5", border: "#C2410C", text: "#7C2D12", icon: "#C2410C" };
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, borderRadius: 24, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.border : "#CBD5E1", backgroundColor: selected ? colors.background : "#FFFFFF", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, opacity: pressed ? 0.78 : 1 })}>
    {selected ? <Ionicons name="checkmark-circle" size={19} color={colors.icon}/> : null}
    <Text style={{ fontSize: 15, fontWeight: selected ? "800" : "600", color: selected ? colors.text : "#334155" }}>{label}</Text>
  </Pressable>;
}

export default function MarketServiceScreen() {
  const catalog = useMarketplaceCatalog();
  const [tab, setTab] = useState<MarketTab>("products");
  const [queryText, setQueryText] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState("");
  const [locality, setLocality] = useState("");
  const [minPriceText, setMinPriceText] = useState("");
  const [maxPriceText, setMaxPriceText] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "unavailable">("all");
  const [sort, setSort] = useState<MarketplaceSort>("newest");
  const [selectedProduct, setSelectedProduct] = useState<MarketProductRecord | null>(null);
  const [selectedShop, setSelectedShop] = useState<MarketShopRecord | null>(null);
  const [sellerCenterVisible, setSellerCenterVisible] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [orderVisible, setOrderVisible] = useState(false);
  const [orderProduct, setOrderProduct] = useState<MarketProductRecord | null>(null);
  const [orderName, setOrderName] = useState(pathargataAuth.currentUser?.displayName || "");
  const [orderPhone, setOrderPhone] = useState(pathargataAuth.currentUser?.phoneNumber || "");
  const [orderAddress, setOrderAddress] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [deliveryMethod, setDeliveryMethod] = useState<MarketplaceDeliveryMethod>("delivery");
  const [paymentMethod, setPaymentMethod] = useState<MarketplacePaymentMethod>("cash_on_delivery");
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [checkoutRequestKey, setCheckoutRequestKey] = useState("");
  const checkoutInstanceId = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const checkoutSequence = useRef(0);
  const createCheckoutRequestKey = () => {
    checkoutSequence.current += 1;
    return createMarketplaceCheckoutIdempotencyKey(checkoutInstanceId, checkoutSequence.current);
  };
  const [favoriteError, setFavoriteError] = useState("");
  const [cartItems, setCartItems] = useState<MarketplaceCartItem[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [cartUid, setCartUid] = useState(pathargataAuth.currentUser?.uid || "");
  const [cartHydratedKey, setCartHydratedKey] = useState("");

  const shopById = useMemo(() => new Map(catalog.shops.map((shop) => [shop.id, shop])), [catalog.shops]);
  const enrichedProducts = useMemo(() => catalog.products.map((product) => {
    const shop = product.shopId ? shopById.get(product.shopId) : undefined;
    return {
      ...product,
      category: product.category || shop?.category || "",
      address: shop?.address || "",
      union: shop?.union,
      village: shop?.village,
      description: [product.desc, product.seller, shop?.name].filter(Boolean).join(" "),
    };
  }), [catalog.products, shopById]);
  const productCategories = useMemo(() => getMarketplaceCategoryOptions(enrichedProducts), [enrichedProducts]);
  const minPrice = minPriceText.trim() ? parseTakaPrice(minPriceText) ?? undefined : undefined;
  const maxPrice = maxPriceText.trim() ? parseTakaPrice(maxPriceText) ?? undefined : undefined;
  const productFilters = useMemo(() => ({ search: queryText, category: category || undefined, locality: locality || undefined, minPrice, maxPrice, availability }), [queryText, category, locality, minPrice, maxPrice, availability]);
  const filteredProducts = useMemo(() => sortMarketplaceCatalog(filterMarketplaceCatalog(enrichedProducts, productFilters), sort), [enrichedProducts, productFilters, sort]);
  const filteredShops = useMemo(() => {
    const matched = filterMarketplaceCatalog(catalog.shops, { search: queryText, category: category || undefined, locality: locality || undefined });
    return matched;
  }, [catalog.shops, queryText, category, locality]);
  const favoriteProducts = useMemo(() => filteredProducts.filter((item) => catalog.favorites.products[item.id]), [filteredProducts, catalog.favorites.products]);
  const favoriteShops = useMemo(() => filteredShops.filter((item) => catalog.favorites.shops[item.id]), [filteredShops, catalog.favorites.shops]);
  const favoriteRows = useMemo(() => {
    const rows: FavoriteListRow[] = [{ key: "products-heading", kind: "heading", label: `পছন্দের পণ্য (${favoriteProducts.length})` }];
    if (favoriteProducts.length) {
      for (let index = 0; index < favoriteProducts.length; index += 3) {
        rows.push({ key: `products-${index}`, kind: "products", items: favoriteProducts.slice(index, index + 3) });
      }
    } else rows.push({ key: "products-empty", kind: "empty", label: "কোনো পণ্য পছন্দের তালিকায় নেই।" });
    rows.push({ key: "shops-heading", kind: "heading", label: `পছন্দের দোকান (${favoriteShops.length})` });
    if (favoriteShops.length) favoriteShops.forEach((item) => rows.push({ key: `shop-${item.id}`, kind: "shop", item }));
    else rows.push({ key: "shops-empty", kind: "empty", label: "কোনো দোকান পছন্দের তালিকায় নেই।" });
    return rows;
  }, [favoriteProducts, favoriteShops]);
  const selectedProductShop = selectedProduct?.shopId ? shopById.get(selectedProduct.shopId) : undefined;
  const orderShop = orderProduct?.shopId ? shopById.get(orderProduct.shopId) : undefined;
  const shopDetailProducts = useMemo(() => selectedShop
    ? catalog.shopProducts[selectedShop.id] ?? catalog.products.filter((product) => product.shopId === selectedShop.id)
    : [], [selectedShop, catalog.shopProducts, catalog.products]);
  const shopDetailGroups = useMemo(() => {
    const groups = new Map<string, MarketProductRecord[]>();
    shopDetailProducts.forEach((product) => {
      const category = product.category?.trim() || "অন্যান্য পণ্য";
      groups.set(category, [...(groups.get(category) || []), product]);
    });
    return [...groups.entries()].map(([category, products]) => ({ category, products }));
  }, [shopDetailProducts]);
  const shopAvailableCount = useMemo(() => shopDetailProducts.filter((product) => product.availability !== "unavailable" && product.availability !== "paused" && !(typeof product.stock === "number" && product.stock <= 0)).length, [shopDetailProducts]);
  const isSelectedShopOwner = Boolean(selectedShop?.uid && selectedShop.uid === pathargataAuth.currentUser?.uid);
  const directOrderTotal = useMemo(() => {
    if (!orderProduct) return null;
    const unit = parseTakaPrice(orderProduct.price);
    const count = Number(orderQuantity);
    return unit === null || !Number.isFinite(count) || count < 1 ? null : unit * Math.floor(count);
  }, [orderProduct, orderQuantity]);
  const cartTotal = useMemo(() => cartItems.reduce((total, item) => {
    const price = parseTakaPrice(item.product.price);
    return price === null ? total : total + price * item.quantity;
  }, 0), [cartItems]);
  const cartCount = useMemo(() => cartItems.reduce((total, item) => total + item.quantity, 0), [cartItems]);
  const checkoutItems = useMemo(() => orderProduct
    ? [{ product: orderProduct, quantity: Math.max(1, Math.floor(Number(orderQuantity) || 1)) }]
    : cartItems, [cartItems, orderProduct, orderQuantity]);
  const checkoutTotal = orderProduct ? directOrderTotal : cartTotal;

  useFocusEffect(useCallback(() => {
    const user = pathargataAuth.currentUser;
    setCartUid(user?.uid || "");
    if (user?.displayName) setOrderName((current) => current || user.displayName || "");
    if (user?.phoneNumber) setOrderPhone((current) => current || user.phoneNumber || "");
  }, []));

  const cartStorageKey = cartUid ? `pathargata:marketplace-cart:${cartUid}` : "";
  useEffect(() => {
    let active = true;
    // Reset the previous account's cart before loading the newly scoped key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCartItems([]);
    setCartHydratedKey("");
    if (!cartStorageKey) return () => { active = false; };
    void AsyncStorage.getItem(cartStorageKey).then((raw) => {
      if (!active) return;
      setCartItems(parseMarketplaceCart(raw));
      setCartHydratedKey(cartStorageKey);
    }).catch(() => {
      if (active) setCartHydratedKey(cartStorageKey);
    });
    return () => { active = false; };
  }, [cartStorageKey]);

  useEffect(() => {
    if (!cartStorageKey || cartHydratedKey !== cartStorageKey) return;
    void AsyncStorage.setItem(cartStorageKey, serializeMarketplaceCart(cartItems)).catch(() => undefined);
  }, [cartHydratedKey, cartItems, cartStorageKey]);

  const loadShopProducts = catalog.loadShopProducts;
  useEffect(() => {
    if (selectedShop?.id) void loadShopProducts(selectedShop.id);
  }, [selectedShop?.id, loadShopProducts]);

  const toggleFavorite = useCallback(async (kind: "shops" | "products", id: string) => {
    const uid = pathargataAuth.currentUser?.uid;
    if (!uid) { router.push("/auth"); return; }
    setFavoriteError("");
    try {
      const current = catalog.favorites[kind][id];
      const path = ref(pathargataDb, `market_favorites/${uid}/${kind}/${id}`);
      if (current) await remove(path);
      else await set(path, true);
    } catch (error) {
      setFavoriteError(error instanceof Error ? error.message : "পছন্দের তালিকা আপডেট হয়নি। আবার চেষ্টা করুন।");
    }
  }, [catalog.favorites]);

  function openOrder(product: MarketProductRecord) {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (product.uid && product.uid === user.uid) {
      setOrderError("নিজের পণ্যে অর্ডার করা যাবে না।");
      return;
    }
    setOrderProduct(product);
    setOrderQuantity("1");
    setDeliveryMethod("delivery");
    setPaymentMethod("cash_on_delivery");
    setOrderAddress("");
    setOrderError("");
    setCheckoutRequestKey(createCheckoutRequestKey());
    setOrderVisible(true);
  }

  function addToCart(product: MarketProductRecord) {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (product.uid && product.uid === user.uid) {
      setCartMessage("নিজের পণ্য কার্টে যোগ করা যাবে না।");
      return;
    }
    const unavailable = product.availability === "unavailable" || product.availability === "paused" || (typeof product.stock === "number" && product.stock <= 0);
    if (unavailable) { setCartMessage("এই পণ্যটি বর্তমানে মজুত নেই।"); return; }
    setCartItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];
      const nextQuantity = existing.quantity + 1;
      const capped = typeof product.stock === "number" ? Math.min(nextQuantity, product.stock) : nextQuantity;
      return current.map((item) => item.product.id === product.id ? { ...item, product, quantity: capped } : item);
    });
    setSelectedProduct(null);
    setCartMessage(`${product.title} কার্টে যোগ হয়েছে।`);
  }

  function changeCartQuantity(productId: string, delta: number) {
    setCartItems((current) => current.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      const max = typeof item.product.stock === "number" ? item.product.stock : Number.POSITIVE_INFINITY;
      const quantity = Math.min(max, item.quantity + delta);
      return quantity < 1 ? [] : [{ ...item, quantity }];
    }));
  }

  function openCartCheckout() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (!cartItems.length) { setCartMessage("আগে একটি পণ্য কার্টে যোগ করুন।"); return; }
    setOrderProduct(null);
    setOrderQuantity("1");
    setDeliveryMethod("delivery");
    setPaymentMethod("cash_on_delivery");
    setOrderAddress("");
    setOrderError("");
    setCheckoutRequestKey(createCheckoutRequestKey());
    setOrderVisible(true);
    setCartVisible(false);
  }

  async function submitOrder() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (!checkoutItems.length) { setOrderError("কার্টে কোনো পণ্য নেই।"); return; }
    const invalidItem = checkoutItems.find(({ product, quantity }) => !product.uid || product.availability === "unavailable" || product.availability === "paused" || (typeof product.stock === "number" && (product.stock <= 0 || quantity > product.stock)));
    if (invalidItem) { setOrderError(invalidItem.product.uid ? `${invalidItem.product.title} বর্তমানে মজুত নেই বা পর্যাপ্ত stock নেই।` : "একটি পণ্যের বিক্রেতা account শনাক্ত করা যায়নি।"); return; }
    setOrderSaving(true);
    setOrderError("");
    try {
      const idempotencyKey = checkoutRequestKey || `${checkoutInstanceId}-fallback`;
      const createCheckout = httpsCallable(pathargataFunctions, "createMarketplaceCheckout");
      try {
        await createCheckout({
          items: checkoutItems.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          buyerName: orderName,
          buyerPhone: orderPhone,
          buyerAddress: orderAddress,
          deliveryMethod,
          paymentMethod,
          idempotencyKey,
        });
      } catch (error) {
        if (!isMissingCheckoutFunction(error)) throw error;
        await createFreePlanMarketplaceOrders(checkoutItems, {
          uid: user.uid,
          name: orderName,
          phone: orderPhone,
          address: orderAddress,
          deliveryMethod,
          paymentMethod,
        });
      }
      setOrderVisible(false);
      setSelectedProduct(null);
      setOrderProduct(null);
      setCartItems([]);
      setOrderName(user.displayName || "");
      setOrderPhone(user.phoneNumber || "");
      setOrderAddress("");
      setCheckoutRequestKey("");
    } catch (error) {
      setOrderError(getMarketplaceCheckoutErrorMessage(error));
    } finally {
      setOrderSaving(false);
    }
  }

  function resetFilters() {
    setCategory(""); setLocality(""); setMinPriceText(""); setMaxPriceText(""); setAvailability("all"); setSort("newest"); setQueryText("");
  }

  const loadMoreCatalog = catalog.loadMore;
  const onLoadMore = useCallback(() => {
    if (tab === "products" || tab === "favorites") void loadMoreCatalog("products");
    else void loadMoreCatalog("shops");
  }, [loadMoreCatalog, tab]);
  const activeLoading = tab === "shops" ? catalog.loading.shops : catalog.loading.products;
  const activeError = tab === "shops" ? catalog.errors.shops : catalog.errors.products;

  const renderProduct = useCallback(({ item }: { item: MarketProductRecord }) => <ProductCard item={item} favorite={Boolean(catalog.favorites.products[item.id])} onOpen={() => { setSelectedShop(null); setSelectedProduct(item); }} onFavorite={() => { void toggleFavorite("products", item.id); }} />, [catalog.favorites.products, toggleFavorite]);
  const renderShop = useCallback(({ item }: { item: MarketShopRecord }) => <ShopCard shop={item} favorite={Boolean(catalog.favorites.shops[item.id])} onOpen={() => setSelectedShop(item)} onFavorite={() => { void toggleFavorite("shops", item.id); }} />, [catalog.favorites.shops, toggleFavorite]);

  return <ScreenContainer className="bg-background">
    <View className="flex-row items-center border-b border-border px-4 pb-3 pt-3">
      <Pressable onPress={() => safeGoBack("/(tabs)/services")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="পেছনে যান"><Ionicons name="arrow-back" size={19} color="#334155"/></Pressable>
      <View className="ml-2 flex-1 min-w-0"><Text className="text-[18px] font-bold text-foreground" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>পাথরঘাটা মার্কেট</Text><Text className="mt-0.5 text-[11px] text-muted" numberOfLines={1}>স্থানীয় পণ্য ও দোকান</Text></View>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 5, marginLeft: 6 }}>
        <Pressable onPress={() => pathargataAuth.currentUser ? setSellerCenterVisible(true) : router.push("/auth")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC" }} accessibilityRole="button" accessibilityLabel="বিক্রেতা সেন্টার খুলুন"><Ionicons name="storefront-outline" size={19} color="#166534"/></Pressable>
        <Pressable onPress={() => { setCartMessage(""); setCartVisible(true); }} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FDBA74" }} accessibilityRole="button" accessibilityLabel={`কার্ট খুলুন${cartCount ? `, ${cartCount} টি পণ্য` : ""}`}><Ionicons name="cart-outline" size={19} color="#C2410C"/>{cartCount ? <View style={{ position: "absolute", top: -2, right: -2, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#DC2626", borderWidth: 1.5, borderColor: "#FFFFFF" }}><Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "900" }}>{cartCount > 99 ? "99+" : cartCount}</Text></View> : null}</Pressable>
        <MarketOrderInboxLauncher />
      </View>
    </View>

    <View className="px-4 pt-3">
      <View className="flex-row gap-2 rounded-2xl border border-border bg-surface p-2">
        {([ ["products", "bag-outline"], ["shops", "storefront-outline"], ["favorites", "heart-outline"] ] as [MarketTab, "bag-outline" | "storefront-outline" | "heart-outline"][]).map(([id, icon]) => {
          const selected = tab === id;
          const label = id === "products" ? `পণ্য (${catalog.products.length}${catalog.hasMore.products ? "+" : ""})` : id === "shops" ? `দোকান (${catalog.shops.length}${catalog.hasMore.shops ? "+" : ""})` : "পছন্দের তালিকা";
          return <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: selected ? "#C2410C" : "#F8FAFC", borderWidth: selected ? 1.5 : 1, borderColor: selected ? "#9A3412" : "#CBD5E1" }}><Ionicons name={id === "favorites" && selected ? "heart" : icon} size={21} color={selected ? "#FFFFFF" : "#334155"}/></Pressable>;
        })}
      </View>
      <View className="mt-3 flex-row items-center rounded-2xl border border-border bg-surface px-3"><Ionicons name="search-outline" size={18} color="#64748B"/><TextInput className="flex-1 px-2.5 py-2.5 text-base text-foreground" placeholder="পণ্য, দোকান বা এলাকা খুঁজুন" placeholderTextColor="#64748B" value={queryText} onChangeText={setQueryText} returnKeyType="search"/><Pressable onPress={() => setShowFilters((value) => !value)} accessibilityRole="button" accessibilityLabel="ফিল্টার দেখান" accessibilityState={{ expanded: showFilters }} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: showFilters ? "#FFEDD5" : "#F1F5F9", borderWidth: 1, borderColor: showFilters ? "#C2410C" : "#CBD5E1" }}><Ionicons name="options-outline" size={19} color={showFilters ? "#9A3412" : "#334155"}/></Pressable></View>
    </View>

    {showFilters ? <View className="mx-4 mt-3 rounded-2xl border border-border bg-surface p-3">
      <View className="flex-row items-center justify-between"><Text className="text-base font-bold text-foreground">খুঁজুন ও ফিল্টার</Text><Pressable onPress={resetFilters} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}><Text style={{ fontSize: 15, fontWeight: "800", color: "#9A3412" }}>সব মুছুন</Text></Pressable></View>
      <TextInput className="mt-3 min-h-12 rounded-xl border border-border bg-background px-3 text-base text-foreground" placeholder="এলাকা (গ্রাম / ইউনিয়ন / ঠিকানা)" placeholderTextColor="#64748B" value={locality} onChangeText={setLocality}/>
      <View className="mt-2 flex-row gap-2"><TextInput className="min-h-12 flex-1 rounded-xl border border-border bg-background px-3 text-base text-foreground" placeholder="সর্বনিম্ন ৳" placeholderTextColor="#64748B" keyboardType="numeric" value={minPriceText} onChangeText={setMinPriceText}/><TextInput className="min-h-12 flex-1 rounded-xl border border-border bg-background px-3 text-base text-foreground" placeholder="সর্বোচ্চ ৳" placeholderTextColor="#64748B" keyboardType="numeric" value={maxPriceText} onChangeText={setMaxPriceText}/></View>
      {(minPriceText.trim() && minPrice === undefined || maxPriceText.trim() && maxPrice === undefined) ? <Text className="mt-1 text-xs text-red-700">দামের ফিল্টারে সংখ্যা লিখুন।</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3"><View className="flex-row gap-2"><MarketplaceFilterOption label="সব ক্যাটাগরি" selected={!category} onPress={() => setCategory("")}/>{productCategories.map((option) => <MarketplaceFilterOption key={option} label={option} selected={category === option} onPress={() => setCategory(option)}/>)}</View></ScrollView>
      <View className="mt-3 flex-row flex-wrap gap-2">{([ ["all", "সব পণ্য"], ["available", "মজুত আছে"], ["unavailable", "স্টক নেই"] ] as [typeof availability, string][]).map(([value, label]) => <MarketplaceFilterOption key={value} label={label} selected={availability === value} tone="green" onPress={() => setAvailability(value)}/>)}</View>
      <View className="mt-3 flex-row flex-wrap gap-2">{([ ["newest", "নতুন আগে"], ["price-low", "দাম কম আগে"], ["price-high", "দাম বেশি আগে"] ] as [MarketplaceSort, string][]).map(([value, label]) => <MarketplaceFilterOption key={value} label={label} selected={sort === value} tone="blue" onPress={() => setSort(value)}/>)}</View>
    </View> : null}

    {favoriteError ? <ErrorBanner message={favoriteError} onRetry={() => setFavoriteError("")}/> : null}
    {cartMessage ? <Pressable onPress={() => setCartMessage("")} className="mx-4 mt-3 flex-row items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-3" accessibilityRole="button"><Ionicons name="checkmark-circle" size={19} color="#047857"/><Text className="ml-2 flex-1 text-xs font-bold text-emerald-800">{cartMessage}</Text><Ionicons name="close" size={17} color="#047857"/></Pressable> : null}
    {catalog.errors.favorites ? <ErrorBanner message={catalog.errors.favorites} onRetry={catalog.reload}/> : null}
    <ErrorBanner message={activeError} onRetry={catalog.reload}/>

    {tab === "favorites" ? <FlatList
      data={favoriteRows}
      keyExtractor={(item) => item.key}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={60}
      windowSize={5}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={catalog.loading.products || catalog.loading.shops} onRefresh={catalog.reload} tintColor={orange}/>}
      ListFooterComponent={<View className="gap-2 pt-2">{catalog.hasMore.products ? <Pressable onPress={() => void catalog.loadMore("products")} disabled={catalog.loadingMore.products} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#FFF7ED" }}>{catalog.loadingMore.products ? <ActivityIndicator color={orange}/> : <Text style={{ fontWeight: "800", color: "#9A3412" }}>আরও পছন্দের পণ্য দেখুন</Text>}</Pressable> : null}{catalog.hasMore.shops ? <Pressable onPress={() => void catalog.loadMore("shops")} disabled={catalog.loadingMore.shops} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#FFF7ED" }}>{catalog.loadingMore.shops ? <ActivityIndicator color={orange}/> : <Text style={{ fontWeight: "800", color: "#9A3412" }}>আরও পছন্দের দোকান দেখুন</Text>}</Pressable> : null}</View>}
      renderItem={({ item }) => item.kind === "heading"
        ? <Text className="mb-3 mt-3 text-base font-bold text-foreground">{item.label}</Text>
        : item.kind === "empty"
          ? <Text className="mb-6 text-sm text-muted">{item.label}</Text>
          : item.kind === "shop"
            ? <ShopCard shop={item.item} favorite onOpen={() => setSelectedShop(item.item)} onFavorite={() => { void toggleFavorite("shops", item.item.id); }}/>
            : <View className="mb-1 flex-row flex-wrap gap-2">{item.items.map((product) => <View key={product.id} className="w-[31.5%]"><ProductCard item={product} favorite onOpen={() => setSelectedProduct(product)} onFavorite={() => { void toggleFavorite("products", product.id); }}/></View>)}</View>}
    /> : tab === "products" ? <FlatList
      key="market-products-grid"
      data={filteredProducts}
      numColumns={3}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16, paddingBottom: 34, flexGrow: 1 }}
      columnWrapperStyle={{ gap: 8 }}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      updateCellsBatchingPeriod={60}
      windowSize={5}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={catalog.loading.products} onRefresh={catalog.reload} tintColor={orange}/>}
      onEndReachedThreshold={0.4}
      onEndReached={onLoadMore}
      ListHeaderComponent={<Text className="mb-2 text-xs text-muted">{filteredProducts.length} টি পণ্য দেখানো হচ্ছে{catalog.hasMore.products ? " · আরও আছে" : ""}</Text>}
      ListEmptyComponent={activeLoading ? <View className="items-center pt-16"><ActivityIndicator color={orange}/><Text className="mt-3 text-xs text-muted">পণ্য লোড হচ্ছে...</Text></View> : <View className="items-center pt-16"><Ionicons name="bag-outline" size={54} color="#CBD5E1"/><Text className="mt-4 font-bold text-foreground">{activeError ? "পণ্য লোড হয়নি" : "কোনো পণ্য পাওয়া যায়নি"}</Text><Text className="mt-2 text-center text-xs text-muted">{activeError ? "ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।" : "সার্চ বা ফিল্টার বদলে দেখুন, অথবা বিক্রেতা সেন্টারে পণ্য যোগ করুন।"}</Text></View>}
      ListFooterComponent={catalog.loadingMore.products ? <View className="items-center py-4"><ActivityIndicator color={orange}/><Text className="mt-2 text-xs text-muted">আরও পণ্য আসছে...</Text></View> : catalog.hasMore.products ? <Pressable onPress={() => void catalog.loadMore("products")} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#FFF7ED" }}><Text style={{ fontSize: 15, fontWeight: "800", color: "#9A3412" }}>আরও পণ্য দেখুন</Text></Pressable> : PAGE_FOOTER}
      renderItem={renderProduct}
    /> : <FlatList
      key="market-shops-list"
      data={filteredShops}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 34, flexGrow: 1 }}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={60}
      windowSize={5}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={catalog.loading.shops} onRefresh={catalog.reload} tintColor={orange}/>}
      onEndReachedThreshold={0.4}
      onEndReached={onLoadMore}
      ListHeaderComponent={<Text className="mb-2 text-xs text-muted">{filteredShops.length} টি দোকান দেখানো হচ্ছে{catalog.hasMore.shops ? " · আরও আছে" : ""}</Text>}
      ListEmptyComponent={catalog.loading.shops ? <View className="items-center pt-16"><ActivityIndicator color={orange}/><Text className="mt-3 text-xs text-muted">দোকান লোড হচ্ছে...</Text></View> : <View className="items-center pt-16"><Ionicons name="storefront-outline" size={54} color="#CBD5E1"/><Text className="mt-4 font-bold text-foreground">কোনো দোকান পাওয়া যায়নি</Text><Text className="mt-2 text-xs text-muted">সার্চ/এলাকা বদলান অথবা বিক্রেতা সেন্টারে দোকান যোগ করুন।</Text></View>}
      ListFooterComponent={catalog.loadingMore.shops ? <View className="items-center py-4"><ActivityIndicator color={orange}/><Text className="mt-2 text-xs text-muted">আরও দোকান আসছে...</Text></View> : catalog.hasMore.shops ? <Pressable onPress={() => void catalog.loadMore("shops")} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#FFF7ED" }}><Text style={{ fontSize: 15, fontWeight: "800", color: "#9A3412" }}>আরও দোকান দেখুন</Text></Pressable> : PAGE_FOOTER}
      renderItem={renderShop}
    />}

    <Modal visible={Boolean(selectedShop)} transparent animationType="slide" onRequestClose={() => setSelectedShop(null)}>
      <View className="flex-1 justify-end bg-black/55">
        <Pressable className="absolute inset-0" onPress={() => setSelectedShop(null)} accessibilityRole="button" accessibilityLabel="দোকানের বিবরণ বন্ধ করুন" />
        <View className="h-[92%] overflow-hidden rounded-t-[30px] bg-[#F8FAFC]">
          <View className="flex-row items-center justify-between border-b border-[#E2E8F0] bg-white px-5 py-3">
            <View className="flex-row items-center gap-2"><View className="h-2 w-2 rounded-full bg-[#16A34A]" /><Text className="text-[13px] font-extrabold uppercase tracking-[1.4px] text-[#475569]">Storefront</Text></View>
            <Pressable onPress={() => setSelectedShop(null)} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="দোকানের পেজ বন্ধ করুন"><Ionicons name="close" size={21} color="#334155"/></Pressable>
          </View>
          {selectedShop ? <FlatList
            key={`shop-products-${selectedShop.id}`}
            data={shopDetailGroups}
            keyExtractor={(group) => group.category}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 34 }}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={4}
            ListHeaderComponent={<View className="mb-5">
              <LinearGradient colors={["#7C2D12", "#C2410C", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="overflow-hidden rounded-b-[28px] px-5 pb-5 pt-6">
                <View className="flex-row items-start justify-between"><View className="rounded-full bg-white/15 px-3 py-1"><Text className="text-[11px] font-extrabold uppercase tracking-[1px] text-orange-50">Local business</Text></View><Pressable onPress={() => { void toggleFavorite("shops", selectedShop.id); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={catalog.favorites.shops[selectedShop.id] ? "পছন্দ থেকে দোকান সরান" : "দোকান পছন্দে যোগ করুন"} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)" }}><Ionicons name={catalog.favorites.shops[selectedShop.id] ? "heart" : "heart-outline"} size={18} color="white"/></Pressable></View>
                <View className="mt-5 flex-row items-center"><View className="h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-[24px] border-2 border-white/60 bg-white/20">{selectedShop.logo ? <ExpoImage source={{ uri: selectedShop.logo }} className="h-full w-full" contentFit="cover" cachePolicy="memory-disk"/> : <Ionicons name="storefront-outline" size={34} color="white"/>}</View><View className="ml-4 flex-1"><View className="flex-row items-center gap-1.5"><Text className="text-[22px] font-extrabold text-white" numberOfLines={2}>{selectedShop.name}</Text>{selectedShop.verified ? <Ionicons name="checkmark-circle" size={20} color="#BBF7D0"/> : null}</View><Text className="mt-1 text-[13px] font-semibold text-orange-100">{selectedShop.category || "স্থানীয় ব্যবসা"}{selectedShop.verified ? " · যাচাইকৃত ব্যবসা" : ""}</Text></View></View>
                {selectedShop.desc ? <Text className="mt-5 text-[13px] leading-5 text-orange-50" numberOfLines={3}>{selectedShop.desc}</Text> : null}
                <View className="mt-5 flex-row rounded-2xl bg-black/15 px-3 py-3"><View className="flex-1"><Text className="text-[19px] font-extrabold text-white">{shopDetailProducts.length}</Text><Text className="mt-0.5 text-[11px] font-semibold text-orange-100">মোট পণ্য</Text></View><View className="flex-1 border-l border-white/20 pl-3"><Text className="text-[19px] font-extrabold text-white">{shopAvailableCount}</Text><Text className="mt-0.5 text-[11px] font-semibold text-orange-100">Available</Text></View><View className="flex-1 border-l border-white/20 pl-3"><Text className="text-[19px] font-extrabold text-white">{shopDetailGroups.length}</Text><Text className="mt-0.5 text-[11px] font-semibold text-orange-100">ক্যাটাগরি</Text></View></View>
              </LinearGradient>
              <View className="mt-3 flex-row items-center rounded-2xl border border-[#E2E8F0] bg-white px-3 py-2.5"><Ionicons name="location-outline" size={18} color="#C2410C"/><Text className="ml-2 flex-1 text-[12px] font-semibold text-[#475569]" numberOfLines={1}>{[selectedShop.address, selectedShop.village, selectedShop.union].filter(Boolean).join(" · ") || "ঠিকানা উল্লেখ নেই"}</Text>{selectedShop.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${selectedShop.phone}`).catch(() => setFavoriteError("ফোন অ্যাপ খোলা যায়নি।"))} className="flex-row items-center gap-1 rounded-xl bg-[#FFF7ED] px-2.5 py-2" accessibilityRole="button"><Ionicons name="call-outline" size={15} color="#C2410C"/><Text className="text-[11px] font-extrabold text-[#9A3412]">কল</Text></Pressable> : null}</View>
              <View className="mt-5 flex-row items-end justify-between"><View><Text className="text-[20px] font-extrabold text-[#0F172A]">ক্যাটালগ</Text><Text className="mt-1 text-[12px] text-[#64748B]">ক্যাটাগরি অনুযায়ী পণ্য বেছে নিন</Text></View><Text className="text-[12px] font-bold text-[#C2410C]">{shopDetailProducts.length}টি listing</Text></View>
            </View>}
            ListEmptyComponent={catalog.shopProductsLoading[selectedShop.id] ? <View className="items-center py-12"><ActivityIndicator color={orange}/><Text className="mt-3 text-[13px] text-muted">দোকানের পণ্য লোড হচ্ছে…</Text></View> : catalog.shopProductsErrors[selectedShop.id] ? <Pressable onPress={() => void catalog.loadShopProducts(selectedShop.id)} className="rounded-2xl border border-red-200 bg-red-50 p-4"><Text className="text-center text-[13px] font-bold text-red-700">{catalog.shopProductsErrors[selectedShop.id]} · আবার চেষ্টা করুন</Text></Pressable> : <View className="items-center rounded-3xl border border-dashed border-[#CBD5E1] bg-white px-6 py-12"><Ionicons name="bag-outline" size={42} color="#CBD5E1"/><Text className="mt-3 text-[15px] font-extrabold text-[#334155]">এখনো কোনো পণ্য নেই</Text><Text className="mt-1 text-center text-[12px] text-[#64748B]">এই দোকানের নতুন পণ্য শিগগিরই এখানে দেখা যাবে।</Text></View>}
            renderItem={({ item: group }) => <View className="mb-5"><View className="mb-3 flex-row items-center justify-between"><View className="flex-row items-center gap-2"><View className="h-2 w-2 rounded-full bg-[#C2410C]"/><Text className="text-[16px] font-extrabold text-[#1E293B]">{group.category}</Text></View><Text className="text-[11px] font-bold text-[#94A3B8]">{group.products.length}টি</Text></View><View className="flex-row flex-wrap gap-2">{group.products.map((item) => <View key={item.id} className="w-[48.5%]"><ProductCard item={item} favorite={Boolean(catalog.favorites.products[item.id])} onOpen={() => { setSelectedShop(null); setSelectedProduct(item); }} onFavorite={() => { void toggleFavorite("products", item.id); }} onEdit={isSelectedShopOwner ? () => { setSelectedShop(null); setEditProductId(item.id); setSellerCenterVisible(true); } : undefined} onOrder={!isSelectedShopOwner ? () => openOrder(item) : undefined}/></View>)}</View></View>}
          /> : null}
        </View>
      </View>
    </Modal>

    <MarketplaceProductDetails key={selectedProduct?.id || "no-product"} visible={Boolean(selectedProduct) && !orderVisible} product={selectedProduct} shop={selectedProductShop} isFavorite={Boolean(selectedProduct && catalog.favorites.products[selectedProduct.id])} onToggleFavorite={() => { if (selectedProduct) void toggleFavorite("products", selectedProduct.id); }} onClose={() => setSelectedProduct(null)} onAddToCart={() => { if (selectedProduct) addToCart(selectedProduct); }} onOrder={() => { if (selectedProduct) openOrder(selectedProduct); }}/>

    <MarketSellerCenter visible={sellerCenterVisible} uid={pathargataAuth.currentUser?.uid || ""} userName={pathargataAuth.currentUser?.displayName || "বিক্রেতা"} shops={catalog.shops} products={catalog.products} initialProductId={editProductId} onClose={() => { setSellerCenterVisible(false); setEditProductId(null); catalog.reload(); }}/>

    <Modal visible={cartVisible} transparent animationType="slide" onRequestClose={() => setCartVisible(false)}>
      <View className="flex-1 justify-end bg-black/50"><Pressable className="absolute inset-0" onPress={() => setCartVisible(false)} accessibilityRole="button" accessibilityLabel="কার্ট বন্ধ করুন"/><View className="max-h-[88%] rounded-t-[30px] bg-background overflow-hidden"><View className="flex-row items-center justify-between border-b border-border px-5 py-4"><View><Text className="text-xl font-bold text-foreground">আমার কার্ট</Text><Text className="mt-1 text-xs text-muted">{cartCount} টি পণ্য · checkout-এর আগে quantity যাচাই করুন</Text></View><Pressable onPress={() => setCartVisible(false)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="কার্ট বন্ধ করুন"><Ionicons name="close" size={22} color="#334155"/></Pressable></View><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {cartItems.length ? cartItems.map(({ product, quantity }) => <View key={product.id} className="mb-3 flex-row items-center rounded-2xl border border-border bg-surface p-3"><View className="h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-orange-50">{product.images[0] || product.image ? <ExpoImage source={{ uri: product.images[0] || product.image }} className="h-full w-full" contentFit="cover" cachePolicy="memory-disk"/> : <Ionicons name="image-outline" size={24} color="#FDBA74"/>}</View><View className="ml-3 flex-1"><Text className="font-bold text-foreground" numberOfLines={2}>{product.title}</Text><Text className="mt-1 text-sm font-extrabold text-orange-700">৳ {product.price}</Text><Text className="mt-1 text-[11px] text-muted">{product.seller}</Text></View><View className="items-end"><View className="flex-row items-center rounded-xl border border-border bg-background"><Pressable onPress={() => changeCartQuantity(product.id, -1)} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="পরিমাণ কমান"><Ionicons name="remove" size={18} color="#334155"/></Pressable><Text className="min-w-8 text-center text-sm font-extrabold text-foreground">{quantity}</Text><Pressable onPress={() => changeCartQuantity(product.id, 1)} style={{ width: 38, height: 38, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="পরিমাণ বাড়ান"><Ionicons name="add" size={18} color="#C2410C"/></Pressable></View><Pressable onPress={() => setCartItems((current) => current.filter((item) => item.product.id !== product.id))} className="mt-1" accessibilityRole="button"><Text className="text-[11px] font-bold text-red-700">সরান</Text></Pressable></View></View>) : <View className="items-center rounded-3xl border border-dashed border-border px-6 py-12"><Ionicons name="cart-outline" size={52} color="#CBD5E1"/><Text className="mt-3 text-base font-bold text-foreground">কার্ট খালি</Text><Text className="mt-1 text-center text-xs text-muted">Product detail থেকে পণ্য কার্টে যোগ করুন।</Text></View>}
        {cartItems.length ? <><View className="mt-2 rounded-2xl bg-orange-50 p-4"><View className="flex-row items-center justify-between"><Text className="text-sm font-bold text-foreground">Subtotal</Text><Text className="text-lg font-extrabold text-orange-700">৳ {cartTotal}</Text></View><Text className="mt-1 text-xs text-muted">ডেলিভারি চার্জ seller checkout-এর সময় নিশ্চিত করবেন।</Text></View><Pressable onPress={openCartCheckout} style={{ minHeight: 56, marginTop: 14, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#C2410C" }} accessibilityRole="button"><Text className="text-base font-extrabold text-white">Checkout-এ যান</Text></Pressable></> : null}
      </ScrollView></View></View>
    </Modal>

    <Modal visible={orderVisible} transparent animationType="slide" onRequestClose={() => { setOrderVisible(false); setOrderError(""); }}>
      <View className="flex-1 justify-end bg-black/50"><Pressable className="absolute inset-0" onPress={() => setOrderVisible(false)} accessibilityRole="button" accessibilityLabel="অর্ডার ফর্ম বন্ধ করুন"/><View className="max-h-[92%] rounded-t-[30px] bg-background overflow-hidden"><View className="flex-row items-center justify-between border-b border-border px-5 py-4"><View className="flex-1"><Text className="text-lg font-bold text-foreground">অর্ডার নিশ্চিত করুন</Text><Text className="text-xs text-muted mt-1">এটি অর্ডার অনুরোধ; অনলাইন পেমেন্ট নয়</Text></View><Pressable onPress={() => setOrderVisible(false)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="অর্ডার ফর্ম বন্ধ করুন"><Ionicons name="close" size={22} color="#334155"/></Pressable></View><ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {checkoutItems.length ? <>{orderProduct ? <View className="rounded-2xl bg-orange-50 p-3"><Text className="font-bold text-foreground">{orderProduct.title}</Text><Text className="mt-1 text-sm font-bold text-orange-700">৳ {orderProduct.price}</Text>{orderShop ? <Text className="mt-1 text-xs text-muted">দোকান: {orderShop.name}</Text> : null}</View> : <View className="rounded-2xl bg-orange-50 p-3"><Text className="font-bold text-foreground">কার্ট checkout</Text>{checkoutItems.map(({ product, quantity }) => <View key={product.id} className="mt-2 flex-row items-center justify-between"><Text className="flex-1 text-xs text-foreground" numberOfLines={1}>{product.title} × {quantity}</Text><Text className="ml-2 text-xs font-extrabold text-orange-700">৳ {parseTakaPrice(product.price) === null ? "—" : parseTakaPrice(product.price)! * quantity}</Text></View>)}</View>}
        <Text className="mb-2 mt-4 text-xs font-bold text-foreground">আপনার তথ্য</Text>
        <TextInput className="rounded-xl border border-border bg-surface px-4 py-3 text-foreground" placeholder="আপনার নাম *" placeholderTextColor="#94A3B8" value={orderName} onChangeText={setOrderName}/>
        <TextInput className="mt-2 rounded-xl border border-border bg-surface px-4 py-3 text-foreground" placeholder="বাংলাদেশি মোবাইল নম্বর *" placeholderTextColor="#94A3B8" keyboardType="phone-pad" value={orderPhone} onChangeText={setOrderPhone}/>
        <View className="mt-4 flex-row gap-2">{([ ["delivery", "হোম ডেলিভারি"], ["pickup", "দোকান থেকে সংগ্রহ"] ] as [MarketplaceDeliveryMethod, string][]).map(([value, label]) => <Pressable key={value} onPress={() => { setDeliveryMethod(value); setPaymentMethod(value === "pickup" ? "pay_on_pickup" : "cash_on_delivery"); }} accessibilityRole="button" accessibilityState={{ selected: deliveryMethod === value }} style={{ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 14, backgroundColor: deliveryMethod === value ? "#FFEDD5" : "#FFFFFF", borderWidth: deliveryMethod === value ? 2 : 1, borderColor: deliveryMethod === value ? "#C2410C" : "#CBD5E1" }}><Text style={{ fontSize: 15, fontWeight: "800", color: deliveryMethod === value ? "#7C2D12" : "#334155", textAlign: "center" }}>{label}</Text></Pressable>)}</View>
        <TextInput className="mt-3 min-h-20 rounded-xl border border-border bg-surface px-4 py-3 text-foreground" placeholder={deliveryMethod === "delivery" ? "ডেলিভারি ঠিকানা *" : "সংগ্রহের ঠিকানা *"} placeholderTextColor="#94A3B8" value={orderAddress} onChangeText={setOrderAddress} multiline/>
        {orderProduct ? <TextInput className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-foreground" placeholder="পরিমাণ *" placeholderTextColor="#94A3B8" keyboardType="number-pad" value={orderQuantity} onChangeText={setOrderQuantity} maxLength={4}/> : null}
        <View className="mt-3 rounded-xl bg-surface p-3"><Text className="text-xs font-bold text-foreground">পেমেন্ট পদ্ধতি</Text><Text className="mt-1 text-xs text-muted">{deliveryMethod === "delivery" ? "পণ্য হাতে পাওয়ার সময় বিক্রেতাকে নগদ পরিশোধ (Cash on delivery)" : "দোকানে পণ্য নেওয়ার সময় পরিশোধ"}</Text><Text className="mt-2 text-sm font-extrabold text-orange-700">পণ্যের মোট: {checkoutTotal === null ? "বিক্রেতা নিশ্চিত করবেন" : `৳ ${checkoutTotal}`}</Text><Text className="mt-1 text-[12px] text-muted">ডেলিভারি চার্জ থাকলে বিক্রেতা অর্ডার নিশ্চিত করার আগে জানাবেন।</Text></View>
        {orderError ? <View className="mt-3 rounded-xl bg-red-50 p-3"><Text className="text-xs leading-5 text-red-800">{orderError}</Text></View> : null}
        <Pressable onPress={() => { void submitOrder(); }} disabled={orderSaving} accessibilityRole="button" style={{ minHeight: 56, marginTop: 16, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: orderSaving ? "#FDBA74" : "#C2410C" }}>{orderSaving ? <ActivityIndicator color="white"/> : <Text style={{ fontSize: 16, fontWeight: "800", color: "white" }}>অর্ডার অনুরোধ পাঠান</Text>}</Pressable>
        </> : null}
      </ScrollView></View></View>
    </Modal>
  </ScreenContainer>;
}
