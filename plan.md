# পাথরঘাটা ডিজিটাল Native App Plan

## Scope

বর্তমান Capacitor Web App repository `/home/ubuntu/Pathargata` অপরিবর্তিত থাকবে। নতুন অ্যাপটি Expo Router, React Native, TypeScript এবং NativeWind-ভিত্তিক হবে। লক্ষ্য হলো Android ও iOS-এর জন্য native-style, দ্রুত এবং one-handed mobile experience তৈরি করা; এটি WebView wrapper হবে না।

## Implementation approach

- React Native screen ও native navigation: Home, Services, Messages, People এবং Profile-এর bottom tabs।
- Existing Web App-এর Firebase Realtime Database/Auth data model ও user-facing feature mapping আলাদাভাবে audit করে native data adapter-এ নেওয়া হবে; client bundle-এ server secret রাখা হবে না।
- Fast loading: cached session/user state, lightweight first paint, skeleton states, lazy feature screens, paginated feeds এবং optimized image rendering।
- Design: পাথরঘাটা ডিজিটালের সবুজ identity, পরিষ্কার সাদা surface, rounded cards, restrained shadows এবং accessible contrast।
- Progressive delivery: প্রথম checkpoint-এ usable shell, feed preview, service shortcuts, auth-aware profile state এবং empty states; পরবর্তী ধাপে live Firebase feed, messaging, notifications, media upload এবং service modules।
- Android APK ও iOS development build-এর configuration প্রস্তুত থাকবে; Store upload এই কাজের scope-এ নেই।

## Project structure

- `app/`: Expo Router routes and tab screens.
- `components/`: reusable native UI, cards, loading and navigation primitives.
- `lib/`: API, auth, cache and platform adapters.
- `hooks/`: auth, theme and data loading hooks.
- `assets/images/`: launcher and splash branding.
- `server/` and `drizzle/`: managed starter infrastructure kept for secure API-backed extensions.
- `plan.md`, `TODO.md`: product decisions and delivery tracking.

## Marketplace upgrade

Reuse the existing Community Pulse visual language and the Web-compatible Firebase nodes (`market_shops`, `market_items`, `market_orders`, `market_favorites`). Extend the Native Marketplace with an owner-only seller center for shop/product create, edit and delete; tappable shop detail pages; complete product details and image gallery; searchable/filterable/sortable catalog with locality and category; buyer/seller order tracking with explicit status transitions; stock/availability and delivery/payment-choice metadata; verified-shop display and buyer review/report affordances; and accessible loading, empty, offline/error and retry states. Use virtualized, paginated product/shop lists and cached, deferred image loading.

Keep old Firebase records readable by treating newly introduced fields as optional. Do not claim online payment processing: the current app has no configured payment gateway. Do not mark a seller verified from client input; only display server/admin-owned verification data. Firebase Realtime Database security rules are not present in this repository, so UI ownership checks are not an authorization boundary; review and deploy matching production rules separately before relying on private order/review/report data.

Project structure additions: marketplace-specific pure data/validation/pagination helpers under `lib/`, reusable seller/shop/product UI under `components/`, and the marketplace route under `app/service/market.tsx`; keep seller-order transitions in `components/market-order-inbox.tsx` and domain tests in `tests/`.

## Marketplace usability and gallery correction

For the next usability pass, avoid nested `Pressable` elements because React Native Web renders them as nested buttons. Apply explicit `style`/`StyleSheet` styling to `Pressable` containers (the starter remaps their `className` away); use large, consistently spaced hit targets and a persistent selected state with contrasting fill, border and selected icon. Show Products, Shops and Favorites as clearly differentiated icon tabs. Render exactly three product cards per row in product browsing, favorites and shop detail. Product photos must be swipeable and open into a full-screen pinch-to-zoom view.

## Tourism guide upgrade

Extend the existing `app/service/tourism.tsx` while retaining the Web-compatible public Firebase catalog at `services/data/history_tourism` and reading all new place metadata as optional, so current records still display. Use `lib/tourism.ts` for normalization, filtering, sorting, geographic distance calculations and approved public-review metadata; a reusable place-detail surface for full place facts, approved community reviews, admin-owned verification and nearby directory services; and AsyncStorage for private on-device favorites and ordered trip plans. Nearby directory entries are combined with optional admin-curated `nearbyServices` for food, lodging/resorts, toilets, fuel and emergency/health services, without falsely claiming unverified proximity. Request foreground location permission only after the user selects nearby sorting; the rest of the catalog must remain usable without location access. Keep the curated catalog read-only for app users. Submit suggestions, corrections, reviews and reports through the existing `service_requests/tourism` moderation path rather than writing directly into curated public data; only approved reviews in curated admin-owned fields are displayed, and users cannot set verified status. Use Expo's virtualized `FlatList`, cached/deferred images, bounded initial rendering and retryable Firebase/location/storage/share error states. Reuse the app's Community Pulse style and explicit inline `Pressable` styles for Web preview compatibility.

## Design direction

তিনটি সম্ভাব্য style: Community Pulse (0.06)—উষ্ণ, feed-first community app; Civic Utility (0.04)—service directory-কেন্দ্রিক; Calm Social (0.03)—কম noise, বেশি readable content। নির্বাচিত style: **Community Pulse**।

- Design movement: modern civic-social mobile UI with editorial feed rhythm.
- Core principles: দ্রুত বোঝা যায়, এক হাতে ব্যবহারযোগ্য, community-first, progressive disclosure।
- Color philosophy: সবুজ হলো স্থানীয় আস্থা ও service action-এর signal; নীল secondary action ও information-এর জন্য; neutral surface content-কে সামনে রাখে।
- Layout paradigm: top identity header, horizontal feed context এবং bottom thumb navigation; dense grid নয়, vertically stacked cards।
- Signature elements: green action accent, subtle location/community label, compact status badges।
- Interaction: tap targets কমপক্ষে comfortable mobile size; haptics where appropriate; optimistic visual feedback; skeleton before network content।
- Animation: short opacity/translate transitions; no blocking decorative animation; loading state remains calm।
- Typography: platform system sans for performance, bold Bengali headings, readable 14–16px body scale।
- Brand essence: পাথরঘাটার মানুষ, সেবা ও খবরকে এক দ্রুত mobile home-এ আনা। Personality: স্থানীয়, সহায়ক, নির্ভরযোগ্য।
- Brand voice: “আপনার এলাকার আপডেট এক জায়গায়” এবং “প্রয়োজনের সেবাটি দ্রুত খুঁজে নিন।”
- Wordmark: text-first Bengali/Latin lockup with a small green location-pin/community mark.
- Signature brand color: `#15803D` deep community green.
