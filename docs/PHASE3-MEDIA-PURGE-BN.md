# Phase 3 — Secure Media Deletion ও Account Purge

এই ধাপে Admin Panel-এর destructive deletion browser-side direct Firebase/Cloudinary operation থেকে সরিয়ে trusted Firebase Callable Functions-এ নেওয়া হয়েছে।

## নতুন callable

- `purgeUserAccount({ uid, reason })`
  - শুধু `admin: true` custom claim গ্রহণ করে।
  - সংশ্লিষ্ট profile, posts, stories, complaints, verification, marketplace-owned records, devices, trash records এবং private account paths খুঁজে নেয়।
  - রেকর্ড মুছে ফেলার আগে Cloudinary URL থেকে public ID বের করে signed server-side destroy request পাঠায়।
  - Cloudinary deletion ব্যর্থ হলে Firebase record/Auth account মুছে না—এটি fail-safe আচরণ।
  - সফল হলে Firebase Auth account-ও মুছে দেয় এবং `purge_audit` record লেখে।

- `purgeTrashPost({ uid, postId })`
  - Trash Bin-এর নির্দিষ্ট post-এর সব nested Cloudinary media signed ভাবে মুছে দিয়ে তারপর trash record সরায়।

## Secret সেটআপ

Firebase Functions deploy করার আগে project-এ secrets দিতে হবে:

```bash
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
firebase deploy --only functions:purgeUserAccount,functions:purgeTrashPost
```

Cloudinary API secret কখনো Admin Panel HTML, Native App bundle, বা GitHub-এ রাখা যাবে না। বর্তমানে upload unsigned থাকতে পারে; deletion signed server-side হবে।

## Admin Panel পরিবর্তন

Upzila Admin Panel এখন সরাসরি `remove/update` করে account purge বা Cloudinary deletion করে না। Firebase Functions deploy না থাকলে UI স্পষ্ট error দেখাবে এবং কোনো Firebase record মুছে ফেলবে না। Trash restore এখন nested `trash_bin/{uid}/{postId}` path ব্যবহার করে।

## যাচাই

```bash
cd functions
npm test
node --check media-purge.js
```

Production deploy-এর পরে একটি test account ও test Cloudinary asset দিয়ে প্রথমে purge পরীক্ষা করতে হবে। সফল না হওয়া পর্যন্ত real user account delete করা যাবে না।
