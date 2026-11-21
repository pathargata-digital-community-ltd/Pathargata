# Firebase Cloud Functions ও AI Secret Deployment Prompt

এই prompt ভবিষ্যতে Pathargata Digital Native App repository-তে Firebase Cloud Functions এবং AI Assistant production deployment করার জন্য ব্যবহার করুন। Prompt দেওয়ার পর agent যেন সরাসরি repository preflight, Firebase authentication status, secret configuration এবং deployment শুরু করে।

## Reusable prompt

```text
Pathargata Digital Native App-এর Firebase backend production-এ deploy করো।

Repository:
/home/ubuntu/Pathargata-Native-App

Firebase project:
pathargata-digital-comnity-ltd

এই repository-তে AI Assistant-এর Phase 1, Phase 2 এবং Phase 3 code ইতিমধ্যে GitHub main branch-এ আছে। সর্বশেষ relevant commit হলো:
- Phase 1: 8b36a84
- Phase 2: 929da4e
- Phase 3: 65f6682

কাজের নিয়ম:

1. প্রথমে repository root-এ গিয়ে git status, current branch, origin/main এবং সর্বশেষ commit যাচাই করো। Working tree-তে অপ্রত্যাশিত পরিবর্তন থাকলে deployment থামিয়ে জানাও।

2. Firebase CLI authentication যাচাই করো:
   pnpm exec firebase projects:list --json

   Authentication না থাকলে Firebase login flow শুরু করো। User-এর কাছ থেকে Firebase authorization code ছাড়া কোনো credential অনুমান বা তৈরি করো না।

3. Firebase project নিশ্চিত করো:
   pathargata-digital-comnity-ltd

4. Secret metadata যাচাই করো:
   pnpm exec firebase functions:secrets:get PATHARGATA_AI_API_KEY --project pathargata-digital-comnity-ltd --json

   Firebase CLI-তে `functions:secrets:list` command নেই; নির্দিষ্ট secret-এর value না দেখিয়ে metadata পেতে `functions:secrets:get` ব্যবহার করো। Secret Manager/Cloud Functions-এর জন্য project-এ Blaze billing plan প্রয়োজন হতে পারে। Firebase billing upgrade বা খরচ শুরু করার আগে user-এর স্পষ্ট অনুমতি নাও; plan prerequisite পূরণ না হলে deploy থামাও।

5. PATHARGATA_AI_API_KEY secret না থাকলে user-কে secure Firebase secret value দিতে বলো। Secret কখনো:
   - GitHub-এ commit করবে না
   - app bundle বা Expo environment-এ রাখবে না
   - terminal output-এ print করবে না
   - chat response-এ দেখাবে না

   User অনুমোদন দিলে প্রয়োজন হলে চালাও:
   firebase functions:secrets:set PATHARGATA_AI_API_KEY --project pathargata-digital-comnity-ltd

6. Deployment-এর আগে preflight চালাও:
   AI availability control `admin_settings/ai_assistant` path ব্যবহার করে। Record না থাকলে বা `enabled` ঠিক `true` না হলে callable request বন্ধ করবে; admin panel-এ শুধু Firebase `admin: true` custom-claim account এই মান পরিবর্তন করতে পারবে। নতুন callable deploy হওয়ার পরেই এই server-side control কার্যকর হবে।

   node --check functions/index.js
   node --check functions/ai-assistant.js
   pnpm test:functions
   pnpm validate:firebase
   pnpm check
   git diff --check

   যেকোনো test বা validation ব্যর্থ হলে deployment করো না; error report করো।

7. নিচের Functions deploy করো:
   firebase deploy --only functions:aiAssistant,functions:createBloodRequest,functions:acceptMarketplaceOrder,functions:notifyMarketplaceOrder --project pathargata-digital-comnity-ltd

   Firebase predeploy hook-এর tests pass করতে হবে। Deploy-এর সময় কোনো destructive database migration, rules replacement অথবা unrelated function পরিবর্তন করবে না।

8. Deployment শেষে live function status যাচাই করো:
   firebase functions:list --project pathargata-digital-comnity-ltd

   aiAssistant, createBloodRequest, acceptMarketplaceOrder এবং notifyMarketplaceOrder-এর region us-central1 কি না নিশ্চিত করো।

9. Authorized authenticated app user দিয়ে smoke test করো:
   - Admin panel-এ AI বন্ধ করে callable call করলে AI বন্ধের Bengali বার্তা আসে কি না
   - Admin panel-এ AI চালু করলে, configured Secret/API এবং deployed callable দিয়ে AI কাজ করে কি না
   - AI Assistant-এ “ফায়ার সার্ভিসের নম্বর দাও” লিখে directory result card আসে কি না
   - “আমার রক্ত দরকার” লিখলে blood request popup আসে কি না
   - Seller account দিয়ে pending order confirmation popup আসে কি না
   - Buyer account notification পায় কি না

   User authentication বা production data না থাকলে smoke test বানিয়ে সফল বলে দাবি করবে না; শুধু pending বলবে।

10. Endpoint error হলে Firebase logs দেখো:
    firebase functions:log --only aiAssistant,createBloodRequest,acceptMarketplaceOrder --project pathargata-digital-comnity-ltd

    API key, auth token বা private user data log বা report করবে না।

11. Client error handling যাচাই করো। `functions/not-found`, `functions/unauthenticated`, `functions/permission-denied`, `functions/internal`, `functions/unavailable`, timeout ও network failure-কে পৃথক safe Bengali বার্তায় দেখাও; শুধু network failure-এ connection পরীক্ষা বলতে পারো। Raw backend/provider error দেখাবে না। এই code change করলে tests চালিয়ে documentation update করে GitHub main-এ push করো।

12. শেষে report-এ স্পষ্টভাবে লিখো:
    - কোন Functions deploy হয়েছে
    - কোন region-এ deploy হয়েছে
    - secret configured কি না; secret value কখনো লিখবে না
    - smoke test pass/pending কোনটি
    - Firebase project এবং commit SHA
    - কোনো live database rules/data migration করা হয়েছে কি না

Firebase deploy সফল না হলে deployment সফল হয়েছে বলে জানাবে না।
```

## এই repository-র বর্তমান অবস্থা

AI Assistant-এর code ও documentation GitHub `main` branch-এ push করা আছে। সর্বশেষ commit:

```text
65f6682 Improve AI directory search and data fetching
```

Phase 2-এর blood request এবং order confirmation callable-এর জন্য `929da4e` commit-এ code আছে। Phase 3 directory search ও bounded public data fetching-এর জন্য `65f6682` commit-এ code আছে।

Firebase Cloud Functions live deployment এবং `PATHARGATA_AI_API_KEY` Secret Manager configuration এখনো সম্পন্ন হয়নি। তাই deployment prompt ব্যবহার করার সময় Firebase account authorization এবং secret value-এর জন্য user action প্রয়োজন হবে।

Deployment-এর আগে Firebase project-এ Cloud Functions/Secret Manager-এর billing prerequisite যাচাই করো। Free/Spark plan-এ Secret Manager metadata বা Functions deploy block হলে সেটি code/auth error নয়; user billing upgrade স্পষ্টভাবে অনুমোদন না করা পর্যন্ত কোনো upgrade বা deploy করো না। AI Assistant UI Firebase Functions error-কে আর generic internet failure হিসেবে দেখায় না।

## গুরুত্বপূর্ণ নিরাপত্তা নোট

`PATHARGATA_AI_API_KEY` কখনো repository, `.env`, Expo public runtime config, mobile bundle, screenshot, log বা chat message-এ রাখা যাবে না। Secret শুধু Firebase Functions Secret Manager-এ থাকবে এবং `aiAssistant` function-এর `secrets: [AI_API_KEY]` configuration দিয়ে runtime-এ ব্যবহার হবে।
