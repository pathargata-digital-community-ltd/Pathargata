# Android App Check ও Play Integrity Setup

## বর্তমান source-code behavior

Pathargata Native App-এর native development ও EAS `preview` (internal/sideloaded APK) build-এ Firebase App Check-এর `debug` provider ব্যবহার হবে। `production` build-এ Android `playIntegrity` এবং iOS `appAttestWithDeviceCheckFallback` থাকবে। Play Store-এ এখনো প্রকাশ না হওয়া internal APK তাই Play Integrity verdict-এর ওপর নির্ভর করবে না; production build-এ debug provider ঢুকবে না। Web build-এ `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` থাকলে reCAPTCHA v3 provider চালু হবে; site key না থাকলে web App Check silently enforcement-ready নয় বলে status দেখাবে, কোনো secret বা debug token bundle-এ যাবে না।

প্রধান implementation:

```text
lib/firebase-app-check.ts
```

Root layout এখন web এবং native দুই platform-এই App Check initialize করে। Development ও internal preview failure-এ non-blocking warning banner দেখায়, তাই App Check warning test build-এর navigation আটকে দেবে না। Production native release-এ initialization ব্যর্থ হলে blocking safety screen থাকে। Firebase Auth, RTDB Rules এবং App Check তিনটি আলাদা security layer হিসেবে থাকে।

Android package:

```text
com.pathargata.digital.ltd
```

## Internal preview APK / development build

`eas build --profile preview --platform android` দিয়ে নতুন APK build করুন। পুরোনো APK-তে provider setting বা warning behavior বদলাবে না; নতুন build install করতে হবে।

প্রথমবার app চালালে Android logcat-এ Firebase App Check debug token দেখা যাবে। Tokenটি শুধু Firebase Console → App Check → Android app → Debug tokens-এ register করুন। Tokenটি repository, chat, screenshot বা source code-এ commit করবেন না; secret-এর মতো সুরক্ষিত রাখুন। Token register না থাকলে App Check enforcement চালু থাকা Firebase service request reject হতে পারে; preview warning দেখালেও protected data/action কাজ নাও করতে পারে।

Token registration সম্ভব না হলে Firebase Console-এ সংশ্লিষ্ট service App Check enforcement সাময়িকভাবে Monitor/unenforced রাখুন। Firebase Authentication বা Realtime Database Rules বন্ধ/public করবেন না।

## ভবিষ্যৎ Play Store / production release

EAS `production` build-এ Play Integrity provider ব্যবহার হবে। Play Store-এ প্রকাশের আগে Firebase Console-এ:

1. Firebase project খুলুন।
2. App Check খুলুন।
3. Android app নির্বাচন করুন।
4. Package name `com.pathargata.digital.ltd` মিলিয়ে নিন।
5. Play Integrity provider register করুন।
6. প্রথমে Metrics/monitoring mode-এ test করুন।
7. Valid Android build থেকে requests আসছে নিশ্চিত হওয়ার পরে প্রয়োজনীয় Firebase service-এর enforcement আলাদা করে enable করুন।

প্রথম পরীক্ষাতেই enforcement enable করবেন না। ভুল configuration হলে legitimate user-এর Realtime Database request block হতে পারে।

## Web reCAPTCHA configuration

1. Firebase Console-এর App Check-এ web app-এর জন্য reCAPTCHA v3 provider register করুন এবং site key নিন।
2. Build environment-এ শুধু public site key দিন: `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY=...`। Secret key কখনো Expo bundle, `.env` commit বা GitHub-এ রাখবেন না।
3. নতুন web build চালিয়ে App Check metrics-এ valid request দেখুন। Web App Check provider-এর জন্য Firebase config-এ registered web app ID ব্যবহার করা উচিত; Android app ID দিয়ে web enforcement evidence দাবি করা যাবে না।

## Staged enforcement ও exact console steps

Repository থেকে `firebase deploy` App Check enforcement toggle করে না। Enforcement Firebase Console-এ service-by-service করতে হবে:

1. Firebase Console → **App Check** → **Apps**-এ Android package `com.pathargata.digital.ltd`, iOS bundle এবং registered web app যাচাই করুন।
2. Android-এ Play Integrity, iOS-এ App Attest/DeviceCheck এবং web-এ reCAPTCHA provider status যাচাই করুন।
3. Development debug token কেবল development app-এর জন্য register করুন; release APK-এর debug token register করবেন না।
4. সব provider-এর জন্য আগে **Metrics/monitoring** mode রাখুন এবং অন্তত একটি fresh release build থেকে valid, missing ও invalid request pattern observe করুন।
5. প্রথমে low-risk service-এ staged enforcement করুন; valid traffic স্থিতিশীল থাকলে Realtime Database, Cloud Functions এবং Storage আলাদা আলাদা enable করুন।
6. পুরোনো APK block হওয়ার সম্ভাবনা থাকলে support notice দিন এবং নতুন signed build distribution-এর পরে enforcement চালু করুন।

`firebase deploy --only database,functions` Rules/Functions code deploy করতে পারে, কিন্তু App Check enforcement state পরিবর্তন করে না। তাই deployment checklist-এ Console enforcement screenshot/record আলাদা evidence হিসেবে রাখতে হবে।

## Invalid build, emulator ও old-client behavior

- Emulator বা rooted/tampered release build valid Play Integrity token না পেলে enforced service-এ `app-check`/permission failure প্রত্যাশিত behavior।
- Development emulator কেবল registered debug token-সহ test করা যাবে; debug token release configuration-এ hard-code করা নেই।
- Old client-এর App Check header না থাকলে monitoring mode-এ metrics-এ missing দেখা যাবে; enforcement mode-এ request block হতে পারে।
- User-facing support message: **“আপনার অ্যাপের নিরাপত্তা যাচাই সম্পন্ন হয়নি। Play Store/বিশ্বস্ত উৎস থেকে সর্বশেষ আপডেট ইনস্টল করুন, automatic date/time ও internet connection চালু রাখুন। সমস্যা থাকলে app version, device model এবং সময় জানিয়ে support-এ যোগাযোগ করুন।”**

## Emergency rollback

Enforced service-এ valid fresh build-এর request block spike, App Check initialization failure বা critical Firebase action failure দেখা গেলে Firebase Console → App Check → সংশ্লিষ্ট service → enforcement সাময়িকভাবে **Monitoring**-এ ফিরিয়ে দিন। তারপর provider/package/signing configuration ঠিক করে নতুন build দিন। Auth/Rules বন্ধ করে workaround করবেন না; App Check rollback মানে কেবল enforcement mode rollback।

## Play Integrity-এর জন্য প্রয়োজনীয় জিনিস

- সঠিক Android package name
- Firebase project-এ Android app registration
- Google Play Console access বা Play Integrity configuration access
- Release signing identity-এর সঙ্গে consistent build
- একটি fresh Android build

Physical device ছাড়া lock-screen/push এবং App Check end-to-end status নিশ্চিত বলা যাবে না। Development ও internal preview build-এ Bengali non-blocking warning ও retry দেখা যায়; production release-এ App Check initialization ব্যর্থ হলে blocking safety screen থাকে। Retry করলে rejected initialization cache না রেখে নতুন token attempt করা হয়।

## Billing note

App Check নিজে paid Firebase feature নয়। Normal usage-এর জন্য Firebase billing plan কেনা বাধ্যতামূলক নয়। তবে Play Integrity-এর quota এবং Google Play Console configuration-এর নিয়ম মানতে হবে। Cloud Functions deploy আলাদা বিষয়; Functions deploy করার সময় Blaze billing requirement থাকতে পারে।

## Enforcement checklist

- [x] Development debug token source code-এ নেই
- [x] Internal preview build-এ debug provider; production Android build-এ provider `playIntegrity`
- [x] Android package `com.pathargata.digital.ltd`
- [x] iOS provider `appAttestWithDeviceCheckFallback`
- [x] Web provider code ও public site-key environment hook আছে
- [x] Root layout failure হলে controlled degraded warning দেখায়
- [x] Static `pnpm validate:app-check` preflight আছে
- [ ] App Check metrics-এ valid requests দেখা যাচ্ছে
- [x] Realtime Database rules manually reviewed in repository/emulator tests
- [ ] Debug build এবং release build আলাদা করে test করা হয়েছে
- [ ] Enforcement enable করার আগে rollback plan আছে
- [ ] Physical Android device test pass করেছে

## Strict enforcement rollout

Source code strict enforcement নিজে থেকে Firebase Console-এ enable করে না। Authorized release operator-এর rollout:

1. Internal preview APK-কে registered debug token-সহ physical device-এ পরীক্ষা করুন; future production candidate-এ Play Integrity provider যাচাই করুন।
2. Firebase App Check Metrics-এ valid, invalid এবং missing token request আলাদা করে observe করুন।
3. Realtime Database, Storage এবং Functions-এর enforcement একসঙ্গে নয়—প্রথমে test/staging scope, পরে service-by-service staged rollout করুন।
4. Enforcement enable করার আগে installed build-এর package, signing identity, Firebase project এবং Play Integrity registration মিলিয়ে নিন।
5. Legitimate request block হলে enforcement rollback করে metrics ও device logs সংগ্রহ করুন; debug token release build-এ register করে bypass করবেন না।

### Evidence required

- Firebase Console App Check metrics screenshot/export ও observation window
- Preview/release artifact URL, build number এবং SHA-256
- Physical device model, Android version ও Play Services version
- Valid request, missing/invalid token এবং old-build behavior-এর result
- Enforcement change-এর operator, timestamp, scope এবং rollback reference

এই repository-side change কোনো Firebase Console enforcement, live deploy বা physical-device test সম্পন্ন করেছে বলে দাবি করে না।
