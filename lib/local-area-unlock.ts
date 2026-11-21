let locallyVerifiedUid: string | null = null;

export function markLocalAreaVerified(uid: string) {
  locallyVerifiedUid = uid;
}

export function clearLocalAreaVerification(uid?: string) {
  if (!uid || locallyVerifiedUid === uid) locallyVerifiedUid = null;
}

export function isLocalAreaVerified(uid: string) {
  return locallyVerifiedUid === uid;
}
