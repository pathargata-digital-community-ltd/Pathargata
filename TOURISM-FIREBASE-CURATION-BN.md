# পর্যটন Firebase ডেটা ও moderation guide

এই Native App-এর পর্যটন ক্যাটালগ আগের public data path-টি অপরিবর্তিত রাখে:

```text
services/data/history_tourism/{placeId}
```

পুরোনো record-এ `title`, `details`, `category`, `image`, `phone`, `address` ও `coordinates` থাকলেই হবে। নতুন তথ্য ধাপে ধাপে যোগ করা যায়; সব অতিরিক্ত field ঐচ্ছিক। App legacy `coordinates: "latitude,longitude"` এবং `latitude`/`longitude` বা object coordinates পড়ে। একাধিক ছবির জন্য `images: ["https://…", "https://…"]` ব্যবহার করুন; `image` থাকলে সেটি gallery-র প্রথম ছবি হিসেবে রাখা হয়।

## প্রস্তাবিত place record

```json
{
  "title": "লালদিয়া বন",
  "details": "স্থানটির যাচাইকৃত বিবরণ…",
  "category": "nature",
  "image": "https://cdn.example/place-cover.jpg",
  "images": ["https://cdn.example/place-cover.jpg", "https://cdn.example/place-view.jpg"],
  "address": "লালদিয়া, পাথরঘাটা",
  "locality": "লালদিয়া",
  "latitude": 22.0,
  "longitude": 89.9,
  "openingHours": "স্থানীয়ভাবে নিশ্চিত করে লিখুন",
  "admissionFee": "বিনামূল্যে / সর্বশেষ যাচাইকৃত খরচ",
  "estimatedDuration": "প্রায় ২ ঘণ্টা",
  "suitableFor": "পরিবার ও প্রকৃতিপ্রেমী",
  "tips": "আবহাওয়া ও যাতায়াত সম্পর্কে সর্বশেষ স্থানীয় তথ্য যাচাই করুন",
  "updatedAt": 1792770000000,
  "popularity": 0,
  "is_verified": true,
  "average_rating": 4.5,
  "review_count": 2,
  "approvedReviews": [
    { "author": "কমিউনিটি সদস্য", "rating": 5, "comment": "সুন্দর জায়গা", "timestamp": 1792760000000 }
  ],
  "nearbyServices": [
    { "id": "clinic-1", "name": "স্থানীয় স্বাস্থ্যকেন্দ্র", "kind": "চিকিৎসা", "address": "পাথরঘাটা", "phone": "01…", "latitude": 22.01, "longitude": 89.91 },
    { "id": "fuel-1", "name": "জ্বালানি সেবা", "kind": "জ্বালানি", "address": "যাচাইকৃত ঠিকানা" },
    { "id": "toilet-1", "name": "পাবলিক টয়লেট", "kind": "টয়লেট", "address": "যাচাইকৃত ঠিকানা" },
    { "id": "stay-1", "name": "স্থানীয় আবাসন", "kind": "আবাসন/রিসোর্ট", "address": "যাচাইকৃত ঠিকানা", "phone": "01…" },
    { "id": "food-1", "name": "স্থানীয় খাবারের দোকান", "kind": "খাবার", "address": "যাচাইকৃত ঠিকানা" },
    { "id": "emergency-1", "name": "জরুরি যোগাযোগ", "kind": "জরুরি সেবা", "address": "যাচাইকৃত ঠিকানা", "phone": "01…" }
  ]
}
```

`category`-র পছন্দের মান: `nature`, `history`, `food_resort`, `culture`, `family`। পুরোনো/অজানা category-ও display হয়, কিন্তু নতুন filter-এ সুনির্দিষ্ট category না মিললে “সব স্থান” ব্যবহার করুন। `updatedAt` milliseconds-এ দিন। বর্তমান অবস্থান থেকে দূরত্ব কেবল place ও service—দুইটির valid coordinates থাকলেই দেখানো হয়; ঠিকানা থেকে অনুমান করে distance দেখানো হয় না।

`is_verified`, `average_rating`, `review_count`, `approvedReviews` এবং catalogue content কেবল প্রশাসকের নিয়ন্ত্রিত curated data। User form থেকে verification flag বা review-কে approved করা যায় না। User-দের ratings, reviews, place proposal, correction ও report সরাসরি public catalogue-এ লেখা হয় না; moderation request হিসেবেই পাঠানো হয়।

## User submission path

```text
service_requests/tourism/{requestId}
```

App request-এ `requestType` (`suggestion`, `correction`, `review`, `report`), `placeId` (যদি থাকে), `uid`, `author`, `timestamp`, `status: "open"` এবং `moderationStatus: "pending"` পাঠায়। Proposal/correction-এ optional `images` URL list, title/category/address/locality/details/phone/opening hours/fee/duration; review-এ `rating` ও optional `details`; report-এ `details` থাকে। Review moderation ছাড়া public review হিসেবে দেখানো হয় না।

## Admin review এবং Firebase Rules release checklist

Native App-এ Tourism suggestion, correction, review ও report `service_requests/tourism/{requestId}`-এ pending অবস্থায় জমা হয়; এগুলো সরাসরি public তালিকায় যায় না। Upzila Admin Panel-এর **পর্যটন/পরিবহন আবেদন** অংশে Admin আবেদন যাচাই করতে পারবেন। Suggestion অনুমোদন করলে `/services/data/history_tourism/{placeId}`-এ curated place তৈরি হয়; correction অনুমোদনে নির্বাচিত place-এর যাচাইকৃত তথ্য update হয়; review অনুমোদনে `approvedReviews`, rating ও review count আপডেট হয়; report নিষ্পত্তি হয় কিন্তু catalog entry তৈরি করে না। প্রত্যাখ্যাত আবেদন publish হয় না। Request status, public update ও immutable `super_admin_audit` event একই atomic update-এ লেখা হয়।

পরিবহন provider form `/transport_provider_requests/{requestId}`-এ আবেদন জমা দেয়। Admin অনুমোদনের পর provider type অনুযায়ী `/transport/{rent_a_car|cng|auto_rickshaw|motorcycle|bus}/{recordId}`-এ public listing তৈরি হয়। ফোন ও service-area তখন public directory-তে দেখা যায়। Generic `/service_requests/transport/{requestId}` হলো পরিবহন সহায়তা/request—এটি provider listing নয়; Admin তা নিষ্পত্তি বা প্রত্যাখ্যান করতে পারবেন। আবেদন ও contact info কেবল Admin পড়তে পারবেন।

এই repository-র `database.rules.json` হলো পূর্ণ Realtime Database Rules document। Rules source update হলেই Firebase production বদলায় না: production-এ deploy করার আগে বর্তমান Firebase Rules-এর backup নিন, এই **সম্পূর্ণ** document সঠিক project-এ merge/review করে Firebase Console থেকে publish করুন। বিশেষভাবে যাচাই করুন:

- `service_requests/tourism` ও `transport_provider_requests` কেবল Admin পড়তে/মডারেট করতে পারেন; user কেবল নিজের pending submission করতে পারে;
- `service_requests/transport`-এ জমাদাতার ফোনসহ তথ্য অন্য সাধারণ user পড়তে পারে না;
- user নিজে Tourism/Transport public directory, verified flag, approved review বা approved status লিখতে পারে না;
- moderation কেবল pending request-এ একবার হয়; public-directory update ও audit event একসঙ্গে সফল হয়;
- authenticated user approved/public catalog read করতে পারে এবং Admin public entry add/update করতে পারে।

`pnpm test:rules` emulator suite-এ auth/no-auth, UID mismatch, Admin read/write, pending-only decision, directory promotion සහ audit event পরীক্ষা করুন। Production user data-তে destructive test চালাবেন না; UI claim-কে Rules-এর বিকল্প ভাববেন না।


সর্বশেষ যাচাইয়ে Rules suite-এর ২৩টি test file-এর ১৪৩টি test পাস করেছে।
