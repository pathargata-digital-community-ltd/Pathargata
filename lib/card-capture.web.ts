import type { View } from "react-native";
import type { RefObject } from "react";
import { captureRef } from "react-native-view-shot";

export async function captureCardImage(target: RefObject<View | null>) {
  return captureRef(target, {
    format: "png",
    quality: 1,
    result: "data-uri",
    width: 1200,
    height: 758,
  });
}
