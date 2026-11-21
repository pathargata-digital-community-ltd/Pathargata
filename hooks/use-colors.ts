import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { useColorScheme } from "./use-color-scheme";

/**
 * Returns the current theme's color palette.
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const colorSchema = useColorScheme();
  const requestedScheme = colorSchemeOverride ?? colorSchema;
  const scheme: ColorScheme = requestedScheme === "dark" ? "dark" : "light";
  return Colors[scheme];
}
