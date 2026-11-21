import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";

type Props = {
  visible: boolean;
  author: string;
  authorPic?: string;
  title: string;
  body: string;
  onClose: () => void;
  onConfirm: (message: string) => Promise<void>;
};

export function RepostComposer({ visible, author, authorPic, title, body, onClose, onConfirm }: Props) {
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  function close() { setConfirming(false); setMessage(""); onClose(); }
  async function confirm() {
    setBusy(true);
    try { await onConfirm(message.trim()); close(); }
    catch { /* The caller presents the failure; keep the editor open for retry. */ }
    finally { setBusy(false); setConfirming(false); }
  }
  return <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/45"><TouchableOpacity accessibilityLabel="বন্ধ করুন" onPress={close} className="flex-1" activeOpacity={1} /><View className="rounded-t-[30px] bg-background px-5 pb-8 pt-3"><View className="mb-4 items-center"><View className="h-1 w-11 rounded-full bg-[#D9E0DA]" /></View><View className="mb-4 flex-row items-center gap-3"><View className="h-10 w-10 items-center justify-center overflow-hidden rounded-[15px] bg-surface">{authorPic ? <Image source={{ uri: authorPic }} className="h-full w-full" /> : <Text className="font-bold text-[#24624F]">{author.slice(0, 1)}</Text>}</View><View className="flex-1"><Text className="text-[16px] font-extrabold text-foreground">রিপোস্ট লিখুন</Text><Text className="mt-0.5 text-[12px] text-muted">{author}-এর পোস্টটি আপনার ফিডে যাবে</Text></View><TouchableOpacity onPress={close} className="h-9 w-9 items-center justify-center rounded-full bg-surface"><Ionicons name="close" size={19} color="#58665C" /></TouchableOpacity></View><TextInput value={message} onChangeText={setMessage} placeholder="আপনার কিছু বলার থাকলে লিখুন (ঐচ্ছিক)…" placeholderTextColor="#87928A" multiline maxLength={500} textAlignVertical="top" className="min-h-[104px] rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] leading-5 text-foreground" /><View className="mt-1 items-end"><Text className="text-[11px] text-[#929C95]">{message.length}/500</Text></View><View className="mt-3 rounded-2xl border border-border bg-background p-3"><View className="flex-row items-center gap-2"><View className="h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-surface">{authorPic ? <Image source={{ uri: authorPic }} className="h-full w-full" /> : <Text className="text-[12px] font-bold text-[#24624F]">{author.slice(0, 1)}</Text>}</View><Text numberOfLines={1} className="flex-1 text-[12px] font-bold text-foreground">{author}</Text><Text className="rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-[#24624F]">মূল পোস্ট</Text></View>{title ? <Text numberOfLines={2} className="mt-2 text-[14px] font-bold text-foreground">{title}</Text> : null}{body ? <Text numberOfLines={3} className="mt-1 text-[12px] leading-4 text-muted">{body}</Text> : null}</View><TouchableOpacity onPress={() => setConfirming(true)} className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-[#0B2D26] py-3.5"><Ionicons name="repeat-outline" size={18} color="white" /><Text className="text-[14px] font-bold text-white">রিপোস্ট চালিয়ে যান</Text></TouchableOpacity></View></View>
    </Modal>
    <Modal visible={visible && confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/55 px-6"><View className="w-full max-w-sm rounded-[26px] bg-background p-5"><View className="h-12 w-12 items-center justify-center rounded-2xl bg-surface"><Ionicons name="repeat-outline" size={23} color="#24624F" /></View><Text className="mt-4 text-[18px] font-extrabold text-foreground">রিপোস্ট নিশ্চিত করবেন?</Text><Text className="mt-2 text-[14px] leading-5 text-muted">{author}-এর মূল পোস্টটি আপনার নাম ও profile-এর সঙ্গে Community Feed-এ দেখানো হবে।{message.trim() ? " আপনার লেখা নোটও যুক্ত হবে।" : ""}</Text><View className="mt-5 flex-row gap-2"><TouchableOpacity onPress={() => setConfirming(false)} disabled={busy} className="flex-1 items-center rounded-xl border border-[#DEE6E0] bg-background py-3"><Text className="text-[13px] font-bold text-muted">ফিরে যান</Text></TouchableOpacity><TouchableOpacity onPress={() => void confirm()} disabled={busy} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#0B2D26] py-3">{busy ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="repeat-outline" size={18} color="white" />}<Text className="text-[13px] font-bold text-white">নিশ্চিত রিপোস্ট</Text></TouchableOpacity></View></View></View>
    </Modal>
  </>;
}
