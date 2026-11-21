import { safeGoBack } from "@/lib/safe-navigation";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { push, ref } from "firebase/database";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { buildDirectorySuggestedEdit } from "@/lib/directory-edits";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default function DirectorySuggestScreen() {
  const params = useLocalSearchParams<{
    categoryId?: string | string[];
    itemId?: string | string[];
    name?: string | string[];
    phone?: string | string[];
    requestMode?: string | string[];
  }>();
  const categoryId = firstParam(params.categoryId);
  const itemId = firstParam(params.itemId);
  const itemName = firstParam(params.name);
  const itemPhone = firstParam(params.phone);
  const isNewRequest = firstParam(params.requestMode) === "new" || itemId === "__new__";
  const [name, setName] = useState(itemName);
  const [phone, setPhone] = useState(itemPhone);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitSuggestion() {
    const user = pathargataAuth.currentUser;
    if (!user) {
      Alert.alert("লগইন প্রয়োজন", "তথ্য যোগ বা সংশোধনের আবেদন পাঠাতে লগইন করুন।", [
        { text: "পরে" },
        { text: "লগইন", onPress: () => router.push("/auth") },
      ]);
      return;
    }
    if (!categoryId || !itemId) {
      Alert.alert("তথ্য পাওয়া যায়নি", "ডিরেক্টরি থেকে আবার আবেদন শুরু করুন।");
      return;
    }

    let submission;
    try {
      submission = buildDirectorySuggestedEdit({
        suggestedName: name,
        suggestedPhone: phone,
        details,
        submitterUid: user.uid,
        submitterName: user.displayName || "অজ্ঞাত ব্যবহারকারী",
      });
    } catch (error) {
      Alert.alert(
        "তথ্য প্রয়োজন",
        error instanceof Error ? error.message : "সঠিক নাম ও ফোন নম্বর দিন।",
      );
      return;
    }

    setSaving(true);
    try {
      await push(
        ref(pathargataDb, `directory_edits/${categoryId}/${itemId}`),
        submission,
      );
      Alert.alert(
        "আবেদন পাঠানো হয়েছে",
        isNewRequest
          ? "আপনার নতুন তথ্য যোগ করার প্রস্তাবটি Admin পর্যালোচনার জন্য পাঠানো হয়েছে।"
          : "আপনার সংশোধনের প্রস্তাবটি পর্যালোচনার জন্য পাঠানো হয়েছে।",
        [{ text: "ঠিক আছে", onPress: () => safeGoBack("/(tabs)") }],
      );
    } catch {
      Alert.alert("দুঃখিত", "সংশোধনের আবেদন পাঠানো যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          contentContainerStyle={{ padding: 20, paddingBottom: 180, flexGrow: 1 }}
        >
          <TouchableOpacity
            onPress={() => safeGoBack("/(tabs)")}
            className="h-11 w-11 rounded-full bg-surface border border-border items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="ফিরে যান"
          >
            <Ionicons name="arrow-back" size={20} color="#334155" />
          </TouchableOpacity>

          <View className="mt-7 rounded-[28px] bg-[#0F5132] p-5">
            <View className="h-12 w-12 rounded-2xl bg-white/15 items-center justify-center">
              <Ionicons name="create-outline" size={25} color="white" />
            </View>
            <Text className="text-xl font-bold text-white mt-4">
              {isNewRequest ? "নতুন তথ্য যোগ করার অনুরোধ" : "তথ্য সংশোধনের অনুরোধ"}
            </Text>
            <Text className="text-sm text-green-100 mt-2 leading-6">
              {isNewRequest
                ? "এই category-তে নতুন ব্যক্তি, প্রতিষ্ঠান বা সেবার তথ্য যোগ করার অনুরোধ করুন।"
                : itemName
                  ? `${itemName} সম্পর্কে কোনো তথ্য ভুল থাকলে সঠিক তথ্য প্রস্তাব করুন।`
                  : "ডিরেক্টরির তথ্য ভুল থাকলে সঠিক তথ্য প্রস্তাব করুন।"}
            </Text>
            <Text className="text-[13px] text-green-100 mt-3">
              আপনার প্রস্তাব পর্যালোচনা ছাড়া মূল ডিরেক্টরি তথ্য পরিবর্তন করবে
              না।
            </Text>
          </View>

          <View className="mt-6 rounded-[28px] bg-surface border border-border p-5">
            <Text className="text-xs font-bold text-muted mb-2">
              {isNewRequest ? "ব্যক্তি / প্রতিষ্ঠান / সেবার নাম" : "সঠিক নাম"}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={isNewRequest ? "নাম বা প্রতিষ্ঠানের নাম লিখুন" : "সঠিক নামটি লিখুন"}
              placeholderTextColor="#94A3B8"
              className="rounded-2xl border border-border bg-background px-4 py-3.5 text-foreground"
              maxLength={120}
              returnKeyType="next"
            />

            <Text className="text-xs font-bold text-muted mt-4 mb-2">
              {isNewRequest ? "যোগাযোগের মোবাইল নম্বর" : "সঠিক মোবাইল নম্বর"}
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="যেমন: 017XXXXXXXX"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              className="rounded-2xl border border-border bg-background px-4 py-3.5 text-foreground"
              maxLength={30}
            />

            <Text className="text-xs font-bold text-muted mt-4 mb-2">
              অন্যান্য বিবরণ বা ঠিকানা (ঐচ্ছিক)
            </Text>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="ভুল সংশোধন সংক্রান্ত অতিরিক্ত তথ্য লিখুন"
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
              className="min-h-28 rounded-2xl border border-border bg-background px-4 py-3.5 text-foreground"
              maxLength={1000}
            />

            <TouchableOpacity
              onPress={() => void submitSuggestion()}
              disabled={saving}
              className={`rounded-2xl py-4 items-center mt-5 ${saving ? "bg-emerald-400" : "bg-[#0F8A50]"}`}
              accessibilityRole="button"
              accessibilityLabel="সংশোধনের আবেদন পাঠান"
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">
                  সংশোধনের আবেদন পাঠান
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
