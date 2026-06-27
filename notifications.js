import {
    ref,
    query,
    orderByChild,
    equalTo,
    onValue,
    limitToLast,
    endAt,
    get,
    update
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Notification Pagination Variables
let lastNotifKey = null;
let hasMoreNotifs = true;

window.listenForNotificationBadge = (uid) => {
    onValue(query(ref(window.db, `notifications/${uid}`), orderByChild('read'), equalTo(false)), (snap) => {
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        const badge = document.getElementById('header-badge-notice');
        if(badge) {
            badge.innerText = count;
            badge.classList[count > 0 ? 'add' : 'remove']('active');
        }
    });
};

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
        if(btn) btn.classList.add('hidden');
        return;
    }

    const pageSize = 10;
    let notifQuery;
    if (isInitial) notifQuery = query(ref(window.db, `notifications/${window.currentUser.uid}`), limitToLast(pageSize));
    else notifQuery = query(ref(window.db, `notifications/${window.currentUser.uid}`), endAt(lastNotifKey), limitToLast(pageSize + 1));

    get(notifQuery).then(snap => {
        const data = snap.val();
        if (isInitial) list.innerHTML = '';
        
        if (!data) {
            if (isInitial) list.innerHTML = '<p class="text-center text-gray-400 mt-10">কোনো নোটিফিকেশন নেই</p>';
            hasMoreNotifs = false;
            if(btn) btn.classList.add('hidden');
            return;
        }

        let items = Object.entries(data)
            .filter(([key, val]) => typeof val === 'object' && val !== null)
            .map(([key, val]) => ({
                id: key,
                ...val
            }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (!isInitial && items.length > 0) items = items.filter(i => i.id !== lastNotifKey);
        if (items.length < pageSize && !isInitial) hasMoreNotifs = false;

        if (items.length === 0) {
            if (isInitial) list.innerHTML = '<p class="text-center text-gray-400 mt-10">কোনো নোটিফিকেশন নেই</p>';
            hasMoreNotifs = false;
            if(btn) btn.classList.add('hidden');
            return;
        }

        items.forEach(n => {
            const bgClass = n.read ? 'bg-white' : 'bg-blue-50';
            let html = '';
            
            if (n.type === 'blood_req') {
                html = `<div class="${bgClass} p-3 rounded-xl shadow-sm border-l-4 border-red-600 flex justify-between items-center mb-3"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold"><i class="fa-solid fa-droplet"></i></div><div><h4 class="font-bold text-red-800 text-sm">জরুরি রক্ত প্রয়োজন! (${window.escapeHTML(n.group)})</h4><p class="text-xs text-gray-600">যোগাযোগ: ${window.escapeHTML(n.contact)}</p><p class="text-[10px] text-gray-400">${window.timeAgo(n.timestamp)}</p></div></div><a href="tel:${n.contact}" class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white"><i class="fa-solid fa-phone"></i></a></div>`;
            } else {
                let icon = 'fa-rss',
                    color = 'text-blue-600',
                    bg = 'bg-blue-100',
                    text = 'একটি নতুন পোস্ট শেয়ার করেছেন';
                if (n.type === 'like') {
                    icon = 'fa-thumbs-up';
                    color = 'text-green-600';
                    bg = 'bg-green-100';
                    text = 'আপনার পোস্টে লাইক দিয়েছেন';
                }
                if (n.type === 'comment') {
                    icon = 'fa-comment';
                    color = 'text-purple-600';
                    bg = 'bg-purple-100';
                    text = 'আপনার পোস্টে কমেন্ট করেছেন';
                }
                html = `<div class="${bgClass} p-3 rounded-xl shadow-sm border-l-4 border-blue-400 flex justify-between items-center mb-3 cursor-pointer" onclick="handleNotificationClick('${n.id}', '${n.postId}', '${n.type}')"><div class="flex items-center gap-3"><div class="w-10 h-10 ${bg} rounded-full flex items-center justify-center ${color} font-bold"><i class="fa-solid ${icon}"></i></div><div><h4 class="font-bold text-gray-800 text-sm">${window.escapeHTML(n.fromName)}</h4><p class="text-xs text-gray-500">${text}</p><p class="text-[10px] text-gray-400">${window.timeAgo(n.timestamp)}</p></div></div></div>`;
            }
            list.insertAdjacentHTML('beforeend', html);
        });

        if (items.length > 0) {
            lastNotifKey = items[items.length - 1].id;
            if(btn) btn.classList.remove('hidden');
        } else {
            if(btn) btn.classList.add('hidden');
        }
    }).catch(err => {
        console.error("Load Notifications Error:", err);
        if (isInitial && list) list.innerHTML = '<p class="text-center text-red-500 mt-10">নোটিফিকেশন লোড হতে সমস্যা হয়েছে!</p>';
    });
};

window.handleNotificationClick = (notifId, postId, type) => {
    update(ref(window.db, `notifications/${window.currentUser.uid}/${notifId}`), {
        read: true
    });
    if (['new_post', 'like', 'comment'].includes(type) && window.openSinglePostModal) {
        window.openSinglePostModal(postId);
    }
};