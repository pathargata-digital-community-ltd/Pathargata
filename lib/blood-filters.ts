export type UnionFilterOption = { value: string; label: string };

type FilterableDonor = {
  bloodGroup: string;
  union?: string | null;
};

export const BLOOD_UNION_FILTERS: readonly UnionFilterOption[] = [
  { value: "সব", label: "সকল এলাকা" },
  { value: "Patharghata Union Sadar", label: "পাথরঘাটা (সদর)" },
  { value: "Char Duani Union", label: "চরদুয়ানী" },
  { value: "Kakchira Union", label: "কাকচিরা" },
  { value: "Kalmegha Union", label: "কালমেঘা" },
  { value: "Kathaltoli Union", label: "কাঁঠালতলী" },
  { value: "Nachnapara Union", label: "নাচনাপাড়া" },
  { value: "Raihanpur Union", label: "রায়হানপুর" },
];

export function getBloodUnionFilterOptions(
  donors: readonly FilterableDonor[],
): UnionFilterOption[] {
  const known = new Set(BLOOD_UNION_FILTERS.map(({ value }) => value));
  const additional = new Set<string>();

  for (const donor of donors) {
    const union = donor.union?.trim();
    if (union && !known.has(union)) additional.add(union);
  }

  return [
    ...BLOOD_UNION_FILTERS,
    ...Array.from(additional, (value) => ({ value, label: value })),
  ];
}

export function filterBloodDonors<T extends FilterableDonor>(
  donors: readonly T[],
  bloodGroup: string,
  union: string,
): T[] {
  return donors.filter((donor) => {
    const donorUnion = donor.union?.trim() || "";
    const groupMatches = bloodGroup === "সব" || donor.bloodGroup === bloodGroup;
    const unionMatches = union === "সব" || donorUnion === union;
    return groupMatches && unionMatches;
  });
}
