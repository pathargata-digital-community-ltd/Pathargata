# Production Remediation Roadmap

## লক্ষ্য

অ্যাপটিকে demo/controlled preview অবস্থা থেকে security-reviewed, cost-controlled, observable এবং Android production release-এর উপযোগী অবস্থায় নেওয়া। প্রতিটি phase আলাদাভাবে implement, test, review এবং commit/push করতে হবে। কোনো live Firebase deploy, data migration, Functions deploy, EAS build বা billing change explicit confirmation ছাড়া হবে না।

## Release policy

- P0 security/privacy blocker unresolved থাকলে public production release নয়।
- Live data migration-এর আগে read-only export, dry-run report, immutable backup, expected write count এবং rollback plan বাধ্যতামূলক।
- প্রতিটি phase শেষে TypeScript, lint, app tests, Rules emulator tests, Functions tests, config validation এবং `git diff --check` চালাতে হবে।
- কোনো phase-এর test fail হলে পরবর্তী phase শুরু হবে না।
- Secrets source code, repository বা chat-এ রাখা যাবে না।

## Phase 0 — Baseline ও change control

**Status: completed**

- Repository clean এবং `main` synchronized।
- Production/cost audit report তৈরি।
- Read-only data audit tooling তৈরি।
- Baseline tests এবং Rules emulator coverage recorded।

**Gate:** audit report এবং roadmap versioned; no live mutation.

## Phase 1 — P0 authorization ও account isolation

**Priority: এখন শুরু হবে**

1. **সম্পন্ন:** Post `likes/comments/voters/options/repostCount`-এ cross-user arbitrary write বন্ধ করা; নিজের interaction key, comment ownership এবং bounded poll increment Rules-এ enforce করা হয়েছে।
2. **সম্পন্ন:** Story `reactions` bypass সরিয়ে owner/admin এবং per-user reaction Rules করা হয়েছে; public story-তে legitimate reaction চালু আছে, UID spoofing বন্ধ।
3. **Repository Rules সম্পন্ন:** `$chatId.contains(auth.uid)` legacy fallback সরিয়ে `chat_members/{chatId}/{uid}` exact membership দিয়ে `chats` ও `message_reports` authorization enforce করা হয়েছে; valid existing chats-এর Admin SDK backfill ছাড়া live Rules cutover নয়।
4. **Schema/Rules সম্পন্ন:** Blood request ও donor-এর public/private projection আলাদা করা হয়েছে; donor phone/private record এখন owner/admin-only, directory/search `donors_public` projection ব্যবহার করে। পুরোনো donor records-এর একবারের admin backfill এখনো live করা হয়নি।
5. **সম্পন্ন:** Users profile-এ broad client root write সরিয়ে explicit editable fields/subtrees allowlist করা হয়েছে; profile deletion, unknown-field injection, admin-owned field mutation এবং grace-period-এর বাইরে status reactivation বন্ধ।
6. **সম্পন্ন:** Account switch/logout-এ UID-scoped cache key, cache purge এবং session-generation fencing যোগ করা হয়েছে; পুরোনো account-এর listener callback নতুন account বা logout-এর পরে UI-তে data পাঠাতে পারবে না।
7. **সম্পন্ন:** Verification ও complaint payload-এ bounded size, enum, timestamp, Cloudinary URL host এবং immutable-field validation যোগ করা হয়েছে; invalid payment method/NID/evidence URL এবং oversized complaint rejection-এর regression test আছে।
8. **Preflight সম্পন্ন:** Firebase project identity, Rules/Functions source, Node.js 22 runtime, Expo/Android identity এবং Functions tests-এর deployment checklist যোগ করা হয়েছে। Live Firebase deploy এখনো explicit release approval, authenticated Firebase CLI এবং migration backup-এর অপেক্ষায়।
9. **সম্পন্ন:** Issue 10 authorization hardening-এ story reaction parent-write bypass বন্ধ, friend request ছাড়া forged friend edge বন্ধ, donor private record UID/schema validation, এবং marketplace item/shop ownership immutability enforce করা হয়েছে; Rules emulator regression tests যোগ হয়েছে।
10. **সম্পন্ন:** Issue 11 auth/session/OAuth logging development-only diagnostics-এ সীমাবদ্ধ করা হয়েছে; production event-এ allow-listed code ও anonymous UID hash ছাড়া raw token, email, UID বা provider error message রাখা হয় না। Auth failure UI-তেও generic sanitized message ব্যবহার করা হয়েছে।

**Gate:** unauthorized write/read tests pass; retained-screen account A→B→logout test pass; no live rules deploy.

## Phase 2 — RTDB read/write cost reduction

1. **সম্পন্ন:** `people_index` root read-এর বদলে bounded indexed search এবং explicit profile-visibility consent।
2. **সম্পন্ন:** Directory bookmark mode-এ category-tree fan-out read বাদ দিয়ে local materialized bookmark projection ও active-category refresh করা হয়েছে।
3. **সম্পন্ন:** Profile own-posts-এর full listener বাদ দিয়ে UID-indexed/paginated query রাখা হয়েছে; প্রতি page-এ সর্বোচ্চ bounded post hydration হয়।
4. **সম্পন্ন:** User inbox timestamp-indexed bounded query এবং active conversation-only typing/profile/presence listeners রাখা হয়েছে; inbox row থেকে per-row listeners বাদ।
5. **সম্পন্ন:** Notification payload-এ sender/post preview আগে থেকেই denormalized; unread query bounded screen listener হিসেবে রাখা হয়েছে।
6. **সম্পন্ন:** Notification enrichment একই sender/post-এর জন্য cache/dedup করে; stored preview/photo থাকলে কোনো enrichment read হয় না।
7. **সম্পন্ন:** Seller center owner-indexed shop ও product reads-এ নামানো হয়েছে; প্রতি shop-এর আলাদা product query বাদ।
8. Typing writes debounce এবং read receipt `lastRead` model।
9. Feed/card projection-এ bounded counts/previews।

**Gate:** static broad-read scan pass; request/read budget tests pass; screen-level listener count documented.

## Phase 3 — Media security ও provider cost control

1. Unsigned Cloudinary preset বন্ধ করা।
2. Authenticated short-lived signed upload flow design/implementation।
3. Byte, pixel, MIME, duration, count এবং per-user quota server-side enforce করা।
4. Verification/NID/complaint media private storage এবং short-lived signed delivery।
5. Upload session manifest, idempotency, timeout, cancellation এবং orphan sweeper।
6. Chat media lazy decrypt, concurrency cap, file URI এবং expiry/deletion lifecycle।
7. Image derivatives, thumbnails, poster frames ও bounded cache।
8. External WebView exact host allowlist, tap-to-play এবং restricted JS/storage।

**Gate:** provider mock tests, partial-failure cleanup tests, privacy URL tests, media budget tests pass. Live provider migration আলাদা approval-dependent।

## Phase 4 — Functions scalability, retry ও billing protection

1. ✅ Notification cleanup-এর hourly full-tree scan বাদ দিয়ে bounded expiry queue; per-item lease, retry backoff, malformed/dead-letter routing ও 45-second time budget যোগ হয়েছে।
2. ✅ Expo receipts-এর full-tree scan বাদ দিয়ে bounded eligibility query; attempt counter, lease/backoff, five-attempt dead-letter guard ও 45-second time budget যোগ হয়েছে।
3. ✅ Push token cap, concurrency cap এবং per-dispatch token idempotency state।
4. ✅ Retryable error rethrow ও bounded dead-letter attempt guard।
5. Referral descendant trigger guard।
6. User projection trigger only on relevant field change।
7. Pending/unsent notification maximum age ও dead-letter retention।
8. Functions emulator integration এবং synthetic scale tests।
9. ✅ `maintenanceState`-এ last run, oldest due item, backlog sample, cursor checkpoint ও time-budget status লিখে operational monitoring surface তৈরি করা হয়েছে।
10. Cloud Monitoring error, latency, backlog, retry ও budget alerts design।
11. ✅ Push delivery-তে bounded token query, durable retry queue, idempotent sent-token state, lease/backoff, permanent-vs-retryable classification ও dead-letter routing যোগ করা হয়েছে।

**Gate:** Functions integration tests pass; bounded work per invocation; retry/duplicate scenarios covered. Firebase deploy নয়।

## Phase 5 — App Check, Android push ও release validation

1. Android package/Firebase/EAS identity validation বজায় রাখা।
2. Debug provider ও Play Integrity release provider আলাদা smoke test।
3. App Check failure state observable এবং controlled degraded mode করা।
4. Android notification permission/channel/token/lock-screen checklist।
5. Notification payload privacy review।
6. Exact preview APK build only after secure Expo login/approval and free-quota check।
7. Physical Android test: foreground/background/terminated/locked/deep-link/offline/account-switch।

**Repository-side status:** ✅ `pnpm validate:release` যোগ করা হয়েছে; এটি Expo version, Android package, Firebase project, EAS project, preview APK/production AAB profile এবং release App Check provider যাচাই করে। Physical-device/EAS artifact evidence ledger `docs/RELEASE-EVIDENCE-BN.md`-এ তৈরি হয়েছে।

**Pending external gate:** EAS account authorization ও explicit build approval, preview APK artifact/checksum, physical Android smoke test এবং Play Integrity/App Check live metrics। এই repository-side কাজ কোনো EAS build, Firebase network call বা live release চালায়নি।

**App Check hardening:** ✅ Native App Check failure এখন observable। Development build-এ debug-token warning ও retry দেখায়; release-style build-এ valid App Check token না পাওয়া পর্যন্ত blocking safety state দেখায়। Rejected initialization cache করা হয় না, তাই connectivity/Play Services/debug-token ঠিক করার পরে retry কার্যকর। Firebase Console-এর strict enforcement staged rollout এখনও authorized operator-এর pending external action।

**Gate:** physical device evidence, no unresolved P0, explicit build confirmation.

## Phase 6 — Observability, rollback ও controlled launch

1. Root error boundary এবং privacy-reviewed crash reporting।
2. Build/version tagged health events।
3. Firebase/Functions/Expo/Cloudinary operational dashboards।
4. Billing budget and anomaly alerts।
5. Firebase Rules/Functions rollback runbook।
6. EAS binary/OTA rollback runbook।
7. Staged internal/closed rollout এবং post-release monitoring window।

## Feature hardening — in-app notification ও marketplace order flow

**Status: repository implementation completed; live Functions deployment ও physical-device validation pending.**

- Homepage-এ নতুন like, comment, repost এবং marketplace order-এর জন্য bounded live listener-ভিত্তিক compact banner যোগ হয়েছে; banner tap করলে notification center খোলে।
- Notification center-এ social/message/urgent/order filter, repost summary এবং seller-এর pending order সরাসরি গ্রহণ করার action যোগ হয়েছে। Order transition RTDB Rules দ্বারা seller ownership ও valid status transition অনুযায়ী enforce হয়।
- Marketplace order create/status change-এর notification Cloud Functions থেকে server-side তৈরি হয়; buyer/seller notification deterministic ID-তে লেখা হয়, যাতে retry-তে duplicate notification না হয়। Push formatter-এ order/repost category ও deep-link metadata যোগ হয়েছে।
- Repost notification-এর client write authorization original post owner এবং actor UID দিয়ে Rules-এ সীমাবদ্ধ; regression test যুক্ত ও pass হয়েছে।
- Validation: TypeScript, app tests (149 pass), Functions tests (18 pass), notification Rules emulator tests (6 pass), JavaScript syntax checks এবং `git diff --check` pass।
- Pending: `notifyMarketplaceOrder` Functions deploy, physical Android foreground/background/terminated/deep-link smoke test, এবং release build evidence।
- Account Center-এর আলাদা password reset row সরিয়ে password change modal-এর ভিতরে forgot-current-password flow রাখা হয়েছে; reset email request-এ loading guard ও ৩০-সেকেন্ড cooldown আছে, যাতে repeated tap থেকে duplicate request না যায়।

## AI Assistant — Phase 1

**Status: repository implementation completed; provider secret/configuration, Functions deployment এবং physical-device validation pending.**

- Home screen-এর দ্রুত সেবা shortcut area-তে `AI সহকারী` shortcut এবং `/ai-assistant` Bengali-first chat screen যোগ হয়েছে।
- `aiAssistant` authenticated read-only callable Function bounded public directory, recent marketplace products, current user-এর own orders এবং own notifications-এর context তৈরি করে; raw Firebase tree বা অন্য user-এর private data model-এ পাঠায় না।
- Phase 1-এ কোনো blood request, order accept/cancel, message send, complaint submit বা account/security write action চালু করা হয়নি। Directory phone/map এবং allowlisted navigation explicit user tap-এর মাধ্যমে হয়।
- Model provider failure হলে bounded search-card fallback থাকে; provider key Firebase Secret Manager-এ রাখার deployment নির্দেশনা Functions README-তে যোগ হয়েছে।
- Validation: TypeScript check, JavaScript syntax check, AI helper tests (4 pass), এবং `git diff --check` pass।
- Pending: `PATHARGATA_AI_API_KEY` configure করা, `aiAssistant` deploy করা, provider response smoke test, এবং physical Android UI validation।

### AI Assistant — Phase 2: রক্ত সেবা ও অর্ডার confirmation

**Status: repository implementation completed; callable deployment, provider configuration এবং physical-device validation pending.**

- AI কথোপকথনে “রক্ত দরকার/রক্তের অনুরোধ” ধরনের intent এলে সরাসরি write না করে structured blood-request popup দেখায়। Popup-এ blood group, হাসপাতাল, এলাকা, unit, urgency, প্রয়োজনের সময়, contact এবং optional patient/details নেওয়া হয়।
- `createBloodRequest` callable server-side validation, Bangladesh mobile normalization, active duplicate guard এবং idempotency claim ব্যবহার করে public `blood_requests` ও private `blood_request_private` record atomicভাবে লেখে। Contact, patient এবং hospital তথ্য public projection-এ যায় না।
- Seller-এর pending order গ্রহণের ক্ষেত্রে AI প্রথমে order card ও confirmation popup দেখায়। `acceptMarketplaceOrder` callable seller ownership যাচাই করে এবং transaction-এর মাধ্যমে শুধু `pending → accepted` transition চালায়; race বা duplicate tap নিরাপদে সামলায়।
- Order accepted হলে আগের server-side `notifyMarketplaceOrder` trigger buyer-এর জন্য deterministic notification তৈরি করে। AI নিজে buyer-কে message পাঠায় না এবং user confirmation ছাড়া order গ্রহণ করে না।
- Validation: TypeScript, JavaScript syntax, app tests (165 pass), Functions tests (25 pass), Phase 2 helper regression tests এবং `git diff --check` pass।
- Pending: নতুন তিনটি callable deploy, Firebase Secret/AI provider configuration, real account buyer-seller smoke test, blood private-data Rules emulator test এবং physical Android popup validation।

### AI Assistant — Phase 3: ইন-অ্যাপ ডিরেক্টরি সার্চ ও data fetching

**Status: repository implementation completed; live directory data smoke test এবং physical Android validation pending.**

- Bengali category alias যোগ করা হয়েছে: fire service, hospital/doctor, police, ambulance, union, administration এবং agriculture category এখন AI directory context-এ ধরা পড়ে।
- “ফায়ার সার্ভিসের নম্বর”, “ডাক্তার রফিকের ফোন”, “হাসপাতালের ঠিকানা”—এ ধরনের natural Bengali query-তে পুরো বাক্য exact match না করে generic request শব্দ বাদ দিয়ে useful term rank করা হয়।
- Category-specific query relevant `directory/{category}` path থেকে সর্বোচ্চ ২০টি row পড়ে; cross-category query প্রতি category সর্বোচ্চ ৮টি row পড়ে এবং AI context সর্বোচ্চ ১২টি card-এ সীমিত থাকে।
- AI context-এ শুধু allowlisted public fields যায়। `email`, `chat_uid`, `ownerUid` এবং unknown/private fields বাদ পড়ে। Result card থেকে public phone call এবং map action ব্যবহার করা যায়।
- Validation: Phase 3 directory helper ও bounded-fetch tests সহ Functions tests **২৮টি pass**; JavaScript syntax check pass।
- Pending: full app TypeScript/test suite, Firebase emulator-backed directory smoke test, production dataset-এ search recall যাচাই এবং physical Android validation।

### Marketplace Priority 1 — Core commerce flow

**Status: repository-side server checkout hardening completed; Functions/Rules deployment, callable smoke test এবং physical device checkout validation pending.**

Marketplace-এ Product Detail Page, gallery/zoom, seller information, favorite, review এবং report flow আগেই ছিল; Search/Filter-এ Bengali/Latin search, category, locality, price range, availability এবং sorting-ও ছিল। এই iteration-এ Product Detail থেকে `কার্টে যোগ` এবং `এখনই অর্ডার` action আলাদা করা হয়েছে।

এখন header cart badge, local cart review modal, quantity increase/decrease/remove, stock cap, subtotal এবং multi-item checkout summary আছে। Checkout এখন authenticated `createMarketplaceCheckout` callable-এর মাধ্যমে server-side buyer UID, seller/shop ownership, latest availability, price এবং quantity যাচাই করে। Stock-managed product Firebase transaction-এ reserve/decrement হয়; পরের item ব্যর্থ হলে আগের reservation guarded rollback হয়। সফল checkout-এ server-generated order ID, shared order group ID, immutable title/price/quantity/total snapshot এবং status history লেখা হয়। Existing order inbox-এ buyer/seller tabs, status history timeline এবং pending → accepted → preparing → shipped → delivered tracking flow বজায় আছে।

Cart এখন `AsyncStorage`-এ user-scoped key-তে persist হয়; account switch হলে পুরোনো account-এর cart আলাদা থাকে এবং malformed/stale stored item বাদ পড়ে। Checkout retry-তে একই session idempotency key ব্যবহৃত হয়, তাই network response হারালেও duplicate order বা stock decrement হবে না; server record ২৪ ঘণ্টা পরে expire হয়। Payment এখন Cash on Delivery বা pickup intent; online payment gateway নয়। Repository validation complete হলেও Functions/Rules deploy, concurrent checkout smoke test এবং physical Android validation এখনও release gate।

**Final production gate:** P0=0, unresolved High privacy issue=0, bounded read/write paths, signed media, tested Android build, physical smoke pass, monitoring/alerts active, rollback rehearsed, and explicit release approval.

### Marketplace Prompt 4 — Operations, abuse protection ও cost control

**Status: repository implementation completed; live deployment, dashboard wiring ও physical-device validation pending.**

Latest server-side checkout architecture-এ privacy-safe daily metrics যোগ হয়েছে। Checkout success/failure, stock conflict, duplicate/idempotency request, rate-limit rejection, order creation, status transition, cancellation এবং marketplace notification delivery-এর counters Admin SDK-তে `marketplace_metrics` path-এ লেখা হয়। Structured logs-এ raw UID, phone, address, token, payment data বা product content রাখা হয় না; short anonymous hash ব্যবহার করা হয়।

COD/pickup policy অপরিবর্তিত আছে: delivery-তে `cash_on_delivery`, pickup-এ `pay_on_pickup`। কোনো online payment gateway বা payment webhook যোগ করা হয়নি। Existing server-side stock reservation, idempotency, per-user checkout rate limit, timeout/concurrency এবং guarded rollback বজায় আছে। বিস্তারিত runbook `docs/PROMPT4-MARKETPLACE-OPS-BN.md`-তে আছে।

### Registration validation ও privacy consent hardening

**Status: repository implementation completed; physical Android calendar/registration smoke test pending.**

- Registration-এর প্রথম ধাপেই trimmed email-এর strict format validation যোগ হয়েছে; invalid email হলে পরবর্তী ধাপে যাওয়া বা account creation শুরু করা যায় না। Firebase-এর server validation-ও বহাল আছে।
- নামের input সর্বোচ্চ ২০ অক্ষর, বাংলা/English letter ও space গ্রহণ করে; emoji, symbol এবং অন্যান্য non-letter character input ও validation—দুই স্তরেই বাদ/প্রত্যাখ্যান করা হয়।
- জন্মতারিখ এখন Android/iOS-এ native calendar picker দিয়ে নির্বাচন করা যায়; future date বন্ধ, 1900-এর আগের date বন্ধ, এবং date না দিলে registration এগোয় না। Web fallback-এ `YYYY-MM-DD` input রাখা হয়েছে।
- Privacy Policy text এখন clickable। URL `admin_settings/privacy_link` থেকে আসে, pre-auth registration screen-এ পড়া যায়, শুধু HTTPS URL admin লিখতে পারে; unauthenticated read-এর জন্য public policy-link rule ও emulator test যোগ হয়েছে।
- Validation: TypeScript, lint, Rules emulator (privacy/user/area tests), Expo config/dependency validation, focused regression tests pass।
- Pending: admin panel-এ `admin_settings/privacy_link`-এর desired HTTPS policy URL নিশ্চিত করা এবং physical Android registration smoke test।

### Area Approval — locked account verification media flow

**Status: repository implementation completed; `submitAreaAccessRequest` callable deploy এবং physical Android upload smoke test pending.**

- Locked/area-review screen-এ এখন তিনটি আলাদা ছবি বাধ্যতামূলক: নিজের ছবি/Selfie, NID Front Side এবং NID Back Side। প্রতিটি ছবির preview, replacement action এবং নির্দিষ্ট upload error label আছে।
- Upload-এর আগে image resize/compression ও metadata re-encode করা হয়; progress message-এ কোন ছবি upload হচ্ছে তা দেখানো হয়।
- আগের client-side multi-location RTDB write-এর বদলে authenticated `submitAreaAccessRequest` callable ব্যবহার করা হয়েছে। Function Firebase auth UID থেকে profile ও existing request পড়ে, locked/pending/rejected state যাচাই করে, duplicate pending submission আটকায় এবং server-side atomic update-এ তিনটি URL সংরক্ষণ করে।
- Existing admin tooling-এর compatibility-এর জন্য `nidUrl` legacy alias রাখা হয়েছে; নতুন `selfieUrl`, `nidFrontUrl`, `nidBackUrl` এবং user profile media fields-ও সংরক্ষণ করা হয়। Client verification gate বা approval status পরিবর্তন করতে পারে না।
- Validation: TypeScript, lint, full app tests (197 pass, 1 skipped), focused media/chat/market tests (48 pass), area-access Rules emulator tests (5 pass), Functions tests (41 pass), Firebase deploy preflight এবং JavaScript syntax check pass।
- Pending external gate: নতুন callable Firebase-এ deploy, Cloudinary preset/provider configuration যাচাই, locked test account দিয়ে তিনটি real upload smoke test এবং physical Android validation।

## Website–Admin Panel data sync remediation — 2026-11-05

**Status: repository fix সম্পন্ন; Firebase Rules live deploy বাকি**

- Admin Panel-এর `siteData` write contract এবং Website-এর anonymous read contract মিলিয়ে দেখা হয়েছে। Website-এ `siteData`, `admin_settings/app_screenshots`, `privacy_link`, `rules_link`/`terms_link` এবং `links/help` নির্দিষ্ট public child হিসেবে পড়তে পারবে। পুরো `admin_settings` tree public করা হয়নি।
- Website এবং Admin Panel-এর ভুল Firebase `authDomain` সংশোধন করা হয়েছে।
- Website dynamic settings, footer links ও screenshots-এর error/fallback handling যোগ হয়েছে। Terms-এর জন্য `rules_link` না থাকলে `terms_link` fallback ব্যবহার হবে।
- Rules emulator regression test যোগ হয়েছে: anonymous website read, admin-only write, screenshot URL validation এবং public footer link read।
- Repository source update সম্পন্ন; production Firebase Console/CLI-তে `database.rules.json` deploy না করা পর্যন্ত live website-এ নতুন public-read behavior চালু হবে না।

**পরবর্তী release action:** Firebase project identity যাচাই করে backup/dry-run সহ Rules deploy করতে হবে; তারপর Admin Panel থেকে একটি test `siteData` update ও screenshot publish করে public website-এ verify করতে হবে।

## Admin Panel Production Hardening — Phase 1 সম্পন্ন (১৪ নভেম্বর ২০২৬)

- `market_orders` root read-এ Admin custom-claim access যুক্ত হয়েছে।
- Admin order update workflow fields-এ সীমাবদ্ধ এবং order ownership/product/quantity/time fields immutable রাখা হয়েছে।
- সাধারণ user অন্য user-এর order পড়তে বা update করতে পারে না।
- `super_admin_audit` create-only এবং immutable আচরণ emulator-এ যাচাই করা হয়েছে।
- `market-orders`, `operational-hardening`, `admin-operational-paths` এবং `stories` Rules suite মিলিয়ে ৩২টি test pass করেছে।
- Manual Firebase Console publish নির্দেশনা: `docs/ADMIN-PHASE1-RULES-VERIFICATION-BN.md`।

## Admin Panel Production Hardening — Phase 2 শুরু (১৪ নভেম্বর ২০২৬)

- `trash_bin` retention cleanup-এর full-tree scan বাদ দিয়ে server-only `trashExpiryQueue` যোগ করা হয়েছে।
- নতুন trash record `indexTrashForExpiry` trigger-এর মাধ্যমে expiry index পায়।
- `cleanupExpiredTrash` প্রতি run-এ সর্বোচ্চ ৫০০টি expired queue entry নেয় এবং queue + trash record একসঙ্গে সরায়।
- Queue Rules client read/write বন্ধ রেখেছে; Admin read operational diagnosis-এর জন্য সীমিত।
- Functions README-তে নতুন deploy command ও bounded cleanup contract যোগ করা হয়েছে।

## Admin Panel data loading fix (১৪ নভেম্বর ২০২৬)

- Admin Panel login যে `admin: true` Firebase custom claim যাচাই করে, Rules-এর operational paths-গুলোও এখন একই claim গ্রহণ করে; legacy `admin@gmail.com` compatibility রাখা হয়েছে।
- Users ও Post Moderation pagination-এ permission/network failure হলে spinner স্থায়ীভাবে ঘুরবে না; retry button ও স্পষ্ট error state দেখাবে।
- Custom claim-only Admin-এর Users এবং `admin_settings` read-এর emulator regression test যোগ করা হয়েছে।
