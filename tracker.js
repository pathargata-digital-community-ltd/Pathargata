// tracker.js
import { getDatabase, ref, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ১. কুকি সেট করার ইন্টারনাল ফাংশন
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

// কুকি রিড করার ইন্টারনাল ফাংশন
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

// ডিভাইস আইডি কুকিতে সংরক্ষণ বা রিড করা
function getOrCreateDeviceId() {
    let deviceId = getCookie("patharghata_device_id");
    if (!deviceId) {
        deviceId = "dev_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        setCookie("patharghata_device_id", deviceId, 365);
    }
    return deviceId;
}

// ২. গ্লোবাল ট্র্যাকিং ফাংশন (যা অন্যান্য ফাইল থেকে কল করা যাবে)
window.logUserActivity = function(action, details = {}) {
    const db = window.db; // index.html থেকে সেট করা গ্লোবাল ডাটাবেস অবজেক্ট
    if (!db) {
        console.warn("Database connection is not ready for tracker yet.");
        return;
    }
    
    const deviceId = getOrCreateDeviceId();
    const uid = window.currentUser ? window.currentUser.uid : "guest_user";
    const userName = window.userDetails ? (window.userDetails.name || "Guest") : "Guest";
    const userEmail = window.currentUser ? (window.currentUser.email || "N/A") : "N/A";
    const userUnion = window.userDetails ? (window.userDetails.union || "Unknown") : "Unknown";
    const userVillage = window.userDetails ? (window.userDetails.village || "Unknown") : "Unknown";

    const logData = {
        deviceId: deviceId,
        uid: uid,
        userName: userName,
        userEmail: userEmail,
        userUnion: userUnion,
        userVillage: userVillage,
        action: action,
        details: details,
        timestamp: Date.now(),
        timeString: new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })
    };

    const trackingRef = ref(db, 'tracking');
    push(trackingRef, logData).catch(err => console.error("Tracking Error:", err));
};

// ==========================================
// ৩. কুকি সম্মতি (Cookie Consent) হ্যান্ডলার
// ==========================================

// ইউজার সম্মতি দিয়েছেন কিনা চেক করা
window.checkCookieConsent = function() {
    const consent = getCookie("cookies_accepted");
    const banner = document.getElementById('cookie-consent-banner');
    if (!consent && banner) {
        // অ্যাপ লোড হওয়ার ১.৫ সেকেন্ড পর ব্যানারটি দেখাবে
        setTimeout(() => {
            banner.classList.remove('hidden-custom');
        }, 1500);
    }
};

// ইউজার "সম্মত আছি" বাটনে ক্লিক করলে
window.acceptCookieConsent = function() {
    setCookie("cookies_accepted", "true", 365); // ১ বছরের জন্য সম্মতি সেভ থাকবে
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) {
        banner.classList.add('hidden-custom');
    }
    // ট্র্যাকিং শুরু করার প্রথম লগ
    if (typeof window.logUserActivity === 'function') {
        window.logUserActivity("Cookie Consent Accepted");
    }
};

// অ্যাপ ওপেন হওয়ার সাথে সাথে কুকি চেক রান করা
document.addEventListener("DOMContentLoaded", () => {
    // ডোম লোড হওয়ার পর সম্মতি চেক করবে
    setTimeout(window.checkCookieConsent, 500);
});