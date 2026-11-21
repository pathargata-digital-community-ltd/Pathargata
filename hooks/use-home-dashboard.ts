import { useFocusEffect } from "expo-router";
import { getFreshWithCache } from "@/lib/rtdb-cache";
import { limitToLast, orderByChild, query, ref } from "firebase/database";
import { useState, useCallback } from "react";
import { InteractionManager } from "react-native";
import { pathargataDb } from "@/lib/pathargata-firebase";

export type HomeNotice = { id: string; title: string; description: string; timestamp?: number };
export type EmergencyAlert = { id: string; type: string; title: string; desc: string; contact?: string; authorName?: string; timestamp?: number };
const HOME_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

export function useHomeDashboard() {
  const [notice, setNotice] = useState<HomeNotice | null>(null);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    const task = InteractionManager.runAfterInteractions(() => {
      const noticeQuery = query(ref(pathargataDb, "notices"), orderByChild("timestamp"), limitToLast(10));
      const alertQuery = query(ref(pathargataDb, "emergency_alerts"), orderByChild("timestamp"), limitToLast(20));
      void Promise.all([
        getFreshWithCache<Record<string, Omit<HomeNotice, "id">>>(noticeQuery, HOME_CACHE_MAX_AGE_MS),
        getFreshWithCache<Record<string, Omit<EmergencyAlert, "id">>>(alertQuery, HOME_CACHE_MAX_AGE_MS),
      ]).then(([noticeResult, alertResult]) => {
        if (!active) return;
        const noticeRows = Object.entries(noticeResult.value || {}).map(([id, value]) => ({ id, ...value }));
        const alertRows = Object.entries(alertResult.value || {}).map(([id, value]) => ({ id, ...value }));
        setNotice(noticeRows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null);
        setAlerts(alertRows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      }).catch(() => {
        if (active) { setNotice(null); setAlerts([]); }
      });
    });
    return () => { active = false; task.cancel(); };
  }, []));

  return { notice, alerts };
}
