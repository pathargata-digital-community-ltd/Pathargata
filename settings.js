// settings.js

import { ref, update, set, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

// ৭. ট্যাগিং ও অন্যান্য সেটিংস লোড করা
window.initSettingsPage = () => {
    if (!window.userDetails || !window.userDetails.settings) return;
    const s = window.userDetails.settings;
    
    // Tagging permission
    const tagSelect = document.getElementById('setting-tag-permission');
    if (tagSelect) tagSelect.value = s.tagPermission || 'everyone';
    
    // Online status
    const onlineToggle = document.getElementById('setting-online-toggle');
    if (onlineToggle) onlineToggle.checked = s.showOnline !== false; // default true
    
    // Push notifications
    const masterPush = document.getElementById('toggle-master-push');
    if (masterPush) masterPush.checked = s.masterPush !== false;
};

// ৮. ব্লকড ইউজার লিস্ট মডাল ওপেন ও ডেটা লোড
window.openBlockedUsersModal = () => {
    const modal = document.getElementById('blocked-users-modal');
    modal.classList.remove('hidden-custom');
    setTimeout(() => modal.classList.remove('translate-y-full'), 10);
    history.pushState({ modal: 'blocked-users-modal' }, null, "#blocked-users");
    
    window.loadBlockedUsers();
};

window.closeBlockedUsersModal = () => {
    const modal = document.getElementById('blocked-users-modal');
    modal.classList.add('translate-y-full');
    setTimeout(() => modal.classList.add('hidden-custom'), 300);
    if (history.state?.modal === 'blocked-users-modal') history.back();
};

window.loadBlockedUsers = async () => {
    const listDiv = document.getElementById('blocked-users-list');
    listDiv.innerHTML = '<div class="flex justify-center mt-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div></div>';
    
    if (!window.currentUser) return;
    const uid = window.currentUser.uid;
    
    try {
        const snap = await get(ref(window.db, `users/${uid}/blocked_users`));
        if (!snap.exists()) {
            listDiv.innerHTML = '<p class="text-center text-gray-500 mt-10">কাউকে ব্লক করা হয়নি</p>';
            return;
        }
        
        const blockedData = snap.val();
        let html = '';
        
        for (const blockedUid in blockedData) {
            const uSnap = await get(ref(window.db, `users/${blockedUid}`));
            const uInfo = uSnap.exists() ? uSnap.val() : { name: "অজ্ঞাত ইউজার", profile_pic: "" };
            
            let avatar = uInfo.profile_pic ? `<img src="${uInfo.profile_pic}" class="w-12 h-12 rounded-full object-cover">` : `<div class="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold text-lg"><i class="fa-solid fa-user"></i></div>`;
            
            html += `
            <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center" id="blocked-card-${blockedUid}">
                <div class="flex items-center gap-3">
                    ${avatar}
                    <span class="font-bold text-gray-800 text-base">${window.escapeHTML(uInfo.name)}</span>
                </div>
                <button onclick="unblockUser('${blockedUid}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-xs font-bold transition active:scale-95">আনব্লক</button>
            </div>`;
        }
        
        listDiv.innerHTML = html || '<p class="text-center text-gray-500 mt-10">কাউকে ব্লক করা হয়নি</p>';
        
    } catch (error) {
        listDiv.innerHTML = '<p class="text-center text-red-500 mt-10">ডেটা লোড করতে সমস্যা হয়েছে</p>';
        console.error(error);
    }
};

// ৯. ইউজার আনব্লক করা
window.unblockUser = async (targetUid) => {
    if (!confirm("এই ইউজারকে আনব্লক করতে চান?")) return;
    
    const uid = window.currentUser.uid;
    try {
        // ডেটাবেস থেকে ব্লক রিমুভ করা
        await remove(ref(window.db, `users/${uid}/blocked_users/${targetUid}`));
        
        // UI থেকে কার্ড সরিয়ে দেওয়া
        const card = document.getElementById(`blocked-card-${targetUid}`);
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                card.remove();
                // লিস্ট খালি হয়ে গেলে মেসেজ দেখানো
                const listDiv = document.getElementById('blocked-users-list');
                if (listDiv.children.length === 0) {
                    listDiv.innerHTML = '<p class="text-center text-gray-500 mt-10">কাউকে ব্লক করা হয়নি</p>';
                }
            }, 300);
        }
        
        window.showToast("সফলভাবে আনব্লক করা হয়েছে", "success");
    } catch (error) {
        window.showToast("সমস্যা হয়েছে", "error");
        console.error(error);
    }
};

// ১০. একাউন্ট ডিএক্টিভ করা
window.handleDeactivateAccount = async () => {
    if (confirm("আপনি কি নিশ্চিত যে একাউন্টটি ডিএক্টিভ করতে চান? \n\n(পরবর্তীতে লগইন করলেই এটি আবার একটিভ হয়ে যাবে)")) {
        const uid = window.currentUser.uid;
        try {
            // ডাটাবেসে স্ট্যাটাস আপডেট
            await update(ref(window.db, `users/${uid}`), {
                status: 'deactivated',
                deactivated_at: Date.now()
            });

            window.showToast("একাউন্ট ডিএক্টিভ করা হয়েছে।", "success");
            
            // লগআউট করে বের করে দেওয়া
            setTimeout(async () => {
                await signOut(window.auth);
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            window.showToast("সমস্যা হয়েছে: " + error.message, "error");
        }
    }
};