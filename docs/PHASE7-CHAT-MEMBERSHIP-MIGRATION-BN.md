# Phase 7 — Safe Chat Membership Migration

## বর্তমান audit

বর্তমান legacy chat path হলো `chats/{uid1_uid2}`। `uid1` এবং `uid2` lexicographically sort করে chat ID বানানো হয়। কিন্তু RTDB rules-এ participant authorization মূলত `$chatId.contains(auth.uid)`-এর উপর নির্ভর করে। ফলে কোনো UID অন্য participant-এর UID-এর substring হলে collision-এর ঝুঁকি থাকে।

বর্তমানে `chat_members` path নেই। `user_chats/{uid}/{peerUid}` inbox metadata হিসেবে ব্যবহৃত হচ্ছে এবং message send flow-এ client multi-location update দিয়ে নিজের ও peer-এর metadata update করার চেষ্টা করে। এই metadata-কে authoritative membership হিসেবে ব্যবহার করা নিরাপদ নয়।

বর্তমান `user_blocks/{uid}/{peerUid}` block state chat send এবং inbox metadata rules-এ বিবেচনা করা হয়। Message request এবং friend/privacy policy client-side checks-এর মাধ্যমে send flow-এ প্রয়োগ করা হয়; এগুলোকে একা membership authorization হিসেবে ধরা যাবে না।

## প্রস্তাবিত target model

```text
chat_members/{chatId}/{uid}: true
chats/{chatId}/{messageId}: message
user_chats/{uid}/{peerUid}: denormalized inbox summary
```

`chat_members`-এর write client-এর জন্য বন্ধ থাকবে। কেবল trusted Firebase Function/Admin SDK valid relationship যাচাই করে membership provision করবে। `user_chats` summary membership-এর source of truth হবে না।

প্রস্তাবিত exact participant rule:

```text
root.child('chat_members').child($chatId).child(auth.uid).val() === true
```

Block state-ও একই rule-এ যাচাই করতে হবে:

```text
!root.child('user_blocks').child(auth.uid).child($otherUid).exists()
&& !root.child('user_blocks').child($otherUid).child(auth.uid).exists()
```

এখানে `$otherUid` নির্ভরযোগ্যভাবে বের করার জন্য membership record-এ দুই participant-এর canonical metadata রাখা যেতে পারে, অথবা trusted Function-generated chat record-এ `participantA` এবং `participantB` রাখা যেতে পারে। Client-এর supplied participant field কখনো authorization source হবে না।

## নিরাপদ rollout plan

1. Existing valid chats-এর জন্য আগে read-only inventory তৈরি করতে হবে; কোনো data mutation নয়।
2. Valid participant pair যাচাই করতে হবে: canonical chat ID, existing reciprocal `user_chats`, existing messages এবং relationship/block state cross-check করতে হবে।
3. Backup এবং dry-run report user approval-এর জন্য দেখাতে হবে।
4. Trusted Function/Admin SDK দিয়ে `chat_members` provision করতে হবে। Client write permission দেওয়া যাবে না।
5. New conversations-এর জন্য Function-controlled membership creation চালু করতে হবে। Friend acceptance, accepted message request এবং existing valid conversation—এই তিনটি entry point আলাদা করে handle করতে হবে।
6. Rules-এ নতুন `chat_members` exact membership check চালু করতে হবে। এখন repository Rules-এ এই cutover সম্পন্ন; তাই live Rules deploy-এর আগে valid membership backfill বাধ্যতামূলক।
7. Controlled compatibility window-এ legacy chats রাখা যাবে না যদি exact membership না থাকে; unprovisioned chat deny হবে।
8. Legacy `$chatId.contains(auth.uid)` authorization repository Rules থেকে সরানো হয়েছে।

## Required emulator tests

- Valid participant message read/write allowed
- Non-participant read/write denied
- UID substring collision denied
- Client cannot create or modify `chat_members`
- Admin/Function-equivalent trusted context can provision valid membership
- Blocked participant cannot read or write messages
- Pending message request cannot write ordinary messages
- Accepted request can transition to active membership
- `user_chats` summary tampering cannot grant chat access
- Legacy fallback, if temporarily retained, is denied for new unprovisioned chats

## বর্তমান সিদ্ধান্ত

এই phase-এ exact membership enforcement সম্পন্ন: `chats/{chatId}` এবং `message_reports/{chatId}` এখন কেবল `chat_members/{chatId}/{auth.uid} === true` হলে accessible। Client `chat_members` লিখতে পারে না; admin/trusted server provisioning-এর জন্য path reserved। UID substring collision, non-member read/write, metadata-only access এবং client membership tampering-এর negative tests আছে।

Firebase access, backup এবং explicit migration approval ছাড়া `chat_members` backfill, client migration, legacy authorization removal বা live data mutation করা যাবে না। পরবর্তী ধাপে আগে read-only inventory, dry-run report, rollback plan এবং controlled migration window প্রয়োজন।
