import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { get, ref } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SectionList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  notificationSummary,
  useNotifications,
  type AppNotification,
} from "@/hooks/use-notifications";
import { pathargataAuth, pathargataDb, pathargataFunctions } from "@/lib/pathargata-firebase";

type NotificationFilter = "all" | "unread" | "social" | "messages" | "urgent" | "market";
type NotificationRow = AppNotification & {
  notificationIds: string[];
  count: number;
  fromNames: string[];
};
type NotificationSection = { title: string; data: NotificationRow[] };

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "সব" },
  { id: "unread", label: "না-পড়া" },
  { id: "social", label: "সামাজিক" },
  { id: "messages", label: "মেসেজ" },
  { id: "market", label: "অর্ডার" },
  { id: "urgent", label: "জরুরি" },
];
const DAY_ORDER = ["আজ", "গতকাল", "আগের"];

function notificationCategory(type: string): NotificationFilter {
  if (["like", "comment", "reply", "post_tag", "repost"].includes(type)) return "social";
  if (type === "chat") return "messages";
  if (type === "market_order" || type === "market_order_update") return "market";
  if (type === "blood_req") return "urgent";
  return "all";
}

function notificationTime(timestamp?: number) {
  if (!timestamp) return "সময় পাওয়া যায়নি";
  return new Date(timestamp).toLocaleTimeString("bn-BD", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(timestamp?: number) {
  if (!timestamp) return "সাম্প্রতিক";
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes} মিনিট আগে`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  return `${Math.floor(hours / 24)} দিন আগে`;
}

function dayLabel(timestamp?: number) {
  if (!timestamp) return "আগের";
  const date = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.floor((startOfToday - startOfDate) / 86400000);
  if (daysAgo === 0) return "আজ";
  if (daysAgo === 1) return "গতকাল";
  return "আগের";
}

function actorLabel(row: NotificationRow) {
  const names = row.fromNames.filter(Boolean);
  if (!names.length) return "একজন ব্যবহারকারী";
  if (names.length === 1) return names[0];
  return `${names[0]} ও আরও ${names.length - 1} জন`;
}

function notificationText(row: NotificationRow) {
  const actor = actorLabel(row);
  if (row.type === "market_order" || row.type === "market_order_update") return notificationSummary(row);
  if (row.type === "like") {
    return row.count > 1
      ? `${row.count} জন আপনার পোস্টে ভালো লেগেছে দিয়েছেন`
      : `${actor} আপনার পোস্টে ভালো লেগেছে দিয়েছেন`;
  }
  if (row.type === "comment") return `${actor} আপনার পোস্টে মন্তব্য করেছেন`;
  if (row.type === "reply") return `${actor} আপনার মন্তব্যের উত্তর দিয়েছেন`;
  if (row.type === "post_tag") return `${actor} আপনাকে পোস্টে উল্লেখ করেছেন`;
  if (row.type === "repost") return `${actor} আপনার পোস্ট রিপোস্ট করেছেন`;
  if (row.type === "blood_req") return "জরুরি রক্তের অনুরোধ এসেছে";
  if (row.type === "chat") return `${actor} আপনাকে মেসেজ করেছেন`;
  return "আপনার জন্য নতুন আপডেট এসেছে";
}

function iconFor(type: string) {
  if (type === "like") return "heart" as const;
  if (type === "comment" || type === "reply" || type === "chat") {
    return "chatbubble" as const;
  }
  if (type === "post_tag") return "at" as const;
  if (type === "repost") return "repeat" as const;
  if (type === "market_order" || type === "market_order_update") return "bag-handle" as const;
  if (type === "blood_req") return "water" as const;
  return "notifications" as const;
}

function aggregateNotifications(items: AppNotification[]) {
  const grouped = new Map<string, NotificationRow>();
  for (const item of items) {
    const groupKey = item.type === "like" && item.postId
      ? `like:${item.postId}`
      : `notification:${item.id}`;
    const timestamp = item.sentAt || item.timestamp || 0;
    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, {
        ...item,
        notificationIds: [item.id],
        count: 1,
        fromNames: item.fromName ? [item.fromName] : [],
      });
      continue;
    }

    existing.notificationIds.push(item.id);
    existing.count += 1;
    if (item.fromName && !existing.fromNames.includes(item.fromName)) {
      existing.fromNames.push(item.fromName);
    }
    if (!existing.fromPhoto && item.fromPhoto) existing.fromPhoto = item.fromPhoto;
    if (!existing.postPreview && item.postPreview) {
      existing.postPreview = item.postPreview;
    }
    const allRecordsRead = Boolean(existing.read && item.read);
    if ((existing.sentAt || existing.timestamp || 0) < timestamp) {
      existing.sentAt = item.sentAt;
      existing.timestamp = item.timestamp;
      existing.fromUid = item.fromUid || existing.fromUid;
    }
    existing.read = allRecordsRead;
  }
  return [...grouped.values()].sort(
    (a, b) =>
      (b.sentAt || b.timestamp || 0) - (a.sentAt || a.timestamp || 0) ||
      b.id.localeCompare(a.id),
  );
}

function Avatar({ row }: { row: NotificationRow }) {
  if (row.fromPhoto) {
    return (
      <Image
        source={{ uri: row.fromPhoto }}
        className="h-12 w-12 rounded-2xl"
        accessibilityLabel={`${actorLabel(row)}-এর ছবি`}
      />
    );
  }
  return (
    <View
      className={`h-12 w-12 rounded-2xl items-center justify-center ${row.type === "blood_req" ? "bg-red-100" : "bg-green-100"}`}
    >
      <Ionicons
        name={iconFor(row.type)}
        size={22}
        color={row.type === "blood_req" ? "#DC2626" : "#15803D"}
      />
    </View>
  );
}

export default function NotificationsScreen() {
  const {
    items,
    unreadCount,
    markRead,
    markUnread,
    markAllRead,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    retry,
    error,
  } = useNotifications();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [acceptedOrderIds, setAcceptedOrderIds] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => {
    const aggregated = aggregateNotifications(items);
    return aggregated.filter((item) => {
      if (filter === "all") return true;
      if (filter === "unread") return !item.read;
      return notificationCategory(item.type) === filter;
    });
  }, [filter, items]);

  const sections = useMemo<NotificationSection[]>(() => {
    const grouped = new Map<string, NotificationRow[]>();
    for (const row of rows) {
      const title = dayLabel(row.sentAt || row.timestamp);
      const current = grouped.get(title) || [];
      current.push(row);
      grouped.set(title, current);
    }
    return DAY_ORDER.filter((title) => grouped.has(title)).map((title) => ({
      title,
      data: grouped.get(title) || [],
    }));
  }, [rows]);

  if (!pathargataAuth.currentUser) {
    return (
      <ScreenContainer className="bg-background p-5">
        <TouchableOpacity
          className="h-10 w-10 rounded-full bg-surface items-center justify-center mb-8"
          onPress={() => safeGoBack("/(tabs)")}
        >
          <Ionicons name="arrow-back" size={21} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1 items-center justify-center">
          <Ionicons name="notifications-off-outline" size={66} color="#94A3B8" />
          <Text className="text-lg font-bold text-foreground mt-4">
            নোটিফিকেশন দেখতে লগইন করুন
          </Text>
          <TouchableOpacity
            className="rounded-full bg-primary px-5 py-3 mt-5"
            onPress={() => router.push("/auth")}
          >
            <Text className="font-bold text-white">লগইন করুন</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  async function openNotification(row: NotificationRow) {
    await markRead(row.notificationIds);
    if (row.postId) {
      router.push({
        pathname: "/post/[id]" as any,
        params: { id: row.postId },
      });
      return;
    }
    if (row.type === "blood_req") {
      const requestId = row.bloodRequestId || row.requestId;
      if (requestId) {
        router.push({
          pathname: "/service/blood" as any,
          params: { requestId },
        });
      } else {
        router.push("/service/blood" as any);
      }
      return;
    }
    if (row.type === "market_order" || row.type === "market_order_update") return;
    if (row.type === "chat" && row.fromUid) {
      router.push({
        pathname: "/messages",
        params: { uid: row.fromUid, name: row.fromName || "User" },
      });
    }
  }

  async function acceptMarketplaceOrder(row: NotificationRow) {
    const uid = pathargataAuth.currentUser?.uid;
    if (!uid || row.type !== "market_order" || !row.orderId || updatingOrderId) return;
    setUpdatingOrderId(row.orderId);
    try {
      const orderRef = ref(pathargataDb, `market_orders/${row.orderId}`);
      const snapshot = await get(orderRef);
      const order = snapshot.val() as Record<string, unknown> | null;
      if (!order || order.sellerUid !== uid || String(order.fulfillmentStatus || order.status) !== "pending") throw new Error("এই অর্ডারটি আর pending নেই।");
      const updateMarketplaceOrderStatus = httpsCallable(pathargataFunctions, "updateMarketplaceOrderStatus");
      await updateMarketplaceOrderStatus({ orderId: row.orderId, status: "accepted" });
      setAcceptedOrderIds((current) => new Set(current).add(row.orderId as string));
      await markRead(row.notificationIds);
    } catch {
      // The order remains visible and can be retried from the seller inbox.
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function emptyState() {
    if (loading) {
      return (
        <View className="items-center pt-24">
          <ActivityIndicator color="#15803D" />
          <Text className="text-sm text-muted mt-3">নোটিফিকেশন লোড হচ্ছে...</Text>
        </View>
      );
    }
    if (error && items.length === 0) {
      return (
        <View className="items-center pt-20 px-5">
          <Ionicons name="cloud-offline-outline" size={56} color="#CBD5E1" />
          <Text className="text-base font-bold text-foreground mt-4">নোটিফিকেশন আনা যায়নি</Text>
          <Text className="text-sm text-error text-center mt-2">{error}</Text>
          <TouchableOpacity
            className="rounded-full bg-primary px-5 py-3 mt-5"
            onPress={retry}
            accessibilityRole="button"
          >
            <Text className="font-bold text-white">আবার চেষ্টা করুন</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View className="items-center pt-20 px-5">
        <Ionicons
          name={items.length ? "funnel-outline" : "notifications-outline"}
          size={58}
          color="#CBD5E1"
        />
        <Text className="text-base font-bold text-foreground mt-4">
          {items.length ? "এই filter-এ কোনো notification নেই" : "কোনো নোটিফিকেশন নেই"}
        </Text>
        <Text className="text-sm text-muted text-center mt-2">
          {items.length
            ? "অন্য filter বেছে নিয়ে আবার দেখুন।"
            : "নতুন like, comment বা message এলে এখানে দেখতে পাবেন।"}
        </Text>
      </View>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <View className="px-5 pt-3 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <TouchableOpacity
            className="h-10 w-10 rounded-full bg-surface items-center justify-center"
            onPress={() => safeGoBack("/(tabs)")}
            accessibilityLabel="ফিরে যান"
          >
            <Ionicons name="arrow-back" size={21} color="#334155" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-2xl font-bold text-foreground">নোটিফিকেশন</Text>
            <Text className="text-xs text-muted mt-1">
              {unreadCount ? `${unreadCount}টি না-পড়া আপডেট` : "সব আপডেট দেখা হয়েছে"}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            className="h-10 w-10 rounded-full bg-surface items-center justify-center"
            onPress={() => router.push("/settings")}
            accessibilityLabel="নোটিফিকেশন সেটিংস খুলুন"
          >
            <Ionicons name="settings-outline" size={20} color="#64748B" />
          </TouchableOpacity>
          {unreadCount > 0 ? (
            <TouchableOpacity
              className="rounded-full bg-green-50 px-3 py-2"
              onPress={() => void markAllRead()}
              accessibilityRole="button"
            >
              <Text className="text-xs font-bold text-primary">সব পড়ুন</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View className="px-5 pb-3">
        <View className="rounded-2xl bg-green-50 border border-green-100 px-3 py-2.5 flex-row items-center">
          <Ionicons name="shield-checkmark-outline" size={18} color="#15803D" />
          <Text className="ml-2 flex-1 text-xs leading-4 text-green-900">
            জরুরি alert-এ ব্যক্তিগত ফোন, রোগীর তথ্য বা donor contact দেখানো হয় না।
          </Text>
        </View>
      </View>

      <View className="pb-3">
        <View className="px-5">
          <Text className="text-sm font-bold text-foreground mb-2">দ্রুত filter</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 20, paddingRight: 20, gap: 8 }}>
          <View className="flex-row gap-2">
            {FILTERS.map((item) => (
              <TouchableOpacity
                key={item.id}
                className={`rounded-full border px-4 py-2.5 ${filter === item.id ? "bg-primary border-primary" : "bg-surface border-border"}`}
                onPress={() => setFilter(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === item.id }}
              >
                <Text className={`text-xs font-bold ${filter === item.id ? "text-white" : "text-muted"}`}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {error && items.length > 0 ? (
        <View className="mx-5 mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 flex-row items-center">
          <Ionicons name="alert-circle-outline" size={19} color="#DC2626" />
          <Text className="ml-2 flex-1 text-xs leading-4 text-red-800">{error}</Text>
          <TouchableOpacity onPress={retry} accessibilityRole="button">
            <Text className="text-xs font-bold text-red-700">আবার চেষ্টা</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.type === "like" && item.postId ? `like-${item.postId}` : item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 }}
        ListEmptyComponent={emptyState()}
        renderSectionHeader={({ section }) => (
          <View className="pt-2 pb-2">
            <Text className="text-sm font-extrabold text-foreground">{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View
            className={`rounded-3xl border p-3.5 mb-3 flex-row items-center ${item.read ? "bg-surface border-border" : item.type === "blood_req" ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}
          >
            <TouchableOpacity
              className="flex-1 flex-row items-center"
              onPress={() => void openNotification(item)}
              accessibilityRole="button"
              accessibilityLabel={notificationText(item)}
            >
              <Avatar row={item} />
              <View className="ml-3 flex-1">
                <View className="flex-row items-start">
                  <Text className="text-sm leading-5 text-foreground flex-1">
                    {notificationText(item)}
                  </Text>
                  {!item.read ? <View className="h-2.5 w-2.5 rounded-full bg-primary ml-2 mt-1.5" /> : null}
                </View>
                {item.postPreview ? (
                  <Text className="text-xs leading-4 text-muted mt-1" numberOfLines={2}>
                    “{item.postPreview}”
                  </Text>
                ) : item.type === "blood_req" ? (
                  <Text className="text-xs leading-4 text-red-800 mt-1">
                    নিরাপদ generic alert · request খুলতে tap করুন
                  </Text>
                ) : null}
                <Text className="text-xs text-muted mt-1">
                  {notificationTime(item.sentAt || item.timestamp)} · {relativeTime(item.sentAt || item.timestamp)}
                </Text>
              </View>
            </TouchableOpacity>
            {item.type === "market_order" && item.marketOrderStatus === "pending" ? <TouchableOpacity
              className={`ml-2 rounded-xl px-2.5 py-2 ${acceptedOrderIds.has(item.orderId || "") ? "bg-emerald-100" : "bg-orange-100"}`}
              onPress={() => void acceptMarketplaceOrder(item)}
              disabled={updatingOrderId === item.orderId || acceptedOrderIds.has(item.orderId || "")}
              accessibilityRole="button"
              accessibilityLabel="অর্ডার গ্রহণ করুন"
            >
              <Text className={`text-[11px] font-extrabold ${acceptedOrderIds.has(item.orderId || "") ? "text-emerald-800" : "text-orange-800"}`}>{acceptedOrderIds.has(item.orderId || "") ? "গৃহীত" : updatingOrderId === item.orderId ? "..." : "গ্রহণ"}</Text>
            </TouchableOpacity> : null}
            <TouchableOpacity
              className="h-10 w-10 ml-2 rounded-full items-center justify-center"
              onPress={() => void (item.read ? markUnread(item.notificationIds) : markRead(item.notificationIds))}
              accessibilityRole="button"
              accessibilityLabel={item.read ? "না-পড়া হিসেবে চিহ্নিত করুন" : "পড়া হিসেবে চিহ্নিত করুন"}
            >
              <Ionicons
                name={item.read ? "mail-unread-outline" : "mail-open-outline"}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          hasMore ? (
            <View className="items-center py-3">
              {loadingMore ? (
                <ActivityIndicator color="#15803D" />
              ) : (
                <TouchableOpacity
                  className="rounded-full bg-surface border border-border px-5 py-3"
                  onPress={() => void loadMore()}
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-bold text-primary">
                    {error ? "আবার চেষ্টা করুন" : "আরও notification দেখুন"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />
    </ScreenContainer>
  );
}
