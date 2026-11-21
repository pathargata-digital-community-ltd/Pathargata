# Pathargata Native App — Production ও Billing Audit

**Audit scope:** repository-only, read-only review of client RTDB access, listener lifecycle, Firebase Functions, media/provider usage, security/privacy, CI/release readiness।

**Evidence policy:** নিচের confirmed findings কেবল repository-তে দেখা code/rules/config/test evidence-এর উপর ভিত্তি করে। Firebase/Cloudinary/Expo live metrics, production traffic, billing export, বা physical-device ফলাফল সংগ্রহ করা হয়নি। একই root cause-এর overlapping ফল একত্র করা হয়েছে; তবে traceability-এর জন্য source audit IDs এবং exact `file:line` evidence রাখা হয়েছে।

---

## 1. Executive summary

Pathargata Native App-কে বর্তমান অবস্থায় production ও billing-এর জন্য release-ready ধরা নিরাপদ নয়। সবচেয়ে জরুরি blocker হলো: (১) arbitrary authenticated write এবং private-data exposure-সহ RTDB authorization gap, (২) unsigned public Cloudinary upload preset, (৩) legacy chat authorization-এ UID substring matching, (৪) medical/blood ও donor data-এর broad read, (৫) account switch-এর পর পুরনো UID-এর listeners/state সক্রিয় থাকা, এবং (৬) বহু unbounded read/fan-out path যা user count, notification history, token count, shop count, media size ও chat history বাড়ার সঙ্গে খরচ বাড়ায়।

সরাসরি confirmed cost pressure-এর মধ্যে আছে `people_index`, `directory`, `posts`, `user_chats` ও unread notifications-এর broad/unbounded reads; notification enrichment-এর প্রতি item-এ ১–২টি read; seller-এর N+1 product queries; প্রতি chat row-তে duplicate profile/presence listeners; প্রতি keystroke typing write; Functions-এর full-tree scheduled scans; token-প্রতি Expo fan-out ও retries; এবং oversized/orphaned Cloudinary media। এসবের কিছু production volume ছাড়া monetary amount-এ quantify করা যায় না, কিন্তু code path-গুলি নিশ্চিতভাবে bounded নয়।

Security/privacy দিক থেকে release blocker হলো post interaction subtree-তে cross-user arbitrary writes, story reactions bypass, chat membership-এর substring fallback, blood request ও donor collection-এর collection-wide read, unsigned public upload, weak App Check posture, client-side deactivation reactivation, এবং unrestricted profile/marketplace/workflow writes। Sensitive verification/complaint/NID/chat media-এর URL public CDN namespace-এ রাখা হয়েছে; Firebase Rules Cloudinary object access নিয়ন্ত্রণ করে না।

Production evidence-ও অসম্পূর্ণ: CI source checks চালায়, কিন্তু exact production build, installable artifact, physical-device smoke test, staged rollout, crash/performance monitoring, billing alert, এবং tested rollback নেই। অতএব **P0 security/privacy এবং unbounded cost paths বন্ধ না হওয়া পর্যন্ত production rollout hold** করা উচিত।

### Confirmed বনাম live validation

- **Confirmed:** repository code/rules/config-এ উপস্থিত authorization defect, unbounded query/listener/scan, unsigned upload design, missing release gate, এবং lifecycle dependency defect।
- **Risk requiring live metrics/device test:** প্রকৃত monthly bill, average bytes/read, listener count, Expo 429 rate, Cloudinary storage/egress, crash rate, physical App Check/Push/Deep Link behavior, এবং low-end device memory impact। এগুলি অনুমান করা যাবে না; deployment-এর আগে safe measurement section-এর data সংগ্রহ করতে হবে।

---

## 2. Top urgent findings

| Rank | Severity / likely cost | Deduplicated issue | Exact evidence | কেন urgent |
|---|---|---|---|---|
| 1 | **P0 Critical — security + provider-billing** | Client-visible unsigned Cloudinary upload যেকোনো ব্যক্তি reuse করতে পারে; sensitive media-ও একই path ব্যবহার করে | `lib/media-upload.ts:15-23`; consumers `app/verification.tsx:17`, `app/service/complaints.tsx:44`, `lib/chat-media.ts:43,79`; unfinished hardening `docs/PRODUCTION-HARDENING-PLAN-BN.md:63-70` | Arbitrary storage/transform/egress, provider suspension/charge, bearer access to NID/complaint/chat media |
| 2 | **P0 Critical — data integrity** | Any authenticated non-tourist user অন্য post-এর likes/comments/voters/options/repost counter লিখতে পারে | `database.rules.json:187,190-204` | Feed integrity, spam, write/storage amplification, downstream notifications |
| 3 | **P0 Critical — private chat exposure** | Chat authorization-এ `$chatId.contains(auth.uid)` legacy fallback | `database.rules.json:252,254`; migration warning `docs/PHASE7-CHAT-MEMBERSHIP-MIGRATION-BN.md:3-9,60-64` | UID substring collision হলে অন্যের chat read/write সম্ভব |
| 4 | **P0 High — medical privacy** | সব authenticated user সম্পূর্ণ blood request পড়তে পারে | `database.rules.json:480-489`; test confirmation `tests/firebase-rules/blood-requests.test.ts:84-88` | Patient name, hospital, area, details, urgency প্রকাশ; regulatory/safety exposure |
| 5 | **P0 High — account isolation** | Account switch-এর পর AuthGate/Home/feed-এর old UID listener/state থাকে | `app/_layout.tsx:171-181` with `[authenticated]`; `app/(tabs)/index.tsx:54-62` with `[]`; `hooks/use-community-feed.ts:234-257,259-360` | Cross-account presentation/privacy; duplicate traffic ও stale callbacks |
| 6 | **P0 High — whole-collection reads** | Tag picker, directory bookmarks, profile own-posts এবং chat inbox root/full scans | `app/compose.tsx:146-153`; `app/service/directory.tsx:692-721`; `app/(tabs)/profile.tsx:170-186`; `app/(tabs)/messages.tsx:99-107` | User/data growth-এর সঙ্গে bandwidth, parse, memory ও Firebase reads linear নয়—full dataset ভিত্তিক |
| 7 | **P0 High — scheduled billing** | Notifications ও Expo receipts-এর unbounded full-tree scheduled scans | `functions/index.js:342-353,359-367`; `functions/index.js:259-283,294-331`; `functions/notification-expiration.js:21-29` | দৈনিক অন্তত 96 receipt full scans; retained/stuck data বাড়লে timeout/memory ও billed compute |
| 8 | **P0 High — push cost/reliability** | প্রতি token sequential Expo batches, 3-attempt retry, 20 concurrent instances; errors swallowed | `functions/index.js:133-140,170-225,99-130,203-209`; `functions/index.js:242-255` | Token count ও retry অনুযায়ী outbound requests/egress; no guaranteed retry বা eventual delivery |
| 9 | **P1 High — public media/privacy** | Cloudinary `secure_url` permanent-looking public URL হিসেবে RTDB records-এ যায়; deletion/expiry coupling নেই | `lib/media-upload.ts:29-31`; `app/compose.tsx:189-196`; `app/verification.tsx:17`; `app/profile.tsx:255-276`; `database.rules.json:179-205` | Sensitive documents/chat/profile media leak/retention এবং uncontrolled CDN egress |
| 10 | **P1 High — authorization hardening** | Story reactions bypass, unrestricted donor read/write, broad profile deletion/extra fields, forged friend graph, mutable marketplace ownership | `database.rules.json:231`; `349-353`; `113-115,167`; `154-158`; `313-327` | Low-skill abuse, data scraping, graph/catalog pollution, moderation ও support cost |
| 11 | **P1 High — media cost/reliability** | Image byte/pixel/type/count budget নেই; partial upload failure orphan assets; chat media full-size/base64 transfer | `lib/media-upload.ts:34-39,42-58`; `app/compose.tsx:117-125,180-183`; `lib/chat-media.ts:58-65,78-80,102-117`; `lib/media-upload.ts:19-28` | Mobile failure, duplicate billing, storage growth, low-memory crash risk |
| 12 | **P1 High — release blocker** | CI build/signing/device/release/rollback gate চালায় না; monitoring নেই; App Check fail-open | `.github/workflows/ci.yml:16-68`; `eas.json:2-15`; `lib/firebase-app-check.ts:22-64`; `app/_layout.tsx:217-223`; `docs/PRODUCTION-HARDENING-PLAN-BN.md:72-82` | Green CI production binary বা abuse-control behavior প্রমাণ করে না |

---

## 3. Cost ও billing pressure table

| Cost surface | Confirmed implementation | Cost driver | Severity | Recommended control |
|---|---|---|---|---|
| RTDB people search | Root `get("people_index")`, local filter/sort | মোট user index size × picker open | High | Non-empty search + indexed bounded query বা bounded projection; `app/compose.tsx:146-153` |
| Directory bookmarks | Root `onValue("directory")`, local filtering | পুরো directory snapshot × focus/change | High | Per-item/category reads বা materialized saved-entry view; `app/service/directory.tsx:692-721` |
| Notifications | Unbounded unread listener; per item 2 enrichment reads | Unread history + page size + focus merges | High | `unreadCount` summary/retention; denormalized sender/post preview; `hooks/use-notifications.ts:117-123,192-239` |
| Seller catalog | `Promise.all`-এ প্রতি shop-এর product query | Owned shop count × product payload | High | Single owner index/materialized seller view + session cache; `components/market-seller-center.tsx:98-103` |
| Chat inbox/listeners | Root `user_chats`; প্রতি row-তে 2 listener, selected row duplicate | Chat count × listeners × presence changes | High | Bounded inbox, shared reference-counted subscription; `messages.tsx:99-107,178-184`, `components/chat-list-row.tsx:35-52`, `lib/rtdb-cache.ts:214-257` |
| Feed/saved/profile | Bounded child count হলেও child payload full; saved post N+1; profile full `posts` root | Embedded likes/comments/media/history; saved count; total post count | High | Feed projection, counts/previews, pagination, UID-indexed own posts; `hooks/use-community-feed.ts:284-321`, `app/saved-posts.tsx:21-23`, `app/(tabs)/profile.tsx:170-186` |
| Typing/read receipts | Every keystroke writes; 50-message callback can rewrite receipt statuses | Keystrokes/message volume × writes | Medium | 300–500ms debounce/state transition; lastRead field; `messages.tsx:156-168,191` |
| Focus lifecycle | Focus/reload পুনরায় listeners attach; auth switch stale streams | Navigation/account transitions × listener setup | High | Reactive `uid`/generation, shared stores, active listener metric; `hooks/use-community-feed.ts:234-360`, `app/(tabs)/index.tsx:54-62` |
| Functions notification cleanup | প্রতি ঘণ্টায় root `notificationsRef.get()` | Total retained notification tree × 24/day | High | Time buckets/expiry queue/cursor/work budget; `functions/index.js:342-367` |
| Functions receipts | প্রতি 15 মিনিটে full `expoPushReceipts.get()` | Total receipt tree × 96/day | High | Eligibility queue/bounded cursor/item budget; `functions/index.js:259-331` |
| Push/Expo | Up to `ceil(tokens/100)` calls, 3 attempts, one receipt write/token; 20 concurrent | Tokens × notifications × retries | High | Durable queue, token cap/pagination, idempotency, 429 metrics, concurrency cap; `functions/index.js:133-225` |
| Cloudinary uploads | Unsigned arbitrary files; up to 4 quality-1 images; no cleanup | Bytes × uploads + storage/transform/egress + abuse | Critical | Signed upload, byte/pixel/type/quota caps, derivatives, orphan sweeper; `lib/media-upload.ts:15-23,34-39`, `app/compose.tsx:117-125` |
| Chat media | Full ciphertext upload/download, base64/data URI, 50-message decrypt | Attachment bytes × viewers/reopens + storage retention | High | Encrypted thumbnails, lazy/concurrency cap, file URI, expiry/refcount; `lib/chat-media.ts:58-117` |
| Third-party embeds | YouTube/Drive WebView with wildcard origin/JS/DOM storage | External video/ads/scripts/egress; user disclosure | High | Exact host allowlist, tap-to-play, lazy/unmount, limited JS/storage; `components/post-rich-media.tsx:415-454` |
| Resource ceilings | Push 20 instances; cleanup 512 MiB/540s; others 10/256 MiB | Burst concurrency, long billed duration | Medium | p95-based limits, budgets/alerts, backlog SLO; `functions/index.js:37-40,79-82,137-140,263-267,347-350` |

**Billing conclusion:** exact টাকা/ডলার impact live export ছাড়া বলা যাবে না। কিন্তু unbounded dimensions এবং client-controllable abuse boundary-এর কারণে spend ceiling code দ্বারা যথেষ্ট নিয়ন্ত্রিত নয়।

---

## 4. Security ও privacy issues

### 4.1 Confirmed release blockers

1. **RTDB interaction authorization:** `database.rules.json:187,190-204`-এ authenticated non-tourist user অন্য post-এর likes/comments/voters/options/repost counter লিখতে পারে; actor key/immutable author/server counter নেই।
2. **Story overwrite bypass:** `database.rules.json:231`-এ `reactions` উপস্থিত থাকলেই ownership/participant check পাশ করার সম্ভাবনা আছে।
3. **Chat boundary:** `database.rules.json:252,254`-এর substring matching exact `chat_members` membership নয়; documented collision risk `docs/PHASE7-CHAT-MEMBERSHIP-MIGRATION-BN.md:3-9,60-64`।
4. **Medical data:** `database.rules.json:480-489` ও test `tests/firebase-rules/blood-requests.test.ts:84-88` collection-wide authenticated read নিশ্চিত করে। Donor collection-ও `database.rules.json:349-353`-এ broad read।
5. **Unsigned media:** `lib/media-upload.ts:15-23`-এর public preset re-useযোগ্য; verification/complaint/chat paths-এ sensitive content ঢোকে।
6. **App Check:** Source integration এখন web reCAPTCHA hook, native Play Integrity/App Attest provider selection, auto-refresh এবং controlled failure warning দেয় (`lib/firebase-app-check.ts`, `app/_layout.tsx`, `components/global-app-status.tsx`)। Live provider metrics, physical-device evidence এবং service-by-service enforcement এখনও deployment gate।
7. **User/profile controls:** owner পুরো `users/$uid` delete করতে পারে `database.rules.json:113-115`; parent `.validate` delete-এ প্রযোজ্য নয়, এবং complete field allowlist নেই `database.rules.json:167`।
8. **Graph/catalog/workflow manipulation:** friends `database.rules.json:154-158`; market owner UID immutability absent `313-327`; directory edits attribution/validation absent `36-44`; verification/complaint fields weakly bounded `381-382`, `373-374`; notifications arbitrary targeting risk `301`, `262-265`।
9. **Credential handling:** reusable plaintext password design `lib/saved-accounts.ts:14-17,61-73,103-109`; tracked Firebase client config ও extra admin package mismatch `google-services.json:1-68`, `app.config.ts:37-39,85-92`; ignored debug token evidence `database-debug.log:11+` (token validity live-verify করতে হবে, তবে rotate/revoke করা উচিত)।

### 4.2 Account isolation এবং lifecycle

`app/_layout.tsx:171-181` effect কেবল `[authenticated]`-এর উপর নির্ভর করে; authenticated A থেকে B switch-এ A listener cleanup/ B listener attach নাও হতে পারে। একই pattern `app/(tabs)/index.tsx:54-62` (`[]`) এবং `hooks/use-community-feed.ts:234-257,259-360`-এ আছে। Messages listener `app/(tabs)/messages.tsx:99-107`-ও reactive auth context নয়। Result: পুরনো account-এর upload status, profile settings, feed filter, chat state বা cached data নতুন account-এ দেখা/প্রয়োগ হতে পারে।

### 4.3 Public media এবং third-party disclosure

`lib/media-upload.ts:29-31` public `secure_url` return করে; `database.rules.json` Cloudinary object boundary enforce করে না। `components/post-rich-media.tsx:415-454` user-supplied YouTube/Drive IDs WebView-তে wildcard origin, JavaScript ও DOM storage সহ চালায়। এটি bandwidth-এর পাশাপাশি IP/device/referrer/storage disclosure ও malicious/changed embed risk তৈরি করে।

---

## 5. Performance ও request issues

- **Broad RTDB reads:** `app/compose.tsx:146-153`, `app/service/directory.tsx:692-721`, `app/(tabs)/profile.tsx:170-186`, `app/(tabs)/messages.tsx:99-107`।
- **N+1 requests:** notifications `hooks/use-notifications.ts:192-239`; saved posts `app/saved-posts.tsx:21-23`; seller center `components/market-seller-center.tsx:98-103`; blocked users `app/settings.tsx:121-175`।
- **Unbounded/history payload:** unread notifications `hooks/use-notifications.ts:117-123`; feed/catalog child payload `hooks/use-community-feed.ts:284-321`, `hooks/use-marketplace-catalog.ts:141-173`; chat 50-message snapshot `messages.tsx:156-175`।
- **Listener multiplication:** row listeners `components/chat-list-row.tsx:35-52`; selected conversation `messages.tsx:178-184`; cache has no shared registry `lib/rtdb-cache.ts:214-257`।
- **Duplicate async work:** decrypt can start before ref sync `messages.tsx:157-175`; auth fetch lacks cancellation `hooks/use-auth.ts:93-117`।
- **Writes:** typing per keystroke `messages.tsx:191`; receipt fan-out `messages.tsx:156-168`; separate interaction/progress writes `lib/post-interactions.ts:86-108`, `app/compose.tsx:175-183`।
- **Media:** original images/video/audio and retry same URI `components/post-rich-media.tsx:181-205,334-390`; chat full bytes/base64 `lib/chat-media.ts:58-117`; no consistent derivative/cache/retry budget।

একটি mitigating observation আছে: representative paths-এ unsubscribe সাধারণত আছে; repository scan-এ `onChild` বা application polling loop পাওয়া যায়নি, voice recording-এর `500ms` interval `messages.tsx:76-80`-এ cleanup হয়। এটি broad reads ও UID lifecycle defects বাতিল করে না।

---

## 6. Production readiness gaps

1. **Build/release gate:** `.github/workflows/ci.yml:16-68` source checks করে, কিন্তু EAS production build, signing/provenance, installable artifact, staged rollout, store submission বা post-release check নেই।
2. **Rollback:** `eas.json:2-15`-এ channel/runtimeVersion/rollback policy নেই; documented rollback future work `docs/PRODUCTION-HARDENING-PLAN-BN.md:72-78`। Firebase Rules/Functions/data migration restore runbook নেই।
3. **Physical-device evidence:** Android push, deep link, offline/reconnect, cache isolation, account switch ও App Check-এর repeatable evidence নেই; docs-এ requirement আছে `docs/ANDROID-APPCHECK-PLAY-INTEGRITY-SETUP-BN.md:23-45`।
4. **Monitoring:** Sentry/Crashlytics/ErrorBoundary/performance reporter/alert policy নেই; client mostly console logging (`app/_layout.tsx:220-222`, `hooks/use-push-notifications.ts:118-121`)।
5. **Functions confidence:** 11 helper tests pass, কিন্তু exported triggers/schedulers, descendant writes, Expo 429/5xx, cursor/scale নেই। Root CI Functions dependency install/integration-ও চালায় না `.github/workflows/ci.yml:56-60`; `functions/package.json:8-14` কেবল `node --test`।
6. **Dependency/config drift:** Expo SDK ~57-এর সঙ্গে `expo-crypto ^58.0.7` mismatch `package.json:41-67`; stale Android identifier `EXPO-APK-BUILD-BN.md:38-44,76-81` বনাম canonical `app.config.ts:9,38,91-92`।
7. **Business workflow:** deactivated user client-side reactivate করে `app/_layout.tsx:128-143`; server-owned account state নয়।

---

## 7. Prioritized remediation plan

### P0 — deployment hold; আগে শেষ করতে হবে

1. **Rules lockdown ও emulator proof:** post interactions, stories, chats, blood requests, donors, friends, marketplace, directory edits, notifications, verification/complaints-এর exact owner/actor/schema/rate limits লিখুন। UID substring fallback সরিয়ে `chat_members/{chatId}/{uid}` exact check দিন। Cross-user overwrite, field read, delete, status-transition tests যোগ করুন।
2. **Cloudinary containment:** exposed preset rotate/revoke; unsigned direct upload বন্ধ; Firebase Auth/App Check যাচাই করা backend থেকে short-lived signed parameters দিন। Allowlist bytes, MIME magic bytes, dimensions, duration, folder, per-user/global quota। Sensitive media private/authenticated delivery ও deletion/retention দিন।
3. **Medical/private data projection:** blood/donor/profile public projection আলাদা করুন; patientName/hospital/details/tracking/contact private করুন। Existing records migration/rotation plan করুন।
4. **UID-scoped session provider:** reactive `uid` + auth generation দিন; প্রতিটি user-scoped effect dependency-তে দিন; logout/switch-এ state/cache clear, old unsubscribe, async generation guard।
5. **Stop full scans:** people/directory/profile/inbox/unread paths bounded/indexed projection করুন। Notification enrichment server-denormalize করুন।
6. **Functions cost containment:** notification/receipt expiry queue বা time buckets, cursor/checkpoint, per-run item/time budget, stuck pending dead-letter। Push durable queue, token pagination/cap, idempotency, retryable error rethrow/queue, Expo concurrency cap।
7. **Production gate:** exact EAS production artifact, Firebase emulator integration, physical Android smoke suite, App Check enforcement canary, Crash/alerting, billing budget এবং tested rollback ছাড়া release নয়।

### P1 — প্রথম production hardening sprint

1. Chat/listener shared store ও reference-counted subscriptions; inbox pagination/active-vs-archived split।
2. Feed/catalog/saved posts-এর card projection; like/comment counts ও small preview আলাদা; media derivative/thumbnail, lazy load, bounded cache, retry cap।
3. Upload session/manifest, hash/idempotency, timeout/cancel/backoff, transactional commit এবং orphan sweeper। Chat attachment lazy decrypt, in-flight set, encrypted thumbnails, file URI, expiry/refcount।
4. Typing debounce/state transition; lastReadAt/lastReadMessageId; multi-path atomic writes।
5. App Check web provider, native failure controlled degraded state, staged enforcement metrics।
6. Crash/performance/error telemetry with app/build/uid-hash dimensions; Functions dashboards for duration, retry, backlog, Expo status, Cloudinary failures।
7. Remove raw password storage; enforce profile/market/workflow field allowlists; server-owned deactivation/reactivation and order transitions।

### P2 — scale ও maintenance

1. Static checks: root `get/onValue`, missing limits, collection-level rule reads, public URL writes, duplicate listener patterns।
2. Emulator/synthetic scale tests: N users, unread notifications, shops/tokens, 50+ chat media, large posts।
3. Dependency alignment: Expo SDK compatibility check, exact high-risk native versions, install both root/functions lockfiles in CI।
4. Documentation single source for package ID/Firebase/OAuth/EAS; release/rollback runbook quarterly drill।
5. Retention jobs for stale cache, media, notifications, chat attachments ও failed upload sessions; privacy review ও data inventory।

---

## 8. Deployment-এর আগে safe measurements

Live production data না পড়ে staging/emulator, synthetic accounts, provider test project এবং approved observability ব্যবহার করে নিচের measurements সংগ্রহ করুন। কোনো raw NID, password, token, message, patient detail বা full media URL log করবেন না।

### Firebase RTDB

- প্রতি screen/action-এ `read operations`, snapshot bytes, decompressed bytes, parse time, render time: tag picker, directory bookmarks, notifications, feed, saved posts, seller center, inbox, profile।
- Per-user **active listener count**, query/path, attach/detach rate, listener lifetime, reconnect count; account A→B→logout-এর পরে old UID listener count শূন্য কিনা।
- Notification page size, unread count distribution p50/p95/p99, enrichment cache hit rate, reads per notification।
- Chat count distribution, listeners per inbox, presence/typing event rate, writes per keystroke/message, read-receipt writes/message।
- RTDB billed read/write/download bytes এবং top paths from Firebase usage export; staging synthetic load-এ user/post/shop/token scale curve।
- Rule-denied request count by path, especially chat, blood, donor, media metadata, verification/complaint, and App Check missing/invalid।

### Cloud Functions ও Expo

- Function invocations, duration p50/p95/p99, memory, error/timeout/retry rate, concurrent instances, scheduler overlap।
- Notification cleanup scan count, expired/deleted count, oldest retained/pending age, scan bytes, checkpoint progress।
- Expo push: tokens/notification, batches, accepted tickets, permanent errors, 429/5xx, retry attempts, oldest receipt age, backlog depth, delivery latency।
- Duplicate trigger rate for users index, referral processedAt, notification dispatch; idempotency-key collision ও ambiguous timeout count।
- Functions/RTDB cost export এবং per-feature attribution যেখানে possible; budgets/alerts test করে notification verify করুন।

### Media/provider

- Upload count/user/day, bytes/file p50/p95/p99, pixel dimensions, MIME mismatch, duration, failure/timeout/retry, orphaned asset count/age।
- Cloudinary storage bytes, transformations, CDN egress, unsigned-preset attempts, folder/owner distribution; provider quota alert।
- Screen-wise media bytes: feed, detail, profile, chat open, full-screen gallery; cache hit/miss, retry count, visible-only load ratio।
- Chat attachment decrypt concurrency, peak native heap, base64/data-URI allocation, low-end Android memory/ANR/crash; voice cache size ও eviction।
- External embed load count, play duration, WebView errors, exact host validation; no content/IP/device identifiers in application logs।

### Security/privacy ও release

- Firebase Emulator negative tests: cross-user post/story/chat/blood/donor/friend/market/workflow writes; exact field-level reads; delete/UID-change/status-change; App Check missing token।
- Physical Android test matrix: clean install, upgrade, logout/login A→B, offline/reconnect, App Check valid/invalid, push permission/token/receipt/tap/deep link, background/lock screen, low-memory chat media।
- Release artifact checks: commit SHA, EAS profile, package ID, `google-services.json`, OAuth redirect, Firebase project, Play Integrity/App Check project match।
- Crash-free sessions, fatal/nonfatal errors, auth/App Check/push registration failure by app version/build/device/OS; rollout cohort comparison।
- Rollback drill duration and success: OTA/channel, Play staged release halt, Firebase Rules restore, Functions version restore, and data migration compatibility।

### Measurement stop conditions

Deployment থামান যদি: any P0 rule test fail করে; unsigned upload এখনও reachable থাকে; old UID listener/account data switch-এর পরে থাকে; full-tree scheduled scan-এর bounded budget না থাকে; App Check behavior অজানা থাকে; physical-device push/deep link/offline smoke fail করে; crash/error alerting বা billing budget সক্রিয় না থাকে; অথবা rollback rehearsal সফল না হয়।

---

## 9. Audit limitations ও non-findings

এই রিপোর্ট repository inspection-ভিত্তিক। কোনো live Firebase/Cloudinary/Expo account, billing export, production traffic, credentials, deploy বা login ব্যবহার করা হয়নি। তাই monetary amount, actual exploitability under deployed Rules version, real Cloudinary visibility, App Check enforcement state, provider quota, crash rate, এবং physical-device behavior আলাদাভাবে verify করতে হবে।

Repository scan-এ blanket listener-unsubscribe failure, `onChild` listener বা application polling storm নিশ্চিত পাওয়া যায়নি; representative screens-এ unsubscribe pattern আছে এবং voice recording interval cleanup হয়। এটি confirmed broad-read, authorization, media, backend scan, বা account-switch findings কমায় না।

**Overall decision: NO-GO for unrestricted production release.** P0 remediation, emulator/physical-device evidence, live cost baseline ও rollback proof সম্পন্ন হলে staged/canary release বিবেচনা করা যেতে পারে।
