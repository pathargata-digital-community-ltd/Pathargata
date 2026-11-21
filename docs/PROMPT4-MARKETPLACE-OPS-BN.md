# Marketplace Prompt 4 — Operations, Abuse Protection ও Cost Control

## Scope

Marketplace-এর payment method আপাতত শুধু Cash on Delivery এবং দোকান থেকে pickup। কোনো online payment gateway, card token, payment webhook বা payment secret যোগ করা হয়নি। ভবিষ্যৎ payment integration আলাদা approval ও provider review-এর বিষয়।

## Implemented in the latest server-side checkout architecture

`createMarketplaceCheckout` callable-এ privacy-safe daily operational metrics যুক্ত হয়েছে। Checkout success, generic checkout failure, stock conflict, rate-limit rejection, duplicate/idempotency request এবং order creation আলাদা event হিসেবে গণনা হয়। `updateMarketplaceOrderStatus`-এ status transition ও cancellation count হয়। Marketplace notification trigger notification-created এবং notification-failed event count করে। Counters `marketplace_metrics/{UTC-day}/{eventType}`-এ থাকে এবং Admin SDK থেকে লেখা হয়।

Structured log-এ raw UID, phone, address, access token, payment data, product title বা order content রাখা হয় না। Buyer, seller এবং order identifier short SHA-256 hash হিসেবে থাকে; log status allowlist/length bound-এর মধ্যে থাকে। Metrics path client write থেকে বন্ধ এবং admin-only read।

Checkout-এর existing protections অক্ষুণ্ণ আছে: server-side stock transaction, ২৪ ঘণ্টার idempotency claim, প্রতি buyer প্রতি মিনিটে bounded checkout attempt, callable timeout/concurrency limit এবং guarded stock rollback। নতুন metrics failure checkout/order flow ব্যর্থ করে না; observability write আলাদা করে best-effort করা হয়।

## COD/pickup policy

Delivery হলে `cash_on_delivery`, pickup হলে `pay_on_pickup` পাঠানো হয়। Online payment state বা webhook নেই। Order status fulfillment lifecycle; এটিকে payment confirmation হিসেবে গণ্য করা যাবে না। Cash collection বা pickup confirmation seller workflow-এর অংশ।

## Monitoring thresholds

প্রথম সাত দিনের baseline ছাড়া fixed alert threshold production-এ false alarm তৈরি করতে পারে। Baseline তৈরির পর `stock_conflict` বা `checkout_failed` আগের সাত দিনের median-এর তিন গুণ হলে review করা উচিত। `checkout_rate_limited` অস্বাভাবিকভাবে বাড়লে abuse review দরকার। Notification failure/retry backlog ১৫ মিনিট স্থায়ী হলে incident review করা উচিত। Functions timeout/error এবং RTDB read/write usage baseline-এর দ্বিগুণ হলে cost review করা উচিত।

## Kill switch এবং rollback

বর্তমান server checkout-এ `marketplace_controls/checkoutEnabled = false` থাকলে callable নিজেই নতুন checkout reject করে; client bypass করলেও order তৈরি হয় না। Value অনুপস্থিত বা `true` হলে checkout চালু থাকে। এই repository phase-এ live Firebase data-তে কোনো kill-switch value লেখা হয়নি। জরুরি rollback হলে Functions/Rules deployment আগের known-good commit-এ revert করতে হবে, data delete করা যাবে না। Metrics ৩০ দিনের বেশি পুরোনো হলে maintenance job দিয়ে cleanup করা উচিত।

## Known release gates

এই phase-এ live Functions/Rules deploy, production dashboard wiring, physical Android checkout smoke test বা destructive load test করা হয়নি। Deploy-এর আগে authenticated Firebase CLI, backup, dry-run, emulator test, concurrent checkout test এবং explicit release approval লাগবে। Firebase Emulator বা test project-এ load-oriented smoke test production database-এ চালানো যাবে না।
