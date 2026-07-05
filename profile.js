import { ref, get, update, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// প্রোফাইল পেজিনেশন এর ভেরিয়েবলগুলো
window.profilePostsFullList = [];
window.currentProfileRenderCount = 0;
window.isProfileRendering = false;
window.currentProfileViewMode = '';

// ১. প্রোফাইল পোস্ট লোড করা
window.loadProfilePosts = (targetUid, containerId) => {
    const feedDiv = document.getElementById(containerId);
    feedDiv.innerHTML = '<div class="flex justify-center py-6"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';

    window.currentProfileViewMode = containerId; 
    window.currentProfileRenderCount = 0;
    window.profilePostsFullList = [];

    const q = query(ref(window.db, 'posts'), orderByChild('uid'), equalTo(targetUid));

    get(q).then(snap => {
        const data = snap.val() || {};
        window.profilePostsFullList = Object.entries(data)
            .map(([id, post]) => ({ id, ...post }))
            .sort((a, b) => b.timestamp - a.timestamp);

        feedDiv.innerHTML = ''; 

        if (window.profilePostsFullList.length === 0) {
            feedDiv.innerHTML = '<p class="text-center text-gray-400 py-10">কোনো পোস্ট নেই</p>';
        } else {
            window.renderProfileChunk(); 
        }
    }).catch(e => {
        console.error("Profile Post Load Error:", e);
        feedDiv.innerHTML = '<p class="text-center text-red-400 py-10">পোস্ট লোড হতে সমস্যা</p>';
    });
}

// ২. প্রোফাইল পোস্ট চ্যাঙ্ক রেন্ডার করা (Infinite Scroll)
window.renderProfileChunk = () => {
    if (window.isProfileRendering || window.currentProfileRenderCount >= window.profilePostsFullList.length) return;
    window.isProfileRendering = true;

    const container = document.getElementById(window.currentProfileViewMode);
    const batchSize = 5;
    const nextBatch = window.profilePostsFullList.slice(window.currentProfileRenderCount, window.currentProfileRenderCount + batchSize);

    let html = '';
    nextBatch.forEach(post => {
        html += window.createPostHTML(post, post.id); // মেইন ফাইলের গ্লোবাল ফাংশন
    });

    container.insertAdjacentHTML('beforeend', html);
    window.currentProfileRenderCount += batchSize;
    window.isProfileRendering = false;
}

// ৩. অন্যের প্রোফাইল ওপেন করা
window.openUserProfile = (uid) => {
    if (uid === window.currentUser.uid) return window.switchPage('profile');
    window.switchPage('view-profile');
    history.pushState({ page: 'view-profile', uid }, "", "#profile-view");
    
    ['view-profile-name', 'view-profile-avatar-container', 'view-profile-union-badge', 'view-profile-village-text'].forEach(id => document.getElementById(id).innerText = "...");
    document.getElementById('view-profile-posts-feed').innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    document.getElementById('btn-view-friends-other').setAttribute('onclick', `showAllFriends('${uid}')`);
    
    const coverImg = document.getElementById('view-profile-cover-img');
    coverImg.classList.add('hidden');
    
    get(ref(window.db, 'users/' + uid)).then(snap => {
        const user = snap.val();
        if (!user) return window.switchPage('home');
        
        document.getElementById('view-profile-avatar-container').innerHTML = user.profile_pic ? `<img src="${user.profile_pic}" loading="lazy" class="w-full h-full object-cover">` : `<span class="text-5xl">${user.name ? window.escapeHTML(user.name).charAt(0) : 'U'}</span>`;
        document.getElementById('view-profile-name').innerHTML = (window.escapeHTML(user.name) || "অজ্ঞাত") + window.checkUserBadge(user);
        document.getElementById('view-profile-union-badge').innerText = user.union || "ইউনিয়ন নেই";
        document.getElementById('view-profile-village-text').innerText = user.village || "গ্রাম উল্লেখ নেই";
        document.getElementById('view-profile-profession').innerText = window.escapeHTML(user.profession) || "পেশা উল্লেখ নেই";
        document.getElementById('view-profile-location').innerText = window.escapeHTML(user.location) || "ঠিকানা উল্লেখ নেই";
        document.getElementById('view-profile-bio').innerText = window.escapeHTML(user.bio) || "কোনো তথ্য নেই";
        document.getElementById('view-profile-phone').innerText = user.privacy_hide_contact ? "গোপনীয়" : (user.phone || "ফোন নেই");
        // আপডেট কাউন্টারস
        document.getElementById('view-stats-join-date').innerText = user.joinDate || "---";
        get(query(ref(window.db, 'posts'), orderByChild('uid'), equalTo(uid))).then(postSnap => {
            const count = postSnap.exists() ? Object.keys(postSnap.val()).length : 0;
            document.getElementById('view-stats-posts-count').innerText = count;
        });
        get(ref(window.db, `users/${uid}/friends`)).then(fSnap => {
            document.getElementById('view-stats-friends-count').innerText = fSnap.exists() ? Object.keys(fSnap.val()).length : 0;
        });
        
        if (user.cover_pic) {
            coverImg.src = user.cover_pic;
            coverImg.classList.remove('hidden');
        }
        
        window.checkFriendshipStatus(uid, user.name);
        window.loadProfilePosts(uid, 'view-profile-posts-feed');
        window.loadFriendsPreview(uid, 'other');
    }).catch(() => window.switchPage('home'));
};

// ৪. ফ্রেন্ডস প্রিভিউ লোড করা
window.loadFriendsPreview = (uid, mode) => {
    const container = document.getElementById(mode === 'me' ? 'profile-friends-preview-me' : 'profile-friends-preview-other');
    const countSpan = document.getElementById(mode === 'me' ? 'friends-count-me' : 'friends-count-other');
    
    if (!container || !countSpan) return; // যদি কোনো কারণে এলিমেন্ট না থাকে, তাহলে এরর এড়াবে
    
    container.innerHTML = '<p class="col-span-3 text-center text-xs text-gray-400">লোড হচ্ছে...</p>';
    
    get(ref(window.db, `users/${uid}/friends`)).then(async snap => {
        const friends = Object.keys(snap.val() || {});
        countSpan.innerText = `${friends.length} জন বন্ধু`;
        
        if (friends.length === 0) {
            container.innerHTML = '<p class="col-span-3 text-center text-xs text-gray-400 py-2">এখনো ফ্রেন্ড নেই</p>';
            return;
        }

        try {
            // Promise.all এর ভেতরে window.getUserData ব্যবহার করা হয়েছে
            const profiles = await Promise.all(friends.slice(0, 6).map(async fUid => {
                const data = await window.getUserData(fUid);
                return { ...data, uid: fUid };
            }));
            
            container.innerHTML = profiles.map(uData => {
                // uData.name না থাকলে ফলব্যাক হিসেবে 'User' ব্যবহার করা হয়েছে
                const name = uData.name || 'User';
                const firstLetter = name.charAt(0).toUpperCase();
                
                let av = uData.profile_pic ? 
                    `<img src="${uData.profile_pic}" loading="lazy" class="w-full h-full object-cover">` : 
                    `<span class="text-2xl">${firstLetter}</span>`;
                
                return `
                <div onclick="window.openUserProfile('${uData.uid}')" class="flex flex-col items-center cursor-pointer">
                    <div class="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 font-bold mb-1 border border-gray-200 overflow-hidden shadow-sm">
                        ${av}
                    </div>
                    <p class="text-[11px] font-semibold text-gray-800 truncate w-full text-center leading-tight mt-0.5">
                        ${window.escapeHTML(name).split(' ')[0]}
                    </p>
                </div>`;
            }).join('');
        } catch (error) {
            console.error("Error loading friends preview:", error);
            container.innerHTML = '<p class="col-span-3 text-center text-xs text-red-400">লোড করতে সমস্যা হয়েছে</p>';
        }
    });
}

// ৫. সকল বন্ধু দেখানো
window.showAllFriends = (uid) => {
    // যদি 'me' পাস করা হয়, তবে কারেন্ট ইউজারের UID নিবে
    const targetUid = uid === 'me' ? window.currentUser.uid : uid;
    
    // পেজ সুইচ করা
    window.switchPage('friends-list');
    
    const container = document.getElementById('all-friends-container');
    container.innerHTML = '<div class="flex justify-center pt-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';
    
    get(ref(window.db, `users/${targetUid}/friends`)).then(async snap => {
        const friends = Object.keys(snap.val() || {});
        if (friends.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 mt-10">কোনো ফ্রেন্ড নেই</p>';
            return;
        }
        
        try {
            // এখানে await Promise.all দিয়ে সব বন্ধুদের ডাটা আনা হচ্ছে
            const profiles = await Promise.all(friends.map(async fUid => {
                const data = await window.getUserData(fUid);
                return { ...data, uid: fUid };
            }));
            
            container.innerHTML = profiles.map(u => {
                // নামের প্রথম অক্ষর বের করা
                const firstLetter = u.name ? window.escapeHTML(u.name).charAt(0) : 'U';
                
                let av = u.profile_pic ? 
                    `<img src="${u.profile_pic}" loading="lazy" class="w-10 h-10 rounded-full object-cover">` : 
                    `<div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">${firstLetter}</div>`;
                    
                return `
                <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer" onclick="window.openUserProfile('${u.uid}')">
                    <div class="flex items-center gap-3">
                        ${av}
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">${window.escapeHTML(u.name || 'User')}</h4>
                            <p class="text-xs text-gray-500">${window.escapeHTML(u.profession || 'সদস্য')}</p>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (error) {
            console.error("Error loading all friends:", error);
            container.innerHTML = '<p class="text-center text-red-500 mt-10">বন্ধুদের তালিকা লোড করতে সমস্যা হয়েছে।</p>';
        }
    });
};

// ৬. কভার ফটো আপলোড
window.handleCoverPhotoUpload = async (input) => {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        window.showToast("কভার ফটো আপলোড হচ্ছে...", "success");
        try {
            const res = await window.uploadMediaToCloudinary(file);
            await update(ref(window.db, 'users/' + window.currentUser.uid), {
                cover_pic: res.url
            });
            window.showToast("কভার ফটো আপডেট হয়েছে!");
            const coverImg = document.getElementById('profile-cover-img');
            coverImg.src = res.url;
            coverImg.classList.remove('hidden');
        } catch (e) {
            window.showToast("আপলোড ব্যর্থ হয়েছে: " + e.message, "error");
        }
    }
}

// ৭. প্রোফাইল এডিট সেভ করা
window.saveProfileChanges = async () => {
    const name = document.getElementById('edit-name').value.trim(),
          file = document.getElementById('edit-profile-img').files[0];
          
    if (!name) return window.showToast("নাম আবশ্যক", 'error');
    
    const btn = document.getElementById('btn-save-profile');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...';
    btn.disabled = true;
    
    try {
        let profilePicUrl = window.userDetails.profile_pic || null;
        if (file) {
            const res = await window.uploadMediaToCloudinary(file);
            profilePicUrl = res.url;
        }
        await update(ref(window.db, 'users/' + window.currentUser.uid), {
            name,
            nickname: document.getElementById('edit-nickname').value.trim(),
            profession: document.getElementById('edit-profession').value.trim(),
            location: document.getElementById('edit-location').value.trim(),
            bio: document.getElementById('edit-bio').value.trim(),
            profile_pic: profilePicUrl
        });
        
        window.showToast("প্রোফাইল আপডেট হয়েছে!");
        window.toggleEditProfile(false);
        document.getElementById('edit-profile-img').value = "";
    } catch (e) {
        window.showToast("ত্রুটি: " + e.message, 'error');
    } finally {
        btn.innerText = "সংরক্ষণ করুন";
        btn.disabled = false;
    }
};

// ৮. প্রোফাইল এডিট মডাল টগল করা
window.toggleEditProfile = (s) => {
    if (s) window.openModalWithHistory('edit-profile-modal', "#edit-profile");
    else {
        document.getElementById('edit-profile-modal').classList.add('hidden-custom');
        if (history.state?.modal === 'edit-profile-modal') history.back();
    }
};

// ৯. প্রোফাইল কার্ড ওপেন করা (My Smart ID Card)
window.openProfileCard = () => {
    // ইউজারের ডাটা চেক করা
    if (!window.userDetails) {
        return window.showToast("ডাটা লোড হয়নি। একটু অপেক্ষা করুন।", "error");
    }

    const u = window.userDetails;
    
    // নাম ও পেশা
    document.getElementById('card-user-name').innerText = u.name || "অজ্ঞাত নাম";
    document.getElementById('card-user-profession').innerText = u.profession || "পেশা উল্লেখ নেই";
    
    // ফোন নাম্বার
    document.getElementById('card-user-phone').innerText = u.privacy_hide_contact ? "গোপন রাখা হয়েছে" : (u.phone || "দেওয়া নেই");
    
    // ঠিকানা (গ্রাম ও ইউনিয়ন)
    const address = (u.village && u.union) ? `${u.village},\n${u.union}` : (u.village || u.union || "পাথরঘাটা");
    document.getElementById('card-user-address').innerHTML = address;

    // UID Number (প্রথম ১০ ক্যারেক্টার)
    const uidText = window.currentUser.uid; 
    document.getElementById('card-user-uid').innerText = uidText.substring(0, 10).toUpperCase();

    // প্রোফাইল ছবি
    const imgContainer = document.getElementById('card-user-img');
    if (u.profile_pic) {
        imgContainer.innerHTML = `<img src="${u.profile_pic}" loading="lazy" class="w-full h-full object-cover rounded-md">`;
    } else {
        const firstLetter = u.name ? window.escapeHTML(u.name).charAt(0).toUpperCase() : 'U';
        imgContainer.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-400 text-3xl font-bold rounded-md bg-gray-100">${firstLetter}</div>`;
    }

    // ভেরিফাইড ব্যাজ লজিক (ভেরিফাইড হলে টিক চিহ্ন দেখাবে)
    const verifyBadge = document.getElementById('card-verify-badge');
    if (verifyBadge) {
        if (u.isVerified || ['chairman', 'member', 'admin', 'doctor', 'uno', 'oc', 'journalist'].includes(u.role?.toLowerCase())) {
            verifyBadge.classList.remove('hidden');
        } else {
            verifyBadge.classList.add('hidden');
        }
    }

    // QR Code Generate (স্ক্যান করলে সরাসরি রেফার লিংকে চলে যাবে)
    const appLink = "https://pathargata-digital-community-ltd.github.io/Pathargata/"; // আপনার মূল অ্যাপের লিংক
    const referLink = `${appLink}?ref=${uidText}`;
    
    const qrImg = document.getElementById('card-qr-code');
    if (qrImg) {
        // API দিয়ে QR Code তৈরি (150x150 সাইজ, সবুজ রঙের)
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(referLink)}&color=0d9488`;
    }

    // মডাল ওপেন করা
    window.openModalWithHistory('profile-card-modal', "#my-card");
};

// ১০. প্রোফাইল কার্ড ক্লোজ করা
window.closeProfileCard = () => {
    document.getElementById('profile-card-modal').classList.add('hidden-custom');
    if (history.state?.modal === 'profile-card-modal') history.back();
};