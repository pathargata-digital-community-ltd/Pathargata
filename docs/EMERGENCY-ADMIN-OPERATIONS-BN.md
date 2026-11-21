# SOS / জরুরি alert — Admin পরিচালনা নির্দেশিকা

## কোথায় কী পরিচালনা করবেন

- **Upzila Admin Panel → Sidebar → জরুরি এলার্ট:** Native App-এর `emergency_alerts` queue দেখা, যাচাই, response status, resolution ও cancellation পরিচালনা করুন। Admin-কে Firebase Auth custom claim `{ "admin": true }` দিয়ে লগইন করতে হবে; profile-এর `role` একা যথেষ্ট নয়।
- **Upzila Admin Panel → ডিরেক্টরি → Hospital / Health:** হাসপাতাল/স্বাস্থ্যসেবার entry যোগ, সম্পাদনা বা মুছুন। Native App এই তথ্য `directory/health` path থেকে পড়ে। Admin-এর **পুরোনো Hospital path** বোতাম `directory/hospital`-এর legacy record কেবল দেখতে/পরিচালনা করতে দেয়; সেগুলো Native App-এর বর্তমান hospital category-তে স্বয়ংক্রিয়ভাবে যায় না।
- **Native App-এর ৯৯৯ বোতাম:** এটি ফোনের dialer-এ সরকারি ৯৯৯ নম্বর খোলে; Admin Panel দিয়ে ৯৯৯ dispatch বা নিয়ন্ত্রণ করা হয় না। জীবনঝুঁকিতে SOS form/portal-এর অপেক্ষা না করে ৯৯৯-এ কল করুন।

## SOS triage-এর ধাপ

1. **জরুরি এলার্ট** tab খুলুন। Sidebar badge-এ যাচাই বাকি active alert-এর সংখ্যা দেখায়। তালিকায় চলমান, যাচাই বাকি, সাড়া দেওয়া হচ্ছে, সমাধান হয়েছে, বাতিল এবং সব alert filter আছে।
2. Alert-এর title, বিবরণ, severity, এলাকা এবং reporter UID দেখে প্রাথমিক triage করুন।
3. প্রয়োজন হলে **“ব্যক্তিগত যোগাযোগের তথ্য দেখুন”** বোতাম চাপুন। শুধু এই explicit action-এ `emergency_alert_private/{alertId}` থেকে reporter-এর নাম, ফোন, আক্রান্তের সংখ্যা এবং GPS coordinate আনা হয়। ফোনে কল ও Google Maps link ব্যবহার করা যায়। ব্যক্তিগত তথ্য public `emergency_alerts` record বা Admin audit-এ কপি করবেন না।
4. সিদ্ধান্তের action বেছে নিন:
   - **যাচাই করুন:** `verificationStatus=verified`।
   - **মিথ্যা/অনুপযুক্ত — বাতিল:** `verificationStatus=rejected` এবং `status=cancelled`।
   - **সাড়া দেওয়া শুরু:** `status=responding`।
   - **সমাধান হয়েছে:** `status=resolved`।
   - **Alert বাতিল:** `status=cancelled`।
   - **আবার চালু:** cancelled হলে `reported`, resolved হলে `responding`। ভুলভাবে reject করা record হলে একই action `verificationStatus`-কে `unverified` করে আবার যাচাইয়ের তালিকায় ফেরায়।
5. সিদ্ধান্তের সংক্ষিপ্ত কারণ দিন। কারণটি Admin-only audit record-এ রাখা হয়—সেখানে ফোন, ঠিকানা বা অন্য ব্যক্তিগত তথ্য লিখবেন না।

Status পরিবর্তনের অনুমোদিত ধাপ:

- `reported → responding | resolved | cancelled`
- `responding → reported | resolved | cancelled`
- `resolved → responding | cancelled`
- `cancelled → reported`

নতুন alert স্বাভাবিকভাবেই `reported` ও `unverified` অবস্থায় তৈরি হয়। বিদ্যমান alert-এর যেকোনো update-এ `updatedAt`/`updatedBy` বাধ্যতামূলক; Rules actor-কে বর্তমান `admin: true` UID হিসেবে যাচাই করে, timestamp ভবিষ্যতের ৫ মিনিটের বেশি হতে পারে না, এবং Admin client দিয়ে alert delete করা বন্ধ। Public alert rule private fields-এর পাশাপাশি `phone`, `phoneNumber`, `requesterName`, `email`, `gps`, `coordinates`-এর মতো প্রচলিত sensitive aliases-ও প্রত্যাখ্যান করে।

Admin Panel-এর স্বাভাবিক action-এ status/verification update ও `super_admin_audit` event একটি atomic multi-location write: audit write ব্যর্থ হলে alert update-ও সম্পন্ন হয় না। Audit event-এ actor, action, target, before/after state, reason ও time থাকে; private reporter details থাকে না। RTDB Rules sibling path-এর atomic audit event-এর অস্তিত্ব আলাদাভাবে যাচাই করতে পারে না; তাই direct/custom privileged SDK write না করে Admin Panel ব্যবহার করুন—Rules actor/time metadata বাধ্য করে, আর Panel audit যোগ করে।

## Rules আপডেট নিরাপদে চালানো

এই Rules source Native-App repository-র `database.rules.json`-এ আছে। Repository-তে পরিবর্তন push হওয়া Firebase-এর live Rules স্বয়ংক্রিয়ভাবে বদলায় না। আগে live rules ম্যানুয়ালি আপডেট করা হয়ে থাকলে, পুরো ফাইল blind paste করবেন না:

1. Firebase Console থেকে **বর্তমান সম্পূর্ণ Rules document** backup/copy করুন।
2. Native-App repository-র `database.rules.json`-এর সঙ্গে diff করুন। আগে থেকে থাকা আপনার manual পরিবর্তনগুলো অক্ষত রেখে নতুন `emergency_alerts/{alertId}` validation ও `super_admin_audit/{eventId}`-এর Admin-only write clause merge করুন। `emergency_alert_private/{alertId}`-এর Admin-only read-ও রাখতে হবে।
3. JSON validation এবং Emulator test চালান:

   ```bash
   python3 -m json.tool database.rules.json >/dev/null
   pnpm test:rules
   ```

4. সম্পূর্ণ **reviewed/merged** Rules document Firebase Console-এ publish করুন। কেবল একটি partial snippet দিয়ে root rules প্রতিস্থাপন করবেন না।
5. Firebase Rules Playground/Emulator বা আলাদা test record দিয়ে যাচাই করুন: `admin: true` alert ও audit update করতে পারে; সাধারণ user অন্যের private record/audit পড়তে বা moderation update করতে পারে না।
6. Live Admin Panel-এ একটি non-destructive test alert দিয়ে verify/response status পরীক্ষা করুন এবং test record cleanup করুন।

**GitHub push, GitHub Pages publish, Firebase Rules publish এবং Android app release—চারটি আলাদা কাজ।** Admin UI update public Admin site-এ দেখা যেতে পারে; Android-এ user-side status filtering/route redirect পেতে Native App-এর পরবর্তী build/release প্রয়োজন। Admin Panel খোলা থাকলে RTDB queue real-time আপডেট হয়; এই feature-এ OS/browser push notification বা স্বয়ংক্রিয় ৯৯৯ dispatch যুক্ত নেই।

## যাচাইকৃত পরিবর্তন

- Rules Emulator: ২২টি test file, ১৩৮টি test পাস করেছে (emergency alert triage ও atomic audit test-সহ)।
- Native-App TypeScript check (`pnpm run check`) পাস করেছে।
