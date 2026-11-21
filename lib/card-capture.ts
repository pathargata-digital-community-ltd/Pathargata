import { captureRef } from "react-native-view-shot";
import type { View } from "react-native";
import type { RefObject } from "react";

export async function captureCardImage(target: RefObject<View | null>) {
  return captureRef(target, { format: "png", quality: 1, result: "tmpfile", width: 1200 });
}
