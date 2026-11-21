import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { equalTo, orderByChild, query, ref, update } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { pathargataAuth, pathargataDb, pathargataFunctions } from "@/lib/pathargata-firebase";
import {
  canTransitionMarketplaceOrder,
  getMarketplaceOrderStatusLabel,
  normalizeMarketplaceOrder,
  type MarketOrderStatus,
  type MarketplaceOrder,
} from "@/lib/market-orders";

type OrderFilter = "all" | "pending" | "active" | "completed" | "cancelled";

function orderRows(value: unknown): MarketplaceOrder[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, order]) => order && typeof order === "object")
    .map(([id, order]) => normalizeMarketplaceOrder(id, order))
    .sort((left, right) => right.time - left.time);
}

function isMissingOrderStatusFunction(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code.replace(/^functions\//, "") : "";
  return code === "not-found" || code === "internal";
}

function buildDirectStatusUpdate(order: MarketplaceOrder, status: MarketOrderStatus, uid: string) {
  const time = Date.now();
  const history = (order.statusHistory || []).slice(-49);
  history.push({ status, time, byUid: uid });
  return {
    status: status === "delivered" || status === "cancelled" ? status : "pending",
    fulfillmentStatus: status,
    statusHistory: history,
    updatedAt: time,
  };
}

function statusLabel(status: MarketOrderStatus) {
  if (status === "delivered") return { label: getMarketplaceOrderStatusLabel(status), color: "text-emerald-700", background: "bg-emerald-50" };
  if (status === "cancelled") return { label: getMarketplaceOrderStatusLabel(status), color: "text-red-700", background: "bg-red-50" };
  return { label: getMarketplaceOrderStatusLabel(status), color: "text-amber-700", background: "bg-amber-50" };
}

function sellerNextStatus(status: MarketOrderStatus): { status: MarketOrderStatus; label: string } | undefined {
  if (status === "pending") return { status: "accepted", label: "অর্ডার গ্রহণ" };
  if (status === "accepted") return { status: "preparing", label: "প্রস্তুত শুরু" };
  if (status === "preparing") return { status: "shipped", label: "পাঠানো হয়েছে" };
  if (status === "shipped") return { status: "delivered", label: "ডেলিভারি সম্পন্ন" };
  return undefined;
}

function formatOrderTime(timestamp: number) {
  if (!timestamp) return "সময় উল্লেখ নেই";
  try {
    return new Date(timestamp).toLocaleString("bn-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "সময় উল্লেখ নেই";
  }
}

function MarketOrderInboxModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const uid = pathargataAuth.currentUser?.uid;
  const [tab, setTab] = useState<"buyer" | "seller">("buyer");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [buyerOrders, setBuyerOrders] = useState<MarketplaceOrder[]>([]);
  const [sellerOrders, setSellerOrders] = useState<MarketplaceOrder[]>([]);
  const [loaded, setLoaded] = useState({ buyer: false, seller: false });
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ order: MarketplaceOrder; status: MarketOrderStatus } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!visible || !uid || retryKey < 0) return;

    let active = true;
    const buyerQuery = query(
      ref(pathargataDb, "market_orders"),
      orderByChild("buyerUid"),
      equalTo(uid),
    );
    const sellerQuery = query(
      ref(pathargataDb, "market_orders"),
      orderByChild("sellerUid"),
      equalTo(uid),
    );
    const unsubscribeBuyer = onValue(
      buyerQuery,
      (snapshot) => {
        if (!active) return;
        setBuyerOrders(orderRows(snapshot.val()));
        setLoaded((current) => ({ ...current, buyer: true }));
      },
      () => {
        if (!active) return;
        setError(
          "অর্ডারের তথ্য পড়া যায়নি। সার্ভার access permission যাচাই করুন।",
        );
        setLoaded((current) => ({ ...current, buyer: true }));
      },
    );
    const unsubscribeSeller = onValue(
      sellerQuery,
      (snapshot) => {
        if (!active) return;
        setSellerOrders(orderRows(snapshot.val()));
        setLoaded((current) => ({ ...current, seller: true }));
      },
      () => {
        if (!active) return;
        setError(
          "অর্ডারের তথ্য পড়া যায়নি। সার্ভার access permission যাচাই করুন।",
        );
        setLoaded((current) => ({ ...current, seller: true }));
      },
    );

    return () => {
      active = false;
      unsubscribeBuyer();
      unsubscribeSeller();
    };
  }, [uid, visible, retryKey]));

  async function updateStatus(
    order: MarketplaceOrder,
    status: MarketOrderStatus,
  ) {
    const sellerAction = order.sellerUid === uid;
    const buyerCancel = order.buyerUid === uid && status === "cancelled" && order.status === "pending";
    if (!uid || (!sellerAction && !buyerCancel) || !canTransitionMarketplaceOrder(order.status, status)) return;
    setUpdatingId(order.id);
    setError("");
    try {
      const updateMarketplaceOrderStatus = httpsCallable(pathargataFunctions, "updateMarketplaceOrderStatus");
      try {
        await updateMarketplaceOrderStatus({ orderId: order.id, status });
      } catch (actionError) {
        if (!isMissingOrderStatusFunction(actionError) || !uid) throw actionError;
        await update(ref(pathargataDb, `market_orders/${order.id}`), buildDirectStatusUpdate(order, status, uid));
      }
      setConfirmation(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "অর্ডারের অবস্থা পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setUpdatingId(null);
    }
  }

  function confirmStatus(order: MarketplaceOrder, status: MarketOrderStatus) {
    if (!canTransitionMarketplaceOrder(order.status, status)) return;
    setConfirmation({ order, status });
  }

  const orders = tab === "buyer" ? buyerOrders : sellerOrders;
  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "active") return ["accepted", "preparing", "shipped"].includes(order.status);
    if (filter === "completed") return order.status === "delivered";
    return order.status === filter;
  }), [filter, orders]);
  const groupSummary = useMemo(() => {
    const map = new Map<string, { items: number; subtotal: number; sellers: Set<string> }>();
    orders.forEach((order) => {
      if (!order.orderGroupId) return;
      const current = map.get(order.orderGroupId) || { items: 0, subtotal: 0, sellers: new Set<string>() };
      current.items += order.quantity;
      current.subtotal += order.totalPrice ?? (Number(order.productPrice) || 0) * order.quantity;
      current.sellers.add(order.sellerUid);
      map.set(order.orderGroupId, current);
    });
    return map;
  }, [orders]);
  const isLoading = Boolean(uid && (!loaded.buyer || !loaded.seller));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="অর্ডার তালিকা বন্ধ করুন"
        />
        <View className="h-[92%] rounded-t-[30px] bg-background overflow-hidden">
          <View className="px-5 pt-5 pb-4 border-b border-border">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xl font-bold text-foreground">
                  আমার অর্ডার
                </Text>
                <Text className="text-xs text-muted mt-1">
                  ক্রেতার ইতিহাস ও বিক্রেতার ইনবক্স
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}
                accessibilityRole="button"
                accessibilityLabel="বন্ধ করুন"
              >
                <Ionicons name="close" size={21} color="#334155" />
              </Pressable>
            </View>
            <View className="flex-row gap-2 rounded-2xl bg-surface border border-border p-2 mt-4">
              <Pressable
                onPress={() => setTab("buyer")}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === "buyer" }}
                style={{ flex: 1, minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: tab === "buyer" ? "#1D4ED8" : "#FFFFFF", borderWidth: tab === "buyer" ? 2 : 1, borderColor: tab === "buyer" ? "#1E3A8A" : "#CBD5E1" }}
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "800", textAlign: "center", color: tab === "buyer" ? "#FFFFFF" : "#334155" }}
                >
                  আমার কেনাকাটা ({buyerOrders.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab("seller")}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === "seller" }}
                style={{ flex: 1, minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, backgroundColor: tab === "seller" ? "#1D4ED8" : "#FFFFFF", borderWidth: tab === "seller" ? 2 : 1, borderColor: tab === "seller" ? "#1E3A8A" : "#CBD5E1" }}
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "800", textAlign: "center", color: tab === "seller" ? "#FFFFFF" : "#334155" }}
                >
                  বিক্রেতার ইনবক্স ({sellerOrders.length})
                </Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
              {([ ["all", "সব"], ["pending", "অপেক্ষমাণ"], ["active", "চলমান"], ["completed", "সম্পন্ন"], ["cancelled", "বাতিল"] ] as [OrderFilter, string][]).map(([value, label]) => <Pressable key={value} onPress={() => setFilter(value)} style={{ minHeight: 40, paddingHorizontal: 13, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: filter === value ? "#DBEAFE" : "#F8FAFC", borderWidth: 1, borderColor: filter === value ? "#2563EB" : "#CBD5E1" }}><Text style={{ fontSize: 13, fontWeight: "800", color: filter === value ? "#1D4ED8" : "#475569" }}>{label}</Text></Pressable>)}
            </ScrollView>
          </View>

          {!uid ? (
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons name="lock-closed-outline" size={46} color="#94A3B8" />
              <Text className="text-sm text-muted text-center mt-3">
                অর্ডার দেখতে লগইন করুন।
              </Text>
            </View>
          ) : isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#2563EB" />
              <Text className="text-sm text-muted mt-3">
                অর্ডার লোড হচ্ছে...
              </Text>
            </View>
          ) : error ? (
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons
                name="cloud-offline-outline"
                size={48}
                color="#94A3B8"
              />
              <Text className="text-sm text-muted text-center mt-3">
                {error}
              </Text>
              <Pressable onPress={() => { setError(""); setLoaded({ buyer: false, seller: false }); setRetryKey((value) => value + 1); }} style={{ minHeight: 48, marginTop: 16, paddingHorizontal: 16, borderRadius: 14, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }} accessibilityRole="button">
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#1E40AF" }}>আবার চেষ্টা করুন</Text>
              </Pressable>
            </View>
          ) : filteredOrders.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons name="receipt-outline" size={50} color="#CBD5E1" />
              <Text className="text-base font-bold text-foreground mt-4">
                {tab === "buyer"
                  ? "আপনি এখনো কোনো অর্ডার করেননি"
                  : "আপনার দোকানে এখনো কোনো অর্ডার আসেনি"}
              </Text>
              <Text className="text-xs text-muted text-center mt-2">
                নতুন অর্ডার হলে এখানে দেখা যাবে।
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredOrders.map((order) => {
                const status = statusLabel(order.status);
                const phone = order.buyerPhone.replace(/[^0-9+]/g, "");
                return (
                  <View
                    key={order.id}
                    className="rounded-3xl bg-surface border border-border p-4 mb-3"
                  >
                    <View className="flex-row items-center justify-between border-b border-border pb-3">
                      <Text className="text-[13px] text-muted font-bold">
                        অর্ডার #{order.id.slice(-6)}
                      </Text>
                      <View
                        className={`rounded-full px-2.5 py-1 ${status.background}`}
                      >
                        <Text
                          className={`text-[12px] font-bold ${status.color}`}
                        >
                          {status.label}
                        </Text>
                      </View>
                    </View>

                    {order.orderGroupId && groupSummary.get(order.orderGroupId) ? <View className="mb-3 rounded-2xl bg-blue-50 border border-blue-100 px-3 py-2"><Text className="text-[12px] font-extrabold text-blue-800">অর্ডার গ্রুপ · {groupSummary.get(order.orderGroupId)!.items}টি পণ্য · ৳ {groupSummary.get(order.orderGroupId)!.subtotal} · {groupSummary.get(order.orderGroupId)!.sellers.size} জন বিক্রেতা</Text></View> : null}
                    <View className="flex-row items-center mt-3">
                      <View className="h-16 w-16 rounded-2xl bg-slate-100 items-center justify-center overflow-hidden">
                        {order.productImage ? (
                          <Image
                            source={{ uri: order.productImage }}
                            className="h-full w-full"
                            resizeMode="contain"
                          />
                        ) : (
                          <Ionicons
                            name="image-outline"
                            size={25}
                            color="#94A3B8"
                          />
                        )}
                      </View>
                      <View className="ml-3 flex-1">
                        <Text
                          className="text-sm font-bold text-foreground"
                          numberOfLines={2}
                        >
                          {order.productTitle}
                        </Text>
                        <Text className="text-xs font-extrabold text-orange-600 mt-1">
                          ৳ {order.productPrice} × {order.quantity} টি
                        </Text>
                        <Text className="text-[12px] text-muted mt-1">
                          {order.deliveryMethod === "pickup" ? "দোকান থেকে সংগ্রহ" : "হোম ডেলিভারি"} · {order.paymentMethod === "pay_on_pickup" ? "দোকানে পরিশোধ" : "পণ্য হাতে পেয়ে নগদ"}
                        </Text>
                        <Text className="text-[12px] text-muted mt-1">
                          {tab === "buyer"
                            ? `দোকানদার: ${order.sellerName}`
                            : `ক্রেতা: ${order.buyerName}`}
                        </Text>
                      </View>
                    </View>

                    {tab === "seller" ? (
                      <View className="rounded-2xl bg-orange-50/70 border border-orange-100 p-3 mt-3">
                        <Text className="text-xs text-slate-700 leading-5">
                          ঠিকানা: {order.buyerAddress || "উল্লেখ নেই"}
                        </Text>
                        <Pressable
                          disabled={!phone}
                          onPress={() => {
                            if (phone) void Linking.openURL(`tel:${phone}`);
                          }}
                          style={{ minHeight: 48, flexDirection: "row", alignItems: "center", marginTop: 8 }}
                        >
                          <Ionicons
                            name="call-outline"
                            size={15}
                            color="#059669"
                          />
                          <Text className="text-xs font-bold text-emerald-700 ml-2">
                            {order.buyerPhone || "ফোন নম্বর নেই"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    <View className="mt-3 rounded-2xl bg-slate-50 p-3">
                      <Text className="text-[12px] font-bold text-slate-700">অর্ডারের অগ্রগতি</Text>
                      {(order.statusHistory?.length ? order.statusHistory : [{ status: order.status, time: order.time, byUid: "" }]).map((entry, index) => (
                        <View key={`${entry.status}-${entry.time}-${index}`} className="mt-2 flex-row items-center">
                          <Ionicons name="checkmark-circle" size={18} color={entry.status === order.status ? "#15803D" : "#94A3B8"} />
                          <Text className="ml-2 flex-1 text-[12px] text-slate-700">{getMarketplaceOrderStatusLabel(entry.status)}</Text>
                          <Text className="text-[11px] text-muted">{formatOrderTime(entry.time)}</Text>
                        </View>
                      ))}
                    </View>

                    <View className="flex-row items-center justify-between mt-3">
                      <Text className="text-[12px] text-muted">
                        {formatOrderTime(order.time)}
                      </Text>
                      {tab === "seller" && sellerNextStatus(order.status) ? (
                        <View className="flex-row gap-2">
                          <Pressable
                            disabled={updatingId === order.id}
                            onPress={() => confirmStatus(order, sellerNextStatus(order.status)!.status)}
                            style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" }}
                          >
                            {updatingId === order.id ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : (
                              <Text style={{ fontSize: 15, fontWeight: "800", color: "white" }}>{sellerNextStatus(order.status)!.label}</Text>
                            )}
                          </Pressable>
                          {canTransitionMarketplaceOrder(order.status, "cancelled") ? <Pressable disabled={updatingId === order.id} onPress={() => confirmStatus(order, "cancelled")} style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 15, fontWeight: "800", color: "#B91C1C" }}>বাতিল</Text></Pressable> : null}
                        </View>
                      ) : null}
                      {tab === "buyer" && order.status === "pending" ? <Pressable disabled={updatingId === order.id} onPress={() => confirmStatus(order, "cancelled")} style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 15, fontWeight: "800", color: "#B91C1C" }}>অর্ডার বাতিল</Text></Pressable> : null}
                    </View>
                    {error ? <Text className="mt-2 text-xs text-red-700">{error}</Text> : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
        {confirmation ? <View className="absolute inset-0 items-center justify-center bg-black/50 px-6" accessibilityViewIsModal>
          <View className="w-full max-w-sm rounded-3xl bg-background p-5">
            <Text className="text-lg font-bold text-foreground">অর্ডারের অবস্থা নিশ্চিত করুন</Text>
            <Text className="mt-2 text-sm leading-6 text-muted">অর্ডার #{confirmation.order.id.slice(-6)}-কে “{getMarketplaceOrderStatusLabel(confirmation.status)}” হিসেবে চিহ্নিত করবেন?</Text>
            <View className="mt-5 flex-row gap-3">
              <Pressable onPress={() => setConfirmation(null)} disabled={updatingId === confirmation.order.id} style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "800", color: "#475569" }}>ফিরে যান</Text></Pressable>
              <Pressable onPress={() => { void updateStatus(confirmation.order, confirmation.status); }} disabled={updatingId === confirmation.order.id} style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: "#047857", alignItems: "center", justifyContent: "center" }}>{updatingId === confirmation.order.id ? <ActivityIndicator color="white"/> : <Text style={{ fontWeight: "800", color: "white" }}>নিশ্চিত করুন</Text>}</Pressable>
            </View>
          </View>
        </View> : null}
      </View>
    </Modal>
  );
}

export function MarketOrderInboxLauncher() {
  const [visible, setVisible] = useState(false);

  function openInbox() {
    if (!pathargataAuth.currentUser) {
      router.push("/auth");
      return;
    }
    setVisible(true);
  }

  return (
    <>
      <Pressable
        onPress={openInbox}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFEDD5", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FDBA74" }}
        accessibilityRole="button"
        accessibilityLabel="আমার অর্ডার খুলুন"
      >
        <Ionicons name="receipt-outline" size={19} color="#EA580C" />
      </Pressable>
      {visible ? (
        <MarketOrderInboxModal
          visible={visible}
          onClose={() => setVisible(false)}
        />
      ) : null}
    </>
  );
}
