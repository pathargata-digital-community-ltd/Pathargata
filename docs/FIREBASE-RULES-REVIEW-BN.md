# Firebase Realtime Database Rules Review

## Source

এই review-টি user-provided rules attachment-এর উপর ভিত্তি করে তৈরি। Draft rules file: `database.rules.json`। এটি Phase 1-এ version করা হয়েছে; এখনও live Firebase-এ deploy করা হয়নি।

## Immediate positive changes

- Root `.read` এবং `.write` false রাখা হয়েছে।
- `pushTokens/{uid}`-এ authenticated user নিজের subtree-তেই read/write করতে পারবে—এই baseline rule যোগ করা হয়েছে।
- `notifications/{uid}/{notificationId}`-এ like/comment/tag/chat creation-এর actor/recipient relationship এবং recipient-only `read` update rule যোগ করা হয়েছে।
- `market_orders` collection-এ buyer/seller indexed query ছাড়া collection read বন্ধ করা হয়েছে; single order buyer/seller/admin scope-এ সীমিত এবং create/status transition validation যোগ করা হয়েছে।
- Chat message node-এ sender spoofing বন্ধ, existing message payload/status integrity check এবং blocked participant-এর `user_chats` metadata write বন্ধ করা হয়েছে।
- `complaints`-এ owner query/single-read scope, submitter UID validation, owner-only resolved complaint reopen এবং admin-only moderation write যোগ করা হয়েছে।
- `reports/{postId}/{reporterUid}`-এ admin-only read/moderation, existing post check, reporter UID ownership এবং one-report-per-user rule যোগ করা হয়েছে।
- `message_reports`, `user_reports`, `market_reports` এবং `reported_comments`-এ admin-only read/moderation, reporter ownership, target existence এবং duplicate-key protection যোগ করা হয়েছে।
- `emergency_alerts`-এ authenticated feed read বজায় রেখে non-tourist owner-only create, `reported/unverified` initial state এবং admin-only status/verification moderation যোগ করা হয়েছে। Public alert projection থেকে reporter contact, author name, affected count ও GPS coordinates সরিয়ে `emergency_alert_private/{alertId}`-এ owner/admin scope করা হয়েছে; পুরোনো records deploy-এর আগে migrate/sanitize করতে হবে।
- `verification_requests/{uid}`-এ owner/admin scoped read, owner-only pending submission/resubmission, immutable review fields এবং admin-only approval/rejection যোগ করা হয়েছে; profile-এ user-এর জন্য শুধু `none → pending` transition রাখা হয়েছে।
- `blood_requests`-এ requester-owned create/complete/cancel, immutable request core fields, non-owner donor response lifecycle এবং admin moderation যোগ করা হয়েছে; `blood_request_private` contact data requester/admin scope-এ সীমিত করা হয়েছে।
- `trash_bin/{postId}`-এ original post owner বা admin ছাড়া archive write বন্ধ এবং archived payload-এর owner/type/timestamp validation যোগ করা হয়েছে। `story_trash`, `tracking` ও `registered_devices`-এর child-level broad writes/read override সরিয়ে admin-only করা হয়েছে।
- `users/{uid}/total_points` ও `referral_count`-এর arbitrary authenticated writes বন্ধ করা হয়েছে। Signup এখন `referral_events/{referrerUid}/{newUserUid}`-এ owner-bound event লেখে; `processReferralEvent` trusted Admin SDK দিয়ে idempotent counter increment করে।
- Rules repository-তে রাখার আগে JSON validation করা হয়েছে।

## Critical findings before deployment

### 1. `users` read অত্যন্ত broad

`users`-এ `.read: auth != null` থাকায় authenticated client পুরো user profile tree পড়তে পারে। Profile schema-তে phone, email, location এবং social fields থাকতে পারে। Public directory-এর জন্য lightweight `people_index` এবং private profile fields আলাদা করা প্রয়োজন।

### 2. `users/{uid}` পুরো subtree owner লিখতে পারে

বর্তমান rule-এ owner নিজের পুরো profile subtree লিখতে পারে। এতে role, status, accountAccess, verification এবং admin-owned fields client থেকে পরিবর্তনের ঝুঁকি থাকে। Phase 2-তে field allowlist ও immutable server-owned fields যোগ করতে হবে।

### 3. `notifications/{uid}`-এ যেকোনো authenticated user write করতে পারে — remediated in repository rules

প্রথম supplied rules-এ অন্য user-এর notification path-এ arbitrary notification/push তৈরি করা সম্ভব ছিল। Repository rules এখন client creation-এ actor/recipient এবং post/chat relationship যাচাই করে; recipient existing notification-এ কেবল `read` flag পরিবর্তন করতে পারে। Emulator-এ এই behavior-এর tests pass করেছে।

### 4. `registered_devices`, `tracking`, `reports`, `trash_bin`, `story_trash`-এ write খুব broad

কিছু path-এ যেকোনো authenticated user write করতে পারে এবং `registered_devices/{deviceId}`-এ public read আছে। এগুলো owner/admin scope, field validation এবং retention policy দিয়ে সীমিত করতে হবে।

### 5. Marketplace orders পুরো authenticated user-দের read করতে দিচ্ছে

প্রথম supplied rules-এ root `.read: auth != null` থাকায় buyer/seller-এর private order data অন্য authenticated user পড়তে পারত। Repository rules এখন buyer/seller indexed query এবং single-order buyer/seller/admin access enforce করে; order owner, product seller, immutable fields এবং status transition-ও validate করা হচ্ছে। Emulator tests pass করেছে।

### 6. Client-controlled counters ও workflow fields

`total_points`, `referral_count`, likes, comments, voters, repostCount, emergency alert এবং marketplace status-এর write validation যথেষ্ট শক্ত নয়। Numeric validation একা ownership বা increment integrity নিশ্চিত করে না।

### 7. Admin test custom claim-ভিত্তিক নয়

Rules-এ `users/{uid}/role === 'admin'` ব্যবহার হয়েছে। Role data নিজেই যদি owner client update করতে পারে, তাহলে admin escalation সম্ভব হতে পারে। Admin authorization Firebase custom claims বা server-owned immutable field দিয়ে enforce করতে হবে।

## Deployment gate

এই draft সরাসরি deploy করা যাবে না। আগে করতে হবে:

1. Firebase Emulator Suite test matrix।
2. App-এর প্রত্যেক RTDB path-এর owner/reader/writer inventory।
3. Public বনাম private profile field split।
4. Admin custom claim migration/verification।
5. Notification, marketplace, complaint, verification ও media path hardening।
6. Storage rules এবং App Check enforcement review।

বর্তমান repository checkpoint-এ push token, user profile এবং notification path মিলিয়ে ১৪টি Emulator authorization test pass করেছে।

Chat-এর ক্ষেত্রে ৮টি নতুন authorization assertionসহ, complaint path-এর ৪টি, post-report path-এর ৪টি, চারটি additional moderation-report path-এর ৪টি, emergency alert path-এর ৪টি, verification path-এর ৪টি, blood request path-এর ৬টি, operational/admin path-এর ৩টি এবং counter/referral path-এর ১টি testসহ মোট ৫২টি Emulator test pass করেছে। বর্তমান legacy `chats/{uid1_uid2}` key format-এ rules engine-এর string parsing সীমিত; তাই exact participant membership migration (`chat_members/{chatId}/{uid}` বা equivalent) পরবর্তী আলাদা checkpoint-এ করতে হবে। নতুন chat request শুরু করার বৈধ flow এই checkpoint-এ চালু রাখা হয়েছে।

## Safe deployment procedure

```bash
firebase emulators:exec --only database,storage "npm test"
firebase deploy --only database,storage
```

Live deploy কেবল authenticated Firebase maintainer review-এর পর করতে হবে। কোনো service-account private key repository বা chat-এ রাখা যাবে না।
