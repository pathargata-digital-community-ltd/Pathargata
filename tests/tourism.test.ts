import { describe, expect, it, vi } from "vitest";
import {
  attachTourismDistances,
  filterTourismPlaces,
  formatTourismDistance,
  haversineKm,
  nearestTourismServices,
  parseTourismCoordinates,
  parseTourismDirectoryServices,
  parseTourismPlaces,
  sortTourismPlaces,
} from "../lib/tourism";

describe("tourism data compatibility", () => {
  it("keeps legacy records readable and supports optional rich place fields", () => {
    const places = parseTourismPlaces({
      old: { title: "লালদিয়া বন", details: "পুরোনো তথ্য", category: "nature", image: "https://example.com/forest.jpg", phone: "01700000000", address: "পাথরঘাটা", coordinates: "22.0,89.9" },
      new: { name: "নতুন দর্শনীয় স্থান", description: "বর্ণনা", category: "history", photos: ["https://example.com/a.jpg", "https://example.com/b.jpg"], latitude: 22.1, longitude: 89.8, opening_hours: "সকাল ৮টা–বিকেল ৫টা", entry_fee: "৳ ২০", duration: "২ ঘণ্টা", suitable_for: "পরিবার", updatedAt: 100, popularity: 8, is_verified: true, average_rating: 4.5, review_count: 3, approvedReviews: [{ author: "সদস্য", rating: 5, comment: "সুন্দর" }], reviews: { pending: { rating: 1, comment: "অনুমোদন হয়নি" } } },
    });
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ title: "লালদিয়া বন", category: "nature", image: "https://example.com/forest.jpg", images: ["https://example.com/forest.jpg"], latitude: 22, longitude: 89.9 });
    expect(places[1]).toMatchObject({ title: "নতুন দর্শনীয় স্থান", images: ["https://example.com/a.jpg", "https://example.com/b.jpg"], openingHours: "সকাল ৮টা–বিকেল ৫টা", admissionFee: "৳ ২০", estimatedDuration: "২ ঘণ্টা", suitableFor: "পরিবার", popularity: 8, verified: true, averageRating: 4.5, reviewCount: 3 });
    expect(places[1].approvedReviews).toEqual([{ id: "0", author: "সদস্য", rating: 5, comment: "সুন্দর", timestamp: undefined }]);
  });

  it("safely rejects invalid payloads and coordinates", () => {
    expect(parseTourismPlaces(null)).toEqual([]);
    expect(parseTourismPlaces({ malformed: "bad", array: [] })).toEqual([]);
    expect(parseTourismCoordinates("100,200")).toBeUndefined();
    expect(parseTourismCoordinates({ lat: "22.1", lon: "89.8" })).toEqual({ latitude: 22.1, longitude: 89.8 });
  });

  it("accepts admin-curated nearby services and only exposes approved review entries", () => {
    const [place] = parseTourismPlaces({
      place: {
        title: "পরীক্ষার স্থান",
        verified: true,
        nearbyServices: [{ id: "toilet-1", name: "পাবলিক টয়লেট", kind: "টয়লেট", address: "প্রবেশপথ" }],
        reviews: {
          pending: { rating: 1, comment: "এখনো অনুমোদিত নয়" },
          approved: { status: "approved", rating: 4, comment: "পরিষ্কার", author: "সদস্য" },
        },
      },
    });
    expect(place.verified).toBe(true);
    expect(place.nearbyServices).toMatchObject([{ id: "toilet-1", name: "পাবলিক টয়লেট", kind: "টয়লেট" }]);
    expect(place.approvedReviews).toMatchObject([{ id: "approved", rating: 4, comment: "পরিষ্কার" }]);
  });

  it("filters by Bengali query, category, and locality", () => {
    const places = parseTourismPlaces({
      one: { title: "লালদিয়া বন", details: "ম্যানগ্রোভ প্রকৃতি", category: "nature", address: "লালদিয়া, পাথরঘাটা" },
      two: { title: "ঐতিহাসিক মসজিদ", details: "ইতিহাস", category: "history", address: "কাকচিড়া" },
    });
    expect(filterTourismPlaces(places, { query: "ম্যানগ্রোভ", category: "nature" })).toHaveLength(1);
    expect(filterTourismPlaces(places, { locality: "কাকচিড়া" }).map((place) => place.id)).toEqual(["two"]);
  });

  it("does not crash when Android lacks Bengali Intl locale data", () => {
    const lowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(() => { throw new RangeError("locale data unavailable"); });
    const compare = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (this: string, other: string) { return this < other ? -1 : this > other ? 1 : 0; });
    try {
      const places = parseTourismPlaces({ one: { title: "একটি স্থান", details: "বিবরণ" }, two: { title: "অন্য স্থান", details: "বিবরণ" } });
      expect(filterTourismPlaces(places, { query: "স্থান" })).toHaveLength(2);
      expect(sortTourismPlaces(places, "newest")).toHaveLength(2);
    } finally {
      lowerCase.mockRestore();
      compare.mockRestore();
    }
  });

  it("calculates and sorts known distances without inventing missing coordinates", () => {
    const places = parseTourismPlaces({ near: { title: "কাছের স্থান", latitude: 22, longitude: 89.9, updatedAt: 1 }, far: { title: "দূরের স্থান", latitude: 22.2, longitude: 90, updatedAt: 10 }, unknown: { title: "অজানা স্থান" } });
    const measured = attachTourismDistances(places, { latitude: 22, longitude: 89.9 });
    expect(measured.find((place) => place.id === "near")?.distanceKm).toBe(0);
    expect(measured.find((place) => place.id === "unknown")?.distanceKm).toBeUndefined();
    expect(sortTourismPlaces(measured, "nearby").map((place) => place.id)).toEqual(["near", "far", "unknown"]);
    expect(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeGreaterThan(110);
    expect(formatTourismDistance(0.42)).toBe("420 মিটার");
  });

  it("returns nearest directory services only when coordinates exist", () => {
    const services = parseTourismDirectoryServices({ close: { name: "কাছের স্বাস্থ্যকেন্দ্র", lat: 22.01, lng: 89.91, phone: "01700000001" }, noCoords: { name: "অজ্ঞাত স্থান" }, far: { name: "দূরের হাসপাতাল", lat: 23, lng: 90 } }, "স্বাস্থ্যসেবা");
    const nearest = nearestTourismServices(services, { latitude: 22, longitude: 89.9 });
    expect(nearest[0]).toMatchObject({ id: "close", name: "কাছের স্বাস্থ্যকেন্দ্র" });
    expect(nearest).toHaveLength(3);
    expect(nearestTourismServices(services).map((service) => service.id)).toEqual(["noCoords", "close", "far"]);
  });
});
