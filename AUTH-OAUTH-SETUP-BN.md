# Native Auth ও OAuth Setup

Native Auth screen-এ Web App-এর মতো নিচের option যুক্ত আছে:

- Email/password login
- Four-step registration
- Optional profile image selection
- Union ও village
- Date of birth ও gender
- Referral code
- Privacy consent
- Forgot password
- Google login/registration
- Facebook login/registration

## Email/password

Firebase Auth ও Realtime Database সরাসরি ব্যবহার করা হয়েছে। নতুন user-এর profile `users/{uid}` path-এ Web App-এর compatible fields সহ লেখা হয়। Password reset Firebase `sendPasswordResetEmail` ব্যবহার করে।

## Web Google/Facebook login

Web build-এ Firebase `signInWithPopup` ব্যবহার করা হয়। Firebase Console-এ Google ও Facebook provider enabled থাকতে হবে। OAuth sign-in-এর পর নতুন user-এর profile `users/{uid}`-এ তৈরি হয়।

## Native Google login

Native build-এ Expo AuthSession ব্যবহার করা হয়েছে। এই public environment values দিতে হবে:

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```

Android ও iOS client ID Firebase/Google Cloud OAuth configuration-এর সঙ্গে project-compatible হতে হবে। Android/iOS redirect URI এবং package/bundle identifier একই project configuration-এর সঙ্গে মেলাতে হবে।

## Native Facebook login

Native build-এ Facebook OAuth token Firebase `FacebookAuthProvider.credential`-এ exchange করা হয়। এই public environment value দিতে হবে:

```text
EXPO_PUBLIC_FACEBOOK_APP_ID=
```

Facebook Developer Console-এ app-এর platform, OAuth redirect settings এবং Firebase Facebook provider configuration সঠিকভাবে enabled থাকতে হবে।

## Security note

Client ID, App ID এবং Firebase web config public runtime configuration হতে পারে; কিন্তু কোনো client secret, Firebase Admin credential বা server key app bundle-এ রাখা যাবে না।

Configuration না থাকলে Native button বাস্তব credential ছাড়া silently fail না করে স্পষ্টভাবে configuration প্রয়োজন বলে জানাবে।
