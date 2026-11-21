import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export const DATA_SAVER_STORAGE_KEY = "pathargata-data-saver";

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

export async function getDataSaverPreference(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DATA_SAVER_STORAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function setDataSaverPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(DATA_SAVER_STORAGE_KEY, String(enabled));
  listeners.forEach((listener) => listener(enabled));
}

export function subscribeDataSaver(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDataSaver(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void getDataSaverPreference().then((value) => {
      if (active) setEnabled(value);
    });
    const unsubscribe = subscribeDataSaver(setEnabled);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return enabled;
}
