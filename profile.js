import { ref, get, update, query, orderByChild, equalTo, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// প্রোফাইল পেজিনেশন এর ভেরিয়েবলগুলো
window.profilePostsFullList = [];
window.currentProfileRenderCount = 0;
window.isProfileRendering = false;
window.currentProfileViewMode = '';

// এলিমেন্ট নাল থাকলেও ক্র্যাশ প্রতিরোধ করার জন্য নিরাপদ ফাংশনসমূহ (Safe Setters)
const safeSetVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
};

const safeSetChecked = (id, checked) => {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
};

// ১. প্রোফাইল পোস্ট লোড করা
window.loadProfilePosts = (targetUid, containerId) => {
    const feedDiv = document.getElementById(containerId);
    if (!feedDiv) return;

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
    if (!container) return;

    const batchSize = 5;
    const nextBatch = window.profilePostsFullList.slice(window.currentProfileRenderCount, window.currentProfileRenderCount + batchSize);

    let html = '';
    nextBatch.forEach(post => {
        html += window.createPostHTML(post, post.id);
    });

    container.insertAdjacentHTML('beforeend', html);
    window.currentProfileRenderCount += batchSize;
    window.isProfileRendering = false;
}

// ৩. অন্যের প্রোফাইল ওপেন করা (প্রোফাইল লক, অনলাইন স্ট্যাটাস ও সোশ্যাল লিংকসহ)
window.openUserProfile = (uid) => {
    if (uid === window.currentUser.uid) return window.switchPage('profile');
    window.switchPage('view-profile');
    history.pushState({ page: 'view-profile', uid }, "", "#profile-view");
    
    ['view-profile-name', 'view-profile-avatar-container', 'view-profile-union-badge', 'view-profile-village-text'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = "...";
    });

    const feed = document.getElementById('view-profile-posts-feed');
    if(feed) feed.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    
    const btnFriends = document.getElementById('btn-view-friends-other');
    if(btnFriends) btnFriends.setAttribute('onclick', `showAllFriends('${uid}')`);
    
    const coverImg = document.getElementById('view-profile-cover-img');
    if(coverImg) coverImg.classList.add('hidden');
    
    // অনলাইন সক্রিয়তা স্ট্যাটাস রিয়েল-টাইম সাবস্ক্রিপশন
    const presenceRef = ref(window.db, `status/${uid}`);
    onValue(presenceRef, (statusSnap) => {
        const pBadge = document.getElementById('view-profile-presence-status');
        if (pBadge && statusSnap.exists()) {
            const status = statusSnap.val().state;
            pBadge.className = status === 'online' ? 
                'absolute bottom-1 right-2 w-5 h-5 bg-green-500 border-4 border-white rounded-full' : 
                'absolute bottom-1 right-2 w-5 h-5 bg-gray-400 border-4 border-white rounded-full';
        }
    });

    get(ref(window.db, 'users/' + uid)).then(async snap => {
        const user = snap.val();
        if (!user) return window.switchPage('home');
        
        document.getElementById('view-profile-avatar-container').innerHTML = user.profile_pic ? `<img src="${user.profile_pic}" loading="lazy" class="w-full h-full object-cover cursor-pointer" onclick="window.viewFullScreenImage('${user.profile_pic}')">` : `<span class="text-5xl font-bold">${user.name ? window.escapeHTML(user.name).charAt(0).toUpperCase() : 'U'}</span>`;
        document.getElementById('view-profile-name').innerHTML = (window.escapeHTML(user.name) || "অজ্ঞাত") + window.checkUserBadge(user);
        document.getElementById('view-profile-union-badge').innerText = user.union || "ইউনিয়ন নেই";
        document.getElementById('view-profile-village-text').innerText = user.village || "গ্রাম উল্লেখ নেই";
        document.getElementById('view-profile-profession').innerText = window.escapeHTML(user.profession) || "পেশা উল্লেখ নেই";
        document.getElementById('view-profile-location').innerText = window.escapeHTML(user.location) || "ঠিকানা উল্লেখ নেই";
        document.getElementById('view-profile-bio').innerText = window.escapeHTML(user.bio) || "কোনো বায়ো তথ্য নেই";
        
        // ফোন নম্বর গোপনীয়তা সেটিং চেক
        const phoneContainer = document.getElementById('view-profile-phone-container');
        if (phoneContainer) {
            if (user.hide_phone && uid !== window.currentUser.uid) {
                phoneContainer.classList.add('hidden-custom');
            } else {
                phoneContainer.classList.remove('hidden-custom');
                document.getElementById('view-profile-phone').innerText = user.phone || "ফোন নেই";
            }
        }

        // সোশ্যাল প্রোফাইল লিংক রেন্ডার
        ['fb', 'wa', 'web'].forEach(type => {
            const el = document.getElementById(`view-link-${type}`);
            if (el) el.classList.add('hidden'); 
        });

        if (user.facebook) {
            const fbLink = document.getElementById('view-link-fb');
            if (fbLink) { fbLink.href = user.facebook; fbLink.classList.remove('hidden'); fbLink.classList.add('flex'); }
        }
        if (user.whatsapp) {
            const waLink = document.getElementById('view-link-wa');
            if (waLink) { waLink.href = `https://wa.me/${user.whatsapp}`; waLink.classList.remove('hidden'); waLink.classList.add('flex'); }
        }
        if (user.website) {
            const webLink = document.getElementById('view-link-web');
            if (webLink) { webLink.href = user.website; webLink.classList.remove('hidden'); webLink.classList.add('flex'); }
        }

        // প্রোফাইল লক নিরাপত্তা চেক
        const isFriend = window.myFriends && window.myFriends.includes(uid);
        const lockNotice = document.getElementById('view-profile-locked-notice');
        const contentArea = document.getElementById('view-profile-content-area');
        const lockBadge = document.getElementById('view-profile-lock-badge');

        if (user.profile_locked && !isFriend) {
            if (lockNotice) lockNotice.classList.remove('hidden');
            if (contentArea) contentArea.classList.add('hidden-custom');
            if (lockBadge) lockBadge.classList.remove('hidden');
        } else {
            if (lockNotice) lockNotice.classList.add('hidden');
            if (contentArea) contentArea.classList.remove('hidden-custom');
            if (lockBadge) {
                if (user.profile_locked) lockBadge.classList.remove('hidden');
                else lockBadge.classList.add('hidden');
            }
            
            // ডাটা লকড না থাকলে পোস্ট লোড হবে
            window.loadProfilePosts(uid, 'view-profile-posts-feed');
            window.loadFriendsPreview(uid, 'other');
        }

        // আপডেট কাউন্টারস
        document.getElementById('view-stats-join-date').innerText = user.joinDate || "---";
        get(query(ref(window.db, 'posts'), orderByChild('uid'), equalTo(uid))).then(postSnap => {
            const count = postSnap.exists() ? Object.keys(postSnap.val()).length : 0;
            document.getElementById('view-stats-posts-count').innerText = count;
        });
        get(ref(window.db, `users/${uid}/friends`)).then(fSnap => {
            document.getElementById('view-stats-friends-count').innerText = fSnap.exists() ? Object.keys(fSnap.val()).length : 0;
        });
        
        if (user.cover_pic && coverImg) {
            coverImg.src = user.cover_pic;
            coverImg.classList.remove('hidden');
            coverImg.onclick = () => window.viewFullScreenImage(user.cover_pic);
            coverImg.classList.add('cursor-pointer');
        }
        
        window.checkFriendshipStatus(uid, user.name);
    }).catch(() => window.switchPage('home'));
};

// ৪. ফ্রেন্ডস প্রিভিউ লোড করা (উন্নত ও নিরাপদ আইডি ফলব্যাক সহ)
window.loadFriendsPreview = (uid, mode) => {
    let container = document.getElementById(mode === 'me' ? 'profile-friends-preview-me' : 'profile-friends-preview-other');
    if (!container) container = document.getElementById(mode === 'me' ? 'friends-preview-me' : 'friends-preview-other');
    if (!container && mode === 'me') container = document.getElementById('my-friends-preview-list');
    
    let countSpan = document.getElementById(mode === 'me' ? 'friends-count-me' : 'friends-count-other');
    if (!countSpan && mode === 'me') countSpan = document.getElementById('stats-friends-count');
    
    if (!container) {
        console.warn("Friends container matching IDs not found in DOM yet.");
        return;
    }
    
    container.innerHTML = '<div class="col-span-3 flex justify-center py-2"><div class="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div></div>';
    
    get(ref(window.db, `users/${uid}/friends`)).then(async snap => {
        const friends = snap.exists() ? Object.keys(snap.val()) : [];
        if (countSpan) {
            countSpan.innerText = `${friends.length} জন বন্ধু`;
        }
        
        if (friends.length === 0) {
            container.innerHTML = '<p class="col-span-3 text-center text-xs text-gray-400 py-2">এখনো ফ্রেন্ড নেই</p>';
            return;
        }

        try {
            const profiles = await Promise.all(friends.slice(0, 6).map(async fUid => {
                let data = await window.getUserData(fUid);
                if(!data) {
                    const freshSnap = await get(ref(window.db, `users/${fUid}`));
                    data = freshSnap.val();
                }
                return data ? { ...data, uid: fUid } : null;
            }));
            
            const validProfiles = profiles.filter(p => p !== null);

            container.innerHTML = validProfiles.map(uData => {
                const name = uData.name || 'User';
                const firstLetter = name.charAt(0).toUpperCase();
                
                let av = uData.profile_pic ? 
                    `<img src="${uData.profile_pic}" loading="lazy" class="w-full h-full object-cover cursor-pointer" onclick="window.viewFullScreenImage('${uData.profile_pic}')">` : 
                    `<span class="text-2xl">${firstLetter}</span>`;
                
                return `
                <div onclick="window.openUserProfile('${uData.uid}')" class="flex flex-col items-center cursor-pointer">
                    <div class="w-full aspect-square bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 font-bold mb-1 border border-blue-100 overflow-hidden shadow-sm">
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
    }).catch(err => {
        console.error("Firebase friends fetch error:", err);
        container.innerHTML = '<p class="col-span-3 text-center text-xs text-red-400">অনাকাঙ্ক্ষিত ত্রুটি</p>';
    });
}

// ৫. নিজের অনলাইন সক্রিয়তা নির্দেশক রিয়েল-টাইম লোড
if (window.currentUser) {
    const myPresenceRef = ref(window.db, `status/${window.currentUser.uid}`);
    onValue(myPresenceRef, (statusSnap) => {
        const pBadge = document.getElementById('profile-presence-status');
        if (pBadge && statusSnap.exists()) {
            const status = statusSnap.val().state;
            pBadge.className = status === 'online' ? 
                'absolute bottom-1 right-2 w-5 h-5 bg-green-500 border-4 border-white rounded-full transition-colors duration-300' : 
                'absolute bottom-1 right-2 w-5 h-5 bg-gray-400 border-4 border-white rounded-full transition-colors duration-300';
        }
    });
}

// ৬. সংরক্ষিত বুকমার্ক বা আমার পোস্ট ট্যাব সুইচিং সিস্টেম
window.switchProfileTab = (tabName) => {
    const postTabBtn = document.getElementById('tab-profile-posts');
    const savedTabBtn = document.getElementById('tab-profile-saved');
    const postsFeed = document.getElementById('my-posts-feed');
    const savedFeed = document.getElementById('my-saved-feed');

    if (!postTabBtn || !savedTabBtn || !postsFeed || !savedFeed) return;

    if (tabName === 'posts') {
        postTabBtn.className = "flex-1 text-center py-3.5 text-sm font-bold text-green-600 border-b-2 border-green-600 transition-all";
        savedTabBtn.className = "flex-1 text-center py-3.5 text-sm font-bold text-gray-400 transition-all";
        postsFeed.classList.remove('hidden-custom');
        savedFeed.classList.add('hidden-custom');
        window.loadProfilePosts(window.currentUser.uid, 'my-posts-feed');
    } else if (tabName === 'saved') {
        savedTabBtn.className = "flex-1 text-center py-3.5 text-sm font-bold text-green-600 border-b-2 border-green-600 transition-all";
        postTabBtn.className = "flex-1 text-center py-3.5 text-sm font-bold text-gray-400 transition-all";
        postsFeed.classList.add('hidden-custom');
        savedFeed.classList.remove('hidden-custom');
        window.loadSavedBookmarks();
    }
};

// ৭. সংরক্ষিত বুকমার্কসমূহ রেন্ডার
window.loadSavedBookmarks = () => {
    const container = document.getElementById('my-saved-feed');
    if (!container) return;

    container.innerHTML = '<div class="flex justify-center py-6"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';

    get(ref(window.db, `users/${window.currentUser.uid}/saved`)).then(async (snap) => {
        const savedIds = snap.exists() ? Object.keys(snap.val()) : [];
        if (savedIds.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 text-sm py-10"><i class="fa-regular fa-bookmark text-2xl block mb-2 text-gray-300"></i>কোনো তথ্য সংরক্ষিত নেই</p>';
            return;
        }

        try {
            const savedPosts = await Promise.all(savedIds.map(async (postId) => {
                const postSnap = await get(ref(window.db, `posts/${postId}`));
                return postSnap.exists() ? { id: postId, ...postSnap.val() } : null;
            }));

            const validSavedPosts = savedPosts.filter(p => p !== null);
            container.innerHTML = '';

            if (validSavedPosts.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-400 text-sm py-10">সংরক্ষিত পোস্টগুলো পাওয়া যায়নি</p>';
                return;
            }

            validSavedPosts.forEach(post => {
                container.insertAdjacentHTML('beforeend', window.createPostHTML(post, post.id));
            });
        } catch (err) {
            container.innerHTML = '<p class="text-center text-red-400 py-10">লোড ব্যর্থ হয়েছে</p>';
        }
    });
};

// ৮. সকল বন্ধু দেখানো
window.showAllFriends = (uid) => {
    const targetUid = uid === 'me' ? window.currentUser.uid : uid;
    window.switchPage('friends-list');
    
    const container = document.getElementById('all-friends-container');
    if (!container) return;

    container.innerHTML = '<div class="flex justify-center pt-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';
    
    get(ref(window.db, `users/${targetUid}/friends`)).then(async snap => {
        const friends = Object.keys(snap.val() || {});
        if (friends.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 mt-10">কোনো ফ্রেন্ড নেই</p>';
            return;
        }
        
        try {
            const profiles = await Promise.all(friends.map(async fUid => {
                let data = await window.getUserData(fUid);
                if(!data) {
                    const freshSnap = await get(ref(window.db, `users/${fUid}`));
                    data = freshSnap.val();
                }
                return data ? { ...data, uid: fUid } : null;
            }));

            const validProfiles = profiles.filter(p => p !== null);
            
            container.innerHTML = validProfiles.map(u => {
                const name = u.name || 'User';
                const firstLetter = name.charAt(0).toUpperCase();
                
                let av = u.profile_pic ? 
                    `<img src="${u.profile_pic}" loading="lazy" class="w-10 h-10 rounded-full object-cover">` : 
                    `<div class="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold">${firstLetter}</div>`;
                    
                return `
                <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center cursor-pointer" onclick="window.openUserProfile('${u.uid}')">
                    <div class="flex items-center gap-3">
                        ${av}
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">${window.escapeHTML(name)}${window.checkUserBadge(u)}</h4>
                            <p class="text-xs text-gray-500">${window.escapeHTML(u.profession || 'সদস্য')}</p>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (error) {
            console.error("Error loading all friends:", error);
            container.innerHTML = '<p class="text-center text-red-500 mt-10">তালিকা লোড করতে সমস্যা হয়েছে</p>';
        }
    });
};

// ৯. কভার ফটো আপলোড
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
            if(coverImg) {
                coverImg.src = res.url;
                coverImg.classList.remove('hidden');
            }
        } catch (e) {
            window.showToast("আপলোড ব্যর্থ হয়েছে: " + e.message, "error");
        }
    }
}

// ১০. প্রোফাইল এডিট সেভ করা (সামাজিক লিংক ও প্রাইভেসি প্রোপার্টি সহ)
window.saveProfileChanges = async () => {
    const name = document.getElementById('edit-name').value.trim(),
          file = document.getElementById('edit-profile-img').files[0];
          
    if (!name) return window.showToast("নাম আবশ্যক", 'error');
    
    const btn = document.getElementById('btn-save-profile');
    if(btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...';
        btn.disabled = true;
    }
    
    try {
        let profilePicUrl = window.userDetails.profile_pic || null;
        if (file) {
            const res = await window.uploadMediaToCloudinary(file);
            profilePicUrl = res.url;
        }

        const facebook = document.getElementById('edit-facebook').value.trim();
        const whatsapp = document.getElementById('edit-whatsapp').value.trim();
        const website = document.getElementById('edit-website').value.trim();
        const profile_locked = document.getElementById('edit-profile-lock').checked;
        const hide_phone = document.getElementById('edit-hide-phone').checked;

        await update(ref(window.db, 'users/' + window.currentUser.uid), {
            name,
            nickname: document.getElementById('edit-nickname').value.trim(),
            profession: document.getElementById('edit-profession').value.trim(),
            location: document.getElementById('edit-location').value.trim(),
            bio: document.getElementById('edit-bio').value.trim(),
            profile_pic: profilePicUrl,
            facebook: facebook || null,
            whatsapp: whatsapp || null,
            website: website || null,
            profile_locked: profile_locked,
            hide_phone: hide_phone
        });
        
        window.showToast("প্রোফাইল আপডেট হয়েছে!");
        window.toggleEditProfile(false);
        document.getElementById('edit-profile-img').value = "";
    } catch (e) {
        window.showToast("ত্রুটি: " + e.message, 'error');
    } finally {
        if(btn) {
            btn.innerText = "সংরক্ষণ করুন";
            btn.disabled = false;
        }
    }
};

// ১১. প্রোফাইল এডিট মডাল টগল করা ও নিরাপদ তথ্য ইনজেক্ট (TypeError Fix)
window.toggleEditProfile = (s) => {
    if (s) {
        window.openModalWithHistory('edit-profile-modal', "#edit-profile");
        const u = window.userDetails;
        if (u) {
            // এলিমেন্ট নাল থাকলেও যাতে ক্র্যাশ না করে সেজন্য safeSetVal ও safeSetChecked ব্যবহার করা হয়েছে
            safeSetVal('edit-name', u.name || "");
            safeSetVal('edit-nickname', u.nickname || "");
            safeSetVal('edit-profession', u.profession || "");
            safeSetVal('edit-location', u.location || "");
            safeSetVal('edit-bio', u.bio || "");
            safeSetVal('edit-facebook', u.facebook || "");
            safeSetVal('edit-whatsapp', u.whatsapp || "");
            safeSetVal('edit-website', u.website || "");
            safeSetChecked('edit-profile-lock', u.profile_locked || false);
            safeSetChecked('edit-hide-phone', u.hide_phone || false);
            
            safeSetVal('edit-union', u.union || "Unknown");
            safeSetVal('edit-village', u.village || "Unknown");
        }
    } else {
        const modal = document.getElementById('edit-profile-modal');
        if (modal) modal.classList.add('hidden-custom');
        if (history.state?.modal === 'edit-profile-modal') history.back();
    }
};

// ১২. প্রোফাইল কার্ড ওপেন করা
window.openProfileCard = () => {
    if (!window.userDetails) {
        return window.showToast("ডাটা লোড হয়নি। একটু অপেক্ষা করুন।", "error");
    }

    const u = window.userDetails;
    
    document.getElementById('card-user-name').innerText = u.name || "অজ্ঞাত নাম";
    document.getElementById('card-user-profession').innerText = u.profession || "পেশা উল্লেখ নেই";
    document.getElementById('card-user-phone').innerText = u.hide_phone ? "গোপন রাখা হয়েছে" : (u.phone || "দেওয়া নেই");
    
    const address = (u.village && u.union) ? `${u.village},\n${u.union}` : (u.village || u.union || "পাথরঘাটা");
    document.getElementById('card-user-address').innerHTML = address;

    const uidText = window.currentUser.uid; 
    document.getElementById('card-user-uid').innerText = uidText.substring(0, 10).toUpperCase();

    const imgContainer = document.getElementById('card-user-img');
    if (u.profile_pic) {
        imgContainer.innerHTML = `<img src="${u.profile_pic}" loading="lazy" class="w-full h-full object-cover rounded-md">`;
    } else {
        const firstLetter = u.name ? window.escapeHTML(u.name).charAt(0).toUpperCase() : 'U';
        imgContainer.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-400 text-3xl font-bold rounded-md bg-gray-100">${firstLetter}</div>`;
    }

    const verifyBadge = document.getElementById('card-verify-badge');
    if (verifyBadge) {
        if (u.isVerified || ['chairman', 'member', 'admin', 'doctor', 'uno', 'oc', 'journalist'].includes(u.role?.toLowerCase())) {
            verifyBadge.classList.remove('hidden');
        } else {
            verifyBadge.classList.add('hidden');
        }
    }

    const appLink = "https://pathargata-digital-community-ltd.github.io/Pathargata/";
    const referLink = `${appLink}?ref=${uidText}`;
    
    const qrImg = document.getElementById('card-qr-code');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(referLink)}&color=0d9488`;
    }

    window.openModalWithHistory('profile-card-modal', "#my-card");
};

// ১৩. প্রোফাইল কার্ড ক্লোজ করা
window.closeProfileCard = () => {
    document.getElementById('profile-card-modal').classList.add('hidden-custom');
    if (history.state?.modal === 'profile-card-modal') history.back();
};

// ১৪. মূল অ্যাকাউন্ট আপডেট ট্র্যাকিং ও পয়েন্ট ওয়ালেট এবং ইমেজ জুম ভিউ বাইন্ডিং
window.initMyProfileStats = () => {
    if (!window.currentUser) return;
    const uid = window.currentUser.uid;

    // নিজের প্রোফাইল ছবি ও কভার ফটো ক্লিকে ফুল ভিউ করার প্রোগ্রাম্যাটিক বাইন্ডিং
    const myAvatarContainer = document.getElementById('profile-avatar-container');
    if (myAvatarContainer) {
        myAvatarContainer.onclick = () => {
            if (window.userDetails && window.userDetails.profile_pic) {
                window.viewFullScreenImage(window.userDetails.profile_pic);
            } else {
                window.showToast("কোনো প্রোফাইল ছবি সেট করা নেই", "error");
            }
        };
        myAvatarContainer.classList.add('cursor-pointer');
    }

    const myCoverImg = document.getElementById('profile-cover-img');
    if (myCoverImg) {
        myCoverImg.onclick = () => {
            if (window.userDetails && window.userDetails.cover_pic) {
                window.viewFullScreenImage(window.userDetails.cover_pic);
            } else {
                window.showToast("কোনো কভার ছবি সেট করা নেই", "error");
            }
        };
        myCoverImg.classList.add('cursor-pointer');
    }

    // সোশ্যাল আইকন ও ওয়ালেট ডাইনামিক আপডেট
    get(ref(window.db, `users/${uid}`)).then(snap => {
        const u = snap.val();
        if (!u) return;

        // সোশ্যাল লিংক হ্যান্ডলিং
        ['fb', 'wa', 'web'].forEach(t => {
            const el = document.getElementById(`link-${t}`);
            if(el) el.classList.add('hidden');
        });

        if (u.facebook) {
            const el = document.getElementById('link-fb');
            if(el) { el.href = u.facebook; el.classList.remove('hidden'); el.classList.add('flex'); }
        }
        if (u.whatsapp) {
            const el = document.getElementById('link-wa');
            if(el) { el.href = `https://wa.me/${u.whatsapp}`; el.classList.remove('hidden'); el.classList.add('flex'); }
        }
        if (u.website) {
            const el = document.getElementById('link-web');
            if(el) { el.href = u.website; el.classList.remove('hidden'); el.classList.add('flex'); }
        }

        // ওয়ালেট ও অবদান তথ্য সেটআপ
        const ptsWallet = document.getElementById('profile-wallet-points');
        if (ptsWallet) ptsWallet.innerText = u.total_points || 0;

        const bloodDonations = document.getElementById('profile-blood-donations');
        if (bloodDonations) bloodDonations.innerText = u.blood_donations || 0;

        const lockBadge = document.getElementById('profile-lock-badge');
        if (lockBadge) {
            if (u.profile_locked) lockBadge.classList.remove('hidden');
            else lockBadge.classList.add('hidden');
        }
    });
};

// ইনস্ট্যান্ট কল
setTimeout(() => {
    window.initMyProfileStats();
}, 800);