# পাথরঘাটা Native App — Production Hardening Plan

## উদ্দেশ্য

অ্যাপের security, Firebase read cost, performance, reliability এবং release readiness ধাপে ধাপে উন্নত করা হবে। এক ধাপে সব পরিবর্তন করা হবে না; প্রতিটি phase আলাদা validation, review এবং Git commit-এর পর পরবর্তী phase শুরু হবে।

## Delivery rules

- Live Firebase data migration বা rules deployment Emulator test ছাড়া করা যাবে না।
- কোনো service-account JSON, token, password বা private credential repository/chat-এ রাখা যাবে না।
- প্রতিটি phase শেষে TypeScript, lint, unit test, config validation এবং `git diff --check` চালাতে হবে।
- Security-sensitive পরিবর্তনের আগে read/write matrix এবং backward-compatibility যাচাই করতে হবে।
- Production rules-এ default deny এবং server-owned field protection থাকতে হবে।

## Phase 1 — Rules intake, versioning ও authorization baseline

**Status: প্রথম checkpoint সম্পন্ন**

- User-provided RTDB rules repository-তে draft হিসেবে version করা।
- `pushTokens/{uid}`-এ authenticated self-only read/write rule যোগ করা।
- Rules-এর critical gaps document করা।
- Live Firebase-এ deploy না করা যতক্ষণ না Emulator authorization tests তৈরি ও pass করে।
- `users/{uid}`-এ ordinary owner profile fields update এবং server-owned role/access/verification fields-এর invariant test করা।

**Gate:** rules parse, path inventory এবং security review complete।

## Phase 2 — Firebase Emulator authorization tests

- RTDB rules emulator configuration যোগ করা।
- Anonymous, ordinary user, owner, peer এবং admin test identity তৈরি করা।
- Profile, push token, notification, marketplace order, chat message, complaint, সব current report path, emergency alert, verification, blood request, operational/admin এবং counter/referral path-এর allow/deny matrix test সম্পন্ন; chat membership key migration এবং remaining admin path বাকি।
- Rules-এ `.validate`, immutable owner fields, field allowlist এবং query/index constraints যোগ করা।
- Storage rules ও upload path আলাদা test করা।

**Gate:** unauthorized read/write শূন্য; required app flows pass।

## Phase 3 — High-risk client authorization fixes

- Client-side role/status/accountAccess mutation বন্ধ করা।
- Deactivated account client-side reactivation বন্ধ করা।
- Notification creation validated backend event বা strict recipient/actor rules-এর মাধ্যমে করা।
- Marketplace, verification, complaints, blood এবং moderation transitions server-side enforce করা।
- Rules deploy করা এবং audit log সংরক্ষণ করা।

## Phase 4 — Firebase read-cost ও scaling

- Home feed full `posts` listener বাদ দিয়ে indexed cursor pagination।
- Profile own-post query এবং saved-post projection।
- `people_index` তৈরি করে People, Friends ও Compose tag picker থেকে full `users` read সরানো।
- Search-এর জন্য bounded indexed projections এবং submit/debounced search।
- Chat list row-এর per-row profile/status/latest-message reads বাদ দিয়ে denormalized `user_chats` summary।
- Notification unread counter এবং embedded preview fields।
- Directory saved view bounded করা।

## Phase 5 — Cache, lifecycle ও UI performance

- Logout/account switch-এ user-scoped AsyncStorage cache purge।
- Writes-এর পর targeted cache invalidation।
- Private data cache policy review।
- Feed/chat/service rows-এ `React.memo`, stable callbacks এবং image thumbnail/cache।
- Presence listener শুধু প্রয়োজনীয় active screen-এ সীমিত করা।

## Phase 6 — Media, push ও operational safety

- Unsigned Cloudinary upload-এর বদলে authenticated signed upload।
- Complaint/verification media private storage ও short-lived access।
- Chat media ownership, expiry ও deletion।
- Legacy `chats/{uid1_uid2}` key-এর exact participant membership migration; বর্তমান `.contains(auth.uid)` rule substring collision এড়াতে নতুন membership index প্রয়োজন।
- Push token lifecycle, receipt cleanup এবং notification retention policy review।
- App Check enforcement ও Play Integrity release test।

## Phase 7 — Release readiness

- Expo dependency alignment ও reproducible frozen-lockfile CI।
- Canonical lint/test command।
- Crash/performance/Functions monitoring।
- Android physical-device release smoke test: auth, offline, push, deep link, cache isolation, account switch।
- Final security checklist, build source commit এবং rollback plan।

## Current release gate

Rules Emulator test, server-side authorization এবং broad collection read remediation শেষ না হওয়া পর্যন্ত app-কে security-verified production-ready বলা যাবে না।
