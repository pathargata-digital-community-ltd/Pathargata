# রক্ত সেবা: Native App ↔ Admin App handoff

এই native app-এ কোনো admin panel নেই। Request যাচাই, status পরিবর্তন, donor selection/notification, contact handoff, audit, retention এবং deletion schedule আলাদা admin app/backend-এর দায়িত্ব। Native app request তৈরি করে, request-এর status দেখায় এবং যাচাই-পরবর্তী donor-কে উত্তর দিতে দেয়।

## RTDB data contract

- `donors/{uid}`: `bloodGroup`, `phone`, `hidePhone: true`, `serviceArea`, `receiveBloodRequestNotifications`, `temporarilyUnavailable`, `consentUpdatedAt`, `lastDate`। পুরনো donor record-এ নতুন consent fields না থাকলে user **opt-in করেননি** হিসেবে গণ্য হবে; admin notification-এ অন্তর্ভুক্ত করবেন না।
- `blood_requests/{requestId}`: public/sanitized fields—`requesterUid`, `trackingId`, `bloodGroup`, `area`, `units`, `urgency`, `neededAt`, `status`, `verificationStatus`, `nextAction`, `createdAt`, `updatedAt`, `expiresAt`, `updatedBy` এবং donor `responses`। এখানে `patientName`, `hospital`, `details`, `contact` বা `requesterName` রাখা যাবে না; Rules এগুলো reject করে। Donor প্রয়োজনীয় blood group, এলাকা, urgency ও সময় দেখতে পাবে, কিন্তু রোগী/হাসপাতাল শনাক্ত করতে পারবে না।
- `blood_request_private/{requestId}`: `requesterUid`, `contact`, `requesterName`, `patientName`, `hospital`, `details`, `createdAt`। কেবল সংশ্লিষ্ট requester এবং নির্দিষ্ট admin role/backend পড়তে পারবে। অন্য user বা donor-কে এই path কখনো প্রকাশ করা যাবে না। Native app requester-এর নিজের private record আলাদাভাবে পড়ে; donor public projection থেকে private fields পায় না।
- `blood_requests/{requestId}/responses/{uid}`: `response` (`can_donate`, `unavailable`, `need_information`) এবং `updatedAt`। Native app কেবল নিজের response লিখবে; status কেবল admin app/backend বদলাবে।
- Notification copy generic রাখুন: “আপনার এলাকায় একটি রক্তের অনুরোধ এসেছে। বিস্তারিত দেখতে অ্যাপে সাইন ইন করুন।” Push/lock-screen payload-এ রোগী, ফোন, হাসপাতালের নির্দিষ্ট বিবরণ বা request-এর private data দেবেন না। Donor selection করার আগে request যাচাই করুন; শুধু opted-in, অনুপলব্ধ নন এমন donor-কে একই blood group/consented service area অনুযায়ী বাছুন।

## আবশ্যক security ও operational কাজ

Native app-এর Firebase client SDK কোনো admin claim তৈরি করতে পারে না। Firebase Authentication custom claim/নির্দিষ্ট role এবং Firebase RTDB Rules বা trusted backend দিয়ে role enforcement করতে হবে। বিশেষত `blood_request_private`-এ public/authenticated-wide read বন্ধ, public request projection-এ sensitive field নিষিদ্ধ, donor response write নিজের UID-তে সীমিত, request status field-এর write admin-only, donor consent field নিজের UID-তে সীমিত এবং audit records client-write থেকে সুরক্ষিত রাখুন। `donors` path-এ phone field-এর read restriction-ও Rules-এ প্রয়োগ করুন; UI-তে নম্বর না দেখানো নিরাপত্তার বিকল্প নয়।

এই checkout-এ Firebase Rules/admin-app source পাওয়া যায়নি, তাই live Rules deploy, role claim provisioning, admin queue, audit logging বা retention job deploy করা হয়নি। নতুন code-এ public projection sanitize এবং private field access enforce করা হয়েছে। **Live deploy-এর আগে পুরোনো `blood_requests/{requestId}` records-এর `patientName`, `hospital`, `details` ও অন্যান্য sensitive field read-only export করে `blood_request_private/{requestId}`-এ স্থানান্তর/যাচাই করতে হবে, তারপর public records থেকে মুছে দিতে হবে।** এই migration ও Rules deploy ছাড়া পুরোনো records-এর exposure বন্ধ হবে না। Admin app/backend-কে verified, donor-answered, completed/cancelled ও expired lifecycle পরিচালনা করতে হবে, কে দেখেছে/পরিবর্তন করেছে/contact প্রকাশ করেছে তা audit করতে হবে, retention policy নির্ধারণ করতে হবে এবং requester-এর cancellation/deletion কার্যকর করতে হবে।

রক্তের গ্রুপভিত্তিক তালিকা কেবল যোগাযোগের সহায়তা; transfusion suitability চিকিৎসক/হাসপাতাল নিশ্চিত করবেন।
