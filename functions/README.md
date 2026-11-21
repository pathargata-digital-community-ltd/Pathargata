# Firebase notification backend and Expo Push

The backend now handles five notification jobs:

- `sendPushNotification` listens for creation of `notifications/{uid}/{notificationId}`, reads at most 500 registered Expo tokens using a bounded key query, and sends a lock-screen/status-bar push. It skips descendant updates, self-authored records, and explicitly pending/unsent records. A durable `pushDispatchQueue` entry is written for retryable 429/5xx failures; dispatch state preserves successful token keys for idempotent retry.
- `retryPushNotificationQueue` runs every minute with one instance, a 100-item batch and a 45-second budget. It claims queue entries with a lease, applies exponential backoff, separates retryable/permanent failures, records delivery metrics, and moves exhausted or malformed entries to `maintenanceDeadLetters`.
- `processExpoPushReceipts` checks at most 1,000 due Expo push receipts every 15 minutes using the `createdAt` index. Each item has an attempt counter, lease, backoff deadline and five-attempt dead-letter guard; the worker has a 45-second processing budget, rethrows retryable Expo failures, and records backlog/oldest-item/checkpoint metrics under `maintenanceState/expoPushReceipts`.
- `sendPushNotification` writes a flat `notificationExpiryQueue` entry for each sent notification. `cleanupExpiredNotifications` runs hourly and processes at most 500 due queue entries, claiming each item with a lease before deleting the notification and queue entry. Failed items receive bounded backoff/retry and malformed or repeatedly failing entries move to `maintenanceDeadLetters`; the worker has a 45-second budget, retry configuration, and backlog/checkpoint metrics. It no longer scans the complete `notifications` tree.
- `indexTrashForExpiry` materializes each new `trash_bin/{uid}/{postId}` record into the server-only `trashExpiryQueue`. `cleanupExpiredTrash` reads at most 500 expired queue entries per run and removes each queue item and corresponding trash record in one multi-location update; it no longer scans the complete `trash_bin` tree.
- `notifyMarketplaceOrder` listens to `market_orders/{orderId}` changes and creates deterministic seller/buyer in-app notifications for new orders and fulfillment status changes. It uses the Admin SDK so a buyer cannot forge a notification for a seller; the seller action itself remains protected by the Realtime Database order transition rules.
- `createMarketplaceCheckout` is the only order-creation path for the Native App. It takes the authenticated UID from the callable context, validates bounded checkout input, reads the latest product/shop/seller data, calculates the server price snapshot, transactionally reserves stock, writes server-generated order IDs plus a shared `orderGroupId`, and rolls back earlier reservations if a later item or atomic order write fails. A user-scoped 24-hour idempotency record prevents duplicate orders and stock decrements on network retry; checkout is rate-limited to 10 new requests per minute per user. Direct client creation under `market_orders` is denied by Rules.

The Native App requests notification permission after sign-in, creates the Android `default` channel, obtains an Expo push token using the EAS project ID, and registers it at `pushTokens/{uid}/{encodedToken}`. Tokens are kept outside public user-profile records. Logging out removes that device's token on a best-effort basis. Tapping a push marks its in-app record read and routes to its post, chat, blood request, or notification list where applicable.

## Phase 1 AI Assistant

`aiAssistant` is an authenticated, read-only callable Function. It builds bounded context from public directory rows, recent marketplace products, the signed-in user's own orders, and the signed-in user's own notifications; it never exposes raw Firebase trees to the model and it does not perform write actions. The Native App exposes it through the Home screen `AI সহকারী` shortcut and `/ai-assistant`. Directory phone/map actions and allowlisted navigation remain explicit user taps.

Before deploying the AI Function, configure an OpenAI-compatible provider in Firebase Functions environment parameters. Keep the API key in Secret Manager; never put it in the Expo bundle:

```sh
firebase functions:secrets:set PATHARGATA_AI_API_KEY
firebase deploy --only functions:aiAssistant
```

`PATHARGATA_AI_API_BASE` defaults to `https://api.openai.com/v1` and `PATHARGATA_AI_MODEL` defaults to `gpt-4o-mini`; change these deployment parameters only after checking that the selected provider supports JSON-object responses. Provider failures fall back to bounded search cards instead of exposing raw errors. Phase 1 did not submit blood requests or accept orders; Phase 2 adds only the two explicit confirmation flows documented below.

### Phase 2 confirmed actions

The AI screen now supports two explicit, user-confirmed workflows:

- `createBloodRequest` validates the blood group, Bangladesh mobile number, hospital, area, units and urgency server-side, writes public/private records atomically, blocks an active duplicate request, and uses an idempotency claim for safe retries. Contact, patient and hospital details stay under `blood_request_private`.
- `acceptMarketplaceOrder` reads the order server-side, verifies that the caller is the seller, permits only a `pending → accepted` transition, uses a transaction to prevent races, and uses an idempotency claim. The existing `notifyMarketplaceOrder` trigger then sends the buyer notification.

The AI does not submit either action from natural language alone. It first returns a form/confirmation popup, and the callable Function performs the final authorization and validation. Deploy the new callables together with the assistant:

```sh
firebase deploy --only functions:aiAssistant,functions:createBloodRequest,functions:acceptMarketplaceOrder,functions:notifyMarketplaceOrder
```

### Phase 3 directory search and data fetching

The assistant's directory context is read-only and bounded. A category-specific question reads at most 20 rows from the relevant `directory/{category}` path. A cross-category question reads at most 8 rows per known category and the final context is capped at 12 cards. Bengali request words such as “নম্বর”, “ফোন”, “ঠিকানা” and “দাও” are removed before matching, category aliases are recognized, and useful name terms are ranked instead of requiring the entire sentence to exist in one directory row.

Only the allowlisted public directory fields are returned to the AI context. Private identifiers and account fields such as `email`, `chat_uid`, `ownerUid` and arbitrary unknown fields are excluded. The client reuses the existing phone and map actions, so the AI never needs a write permission for directory search.

The public People/Search index is opt-in. A profile is projected to `people_index` only when `users/{uid}/settings/profileVisibility` is exactly `everyone`; the app default is `none`. After deploying this change, run the one-time backfill with Firebase Admin credentials to remove stale index records and preserve only explicit opt-ins:

```sh
cd functions
npm run backfill:people-index-visibility
```

Do not run the backfill with a user credential; it requires a service account/Application Default Credentials with Realtime Database access.

## Required external credentials and database access

No service-account private key or APNs key is stored in this repository. Before pushes can reach devices, configure provider credentials in the EAS project:

- **Android:** configure Firebase Cloud Messaging HTTP v1 and upload the matching FCM v1 service-account JSON to EAS credentials. The existing `google-services.json` identifies the Android Firebase app; it does not replace the server-side FCM v1 credential.
- **iOS:** add a valid APNs authentication key to EAS credentials. Apple push credentials require an Apple Developer account.

The Realtime Database rules must permit an authenticated user to read/write only their own `pushTokens/{uid}` subtree. Merge the following access condition into the existing rules; do not replace the project's complete database rules with this fragment:

```json
{
  "rules": {
    "pushTokens": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

## Build and deploy

The app config already contains the EAS project ID and the `expo-notifications` config plugin. Because native notification configuration changed, create and install a new development/production build; an over-the-air JS update or Expo Go is not a substitute for the configured native app binary.

After FCM/APNs credentials and database rules are configured, deploy from the repository root with an authenticated Firebase CLI session:

```sh
firebase deploy --only functions:sendPushNotification,functions:retryPushNotificationQueue,functions:processExpoPushReceipts,functions:cleanupExpiredNotifications,functions:indexTrashForExpiry,functions:cleanupExpiredTrash,functions:notifyMarketplaceOrder,functions:createMarketplaceCheckout,functions:aiAssistant,functions:createBloodRequest,functions:acceptMarketplaceOrder
```

A function is not active until deployment succeeds. Scheduled functions use Cloud Scheduler and may incur charges; deployment also requires the Cloud Scheduler API and a Firebase plan that supports scheduled functions. The receipt checker and five-day cleanup are scheduled server-side; notification creation triggers push sending immediately. The expiry queue applies automatically to new notifications; existing historical notifications need a one-time administrative backfill before they can be removed by the queue-based cleanup.

Before live deployment, run the Database Rules emulator suite and a callable smoke test with a non-production/test product dataset. Do not use a production buyer, real order, or production stock for destructive/concurrency testing. The callable deployment and Rules deployment must be treated as one release gate because old app builds that still write directly to `market_orders` will receive a permission error rather than bypass server stock validation.

For a first end-to-end test, install the new build on a physical Android/iOS device, sign in, grant notification permission, and create a fresh notification for that account. Existing historical notifications are not backfilled as pushes.
