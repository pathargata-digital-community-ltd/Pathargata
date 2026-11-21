import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { Ionicons } from "@expo/vector-icons";
import { Platform, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { emitTabReselect } from "@/lib/tab-reselect";
export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && width >= 960;
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarStyle = isDesktopWeb
    ? {
        width: 232,
        height: "100%" as const,
        paddingHorizontal: 12,
        paddingVertical: 24,
        backgroundColor: colors.background,
        borderRightColor: colors.border,
        borderRightWidth: 0.5,
        borderTopWidth: 0,
      }
    : {
        paddingTop: 8,
        paddingBottom: bottomPadding,
        height: 56 + bottomPadding,
        backgroundColor: colors.background,
        borderTopColor: colors.border,
        borderTopWidth: 0.5,
      };
  return <Tabs screenOptions={{ lazy: true, freezeOnBlur: true, tabBarActiveTintColor: colors.tint, tabBarInactiveTintColor: colors.tabIconDefault, headerShown: false, tabBarButton: HapticTab, tabBarPosition: isDesktopWeb ? "left" : "bottom", tabBarVariant: isDesktopWeb ? "material" : "uikit", tabBarLabelPosition: isDesktopWeb ? "beside-icon" : "below-icon", tabBarStyle }}>
    <Tabs.Screen name="index" listeners={{ tabPress: () => emitTabReselect("home") }} options={{ title: "হোম", tabBarIcon: ({ color }) => <Ionicons size={24} name="home" color={color} /> }} />
    <Tabs.Screen name="services" options={{ title: "সেবা", tabBarIcon: ({ color }) => <Ionicons size={24} name="grid" color={color} /> }} />
    <Tabs.Screen name="messages" options={{ title: "মেসেজ", tabBarIcon: ({ color }) => <Ionicons size={24} name="chatbubbles" color={color} /> }} />
    <Tabs.Screen name="people" options={{ title: "মানুষ", tabBarIcon: ({ color }) => <Ionicons size={24} name="people" color={color} /> }} />
    <Tabs.Screen name="profile" listeners={{ tabPress: () => emitTabReselect("profile") }} options={{ title: "প্রোফাইল", tabBarIcon: ({ color }) => <Ionicons size={24} name="person-circle" color={color} /> }} />
  </Tabs>;
}
