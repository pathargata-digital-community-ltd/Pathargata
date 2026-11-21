import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import type { TourismPlace } from "@/lib/tourism";
import { tourismMapUrl } from "@/lib/tourism";

export type TourismTripStop = { placeId: string; time: string; note: string };
export function TourismTripPlan({ visible, stops, places, onClose, onRemove, onMove, onEdit }: {
  visible: boolean; stops: TourismTripStop[]; places: TourismPlace[];
  onClose: () => void; onRemove: (id: string) => void; onMove: (id: string, direction: -1 | 1) => void;
  onEdit: (id: string, field: "time" | "note", value: string) => void;
}) {
  const [error, setError] = useState("");
  const placeById = new Map(places.map((place) => [place.id, place]));
  async function sharePlan() {
    const lines = stops.map((stop, index) => {
      const place = placeById.get(stop.placeId);
      return `${index + 1}. ${place?.title || "মুছে যাওয়া স্থান"}${stop.time ? ` — ${stop.time}` : ""}${place?.address ? ` (${place.address})` : ""}${stop.note ? `\n   নোট: ${stop.note}` : ""}`;
    });
    if (!lines.length) { setError("শেয়ার করার আগে ভ্রমণ পরিকল্পনায় স্থান যোগ করুন।"); return; }
    try {
      await Share.share({ title: "আমার পাথরঘাটা ভ্রমণ পরিকল্পনা", message: `পাথরঘাটা ভ্রমণ পরিকল্পনা\n\n${lines.join("\n\n")}` });
      setError("");
    } catch {
      setError("ভ্রমণ পরিকল্পনা শেয়ার করা যায়নি। আবার চেষ্টা করুন।");
    }
  }
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.52)" }}>
      <Pressable onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} accessibilityRole="button" accessibilityLabel="ভ্রমণ পরিকল্পনা বন্ধ করুন" />
      <View style={{ height: "88%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "#FFFFFF", overflow: "hidden" }}>
        <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}><View><Text style={{ fontSize: 18, fontWeight: "900", color: "#0F172A" }}>আমার ভ্রমণ পরিকল্পনা</Text><Text style={{ color: "#64748B", marginTop: 2 }}>{stops.length}টি স্থান · এই ডিভাইসে সংরক্ষিত</Text></View><Pressable onPress={onClose} style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" }} accessibilityRole="button" accessibilityLabel="বন্ধ করুন"><Ionicons name="close" size={22} color="#334155"/></Pressable></View>
        {error ? <Text style={{ color: "#B91C1C", marginHorizontal: 18, marginTop: 10 }}>{error}</Text> : null}
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {stops.length ? stops.map((stop, index) => {
            const place = placeById.get(stop.placeId);
            return <View key={stop.placeId} style={{ marginBottom: 10, borderRadius: 18, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC", padding: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#166534", fontWeight: "900" }}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>{place?.title || "এই স্থানটি আর তালিকায় নেই"}</Text><Text style={{ color: "#64748B", fontSize: 14, marginTop: 3 }}>{place?.locality || place?.address || "পাথরঘাটা"}</Text></View><Pressable onPress={() => onMove(stop.placeId, -1)} disabled={index === 0} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: index === 0 ? "#F1F5F9" : "#E2E8F0", alignItems: "center", justifyContent: "center", opacity: index === 0 ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel="এক ধাপ আগে নিন"><Ionicons name="arrow-up" size={19} color="#334155"/></Pressable><Pressable onPress={() => onMove(stop.placeId, 1)} disabled={index === stops.length - 1} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: index === stops.length - 1 ? "#F1F5F9" : "#E2E8F0", alignItems: "center", justifyContent: "center", opacity: index === stops.length - 1 ? 0.4 : 1 }} accessibilityRole="button" accessibilityLabel="এক ধাপ পরে নিন"><Ionicons name="arrow-down" size={19} color="#334155"/></Pressable></View>
              <TextInput value={stop.time} onChangeText={(value) => onEdit(stop.placeId, "time", value)} placeholder="সম্ভাব্য সময় (যেমন: সকাল ৯টা)" placeholderTextColor="#64748B" style={{ minHeight: 44, borderRadius: 11, paddingHorizontal: 11, marginTop: 10, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "white", color: "#0F172A" }}/>
              <TextInput value={stop.note} onChangeText={(value) => onEdit(stop.placeId, "note", value)} placeholder="ব্যক্তিগত নোট (ঐচ্ছিক)" placeholderTextColor="#64748B" maxLength={250} style={{ minHeight: 44, borderRadius: 11, paddingHorizontal: 12, marginTop: 8, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "white", color: "#0F172A" }}/>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}><Pressable onPress={() => place && void Linking.openURL(tourismMapUrl(place)).catch(() => setError("ম্যাপ খোলা যায়নি।"))} style={{ minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderRadius: 12, backgroundColor: "#DCFCE7" }}><Ionicons name="map-outline" size={18} color="#166534"/><Text style={{ color: "#14532D", fontWeight: "700" }}>ম্যাপ</Text></Pressable><Pressable onPress={() => onRemove(stop.placeId)} style={{ minHeight: 44, flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderRadius: 12, backgroundColor: "#FEF2F2" }}><Ionicons name="trash-outline" size={18} color="#B91C1C"/><Text style={{ color: "#991B1B", fontWeight: "700" }}>পরিকল্পনা থেকে বাদ</Text></Pressable></View>
            </View>;
          }) : <View style={{ alignItems: "center", paddingVertical: 60, paddingHorizontal: 20 }}><Ionicons name="map-outline" size={48} color="#CBD5E1"/><Text style={{ fontSize: 16, fontWeight: "800", color: "#334155", marginTop: 12 }}>এখনো কোনো স্থান যোগ করেননি</Text><Text style={{ textAlign: "center", color: "#64748B", lineHeight: 22, marginTop: 7 }}>ঘুরে দেখুন অংশ থেকে আপনার পছন্দের জায়গা বেছে “পরিকল্পনায় যোগ” চাপুন।</Text></View>}
        </ScrollView>
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "#E2E8F0" }}><Pressable onPress={() => void sharePlan()} style={{ minHeight: 48, borderRadius: 14, backgroundColor: "#15803D", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 }}><Ionicons name="share-social-outline" size={20} color="white"/><Text style={{ fontSize: 15, fontWeight: "900", color: "white" }}>পরিকল্পনা শেয়ার করুন</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}
