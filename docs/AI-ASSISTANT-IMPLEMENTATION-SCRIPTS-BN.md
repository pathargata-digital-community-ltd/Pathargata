# Pathargata AI Assistant — তিন ধাপের Implementation Scripts

এই document-এ Pathargata Digital Native App-এর AI Assistant তৈরি করার জন্য তিনটি reusable implementation script দেওয়া হলো। ভবিষ্যতে যে ধাপটি চালু করতে হবে, সেই ধাপের script সম্পূর্ণভাবে Manus-কে দিলে সরাসরি কাজ শুরু করা যাবে।

AI Assistant-এর shortcut Home screen-এর existing shortcut area-তে থাকবে। Shortcut-এর নাম হবে **AI সহকারী** এবং icon হবে `sparkles-outline` বা সমজাতীয় AI icon।

---

## স্থায়ী product rules — তিন ধাপেই প্রযোজ্য

1. AI Assistant React Native/Expo app-এর Home screen shortcut থেকে খোলা যাবে।
2. AI API key কখনো mobile app bundle-এর ভিতরে রাখা যাবে না। AI request authenticated Firebase Cloud Function বা secure backend দিয়ে যাবে।
3. AI-কে raw Firebase tree, পুরো `users`, `market_orders`, `directory` বা notification data দেওয়া যাবে না। প্রয়োজন অনুযায়ী server-side bounded tool ব্যবহার করতে হবে।
4. প্রতিটি private query-তে Firebase Auth UID দিয়ে ownership যাচাই করতে হবে। AI-এর কথায় UID বা permission bypass করা যাবে না।
5. Public data, current user-এর own data এবং sensitive/private data আলাদা access scope-এ রাখতে হবে।
6. AI কোনো write action নিজে থেকে final করবে না। Blood request, message send, complaint submit, order accept/cancel এবং profile/security পরিবর্তনের আগে confirmation UI বাধ্যতামূলক।
7. সব write action backend validation, authorization, idempotency এবং audit logging-এর মধ্য দিয়ে যেতে হবে।
8. AI কোনো medical diagnosis, guaranteed blood availability, financial guarantee বা আইনগত নিশ্চয়তা দেবে না। প্রয়োজন হলে verified human/admin contact দেখাবে।
9. Bengali-first UX রাখতে হবে। User বাংলা, বাংলা-ইংরেজি মিশ্রণ বা সহজ ইংরেজিতে প্রশ্ন করতে পারবে।
10. AI ভুল বুঝলে অনুমান না করে clarification চাইবে। Sensitive information না পেলে action submit করা যাবে না।
11. AI response-এর পাশাপাশি structured UI card/form/action button ব্যবহার করতে হবে। শুধু বড় text response দেওয়া যাবে না।
12. প্রতিটি phase শেষে TypeScript check, relevant tests, Firebase Rules/Functions validation, `git diff --check`, documentation update এবং GitHub `main` push করতে হবে।

---

# SCRIPT 1 — Read-only AI Assistant ও Home Shortcut

## Manus-কে দেওয়ার জন্য সম্পূর্ণ নির্দেশনা

Pathargata Digital Native App-এ প্রথম ধাপের AI Assistant বাস্তবায়ন করো। এই ধাপে কোনো destructive বা write action চালু করবে না। AI শুধুমাত্র authenticated read-only assistant হিসেবে কাজ করবে এবং Home screen-এর shortcut area থেকে খোলা যাবে।

### ১. শুরু করার আগে audit করো

- বর্তমান Home screen-এর shortcut area খুঁজে বের করো।
- Existing shortcut design, spacing, icon, color এবং navigation pattern অনুসরণ করো।
- Home screen-এ একটি নতুন shortcut যোগ করো: **AI সহকারী**।
- Shortcut চাপলে নতুন `/ai-assistant` route খুলবে।
- Existing route, auth gate, theme, safe navigation এবং session fencing-এর সঙ্গে সামঞ্জস্য রাখো।
- Current Firebase initialization, Cloud Functions structure, RTDB rules এবং notification architecture পর্যালোচনা করো।
- Built-in LLM বা configured secure model ব্যবহার করার আগে live model catalog দেখে latency, tool calling, structured output এবং cost অনুযায়ী উপযুক্ত model নির্বাচন করো। Model ID hardcode করার আগে catalog থেকে যাচাই করো।

### ২. AI Assistant screen তৈরি করো

একটি professional Bengali-first chat screen তৈরি করো যেখানে থাকবে:

- Header: “AI সহকারী”
- সংক্ষিপ্ত subtitle: “অ্যাপের তথ্য খুঁজুন এবং সেবা ব্যবহার করুন”
- Chat message list
- User এবং assistant message আলাদা visual style
- Loading/typing indicator
- Error state এবং retry button
- Clear conversation action
- Text input এবং send button
- Quick prompt chips:
  - “ডিরেক্টরি খুঁজুন”
  - “আমার অর্ডার দেখুন”
  - “রক্ত সেবা খুলুন”
  - “কৃষি সহায়তা”
  - “অভিযোগ কেন্দ্র খুলুন”
- Empty state-এ ৪–৬টি sample prompt
- Keyboard-safe layout এবং low-end Android-friendly rendering

### ৩. Read-only tools তৈরি করো

AI-কে সরাসরি Firebase access না দিয়ে secure backend tools তৈরি করো। প্রয়োজন অনুযায়ী naming পরিবর্তন করা যাবে, কিন্তু permission boundary বজায় রাখতে হবে:

- `searchPublicDirectory(query, category, locality)`
- `getPublicServiceInfo(serviceId)`
- `searchMarketplaceProducts(query, category, locality, limit, cursor)`
- `getOwnMarketplaceOrders(uid, status, limit, cursor)`
- `getOwnNotifications(uid, filter, limit, cursor)`
- `getOwnProfileSummary(uid)`
- `getAppHelp(topic)`
- `openAppRoute(route, params)`

প্রতিটি tool-এ:

- authenticated caller যাচাই করবে
- public এবং private data আলাদা রাখবে
- bounded limit ব্যবহার করবে
- cursor/pagination রাখবে যেখানে প্রয়োজন
- sensitive fields বাদ দেবে
- raw database error client-এ পাঠাবে না
- structured JSON result ফেরত দেবে

### ৪. AI response contract তৈরি করো

AI response text-এর পাশাপাশি structured result থাকবে:

```ts
{
  text: string;
  intent: "answer" | "search_result" | "navigation" | "clarification" | "error";
  cards?: Array<{
    type: "directory" | "product" | "order" | "notification" | "service";
    data: Record<string, unknown>;
  }>;
  actions?: Array<{
    id: string;
    label: string;
    kind: "open_route" | "call" | "map" | "retry";
    payload?: Record<string, string>;
  }>;
}
```

Structured output ব্যবহার করলে model capability আগে যাচাই করবে। JSON parse failure হলে safe fallback text দেখাবে; কখনো malformed response দিয়ে app crash করা যাবে না।

### ৫. Read-only intent-এর উদাহরণ

এই প্রশ্নগুলোর সঠিক ফল দিতে হবে:

- “পাথরঘাটায় হাসপাতালের তথ্য দেখাও”
- “ফায়ার সার্ভিসের ফোন নম্বর আছে?”
- “আমার pending order কয়টা?”
- “আমার latest order কোন অবস্থায়?”
- “বাজারে মরিচ পাওয়া যায়?”
- “notification দেখাও”
- “কৃষি সেবা খুলে দাও”
- “password change screen খুলে দাও”

AI public directory result-এ verified status, source/update time এবং `ফোন করুন`/`ম্যাপে দেখুন` action দেখাবে। Private query-তে কেবল current user-এর own data দেখাবে।

### ৬. এই ধাপে নিষিদ্ধ

- Blood request submit করা যাবে না
- Marketplace order accept/cancel করা যাবে না
- Buyer বা seller-কে message পাঠানো যাবে না
- Complaint submit করা যাবে না
- Profile/password/security settings পরিবর্তন করা যাবে না
- অন্য user-এর private phone, address, order বা profile data দেখানো যাবে না
- AI-কে Firebase Admin credentials mobile app-এ দেওয়া যাবে না

### ৭. Validation ও delivery

- `pnpm check`
- relevant app tests
- backend/Functions unit tests
- Firebase Rules tests যদি নতুন path যোগ হয়
- malformed AI response test
- unauthorized own-data access test
- Home shortcut navigation test
- loading/error/offline state test
- `git diff --check`
- Bengali documentation update
- GitHub `main` branch-এ commit ও push

শেষে আমাকে জানাবে:

- কোন files পরিবর্তন হয়েছে
- কোন secure tools তৈরি হয়েছে
- কোন model ও কেন ব্যবহার করা হয়েছে
- কী কী read-only query test করা হয়েছে
- কোন action ইচ্ছাকৃতভাবে Phase 2-এর জন্য রাখা হয়েছে

---

# SCRIPT 2 — Structured Action Assistant: Blood, Directory, Agriculture ও Marketplace Draft

## Manus-কে দেওয়ার জন্য সম্পূর্ণ নির্দেশনা

Phase 1-এর read-only AI Assistant-এর উপর ভিত্তি করে দ্বিতীয় ধাপ বাস্তবায়ন করো। এই ধাপে AI structured form, result card এবং action draft দেখাবে। কোনো high-impact action user confirmation ছাড়া submit করা যাবে না। Phase 1-এর permission model, Home shortcut এবং chat UI অক্ষুণ্ণ রাখো।

### ১. Blood request flow

User যদি বলে:

- “আমার B+ রক্ত দরকার”
- “আমার ভাইয়ের জন্য রক্ত লাগবে”
- “রক্তের request পাঠাতে চাই”

AI intent হিসেবে `blood_request_draft` তৈরি করবে এবং Blood Request bottom sheet/modal খুলবে। Form-এ থাকবে:

- রক্তের গ্রুপ
- হাসপাতাল/স্থান
- প্রয়োজনের সময় ও তারিখ
- কত bag/unit
- জরুরি মাত্রা
- প্রয়োজনীয় সংক্ষিপ্ত details

Missing field থাকলে AI clarification চাইবে। Form incomplete অবস্থায় submit button disabled থাকবে।

Submit করার আগে confirmation screen দেখাবে:

```text
আপনার রক্তের অনুরোধ পাঠানো হবে
রক্তের গ্রুপ: ...
স্থান: ...
সময়: ...
পরিমাণ: ...

[বাতিল] [অনুরোধ পাঠান]
```

শুধু confirmation-এর পরে backend `createBloodRequest` tool call হবে। Backend আবার:

- current auth UID যাচাই করবে
- input schema validate করবে
- phone/contact privacy policy মানবে
- duplicate active request আছে কিনা দেখবে
- idempotency key ব্যবহার করবে
- success হলে request ID ফেরত দেবে

AI কখনো donor phone বা medical sensitive information public করবে না। “রক্ত নিশ্চিত পাওয়া যাবে” বলবে না।

### ২. Directory action cards

Directory search result card-এ যুক্ত করো:

- `ফোন করুন`
- `ম্যাপে দেখুন`
- `বিস্তারিত খুলুন`
- verified/unverified label
- last updated/source information

Phone বা map action app-side user tap-এর মাধ্যমে হবে। AI silently call করবে না।

### ৩. Agriculture assistant draft

কৃষি সেবার জন্য AI-তে structured flow যোগ করো:

- ফসলের নাম
- জমির এলাকা/ইউনিয়ন
- বপন/রোপণের তারিখ
- সমস্যার category
- চাইলে crop image upload-এর entry point

AI প্রথম version-এ শুধুমাত্র verified agriculture content দেখাবে। Pesticide dosage বা medical-style certainty দেবে না। Unknown বা high-risk case হলে কৃষি কর্মকর্তার contact card দেখাবে।

Quick actions:

- “আমার ফসল যোগ করুন”
- “আজকের কৃষি কাজ দেখুন”
- “রোগ-পোকার guide দেখুন”
- “কৃষি কর্মকর্তার নম্বর দেখুন”

### ৪. Marketplace product ও order draft

Buyer বলতে পারবে:

- “এই product সম্পর্কে seller-কে জিজ্ঞেস করতে চাই”
- “আমার order-এর delivery জানতে চাই”

AI product/order context ব্যবহার করে message draft তৈরি করবে, কিন্তু সরাসরি পাঠাবে না:

```text
Seller-কে পাঠানোর প্রস্তাবিত message:
“আসসালামু আলাইকুম, আমার অর্ডারটি কবে পাঠানো হবে জানালে উপকার হয়।”

[সম্পাদনা] [বাতিল] [পাঠানোর জন্য প্রস্তুত করুন]
```

এই ধাপে message final send Phase 3-এর জন্য রাখা যাবে; চাইলে draft conversation screen-এ prefill করে user-কে manual send করতে দেওয়া যাবে।

Seller-এর জন্য pending order card দেখাবে:

- product title
- quantity
- buyer name-এর privacy-safe version
- delivery method
- payment method
- order time
- `Order details খুলুন`

এই ধাপে AI order accept করবে না; শুধু order details screen খুলবে এবং Phase 3 confirmation action-এর প্রস্তুতি রাখবে।

### ৫. Structured action protocol

প্রতিটি action response-এ এই ধরনের payload ব্যবহার করো:

```ts
{
  type: "action_required";
  action: "create_blood_request" | "draft_message" | "open_directory" | "open_agriculture";
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
  missingFields?: string[];
}
```

Client কখনো model-এর text দেখে নিজে write করবে না। শুধুমাত্র allowlisted `action` এবং validated payload ব্যবহার করবে।

### ৬. Duplicate request ও abuse protection

- Form submit button loading অবস্থায় disabled
- Idempotency key ছাড়া write request গ্রহণ নয়
- Same blood request-এর rapid duplicate detect করবে
- AI prompt rate limit থাকবে
- Message draft size limit থাকবে
- Upload size/type validation থাকবে
- Tool timeout হলে safe retry বা error state দেখাবে
- Retry করলে duplicate write হবে না

### ৭. Validation ও delivery

Test করতে হবে:

- incomplete blood request
- complete blood request confirmation
- duplicate blood submit
- unauthorized order draft access
- buyer অন্য seller-এর order দেখতে না পারে
- directory call/map action payload
- malformed structured response
- agriculture high-risk question fallback
- offline/timeout state
- Home shortcut থেকে end-to-end navigation

তারপর `pnpm check`, relevant tests, Rules/Functions tests, diff check, documentation update এবং GitHub `main` push করবে।

শেষে report করবে:

- কোন structured forms তৈরি হয়েছে
- কোন actions draft-only এবং কোনগুলো confirmed
- duplicate protection কীভাবে কাজ করছে
- কোন personal information intentionally hidden রাখা হয়েছে

---

# SCRIPT 3 — Confirmed Actions, Marketplace Conversation ও Production Hardening

## Manus-কে দেওয়ার জন্য সম্পূর্ণ নির্দেশনা

Phase 1 এবং Phase 2 সম্পূর্ণ ও validated ধরে তৃতীয় ধাপ বাস্তবায়ন করো। এখন AI Assistant user confirmation নেওয়ার পরে সীমিত allowlisted write action সম্পন্ন করতে পারবে। Production security, privacy, cost, audit এবং failure recovery সর্বোচ্চ অগ্রাধিকার পাবে।

### ১. Confirmed blood request submission

`submitBloodRequest` secure backend tool তৈরি বা সম্পূর্ণ করো। Requirements:

- Firebase Auth token থেকে UID নেবে; client-supplied UID trust করবে না
- blood request schema validate করবে
- user active session যাচাই করবে
- duplicate active request block করবে
- idempotency key ব্যবহার করবে
- server timestamp ব্যবহার করবে
- status default `awaiting_donor_response` বা current app schema অনুযায়ী হবে
- success হলে request ID, tracking ID এবং safe confirmation text ফেরত দেবে
- notification policy অনুযায়ী donor/admin notification তৈরি করবে
- sensitive details public projection-এ লিখবে না
- failure হলে partial write rollback বা safe error handling করবে

AI response:

```text
আপনার রক্তের অনুরোধ সফলভাবে পাঠানো হয়েছে।
Tracking ID: ...
রক্ত পাওয়ার নিশ্চয়তা নয়; হাসপাতাল/চিকিৎসকের সঙ্গে যোগাযোগ রাখুন।
```

### ২. Seller order accept action

শুধুমাত্র seller নিজের order-এর ক্ষেত্রে `acceptMarketplaceOrder` tool call করতে পারবে। Backend অবশ্যই যাচাই করবে:

- authenticated UID === order.sellerUid
- order বর্তমানে `pending`
- allowed transition `pending → accepted`
- product/order ownership ঠিক আছে
- idempotency key ঠিক আছে
- status history server-side append হবে
- buyer notification তৈরি হবে
- duplicate accept safe হবে

AI flow:

1. User pending order নির্বাচন করবে
2. AI order summary দেখাবে
3. Confirmation modal দেখাবে
4. User `অর্ডার গ্রহণ করুন` চাপবে
5. Backend transaction/update চালাবে
6. UI নতুন status দেখাবে

AI seller-এর হয়ে buyer-কে এমন কোনো promise করবে না যা order data-তে নেই।

### ৩. Buyer-seller conversation assistant

Buyer বা seller product/order-specific conversation শুরু করতে পারবে। Requirements:

- conversation-এর membership server-side verify করতে হবে
- buyer কেবল নিজের order-এর seller-এর সঙ্গে কথা বলতে পারবে
- seller কেবল নিজের order-এর buyer-এর সঙ্গে কথা বলতে পারবে
- exact UID membership ব্যবহার করতে হবে; substring বা loose matching নয়
- AI message draft তৈরি করবে
- message send-এর আগে user confirmation বাধ্যতামূলক
- AI-generated message visually label করা যেতে পারে: “AI draft”
- user edit করতে পারবে
- final send user action ছাড়া হবে না
- raw phone/address AI prompt context-এ অপ্রয়োজনীয়ভাবে পাঠানো যাবে না

Tool:

```text
createOrderMessageDraft(orderId, intent)
sendConfirmedOrderMessage(orderId, conversationId, text, idempotencyKey)
```

AI seller/buyer impersonation, negotiation fraud, false delivery claim বা payment confirmation করতে পারবে না।

### ৪. Confirmation এবং UI safety

প্রতিটি write action-এর আগে reusable `ActionConfirmationCard` তৈরি করো। এতে থাকবে:

- action title
- exact target
- affected data
- warning/irreversible note
- Cancel button
- Confirm button
- loading state
- success/failure state

User confirmation না পাওয়া পর্যন্ত backend write tool call করা যাবে না। Android back button, modal close এবং network retry-এর ক্ষেত্রে duplicate action হতে পারবে না।

### ৫. Tool authorization matrix

এই matrix code/documentation-এ স্পষ্টভাবে রাখো:

| Action | Public user | Auth user | Owner only | Confirmation |
|---|---:|---:|---:|---:|
| Public directory search | Yes | Yes | No | No |
| Own order status | No | Yes | Own orders | No |
| Blood request draft | Yes | Yes | No | No |
| Blood request submit | No | Yes | Own request | Yes |
| Seller order accept | No | Yes | Seller only | Yes |
| Buyer/seller message send | No | Yes | Conversation member | Yes |
| Complaint submit | No | Yes | Own complaint | Yes |
| Password/security change | No | Yes | Own account | Yes |
| Other user private data | No | No | No | Deny |

Backend permission matrix client-side UI-এর উপর নির্ভর করবে না।

### ৬. Privacy ও prompt minimization

AI context builder তৈরি করো যা কেবল প্রয়োজনীয় fields পাঠাবে:

- directory query হলে public name/category/address/verified status
- order query হলে current user-owned order summary
- message draft হলে product title/status; unnecessary phone/address নয়
- blood flow হলে user-entered request fields; unrelated profile data নয়

Prompt injection বা user instruction দিয়ে system rules override করার চেষ্টা reject করতে হবে। AI-কে কখনো security rules, secrets, API keys বা অন্য user data প্রকাশ করতে দেওয়া যাবে না।

### ৭. Cost, limits ও observability

Production hardening যোগ করো:

- per-user requests per minute/day limit
- per-request token/output limit
- tool timeout
- max tool calls per turn
- repeated failed action cooldown
- cacheable public search result
- usage metrics: request count, latency, error rate, tool success rate
- privacy-safe audit log: raw prompt বা sensitive data নয়
- model failure হলে deterministic fallback message
- provider 429/5xx হলে retry/backoff ও user-friendly error
- AI feature remotely disable করার kill switch

### ৮. Security tests

অবশ্যই regression test লিখে চালাতে হবে:

- user A user B-এর order দেখতে না পারে
- buyer seller নয় এমন order accept করতে না পারে
- seller buyer-এর private data অন্য user-কে দিতে না পারে
- non-member conversation-এ message পাঠাতে না পারে
- duplicate blood request submit না হয়
- duplicate order accept idempotent থাকে
- confirmation ছাড়া কোনো write tool call না হয়
- malformed model output safeভাবে reject হয়
- prompt injection data boundary ভাঙতে না পারে
- signed-in user sign-out করলে old AI session data দেখা না যায়
- account switch-এর পরে old user context purge হয়

### ৯. Physical device এবং release validation

Android physical device-এ পরীক্ষা করতে হবে:

- Home shortcut open
- Bengali typing
- keyboard এবং scroll behavior
- slow network
- offline recovery
- blood request confirmation
- order acceptance
- message draft/send confirmation
- app background/foreground
- notification deep link
- account switch
- terminated app reopen

EAS production build বা release candidate-এ evidence রাখতে হবে। Sensitive test data ব্যবহার করা যাবে না।

### ১০. Final delivery requirements

- All code committed and pushed to GitHub `main`
- Functions deploy commands documentation-এ update
- RTDB Rules update ও manual Firebase deploy note
- AI tool contract documentation
- Bengali user-facing copy review
- `pnpm check`
- app tests
- Functions tests
- Firebase Rules emulator tests
- `git diff --check`
- release validation checklist

শেষ report-এ স্পষ্টভাবে জানাবে:

1. কোন AI tools production-ready
2. কোন actions confirmation-protected
3. কোন data AI দেখতে পারে না
4. model/provider cost controls কী
5. Firebase Functions ও Rules deploy হয়েছে কি না
6. physical-device test কোনগুলো পাস করেছে
7. কোনো known limitation থাকলে তা কী

---

## ভবিষ্যতে Manus-কে দেওয়ার সংক্ষিপ্ত ব্যবহারবিধি

- AI Assistant শুরু করতে: **SCRIPT 1 সম্পূর্ণভাবে দাও**
- Blood form, agriculture flow ও marketplace draft যোগ করতে: **SCRIPT 2 সম্পূর্ণভাবে দাও**
- Confirmed action, seller order acceptance ও buyer-seller conversation চালু করতে: **SCRIPT 3 সম্পূর্ণভাবে দাও**
- Phase 2 শুরু করার আগে Phase 1-এর commit hash এবং test status উল্লেখ করো।
- Phase 3 শুরু করার আগে Phase 1 ও Phase 2-এর commit hash, deployed Functions status এবং Rules test status উল্লেখ করো।
- কোনো phase-এর কাজ আংশিক থাকলে পরের phase শুরু না করে আগে incomplete কাজের তালিকা ও risk report তৈরি করতে হবে।
