import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

export const VERIFICATION_CATEGORIES = [
  {
    id: "public_figure",
    title: "পাবলিক ফিগার",
    description: "জনপরিচিত ব্যক্তি ও কমিউনিটি প্রতিনিধি",
    badgeLabel: "জনপরিচিত",
    icon: "star" as const,
    colors: ["#8065D8", "#4E329F"] as [string, string],
    depth: "#33216F",
    shadow: "#4E329F",
  },
  {
    id: "content_creator",
    title: "কন্টেন্ট ক্রিয়েটর",
    description: "ডিজিটাল ও সৃজনশীল কনটেন্ট নির্মাতা",
    badgeLabel: "ক্রিয়েটর",
    icon: "sparkles" as const,
    colors: ["#E34886", "#9F246D"] as [string, string],
    depth: "#701B4D",
    shadow: "#A52267",
  },
  {
    id: "journalist",
    title: "সাংবাদিক",
    description: "সংবাদ ও গণমাধ্যমে কর্মরত সাংবাদিক",
    badgeLabel: "সাংবাদিক",
    icon: "newspaper" as const,
    colors: ["#2D91D1", "#14518C"] as [string, string],
    depth: "#0E3B69",
    shadow: "#14518C",
  },
  {
    id: "business",
    title: "ব্যবসা",
    description: "স্থানীয় ব্যবসা ও ব্যবসায়িক প্রোফাইল",
    badgeLabel: "ব্যবসা",
    icon: "storefront" as const,
    colors: ["#E69132", "#AA5319"] as [string, string],
    depth: "#783A14",
    shadow: "#AA5319",
  },
  {
    id: "professional",
    title: "পেশাজীবী",
    description: "শিক্ষক, চিকিৎসক, আইনজীবীসহ পেশাজীবী",
    badgeLabel: "পেশাজীবী",
    icon: "briefcase" as const,
    colors: ["#1A9D91", "#08675F"] as [string, string],
    depth: "#064943",
    shadow: "#08675F",
  },
  {
    id: "others",
    title: "অন্যান্য যাচাইকৃত প্রোফাইল",
    description: "অন্যান্য পরিচয় ও যোগ্যতা যাচাই",
    badgeLabel: "যাচাইকৃত",
    icon: "shield-checkmark" as const,
    colors: ["#358B66", "#15553F"] as [string, string],
    depth: "#103D2E",
    shadow: "#15553F",
  },
] as const;

export type VerificationCategoryId = (typeof VERIFICATION_CATEGORIES)[number]["id"];
export type VerificationBadgeSize = "compact" | "medium" | "large";

export function getVerificationCategory(category?: string) {
  return VERIFICATION_CATEGORIES.find((item) => item.id === category) || VERIFICATION_CATEGORIES[VERIFICATION_CATEGORIES.length - 1];
}

export function ProfessionVerificationBadge({
  category,
  size = "compact",
}: {
  category?: string;
  size?: VerificationBadgeSize;
}) {
  const config = getVerificationCategory(category);
  const compact = size === "compact";
  const large = size === "large";
  const iconSize = compact ? 12 : large ? 20 : 16;
  const height = compact ? 26 : large ? 48 : 36;

  return (
    <View
      accessibilityLabel={`${config.title} যাচাইকৃত`}
      style={{
        alignSelf: "flex-start",
        paddingBottom: compact ? 1 : 3,
        shadowColor: config.shadow,
        shadowOpacity: compact ? 0.18 : 0.3,
        shadowRadius: compact ? 3 : 7,
        shadowOffset: { width: 0, height: compact ? 1 : 4 },
        elevation: compact ? 3 : 7,
      }}
    >
      <LinearGradient
        colors={config.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          minHeight: height,
          flexDirection: "row",
          alignItems: "center",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.62)",
          paddingHorizontal: compact ? 7 : large ? 13 : 10,
          paddingVertical: compact ? 3 : large ? 8 : 6,
          transform: [{ translateY: compact ? 0 : -2 }],
        }}
      >
        <View
          style={{
            width: iconSize + (compact ? 5 : 9),
            height: iconSize + (compact ? 5 : 9),
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.18)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.28)",
          }}
        >
          <Ionicons name={config.icon} size={iconSize} color="#FFFFFF" />
        </View>
        <View style={{ marginLeft: compact ? 5 : 8 }}>
          <Text
            numberOfLines={1}
            style={{
              color: "#FFFFFF",
              fontSize: compact ? 9 : large ? 13 : 11,
              fontWeight: "900",
              letterSpacing: 0.15,
            }}
          >
            {config.badgeLabel}
          </Text>
          {large ? (
            <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 8, fontWeight: "800", letterSpacing: 1.1 }}>
              VERIFIED PROFILE
            </Text>
          ) : null}
        </View>
        <Ionicons
          name="checkmark-circle"
          size={compact ? 13 : large ? 19 : 16}
          color="#F5FFF9"
          style={{ marginLeft: compact ? 4 : 7 }}
        />
      </LinearGradient>
      {!compact ? (
        <View
          style={{
            height: 3,
            marginHorizontal: 13,
            marginTop: -3,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            backgroundColor: config.depth,
          }}
        />
      ) : null}
    </View>
  );
}
