export type TourismCategory = "nature" | "history" | "food_resort" | "culture" | "family" | "all";
export type TourismPlace = {
  id: string;
  title: string;
  details: string;
  category: TourismCategory;
  image?: string;
  images: string[];
  phone?: string;
  address?: string;
  locality?: string;
  coordinates?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: string;
  admissionFee?: string;
  estimatedDuration?: string;
  suitableFor?: string;
  tips?: string;
  verified: boolean;
  averageRating?: number;
  reviewCount?: number;
  approvedReviews: TourismReview[];
  lastUpdated?: number;
  popularity?: number;
  nearbyServices: TourismNearbyService[];
  distanceKm?: number;
  raw: Record<string, unknown>;
};
export type TourismNearbyService = {
  id: string;
  name: string;
  kind: string;
  address?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
};
export type TourismReview = { id: string; author: string; rating: number; comment?: string; timestamp?: number };
export type TourismSort = "newest" | "popular" | "nearby";
export type TourismFilters = { query?: string; category?: TourismCategory; locality?: string };

function text(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}
function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
function lower(value: string): string {
  try { return value.toLocaleLowerCase("bn-BD"); } catch { return value.toLowerCase(); }
}
function compareText(a: string, b: string): number {
  try { return a.localeCompare(b, "bn-BD"); } catch { return a.localeCompare(b); }
}
export function parseTourismCoordinates(value: unknown, latitude?: unknown, longitude?: unknown): { latitude: number; longitude: number } | undefined {
  let lat = numeric(latitude);
  let lng = numeric(longitude);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    lat ??= numeric(record.latitude ?? record.lat);
    lng ??= numeric(record.longitude ?? record.lng ?? record.lon);
  } else if (typeof value === "string") {
    const match = value.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (match) { lat ??= Number(match[1]); lng ??= Number(match[2]); }
  }
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { latitude: lat, longitude: lng };
}
function listOfText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim());
}
function parseNearbyServices(value: unknown): TourismNearbyService[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const name = text(item.name, item.title);
    if (!name) return [];
    const coordinates = parseTourismCoordinates(item.coordinates, item.latitude ?? item.lat, item.longitude ?? item.lng);
    return [{ id: text(item.id) || `service-${index}`, name, kind: text(item.kind, item.category) || "স্থানীয় সেবা", address: text(item.address), phone: text(item.phone), ...coordinates }];
  });
}
function parseApprovedReviews(value: unknown, approvedList: boolean): TourismReview[] {
  if (!value || typeof value !== "object") return [];
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, unknown>);
  return entries.flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const review = raw as Record<string, unknown>;
    if (!approvedList && review.status !== "approved" && review.isApproved !== true) return [];
    const rating = numeric(review.rating ?? review.stars);
    if (rating === undefined || rating < 1 || rating > 5) return [];
    return [{ id, author: text(review.author, review.displayName) || "কমিউনিটি সদস্য", rating, comment: text(review.comment, review.text), timestamp: numeric(review.timestamp ?? review.createdAt) }];
  });
}
export function parseTourismPlaces(value: unknown): TourismPlace[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const values = [item.images, item.photos].flatMap(listOfText);
    const legacyImage = text(item.image, item.photo, item.coverImage);
    const images = Array.from(new Set([...(legacyImage ? [legacyImage] : []), ...values]));
    const coordinates = parseTourismCoordinates(item.coordinates, item.latitude ?? item.lat, item.longitude ?? item.lng);
    const categoryValue = text(item.category)?.toLowerCase() || "all";
    const supported: TourismCategory[] = ["nature", "history", "food_resort", "culture", "family"];
    const approvedReviewSource = item.approvedReviews ?? item.approved_reviews ?? item.reviews;
    const approvedReviewList = approvedReviewSource === item.approvedReviews || approvedReviewSource === item.approved_reviews;
    return [{
      id,
      title: text(item.title, item.name) || "দর্শনীয় স্থান",
      details: text(item.details, item.description, item.desc) || "বিস্তারিত তথ্য নেই",
      category: supported.includes(categoryValue as TourismCategory) ? categoryValue as TourismCategory : "all",
      image: images[0], images,
      phone: text(item.phone, item.contact),
      address: text(item.address, item.location),
      locality: text(item.locality, item.village, item.union, item.area),
      coordinates: text(item.coordinates) || (coordinates ? `${coordinates.latitude},${coordinates.longitude}` : undefined),
      ...coordinates,
      openingHours: text(item.openingHours, item.opening_hours, item.hours),
      admissionFee: text(item.admissionFee, item.admission_fee, item.entryFee, item.entry_fee, item.cost),
      estimatedDuration: text(item.estimatedDuration, item.estimated_duration, item.duration, item.visitDuration),
      suitableFor: text(item.suitableFor, item.suitable_for, item.bestFor),
      tips: text(item.tips, item.travelTips, item.travel_tips),
      verified: item.is_verified === true || item.isVerified === true || item.verified === true,
      averageRating: numeric(item.averageRating ?? item.average_rating ?? item.rating),
      reviewCount: numeric(item.reviewCount ?? item.review_count ?? item.total_reviews),
      approvedReviews: parseApprovedReviews(approvedReviewSource, approvedReviewList),
      lastUpdated: numeric(item.updatedAt ?? item.updated_at ?? item.timestamp ?? item.time),
      popularity: numeric(item.popularity ?? item.views ?? item.visits ?? item.likes) ?? 0,
      nearbyServices: parseNearbyServices(item.nearbyServices ?? item.nearby_services),
      raw: item,
    }];
  });
}
export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (degree: number) => degree * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}
export function tourismMapUrl(place: Pick<TourismPlace, "title" | "address" | "coordinates" | "latitude" | "longitude">): string {
  const coordinates = parseTourismCoordinates(place.coordinates, place.latitude, place.longitude);
  const query = coordinates ? `${coordinates.latitude},${coordinates.longitude}` : [place.title, place.address, "পাথরঘাটা"].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export function filterTourismPlaces(places: TourismPlace[], filters: TourismFilters): TourismPlace[] {
  const needle = filters.query?.trim() ? lower(filters.query.trim()) : "";
  const locality = filters.locality?.trim() ? lower(filters.locality.trim()) : "";
  return places.filter((place) => {
    if (filters.category && filters.category !== "all" && place.category !== filters.category && place.category !== "all") return false;
    if (needle && ![place.title, place.details, place.address, place.locality, place.category, place.tips].some((value) => value && lower(value).includes(needle))) return false;
    if (locality && ![place.locality, place.address].some((value) => value && lower(value).includes(locality))) return false;
    return true;
  });
}
export function sortTourismPlaces(places: TourismPlace[], sort: TourismSort): TourismPlace[] {
  return [...places].sort((a, b) => {
    if (sort === "nearby") {
      const distance = (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
      if (Number.isFinite(distance) && distance !== 0) return distance;
    }
    if (sort === "popular" && (b.popularity || 0) !== (a.popularity || 0)) return (b.popularity || 0) - (a.popularity || 0);
    return (b.lastUpdated || 0) - (a.lastUpdated || 0) || compareText(a.title, b.title) || compareText(a.id, b.id);
  });
}
export function attachTourismDistances(places: TourismPlace[], origin: { latitude: number; longitude: number }): TourismPlace[] {
  return places.map((place) => ({ ...place, distanceKm: place.latitude === undefined || place.longitude === undefined ? undefined : haversineKm(origin, { latitude: place.latitude, longitude: place.longitude }) }));
}
export function formatTourismDistance(distanceKm?: number): string | undefined {
  if (distanceKm === undefined || !Number.isFinite(distanceKm)) return undefined;
  return distanceKm < 1 ? `${Math.max(10, Math.round(distanceKm * 1000 / 10) * 10)} মিটার` : `${distanceKm.toFixed(1)} কিমি`;
}
export function parseTourismDirectoryServices(value: unknown, kind: string): TourismNearbyService[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = text(item.name, item.title);
    if (!name || item.is_active === false) return [];
    const coordinates = parseTourismCoordinates(item.coordinates, item.lat ?? item.latitude, item.lng ?? item.longitude);
    return [{ id, name, kind, address: text(item.address, item.hospital_chamber), phone: text(item.phone), ...coordinates }];
  });
}
export function nearestTourismServices(services: TourismNearbyService[], origin?: { latitude: number; longitude: number }, limit = 5): TourismNearbyService[] {
  const withDistance = services.map((service) => ({ ...service, distanceKm: origin && service.latitude !== undefined && service.longitude !== undefined ? haversineKm(origin, { latitude: service.latitude, longitude: service.longitude }) : undefined }));
  return withDistance.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) || compareText(a.name, b.name)).slice(0, limit);
}
