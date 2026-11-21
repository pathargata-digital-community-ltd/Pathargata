# TODO

## Login credential handling (requested 2026-11-14)

- [x] Login and registration must not offer or perform app-managed password saving, saved-account password storage, or password-based account-switch auto-login.
- [x] Preserve Firebase's normal authenticated-session persistence and use platform email/password autofill hints so the phone's user-controlled password manager can offer autofill/save.
- [x] On upgrade, remove legacy SecureStore saved-password entries and account metadata from previous app versions.

## Native app shell and branding

- [x] বর্তমান Capacitor Web App repository অপরিবর্তিত রেখে নতুন Expo/React Native/TypeScript mobile project-এ native-style application shell থাকবে।
- [x] Android ও iOS-এর portrait, one-handed navigation এবং পাথরঘাটা ডিজিটালের branding থাকবে।
- [x] Native launcher, splash এবং adaptive icon assets project configuration-এ থাকবে।

## Fast loading experience

- [x] দ্রুত startup-এর জন্য cached feed state, lightweight first paint, loading states, optimized images এবং unnecessary re-render কমানোর ব্যবস্থা থাকবে।
- [x] Feed ও feature content pagination/lazy loading ব্যবহার করবে এবং empty/error states দেখাবে।

## Core navigation and screens

- [x] Home feed screen-এ community header, feed context, quick actions, service shortcuts এবং post preview থাকবে।
- [x] Services tab-এ blood, marketplace, tourism, transport, education, directory ও emergency service shortcuts থাকবে।
- [x] Messages, People এবং Profile tab-এর usable native screens ও empty/auth states থাকবে।

## Data integration and delivery

- [x] Existing Web App-এর auth/data model audit করে secure native adapter-এ reusable integration প্রস্তুত হবে।
- [x] Android APK ও iOS development build-এর জন্য source/configuration প্রস্তুত থাকবে; App Store বা Play Store upload করা হবে না।
- [x] Implementation source আলাদা GitHub repository-তে সংরক্ষণ হবে; মূল Capacitor repository-তে কোনো code change হবে না।

## পরবর্তী milestone

- [x] Authenticated native user-এর জন্য text post composer বিদ্যমান Firebase `posts` path-এ publish করবে।
- [x] Native user registration বিদ্যমান Firebase Auth ও `users/{uid}` profile schema-তে account তৈরি করবে।
- [x] Feed post-এ Firebase-backed like toggle, inline comment submit এবং author notification লেখা থাকবে।
- [x] Firebase notification inbox, unread badge, mark-read এবং mark-all-read flow থাকবে।
- [x] Existing `user_chats` ও `chats` schema ব্যবহার করে realtime conversation list, unread count, encrypted-compatible message send এবং read state থাকবে।
- [x] People tab live `users` directory, search এবং সরাসরি নতুন conversation শুরু করার action দেবে।
- [x] Profile tab Firebase profile data sync, native edit/save এবং logout flow দেবে।
- [x] Blood, marketplace, tourism, transport, education এবং emergency service-এর native form, Firebase write এবং recent data list থাকবে।
- [x] Feed incremental pagination/load-more এবং empty fallback state থাকবে।
- [x] Native post composer-এ gallery image picker, preview এবং Cloudinary upload থাকবে।
- [x] Native post composer-এ crop editor, fixed aspect ratio ছাড়া full-quality image upload এবং পরিষ্কার publish/auth error state থাকবে।
- [x] Home screen-এ স্পষ্ট নতুন পোস্ট action থাকবে এবং post publish সফল হলে feed route-এ ফিরবে।
- [x] Directory-তে কৃষি category, Firebase error state ও retry action থাকবে।
- [x] ইউজার profile route-এ public profile fallback, সরাসরি message action, block/unblock এবং user report action থাকবে।
- [x] My Friend List ও profile-এর friend preview missing public-index entry হলেও safe bundled projection fallback দিয়ে লোড হবে।
- [x] নিজের, বন্ধুর এবং অন্য ইউজারের Profile post list-এ প্রথমে ১২টি পোস্ট, scroll-এর কাছে গেলে cursor দিয়ে পরের ১২টি, privacy-filter বজায় রেখে ধাপে ধাপে লোড হবে।
- [x] Android Firebase Auth-এ AsyncStorage persistence সক্রিয় থাকবে; user নিজে logout না করা পর্যন্ত app restart/background process kill-এর পর session বজায় থাকবে।
- [x] My Profile edit save-এ RTDB profile update, cache invalidation এবং optional Auth display-name sync আলাদা করা হয়েছে; নিজের post menu থেকে সরাসরি edit modal খুলে title/content save হবে।
- [x] Settings-এর Trash Bin-এ নিজের deleted post ৩০ দিন পর্যন্ত Restore হবে; per-user security rules, admin moderation access এবং scheduled permanent cleanup যুক্ত হয়েছে।
- [x] Comment-এর three-line menu এখন copy, delete এবং report action সরাসরি চালায়; ভুল করে menu পুনরায় খোলার সমস্যা ঠিক হয়েছে।
- [x] Post save/bookmark, repost, notification mute/unmute, report এবং native post action menu থাকবে।
- [x] Directory bookmark/save AsyncStorage persistence থাকবে।
- [x] Invite/referral sharing, referral count এবং native share sheet থাকবে।
- [x] Profile-এর ডিজিটাল কার্ড আরও polished ও professional হবে; profile picture, নাম, পেশা, এলাকা, member ID এবং verified হলে verification badge দেখাবে।
- [x] Digital card-এর QR scan করলে standard contact-card payload-এ public profile details, referral link এবং available app-download link থাকবে; user contact privacy চালু করলে hidden phone/email QR payload-এ যাবে না।
- [x] Digital card-এ referral link ও app-download action থাকবে; dedicated admin-managed `admin_settings/app_download_url` থেকে public HTTPS install URL পড়বে, আর সেটি unavailable হলে fabricated/fake URL দেখাবে না। Referral deep link Native registration-এ code prefill করবে এবং নতুন user-এর referral event existing trusted Firebase flow-তে জমা দেবে।
- [ ] Release-এর আগে admin-কে Firebase `admin_settings/app_download_url`-এ verified public HTTPS APK/Store link যোগ করতে হবে; বর্তমান repository-তে public APK release বা Play Store listing নেই।
- [x] Birth registration, TIN certificate এবং Board result external service links থাকবে।
- [x] Agriculture live Firebase dynamic service, Profile Verification flow, category, plans, payment/transaction/NID/document upload এবং `verification_requests` submission থাকবে।
- [x] Post composer-এ microphone permission, সর্বোচ্চ ৬০ সেকেন্ডের audio recording, cancel/preview, ১০ MB file cap, upload progress/retry এবং existing voice post playback থাকবে।
- [x] Post composer-এ single video picker, preview/remove, MIME/duration/dimension/৩০ MB validation, progress/retry এবং existing feed/detail video playback schema থাকবে।
- [ ] Audio/video-এর Android ও iOS physical-device smoke test, Android video transcoding/embedded metadata removal, Cloudinary signed upload authorization ও owner-scoped pending-media record, orphan cleanup এবং moderation integration production release-এর আগে বাকি। বিস্তারিত: `docs/MEDIA-AUDIO-VIDEO-IMPLEMENTATION-BN.md`।
- [ ] Native push-notification delivery বাকি আছে।

## Marketplace upgrade (requested 2026-10-23)

- [x] Marketplace-এ seller center থাকবে; authenticated owner নিজের দোকান তৈরি/সম্পাদনা এবং নিজের পণ্য যোগ, সম্পাদনা ও মুছতে পারবে; অন্য seller-এর listing পরিবর্তন করতে পারবে না।
- [x] দোকানের card-এ tap করলে দোকানের profile/detail এবং ওই দোকানের পণ্য, ঠিকানা ও যোগাযোগ দেখা যাবে।
- [x] পণ্য detail-এ একাধিক ছবি, পূর্ণ বিবরণ, মূল্য, stock/availability, দোকান/বিক্রেতা ও যোগাযোগ থাকবে; পুরোনো Firebase listing-ও optional fields ছাড়াই render হবে।
- [x] Buyer checkout/order request-এ quantity, delivery address, delivery/pickup ও payment choice-এর স্পষ্ট সারাংশ থাকবে; online payment gateway না থাকলে payment processing দাবি করা যাবে না।
- [x] Buyer নিজের order status ও history দেখতে পারবে; seller order গ্রহণ, preparation, dispatch, delivery এবং অনুমোদিত cancellation ধাপে status বদলাতে পারবে; status transition যাচাই হবে।
- [x] Marketplace-এ search, category/price/locality filters এবং price/newest sort থাকবে; favorite shops ও products বজায় থাকবে।
- [x] Product/shop তালিকা pagination ও virtualized lazy rendering ব্যবহার করবে; ছবিতে deferred loading/cache থাকবে; “আরও দেখুন” দিয়ে পরের page আনা যাবে।
- [x] Buyer review/report এবং admin-owned verified shop indicator থাকবে; seller নিজে verification badge দিতে পারবে না.
- [x] Firebase loading/write failures, offline/empty state ও retry/validation feedback স্পষ্ট হবে; কোনো error-free guarantee নয়, সব asynchronous action handled হবে।
- [x] Production Firebase rules-এ seller ownership ও private buyer/seller order/review/report access enforce করার প্রয়োজনীয়তা নথিভুক্ত হবে; repo-তে rules না থাকলে deployment/authorization limitation স্পষ্ট জানাতে হবে।
- [x] Prompt 1 checkout hardening: authenticated `createMarketplaceCheckout` callable server-side buyer identity, latest product/seller/price/availability যাচাই, stock transaction, multi-item rollback, server-generated order/order-group snapshot এবং user-scoped idempotency record ব্যবহার করবে। Direct client order creation Rules-এ বন্ধ করা হয়েছে।
- [ ] Prompt 1 deployment gate: updated Database Rules ও Functions production project-এ deploy করে callable smoke test এবং concurrent real/emulator checkout evidence সংগ্রহ করতে হবে।
- [x] Prompt 7 App Check source integration: native development-এ debug provider, release Android-এ Play Integrity, Apple-এ App Attest/DeviceCheck fallback, web-এ optional reCAPTCHA v3 provider, auto-refresh এবং sanitized degraded warning যুক্ত হয়েছে; কোনো debug token বা secret source-এ রাখা হয়নি।
- [x] Prompt 7 static release preflight ও staged enforcement/rollback/support documentation যোগ হয়েছে।
- [ ] Prompt 7 live gate: Firebase Console-এর valid/missing/invalid metrics, fresh signed Android physical-device test, old-client behavior এবং service-by-service enforcement evidence সংগ্রহ করতে হবে।

## Marketplace usability/error correction (requested 2026-10-23)

- [x] Product/shop cards-এ nested button/Pressable থাকবে না; Web Preview-তে React `button cannot contain a nested button` error আর আসবে না।
- [x] Product, দোকান ও Favorites options বড়, icon-based, সহজে tap করা যায় এমন target হবে; selected option-এর fill/border/icon state সবসময় স্পষ্ট থাকবে।
- [x] Seller Center ও orders header icons-এর মাঝে স্পষ্ট gap থাকবে।
- [x] Product browsing, Favorites ও shop detail-এ প্রতি সারিতে ঠিক ৩টি product card থাকবে।
- [x] Product detail gallery swipe করে সব uploaded ছবি দেখাবে এবং full-screen-এ pinch gesture দিয়ে zoom করা যাবে।

## পর্যটন আপগ্রেড (অনুরোধ 2026-10-23)

- [x] পর্যটনের তালিকা `services/data/history_tourism` থেকে পড়বে; পুরোনো title/details/category/image/phone/address/coordinates records এবং নতুন optional fields-সহ records দুটিই render হবে। ক্যাটাগরি, keyword, এলাকা এবং newest/popular/nearby filters থাকবে; nearby sort কেবল ব্যবহারকারী চাইলে foreground location permission নিয়ে কাজ করবে এবং permission না দিলেও বাকি catalogue চলবে।
- [x] প্রতিটি tourist place-এ আলাদা detail view থাকবে: একাধিক ছবি, বিবরণ, ঠিকানা/coordinates, খোলার সময়, প্রবেশমূল্য, আনুমানিক সময়, উপযোগিতা/সতর্কতা, যোগাযোগ, শেষ হালনাগাদ, map directions ও share action; অনুপস্থিত optional তথ্য সঠিকভাবে বাদ পড়বে বা অজানা হিসেবে দেখাবে।
- [x] পছন্দের tourist place ব্যবহারকারীর device-এ persistently bookmark করা যাবে; পছন্দের তালিকা খোলা/ফিল্টার করা ও bookmark সরানো যাবে।
- [x] ব্যবহারকারী itinerary-তে একাধিক স্থান যোগ, বাদ, ক্রম বদল, সময়/নোট সংরক্ষণ এবং Share sheet দিয়ে itinerary শেয়ার করতে পারবেন; plan device-এ persist হবে এবং share/storage error দেখাবে।
- [x] Detail view-তে place coordinates থেকে নিকটবর্তী directory service-এর দূরত্ব হিসাব করে সেবা ও দিকনির্দেশ দেখাবে; admin-curated optional `nearbyServices` দিয়ে খাবার, আবাসন/রিসোর্ট, টয়লেট, জ্বালানি, চিকিৎসা ও জরুরি সেবা দেখাতে পারবে; coordinates বা directory record না থাকলে ভুয়া proximity দাবি করবে না এবং directory browse fallback থাকবে।
- [x] নতুন স্থান প্রস্তাব, curated place-এর তথ্য সংশোধনের অনুরোধ, ১–৫ star review এবং ভুল/সমস্যাজনক তথ্য report form থাকবে; submission authenticated user-এর পরিচয়/সময়সহ `service_requests/tourism` moderation queue-তে যাবে, public curated catalog-এ সরাসরি লিখবে না। কেবল admin-অনুমোদিত review জনসমক্ষে দেখাবে এবং verified indicator শুধুমাত্র admin-owned field থেকে পড়বে। জমার ফলাফল ও permission/network errors ব্যবহারকারীকে জানাবে।
- [x] Tourist places-এর `FlatList` virtualized/lazy rendering, সীমিত initial batch, cached/deferred images এবং retry action-সহ loading, empty, Firebase error, location-denied, storage/share ও submission-error states থাকবে; list ও action controls বড় ও সহজে ব্যবহারযোগ্য হবে।

- নোট: admin-curated nearby amenities, verified status ও approved reviews তখনই দৃশ্যমান হবে যখন সংশ্লিষ্ট Firebase data যোগ থাকবে। এই repository-তে production RTDB rules নেই; deploy-এর আগে moderation/curation permissions যাচাই করুন।

## Notifications experience upgrade (requested 2026-10-24)

- [x] Notification screen-এ `সব`, `না-পড়া`, `সামাজিক`, `মেসেজ`, `জরুরি` filter এবং `আজ`, `গতকাল`, `আগের` দিনভিত্তিক section থাকবে; প্রতিটি card-এ পরিষ্কার সময় থাকবে।
- [x] Like/comment/reply/tag/chat notification-এ sender name/avatar, বাংলায় স্পষ্ট description, safe public context preview এবং unread marker থাকবে; `post_tag` generic update হিসেবে আর দেখাবে না।
- [x] Like/comment/reply/tag থেকে সংশ্লিষ্ট post, chat থেকে নির্দিষ্ট conversation এবং blood alert-এ request ID থাকলে সংশ্লিষ্ট request-এ deep link হবে; blood alert-এ phone, patient বা donor contact দেখানো হবে না।
- [x] Initial load এবং older-page load failure-এ `আবার চেষ্টা করুন` action থাকবে; per-notification পড়া/না-পড়া toggle, `সব পড়ুন`, এবং settings shortcut থাকবে।
- [x] একই post-এর একাধিক like aggregate হবে এবং aggregate card action সব underlying notification record-এ read/unread state update করবে।
- [x] Home bell-এ global unread count বজায় থাকবে; explicit post-tag push copy এবং blood-request deep-link metadata backend payload-এ সংরক্ষিত হবে।
