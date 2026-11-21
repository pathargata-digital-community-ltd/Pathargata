# Pathargata Native App — সম্পন্ন Feature Prompt

তুমি Pathargata Digital Native App-এর বর্তমান source code নিয়ে কাজ করবে। Web App repository-কে source of truth হিসেবে বিবেচনা করবে, কিন্তু Web App-এর কোনো file পরিবর্তন করবে না। Native App হলো Expo SDK 57, React Native, TypeScript, Expo Router, NativeWind এবং Firebase Realtime Database/Storage ভিত্তিক। নিচের feature ও functionality ইতিমধ্যে Native App-এ যুক্ত হয়েছে এবং এগুলো preserve করে পরবর্তী development করতে হবে।

## App identity ও build configuration

- App display name: `পাথরঘাটা ডিজিটাল`
- সর্বশেষ Android package name: `com.pathargata.digital.ltd`
- Firebase project: `pathargata-digital-comnity-ltd`
- User-provided `google-services.json` অপরিবর্তিতভাবে ব্যবহার করতে হবে।
- Android configuration-এ `googleServicesFile: ./google-services.json` যুক্ত আছে।
- EAS Android APK/AAB build profiles বিদ্যমান।
- Web App repository অপরিবর্তিত রাখতে হবে।

## Authentication ও access control

- Email/password login
- Multi-step registration
- Union ও village নির্বাচন
- Forgot password
- Google/Facebook authentication flow-এর native structure
- OAuth callback route
- AuthGate দিয়ে protected app routes
- Login না করলে login, registration ও forgot-password screen ছাড়া private pages দেখা যাবে না

## Home dashboard ও realtime feed

- Firebase Realtime Database থেকে live community feed
- Root listener ভিত্তিক feed loading
- Image rendering
- Pagination ও load-more
- Pull-to-refresh
- উপজেলা, ইউনিয়ন ও গ্রাম filter
- Notice card
- Emergency alert card
- Feed source status: live/cache/offline
- Post detail navigation
- Inline comment ও nested comment navigation
- Like interaction
- Notification badge
- Quick service shortcuts

## Post advanced actions

- Post save/bookmark: `users/{uid}/saved_posts/{postId}`
- Post repost
- Post notification mute/unmute: `users/{uid}/muted_posts/{postId}`
- Post report: `reports/{postId}/{uid}`
- Home feed card-এ action menu
- Like ও comment notification

## Social ও People

- People list
- User search
- Global search
- User profile navigation
- Friend request পাঠানো
- Incoming request accept/reject
- Friend request cancel
- Unfriend
- Friend list ও friend preview
- অন্য user profile
- Profile lock/privacy অনুযায়ী তথ্য দেখানো
- Direct chat shortcut

## Messaging

- Firebase realtime chat
- Chat list
- Chat search
- Typing indicator
- Read status
- Image attachment
- Voice message recording/upload
- Firebase Storage media upload
- Chat participant navigation

## Profile

- Profile picture upload
- Name, nickname, profession, address, village, bio edit
- Facebook, WhatsApp ও Website links
- Post count
- Friend count
- Join date
- Friends preview
- Profile lock
- Mobile/email privacy
- Social links clickable
- Settings navigation
- Logout

## Settings

- Profile edit shortcut
- Password reset
- Contact privacy
- Online status
- Tag permission: সবাই/বন্ধুরা/কেউ না
- App notification toggle
- Blood/emergency alert toggle
- Market alert toggle
- Message sound toggle
- Like/comment alert toggle
- Data saver mode
- Font size: ছোট/স্বাভাবিক/বড়
- Cache clear
- Account deletion request
- Logout

## Services ও live Firebase data

### Directory

- ইউএনও অফিস
- ভূমি অফিস
- থানা পুলিশ
- হাসপাতাল
- বিদ্যুৎ
- ফায়ার সার্ভিস
- ডাক্তার
- অ্যাম্বুলেন্স
- ইউনিয়ন পরিষদ
- কৃষি সহায়তা
- Live Firebase directory data
- Search/filter
- Doctor specialty/chamber/hospital/days/time
- Chamber open/closed status
- Phone call
- WhatsApp
- Google Maps
- Website link
- Directory bookmark/save using AsyncStorage

### Blood Service

- Live donor list
- Blood group filter
- Donor eligibility calculation
- Donor registration/update/remove
- Emergency blood request
- Donor notification
- Request list
- Phone contact

### Transport

- Rent-a-car data
- Bus data
- Transport banners
- Phone ও website action
- Live Firebase data

### Education

- শিক্ষা প্রতিষ্ঠান
- গৃহশিক্ষক
- শিক্ষা নোটিশ
- Search
- Phone action
- Live Firebase data

### Tourism

- Live tourism data
- Image/details
- Search/filter
- Website/ticket action

### Marketplace

- Live shops
- Live products
- Product image
- Product search
- Shop search
- Favorites
- Product details
- Order form
- Orders data
- Seller/shop phone action

### Complaints

- Complaint submission
- Complaint type
- Department/submit-to
- Details
- Location
- Evidence image upload
- User complaint history
- Firebase complaint record

### Emergency

- Live emergency alert list
- Alert submission
- Contact action

### External government services

- জন্ম নিবন্ধন → `https://bdris.gov.bd/`
- TIN Certificate → `https://secure.incometax.gov.bd/TINHome`
- Board Result → `https://eboardresults.com/v2/home`
- Agriculture category-এর live Firebase dynamic data
- Generic dynamic services data path: `services/data/{category}`
- Remote service categories: `services/categories`

## Profile Verification

- Verification category selection:
  - পাবলিক ফিগার
  - কন্টেন্ট ক্রিয়েটর
  - সাংবাদিক
  - ভেরিফাইড ব্যবসা
  - ভেরিফাইড প্রোফাইল
- Firebase থেকে verification plans load
- Starter/Pro/Yearly fallback plans
- Payment method input
- Payment number
- Transaction ID
- NID number
- NID/document image upload
- User photo upload
- `verification_requests/{uid}`-এ pending application
- `users/{uid}/verificationStatus = pending`
- Pending status UI
- Admin approval bypass করা যাবে না

## Invite ও Referral

- Referral count load
- Native share sheet
- Referral code share
- Reward/points system আপাতত UI-তে বন্ধ রাখা হয়েছে

## আপাতত যোগ করা যাবে না

ব্যবহারকারীর নির্দেশ অনুযায়ী নিচের featureগুলো এখন যোগ করা হবে না:

- Story Notes
- Photo Contest
- Monetization
- Points/Rewards
- FIFA Match Module
- Chatbot/Bot

## পরবর্তী development backlog

নিচের Web App functionগুলো ভবিষ্যৎ batch-এ parity-এর জন্য যোগ করতে হবে:

- Poll create ও poll vote
- Post edit/delete/hide
- Voice post recording
- Post location, feeling ও user tagging
- Copy post link/text
- Directory rating/review
- Directory suggested edit
- Saved posts-এর আলাদা তালিকা
- Blocked users management
- Chat archive, unsend, delete-for-me, block ও reply
- Account saved-login management
- Admin feedback/missing query submission
- App version/update checker
- Privacy policy ও terms live links

## Development rules

1. Web App repository কখনো modify করবে না।
2. সব service data Firebase Realtime Database থেকে live/realtime আনবে।
3. Firebase path ও existing schema অযথা পরিবর্তন করবে না।
4. User-facing UI Bengali, premium এবং native mobile style হবে।
5. Payment বা admin approval bypass করবে না।
6. প্রতিটি batch শেষে `pnpm check`, সংশ্লিষ্ট ESLint এবং `expo export --platform web` চালাতে হবে।
7. Validation সফল হলে Native App repository-এর `main` branch-এ commit ও push করতে হবে।
8. APK build-এর জন্য EAS configuration অক্ষত রাখতে হবে।
