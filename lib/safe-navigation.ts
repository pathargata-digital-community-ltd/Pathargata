import { router, type Href } from "expo-router";

/**
 * Navigate back when the current route has history; otherwise replace with a
 * valid in-app destination instead of dispatching an unhandled GO_BACK action.
 */
export function safeGoBack(fallback: Href = "/(tabs)") {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
