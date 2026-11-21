import * as Location from "expo-location";

export const PATHARGHATA_AREA = {
  latitude: 22.045,
  longitude: 89.9675,
  radiusKm: 15,
};

export type AreaAccessDecision = {
  state: "approved" | "pending_review";
  reason: "inside_area" | "outside_area" | "location_unavailable" | "permission_denied";
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
};

export function distanceInKm(
  latitude: number,
  longitude: number,
  targetLatitude = PATHARGHATA_AREA.latitude,
  targetLongitude = PATHARGHATA_AREA.longitude,
) {
  const earthRadiusKm = 6371;
  const latDelta = ((targetLatitude - latitude) * Math.PI) / 180;
  const longitudeDelta = ((targetLongitude - longitude) * Math.PI) / 180;
  const value =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos((latitude * Math.PI) / 180) *
      Math.cos((targetLatitude * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export async function detectPathargataArea(): Promise<AreaAccessDecision> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      return {
        state: "pending_review",
        reason: "permission_denied",
        latitude: null,
        longitude: null,
        distanceKm: null,
      };
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const latitude = current.coords.latitude;
    const longitude = current.coords.longitude;
    const distanceKm = distanceInKm(latitude, longitude);
    const inside = distanceKm <= PATHARGHATA_AREA.radiusKm;
    return {
      state: inside ? "approved" : "pending_review",
      reason: inside ? "inside_area" : "outside_area",
      latitude,
      longitude,
      distanceKm,
    };
  } catch {
    return {
      state: "pending_review",
      reason: "location_unavailable",
      latitude: null,
      longitude: null,
      distanceKm: null,
    };
  }
}
