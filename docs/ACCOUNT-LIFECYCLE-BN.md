# Account Lifecycle Policy

## বর্তমান policy

User নিজের account থেকে:

- **Deactivate** করতে পারবে।
- **Delete request** করলে account তাৎক্ষণিকভাবে public use-এর বাইরে গিয়ে deactivated হবে।
- Deactivation-এর পর **৩০ দিনের grace period** থাকবে।
- Grace period-এর মধ্যে trusted reactivation flow দিয়ে account ফেরত আনা যাবে।
- ৩০ দিন পার হলে private account data purge এবং Firebase Auth identity deletion-এর জন্য eligible হবে।

Deactivated account-এর profile public people index থেকে সরানো হবে, people suggestion ও friend-list view-তে দেখানো হবে না, এবং তার authored posts feed eligibility থেকে বাদ যাবে। Account-এর data grace period চলাকালে সংরক্ষিত থাকবে, যাতে reactivation করলে account পুনরুদ্ধার করা যায়।

Client এখন `status: deactivated`, `deactivated_at` এবং `deletion_due_at` লিখে lifecycle request তৈরি করে। Rules timestamp fields-এর basic type/deadline validation করে।

## গুরুত্বপূর্ণ সীমা

- এই phase-এ automatic destructive purge Function deploy করা হয়নি।
- `functions/account-lifecycle.js` কেবল deadline calculation, eligibility এবং fixed private purge manifest তৈরি করে।
- Permanent purge-এর লক্ষ্য হবে profile, authored posts, stories, comments, reports, marketplace/service records, notification/token data, private media references এবং Firebase Auth identity—সব account-owned data। Shared chat/audit/legal-retention records-এর exact deletion policy worker deploy-এর আগে আলাদা করে নির্ধারণ করতে হবে।
- Firebase Auth deletion এবং private path deletion একই idempotent worker-এর মাধ্যমে controlled deployment-এ করতে হবে।
- Live data migration, bulk deletion, Firebase Functions deploy এবং billing change করা হয়নি।
- Firebase Spark/free-only mode-এর জন্য scheduled Cloud Functions এবং automatic purge রাখা হবে না। Expired-account audit manual/local script দিয়ে করা যাবে।

## Reactivation requirement

৩০ দিনের মধ্যে reactivation-এর জন্য:

1. User-কে authenticated session ও recent re-authentication দিতে হবে।
2. `deletion_due_at > now` যাচাই করতে হবে।
3. Trusted server/function অথবা separately reviewed Rules transition দিয়ে status `user` করতে হবে।
4. `deactivated_at` এবং `deletion_due_at` clear করতে হবে।
5. `people_index` projection পুনরায় তৈরি করতে হবে।
6. Lifecycle request idempotently `reactivate` হিসেবে record করতে হবে।

## Purge worker deployment gate

Worker deploy করার আগে অবশ্যই:

- due-account query bounded/indexed করতে হবে।
- dry-run manifest এবং expected account count review করতে হবে।
- private path backup/checksum বা retention policy নির্ধারণ করতে হবে।
- public content retain/anonymize/delete policy লিখিত approval পেতে হবে।
- Auth deletion failure ও partial RTDB purge-এর retry/rollback behavior test করতে হবে।
- emulator integration test এবং staging dry-run pass করতে হবে।
- Automatic purge চালু করতে Cloud Functions/Cloud Scheduler ও billing প্রয়োজন হতে পারে; free-only release-এ এটি intentionally disabled থাকবে।
