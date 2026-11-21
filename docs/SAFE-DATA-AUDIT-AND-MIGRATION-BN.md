# Safe Data Audit ও Migration Preparation

এই document-এর tooling কেবল local JSON export নিয়ে **dry-run report** তৈরি করে। এটি Firebase-এ login করে না, Admin SDK ব্যবহার করে না, network access করে না এবং কোনো database write চালায় না।

## People index audit

প্রথমে Firebase Console থেকে read-only JSON export তৈরি করতে হবে। Export file কখনো repository-তে commit করা যাবে না। তারপর local machine-এ চালাতে হবে:

```bash
node scripts/production-audit.mjs \
  --mode people-index \
  --input /secure/path/users-export.json \
  --sample-size 5
```

Report-এ থাকবে:

- source user count
- expected `people_index/{uid}` projection write count
- deleted-user projection delete count
- invalid projection count
- private field detection
- সীমিত sample projection

Projection source হলো `functions/public-user-index.js`। `email`, `phone`, `password`, NID, payment, document বা token field projection-এ গেলে report fail করবে। Report review না করে কোনো backfill চালানো যাবে না।

## Chat membership audit

Read-only export-এ canonical `chats`, reciprocal `user_chats` এবং optional `user_blocks` paths থাকলে চালাতে হবে:

```bash
node scripts/production-audit.mjs \
  --mode chat-membership \
  --input /secure/path/chat-export.json \
  --sample-size 10
```

Valid chat-এর জন্য এই শর্তগুলো যাচাই হয়:

- `chatId` দুইটি আলাদা UID-এর canonical sorted pair
- message sender participant pair-এর মধ্যে
- দুই দিকের `user_chats` metadata আছে
- participant pair blocked নয়

Report কেবল planned paths দেখায়:

```text
chat_members/{chatId}/{uid} = true
```

এগুলো এখনো write করা হয় না।

## Public post projection backfill

`posts` এবং optional existing `public_posts`-এর read-only JSON export থেকে deterministic backfill plan তৈরি করতে হবে:

```bash
node scripts/prepare-public-post-backfill.mjs \
  /secure/path/rtdb-export.json \
  /secure/path/public-post-backfill.plan.json
```

এই planner:

- কেবল `privacy: "public"` বা `privacy: "everyone"` post projection করে
- `friends` এবং `only_me` post কখনো `public_posts`-এ নেয় না
- source/export-এর SHA-256 checksum সংরক্ষণ করে
- expected projection count এবং complete projection ID list দেয়
- existing projection-এর জন্য rollback value তৈরি করে
- Firebase-এ login করে না এবং কোনো write চালায় না

Plan review, immutable export backup এবং expected count approval ছাড়া কোনো live backfill চালানো যাবে না। Stale projection delete করার জন্য আলাদা reviewed manifest প্রয়োজন; planner নিজে source post বা existing projection delete করে না।

## Required approval gates

কোনো backfill বা membership provisioning-এর আগে অবশ্যই:

1. Original export immutable backup হিসেবে সংরক্ষণ করতে হবে।
2. SHA-256 checksum এবং export timestamp লিখে রাখতে হবে।
3. Dry-run report review করতে হবে।
4. Expected write/delete count অনুমোদন করতে হবে।
5. Rollback plan প্রস্তুত করতে হবে।
6. Staging/emulator-এ rules test চালাতে হবে।
7. Controlled maintenance window এবং monitoring ঠিক করতে হবে।
8. User-এর explicit confirmation নিতে হবে।

## Rollback plan

- `people_index` backfill হলে original `people_index` export backup source of truth হবে; only changed projection paths restore করা যাবে।
- `chat_members` provisioning হলে newly added membership paths-এর manifest রাখা হবে; rollback-এ শুধু এই manifest-এর paths remove করা যাবে। Legacy `chats` বা `user_chats` data delete করা যাবে না।
- কোনো rollback operation-এর আগে dry-run এবং exact affected path list তৈরি করতে হবে।
- Live migration, bulk write এবং destructive delete এই repository phase-এ করা হয়নি।
- Public post backfill planner-ও কেবল plan তৈরি করে; live `public_posts` write এখনো করা হয়নি।
