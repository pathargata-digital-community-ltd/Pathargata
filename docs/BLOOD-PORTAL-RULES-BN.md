# রক্তসেবা পোর্টালের Firebase Rules

Portal-এর owner dashboard `/blood_partner_access` membership list এবং pending queue-র জন্য `/blood_partner_access_requests` query পড়ে। Owner UI-তে `admin: true` দেখা মানে Firebase Authentication token-এ custom claim আছে; Realtime Database-এ একই claim-কে অনুমতি দেওয়ার rules-ও production-এ প্রকাশিত থাকতে হবে।

## Canonical rules source

এই repository-র সম্পূর্ণ [`database.rules.json`](../database.rules.json) হলো Realtime Database-এর canonical rules document। বর্তমানে এতে:

- root-এ default `.read: false` এবং `.write: false` রাখা আছে;
- `/blood_partner_access` root read/write শুধু authenticated `auth.token.admin === true` project admin-এর জন্য;
- `/blood_partner_access/$uid` থেকে প্রত্যেক ব্যবহারকারী নিজের membership দেখতে পারে, কিন্তু root-এর সব membership list operator-রা পড়তে পারে না;
- `/blood_partner_access_requests`-এর pending queue admin-দের জন্য অনুমোদিত, applicant শুধু নিজের record সীমিতভাবে দেখতে/পাঠাতে পারে; নতুন submission-এ অনন্য `revisionId` বাধ্যতামূলক, এবং resubmission-এ আগের revision পুনর্ব্যবহার করা যায় না;
- role assignment, approval ও access revocation admin-only থাকে; Admin card-এ প্রদর্শিত revision বর্তমান record-এর সঙ্গে মিললেই approve/reject transaction lock নেয়—অতএব stale card নতুন resubmission-এ সিদ্ধান্ত দিতে পারে না। পুরোনো pending record-এ revision না থাকলে প্রথম lock এটিকে `legacy:{requestedAt}` দিয়ে একবারে migrate করে;
- চূড়ান্ত status, membership পরিবর্তন (approval-এ) এবং `super_admin_audit` event একই multi-location update-এ লেখা হয়; lock claim না থাকলে চূড়ান্ত status transition rules অস্বীকার করে।

Portal-এর denied root-read সমাধানে কোনো public বা `auth != null` broad read যোগ করবেন না।

## Firebase Console-এ হাতে প্রকাশ করার আগে

1. Firebase Console-এ project ID `pathargata-digital-comnity-ltd` এবং সঠিক Realtime Database instance নির্বাচন করুন। Rules editor-এ থাকা বর্তমান **সম্পূর্ণ** rules document export/copy করে backup রাখুন।
2. Emulator regression চালান: `pnpm test:rules`। এতে owner list reads, applicant/operator-এর সীমিত access, pending-only lifecycle, review-lock-এর আগে direct decision denial, competing Admin-এর বিপরীত সিদ্ধান্ত denial, একই সিদ্ধান্ত resume, stale-card revision rejection, legacy pending revision migration, membership/audit atomic update, rejection-এর পর নতুন revision-এ resubmission এবং operator root-list denial যাচাই হয়।
3. Current production rules-এর সঙ্গে `database.rules.json` তুলনা করুন। অন্য app-এর বর্তমান paths/rules হারিয়ে যেতে পারে—এই কারণে শুধু `blood_partner_access` অংশ কপি করবেন না। সম্পূর্ণ document review ও backup ছাড়া rules replace করবেন না।
4. Firebase Console → Realtime Database → Rules-এ repository-র **সম্পূর্ণ** `database.rules.json`-এর content paste করে Rules simulator/validation-এ check করুন; তারপর project owner নিজে Publish করবেন। এই repository/push Firebase-এ কিছু publish করে না।
5. Publish-এর পরে owner account থেকে sign out/in বা ID token refresh করে owner panel-এ pending/member list load হয় কি না যাচাই করুন। Admin আবেদন approve/reject করলে displayed `revisionId`-এর সঙ্গে মিলিয়ে transaction lock বসে; পরে একই সিদ্ধান্তের বাটন দিয়েই retry/resume করা যাবে, আর stale card নতুন আবেদন approve/reject করতে পারবে না। বিপরীত বাটন lock থাকা অবস্থায় নিষ্ক্রিয় থাকবে। তবুও `permission_denied` থাকলে signed-in account-এর refreshed token-এ boolean `admin: true`, web app-এর Firebase project/database URL এবং Console-এ নির্বাচিত project/instance মিলিয়ে দেখুন। Applicant-কে rejection হলে নতুন revision-সহ আবেদন পাঠিয়ে সেটিও যাচাই করুন।

`admin: true` custom claim কেবল trusted project owner process থেকে দিতে হবে। Firebase service-account private key, password বা verification code repository, issue বা chat-এ সংরক্ষণ করবেন না।
