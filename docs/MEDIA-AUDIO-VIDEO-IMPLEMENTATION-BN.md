# Audio ও Video পোস্ট — Implementation ও Release Notes

## এই পরিবর্তনে যা যুক্ত হয়েছে

- Post composer-এ microphone permission-এর পরে সর্বোচ্চ ৬০ সেকেন্ডের voice recording; limit-এ পৌঁছালে recording স্বয়ংক্রিয়ভাবে থামে। Android/iOS-এর AAC/M4A এবং browser-এর WebM recording আলাদা MIME/extension-এ upload হয়। Recording বাতিল/মুছে ফেলা, playback preview এবং upload failure-এর পরে একই draft রেখে আবার চেষ্টা করা যায়। Voice file upload-এর আগে ও upload helper-এ ১০ MB সীমা যাচাই হয়।
- একবারে একটি video বাছাই, local preview ও removal, MIME/extension, duration, dimension এবং file-size validation যুক্ত হয়েছে। অনুমোদিত format: MP4, M4V, MOV ও WebM; duration ১–৬০ সেকেন্ড; dimensions প্রতি অক্ষে সর্বোচ্চ 1920; upload size ৩০ MB-এর কম। Unknown duration বা dimensions হলে file reject হবে।
- Supported video post existing schema-তেই লেখা হয়: একটি URL `images` ও legacy `image`-এ, সঙ্গে `mediaType: "video"` এবং `type: "video"`। Existing feed card detail page খোলে এবং detail-এর Expo Video player ব্যবহার করে। Voice post-এর `audio`/`type: "voice"` schema অপরিবর্তিত।
- Cloudinary URL access এখনো public হতে পারে বলে audio/video-সহ post আপাতত `Public` privacy-তেই সীমিত; private/friends-only media signed/private delivery না আসা পর্যন্ত publish হবে না।
- Video/audio Cloudinary upload-এ XMLHttpRequest transfer progress দেখায়। Upload বা post write ব্যর্থ হলে composer draft থাকে, যাতে একই draft retry করা যায়। Retry-তে Firebase post key পুনর্ব্যবহার করা হয়, ফলে অনিশ্চিত network response-এ দ্বিতীয় post record তৈরি হয় না। Upload মাঝপথে ব্যর্থ হলে Cloudinary-তে orphan asset থাকতে পারে; বর্তমানে server-side cleanup নেই।

## Compression ও metadata সীমা

Expo Image Picker-কে H.264 1280×720 export preset দেওয়া হয়েছে; এই export setting iOS-এ প্রযোজ্য। Android picker-এর ক্ষেত্রে package নিজে video transcode করে না। তাই Android-এ source video অপরিবর্তিত থাকে, তবে duration, dimensions ও size reject করা হয়। Android-এ transcoding না হওয়া এবং physical device test না হওয়া পর্যন্ত বড়/metadata-bearing video-এর জন্য production release অনুমোদন করা যাবে না। `exif: false` picker-কে EXIF ফেরত না দিতে বলে, কিন্তু Android video-র embedded GPS/EXIF সম্পূর্ণ মুছে ফেলার নিশ্চয়তা নয়।

বর্তমান cross-platform dependency set-এ deterministic Android video transcoder নেই। Android-এর জন্য metadata stripping ও guaranteed 720p conversion আলাদা native transcoding dependency/Cloudinary transformation design এবং physical-device validation চায়; এই implementation সেগুলো সম্পন্ন হয়েছে বলে দাবি করে না।

## Security ও privacy release gate

বর্তমান uploader Cloudinary unsigned preset ব্যবহার করে (`lib/media-upload.ts`) এবং client-selected media-র জন্য authenticated, short-lived server-side Cloudinary signature বা owner-scoped pending-media record তৈরি করে না। Firebase Rules post-এর owner write ও `public_posts` projection ownership/privacy gate enforce করে; rules Cloudinary object bytes, URL visibility, MIME, metadata, বা upload ownership যাচাই করতে পারে না। Cloudinary URL সরাসরি accessযোগ্য হতে পারে—শুধু private/friends post projection থেকে বাদ পড়লেই media URL private হয় না।

অতএব, unsigned preset অনুমোদিত format/size/folder/transformation-এ সীমাবদ্ধ কিনা Cloudinary dashboard-এ যাচাই না করা পর্যন্ত public production rollout বন্ধ থাকবে। Roadmap-এর Prompt 8 অনুযায়ী signed, short-lived upload authorization, server-side completion/ownership record, orphan cleanup এবং staged unsigned-preset migration আগে বা একযোগে করতে হবে। Production secret/configuration বা deployment কেবল অনুমোদিত release workflow-এ করা যাবে।

## যাচাইয়ের checklist

- Automated checks: `pnpm check`, `pnpm test`, `git diff --check`।
- Device smoke: Android ও iOS-এ microphone deny/grant, start/stop/cancel, ৬০ সেকেন্ডে auto-stop, app background/interruption, over-limit rejection, audio preview/upload/retry, video picker cancel/unsupported metadata/oversize rejection/preview/upload/progress/retry, slow network, app restart এবং published feed/detail playback পরীক্ষা করুন।
- Cloudinary test environment-এ allowed MIME/resource type, upload preset constraints, maximum body size এবং failed/abandoned upload cleanup যাচাই করুন; production storage-এ destructive smoke test নয়।
- Video moderation/content-safety hook এখনো design/integration করা হয়নি। Public launch-এর আগে moderation ও abuse-response workflow নির্ধারণ করুন।

Physical-device test, Cloudinary signed authorization, metadata stripping verification, moderation integration এবং production deployment এই code change-এর মাধ্যমে প্রমাণিত নয়।
