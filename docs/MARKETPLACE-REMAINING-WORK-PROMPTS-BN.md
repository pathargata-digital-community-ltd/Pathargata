# Pathargata Digital Native App — বাকি কাজের Implementation Prompts

এই document-এর prompt-গুলো অন্য Manus account, AI agent বা developer-কে দিয়ে ধাপে ধাপে কাজ করানো যাবে। প্রতিটি prompt আলাদা করে copy-paste করা যাবে।

## গুরুত্বপূর্ণ shared instruction

কাজ শুরু করার আগে repository-এর বর্তমান `main` branch pull করে working tree, recent commits এবং existing documentation পড়তে হবে। ইতিমধ্যে সম্পন্ন feature কোনোভাবেই ভেঙে ফেলা যাবে না। Existing UX, Bengali labels, Firebase authorization, account isolation, bounded reads এবং production logging policy বজায় রাখতে হবে।

প্রতিটি phase শেষ হলে:

1. TypeScript, JavaScript syntax এবং relevant unit tests চালাতে হবে।
2. Firebase Rules বা Functions পরিবর্তন হলে emulator test চালাতে হবে।
3. `git diff --check` চালাতে হবে।
4. Roadmap/documentation update করতে হবে।
5. Commit করে GitHub `main` branch-এ push করতে হবে।
6. Final response-এ changed files, tests, commit hash এবং known limitation বাংলায় জানাতে হবে।

---

## ইতিমধ্যে সম্পন্ন কাজ — এগুলো preserve করতে হবে

নিচের feature-গুলো বর্তমানে সম্পন্ন এবং পরবর্তী কাজের সময় regression করা যাবে না:

- Marketplace Product Detail Page, image gallery/zoom, seller information, favorite, review এবং report flow।
- Product search, Bengali/Latin query, category filter, locality filter, price range, availability filter এবং sorting।
- Professional shop storefront, category-based product grouping এবং owner-only product edit action।
- Buyer-এর জন্য order form এবং seller-এর জন্য order inbox।
- Buyer/seller order status timeline: pending, accepted, preparing, shipped, delivered এবং cancelled।
- Marketplace in-app notification এবং seller order confirmation flow।
- Product Detail-এ `কার্টে যোগ` এবং `এখনই অর্ডার` আলাদা action।
- Header cart icon ও item count badge।
- Local cart review modal, quantity increase/decrease/remove, stock cap এবং subtotal।
- Multi-item checkout summary, buyer information, delivery/pickup এবং Cash on Delivery/pickup intent।
- Cart app restart-এর পরেও user-scoped `AsyncStorage` key-তে থাকে। Account switch হলে cart আলাদা থাকে। Invalid/stale stored cart item বাদ পড়ে।
- Cart persistence-এর regression tests এবং complete app test suite pass করা হয়েছে।
- AI Assistant Phase 1, 2 এবং 3-এর existing implementation, documentation ও Firebase deployment prompt।
- Security/privacy hardening, bounded reads, durable notification/push queue, session fencing এবং production-safe logging।

বর্তমান checkout online payment gateway নয়; এটি Cash on Delivery বা shop pickup intent। Current cart client-side persisted, কিন্তু final stock reservation এবং order creation server-side atomic নয়।

---

# Prompt 1 — Server-side stock validation ও reservation

```text
Pathargata Digital Native App-এর Marketplace checkout harden করো। Existing Product Detail, Search/Filter, persisted user-scoped cart, checkout UI, order inbox, notification এবং order status flow অপরিবর্তিত রাখতে হবে। Client-side checkout এখন শুধু Realtime Database-এ order request push করে; production-এর জন্য server-side stock validation ও reservation প্রয়োজন।

কাজগুলো:

1. Existing product schema, stock, availability, seller ownership এবং market_orders schema সম্পূর্ণ audit করো।
2. Firebase Cloud Functions v2-এ authenticated callable function তৈরি করো, যেমন `createMarketplaceCheckout`।
3. Function শুধু authenticated buyer-এর request গ্রহণ করবে এবং buyer UID token থেকে নেবে; client-supplied buyer UID trust করবে না।
4. Request schema strictly validate করো: productId, quantity, delivery method, payment intent, buyer contact/address এবং idempotency key। Quantity integer, positive এবং reasonable upper bound-এর মধ্যে হতে হবে।
5. প্রতিটি product-এর latest stock/availability server-side read করে validate করো। Seller-owned product কেনার চেষ্টা reject করো। Missing seller, paused/unavailable product, invalid price বা invalid seller ownership reject করো।
6. Stock-managed product হলে Firebase transaction ব্যবহার করে available stock reserve/decrement করো। Concurrent buyers-এর ক্ষেত্রে oversell হতে দেওয়া যাবে না। Stock-less product-এর existing business rule বজায় রাখো।
7. একাধিক cart item-এর reservation failure হলে আগে reserve করা item rollback করার safe strategy অথবা reservation record ব্যবহার করো। Partial order silently তৈরি করা যাবে না।
8. সফল checkout-এ server-generated order ID, order group ID, immutable product title/price snapshot, buyer UID, seller UID, quantity, total এবং status history লিখবে। Client-supplied total বা price trust করা যাবে না।
9. Idempotency key ব্যবহার করো যাতে network retry-তে duplicate order বা duplicate stock decrement না হয়। Idempotency record user-scoped এবং expiry সহ হবে।
10. Existing order notification trigger ও order inbox-এর schema compatibility বজায় রাখো।
11. Realtime Database rules update করো যাতে buyer সরাসরি privileged stock decrement বা forged seller/order fields লিখতে না পারে। প্রয়োজন হলে client order write বন্ধ করে callable-only path ব্যবহার করো।
12. Rate limit, payload size limit, timeout এবং retryable/permanent error আলাদা করো। Sensitive data log করা যাবে না।
13. Functions unit tests এবং Firebase Emulator Rules/Functions integration tests যোগ করো:
   - valid checkout
   - unauthenticated request
   - forged buyer UID
   - seller buying own product
   - insufficient stock
   - concurrent reservation
   - duplicate idempotency key
   - invalid price/quantity
   - multi-item rollback
   - notification compatibility
14. App client-এর `submitOrder`-কে নতুন callable function-এর সঙ্গে যুক্ত করো এবং loading, retry, duplicate tap guard ও Bengali error message ঠিক রাখো।
15. Documentation ও production deployment steps update করে tests pass করো, commit করো এবং GitHub main-এ push করো।
```

---

# Prompt 2 — Atomic multi-item order group ও order lifecycle

```text
Marketplace checkout-কে production-grade multi-item order group-এ উন্নীত করো। Existing cart, checkout UI এবং order tracking UX বজায় রাখতে হবে। Prompt 1-এর server-side checkout function থাকলে সেটির উপর কাজ করো; না থাকলে আগে তার compatible foundation তৈরি করো।

কাজগুলো:

1. একই checkout-এর সব item-এর জন্য একটি `orderGroupId` তৈরি করো। একই seller-এর item হলে seller-level grouped order এবং একাধিক seller হলে আলাদা seller order-এর সঙ্গে shared group reference রাখো।
2. Buyer order history-তে group-level summary দেখাও: total item, subtotal, seller count, created time এবং overall status।
3. Existing seller inbox-এ seller শুধু নিজের products/orders দেখবে; অন্য seller-এর item বা buyer private information দেখতে পারবে না।
4. Order status transition server-side enforce করো। Allowed transition স্পষ্ট করো: pending → accepted/cancelled, accepted → preparing/cancelled, preparing → shipped, shipped → delivered। Invalid backward transition reject করো।
5. Buyer cancellation policy বজায় রাখো এবং seller-এর delivered order পরিবর্তন বন্ধ করো।
6. Group-level status derive করো যাতে একটি seller shipped হলেও অন্য seller pending থাকলে buyer সঠিক mixed status দেখতে পায়।
7. Existing notification system-এ duplicate notification প্রতিরোধ করো। Group created, seller accepted, shipped, delivered এবং cancelled event-এর জন্য idempotent notification তৈরি করো।
8. Buyer order history screen বা marketplace order inbox-এ filter যোগ করো: all, pending, active, completed, cancelled। Existing status timeline visual বজায় রাখো।
9. Order detail-এ price snapshot, quantity, seller, delivery/pickup method, payment intent, address visibility এবং status timeline স্পষ্ট করো।
10. Rules/Functions tests যোগ করো buyer/seller isolation, group aggregation, transition enforcement, cancellation এবং notification idempotency-এর জন্য।
11. N+1 read এড়িয়ে bounded query/materialized summary ব্যবহার করো।
12. Documentation update, full test, emulator test এবং GitHub push সম্পন্ন করো।
```

---

# Prompt 3 — Online payment gateway প্রস্তুতি ও নিরাপদ payment integration

```text
Pathargata Digital Native App-এর Marketplace-এ online payment যোগ করার architecture তৈরি করো। কোনো payment provider credential, secret বা real charge user confirmation ছাড়া ব্যবহার করা যাবে না। প্রথমে provider নির্বাচন ও sandbox-only implementation করো।

কাজগুলো:

1. Bangladesh market-এর জন্য supported provider-এর বর্তমান documentation ও fee/settlement requirement যাচাই করো। Provider selection-এর আগে user-facing report দাও।
2. Payment secret কখনো mobile app, AsyncStorage, Realtime Database বা client bundle-এ রাখবে না। Secret Cloud Functions Secret Manager-এ থাকবে।
3. Server-side payment intent/create endpoint তৈরি করো। Client শুধু orderGroupId ও payment method পাঠাবে; amount server-side order snapshot থেকে calculate হবে।
4. Amount tampering, duplicate payment, replay, webhook forgery এবং order mismatch প্রতিরোধ করো।
5. Provider webhook signature verify করো। Success শুধু verified webhook বা provider verification-এর পরে mark হবে; client callback trust করা যাবে না।
6. Payment state আলাদা রাখো: unpaid, pending, paid, failed, refunded, partially_refunded। Order status এবং payment status গুলিয়ে ফেলবে না।
7. Payment retry idempotent করো। একই order-এর জন্য duplicate charge হতে দেওয়া যাবে না।
8. Checkout UI-তে Cash on Delivery/pickup-এর পাশাপাশি provider option দেখাও, কিন্তু sandbox verified না হওয়া পর্যন্ত production option enable করো না।
9. Payment failure, timeout, cancellation ও refund-এর Bengali UX যোগ করো। Buyer-কে raw provider error বা secret তথ্য দেখানো যাবে না।
10. Audit log-এ শুধু redacted payment event রাখো; card number, CVV, token বা secret log করবে না।
11. Sandbox unit test, webhook test, invalid signature test, duplicate webhook test, amount mismatch test এবং refund test যোগ করো।
12. Production release-এর আগে merchant verification, legal/compliance, refund policy, settlement account এবং support workflow documentation-এ checklist তৈরি করো।
13. User-এর explicit confirmation ছাড়া কোনো real payment বা external financial action চালাবে না।
```

---

# Prompt 4 — Marketplace production observability, abuse protection ও cost control

```text
Marketplace-এর production operations harden করো, কিন্তু existing UX ও security rules ভাঙবে না।

কাজগুলো:

1. Checkout success/failure, stock conflict, duplicate request, payment state, order transition, notification delivery এবং webhook failure-এর privacy-safe metrics তৈরি করো।
2. Raw UID, phone, address, access token বা payment data log করবে না। Anonymous/hash identifier ব্যবহার করো।
3. Callable/function invocation-এর timeout, concurrency, retry এবং dead-letter policy নির্ধারণ করো।
4. Product listing, search, shop products, cart checkout এবং order history-তে bounded reads ও pagination নিশ্চিত করো।
5. Seller বা buyer abuse ঠেকাতে rate limit যোগ করো: checkout, cancellation, review, report এবং notification-triggering action।
6. Duplicate tap এবং network retry-এর জন্য client-side loading/disabled guard বজায় রাখো।
7. Error monitoring-এ alert threshold নির্ধারণ করো: stock conflict spike, failed checkout, function timeout, notification backlog এবং payment webhook failure।
8. Firebase Emulator বা test project-এ load-oriented smoke test করো; production database-এ destructive test নয়।
9. Rollback plan, feature flag এবং payment/checkout kill switch তৈরি করো।
10. Cost estimate update করো: reads, writes, Functions invocations, storage, bandwidth এবং notification volume।
11. Documentation, dashboards, alert ownership এবং incident response checklist update করো।
```

---

# Prompt 5 — Audit Issue 15: audio recording ও video upload সম্পূর্ণ করা

```text
TODO.md এবং current repository audit করে incomplete audio recording ও video upload feature production-ready করো। Existing media upload helper, image resize/compression, Cloudinary/Firebase flow এবং privacy rules আগে বুঝে নাও।

কাজগুলো:

1. TODO.md-তে audio/video সম্পর্কিত প্রতিটি incomplete path inventory করো।
2. Audio recording-এর permission, cancel, retry, duration limit, file size limit, format compatibility, upload progress এবং playback UX যোগ করো।
3. Video picker/upload-এর duration, resolution, file size এবং MIME validation যোগ করো। Upload-এর আগে safe compression/transcoding strategy নির্ধারণ করো।
4. Interrupted upload retry/resume বা safe restart flow যোগ করো। Duplicate media record তৈরি করা যাবে না।
5. Media metadata থেকে EXIF/location/private data যতটা সম্ভব remove করো।
6. Firebase Rules/Cloudinary authorization update করো যাতে user শুধু নিজের pending media record update/delete করতে পারে।
7. Public post projection-এ শুধু approved public media URL/metadata যাবে; private original path expose করা যাবে না।
8. Malware/content moderation hook-এর integration point document করো।
9. Low-end Android, slow network এবং permission denied UX test করো।
10. Unit test, upload helper test, media rules test এবং physical Android smoke test চালিয়ে documentation ও GitHub push সম্পন্ন করো।
```

---

# Prompt 6 — Audit Issue 16: physical device validation ও EAS release evidence

```text
Pathargata Digital Native App-এর production release evidence তৈরি করো। Cloud build বা physical device access না থাকলে সেটি পরিষ্কারভাবে report করবে; fake evidence তৈরি করবে না।

কাজগুলো:

1. app.json/app.config, eas.json, Android package ID, iOS bundle ID, Firebase production project এবং environment variables audit করো।
2. Development, preview এবং production profile-এর configuration আলাদা করো। Production secret client bundle-এ যাবে না।
3. EAS production build command, build number/version code এবং artifact checksum document করো।
4. Android physical device smoke checklist চালাও: sign-in/out, account switch, home feed, notifications, blood request, chat, marketplace search, detail, cart persistence, checkout, order status, media upload এবং logout।
5. Offline/slow network, app restart, permission denial, background/foreground এবং notification tap test করো।
6. Firebase Rules, Functions, App Check, push notification এবং Cloudinary production configuration যাচাই করো।
7. প্রত্যেক test-এর date, device model, OS version, app build, result, screenshot/video evidence এবং issue লিখে release evidence document তৈরি করো।
8. Failure থাকলে production release block করো এবং remediation issue তৈরি করো।
9. EAS build/deploy করার আগে প্রয়োজনীয় account authorization বা user confirmation চাইবে; অনুমতি ছাড়া external release publish করবে না।
```

---

# Prompt 7 — App Check strict enforcement verification

```text
Firebase App Check production-এ strict enforcement-এর জন্য audit ও rollout করো। Existing authenticated user authorization-এর বিকল্প হিসেবে App Check ব্যবহার করবে না; দুটো layer বজায় থাকবে।

কাজগুলো:

1. Android Play Integrity, iOS App Attest/DeviceCheck এবং web reCAPTCHA configuration audit করো।
2. Development/emulator profile-এ debug token এবং production profile-এ debug token নিষিদ্ধ করো।
3. Realtime Database, Cloud Functions এবং Storage-এর App Check enforcement status যাচাই করো।
4. Production enforcement-এর আগে metrics-এ valid/invalid/missing token observe করো।
5. Staged rollout plan তৈরি করো যাতে legitimate old build হঠাৎ পুরোপুরি block না হয়।
6. Strict enforcement enable করার exact Firebase Console/CLI steps documentation-এ লিখো।
7. Invalid token, rooted/tampered build, emulator এবং old client behavior test করো।
8. Emergency rollback এবং support message প্রস্তুত রাখো।
9. কোনো secret বা App Check debug token GitHub-এ commit করবে না।
```

---

# Prompt 8 — Cloudinary signed short-lived upload hardening

```text
Cloudinary unsigned upload preset থেকে signed, short-lived server-side upload parameters-এ migrate করো। Existing image/video upload UX smooth রাখতে হবে।

কাজগুলো:

1. Current Cloudinary unsigned preset, upload caller, media path এবং database metadata audit করো।
2. Cloudinary API secret কখনো Expo/React Native bundle বা client code-এ রাখবে না।
3. Firebase callable বা HTTPS function দিয়ে authenticated user-এর জন্য short-lived signature, timestamp, folder এবং constrained upload parameters তৈরি করো।
4. Folder/path user-scoped ও media-type scoped করো। Client arbitrary folder, public_id, transformation বা resource type override করতে পারবে না।
5. Signature expiry, payload size, MIME type, duration এবং transformation allowlist enforce করো।
6. Upload completion-এর পরে server-side metadata validation ও ownership record তৈরি করো।
7. Orphaned upload cleanup এবং failed upload retry policy যোগ করো।
8. Existing upload progress, cancel, retry এবং Bengali error UX বজায় রাখো।
9. Unsigned preset ধাপে ধাপে disable করার migration plan ও rollback plan তৈরি করো।
10. Unit test, function test, invalid signature test, expired signature test, oversized media test এবং physical device upload smoke test চালাও।
11. Production secret configure বা deploy করতে user authorization প্রয়োজন হলে আগে অনুমতি চাইবে।
```

---

## Recommended execution order

1. **Prompt 1:** server-side stock validation ও reservation।
2. **Prompt 2:** atomic multi-item order group ও lifecycle।
3. **Prompt 4:** observability, abuse protection ও cost control।
4. **Prompt 8:** Cloudinary signed upload hardening।
5. **Prompt 5:** audio/video upload completion।
6. **Prompt 7:** App Check staged rollout ও strict enforcement।
7. **Prompt 6:** EAS production build ও physical device release evidence।
8. **Prompt 3:** payment gateway — provider, merchant verification ও compliance প্রস্তুত হওয়ার পরে sandbox থেকে production।

## Final release gate

সব prompt শেষ হলেও production release-এর আগে অবশ্যই physical Android smoke test, Firebase Rules emulator test, Functions test, App Check verification, signed media test, rollback rehearsal, monitoring alert test এবং explicit release approval নিতে হবে।
