# Admin Authorization Contract — বাংলা

## একক policy

Pathargata Admin Panel, Firebase Realtime Database Rules এবং trusted Functions—সব Admin operation-এর জন্য একই Firebase custom claim ব্যবহার করবে:

```json
{
  "admin": true
}
```

শুধু user profile-এর `role` field, email address বা client-side local state Admin permission প্রমাণ করে না।

## পরিবর্তন করা হয়েছে

- `database.rules.json`-এর পুরোনো `auth.token.email === 'admin@gmail.com'` predicate সরিয়ে `auth.token.admin === true` করা হয়েছে।
- `functions/admin-controls.js` এখন একই custom claim যাচাই করে।
- Admin Panel ইতিমধ্যে `getIdTokenResult().claims.admin === true` যাচাই করছিল; এখন Rules ও Functions একই contract অনুসরণ করছে।
- Rules test fixtures এবং Functions unit tests custom claim ব্যবহার করছে।

## Firebase Console/Server-side manual action

এই source change GitHub-এ থাকলেই live Firebase project পরিবর্তন হবে না। Deployment-এর আগে:

1. নির্দিষ্ট Admin account-এর Firebase Auth custom claims-এ `admin: true` দিতে হবে।
2. User profile-এর `role` field পরিবর্তন করলেই claim তৈরি হবে না।
3. Custom claim দেওয়ার পরে Admin account-এ sign out/sign in করতে হবে অথবা ID token refresh করতে হবে।
4. Updated `database.rules.json` Firebase Realtime Database Rules-এ publish করতে হবে।
5. Updated Functions deploy না হওয়া পর্যন্ত sensitive callable operation-কে live production-ready ধরে নেওয়া যাবে না।
6. পুরোনো email-only admin identity দিয়ে Rules/Functions access আর অনুমোদিত নয়।

## নিরাপত্তা যাচাই

Admin claim ছাড়া account-এর জন্য প্রত্যাশা:

- Admin Panel login gate অতিক্রম করতে পারবে না।
- Admin-only RTDB roots পড়তে পারবে না।
- Admin-only write/update করতে পারবে না।
- Super Admin callable চালাতে পারবে না।

Admin claim-সহ account-এর জন্য প্রত্যাশা:

- Admin Panel খুলবে।
- Allowed operational queues পড়তে পারবে।
- Rules অনুযায়ী অনুমোদিত update করতে পারবে।
- Sensitive control-এর জন্য callable approval/audit flow ব্যবহার করবে।

## Rollout সতর্কতা

Live Rules publish করার আগে অন্তত একটি verified Admin account-এ `admin: true` claim আছে কিনা নিশ্চিত করুন। না হলে Admin Panel নিজে খুললেও database reads/writes permission-denied হবে। প্রথম rollout staging/test Firebase project-এ করা উচিত।
