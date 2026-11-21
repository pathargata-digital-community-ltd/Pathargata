export type DirectorySuggestedEditInput = {
  suggestedName: string;
  suggestedPhone: string;
  details: string;
  submitterUid: string;
  submitterName: string;
};

export type DirectorySuggestedEdit = {
  suggestedName: string;
  suggestedPhone: string;
  details: string;
  submitterUid: string;
  submitterName: string;
  timestamp: number;
};

export function buildDirectorySuggestedEdit(
  input: DirectorySuggestedEditInput,
  timestamp = Date.now(),
): DirectorySuggestedEdit {
  const suggestedName = input.suggestedName.trim();
  const suggestedPhone = input.suggestedPhone.trim();

  if (!suggestedName || !suggestedPhone) {
    throw new Error("সঠিক নাম এবং মোবাইল নম্বর দিন।");
  }

  return {
    suggestedName,
    suggestedPhone,
    details: input.details.trim(),
    submitterUid: input.submitterUid,
    submitterName: input.submitterName.trim() || "অজ্ঞাত ব্যবহারকারী",
    timestamp,
  };
}
