import { Ionicons } from "@expo/vector-icons";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { get, ref } from "firebase/database";
import { decodeLegacyChatPreview } from "@/lib/chat-legacy";
import { pathargataDb } from "@/lib/pathargata-firebase";
import { useEffect, useState } from "react";

const publicAvatarCache = new Map<string, string>();
type Item = { uid: string; name: string; lastMessage?: string; timestamp?: number; unread?: number; isRequest?: boolean; photo?: string; online?: boolean; archived?: boolean };

export function ChatListRow({ item, onOpen, onActions }: { item: Item; onOpen: () => void; onActions: () => void }) {
  const [publicPhoto, setPublicPhoto] = useState(() => publicAvatarCache.get(item.uid) || "");
  useEffect(() => {
    if (item.photo || publicAvatarCache.has(item.uid)) return;
    let active = true;
    void get(ref(pathargataDb, `people_index/${item.uid}/profile_pic`)).then((snapshot) => {
      const value = typeof snapshot.val() === "string" ? snapshot.val() : "";
      publicAvatarCache.set(item.uid, value);
      if (active) setPublicPhoto(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [item.photo, item.uid]);
  const photo = item.photo || publicPhoto;
  const online = item.online === true;
  const lastMessage = decodeLegacyChatPreview(item.lastMessage) || "নতুন conversation";
  const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" }) : "";
  return <View className={`mb-3 flex-row items-center overflow-hidden rounded-[23px] border ${item.unread ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40" : "border-border bg-surface"}`}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.name || "User"} কথোপকথন খুলুন`} onPress={onOpen} onLongPress={onActions} activeOpacity={0.82} className="min-w-0 flex-1 flex-row items-center py-3.5 pl-3.5">
      <View className="relative h-[56px] w-[56px] items-center justify-center overflow-visible rounded-[19px] border border-border bg-green-50 dark:bg-green-950">
        {photo ? <Image source={{ uri: photo }} className="h-full w-full rounded-[18px]" resizeMode="cover" /> : <Text className="text-[19px] font-extrabold text-primary">{item.name?.slice(0, 1) || "U"}</Text>}
        {online ? <View className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-[#26A36E]" /> : null}
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <View className="flex-row items-center justify-between gap-2"><Text numberOfLines={1} className={`flex-1 text-[15px] text-foreground ${item.unread ? "font-extrabold" : "font-bold"}`}>{item.name || "User"}</Text><Text className="text-[11px] text-muted">{time}</Text></View>
        <View className="mt-1 flex-row items-center gap-1.5"><View className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#26A36E]" : "bg-slate-400"}`} /><Text className={`text-[11px] font-semibold ${online ? "text-green-700 dark:text-green-300" : "text-muted"}`}>{online ? "সক্রিয়" : "অফলাইন"}</Text>{item.isRequest ? <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Request</Text> : null}</View>
        <Text className={`mt-1 text-[12px] ${item.unread ? "font-bold text-primary" : "text-muted"}`} numberOfLines={1}>{lastMessage}</Text>
      </View>
      {item.unread ? <View className="ml-2 min-w-[22px] items-center rounded-full bg-primary px-1.5 py-1"><Text className="text-[11px] font-extrabold text-white">{item.unread > 9 ? "9+" : item.unread}</Text></View> : null}
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="কথোপকথনের অপশন" onPress={onActions} className="mr-2 h-11 w-9 items-center justify-center rounded-full"><Ionicons name="ellipsis-vertical" size={19} color="#7A877E" /></TouchableOpacity>
  </View>;
}
