/** 
 * ==========================================
 *       SERVICE WORKER (PWA & OFFLINE)
 * ==========================================
 * handles: Static Caching, Offline Support
 */

const CACHE_NAME = 'patharghata-pwa-v4';
const DYNAMIC_CACHE_NAME = 'patharghata-dynamic-v4';

// অফলাইনে যে ফাইলগুলো কাজ করবে
const STATIC_ASSETS = [
    '/Pathargata/',
    '/Pathargata/index.html',
    '/Pathargata/manifest.json'
];

// ১. Install Event: ফাইলগুলো ক্যাশে জমা করা
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// ২. Activate Event: পুরোনো ক্যাশ ডিলিট করা
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// ৩. Fetch Event: নেটওয়ার্ক থেকে আনা এবং ক্যাশে সেভ করা
self.addEventListener('fetch', (event) => {
    // শুধুমাত্র GET রিকোয়েস্ট এবং নির্দিষ্ট ডোমেইন ফিল্টার
    if (event.request.method !== 'GET' || event.request.url.includes('onesignal')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // রিকোয়েস্ট সফল হলে ডাইনামিক ক্যাশে সেভ করা
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                // ইন্টারনেট না থাকলে ইনডেক্স পেজ দেখানো
                if (event.request.mode === 'navigate') {
                    return caches.match('/Pathargata/index.html');
                }
            });

            return cachedResponse || fetchPromise;
        })
    );
});
