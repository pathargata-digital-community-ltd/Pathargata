import { onValue, ref } from "firebase/database";
import { useEffect, useState } from "react";
import { pathargataDb } from "@/lib/pathargata-firebase";

export type RemoteFeatureFlags = {
  postCreation: boolean;
  mediaUpload: boolean;
  messaging: boolean;
  registration: boolean;
  publicProfiles: boolean;
  pushNotifications: boolean;
};

export type RemoteEmergencyControls = {
  maintenance: boolean;
  readOnly: boolean;
};

export type RemoteControls = {
  flags: RemoteFeatureFlags;
  emergency: RemoteEmergencyControls;
  loading: boolean;
};

const DEFAULT_FLAGS: RemoteFeatureFlags = {
  postCreation: true,
  mediaUpload: true,
  messaging: true,
  registration: true,
  publicProfiles: true,
  pushNotifications: true,
};

const DEFAULT_EMERGENCY: RemoteEmergencyControls = {
  maintenance: false,
  readOnly: false,
};

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function useRemoteControls(): RemoteControls {
  const [flags, setFlags] = useState<RemoteFeatureFlags>(DEFAULT_FLAGS);
  const [emergency, setEmergency] = useState<RemoteEmergencyControls>(DEFAULT_EMERGENCY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let flagsReady = false;
    let emergencyReady = false;
    const finishIfReady = () => {
      if (flagsReady && emergencyReady) setLoading(false);
    };
    const stopFlags = onValue(
      ref(pathargataDb, "admin_settings/feature_flags"),
      (snapshot) => {
        const value = snapshot.val() as Partial<RemoteFeatureFlags> | null;
        setFlags({
          postCreation: readBoolean(value?.postCreation, DEFAULT_FLAGS.postCreation),
          mediaUpload: readBoolean(value?.mediaUpload, DEFAULT_FLAGS.mediaUpload),
          messaging: readBoolean(value?.messaging, DEFAULT_FLAGS.messaging),
          registration: readBoolean(value?.registration, DEFAULT_FLAGS.registration),
          publicProfiles: readBoolean(value?.publicProfiles, DEFAULT_FLAGS.publicProfiles),
          pushNotifications: readBoolean(value?.pushNotifications, DEFAULT_FLAGS.pushNotifications),
        });
        flagsReady = true;
        finishIfReady();
      },
      () => {
        flagsReady = true;
        finishIfReady();
      },
    );
    const stopEmergency = onValue(
      ref(pathargataDb, "admin_settings/emergency_controls"),
      (snapshot) => {
        const value = snapshot.val() as Partial<RemoteEmergencyControls> | null;
        setEmergency({
          maintenance: readBoolean(value?.maintenance, DEFAULT_EMERGENCY.maintenance),
          readOnly: readBoolean(value?.readOnly, DEFAULT_EMERGENCY.readOnly),
        });
        emergencyReady = true;
        finishIfReady();
      },
      () => {
        emergencyReady = true;
        finishIfReady();
      },
    );
    return () => {
      stopFlags();
      stopEmergency();
    };
  }, []);

  return { flags, emergency, loading };
}
