# Pathargata Native App — Android APK Build

এই repository-তে `eas.json` যুক্ত করা হয়েছে। এটি Expo EAS Build ব্যবহার করে installable Android APK এবং Play Store-এর জন্য AAB তৈরি করতে পারবে।

## ১. প্রয়োজনীয়তা

- Node.js ইনস্টল থাকতে হবে
- একটি Expo account থাকতে হবে: https://expo.dev/signup
- GitHub থেকে `Pathargata-Native-App` repository clone করতে হবে
- Terminal-এ project folder-এ যেতে হবে

```bash
git clone https://github.com/pathargata-digital-community-ltd/Pathargata-Native-App.git
cd Pathargata-Native-App
pnpm install
```

`pnpm` না থাকলে:

```bash
npm install -g pnpm
```

## ২. Expo/EAS login

```bash
npx eas-cli@latest login
```

Browser খুললে নিজের Expo account দিয়ে login করবে।

## ৩. প্রথমবার project configure

```bash
npx eas-cli@latest build:configure
```

যদি Android application identifier চাই, এটি ব্যবহার করবে:

```text
space.manus.pathargataapp.t234601128680804
```

EAS project তৈরি করার অনুমতি চাইলে `Yes` দেবে। Existing `app.config.ts`-এর package identifier পরিবর্তন করবে না।

## ৪. Installable APK build

```bash
npx eas-cli@latest build --platform android --profile preview
```

এই profile-এর output হবে `.apk`, যা Android phone-এ সরাসরি install করা যায়। Build শেষ হলে terminal-এ একটি Expo download URL দেখাবে। সেই URL ফোনে খুলে APK download করে install করবে।

Android যদি unknown source install block করে, Settings থেকে browser/file manager-এর জন্য “Install unknown apps” অনুমতি দিতে হবে।

## ৫. Play Store-এর জন্য build

Play Store-এ সরাসরি APK নয়, সাধারণত AAB ব্যবহার করা হয়:

```bash
npx eas-cli@latest build --platform android --profile production
```

এই profile `.aab` তৈরি করবে।

## ৬. Build status ও download

```bash
npx eas-cli@latest build:list --platform android
```

কোনো build-এর details ও download link দেখতে Expo dashboard ব্যবহার করা যাবে:

https://expo.dev/accounts/@YOUR_EXPO_USERNAME/projects/pathargataapp/builds

## ৭. গুরুত্বপূর্ণ Firebase/OAuth note

- Firebase Realtime Database ও Storage configuration app-এর সঙ্গে থাকবে।
- Google/Facebook login ব্যবহার করলে Android package identifier এবং OAuth redirect configuration-এ এই package identifier ব্যবহার করতে হবে: `space.manus.pathargataapp.t234601128680804`
- Firebase Console-এ Android app হিসেবে একই package name register করা থাকা উচিত।
- Production build-এর আগে Google Android Client ID এবং Facebook App ID environment/configuration-এ সঠিকভাবে থাকতে হবে।

## দ্রুততম command

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```
