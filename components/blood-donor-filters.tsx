import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { UnionFilterOption } from "@/lib/blood-filters";

type Props = {
  groups: readonly string[];
  group: string;
  onGroupChange: (value: string) => void;
  union: string;
  onUnionChange: (value: string) => void;
  unionOptions: readonly UnionFilterOption[];
  visibleCount: number;
  isDonor: boolean;
  onOpenDonor: () => void;
};

type DropdownProps = {
  label: string;
  value: string;
  displayValue: string;
  onPress: () => void;
};

function DropdownButton({ label, value, displayValue, onPress }: DropdownProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${displayValue}`}
      className="flex-1 rounded-2xl border border-border bg-surface px-3.5 py-3"
    >
      <Text className="text-[12px] font-bold text-muted">{label}</Text>
      <View className="mt-1 flex-row items-center">
        <Text numberOfLines={1} className="flex-1 text-xs font-extrabold text-foreground">
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#64748B" />
      </View>
    </TouchableOpacity>
  );
}

export function BloodDonorFilters({
  groups,
  group,
  onGroupChange,
  union,
  onUnionChange,
  unionOptions,
  visibleCount,
  isDonor,
  onOpenDonor,
}: Props) {
  const [open, setOpen] = useState<"group" | "union" | null>(null);
  const selectedUnion = unionOptions.find((item) => item.value === union)?.label || "সব এলাকা";
  const selectedGroup = group === "সব" ? "সকল গ্রুপ" : group;
  const options = open === "group"
    ? groups.map((item) => ({ value: item, label: item === "সব" ? "সকল গ্রুপ" : item }))
    : unionOptions.map((item) => ({ value: item.value, label: item.label }));

  return (
    <View className="px-5 pt-4 pb-1">
      <View className="flex-row gap-2">
        <DropdownButton label="রক্তের গ্রুপ" value={group} displayValue={selectedGroup} onPress={() => setOpen("group")} />
        <DropdownButton label="এলাকা / ইউনিয়ন" value={union} displayValue={selectedUnion} onPress={() => setOpen("union")} />
      </View>

      <View className="mt-5 flex-row items-center justify-between">
        <View>
          <Text className="text-base font-extrabold text-foreground">ডোনার তালিকা</Text>
          <Text className="mt-1 text-[13px] text-muted">{visibleCount} জন ডোনার পাওয়া গেছে</Text>
        </View>
        <TouchableOpacity
          className="flex-row items-center rounded-2xl bg-red-50 px-3.5 py-2.5"
          onPress={onOpenDonor}
          accessibilityRole="button"
        >
          <Ionicons name={isDonor ? "create-outline" : "hand-left-outline"} size={18} color="#DC2626" />
          <Text className="ml-1.5 text-xs font-extrabold text-red-600">{isDonor ? "তথ্য আপডেট" : "ডোনার হন"}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(null)}>
          <Pressable className="max-h-[72%] rounded-t-3xl bg-background p-5" onPress={(event) => event.stopPropagation()}>
            <View className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-extrabold text-foreground">{open === "group" ? "রক্তের গ্রুপ বাছাই করুন" : "এলাকা বাছাই করুন"}</Text>
                <Text className="mt-1 text-[12px] text-muted">একটি option নির্বাচন করুন</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(null)} className="h-9 w-9 items-center justify-center rounded-full bg-surface">
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {options.map((option) => {
                const selected = (open === "group" ? group : union) === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => {
                      if (open === "group") onGroupChange(option.value);
                      else onUnionChange(option.value);
                      setOpen(null);
                    }}
                    className={`flex-row items-center rounded-2xl border px-4 py-3.5 ${selected ? "border-red-600 bg-red-50" : "border-border bg-surface"}`}
                  >
                    <Text className={`flex-1 text-sm font-bold ${selected ? "text-red-700" : "text-foreground"}`}>{option.label}</Text>
                    {selected ? <Ionicons name="checkmark-circle" size={20} color="#DC2626" /> : <Ionicons name="chevron-forward" size={19} color="#94A3B8" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
