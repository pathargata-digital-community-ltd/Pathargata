/** 
 * ==========================================
 *       SERVICE WORKER CONFIGURATION
 * ==========================================
 * Project: Pathargata Digital Community Ltd.
 * Description: Handles Push Notifications & PWA Offline Caching
 */

// ==========================================
// ১. Firebase Setup & Push Notifications
// ==========================================

// Firebase Libraries
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBfI-THOXOvhyL7LumZVKixtTVwF94CjsI",
    authDomain: "pathargata-digital-comnity-ltd.firebasestorage.app",
    databaseURL: "https://pathargata-digital-comnity-ltd-default-rtdb.firebaseio.com",
    projectId: "pathargata-digital-comnity-ltd",
    storageBucket: "pathargata-digital-comnity-ltd.firebasestorage.app",
    messagingSenderId: "991014085926",
    appId: "1:991014085926:web:bb50cbb5d3b54e25ed4de7"
};

// Initialize Firebase App
try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background Notification Handler
    messaging.onBackgroundMessage((payload) => {
        console.log('[Service Worker] Background message received:', payload);

        const notificationTitle = payload.notification?.title || "নতুন নোটিফিকেশন";
        const notificationOptions = {
            body: payload.notification?.body || "আপনার জন্য একটি নতুন আপডেট আছে!",
            icon: '/Pathargata/icon.png',
            badge: '/Pathargata/icon.png',
            data: payload.data,
            vibrate: [200, 100, 200] // নোটিফিকেশন আসলে ফোন ভাইব্রেট করবে
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
    });
} catch (error) {
    console.error('[Service Worker] Firebase Initialization Error:', error);
}

// ==========================================
// ২. PWA Caching Configuration
// ==========================================

const CACHE_NAME = 'patharghata-static-v3';
const DYNAMIC_CACHE_NAME = 'patharghata-dynamic-v3';
const FALLBACK_PAGE = '/Pathargata/index.html';

// Assets to cache on install (অফলাইন ব্যবহারের জন্য)
const STATIC_ASSETS = [
    '/Pathargata/',
    '/Pathargata/index.html',
    '/Pathargata/manifest.json',
    '/Pathargata/icon.png' // আইকনটাও ক্যাশ রাখা ভালো
];

// External APIs that should NEVER be cached (সরাসরি ইন্টারনেট থেকে আসবে)
const NON_CACHEABLE_URLS = [
    'firebaseio.com',
    'googleapis.com',
    'cloudinary.com'
];

// ==========================================
// ৩. Service Worker Lifecycle Events
// ==========================================

// Install Event: স্ট্যাটিক ফাইলগুলো ক্যাশ করা
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing and Pre-caching assets...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting(); // নতুন আপডেট আসলে সাথে সাথে কার্যকর করবে
});

// Activate Event: পুরোনো ক্যাশ ডিলিট করা (স্টোরেজ ক্লিন রাখতে)
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating and Cleaning old caches...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// ==========================================
// ৪. Fetch Event (স্মার্ট নেটওয়ার্ক ও ক্যাশ ম্যানেজমেন্ট)
// ==========================================

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // শর্ত ১: API, Database বা POST রিকোয়েস্ট ক্যাশ করা যাবে না
    const isNonCacheable = NON_CACHEABLE_URLS.some(url => requestUrl.hostname.includes(url));
    if (isNonCacheable || event.request.method !== 'GET') {
        return; // ডিফল্ট ব্রাউজার ফেচ ব্যবহার করবে
    }

    // শর্ত ২: HTML পেজ লোড (Network First, Fallback to Cache)
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
                    console.log('[Service Worker] Offline mode: Serving fallback page');
                    return caches.match(FALLBACK_PAGE);
                })
        );
        return;
    }

    // শর্ত ৩: অন্যান্য অ্যাসেট (ইমেজ, CSS, JS) -> (Stale-While-Revalidate)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    // ডাইনামিক ক্যাশ আপডেট করা
                    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch(() => {
                    // অফলাইনে থাকলে এবং ক্যাশ না পেলে কিছুই করবে না
                });

            // ক্যাশে থাকলে সাথে সাথে দেখাবে, না থাকলে ইন্টারনেট থেকে আনবে
            return cachedResponse || fetchPromise;
        })
    );
});
