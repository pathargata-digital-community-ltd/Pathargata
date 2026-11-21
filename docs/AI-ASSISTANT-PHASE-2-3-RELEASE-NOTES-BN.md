# AI Assistant Phase 2 ও Phase 3 — GitHub Release Notes

এই release note নিশ্চিত করছে যে AI Assistant-এর Phase 2 এবং Phase 3 code আলাদা commit হিসেবে GitHub `main` branch-এ সংরক্ষিত ও push করা হয়েছে।

## Phase 2 — Blood service ও order confirmation

**Commit:** `929da4e Add AI blood request and order confirmation`

**GitHub status:** `origin/main`-এ pushed

### Included

- AI থেকে blood request intent হলে direct write না করে confirmation popup
- Blood group, hospital, area, units, urgency, needed time এবং contact form
- Server-side Bangladesh mobile validation
- Active duplicate blood request guard
- Idempotency claim
- Public `blood_requests` এবং private `blood_request_private` atomic write
- Contact, patient এবং hospital data public projection থেকে আলাদা রাখা
- Seller-এর pending marketplace order-এর জন্য confirmation popup
- Server-side seller ownership check
- শুধুমাত্র `pending → accepted` transition
- Transaction-based race protection
- Idempotent duplicate accept handling
- Buyer notification-এর জন্য existing `notifyMarketplaceOrder` trigger

### Main files

- `app/ai-assistant.tsx`
- `lib/ai-assistant.ts`
- `functions/ai-assistant.js`
- `functions/index.js`
- `functions/test/ai-assistant.cjs`
- `functions/README.md`
- `docs/PRODUCTION-REMEDIATION-ROADMAP-BN.md`

## Phase 3 — In-app directory search ও safe data fetching

**Commit:** `65f6682 Improve AI directory search and data fetching`

**GitHub status:** `origin/main`-এ pushed

### Included

- Bengali natural-language directory query matching
- Fire service, hospital, doctor, police, ambulance, union এবং agriculture category aliases
- “ফায়ার সার্ভিসের নম্বর দাও” ধরনের query থেকে generic শব্দ বাদ দিয়ে useful matching
- Directory name-term ranking
- Category-specific bounded read: সর্বোচ্চ ২০টি row
- Cross-category bounded read: প্রতি category সর্বোচ্চ ৮টি row
- AI context result cap: সর্বোচ্চ ১২টি card
- Allowlisted public fields only
- `email`, `chat_uid`, `ownerUid` এবং unknown/private fields বাদ দেওয়া
- Public phone এবং map action বজায় রাখা
- Bounded-fetch এবং Bengali ranking regression tests

### Main files

- `functions/ai-assistant.js`
- `functions/test/ai-assistant.cjs`
- `functions/README.md`
- `docs/PRODUCTION-REMEDIATION-ROADMAP-BN.md`

## Validation status

Phase 2 এবং Phase 3 শেষ করার সময় validation ফলাফল:

- TypeScript check: passed
- JavaScript syntax check: passed
- App tests: ১৬৫ passed, ১ skipped
- Functions tests: ২৮ passed
- Directory privacy filtering test: passed
- Bounded directory fetch test: passed
- `git diff --check`: passed

## Current GitHub history

```text
2c632dd Document Firebase AI deployment prompt
65f6682 Improve AI directory search and data fetching
929da4e Add AI blood request and order confirmation
8b36a84 Add read-only AI assistant phase one
```

## Deployment note

Code GitHub-এ push করা হলেও Firebase Cloud Functions live deployment এবং `PATHARGATA_AI_API_KEY` Secret Manager configuration এখনো করা হয়নি। এগুলোর জন্য Firebase account authorization এবং secure AI secret value প্রয়োজন। Deployment instructions এখানে আছে:

- `docs/FIREBASE-AI-DEPLOYMENT-PROMPT-BN.md`

এই release note code deploy করেছে বলে দাবি করে না; এটি শুধু Phase 2 ও Phase 3 source-code commit এবং validation status নথিভুক্ত করে।
