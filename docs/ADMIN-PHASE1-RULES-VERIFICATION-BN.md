# Admin Panel Phase 1 — Firebase Rules Verification

তারিখ: ১৪ নভেম্বর ২০২৬

## সম্পন্ন পরিবর্তন

`market_orders` root collection এখন `auth.token.admin === true` custom claim থাকা Admin-এর জন্য পড়া যাবে। Buyer এবং seller-এর filtered query আগের মতোই নিজের order-এ সীমাবদ্ধ আছে। সাধারণ user অন্য user-এর order পড়তে বা update করতে পারে না।

Admin order update-এ workflow fields ব্যবহার করা যাবে, কিন্তু `productId`, `sellerUid`, `buyerUid`, `quantity`, `time`, `productTitle`, `productPrice`, `sellerName`, `buyerName`, `buyerPhone` এবং `buyerAddress` পরিবর্তন করা যাবে না। Status/fulfillment-এর allowed values এবং status consistency Rules validation-এ বহাল আছে।

`super_admin_audit` record একবার তৈরি হওয়ার পরে update বা delete করা যায় না। Audit read শুধু `superAdmin` custom claim-এর জন্য খোলা আছে।

## Automated verification

Firebase Realtime Database emulator-এ নিচের চারটি suite চালানো হয়েছে:

- `market-orders.test.ts`
- `operational-hardening.test.ts`
- `admin-operational-paths.test.ts`
- `stories.test.ts`

ফলাফল: **৪টি test file, ৩২টি test pass**। Emulator warning-গুলো প্রত্যাশিত `assertFails` permission-denied case; এগুলো test failure নয়। Production data ব্যবহার করা হয়নি।

## Firebase Console-এ manual publish

Firebase Console খুলে এই ক্রম অনুসরণ করুন:

1. সঠিক Firebase project নির্বাচন করুন।
2. **Build → Realtime Database → Rules** খুলুন।
3. Repository থেকে `Pathargata-Native-App/database.rules.json` ফাইলের সম্পূর্ণ JSON content কপি করুন।
4. Rules editor-এর পুরোনো content সম্পূর্ণ replace করে নতুন content paste করুন।
5. Editor-এর validation/error indicator সবুজ হয়েছে কিনা দেখুন।
6. **Publish** চাপুন।
7. Publish-এর পরে Rules simulator বা test account দিয়ে নিশ্চিত করুন:
   - Admin custom claim থাকা account `market_orders` root পড়তে পারে।
   - Admin workflow status update করতে পারে।
   - Admin `buyerUid`, `sellerUid`, `productId`, `quantity` পরিবর্তন করতে পারে না।
   - সাধারণ user অন্য user-এর order পড়তে পারে না।
   - `super_admin_audit` record edit/delete করা যায় না।

## গুরুত্বপূর্ণ Admin identity requirement

শুধু RTDB-তে `users/{uid}/role = "admin"` লিখে Admin permission পাওয়া যাবে না। বর্তমান production Rules branch-এ কিছু legacy operational path configured `admin@gmail.com` Firebase Auth email ব্যবহার করে এবং `market_orders`-এর নতুন Admin path `admin: true` custom claim অথবা configured admin email—দুটির যেকোনো একটি গ্রহণ করে। তাই Admin Panel ও Rules একই Firebase project/configuration ব্যবহার করছে কিনা নিশ্চিত করুন। Custom claim পরিবর্তনের পরে account-এ sign out/sign in অথবা ID token refresh প্রয়োজন হতে পারে।

## Deployment সতর্কতা

Rules publish করার আগে Firebase Console-এ বর্তমান Rules-এর একটি copy সংরক্ষণ করুন। Production data দিয়ে destructive test করবেন না। Rules deploy-এর পরে Admin Panel order list load না হলে প্রথমে custom claim refresh, Firebase project selection এবং Admin Panel-এর Firebase config একই project-এর কিনা যাচাই করুন।
