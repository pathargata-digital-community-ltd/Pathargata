import { describe, expect, it } from "vitest";
import { buildDirectorySuggestedEdit } from "../lib/directory-edits";

describe("buildDirectorySuggestedEdit", () => {
  it("matches the Web directory_edits payload and trims user input", () => {
    expect(
      buildDirectorySuggestedEdit(
        {
          suggestedName: "  সঠিক নাম  ",
          suggestedPhone: "  01700000000 ",
          details: "  নতুন ঠিকানা  ",
          submitterUid: "user-1",
          submitterName: "  ব্যবহারকারী  ",
        },
        1234,
      ),
    ).toEqual({
      suggestedName: "সঠিক নাম",
      suggestedPhone: "01700000000",
      details: "নতুন ঠিকানা",
      submitterUid: "user-1",
      submitterName: "ব্যবহারকারী",
      timestamp: 1234,
    });
  });

  it("requires both the suggested name and phone", () => {
    expect(() =>
      buildDirectorySuggestedEdit({
        suggestedName: " ",
        suggestedPhone: "01700000000",
        details: "",
        submitterUid: "user-1",
        submitterName: "",
      }),
    ).toThrow("সঠিক নাম এবং মোবাইল নম্বর দিন।");
  });
});
