// settings.js

import { ref, update, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ১. প্রাইভেসি টগল (Hide Contact)
window.togglePrivacy = (checked) => {
    if (!window.currentUser) return;
    update(ref(window.db, 'users/' + window.currentUser.uid), {
        privacy_hide_contact: checked
    }).then(() => window.showToast("সেটিংস আপডেট হয়েছে"));
};

// ২. ফন্ট সাইজ পরিবর্তন
window.changeFontSize = (size) => {
    const body = document.getElementById('body-main');
    if(body) {
        body.classList.remove('text-small', 'text-large');
        if (size !== 'normal') body.classList.add('text-' + size);
    }
    localStorage.setItem('fontSize', size);
};

// ৩. ডাটা সেভার মোড
window.toggleDataSaver = (checked) => {
    localStorage.setItem('dataSaver', checked);
    window.showToast(checked ? "ডাটা সেভার চালু হয়েছে (অটো-প্লে বন্ধ)" : "ডাটা সেভার বন্ধ হয়েছে");
};

// ৪. ক্যাশ ক্লিয়ার করা
window.clearAppCache = async (event) => {
    if (confirm("আপনি কি অ্যাপের ক্যাশ মেমোরি ক্লিয়ার করতে চান? এতে সাময়িক ডাটা মুছে যাবে কিন্তু আপনার একাউন্ট লগআউট হবে না।")) {
        const btnIcon = event.currentTarget.querySelector('i');
        if(btnIcon) {
            btnIcon.classList.remove('fa-broom');
            btnIcon.classList.add('fa-spinner', 'fa-spin');
        }

        try {
            // ১. লোকাল স্টোরেজ থেকে ফিডের ক্যাশ ডিলিট করা
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('feed_cache_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // ২. PWA বা ব্রাউজার ক্যাশ ক্লিয়ার করা
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            window.showToast("ক্যাশ ক্লিয়ার সফল হয়েছে! অ্যাপ রিলোড হচ্ছে...", "success");
            
            setTimeout(() => {
                window.location.reload(true);
            }, 1500);

        } catch (e) {
            window.showToast("ক্যাশ ক্লিয়ার করতে সমস্যা হয়েছে", "error");
            if(btnIcon) {
                btnIcon.classList.add('fa-broom');
                btnIcon.classList.remove('fa-spinner', 'fa-spin');
            }
        }
    }
};

// ৫. ম্যানুয়ালি আপডেট চেক করা
window.checkForUpdates = () => {
    window.showToast("নতুন আপডেট চেক করা হচ্ছে...", "success");
    
    setTimeout(async () => {
        try {
            const { get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            const snap = await get(ref(window.db, 'admin_settings/app_version'));
            const liveVersion = snap.val();
            
            if (!liveVersion || liveVersion === window.LOCAL_APP_VERSION) {
                window.showToast("আপনি অ্যাপের সর্বশেষ ভার্সন ব্যবহার করছেন", "success");
                return;
            }

            if (liveVersion && liveVersion !== window.LOCAL_APP_VERSION) {
                localStorage.removeItem('last_update_attempt');
                
                const updateScreen = document.getElementById('update-screen');
                const progressFill = document.getElementById('update-progress-fill');
                const progressText = document.getElementById('update-progress-text');
                
                if(updateScreen) updateScreen.classList.remove('hidden-custom');
                
                const updateUI = (percent) => {
                    if(progressFill) progressFill.style.width = percent + '%';
                    if(progressText) progressText.innerText = Math.floor(percent) + '%';
                };
                
                updateUI(10); 
                
                let totalSteps = 0;
                let completedSteps = 0;
                let cacheNames = [];
                let registrations = [];

                if ('caches' in window) {
                    cacheNames = await caches.keys();
                    totalSteps += cacheNames.length;
                }
                if ('serviceWorker' in navigator) {
                    registrations = await navigator.serviceWorker.getRegistrations();
                    totalSteps += registrations.length;
                }

                if (totalSteps === 0) {
                    updateUI(90);
                } else {
                    for (let i = 0; i < cacheNames.length; i++) {
                        await caches.delete(cacheNames[i]);
                        completedSteps++;
                        updateUI(10 + ((completedSteps / totalSteps) * 80));
                        await new Promise(r => setTimeout(r, 100)); 
                    }
                    for (let i = 0; i < registrations.length; i++) {
                        await registrations[i].unregister();
                        completedSteps++;
                        updateUI(10 + ((completedSteps / totalSteps) * 80));
                        await new Promise(r => setTimeout(r, 100));
                    }
                }

                updateUI(100);
                if(progressText) progressText.innerText = "সম্পন্ন হয়েছে! রিস্টার্ট হচ্ছে...";
                
                setTimeout(() => window.location.reload(true), 1500);
            }
        } catch (error) {
            console.error("Manual Update failed:", error);
            window.showToast("সার্ভার কানেকশন এরর বা আপডেটে সমস্যা হয়েছে", "error");
            setTimeout(() => window.location.reload(true), 2000); 
        }
    }, 1000);
};

// ৬. একাউন্ট ডিলিট করা
window.handleDeleteAccount = async () => {
    if (prompt("একাউন্ট ডিলিট করতে 'DELETE' লিখুন:") === 'DELETE') {
        const uid = window.currentUser.uid;
        
        try {
            await set(ref(window.db, `account_deletion_requests/${uid}`), {
                uid: uid,
                name: window.userDetails.name,
                email: window.userDetails.email,
                phone: window.userDetails.phone || 'N/A',
                profile_pic: window.userDetails.profile_pic || '',
                timestamp: Date.now()
            });

            await update(ref(window.db, `users/${uid}`), {
                status: 'deleted',
                deleted_at: Date.now()
            });

            alert("আপনার একাউন্ট সফলভাবে ডিলিট করা হয়েছে।");
            await signOut(window.auth);
            window.location.reload();
            
        } catch (error) {
            alert("সমস্যা হয়েছে: " + error.message);
        }
    }
};