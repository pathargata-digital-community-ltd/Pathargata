import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { equalTo, get, onValue, orderByChild, query, ref, set } from "firebase/database";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

export type MarketplaceDetailProduct = {
  id: string;
  uid?: string;
  shopId?: string;
  title: string;
  price: string;
  category?: string;
  desc?: string;
  seller: string;
  image?: string;
  images?: string[];
  stock?: number;
  availability?: string;
};
export type MarketplaceDetailShop = {
  id: string;
  uid?: string;
  name: string;
  category?: string;
  phone?: string;
  address?: string;
  desc?: string;
  logo?: string;
  verified?: boolean;
};
type Review = { uid: string; rating: number; text: string; time: number; orderId: string };

function reviewRows(value: unknown): Review[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([uid, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const rating = Number(item.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return [];
    return [{ uid, rating, text: String(item.text || ""), time: Number(item.time || 0), orderId: String(item.orderId || "") }];
  }).sort((a, b) => b.time - a.time);
}

export function MarketplaceProductDetails({
  visible,
  product,
  shop,
  isFavorite,
  onToggleFavorite,
  onClose,
  onOrder,
  onAddToCart,
}: {
  visible: boolean;
  product: MarketplaceDetailProduct | null;
  shop?: MarketplaceDetailShop;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  onOrder: () => void;
  onAddToCart?: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const zoom = useSharedValue(1);
  const viewerImageStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const [reviewState, setReviewState] = useState<{ productId: string; reviews: Review[]; error: string }>({ productId: "", reviews: [], error: "" });
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewRetry, setReviewRetry] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const uid = pathargataAuth.currentUser?.uid;
  const reviews = reviewState.productId === product?.id ? reviewState.reviews : [];
  const reviewError = reviewState.productId === product?.id ? reviewState.error : "";
  const photos = useMemo(() => {
    const values = product?.images?.length ? product.images : product?.image ? [product.image] : [];
    return Array.from(new Set(values.filter(Boolean)));
  }, [product]);
  const safePhotoIndex = photos.length ? Math.min(photoIndex, photos.length - 1) : 0;
  const changePhoto = useCallback((delta: number) => {
    setPhotoIndex((index) => photos.length ? (index + delta + photos.length) % photos.length : 0);
    // Reanimated shared values are intentionally reset when paging to another image.
    // eslint-disable-next-line react-hooks/immutability
    zoom.value = withSpring(1);
  }, [photos.length, zoom]);
  const resetZoom = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    zoom.value = withSpring(1);
  }, [zoom]);
  const zoomOut = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    zoom.value = withSpring(Math.max(1, zoom.value - 0.5));
  }, [zoom]);
  const zoomIn = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    zoom.value = withSpring(Math.min(4, zoom.value + 0.5));
  }, [zoom]);
  const gallerySwipe = Gesture.Pan().activeOffsetX([-18, 18]).failOffsetY([-14, 14]).onEnd((event) => {
    if (Math.abs(event.translationX) > 45) runOnJS(changePhoto)(event.translationX < 0 ? 1 : -1);
  });
  const viewerPinch = Gesture.Pinch().onUpdate((event) => {
    // eslint-disable-next-line react-hooks/immutability
    zoom.value = Math.max(1, Math.min(4, event.scale));
  }).onEnd(() => { if (zoom.value < 1.05) {
    // eslint-disable-next-line react-hooks/immutability
    zoom.value = withSpring(1);
  } });
  const averageRating = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0;
  const hasStock = typeof product?.stock === "number" && Number.isFinite(product.stock);
  const unavailable = product?.availability === "unavailable" || product?.availability === "paused" || (hasStock && Number(product?.stock) <= 0);

  useEffect(() => {
    if (!visible || !product?.id) return;
    const productId = product.id;
    const unsubscribe = onValue(
      ref(pathargataDb, `market_reviews/${productId}`),
      (snapshot) => setReviewState({ productId, reviews: reviewRows(snapshot.val()), error: "" }),
      () => setReviewState({ productId, reviews: [], error: "রিভিউ লোড করা যায়নি। আবার চেষ্টা করুন।" }),
    );
    return unsubscribe;
  }, [visible, product?.id, reviewRetry]);

  async function submitReview() {
    const user = pathargataAuth.currentUser;
    if (!user || !product) {
      router.push("/auth");
      return;
    }
    const text = reviewText.trim();
    if (text.length > 600) {
      setActionMessage("রিভিউ ৬০০ অক্ষরের মধ্যে লিখুন।");
      return;
    }
    setReviewSaving(true);
    setActionMessage("");
    try {
      const buyerOrders = await get(query(ref(pathargataDb, "market_orders"), orderByChild("buyerUid"), equalTo(user.uid)));
      const completedOrder = Object.entries((buyerOrders.val() || {}) as Record<string, Record<string, unknown>>)
        .find(([, order]) => String(order?.buyerUid || "") === user.uid && String(order?.sellerUid || "") !== user.uid && order?.productId === product.id && String(order?.status || "").toLowerCase() === "delivered");
      if (!completedOrder) {
        setActionMessage("রিভিউ দিতে এই পণ্যটি ডেলিভারি সম্পন্ন হওয়া অর্ডারে থাকতে হবে।");
        return;
      }
      await set(ref(pathargataDb, `market_reviews/${product.id}/${user.uid}`), {
        uid: user.uid,
        rating,
        text,
        productId: product.id,
        orderId: completedOrder[0],
        time: Date.now(),
      });
      setReviewText("");
      setActionMessage("ধন্যবাদ, আপনার যাচাইকৃত ক্রয়-রিভিউ জমা হয়েছে।");
    } catch (error) {
      setActionMessage(error instanceof Error ? `রিভিউ জমা হয়নি: ${error.message}` : "রিভিউ জমা হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।");
    } finally {
      setReviewSaving(false);
    }
  }

  async function submitReport() {
    const user = pathargataAuth.currentUser;
    if (!user || !product) {
      router.push("/auth");
      return;
    }
    const reason = reportText.trim();
    if (reason.length < 5 || reason.length > 400) {
      setActionMessage("সমস্যাটি ৫ থেকে ৪০০ অক্ষরের মধ্যে লিখুন।");
      return;
    }
    setReportSaving(true);
    setActionMessage("");
    try {
      await set(ref(pathargataDb, `market_reports/${product.id}/${user.uid}`), {
        uid: user.uid,
        productId: product.id,
        reason,
        time: Date.now(),
        status: "open",
      });
      setReportOpen(false);
      setReportText("");
      setActionMessage("রিপোর্ট জমা হয়েছে। পর্যালোচনার জন্য পাঠানো হয়েছে।");
    } catch (error) {
      setActionMessage(error instanceof Error ? `রিপোর্ট জমা হয়নি: ${error.message}` : "রিপোর্ট জমা হয়নি। পরে আবার চেষ্টা করুন।");
    } finally {
      setReportSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityRole="button" accessibilityLabel="পণ্যের বিস্তারিত বন্ধ করুন" />
        <View className="max-h-[94%] rounded-t-[30px] bg-background overflow-hidden">
          <View className="flex-row items-center justify-between px-5 pt-4 pb-3 border-b border-border">
            <Text className="text-lg font-bold text-foreground flex-1" numberOfLines={1}>পণ্যের বিস্তারিত</Text>
            <Pressable onPress={onClose} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="বন্ধ করুন"><Ionicons name="close" size={22} color="#334155" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 34 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {!product ? null : <>
              <View className="h-64 rounded-3xl bg-surface overflow-hidden items-center justify-center">
                <GestureDetector gesture={gallerySwipe}>
                  <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                    {photos[safePhotoIndex] ? <Pressable onPress={() => { resetZoom(); setViewerOpen(true); }} style={{ width: "100%", height: "100%" }} accessibilityRole="button" accessibilityLabel="ছবি পূর্ণ পর্দায় দেখুন"><ExpoImage source={{ uri: photos[safePhotoIndex] }} style={{ width: "100%", height: "100%" }} contentFit="contain" cachePolicy="memory-disk" transition={160} accessibilityLabel={product.title} /></Pressable> : <Ionicons name="image-outline" size={60} color="#CBD5E1" />}
                  </View>
                </GestureDetector>
                {photos.length > 1 ? <>
                  <Pressable style={{ position: "absolute", left: 12, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }} onPress={() => changePhoto(-1)} accessibilityRole="button" accessibilityLabel="ছবি আগেরটি"><Ionicons name="chevron-back" size={22} color="#334155" /></Pressable>
                  <Pressable style={{ position: "absolute", right: 12, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }} onPress={() => changePhoto(1)} accessibilityRole="button" accessibilityLabel="ছবি পরেরটি"><Ionicons name="chevron-forward" size={22} color="#334155" /></Pressable>
                  <View className="absolute bottom-3 rounded-full bg-black/55 px-3 py-1"><Text className="text-xs text-white">{safePhotoIndex + 1} / {photos.length}</Text></View>
                </> : null}
              </View>
              <View className="flex-row items-start mt-4">
                <View className="flex-1">
                  <Text className="text-xl font-extrabold text-foreground">{product.title}</Text>
                  {product.category ? <Text className="text-xs text-muted mt-1">{product.category}</Text> : null}
                </View>
                <Pressable onPress={onToggleFavorite} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isFavorite ? "#FFF1F2" : "#F1F5F9", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityState={{ selected: isFavorite }} accessibilityLabel={isFavorite ? "পছন্দ থেকে সরান" : "পছন্দে যোগ করুন"}><Ionicons name={isFavorite ? "heart" : "heart-outline"} size={23} color={isFavorite ? "#EF4444" : "#64748B"} /></Pressable>
              </View>
              <Text className="text-2xl font-extrabold text-orange-600 mt-2">৳ {product.price}</Text>
              <View className="flex-row flex-wrap gap-2 mt-3">
                <View className={`rounded-full px-3 py-1.5 ${unavailable ? "bg-red-50" : "bg-emerald-50"}`}><Text className={`text-xs font-bold ${unavailable ? "text-red-700" : "text-emerald-700"}`}>{unavailable ? "এখন পাওয়া যাচ্ছে না" : hasStock ? `মজুত: ${product.stock} টি` : "বিক্রেতার সঙ্গে মজুত যাচাই করুন"}</Text></View>
                {averageRating > 0 ? <View className="rounded-full px-3 py-1.5 bg-amber-50"><Text className="text-xs font-bold text-amber-700">★ {averageRating.toFixed(1)} · {reviews.length} রিভিউ</Text></View> : null}
              </View>
              <Text className="text-sm leading-6 text-muted mt-4">{product.desc || "বিস্তারিত তথ্য দেওয়া হয়নি। অর্ডারের আগে বিক্রেতার সঙ্গে যাচাই করুন।"}</Text>
              {shop ? <View className="rounded-3xl bg-surface border border-border p-4 mt-5">
                <View className="flex-row items-center">
                  <View className="h-12 w-12 rounded-2xl bg-orange-50 items-center justify-center overflow-hidden">{shop.logo ? <ExpoImage source={{ uri: shop.logo }} className="w-full h-full" contentFit="cover" cachePolicy="memory-disk" /> : <Ionicons name="storefront-outline" size={23} color="#EA580C" />}</View>
                  <View className="ml-3 flex-1"><View className="flex-row items-center gap-1"><Text className="font-bold text-foreground" numberOfLines={1}>{shop.name}</Text>{shop.verified === true ? <Ionicons name="checkmark-circle" size={18} color="#15803D" /> : null}</View><Text className="text-xs text-muted mt-1">{shop.category || "স্থানীয় দোকান"}{shop.verified === true ? " · যাচাইকৃত দোকান" : ""}</Text></View>
                </View>
                {shop.address ? <Text className="text-xs text-muted mt-3">ঠিকানা: {shop.address}</Text> : null}
                {shop.desc ? <Text className="text-xs leading-5 text-muted mt-2">{shop.desc}</Text> : null}
                {shop.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${shop.phone}`).catch(() => setActionMessage("ফোন অ্যাপ খোলা যায়নি। নম্বরটি কপি করে কল করুন।"))} className="flex-row items-center mt-3"><Ionicons name="call-outline" size={18} color="#15803D" /><Text className="text-sm font-bold text-green-700 ml-2">{shop.phone} · দোকানে ফোন করুন</Text></Pressable> : null}
              </View> : <Text className="text-xs text-muted mt-4">বিক্রেতা: {product.seller}</Text>}
              <View className="flex-row items-center justify-between mt-6 mb-2"><Text className="text-base font-bold text-foreground">ক্রেতাদের রিভিউ</Text><Text className="text-xs text-muted">শুধু ডেলিভারি সম্পন্ন ক্রেতা</Text></View>
              {reviewError ? <Pressable onPress={() => setReviewRetry((value) => value + 1)} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", borderRadius: 14, backgroundColor: "#FEF2F2", paddingHorizontal: 14, paddingVertical: 10 }}><Text style={{ fontSize: 15, color: "#B91C1C" }}>{reviewError} · আবার চেষ্টা করুন</Text></Pressable> : reviews.length ? reviews.slice(0, 8).map((review) => <View key={review.uid} className="rounded-2xl bg-surface border border-border p-3 mt-2"><Text className="text-amber-600">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</Text>{review.text ? <Text className="text-sm text-foreground mt-1">{review.text}</Text> : null}</View>) : <Text className="text-xs text-muted py-2">এখনো কোনো রিভিউ নেই।</Text>}
              {uid ? <View className="rounded-2xl bg-surface border border-border p-3 mt-3"><Text className="text-xs font-bold text-foreground mb-2">আপনার রেটিং</Text><View className="flex-row gap-2">{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)} accessibilityRole="button" accessibilityState={{ selected: value <= rating }} accessibilityLabel={`${value} স্টার`} style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name={value <= rating ? "star" : "star-outline"} size={25} color="#D97706" /></Pressable>)}</View><TextInput value={reviewText} onChangeText={setReviewText} placeholder="আপনার অভিজ্ঞতা লিখুন (ঐচ্ছিক)" placeholderTextColor="#94A3B8" multiline maxLength={600} className="min-h-16 rounded-xl bg-background border border-border px-3 py-2 mt-3 text-foreground"/><Pressable disabled={reviewSaving} onPress={() => void submitReview()} accessibilityRole="button" style={{ minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: reviewSaving ? "#FCD34D" : "#B45309", marginTop: 12 }}>{reviewSaving ? <ActivityIndicator color="white"/> : <Text style={{ fontSize: 16, fontWeight: "800", color: "white" }}>রিভিউ জমা দিন</Text>}</Pressable></View> : <Text className="text-xs text-muted mt-2">রিভিউ দিতে লগইন করুন।</Text>}
              {actionMessage ? <Text className="text-xs text-blue-700 mt-3">{actionMessage}</Text> : null}
              <Pressable onPress={() => setReportOpen(true)} accessibilityRole="button" style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12 }}><Ionicons name="flag-outline" size={19} color="#B91C1C"/><Text style={{ fontSize: 15, fontWeight: "800", color: "#B91C1C", marginLeft: 8 }}>পণ্যটি রিপোর্ট করুন</Text></Pressable>
              <View className="flex-row gap-2 mt-2"><Pressable disabled={unavailable || !onAddToCart} onPress={onAddToCart} accessibilityRole="button" style={{ flex: 1, minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: unavailable || !onAddToCart ? "#E2E8F0" : "#FFF7ED", borderWidth: 1, borderColor: unavailable || !onAddToCart ? "#CBD5E1" : "#FDBA74" }}><View className="flex-row items-center gap-2"><Ionicons name="cart-outline" size={20} color={unavailable || !onAddToCart ? "#94A3B8" : "#C2410C"}/><Text style={{ fontSize: 15, fontWeight: "800", color: unavailable || !onAddToCart ? "#94A3B8" : "#9A3412" }}>কার্টে যোগ</Text></View></Pressable><Pressable disabled={unavailable} onPress={onOrder} accessibilityRole="button" style={{ flex: 1.25, minHeight: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: unavailable ? "#CBD5E1" : "#C2410C" }}><Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>{unavailable ? "অর্ডার বন্ধ" : "এখনই অর্ডার"}</Text></Pressable></View>
            </>}
          </ScrollView>
        </View>
      </View>
      <Modal visible={viewerOpen} animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
          <GestureDetector gesture={viewerPinch}>
            <Animated.View style={[{ width: "100%", height: "82%", justifyContent: "center", alignItems: "center" }, viewerImageStyle]}>
              {photos[safePhotoIndex] ? <ExpoImage source={{ uri: photos[safePhotoIndex] }} style={{ width: "100%", height: "100%" }} contentFit="contain" cachePolicy="memory-disk" accessibilityLabel={product?.title} /> : null}
            </Animated.View>
          </GestureDetector>
          <View style={{ position: "absolute", top: 48, right: 18, flexDirection: "row", gap: 12 }}>
            <Pressable onPress={zoomOut} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#334155", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="ছবি ছোট করুন"><Ionicons name="remove" size={24} color="white" /></Pressable>
            <Pressable onPress={zoomIn} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#334155", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="ছবি বড় করুন"><Ionicons name="add" size={24} color="white" /></Pressable>
            <Pressable onPress={() => { setViewerOpen(false); resetZoom(); }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#334155", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="পূর্ণ পর্দার ছবি বন্ধ করুন"><Ionicons name="close" size={24} color="white" /></Pressable>
          </View>
          {photos.length > 1 ? <View style={{ position: "absolute", bottom: 40, flexDirection: "row", alignItems: "center", gap: 24 }}>
            <Pressable onPress={() => changePhoto(-1)} style={{ padding: 12 }} accessibilityRole="button" accessibilityLabel="ছবি আগেরটি"><Ionicons name="chevron-back" size={28} color="white" /></Pressable>
            <Text style={{ color: "white" }}>{safePhotoIndex + 1} / {photos.length}</Text>
            <Pressable onPress={() => changePhoto(1)} style={{ padding: 12 }} accessibilityRole="button" accessibilityLabel="ছবি পরেরটি"><Ionicons name="chevron-forward" size={28} color="white" /></Pressable>
          </View> : null}
        </View>
      </Modal>
      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View className="flex-1 justify-center px-5 bg-black/50"><View className="rounded-3xl bg-background p-5"><Text className="text-lg font-bold text-foreground">পণ্য রিপোর্ট</Text><Text className="text-xs text-muted mt-2">ভুল তথ্য, সন্দেহজনক বা নিষিদ্ধ পণ্য হলে কারণ লিখুন।</Text><TextInput value={reportText} onChangeText={setReportText} placeholder="রিপোর্টের কারণ (৫–৪০০ অক্ষর)" placeholderTextColor="#94A3B8" multiline maxLength={400} className="min-h-24 rounded-2xl bg-surface border border-border p-3 mt-4 text-foreground"/><View className="flex-row gap-3 mt-4"><Pressable onPress={() => setReportOpen(false)} style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "800", color: "#475569" }}>ফিরে যান</Text></Pressable><Pressable disabled={reportSaving} onPress={() => void submitReport()} style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: reportSaving ? "#FCA5A5" : "#B91C1C", alignItems: "center", justifyContent: "center" }}>{reportSaving ? <ActivityIndicator color="white"/> : <Text style={{ fontWeight: "800", color: "white" }}>রিপোর্ট পাঠান</Text>}</Pressable></View></View></View>
      </Modal>
    </Modal>
  );
}
