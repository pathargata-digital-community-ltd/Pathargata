# Production Deployment Checklist

এই repository-তে live Firebase mutation বা deployment এই checkpoint-এ স্বয়ংক্রিয়ভাবে করা হয়নি। ভুল Firebase project, অসম্পূর্ণ backfill বা missing provider credential-এর কারণে production data ক্ষতিগ্রস্ত না করার জন্য deployment-এর আগে নিচের gate বাধ্যতামূলক।

## Repository preflight — সম্পন্ন

```sh
pnpm validate:firebase
pnpm validate:expo
pnpm validate:android
pnpm test:functions
pnpm test:rules
pnpm check
pnpm test
pnpm lint
```

`pnpm validate:firebase` নিশ্চিত করে যে deploy alias `pathargata-digital-comnity-ltd`, Realtime Database Rules source `database.rules.json`, Functions source `functions/` এবং Node.js 22 runtime একে অপরের সঙ্গে মিলে। এটি কোনো Firebase network call বা production mutation করে না।

## Live deployment-এর আগে প্রয়োজন

1. Firebase CLI-তে authorized session থাকতে হবে এবং target project হিসেবে `pathargata-digital-comnity-ltd` যাচাই করতে হবে।
2. `database.rules.json` deploy করার আগে read-only export, Rules review এবং rollback copy সংরক্ষণ করতে হবে।
3. পুরোনো donor records-এর `donors_public` backfill এবং public post projection backfill আলাদা dry-run plan, backup এবং expected write count দিয়ে অনুমোদিত হতে হবে।
4. `chat_members` migration শেষ না হওয়া পর্যন্ত legacy chat fallback Rules কাটওভার করা যাবে না।
5. Functions deploy করলে FCM/APNs credentials, Cloud Scheduler availability এবং Firebase billing plan যাচাই করতে হবে।
6. Deployment-এর পরে physical Android smoke test, account switch/logout test, public/private post test, complaint/verification submit test এবং push notification test চালাতে হবে।

## Recommended explicit deployment commands

```sh
pnpm exec firebase use pathargata-digital-comnity-ltd
pnpm exec firebase deploy --only database
pnpm exec firebase deploy --only functions
```

উপরের commands live Firebase project পরিবর্তন করবে; explicit release approval এবং authenticated Firebase CLI session ছাড়া এগুলো চালানো উচিত নয়।
