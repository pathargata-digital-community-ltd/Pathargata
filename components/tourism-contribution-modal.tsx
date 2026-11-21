import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { uploadImageFromUri } from "@/lib/media-upload";
import type { TourismCategory, TourismPlace } from "@/lib/tourism";

export type TourismContributionKind = "suggestion" | "correction" | "report" | "review";
export type TourismContribution = { requestType: TourismContributionKind; placeId?: string; title: string; category: string; details: string; rating?: number; address: string; locality: string; phone: string; openingHours: string; admissionFee: string; estimatedDuration: string; images: string[] };
const categoryOptions: { id: Exclude<TourismCategory, "all">; label: string }[] = [{ id: "nature", label: "প্রকৃতি" }, { id: "history", label: "ইতিহাস" }, { id: "food_resort", label: "খাবার ও রিসোর্ট" }, { id: "culture", label: "সংস্কৃতি" }, { id: "family", label: "পরিবার" }];
export function TourismContributionModal({ visible, kind, place, onClose, onSubmit }: { visible: boolean; kind: TourismContributionKind; place?: TourismPlace | null; onClose: () => void; onSubmit: (payload: TourismContribution) => Promise<void> }) {
  const [title, setTitle] = useState(place?.title || "");
  const [category, setCategory] = useState(place?.category && place.category !== "all" ? place.category : "nature");
  const [details, setDetails] = useState(kind === "correction" && place ? `সংশোধনের অনুরোধ: ${place.title}\n` : "");
  const [address, setAddress] = useState(place?.address || "");
  const [locality, setLocality] = useState(place?.locality || "");
  const [phone, setPhone] = useState(place?.phone || "");
  const [openingHours, setOpeningHours] = useState(place?.openingHours || "");
  const [admissionFee, setAdmissionFee] = useState(place?.admissionFee || "");
  const [estimatedDuration, setEstimatedDuration] = useState(place?.estimatedDuration || "");
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<{ uri: string; mimeType?: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleLabel = kind === "suggestion" ? "নতুন স্থানের নাম *" : kind === "correction" ? "স্থানের নাম *" : "যে স্থানের তথ্য জানাচ্ছেন *";
  async function pickImages() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError("ছবি যোগ করতে গ্যালারির অনুমতি দিন; ছবি ছাড়া অনুরোধ পাঠানো যাবে।"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: Math.max(1, 3 - photos.length), quality: 0.8 });
      if (!result.canceled) setPhotos((current) => [...current, ...result.assets.slice(0, 3 - current.length).map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType }))]);
    } catch { setError("ছবি বাছাই করা যায়নি। আবার চেষ্টা করুন, অথবা ছবি ছাড়া পাঠান।"); }
  }
  async function submit() {
    if (busy) return;
    if (kind === "review" ? rating < 1 : !title.trim() || details.trim().length < 5) { setError(kind === "review" ? "জমা দেওয়ার আগে ১–৫ স্টারের মধ্যে রেটিং দিন।" : "স্থানের নাম দিন এবং বিস্তারিত কমপক্ষে ৫ অক্ষরে লিখুন।"); return; }
    setBusy(true); setError("");
    try {
      const images: string[] = [];
      if (kind === "suggestion" || kind === "correction") for (const photo of photos) images.push((await uploadImageFromUri(photo.uri, photo.mimeType || "image/jpeg")).url);
      await onSubmit({
        requestType: kind,
        ...(place?.id ? { placeId: place.id } : {}),
        title: title.trim() || place?.title || "",
        category,
        details: details.trim(),
        ...(kind === "review" ? { rating } : {}),
        address: address.trim(),
        locality: locality.trim(),
        phone: phone.trim(),
        openingHours: openingHours.trim(),
        admissionFee: admissionFee.trim(),
        estimatedDuration: estimatedDuration.trim(),
        images,
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "অনুরোধ পাঠানো যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।");
    } finally { setBusy(false); }
  }
  const input = (value: string, onChangeText: (value: string) => void, placeholder: string, multiline = false, keyboardType?: "default" | "phone-pad") => <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#64748B" multiline={multiline} keyboardType={keyboardType} textAlignVertical={multiline ? "top" : "center"} style={{ minHeight: multiline ? 88 : 46, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, backgroundColor: "white", color: "#0F172A", paddingHorizontal: 12, paddingVertical: 10, marginTop: 9, fontSize: 14 }}/ >;
  const heading = kind === "suggestion" ? "নতুন পর্যটন স্থান প্রস্তাব" : kind === "correction" ? "তথ্য সংশোধনের অনুরোধ" : kind === "review" ? "ভ্রমণ রেটিং / রিভিউ" : "ভুল তথ্য রিপোর্ট";
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.52)" }}><Pressable onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} accessibilityRole="button" accessibilityLabel="অনুরোধ ফর্ম বন্ধ করুন"/><View style={{ height: "90%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#F8FAFC", overflow: "hidden" }}>
      <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}><View style={{ flex: 1 }}><Text style={{ fontSize: 18, fontWeight: "900", color: "#0F172A" }}>{heading}</Text><Text style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>তথ্য যাচাইয়ের পর প্রকাশ করা হবে</Text></View><Pressable onPress={onClose} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="বন্ধ করুন"><Ionicons name="close" size={20} color="#334155"/></Pressable></View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 15, borderRadius: 16, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" }}><Text style={{ color: "#1E3A8A", lineHeight: 21 }}>আপনার পাঠানো তথ্য প্রশাসকের যাচাইয়ের জন্য যাবে। এটি সরাসরি পর্যটন তালিকায় প্রকাশ হবে না।</Text></View>
        {kind === "report" ? <>
          {input(title, setTitle, titleLabel)}
          <TextInput value={details} onChangeText={setDetails} placeholder="কী ভুল বা সমস্যাজনক, তা লিখুন *" placeholderTextColor="#64748B" multiline textAlignVertical="top" style={{ minHeight: 96, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, backgroundColor: "white", color: "#0F172A", paddingHorizontal: 12, paddingVertical: 10, marginTop: 9, fontSize: 14 }}/>
        </> : kind === "review" ? <>
          <Text style={{ color: "#334155", fontWeight: "800", marginTop: 16 }}>{place?.title || "दর্শনীয় স্থান"}</Text>
          <Text style={{ color: "#64748B", textAlign: "center", marginTop: 12 }}>আপনার অভিজ্ঞতা অনুযায়ী ১–৫ স্টার বেছে নিন</Text>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 8 }}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)} accessibilityRole="button" accessibilityState={{ selected: rating === value }} accessibilityLabel={`${value} স্টার`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Ionicons name={value <= rating ? "star" : "star-outline"} size={27} color={value <= rating ? "#F59E0B" : "#CBD5E1"}/></Pressable>)}</View>
          <Text style={{ color: "#92400E", textAlign: "center", fontWeight: "800", marginTop: 2 }}>{rating ? `${rating} / 5` : "রেটিং নির্বাচন করুন"}</Text>
          {input(details, setDetails, "আপনার ভ্রমণ অভিজ্ঞতা (ঐচ্ছিক)", true)}
        </> : <>
          {input(title, setTitle, titleLabel)}
          <Text style={{ fontWeight: "700", color: "#334155", marginTop: 14 }}>ক্যাটাগরি</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }}>{categoryOptions.map((option) => { const selected = category === option.id; return <Pressable key={option.id} onPress={() => setCategory(option.id)} accessibilityRole="button" accessibilityState={{ selected }} style={{ minHeight: 42, justifyContent: "center", paddingHorizontal: 11, borderRadius: 21, backgroundColor: selected ? "#EDE9FE" : "white", borderWidth: selected ? 2 : 1, borderColor: selected ? "#7C3AED" : "#CBD5E1" }}><Text style={{ color: selected ? "#5B21B6" : "#334155", fontWeight: selected ? "800" : "600" }}>{option.label}</Text></Pressable>; })}</View>
          {input(locality, setLocality, "এলাকা / গ্রাম / ইউনিয়ন")}{input(address, setAddress, "সম্পূর্ণ ঠিকানা")}
        </>}
        {kind === "suggestion" || kind === "correction" ? <>
          {input(details, setDetails, kind === "correction" ? "কী পরিবর্তন করা দরকার লিখুন *" : "স্থানটির বিবরণ *", true)}
          {input(openingHours, setOpeningHours, "খোলার সময় (জানা থাকলে)")}
          {input(admissionFee, setAdmissionFee, "প্রবেশমূল্য / আনুমানিক খরচ (ঐচ্ছিক)")}
          {input(estimatedDuration, setEstimatedDuration, "ঘুরে দেখতে আনুমানিক সময় (ঐচ্ছিক)")}
          {input(phone, setPhone, "যোগাযোগ নম্বর (ঐচ্ছিক)", false, "phone-pad")}
          <Pressable onPress={() => void pickImages()} accessibilityRole="button" style={{ minHeight: 46, marginTop: 10, borderRadius: 14, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}><Ionicons name="images-outline" size={20} color="#6D28D9"/><Text style={{ fontWeight: "800", color: "#5B21B6" }}>ছবি যোগ করুন (সর্বোচ্চ ৩টি)</Text></Pressable>
          {photos.length ? <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>{photos.map((photo, index) => <View key={`${photo.uri}-${index}`} style={{ position: "relative" }}><Image source={{ uri: photo.uri }} style={{ width: 68, height: 68, borderRadius: 12 }}/><Pressable onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))} style={{ position: "absolute", right: -4, top: -4, width: 30, height: 30, borderRadius: 15, backgroundColor: "#B91C1C", alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="নির্বাচিত ছবি সরান"><Ionicons name="close" size={18} color="white"/></Pressable></View>)}</View> : null}
        </> : null}
        {error ? <Text accessibilityRole="alert" style={{ color: "#B91C1C", marginTop: 12, lineHeight: 21 }}>{error}</Text> : null}
        <Pressable onPress={() => void submit()} disabled={busy} accessibilityRole="button" style={{ minHeight: 46, marginTop: 12, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: busy ? "#A78BFA" : "#6D28D9" }}>{busy ? <ActivityIndicator color="white"/> : <Text style={{ fontSize: 15, fontWeight: "900", color: "white" }}>অনুরোধ জমা দিন</Text>}</Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}
