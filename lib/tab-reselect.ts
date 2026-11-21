export type ReselectableTab = "home" | "profile";

type Listener = (tab: ReselectableTab) => void;

const listeners = new Set<Listener>();

export function emitTabReselect(tab: ReselectableTab) {
  listeners.forEach((listener) => listener(tab));
}

export function subscribeToTabReselect(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
