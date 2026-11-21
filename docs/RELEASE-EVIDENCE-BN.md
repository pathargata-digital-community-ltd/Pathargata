# Pathargata Digital Native App — Release Evidence Ledger

**Status:** Repository preflight prepared; EAS artifact এবং physical-device evidence এখনো pending। কোনো test result বাস্তবে চালানো ছাড়া `PASS` করা যাবে না।

**Repository:** `Pathargata-Native-App`

**Target Firebase project:** `pathargata-digital-comnity-ltd`

**Android package:** `com.pathargata.digital.ltd`

**EAS project ID:** `5ad67478-f572-4c86-b360-466acb3afb15`

## 1. Source and configuration identity

| Item | Expected value | Evidence | Status |
|---|---|---|---|
| Git branch | `main` | commit SHA below | Pending capture |
| App version | `1.0.4` বা current `app.config.ts` value | `pnpm validate:release` output | Pending capture |
| Android package | `com.pathargata.digital.ltd` | `pnpm validate:android` | Pending capture |
| Firebase project | `pathargata-digital-comnity-ltd` | `pnpm validate:firebase` | Pending capture |
| EAS project | `5ad67478-f572-4c86-b360-466acb3afb15` | `pnpm validate:release` | Pending capture |
| Release App Check | Android `playIntegrity` | `lib/firebase-app-check.ts` + release smoke | Source verified; device pending |

Run without changing production data:

```sh
pnpm validate:release
pnpm validate:expo
pnpm validate:android
pnpm validate:firebase
pnpm check
pnpm test
pnpm test:functions
pnpm test:rules
pnpm lint
```

Record the exact commit:

```sh
git rev-parse HEAD
git status --short -b
```

## 2. EAS artifacts

A new native build is required because App Check, notifications, audio/video and native plugins cannot be validated through Expo Go or an OTA JavaScript update alone.

### Preview APK — internal testing

Run only after Expo/EAS authorization and explicit build approval:

```sh
npx eas build --platform android --profile preview
```

Record:

- EAS build ID:
- Build URL:
- Artifact URL:
- SHA-256 checksum:
- Build number/version code:
- Build date/time:
- EAS account/project:
- Device(s) used:

### Production AAB — release candidate

Do not submit to Google Play automatically. Build only after release approval:

```sh
npx eas build --platform android --profile production
```

Record:

- EAS build ID:
- Build URL:
- Artifact URL:
- SHA-256 checksum:
- Version name:
- Version code:
- Signing credential identity:
- Build date/time:
- Review/approval reference:

The repository configuration intentionally uses an internal APK for `preview` and an Android App Bundle for `production`.

## 3. Physical Android smoke test

Use a non-production/test account and non-sensitive test data. Record device model, Android version, app build number, date/time and tester for every row.

| Area | Test | Expected result | Result | Evidence/issue |
|---|---|---|---|---|
| Install | Install preview APK | Installs without signature/package conflict | Pending | |
| Auth | Sign in, sign out, sign in as second account | Session and user-scoped state isolate correctly | Pending | |
| Account switch | A → B → logout | No stale A data appears in B or logged-out UI | Pending | |
| Home | Feed, profile avatar/name, shortcuts | Smooth render; no crash | Pending | |
| Notifications | Foreground, background, terminated, locked screen | Correct banner/push sound and deep link | Pending | |
| App Check | Release build request | Play Integrity provider works; no debug token | Pending | |
| AI | Directory lookup and safe action cards | Bounded result; popup requires confirmation | Pending | |
| Blood | Open request popup and submit test request | Private contact is not public; duplicate tap guarded | Pending | |
| Chat | Open existing conversation and send test message | Correct membership and no cross-account leakage | Pending | |
| Marketplace search | Search/category/locality/price/availability | Correct bounded results and smooth filtering | Pending | |
| Product detail | Gallery, favorite, review/report UI | No crash; seller info visible as intended | Pending | |
| Cart | Add/remove/increase/decrease; restart app | User-scoped cart persists and stock cap works | Pending | |
| Checkout | Test product/order group | Server validates latest price/stock; no duplicate order on retry | Pending | |
| Order tracking | Buyer/seller status progression | Invalid backward transition blocked; timeline updates | Pending | |
| Media | Audio record and video/image upload | Permission, progress, cancel/retry and limits work | Pending | |
| Offline | Disable network during read/write/upload | Clear retry state; no duplicate destructive write | Pending | |
| Permissions | Deny notification/location/microphone/camera | App remains usable with clear Bengali explanation | Pending | |
| Performance | Low-end or constrained device scroll test | No major jank, memory pressure or unbounded loading | Pending | |

## 4. Release blockers

Release remains blocked until all applicable items are verified:

- [ ] Preview APK installed on a physical Android device.
- [ ] Production configuration identity matches Firebase and EAS.
- [ ] Release App Check uses Play Integrity; debug provider is not used.
- [ ] Firebase Rules and Functions deployment status is known and compatible with the installed build.
- [ ] Server-side stock reservation/order lifecycle smoke test passes on a test dataset.
- [ ] Notification foreground/background/terminated/deep-link test passes.
- [ ] Audio/video upload physical test passes, or the media limitation is explicitly accepted.
- [ ] No P0 security/privacy blocker remains.
- [ ] Artifact checksum and source commit recorded.
- [ ] Rollback owner and rollback artifact identified.
- [ ] Explicit release approval recorded.

## 5. Known limitations at evidence creation

- This document does not claim that a physical device test has passed.
- This document does not claim that an EAS build has been created.
- Firebase/App Check/Functions live status must be verified in the authorized project; local source validation alone is not proof of deployment.
- Cloudinary signed-upload production migration must be verified separately before sensitive media rollout.
- Online payment gateway is not part of this release candidate; marketplace payment remains Cash on Delivery or shop pickup intent unless a separately approved payment release is completed.
