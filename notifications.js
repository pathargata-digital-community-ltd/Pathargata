import {
    ref,
    query,
    orderByChild,
    equalTo,
    onValue,
    onChildAdded,
    limitToLast,
    endAt,
    get,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Notification Pagination Variables
let lastNotifKey = null;
let hasMoreNotifs = true;
let shownPopups = new Set(); 

// ১. নোটিফিকেশন ব্যাজ লিসেনার
window.listenForNotificationBadge = (uid) => {
    onValue(query(ref(window.db, `notifications/${uid}`), orderByChild('read'), equalTo(false)), (snap) => {
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        const badge = document.getElementById('header-badge-notice');
        const markAllBtn = document.getElementById('btn-mark-all-read');
        
        if (badge) {
            badge.innerText = count > 99 ? '99+' : count;
            badge.classList[count > 0 ? 'add' : 'remove']('active');
        }
        // আনরিড নোটিফিকেশন থাকলে 'সব মার্ক করুন' বাটন দেখাবে
        if (markAllBtn) {
            markAllBtn.classList[count > 0 ? 'remove' : 'add']('hidden');
        }
    });
};

// ২. টিকটক স্টাইল ভাসমান নোটিফিকেশন দেখানো (ইন-অ্যাপ)
window.showTikTokStyleToast = async (notif) => {
    const container = document.getElementById('in-app-toast-container');
    if (!container) return;

    if (shownPopups.has(notif.id)) return;
    shownPopups.add(notif.id);

    let text = 'একটি নতুন পোস্ট শেয়ার করেছেন';
    let icon = '<i class="fa-solid fa-rss"></i>';
    let colorClass = 'text-blue-600 bg-blue-100';

    if (notif.type === 'like') {
        text = 'আপনার পোস্টে লাইক দিয়েছেন';
        icon = '<i class="fa-solid fa-thumbs-up"></i>';
        colorClass = 'text-green-600 bg-green-100';
    } else if (notif.type === 'comment') {
        text = 'আপনার পোস্টে কমেন্ট করেছেন';
        icon = '<i class="fa-solid fa-comment"></i>';
        colorClass = 'text-purple-600 bg-purple-100';
    } else if (notif.type === 'blood_req') {
        text = `জরুরি রক্ত প্রয়োজন! (${window.escapeHTML(notif.group)})`;
        icon = '<i class="fa-solid fa-droplet"></i>';
        colorClass = 'text-red-600 bg-red-100';
    }

    let profilePicUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(notif.fromName || 'U')}&background=random`;
    
    if (notif.fromUid && window.getUserData) {
        try {
            const uData = await window.getUserData(notif.fromUid);
            if (uData && uData.profile_pic) {
                profilePicUrl = uData.profile_pic;
            }
        } catch (error) {
            console.error("Profile pic fetch error", error);
        }
    }

    const toast = document.createElement('div');
    // in-app-toast-anim ক্লাসটি সিএসএস থেকে অ্যানিমেশন নেবে
    toast.className = 'in-app-toast-anim bg-white/95 backdrop-blur-md border border-gray-100 shadow-xl rounded-full p-2 pr-3 flex items-center gap-3 w-[90%] max-w-sm mx-auto mb-2 cursor-pointer pointer-events-auto';
    
    toast.innerHTML = `
        <img src="${profilePicUrl}" class="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200">
        <div class="flex-1 min-w-0">
            <h4 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(notif.fromName || 'নোটিফিকেশন')}</h4>
            <p class="text-xs text-gray-600 truncate">${text}</p>
        </div>
        <div class="w-8 h-8 rounded-full ${colorClass} flex items-center justify-center shrink-0">
            ${icon}
        </div>
    `;

    toast.onclick = () => {
        toast.remove();
        window.handleNotificationClick(notif.id, notif.postId, notif.type);
    };

    container.appendChild(toast);
    
    // ৪ সেকেন্ড পর রিমুভ হবে (অ্যানিমেশনের সাথে মিল রেখে)
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 4000);
};

// ৩. আনরিড নোটিফিকেশনের জন্য লিসেনার
window.listenForInAppPopups = (uid) => {
    const unreadQuery = query(ref(window.db, `notifications/${uid}`), orderByChild('read'), equalTo(false), limitToLast(1));
    onChildAdded(unreadQuery, (snap) => {
        const notif = { id: snap.key, ...snap.val() };
        if (notif.fromUid !== uid) {
            setTimeout(() => window.showTikTokStyleToast(notif), 2000);
        }
    });
};

// ৪. মেইন নোটিফিকেশন লোডার 
window.loadNotifications = (isInitial = false) => {
    const list = document.getElementById('notifications-list');
    const btn = document.getElementById('btn-load-more-notif');
    
    if (!window.currentUser || !list) return;

    if (isInitial) {
        list.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
        lastNotifKey = null;
        hasMoreNotifs = true;
    }
    
    if (!hasMoreNotifs) {
        if (btn) btn.classList.add('hidden');
        return;
    }

    const pageSize = 15;
    let notifQuery;
    if (isInitial) notifQuery = query(ref(window.db, `notifications/${window.currentUser.uid}`), limitToLast(pageSize));
    else notifQuery = query(ref(window.db, `notifications/${window.currentUser.uid}`), endAt(lastNotifKey), limitToLast(pageSize + 1));

    // সুন্দর Empty State Design
    const emptyStateHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <i class="fa-solid fa-bell-slash text-3xl text-gray-400"></i>
            </div>
            <h3 class="text-gray-800 font-bold text-lg mb-1">কোনো নোটিফিকেশন নেই</h3>
            <p class="text-gray-500 text-sm">নতুন কোনো আপডেট আসলে এখানে দেখতে পাবেন</p>
        </div>
    `;

    get(notifQuery).then(async (snap) => {
        const data = snap.val();
        if (isInitial) list.innerHTML = '';
        
        if (!data) {
            if (isInitial) list.innerHTML = emptyStateHTML;
            hasMoreNotifs = false;
            if (btn) btn.classList.add('hidden');
            return;
        }

        const now = Date.now();
        const fiveDaysInMillis = 5 * 24 * 60 * 60 * 1000; // ৫ দিনের লজিক

        let items = [];
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val === 'object' && val !== null) {
                if (now - (val.timestamp || 0) > fiveDaysInMillis) {
                    remove(ref(window.db, `notifications/${window.currentUser.uid}/${key}`));
                } else {
                    items.push({ id: key, ...val });
                }
            }
        });

        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (!isInitial && items.length > 0) items = items.filter(i => i.id !== lastNotifKey);
        if (items.length < pageSize && !isInitial) hasMoreNotifs = false;

        if (items.length === 0) {
            if (isInitial) list.innerHTML = emptyStateHTML;
            hasMoreNotifs = false;
            if (btn) btn.classList.add('hidden');
            return;
        }

        // প্রোফাইল পিকচার ফেচ করা
        const itemsWithPics = await Promise.all(items.map(async (n) => {
            n.profilePicUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(n.fromName || 'U')}&background=random`;
            if (n.fromUid && window.getUserData) {
                try {
                    const uData = await window.getUserData(n.fromUid);
                    if (uData && uData.profile_pic) {
                        n.profilePicUrl = uData.profile_pic;
                    }
                } catch (e) { console.error(e); }
            }
            return n;
        }));

        // HTML রেন্ডারিং
        itemsWithPics.forEach(n => {
            const bgClass = n.read ? 'bg-white' : 'bg-blue-50'; // আনরিড হলে হাইলাইট
            let html = '';
            
            if (n.type === 'blood_req') {
                html = `
                <div id="notif-${n.id}" class="${bgClass} p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between mb-3 cursor-pointer transition-colors duration-300">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <img src="${n.profilePicUrl}" class="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-200">
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-red-700 text-sm truncate">জরুরি রক্ত প্রয়োজন!</h4>
                            <p class="text-xs text-gray-600 truncate">গ্রুপ: ${window.escapeHTML(n.group)} | নাম: ${window.escapeHTML(n.fromName)}</p>
                            <p class="text-[10px] text-gray-400 mt-0.5">${window.timeAgo(n.timestamp)}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-center gap-1 shrink-0 ml-2">
                        <div class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                            <i class="fa-solid fa-droplet text-xs"></i>
                        </div>
                        <a href="tel:${n.contact}" class="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white mt-1 shadow-sm hover:scale-110 transition" onclick="event.stopPropagation(); update(ref(window.db, 'notifications/${window.currentUser.uid}/${n.id}'), { read: true }); document.getElementById('notif-${n.id}').classList.replace('bg-blue-50', 'bg-white');">
                            <i class="fa-solid fa-phone text-xs"></i>
                        </a>
                    </div>
                </div>`;
            } else {
                let icon = 'fa-rss', color = 'text-blue-600', iconBg = 'bg-blue-100', text = 'একটি নতুন পোস্ট শেয়ার করেছেন';
                if (n.type === 'like') { icon = 'fa-thumbs-up'; color = 'text-green-600'; iconBg = 'bg-green-100'; text = 'আপনার পোস্টে লাইক দিয়েছেন'; }
                if (n.type === 'comment') { icon = 'fa-comment'; color = 'text-purple-600'; iconBg = 'bg-purple-100'; text = 'আপনার পোস্টে কমেন্ট করেছেন'; }
                
                html = `
                <div id="notif-${n.id}" class="${bgClass} p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between mb-3 cursor-pointer hover:bg-gray-50 transition-colors duration-300" onclick="handleNotificationClick('${n.id}', '${n.postId}', '${n.type}')">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <img src="${n.profilePicUrl}" class="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-200">
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(n.fromName)}</h4>
                            <p class="text-xs text-gray-500 truncate">${text}</p>
                            <p class="text-[10px] text-gray-400 mt-0.5">${window.timeAgo(n.timestamp)}</p>
                        </div>
                    </div>
                    <div class="w-9 h-9 rounded-full ${iconBg} flex items-center justify-center ${color} shrink-0 ml-2 shadow-sm">
                        <i class="fa-solid ${icon} text-sm"></i>
                    </div>
                </div>`;
            }
            list.insertAdjacentHTML('beforeend', html);
        });

        if (items.length > 0) {
            lastNotifKey = items[items.length - 1].id;
            if (btn) btn.classList.remove('hidden');
        } else {
            if (btn) btn.classList.add('hidden');
        }
    }).catch(err => {
        console.error("Load Notifications Error:", err);
        if (isInitial && list) list.innerHTML = '<p class="text-center text-red-500 mt-10">নোটিফিকেশন লোড হতে সমস্যা হয়েছে!</p>';
    });
};

// ৫. নোটিফিকেশন ক্লিক ইভেন্ট
window.handleNotificationClick = (notifId, postId, type) => {
    // UI তে সাথে সাথে রিড মার্ক করা
    const notifElement = document.getElementById(`notif-${notifId}`);
    if (notifElement) notifElement.classList.replace('bg-blue-50', 'bg-white');

    // ডাটাবেসে আপডেট করা
    update(ref(window.db, `notifications/${window.currentUser.uid}/${notifId}`), { read: true });

    // পোস্ট ওপেন করা
    if (['new_post', 'like', 'comment'].includes(type) && window.openSinglePostModal) {
        window.openSinglePostModal(postId);
    }
};

// ৬. নতুন ফিচার: সব নোটিফিকেশন একসাথে রিড (Mark all as read)
window.markAllAsRead = async () => {
    if (!window.currentUser) return;
    
    try {
        const unreadQuery = query(ref(window.db, `notifications/${window.currentUser.uid}`), orderByChild('read'), equalTo(false));
        const snap = await get(unreadQuery);
        
        if (snap.exists()) {
            let updates = {};
            snap.forEach(child => {
                updates[`${child.key}/read`] = true;
            });
            
            // ফায়ারবেসে একবারে সব আপডেট করা
            await update(ref(window.db, `notifications/${window.currentUser.uid}`), updates);
            
            // লোকাল UI আপডেট করা (হালকা নীল ব্যাকগ্রাউন্ড সরিয়ে সাদা করা)
            document.querySelectorAll('#notifications-list > div.bg-blue-50').forEach(el => {
                el.classList.replace('bg-blue-50', 'bg-white');
            });
            
            // বাটন হাইড করা
            document.getElementById('btn-mark-all-read')?.classList.add('hidden');
            
            if (window.showToast) window.showToast("সব নোটিফিকেশন রিড করা হয়েছে", "success");
        }
    } catch (e) {
        console.error("Mark all read error:", e);
    }
};