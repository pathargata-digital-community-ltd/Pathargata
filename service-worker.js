const CACHE_NAME = 'patharghata-static-v3';
const DYNAMIC_CACHE_NAME = 'patharghata-dynamic-v3';

// যে ফাইলগুলো অ্যাপ ইন্সটল হওয়ার সাথেই ফোনে সেভ (Cache) হয়ে যাবে
const STATIC_ASSETS = [
  '/Pathargata/',
  '/Pathargata/index.html',
  '/Pathargata/manifest.json'
];

// ১. Install Event - স্ট্যাটিক ফাইলগুলো ক্যাশ করা
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting(); // নতুন আপডেট আসলে সাথে সাথে কার্যকর হবে
});

// ২. Activate Event - পুরোনো ক্যাশ ডিলেট করা (স্টোরেজ বাঁচানোর জন্য)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

// ৩. Fetch Event - স্মার্ট নেটওয়ার্ক ও ক্যাশ ম্যানেজমেন্ট
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // ⚠️ ফায়ারবেস, ক্লাউডিনারি বা ডেটাবেস API কলের ক্ষেত্রে ক্যাশ ব্যবহার করব না (সরাসরি ইন্টারনেট থেকে আনবে)
  if (
    requestUrl.hostname.includes('firebaseio.com') ||
    requestUrl.hostname.includes('googleapis.com') ||
    requestUrl.hostname.includes('cloudinary.com') ||
    event.request.method !== 'GET' // POST/PUT রিকোয়েস্ট ক্যাশ করা যাবে না
  ) {
    return; 
  }

  // Strategy A: Network First, Fallback to Cache (HTML পেজের জন্য)
  // সবসময় ইন্টারনেট থেকে লেটেস্ট পেজ আনার চেষ্টা করবে, ইন্টারনেট না থাকলে ক্যাশ থেকে দেখাবে।
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          return caches.match('/Pathargata/index.html'); // অফলাইনে থাকলে অ্যাপ ক্র্যাশ না করে সেভ করা পেজ দেখাবে
        })
    );
    return;
  }

  // Strategy B: Stale-While-Revalidate (ইমেজ, সিএসএস, ফন্ট, স্ক্রিপ্ট ইত্যাদির জন্য)
  // আগে ক্যাশ থেকে দ্রুত লোড করবে, এরপর ব্যাকগ্রাউন্ডে ইন্টারনেট থেকে নতুন আপডেট এনে সেভ করে রাখবে।
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // ইন্টারনেট না থাকলে কিছুই করবে না
      });

      return cachedResponse || fetchPromise;
    })
  );
});
