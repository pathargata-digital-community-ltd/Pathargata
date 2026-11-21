# Pathargata Native App — Web Feature Parity Plan

## Scope and invariant

এই plan-এর সব implementation কেবল `Pathargata-Native-App` repository-তে হবে। `Pathargata` Web App repository source of truth/reference হিসেবে থাকবে এবং কোনো file, code বা behavior পরিবর্তন করা হবে না। Native App একই Firebase Auth ও Realtime Database schema ব্যবহার করবে, যাতে Web ও Native account/data compatible থাকে।

## Delivery strategy

কাজগুলো ছোট, যাচাইযোগ্য milestone-এ করা হবে। প্রতিটি milestone-এর শেষে TypeScript/lint/test/build যতদূর environment-এ সম্ভব চালানো হবে এবং Web repository clean আছে কি না যাচাই করা হবে।

### Phase 0 — Baseline and architecture hardening

- Web-to-Native feature parity matrix বজায় রাখা।
- Native app-এর global Firebase auth state listener/context তৈরি করা।
- Loading, error, empty ও retry state-এর reusable primitives তৈরি করা।
- Firebase path/type adapter গুছিয়ে নেওয়া।
- Media upload strategy নির্ধারণ করা; client bundle-এ secret না রাখা।
- Firebase security rules review-এর জন্য checklist তৈরি করা।

### Phase 1 — Service catalog foundation (শুরু করা হয়েছে)

- Live `services/categories` থেকে service category পড়া।
- Web-এর default categories-এর Native representation তৈরি করা।
- Dynamic service detail route তৈরি করা।
- `services/data/{categoryId}` থেকে image, details ও phone action দেখানো।
- Loading/error/empty state যোগ করা।
- Service cards-এর সবগুলোকে কার্যকর navigation দেওয়া।

### Phase 2 — Core social parity

- Feed pagination, pull-to-refresh, filter এবং post detail।
- Full comments, replies, comment likes, edit/delete/report।
- Post edit/delete/save/repost/share/report/hide/mute।
- Image/video post, location, feeling, hashtag, tagging ও poll।
- Firebase Storage/approved upload adapter এবং media preview।

### Phase 3 — Identity, people and account

- Global auth context ও reactive session handling সম্পূর্ণ করা।
- Password reset, email verification ও social login।
- Friend request, accept/cancel/unfriend, friends list।
- Other user profile, saved posts, profile tabs।
- Profile photo/cover upload, complete profile editing ও badges।
- Global search across people/posts/services/market/directory।

### Phase 4 — Messaging and notifications

- New chat chooser, chat search, archive, block, delete।
- Typing, seen/read receipt, reply, unsend, delete-for-me।
- Image/voice message।
- Hard-coded chat key সরিয়ে নিরাপদ key/session strategy।
- Native push token registration, foreground/background handlers ও deep links।
- Friend, blood, story, message এবং post notification events।

### Phase 5 — Stories, settings and safety

- 24-hour image/video stories, viewer, reactions, replies ও delete।
- Dark mode, font size, data saver, cache clear।
- Privacy, alert preferences, blocked users।
- Deactivate/delete account এবং update checker।
- Notices, ads, emergency alerts, policy/rules/share links।
- AI assistant, support ticket ও feedback flow।

### Phase 6 — Local services

- Directory list, search, details, phone/WhatsApp/chat actions।
- Directory bookmark, correction suggestion, rating/review।
- Blood donors, emergency blood requests ও donor notifications।
- Complaints form, geolocation এবং complaint history।
- Education, tourism, transport ও FIFA modules।

### Phase 7 — Marketplace, contest, verification and monetization

- Shops, products, search, details, favorites।
- Shop/product creation, media upload, orders ও seller status management।
- Photo contest, voting, leaderboard ও prize contact।
- Verification plans, payments, document/selfie upload ও status।
- Points, monetization eligibility, creator application, withdrawal/history।

### Phase 8 — Release hardening

- Firebase rules এবং data access audit।
- Android/iOS permissions, privacy ও accessibility review।
- Performance, pagination, caching ও offline behavior।
- Automated tests এবং Web schema regression tests।
- Android development build/APK validation এবং iOS development build configuration।
- Final parity audit; Web repository untouched নিশ্চিত করা।

## বর্তমান milestone acceptance criteria

Phase 1 শেষ হবে যখন:

1. Services tab live Firebase categories দেখাবে।
2. Remote category না থাকলেও Web-compatible default categories দেখাবে।
3. প্রতিটি category detail route-এ যাবে।
4. Category data-এর image/details/phone action দেখাবে।
5. Loading, empty ও error state থাকবে।
6. Web repository clean থাকবে।
