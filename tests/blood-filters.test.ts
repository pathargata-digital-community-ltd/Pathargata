import { describe, expect, it } from "vitest";
import {
  BLOOD_UNION_FILTERS,
  filterBloodDonors,
  getBloodUnionFilterOptions,
} from "../lib/blood-filters";

const donors = [
  { name: "A", bloodGroup: "A+", union: "Patharghata Union Sadar" },
  { name: "B", bloodGroup: "A+", union: "  Char Duani Union  " },
  { name: "C", bloodGroup: "B+", union: "New Area" },
  { name: "D", bloodGroup: "A+" },
];

describe("getBloodUnionFilterOptions", () => {
  it("includes Web's seven canonical unions and any additional live donor areas once", () => {
    const options = getBloodUnionFilterOptions([
      ...donors,
      { name: "E", bloodGroup: "O+", union: "New Area" },
    ]);

    expect(options.slice(0, BLOOD_UNION_FILTERS.length)).toEqual(
      BLOOD_UNION_FILTERS,
    );
    expect(options.slice(BLOOD_UNION_FILTERS.length)).toEqual([
      { value: "New Area", label: "New Area" },
    ]);
  });

  it("retains all fixed options even when a union currently has no donors", () => {
    expect(getBloodUnionFilterOptions([])).toEqual(BLOOD_UNION_FILTERS);
  });
});

describe("filterBloodDonors", () => {
  it("applies blood-group and union filters together and trims donor union values", () => {
    expect(filterBloodDonors(donors, "A+", "Char Duani Union")).toEqual([
      donors[1],
    ]);
  });

  it("treats the all option independently for group and union", () => {
    expect(filterBloodDonors(donors, "সব", "সব")).toEqual(donors);
    expect(filterBloodDonors(donors, "B+", "সব")).toEqual([donors[2]]);
    expect(filterBloodDonors(donors, "সব", "Patharghata Union Sadar")).toEqual([
      donors[0],
    ]);
  });

  it("does not include donors with missing area in a specific union filter", () => {
    expect(filterBloodDonors(donors, "সব", "Raihanpur Union")).toEqual([]);
  });
});
