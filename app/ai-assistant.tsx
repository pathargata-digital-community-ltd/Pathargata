import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { pathargataAuth } from "@/lib/pathargata-firebase";
import { getAiAssistantErrorMessage } from "@/lib/ai-assistant-errors";
import {
  acceptMarketplaceOrder,
  askAiAssistant,
  createBloodRequest,
  type CreateBloodRequestInput,
  type AiAction,
  type AiAssistantResponse,
  type AiCard,
} from "@/lib/ai-assistant";

const quickPrompts = [
  "ডিরেক্টরি খুঁজুন",
  "আমার অর্ডার দেখুন",
  "রক্ত সেবা খুলুন",
  "কৃষি সহায়তা",
  "অভিযোগ কেন্দ্র খুলুন",
];

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AiAssistantResponse;
};

function value(data: Record<string, unknown>, key: string, fallback = "") {
  const item = data[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : fallback;
}

function openSafeRoute(route: string) {
  const routes: Record<string, string> = {
    "/search": "/search",
    "/notifications": "/notifications",
    "/services": "/(tabs)/services",
    "/service/directory": "/service/directory",
    "/service/market": "/service/market",
    "/service/blood": "/service/blood",
    "/service/agriculture": "/service/agriculture",
    "/settings": "/settings",
  };
  const destination = routes[route];
  if (destination) router.push(destination as never);
}

function CardActions({ card }: { card: AiCard }) {
  const data = card.data;
  const phone = value(data, "phone");
  const lat = value(data, "lat");
  const lng = value(data, "lng");
  const address = value(data, "address") || value(data, "hospital_chamber");
  if (card.type !== "directory" || (!phone && !address)) return null;
  return (
    <View className="mt-3 flex-row gap-2">
      {phone ? (
        <TouchableOpacity
          className="flex-1 flex-row items-center justify-center rounded-xl bg-primary py-2.5"
          onPress={() => void Linking.openURL(`tel:${phone}`)}
          accessibilityRole="button"
          accessibilityLabel="ফোন করুন"
        >
          <Ionicons name="call-outline" size={16} color="white" />
          <Text className="ml-1.5 text-xs font-bold text-white">ফোন করুন</Text>
        </TouchableOpacity>
      ) : null}
      {lat && lng ? (
        <TouchableOpacity
          className="flex-1 flex-row items-center justify-center rounded-xl bg-blue-50 py-2.5"
          onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`)}
          accessibilityRole="button"
          accessibilityLabel="ম্যাপে দেখুন"
        >
          <Ionicons name="map-outline" size={16} color="#2563EB" />
          <Text className="ml-1.5 text-xs font-bold text-blue-700">ম্যাপে দেখুন</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ResultCard({ card }: { card: AiCard }) {
  const data = card.data;
  const title = value(data, "name") || value(data, "title") || value(data, "productTitle") || value(data, "type") || "তথ্য";
  const subtitle = card.type === "directory"
    ? [value(data, "designation") || value(data, "specialty"), value(data, "category")].filter(Boolean).join(" · ")
    : card.type === "product"
      ? [value(data, "price"), value(data, "category")].filter(Boolean).join(" · ")
      : card.type === "order"
        ? [value(data, "status", "pending"), value(data, "role")].filter(Boolean).join(" · ")
        : card.type === "notification"
          ? [value(data, "fromName"), value(data, "marketOrderStatus")].filter(Boolean).join(" · ")
          : value(data, "details") || value(data, "description");
  const details = value(data, "details") || value(data, "desc") || value(data, "description") || value(data, "address") || value(data, "productTitle");
  return (
    <View className="mt-2 rounded-2xl border border-border bg-background p-3.5">
      <View className="flex-row items-start">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-green-50">
          <Ionicons
            name={card.type === "directory" ? "business-outline" : card.type === "product" ? "storefront-outline" : card.type === "order" ? "bag-handle-outline" : "information-circle-outline"}
            size={19}
            color="#15803D"
          />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-extrabold text-foreground" numberOfLines={2}>{title}</Text>
          {subtitle ? <Text className="mt-1 text-xs font-semibold text-primary" numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>
      {details ? <Text className="mt-2 text-xs leading-5 text-muted" numberOfLines={4}>{details}</Text> : null}
      {card.type === "order" ? <Text className="mt-2 text-xs text-muted">পরিমাণ: {value(data, "quantity", "1")} · {value(data, "deliveryMethod") || "ডেলিভারি"}</Text> : null}
      <CardActions card={card} />
    </View>
  );
}

function ActionButton({ action, onPress }: { action: AiAction; onPress: (action: AiAction) => void }) {
  if (action.kind !== "open_route" && action.kind !== "open_blood_request" && action.kind !== "confirm_order") return null;
  const route = action.payload?.route || "";
  return (
    <TouchableOpacity
      className="mt-2 flex-row items-center self-start rounded-xl bg-green-50 px-3 py-2.5"
      onPress={() => action.kind === "open_route" ? openSafeRoute(route) : onPress(action)}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <Ionicons name={action.kind === "confirm_order" ? "bag-check-outline" : action.kind === "open_blood_request" ? "water-outline" : "arrow-forward-circle-outline"} size={17} color="#15803D" />
      <Text className="ml-1.5 text-xs font-bold text-primary">{action.label}</Text>
    </TouchableOpacity>
  );
}

function BloodRequestPopup({
  visible,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateBloodRequestInput) => void;
  busy: boolean;
  error: string;
}) {
  const [form, setForm] = useState<CreateBloodRequestInput>({ bloodGroup: "A+", hospital: "", area: "", units: "1", urgency: "critical", neededAt: "", contact: "", patientName: "", details: "" });
  const groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const urgencies = [["critical", "এখনই"], ["today", "আজকের মধ্যে"], ["planned", "আগাম"]];
  const set = (key: keyof CreateBloodRequestInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="absolute inset-0" onPress={busy ? undefined : onClose} />
        <View className="max-h-[92%] rounded-t-[30px] bg-background px-5 pb-6 pt-5">
          <View className="flex-row items-center justify-between border-b border-border pb-4">
            <View><Text className="text-xl font-extrabold text-foreground">রক্তের অনুরোধ</Text><Text className="mt-1 text-xs text-muted">শুধু প্রয়োজনীয় তথ্য দিন</Text></View>
            <TouchableOpacity onPress={onClose} disabled={busy} className="h-10 w-10 items-center justify-center rounded-full bg-surface"><Ionicons name="close" size={21} color="#334155" /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 16, paddingBottom: 18 }}>
            <Text className="mb-2 text-xs font-bold text-muted">রক্তের গ্রুপ</Text>
            <View className="flex-row flex-wrap gap-2">{groups.map((group) => <TouchableOpacity key={group} onPress={() => set("bloodGroup", group)} className={`rounded-xl px-3.5 py-2.5 ${form.bloodGroup === group ? "bg-red-600" : "border border-border bg-surface"}`}><Text className={`text-xs font-extrabold ${form.bloodGroup === group ? "text-white" : "text-foreground"}`}>{group}</Text></TouchableOpacity>)}</View>
            <TextInput value={form.hospital} onChangeText={(value) => set("hospital", value)} placeholder="হাসপাতাল/ক্লিনিক *" placeholderTextColor="#94A3B8" className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" />
            <TextInput value={form.area} onChangeText={(value) => set("area", value)} placeholder="এলাকা *" placeholderTextColor="#94A3B8" className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" />
            <View className="mt-3 flex-row gap-3"><TextInput value={form.units} onChangeText={(value) => set("units", value.replace(/[^0-9]/g, ""))} placeholder="ইউনিট" keyboardType="number-pad" placeholderTextColor="#94A3B8" className="w-24 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" /><TextInput value={form.neededAt} onChangeText={(value) => set("neededAt", value)} placeholder="কখন প্রয়োজন *" placeholderTextColor="#94A3B8" className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" /></View>
            <Text className="mb-2 mt-4 text-xs font-bold text-muted">জরুরিতা</Text>
            <View className="flex-row gap-2">{urgencies.map(([id, label]) => <TouchableOpacity key={id} onPress={() => set("urgency", id)} className={`flex-1 items-center rounded-xl py-2.5 ${form.urgency === id ? "bg-red-600" : "border border-border bg-surface"}`}><Text className={`text-xs font-bold ${form.urgency === id ? "text-white" : "text-foreground"}`}>{label}</Text></TouchableOpacity>)}</View>
            <TextInput value={form.contact} onChangeText={(value) => set("contact", value)} placeholder="যোগাযোগ নম্বর *" keyboardType="phone-pad" placeholderTextColor="#94A3B8" className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" />
            <TextInput value={form.patientName} onChangeText={(value) => set("patientName", value)} placeholder="রোগীর নাম (ঐচ্ছিক)" placeholderTextColor="#94A3B8" className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" />
            <TextInput value={form.details} onChangeText={(value) => set("details", value)} placeholder="অতিরিক্ত তথ্য (ঐচ্ছিক)" multiline placeholderTextColor="#94A3B8" className="mt-3 min-h-20 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm text-foreground" />
            {error ? <Text className="mt-3 text-xs font-semibold leading-5 text-red-700">{error}</Text> : null}
            <TouchableOpacity disabled={busy} onPress={() => onSubmit(form)} className={`mt-4 flex-row items-center justify-center rounded-2xl py-3.5 ${busy ? "bg-slate-300" : "bg-red-600"}`}><Ionicons name="send-outline" size={18} color="white" /><Text className="ml-2 text-sm font-extrabold text-white">{busy ? "পাঠানো হচ্ছে..." : "অনুরোধ পাঠান"}</Text></TouchableOpacity>
            <Text className="mt-2 text-center text-[10px] leading-4 text-muted">আপনার যোগাযোগ নম্বর public তালিকায় দেখানো হবে না।</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OrderConfirmationPopup({
  visible,
  orderTitle,
  quantity,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  visible: boolean;
  orderTitle: string;
  quantity: string;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <View className="flex-1 justify-end bg-black/50"><Pressable className="absolute inset-0" onPress={busy ? undefined : onClose} />
        <View className="rounded-t-[30px] bg-background px-5 pb-8 pt-6">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-blue-50"><Ionicons name="bag-check-outline" size={29} color="#2563EB" /></View>
          <Text className="mt-4 text-xl font-extrabold text-foreground">অর্ডার গ্রহণ করবেন?</Text>
          <Text className="mt-2 text-sm leading-6 text-muted">আপনি কি <Text className="font-bold text-foreground">{orderTitle}</Text> পণ্যের {quantity}টি অর্ডার গ্রহণ করতে চান? গ্রহণ করলে buyer-কে notification পাঠানো হবে।</Text>
          {error ? <Text className="mt-3 text-xs font-semibold leading-5 text-red-700">{error}</Text> : null}
          <View className="mt-5 flex-row gap-3"><TouchableOpacity disabled={busy} onPress={onClose} className="flex-1 items-center rounded-2xl border border-border bg-surface py-3.5"><Text className="text-sm font-bold text-foreground">এখন নয়</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={onConfirm} className={`flex-1 items-center rounded-2xl py-3.5 ${busy ? "bg-slate-300" : "bg-blue-600"}`}><Text className="text-sm font-extrabold text-white">{busy ? "আপডেট হচ্ছে..." : "হ্যাঁ, গ্রহণ করুন"}</Text></TouchableOpacity></View>
        </View>
      </View>
    </Modal>
  );
}

export default function AiAssistantScreen() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [bloodPopup, setBloodPopup] = useState(false);
  const [bloodBusy, setBloodBusy] = useState(false);
  const [bloodError, setBloodError] = useState("");
  const [orderAction, setOrderAction] = useState<AiAction | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const messageSequence = useRef(0);
  const signedIn = Boolean(pathargataAuth.currentUser);
  const history = useMemo(
    () => items.slice(-8).map((item) => ({ role: item.role, content: item.content })),
    [items],
  );

  async function sendMessage(message = draft) {
    const content = message.trim();
    if (!content || busy || !signedIn) return;
    setDraft("");
    setBusy(true);
    messageSequence.current += 1;
    const userItem: ChatItem = { id: `user-${messageSequence.current}`, role: "user", content };
    setItems((current) => [...current, userItem]);
    try {
      const response = await askAiAssistant(content, history);
      setItems((current) => [...current, {
        id: `assistant-${messageSequence.current}-response`,
        role: "assistant",
        content: response.text,
        response,
      }]);
    } catch (error) {
      const text = getAiAssistantErrorMessage(error);
      setItems((current) => [...current, { id: `error-${messageSequence.current}`, role: "assistant", content: text }]);
    } finally {
      setBusy(false);
    }
  }

  function actionError(error: unknown, fallback: string) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code.includes("already-exists")) return "এই কাজটি আগে থেকেই সম্পন্ন হয়েছে বা একই তথ্যের active request আছে।";
    if (code.includes("permission-denied")) return "এই অর্ডারটি গ্রহণ করার অনুমতি আপনার নেই।";
    if (code.includes("failed-precondition")) return "অর্ডারটি এখন আর pending নেই। তালিকা refresh করে আবার দেখুন।";
    return fallback;
  }

  function handleAction(action: AiAction) {
    if (action.kind === "open_blood_request") {
      setBloodError("");
      setBloodPopup(true);
    } else if (action.kind === "confirm_order") {
      setOrderError("");
      setOrderAction(action);
    }
  }

  async function submitBloodRequest(input: CreateBloodRequestInput) {
    if (bloodBusy) return;
    setBloodBusy(true);
    setBloodError("");
    try {
      const result = await createBloodRequest(input);
      setBloodPopup(false);
      setItems((current) => [...current, {
        id: `blood-${Date.now()}`,
        role: "assistant",
        content: result.duplicate ? "এই রক্তের অনুরোধটি আগেই পাঠানো হয়েছিল।" : `রক্তের অনুরোধ পাঠানো হয়েছে। Tracking ID: ${result.trackingId || result.requestId}`,
        response: { text: "", intent: "search_result", cards: [], actions: [{ id: "blood-view", label: "রক্ত সেবা দেখুন", kind: "open_route", payload: { route: "/service/blood" } }] },
      }]);
    } catch (error) {
      setBloodError(actionError(error, "রক্তের অনুরোধ পাঠানো যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন."));
    } finally {
      setBloodBusy(false);
    }
  }

  async function confirmOrder() {
    const orderId = orderAction?.payload?.orderId;
    if (!orderId || orderBusy) return;
    setOrderBusy(true);
    setOrderError("");
    try {
      await acceptMarketplaceOrder(orderId);
      const title = orderAction?.payload?.productTitle || "পণ্য";
      setOrderAction(null);
      setItems((current) => [...current, {
        id: `order-${Date.now()}`,
        role: "assistant",
        content: `“${title}” অর্ডারটি গ্রহণ করা হয়েছে। Buyer-কে notification পাঠানো হবে.`,
        response: { text: "", intent: "search_result", cards: [], actions: [{ id: "orders-view", label: "Notification দেখুন", kind: "open_route", payload: { route: "/notifications" } }] },
      }]);
    } catch (error) {
      setOrderError(actionError(error, "অর্ডারটি গ্রহণ করা যায়নি। অর্ডারটি হয়তো ইতিমধ্যে আপডেট হয়েছে।"));
    } finally {
      setOrderBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <ScreenContainer className="bg-background">
        <View className="flex-1 items-center justify-center px-7">
          <View className="h-20 w-20 items-center justify-center rounded-3xl bg-violet-100">
            <Ionicons name="sparkles-outline" size={38} color="#7C3AED" />
          </View>
          <Text className="mt-5 text-center text-xl font-extrabold text-foreground">AI সহকারী ব্যবহার করুন</Text>
          <Text className="mt-2 text-center text-sm leading-6 text-muted">অ্যাপের directory, marketplace এবং নিজের তথ্য নিরাপদভাবে খুঁজতে আগে লগইন করুন।</Text>
          <TouchableOpacity className="mt-6 rounded-2xl bg-primary px-6 py-3.5" onPress={() => router.push("/auth" as never)}>
            <Text className="font-bold text-white">লগইন করুন</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="flex-row items-center border-b border-border px-5 pb-4 pt-3">
          <TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-surface" onPress={() => router.back()} accessibilityLabel="পেছনে যান">
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </TouchableOpacity>
          <View className="ml-3 flex-1">
            <Text className="text-xl font-extrabold text-foreground">AI সহকারী</Text>
            <Text className="mt-1 text-xs text-muted">তথ্য খুঁজুন, সেবা ব্যবহার করুন</Text>
          </View>
          <TouchableOpacity onPress={() => setItems([])} accessibilityLabel="কথোপকথন পরিষ্কার করুন" className="h-10 w-10 items-center justify-center rounded-full bg-surface">
            <Ionicons name="trash-outline" size={19} color="#64748B" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingBottom: 18, flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 justify-center">
              <View className="rounded-3xl bg-[#F5F3FF] p-5">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-violet-100"><Ionicons name="sparkles-outline" size={26} color="#7C3AED" /></View>
                <Text className="mt-4 text-xl font-extrabold text-foreground">কী খুঁজতে চান?</Text>
                <Text className="mt-2 text-sm leading-6 text-muted">Directory, marketplace, notification এবং অ্যাপের সেবা সম্পর্কে সহজ বাংলায় জিজ্ঞেস করুন।</Text>
              </View>
              <View className="mt-5 flex-row flex-wrap gap-2">
                {quickPrompts.map((prompt) => <Pressable key={prompt} onPress={() => void sendMessage(prompt)} disabled={busy} className="rounded-full border border-border bg-surface px-3.5 py-2.5"><Text className="text-xs font-semibold text-foreground">{prompt}</Text></Pressable>)}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className={`mb-3 ${item.role === "user" ? "items-end" : "items-start"}`}>
              <View className={`max-w-[92%] rounded-2xl px-4 py-3 ${item.role === "user" ? "rounded-br-md bg-primary" : "rounded-bl-md border border-border bg-surface"}`}>
                <Text className={`text-sm leading-6 ${item.role === "user" ? "text-white" : "text-foreground"}`}>{item.content}</Text>
                {item.response?.cards?.map((card, index) => <ResultCard key={`${card.type}-${index}`} card={card} />)}
                {item.response?.actions?.map((action) => <ActionButton key={action.id} action={action} onPress={handleAction} />)}
              </View>
            </View>
          )}
          ListFooterComponent={busy ? <View className="mb-3 items-start"><View className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3"><ActivityIndicator size="small" color="#15803D" /></View></View> : null}
        />
        <View className="border-t border-border bg-background px-4 pb-3 pt-2">
          <View className="flex-row items-end rounded-2xl border border-border bg-surface px-3 py-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="যেমন: ফায়ার সার্ভিসের নম্বর দেখাও"
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={500}
              editable={!busy}
              className="max-h-24 min-h-10 flex-1 px-1 py-2 text-sm leading-5 text-foreground"
              onSubmitEditing={() => void sendMessage()}
            />
            <TouchableOpacity onPress={() => void sendMessage()} disabled={busy || !draft.trim()} className={`ml-2 h-10 w-10 items-center justify-center rounded-xl ${busy || !draft.trim() ? "bg-slate-200" : "bg-primary"}`} accessibilityLabel="বার্তা পাঠান">
              <Ionicons name="arrow-up" size={20} color={busy || !draft.trim() ? "#94A3B8" : "white"} />
            </TouchableOpacity>
          </View>
          <Text className="mt-1 text-center text-[10px] text-muted">AI শুধু অনুমোদিত তথ্য ব্যবহার করে। গুরুত্বপূর্ণ কাজের আগে আপনার অনুমতি লাগবে।</Text>
        </View>
      </KeyboardAvoidingView>
      <BloodRequestPopup visible={bloodPopup} onClose={() => { if (!bloodBusy) setBloodPopup(false); }} onSubmit={submitBloodRequest} busy={bloodBusy} error={bloodError} />
      <OrderConfirmationPopup visible={Boolean(orderAction)} orderTitle={orderAction?.payload?.productTitle || "পণ্য"} quantity={orderAction?.payload?.quantity || "1"} onClose={() => { if (!orderBusy) setOrderAction(null); }} onConfirm={() => void confirmOrder()} busy={orderBusy} error={orderError} />
    </ScreenContainer>
  );
}
