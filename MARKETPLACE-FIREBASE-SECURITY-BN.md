# Marketplace Firebase নিরাপত্তা ও production checklist

এই নথি production rules নয় এবং সরাসরি deploy করার জন্য copy-paste করা যাবে না। Native App ও Web App—কোনো repository-তেই Realtime Database rules source পাওয়া যায়নি; Native App-এর `firebase.json` শুধু Cloud Functions configure করে। তাই app-এর UI-তে থাকা owner checks Firebase authorization-এর বিকল্প নয়, এবং এখানে live Firebase project-এ কোনো rules publish করা হয়নি। বিদ্যমান production rules-কে merge ও test না করে সম্পূর্ণ rules replace করবেন না।

## নতুন/ব্যবহৃত data paths

- `market_shops/{shopId}` — দোকান; `uid` মালিকের Firebase Auth UID। Listing পড়ার বর্তমান app convention বজায় রাখুন; create/update/delete-এ authenticated owner যাচাই করুন। `verified` কেবল admin/service-owned field—seller update যেন এটি নিজে সেট বা বদলাতে না পারে।
- `market_items/{productId}` — পণ্য; `uid` owner, ঐচ্ছিক `shopId`, `stock`, `availability`, `images`। কেবল owner create/update/delete করতে পারবে এবং update-এ owner বদলাতে পারবে না।
- `market_favorites/{uid}/{shops|products}/{id}` — path-এর UID অবশ্যই `auth.uid`-এর সঙ্গে মিলতে হবে।
- `market_orders/{orderId}` — buyer/seller order detail-এ কেবল সংশ্লিষ্ট `buyerUid` বা `sellerUid` পড়তে পারবে। নতুন order-এর buyer হবে authenticated user; `sellerUid` অবশ্যই পণ্যের মালিকের UID-এর সঙ্গে মিলবে। Buyer/seller identity, product, price, quantity ও contact snapshot অযাচিতভাবে বদলানো যাবে না। Buyer শুধু `pending` order বাতিল করতে পারবে; seller শুধু অনুমোদিত progress transition করতে পারবে।
- `market_reviews/{productId}/{uid}` — এক user/product-এ এক review; `uid` auth UID-এর সঙ্গে মিলবে; সংশ্লিষ্ট product-এর একটি `delivered` order-এর buyer হতে হবে। Rating 1–5 ও লেখার দৈর্ঘ্য সীমাবদ্ধ করুন। Review পড়ার visibility-এর নীতি স্পষ্ট করুন।
- `market_reports/{productId}/{uid}` — রিপোর্টকারী নিজের UID ব্যবহার করতে পারবে; রিপোর্টের create/update policy সীমাবদ্ধ করুন; শুধু অনুমোদিত admin/moderator পড়তে পারবে।

## প্রয়োজনীয় query index

Realtime Database rules-এর সংশ্লিষ্ট path-এ অন্তত নিচের query index-গুলো অন্তর্ভুক্ত করুন (বিদ্যমান index বাদ দেবেন না):

- `market_items`: `time`, `uid`, `shopId`
- `market_shops`: `time`
- `market_orders`: `buyerUid`, `sellerUid` (প্রয়োজনে `time`)

এই Native App `buyerUid`/`sellerUid` দিয়ে order inbox query করে এবং `time` দিয়ে catalog pagination করে। Rules-এ owner/role restriction-এর পাশাপাশি query constraint enforce না করলে parent collection-এ broad read অনুমতি দেবেন না।

## Web compatibility ও status

Web App বর্তমানে `status: pending|delivered|cancelled` বোঝে। Native App `accepted`, `preparing`, `shipped`-এর অগ্রগতি `fulfillmentStatus`-এ রাখে এবং চূড়ান্ত delivery/cancellation-এ legacy `status`-ও update করে। Live rules-এ এই দুই field-এর allowed combination এবং transition একইভাবে enforce করতে হবে। Rules/Cloud Functions ছাড়া client-side transition helper নিজে authorization নয়।

## Deploy করার আগে

1. Firebase Console/authorized maintainer-এর কাছ থেকে বর্তমান Realtime Database rules export করুন।
2. উপরোক্ত ownership, query, validation ও status-transition শর্তগুলো বিদ্যমান auth, admin এবং Web App policy-র সঙ্গে merge করুন।
3. Firebase Emulator Suite-এ buyer, seller, অন্য user এবং unauthenticated user-এর allow/deny test চালান—বিশেষত order reads, unauthorized status changes, review eligibility, `verified` field ও report privacy।
4. সব পরীক্ষায় প্রত্যাশিত ফল না আসা পর্যন্ত live database rules deploy করবেন না।

অর্ডার checkout-এ “Cash on delivery” ও “দোকানে পরিশোধ” কেবল পেমেন্ট পদ্ধতির পছন্দ সংরক্ষণ করে; কোনো online payment gateway বা অর্থ লেনদেন এখানে সংযুক্ত/সম্পন্ন হয় না। পণ্য stock এই মুহূর্তে seller-entered listing তথ্য ও quantity validation; reservation, stock deduction ও cancellation-এ stock ফেরত server-side transaction/Cloud Function দিয়ে যোগ না করা পর্যন্ত concurrent order-এর বিরুদ্ধে নিশ্চিত inventory reservation নয়।
