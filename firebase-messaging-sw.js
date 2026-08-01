importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBfI-THOXOvhyL7LumZVKixtTVwF94CjsI",
    authDomain: "pathargata-digital-comnity-ltd.firebaseapp.com",
    databaseURL: "https://pathargata-digital-comnity-ltd-default-rtdb.firebaseio.com",
    projectId: "pathargata-digital-comnity-ltd",
    storageBucket: "pathargata-digital-comnity-ltd.firebasestorage.app",
    messagingSenderId: "991014085926",
    appId: "1:991014085926:android:b249e489d8424433ed4de7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Background Notification Received: ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/manifest-icon-192.maskable.png' // নোটিফিকেশনের আইকন পাথ
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});