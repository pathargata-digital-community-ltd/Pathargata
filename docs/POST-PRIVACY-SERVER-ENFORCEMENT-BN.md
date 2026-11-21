# Post Privacy Server-Side Enforcement

## বর্তমান অবস্থা

Post-এর `privacy` field (`public`, `friends`, `only_me`) app-এর UI এবং feed filter-এ ব্যবহার করা হয়। কিন্তু `database.rules.json`-এ `posts` root authenticated users-এর জন্য readable। ফলে UI সাধারণ ব্যবহারকারীর privacy মানলেও, সরাসরি Realtime Database query করলে restricted post data পড়ার সম্ভাবনা থাকে। এটি production-এর জন্য P0 privacy gap।

## কেন সরাসরি Rules পরিবর্তন করা যাবে না

শুধু `posts/$postId`-এ read rule বসিয়ে দিলেই হবে না। RTDB parent path-এ broad `.read` থাকলে child-level restriction কার্যকর হবে না। আবার root read সরিয়ে দিলে community feed-এর existing timestamp query, public profile query, saved post fetch এবং notification enrichment ভেঙে যাবে। RTDB rules query result filter করে না। তাই read path migration ছাড়া root read বন্ধ করা নিরাপদ নয়।

## Free-tier-compatible লক্ষ্য architecture

### 1. Public projection

`public_posts/{postId}`-এ শুধু `public` post-এর প্রয়োজনীয় display fields থাকবে। Community feed এই path query করবে। `friends` এবং `only_me` post এখানে থাকবে না।

### 2. Owner post index

`user_post_index/{uid}/{postId}`-এ post ID এবং timestamp থাকবে। এটি ইতিমধ্যে profile pagination-এর জন্য যোগ করা হয়েছে। Owner এই index পড়তে পারবে; অন্য user পারবে না।

### 3. Per-post restricted read

মূল `posts/{postId}` path-এ read authorization হবে:

- post owner: সব privacy level
- `public`: authenticated user
- `friends`: author-এর accepted friend
- `only_me`: owner ছাড়া কেউ নয়

এটি কার্যকর করতে `posts` root broad read সরাতে হবে এবং root-level feed query সম্পূর্ণভাবে `public_posts`-এ সরাতে হবে।

### 4. Client-side free-tier projection write

Firebase Spark/free-only deploymentে scheduled বা event-driven Cloud Function-এর উপর নির্ভর না করে post create/update/delete flow-এ owner-controlled projection write করা হবে। Rules projection-এর owner, privacy এবং source post consistency যাচাই করবে। এটি trusted server transformation-এর পূর্ণ বিকল্প নয়; তাই projection payload যতটা সম্ভব ছোট এবং immutable রাখা হবে।

## Rollout ধাপ

### Phase A — completed/preparation

- Public profile UI privacy filter ঠিক করা হয়েছে। `only_me` post friend বা stranger-এর profile-এ আর দেখানো হবে না।
- Profile own-post pagination-এর জন্য owner-scoped index যোগ করা হয়েছে।
- Existing post-এর জন্য bounded legacy fallback রাখা হয়েছে।
- কোনো live data migration বা deploy করা হয়নি।

### Phase B — next implementation

1. `public_posts` projection schema এবং Rules emulator tests যোগ করা। **সম্পন্ন।**
2. Compose create flow-এ public post-এর minimal projection লেখা। **সম্পন্ন।**
3. Edit/delete flow-এ projection consistency বজায় রাখা। **সম্পন্ন।**
4. Exported posts JSON থেকে public projection তৈরির local dry-run tool যোগ করা। **সম্পন্ন।**
5. Community feed-এ dual-read compatibility layer যোগ করা: নতুন projection থাকলে সেটি, migration window-এ controlled fallback।
6. Public profile-এর public post query projection-এ নেওয়া।
7. Saved post এবং post detail-এর privacy-aware per-ID read যোগ করা।

### Phase C — read-path cutover

1. Feed, public profile এবং directory-like post surfaces-এর broad `posts` reads সরানো।
2. Rules-এ root `posts` read বন্ধ করে per-post authorization চালু করা।
3. Friends-only profile read-এর জন্য owner index + per-ID fetch ব্যবহার করা।
4. Rules emulator-এ outsider, friend, owner, unauthenticated এবং deactivated-account negative tests চালানো।
5. Read-only audit, expected projection count এবং rollback plan ছাড়া live backfill নয়।

## Rollback strategy

- প্রথমে existing `posts` data অক্ষত থাকবে।
- Projection path আলাদা থাকবে; projection ভুল হলে source post delete বা modify হবে না।
- Feature flag দিয়ে নতুন projection read বন্ধ করে পুরনো UI fallback চালু করা যাবে, যতক্ষণ root read Rules পরিবর্তন করা হয়নি।
- Root read restriction শেষ ধাপে, সম্পূর্ণ test এবং explicit release approval-এর পরে করা হবে।

## গুরুত্বপূর্ণ সীমাবদ্ধতা

- Cloud Functions deploy করা হবে না; বর্তমান free-only policy বজায় থাকবে।
- Client-written projection-কে Rules দিয়ে source post-এর সঙ্গে পুরোপুরি cryptographically trusted করা যায় না। তাই final production hardening-এ paid/trusted backend অথবা carefully constrained schema বিবেচনা করতে হবে।
- এই document তৈরির মাধ্যমে কোনো Firebase data mutation, migration, deploy, billing change বা production read-rule cutover করা হয়নি।

## Release gate

Server-side privacy phase complete বলা যাবে কেবল যখন:

- root `posts` broad read বন্ধ,
- public feed projection-এ চলছে,
- owner/friend/only-me Rules tests pass,
- public profile direct-link bypass বন্ধ,
- saved post এবং post detail privacy checks pass,
- rollback এবং migration evidence versioned,
- এবং কোনো unresolved P0 privacy issue নেই।
