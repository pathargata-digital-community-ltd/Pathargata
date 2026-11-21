import { describe, expect, it } from "vitest";
import { omitUndefinedFields } from "../lib/rtdb-safe-value";

describe("Realtime Database payload safety", () => {
  it("omits undefined optional fields but preserves empty strings and arrays", () => {
    expect(
      omitUndefinedFields({
        placeId: undefined,
        rating: undefined,
        title: "নতুন পর্যটন স্থান",
        phone: "",
        images: [],
      }),
    ).toEqual({
      title: "নতুন পর্যটন স্থান",
      phone: "",
      images: [],
    });
  });
});
