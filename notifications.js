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
let shownPopups = new Set(); // কোন নোটিফিকেশনগুলো ভাসমান হিসেবে দেখানো হয়েছে তা মনে রাখার জন্য

// ১. নোটিফিকেশন ব্যাজ লিসেনার
window.listenForNotificationBadge = (uid) => {
    onValue(query(ref(window.db, `notifications/${uid}`), orderByChild('read'), equalTo(false)), (snap) => {
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        const badge = document.getElementById('header-badge-notice');
        if (badge) {
            badge.innerText = count;
            badge.classList[count > 0 ? 'add' : 'remove']('active');
        }
    });
};

// ২. টিকটক স্টাইল ভাসমান নোটিফিকেশন দেখানো (ইন-অ্যাপ)
window.showTikTokStyleToast = (notif) => {
    const container = document.getElementById('in-app-toast-container');
    if (!container) return;

    // একই নোটিফিকেশন যেন বারবার পপআপ না হয়
    if (shownPopups.has(notif.id)) return;
    shownPopups.add(notif.id);

    // টেক্সট নির্ধারণ
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

    // প্রোফাইল আইকন (ছবি না থাকলে নামের প্রথম অক্ষর)
    let imgHtml = `<div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${colorClass}">${notif.fromName ? notif.fromName.charAt(0) : icon}</div>`;

    const toast = document.createElement('div');
    toast.className = 'in-app-toast bg-white/95 backdrop-blur-md border border-gray-100 rounded-full p-2 pr-4 flex items-center gap-3 w-full cursor-pointer';
    
    toast.innerHTML = `
        ${imgHtml}
        <div class="flex-1 min-w-0">
            <h4 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(notif.fromName || 'নোটিফিকেশন')}</h4>
            <p class="text-xs text-gray-600 truncate">${text}</p>
        </div>
    `;

    // ক্লিক করলে নোটিফিকেশন পেজে/পোস্টে নিয়ে যাবে
    toast.onclick = () => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
        window.handleNotificationClick(notif.id, notif.postId, notif.type);
    };

    // সোয়াইপ বা সময় শেষ হলে রিমুভ
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('hide');
            setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
        }
    }, 3500); // ৩.৫ সেকেন্ড পর চলে যাবে
};

// ৩. নতুন আনরিড নোটিফিকেশনের জন্য লিসেনার (অ্যাপ ওপেন হলে লাস্ট নোটিফিকেশন দেখাবে)
window.listenForInAppPopups = (uid) => {
    // শুধুমাত্র আনরিড নোটিফিকেশনগুলো ধরবে
    const unreadQuery = query(ref(window.db, `notifications/${uid}`), orderByChild('read'), equalTo(false), limitToLast(1));
    
    onChildAdded(unreadQuery, (snap) => {
        const notif = { id: snap.key, ...snap.val() };
        // নিজের করা এক্টিভিটি যেন পপআপ না হয়
        if (notif.fromUid !== uid) {
            // একটু ডিলে করে পপআপ দেখাবে যাতে অ্যাপ পুরোপুরি লোড হওয়ার সময় পায়
            setTimeout(() => window.showTikTokStyleToast(notif), 2000);
        }
    });
};

// ৪. মেইন নোটিফিকেশন লোডার (অটো-ডিলিট সিস্টেম সহ)
window.loadNotifications = (isInitial = false) => {
    const list = document.getElementById('notifications-list');
    const btn = document.getElementById('btn-load-more-notif');
    
    if (!window.currentUser || !list) return;

    if (isInitial) {
        list.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';
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

    get(notifQuery).then(snap => {
        const data = snap.val();
        if (isInitial) list.innerHTML = '';
        
        if (!data) {
            if (isInitial) list.innerHTML = '<p class="text-center text-gray-400 mt-10">কোনো নোটিফিকেশন নেই</p>';
            hasMoreNotifs = false;
            if (btn) btn.classList.add('hidden');
            return;
        }

        const now = Date.now();
        const fiveDaysInMillis = 5 * 24 * 60 * 60 * 1000; // ৫ দিনের হিসাব

        let items = [];
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val === 'object' && val !== null) {
                // *** অটো-ডিলিট লজিক (৫ দিনের বেশি পুরোনো হলে ডাটাবেস থেকে ডিলিট) ***
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
            if (isInitial) list.innerHTML = '<p class="text-center text-gray-400 mt-10">কোনো নোটিফিকেশন নেই</p>';
            hasMoreNotifs = false;
            if (btn) btn.classList.add('hidden');
            return;
        }

        items.forEach(n => {
            const bgClass = n.read ? 'bg-white' : 'bg-blue-50';
            let html = '';
            
            if (n.type === 'blood_req') {
                html = `<div class="${bgClass} p-3 rounded-xl shadow-sm border-l-4 border-red-600 flex justify-between items-center mb-3"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold"><i class="fa-solid fa-droplet"></i></div><div><h4 class="font-bold text-red-800 text-sm">জরুরি রক্ত প্রয়োজন! (${window.escapeHTML(n.group)})</h4><p class="text-xs text-gray-600">যোগাযোগ: ${window.escapeHTML(n.contact)}</p><p class="text-[10px] text-gray-400">${window.timeAgo(n.timestamp)}</p></div></div><a href="tel:${n.contact}" class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white"><i class="fa-solid fa-phone"></i></a></div>`;
            } else {
                let icon = 'fa-rss', color = 'text-blue-600', bg = 'bg-blue-100', text = 'একটি নতুন পোস্ট শেয়ার করেছেন';
                if (n.type === 'like') { icon = 'fa-thumbs-up'; color = 'text-green-600'; bg = 'bg-green-100'; text = 'আপনার পোস্টে লাইক দিয়েছেন'; }
                if (n.type === 'comment') { icon = 'fa-comment'; color = 'text-purple-600'; bg = 'bg-purple-100'; text = 'আপনার পোস্টে কমেন্ট করেছেন'; }
                
                html = `<div class="${bgClass} p-3 rounded-xl shadow-sm border-l-4 border-blue-400 flex justify-between items-center mb-3 cursor-pointer" onclick="handleNotificationClick('${n.id}', '${n.postId}', '${n.type}')"><div class="flex items-center gap-3"><div class="w-10 h-10 ${bg} rounded-full flex items-center justify-center ${color} font-bold"><i class="fa-solid ${icon}"></i></div><div><h4 class="font-bold text-gray-800 text-sm">${window.escapeHTML(n.fromName)}</h4><p class="text-xs text-gray-500">${text}</p><p class="text-[10px] text-gray-400">${window.timeAgo(n.timestamp)}</p></div></div></div>`;
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
    update(ref(window.db, `notifications/${window.currentUser.uid}/${notifId}`), { read: true });
    
    // ভাসমান নোটিফিকেশন থেকে ক্লিক করলে টপ মেনুতে ব্যাজ কাউন্ট যেন কমে যায়
    const badge = document.getElementById('header-badge-notice');
    if(badge && parseInt(badge.innerText) > 0) {
        let current = parseInt(badge.innerText) - 1;
        badge.innerText = current;
        if(current === 0) badge.classList.remove('active');
    }

    if (['new_post', 'like', 'comment'].includes(type) && window.openSinglePostModal) {
        window.openSinglePostModal(postId);
    }
};