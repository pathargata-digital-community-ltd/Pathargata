import { describe, expect, it } from "vitest";
import { getPostBackgroundColors } from "../lib/post-background";

describe("post text backgrounds", () => {
  it("converts saved CSS gradient themes to native gradient color stops", () => {
    expect(
      getPostBackgroundColors(
        "linear-gradient(to top, #ff0844 0%, #ffb199 100%)",
      ),
    ).toEqual(["#FF0844", "#FFB199"]);
  });

  it("preserves solid post colors as a native-compatible solid gradient", () => {
    expect(getPostBackgroundColors("#1877F2")).toEqual(["#1877F2", "#4FACFE"]);
    expect(getPostBackgroundColors("#abc")).toEqual(["#abc", "#abc"]);
  });

  it("does not apply a background when none is selected", () => {
    expect(getPostBackgroundColors(undefined)).toBeNull();
  });
});
