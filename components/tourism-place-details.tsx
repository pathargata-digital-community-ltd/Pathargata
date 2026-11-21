import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import type { TourismNearbyService, TourismPlace } from "@/lib/tourism";
import { formatTourismDistance, tourismMapUrl } from "@/lib/tourism";

function openLink(url: string, onError: (message: string) => void) {
  void Linking.openURL(url).catch(() => onError("লিংকটি খোলা যায়নি। আবার চেষ্টা করুন।"));
}
function Fact({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string }) {
  if (!value) return null;
  return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}><Ionicons name={icon} size={20} color="#64748B"/><View style={{ flex: 1 }}><Text style={{ fontSize: 14, color: "#64748B" }}>{label}</Text><Text style={{ marginTop: 3, fontSize: 15, lineHeight: 21, color: "#0F172A", fontWeight: "600" }}>{value}</Text></View></View>;
}
export function TourismPlaceDetails({ visible, place, favorite, inPlan, nearby, nearbyLoading, nearbyError, onClose, onToggleFavorite, onTogglePlan, onReport, onRetryNearby, onShare, onReview }: {
  visible: boolean; place: TourismPlace | null; favorite: boolean; inPlan: boolean;
  nearby: TourismNearbyService[]; nearbyLoading: boolean; nearbyError: string;
  onClose: () => void; onToggleFavorite: () => void; onTogglePlan: () => void; onReport: () => void; onRetryNearby: () => void; onShare: () => void; onReview: () => void;
}) {
  const { width } = useWindowDimensions();
  const imageWidth = Math.max(260, width - 40);
  const [linkError, setLinkError] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const photos = place?.images || [];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.52)" }}>
      <Pressable onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} accessibilityRole="button" accessibilityLabel="দর্শনীয় স্থানের বিস্তারিত বন্ধ করুন" />
      <View style={{ height: "90%", borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFFFF", overflow: "hidden" }}>
        <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: "#0F172A" }}>ভ্রমণের বিস্তারিত</Text>
          <Pressable onPress={onClose} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="বন্ধ করুন"><Ionicons name="close" size={20} color="#334155"/></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          {!place ? null : <>
            <View style={{ height: 190, borderRadius: 18, overflow: "hidden", backgroundColor: "#F5F3FF" }}>
              {photos.length ? <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(event) => setActiveImage(Math.round(event.nativeEvent.contentOffset.x / imageWidth))}>{photos.map((uri, index) => <ExpoImage key={`${uri}-${index}`} source={{ uri }} style={{ width: imageWidth, height: 190 }} contentFit="cover" cachePolicy="memory-disk" transition={150} accessibilityLabel={`${place.title}, ছবি ${index + 1}`}/>)}</ScrollView> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Ionicons name="map-outline" size={56} color="#A78BFA"/><Text style={{ color: "#64748B", marginTop: 8 }}>ছবি যোগ করা হয়নি</Text></View>}
              {photos.length > 1 ? <View style={{ position: "absolute", bottom: 10, alignSelf: "center", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "rgba(15,23,42,0.72)" }}><Text style={{ color: "white", fontSize: 14 }}>{activeImage + 1} / {photos.length}</Text></View> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 16 }}>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 20, lineHeight: 27, fontWeight: "900", color: "#0F172A" }}>{place.title}</Text><Text style={{ marginTop: 5, color: "#6D28D9", fontWeight: "700" }}>{place.locality || place.address || "পাথরঘাটা"}</Text>{place.verified ? <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: "#DCFCE7" }}><Ionicons name="checkmark-circle" size={18} color="#15803D"/><Text style={{ color: "#166534", fontSize: 14, fontWeight: "800" }}>প্রশাসন-যাচাইকৃত</Text></View> : null}</View>
              <Pressable onPress={onToggleFavorite} accessibilityRole="button" accessibilityState={{ selected: favorite }} accessibilityLabel={favorite ? "পছন্দ থেকে সরান" : "পছন্দের তালিকায় যোগ করুন"} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: favorite ? "#FFF1F2" : "#F1F5F9" }}><Ionicons name={favorite ? "heart" : "heart-outline"} size={21} color={favorite ? "#E11D48" : "#475569"}/></Pressable>
            </View>
            <Text style={{ color: "#334155", fontSize: 15, lineHeight: 22, marginTop: 14 }}>{place.details}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16 }}>
              <Pressable onPress={() => openLink(tourismMapUrl(place), setLinkError)} accessibilityRole="button" style={{ minHeight: 46, flexGrow: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderRadius: 14, paddingHorizontal: 12, backgroundColor: "#DCFCE7" }}><Ionicons name="navigate-outline" size={20} color="#166534"/><Text style={{ color: "#14532D", fontWeight: "800" }}>দিকনির্দেশনা</Text></Pressable>
              {place.phone ? <Pressable onPress={() => openLink(`tel:${place.phone}`, setLinkError)} accessibilityRole="button" style={{ minHeight: 46, flexGrow: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderRadius: 14, paddingHorizontal: 12, backgroundColor: "#EDE9FE" }}><Ionicons name="call-outline" size={20} color="#6D28D9"/><Text style={{ color: "#5B21B6", fontWeight: "800" }}>যোগাযোগ</Text></Pressable> : null}
            </View>
            {linkError ? <Text style={{ marginTop: 8, color: "#B91C1C", fontSize: 15 }}>{linkError}</Text> : null}
            <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: "#E2E8F0" }}>
              <Fact icon="location-outline" label="ঠিকানা" value={place.address}/>
              <Fact icon="time-outline" label="খোলার সময়" value={place.openingHours}/>
              <Fact icon="cash-outline" label="প্রবেশমূল্য / আনুমানিক খরচ" value={place.admissionFee}/>
              <Fact icon="hourglass-outline" label="আনুমানিক সময়" value={place.estimatedDuration}/>
              <Fact icon="people-outline" label="কার জন্য উপযোগী" value={place.suitableFor}/>
              <Fact icon="information-circle-outline" label="ভ্রমণ টিপস ও সতর্কতা" value={place.tips}/>
              {place.lastUpdated ? <Fact icon="refresh-outline" label="তথ্য সর্বশেষ হালনাগাদ" value={new Date(place.lastUpdated).toLocaleDateString("bn-BD")}/> : null}
            </View>
            {place.averageRating || place.approvedReviews.length ? <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" }}><View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><Ionicons name="star" size={20} color="#D97706"/><Text style={{ fontWeight: "900", color: "#78350F" }}>{place.averageRating ? place.averageRating.toFixed(1) : "রিভিউ"}</Text><Text style={{ color: "#92400E" }}>· {place.reviewCount ?? place.approvedReviews.length}টি অনুমোদিত রিভিউ</Text></View>{place.approvedReviews.slice(0, 3).map((review) => <View key={review.id} style={{ marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#FDE68A" }}><View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Ionicons name="star" size={18} color="#D97706"/><Text style={{ color: "#78350F", fontWeight: "800" }}>{review.rating}/5</Text><Text style={{ color: "#92400E" }}>· {review.author}</Text></View>{review.comment ? <Text style={{ color: "#451A03", lineHeight: 21, marginTop: 5 }}>{review.comment}</Text> : null}</View>)}<Pressable onPress={onReview} accessibilityRole="button" style={{ minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginTop: 6, paddingHorizontal: 8 }}><Text style={{ color: "#92400E", fontWeight: "900" }}>আপনার রিভিউ দিন ›</Text></Pressable></View> : <Pressable onPress={onReview} accessibilityRole="button" style={{ minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginTop: 6, paddingHorizontal: 8 }}><Text style={{ color: "#92400E", fontWeight: "900" }}>★ প্রথম রিভিউ দিন ›</Text></Pressable>}
            <View style={{ marginTop: 22, padding: 15, borderRadius: 20, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Ionicons name="medical-outline" size={20} color="#15803D"/><Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>আশেপাশের সেবা</Text></View><Pressable onPress={() => router.push("/service/directory" as never)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 10 }}><Text style={{ color: "#166534", fontWeight: "800" }}>ডিরেক্টরি ›</Text></Pressable></View>
              {nearbyLoading ? <Text style={{ color: "#64748B", marginTop: 10 }}>নিকটবর্তী সেবা খোঁজা হচ্ছে…</Text> : null}
              {nearbyError ? <View style={{ marginTop: 8 }}><Text style={{ color: "#B91C1C", lineHeight: 20 }}>{nearbyError}</Text><Pressable onPress={onRetryNearby} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#6D28D9", fontWeight: "800" }}>আবার চেষ্টা করুন</Text></Pressable></View> : null}
              {!nearbyLoading && nearby.length ? nearby.map((service) => <View key={`${service.kind}-${service.id}`} style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: "#1E293B" }}>{service.name}</Text><Text style={{ color: "#64748B", fontSize: 14, marginTop: 3 }}>{service.kind}{service.distanceKm === undefined ? " · দূরত্ব নির্ণয় করা যায়নি" : ` · ${formatTourismDistance(service.distanceKm)}`}{service.address ? ` · ${service.address}` : ""}</Text></View>{service.phone ? <Pressable onPress={() => openLink(`tel:${service.phone}`, setLinkError)} accessibilityRole="button" style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#DCFCE7" }} accessibilityLabel={`${service.name}-এ কল করুন`}><Ionicons name="call" size={19} color="#15803D"/></Pressable> : null}<Pressable onPress={() => openLink(tourismMapUrl({ title: service.name, address: service.address, latitude: service.latitude, longitude: service.longitude }), setLinkError)} accessibilityRole="button" style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#DBEAFE" }} accessibilityLabel={`${service.name} ম্যাপে দেখুন`}><Ionicons name="map" size={19} color="#1D4ED8"/></Pressable></View>) : null}
              {!nearbyLoading && !nearbyError && !nearby.length ? <Text style={{ color: "#64748B", lineHeight: 21, marginTop: 9 }}>{place.latitude === undefined ? "এই স্থানের অবস্থান দেওয়া নেই, তাই কাছাকাছি সেবার দূরত্ব দেখানো যাচ্ছে না। ডিরেক্টরি থেকে এলাকার সেবা খুঁজুন।" : "এই স্থানের coordinates-সহ কাছাকাছি ডিরেক্টরি সেবা পাওয়া যায়নি।"}</Text> : null}
            </View>
            <View style={{ flexDirection: "row", gap: 9, marginTop: 17 }}>
              <Pressable onPress={onTogglePlan} accessibilityRole="button" accessibilityState={{ selected: inPlan }} style={{ minHeight: 46, flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, borderRadius: 15, backgroundColor: inPlan ? "#DBEAFE" : "#F1F5F9", borderWidth: inPlan ? 1 : 0, borderColor: "#2563EB" }}><Ionicons name={inPlan ? "checkmark-circle" : "add-circle-outline"} size={20} color="#1D4ED8"/><Text style={{ color: "#1E3A8A", fontWeight: "800" }}>{inPlan ? "ভ্রমণ পরিকল্পনায় আছে" : "পরিকল্পনায় যোগ"}</Text></Pressable>
              <Pressable onPress={onShare} accessibilityRole="button" style={{ width: 46, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#DBEAFE" }} accessibilityLabel="স্থানটি শেয়ার করুন"><Ionicons name="share-social-outline" size={20} color="#1D4ED8"/></Pressable>
              <Pressable onPress={onReport} accessibilityRole="button" style={{ minHeight: 46, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderRadius: 15, backgroundColor: "#FEF2F2" }}><Ionicons name="flag-outline" size={19} color="#B91C1C"/><Text style={{ color: "#991B1B", fontWeight: "800" }}>তথ্য জানান</Text></Pressable>
            </View>
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
