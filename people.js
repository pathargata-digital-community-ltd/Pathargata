/* People UI: suggestions, search, friend requests and friends list. */
import {
    ref, get, set, update, remove, onValue, query,
    orderByChild, orderByKey, startAt, endAt, limitToFirst, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

window.allUsers = window.allUsers || [];

        function renderPeopleList(users, isSearch) {
            const div = document.getElementById('users-list');
            let html = isSearch ? `<p class="text-xs font-bold text-green-600 mb-2">Search Results (${users.length})</p>` : '';

            if (users.length === 0 && !isSearch) {
                div.innerHTML = '<p class="text-center text-gray-400 text-sm">নতুন ইউজার নেই</p>';
                return;
            }

            html += users.map(u => {
                const badge = window.checkUserBadge(u);
                let avatar = `<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl border border-blue-200">${u.name?window.escapeHTML(u.name).charAt(0):'U'}</div>`;
                if (u.profile_pic) avatar = `<img alt="" src="${u.profile_pic}" loading="lazy" class="w-12 h-12 rounded-full object-cover border border-gray-100 shadow-sm">`;
                return `<div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-row items-center justify-between gap-3"><div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="window.openUserProfile('${u.uid}')">${avatar}<div class="min-w-0"><h4 class="font-bold text-gray-900 text-base truncate">${window.escapeHTML(u.name)}${badge}</h4><p class="text-xs text-gray-500 truncate">${window.escapeHTML(u.profession) || 'সদস্য'}</p></div></div><div class="shrink-0"><button type="button" id="btn-req-${u.uid}" onclick="toggleFriendRequest('${u.uid}')" class="bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-blue-700 transition shadow-sm active:scale-95 flex items-center gap-1"><i class="fa-solid fa-user-plus"></i> Add</button></div></div>`;
            }).join('');
            div.innerHTML = html;
            users.forEach(u => checkRequestStatus(u.uid));
        }


                       // --- ULTRA OPTIMIZED SUGGESTIONS (LOW DATA READ, ALWAYS 20 USERS) ---
        window.suggestionPool = [];
        let displayedUsersCount = 0;
        let lastFetchedKeyForPool = null;
        let isFetchingPool = false;

        window.loadUserSuggestions = async function loadUserSuggestions(isRefresh = false) {
            const div = document.getElementById('users-list');
            if (isRefresh) {
                div.innerHTML = '<div class="flex justify-center py-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div></div>';
                suggestionPool = [];
                displayedUsersCount = 0;
            }

            if (!document.getElementById('search-people').value) {
                await fetchUsersFromFirebase();
            }
        }

        async function fetchUsersFromFirebase() {
            if (isFetchingPool) return;
            isFetchingPool = true;

            try {
                const FETCH_LIMIT = 40;
                let usersQuery;

                if (lastFetchedKeyForPool) {
                    usersQuery = query(ref(window.db, 'users'), orderByKey(), endAt(lastFetchedKeyForPool), limitToLast(FETCH_LIMIT + 1));
                } else {
                    usersQuery = query(ref(window.db, 'users'), orderByKey(), limitToLast(FETCH_LIMIT));
                }

                const snap = await get(usersQuery);
                let rawUsers = [];

                if (snap.exists()) {
                    snap.forEach(child => {
                        if (child.key !== lastFetchedKeyForPool) {
                            rawUsers.push({ id: child.key, ...child.val() });
                        }
                    });
                }

                if (rawUsers.length === 0) {
                    lastFetchedKeyForPool = null;
                    isFetchingPool = false;
                    return;
                }

                lastFetchedKeyForPool = rawUsers[0].id;
                rawUsers = rawUsers.sort(() => Math.random() - 0.5);

                for (let u of rawUsers) {
                    if (u.uid === window.currentUser.uid || window.myFriends.includes(u.uid)) continue;

                    const s = await get(ref(window.db, `friend_requests/${u.uid}/${window.currentUser.uid}`));
                    const r = await get(ref(window.db, `friend_requests/${window.currentUser.uid}/${u.uid}`));

                    if (!s.exists() && !r.exists()) {
                        suggestionPool.push(u);
                    }
                }

                isFetchingPool = false;
                maintain20UsersOnScreen();

            } catch (e) {
                console.error("Suggestion Error", e);
                isFetchingPool = false;
            }
        }

        function maintain20UsersOnScreen() {
            const div = document.getElementById('users-list');
            if (displayedUsersCount === 0) div.innerHTML = '';

            while (displayedUsersCount < 20 && suggestionPool.length > 0) {
                let nextUser = suggestionPool.shift();

                div.insertAdjacentHTML('beforeend', createSuggestionCardHTML(nextUser));
                displayedUsersCount++;

                setTimeout(() => {
                    const newCard = document.getElementById(`sugg-card-${nextUser.uid}`);
                    if (newCard) newCard.style.opacity = '1';
                }, 50);
            }

            if (suggestionPool.length < 10) {
                fetchUsersFromFirebase();
            }

            if (displayedUsersCount === 0 && !isFetchingPool) {
                div.innerHTML = '<p class="text-center text-gray-400 text-sm mt-5">নতুন কাউকে পাওয়া যায়নি। রিফ্রেশ করুন।</p>';
            }
        }

        function createSuggestionCardHTML(u) {
            const badge = window.checkUserBadge(u);
            let avatar = `<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl border border-blue-200">${u.name ? window.escapeHTML(u.name).charAt(0) : 'U'}</div>`;
            if (u.profile_pic) avatar = `<img alt="" src="${u.profile_pic}" loading="lazy" class="w-12 h-12 rounded-full object-cover border border-gray-100 shadow-sm">`;

            return `
            <div id="sugg-card-${u.uid}" class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-row items-center justify-between gap-3 transition-all duration-300 transform scale-100 opacity-0">
                <div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="window.openUserProfile('${u.uid}')">
                    ${avatar}
                    <div class="min-w-0">
                        <h4 class="font-bold text-gray-900 text-base truncate">${window.escapeHTML(u.name)}${badge}</h4>
                        <p class="text-xs text-gray-500 truncate">${window.escapeHTML(u.profession) || 'সদস্য'}</p>
                    </div>
                </div>
                <div class="shrink-0">
                    <button type="button" id="btn-sugg-req-${u.uid}" onclick="sendSuggestionRequest('${u.uid}')" class="bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-blue-700 transition shadow-sm active:scale-95 flex items-center gap-1">
                        <i class="fa-solid fa-user-plus"></i> Add
                    </button>
                </div>
            </div>`;
        }

        window.sendSuggestionRequest = (toUid) => {
            const btn = document.getElementById(`btn-sugg-req-${toUid}`);
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            const refPath = `friend_requests/${toUid}/${window.currentUser.uid}`;
            set(ref(window.db, refPath), {
                fromName: window.userDetails.name,
                fromUid: window.currentUser.uid,
                timestamp: Date.now()
            }).then(() => {
                window.showToast("রিকুয়েস্ট পাঠানো হয়েছে!");

                const card = document.getElementById(`sugg-card-${toUid}`);
                if (card) {
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.9)';

                    setTimeout(() => {
                        card.remove();
                        displayedUsersCount--;
                        maintain20UsersOnScreen();
                    }, 300);
                }
            }).catch(e => {
                window.showToast("ত্রুটি: " + e.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Add';
            });
        };

        window.refreshPeople = () => {
            loadUserSuggestions(true);
        };


        // --- PEOPLE SEARCH & FILTER ---
        function updatePeopleTab() {
            get(ref(window.db, `friend_requests/${window.currentUser.uid}`)).then(async (snap) => {
                const reqDiv = document.getElementById('friend-requests-list'),
                    requests = snap.val() || {};
                const count = Object.keys(requests).length;
                document.getElementById('nav-badge-people').innerText = count;
                document.getElementById('nav-badge-people').classList[count > 0 ? 'add' : 'remove']('active');
                document.getElementById('friend-requests-section').classList[count > 0 ? 'remove' : 'add']('hidden');
                if (count > 0) {
                    const reqHTMLs = await Promise.all(Object.values(requests).map(async (r) => {
                        const uData = await window.getUserData(r.fromUid) || {};
                        let av = uData.profile_pic ? `<img alt="" src="${uData.profile_pic}" loading="lazy" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 font-bold">${uData.name ? uData.name.charAt(0) : 'U'}</div>`;
                        return `<div class="bg-white p-3 rounded-xl shadow-sm border border-yellow-100 flex justify-between items-center"><div class="flex items-center gap-3" onclick="window.openUserProfile('${r.fromUid}')">${av}<div><h4 class="font-bold text-gray-800 text-sm">${window.escapeHTML(r.fromName)}</h4></div></div><div class="flex gap-2"><button type="button" onclick="acceptRequest('${r.fromUid}')" class="bg-green-600 text-white px-3 py-1 rounded text-xs">Confirm</button><button type="button" onclick="cancelRequest('${r.fromUid}', true)" class="bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs">Delete</button></div></div>`;
                    }));
                    reqDiv.innerHTML = reqHTMLs.join('');
                } else reqDiv.innerHTML = '';
            });

            const frPreviewDiv = document.getElementById('my-friends-preview-list');
            if (window.myFriends && window.myFriends.length > 0) {
                // সরাসরি ডাটাবেস/ক্যাশ থেকে বন্ধুদের ডাটা লোড করা হচ্ছে এবং নিশ্চিত করা হচ্ছে uid ঠিক আছে কিনা
                Promise.all(window.myFriends.slice(0, 10).map(async (uid) => {
                    const data = await window.getUserData(uid);
                    if (data) return { ...data, uid };
                    return null;
                })).then(friendsData => {
                    let html = '';
                    friendsData.forEach(u => {
                        if (u) {
                            let av = u.profile_pic ? `<img alt="" src="${u.profile_pic}" loading="lazy" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 bg-white rounded-full flex items-center justify-center text-green-600 font-bold text-xs">${window.escapeHTML(u.name).charAt(0)}</div>`;
                            html += `<div onclick="window.openUserProfile('${u.uid}')" class="bg-green-50 p-2 rounded-lg border border-green-100 flex items-center gap-2 cursor-pointer hover:bg-green-100 transition"><div class="shrink-0">${av}</div><span class="text-xs font-bold text-gray-700 truncate">${window.escapeHTML(u.name).split(' ')[0]}</span></div>`;
                        }
                    });
                    frPreviewDiv.innerHTML = html || '<p class="col-span-2 text-center text-gray-400 text-xs py-2">ডেটা লোড করা যায়নি</p>';
                });
            } else {
                frPreviewDiv.innerHTML = '<p class="col-span-2 text-center text-gray-400 text-xs py-2">এখনো ফ্রেন্ড নেই</p>';
            }
        }

        // Debounced Search Handler for People
        window.debouncedPeopleSearch = window.debounce((q) => {
            q = q.trim();
            const div = document.getElementById('users-list');
            if (!q) {
                renderPeopleList(window.allUsers, false);
                return;
            }
            div.innerHTML = '<p class="text-center text-gray-400 mt-4">খুজছে...</p>';
            const usersRef = ref(window.db, 'users');
            const qRef = query(usersRef, orderByChild('name'), startAt(q), endAt(q + "\uf8ff"), limitToFirst(20));
            get(qRef).then((snap) => {
                const results = [];
                snap.forEach((child) => {
                    if (child.key !== window.currentUser.uid) results.push(child.val());
                });
                if (results.length > 0) renderPeopleList(results, true);
                else div.innerHTML = '<p class="text-center text-gray-400 mt-4">কাউকে পাওয়া যায়নি</p>';
            });
        }, 500);

        window.toggleFriendRequest = (toUid) => {
            const btn = document.getElementById(`btn-req-${toUid}`);
            const isCancel = btn.innerText.includes('Cancel');
            btn.disabled = true;
            btn.innerText = "...";
            const refPath = isCancel ? `friend_requests/${toUid}/${window.currentUser.uid}` : `friend_requests/${toUid}/${window.currentUser.uid}`;
            const action = isCancel ? remove(ref(window.db, refPath)) : set(ref(window.db, refPath), {
                fromName: window.userDetails.name,
                fromUid: window.currentUser.uid,
                timestamp: Date.now()
            });
            action.then(() => {
                window.showToast(isCancel ? "রিকুয়েস্ট বাতিল করা হয়েছে" : "রিকুয়েস্ট পাঠানো হয়েছে!");
                btn.classList.toggle('bg-blue-600');
                btn.classList.toggle('bg-gray-200');
                btn.classList.toggle('text-white');
                btn.classList.toggle('text-gray-600');
                btn.innerHTML = isCancel ? '<i class="fa-solid fa-user-plus"></i> Add' : 'Cancel';
                btn.disabled = false;
            }).catch(e => {
                window.showToast("ত্রুটি: " + e.message, 'error');
                btn.disabled = false;
            });
        };
        window.checkRequestStatus = (targetUid) => get(ref(window.db, `friend_requests/${targetUid}/${window.currentUser.uid}`)).then(s => {
            const btn = document.getElementById(`btn-req-${targetUid}`);
            if (btn && s.exists()) {
                btn.classList.remove('bg-blue-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-600');
                btn.innerHTML = 'Cancel';
            }
        });
        window.unfriend = (uid) => confirm("আনফ্রেন্ড করবেন?") && update(ref(window.db), {
            [`users/${window.currentUser.uid}/friends/${uid}`]: null,
            [`users/${uid}/friends/${window.currentUser.uid}`]: null
        }).then(() => {
            window.showToast("আনফ্রেন্ড করা হয়েছে");
            if (window.currentChatUser?.uid === uid) window.closeChat();
            get(ref(window.db, `users/${window.currentUser.uid}/friends`)).then(s => {
                window.myFriends = Object.keys(s.val() || {});
                updatePeopleTab();
                // আনফ্রেন্ড করলে লিস্ট অটো রিফ্রেশ হবে
                if(!document.getElementById('page-friends-list').classList.contains('hidden')) window.loadAllFriendsList();
            });
        });

        // --- সকল বন্ধুর লিস্ট লোড করার ফাংশন ---
        window.loadAllFriendsList = () => {
            const container = document.getElementById('all-friends-container');
            container.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';

            if (window.myFriends && window.myFriends.length > 0) {
                // নিশ্চিত করা হচ্ছে প্রতিটি অবজেক্টে সঠিক uid প্রোপার্টি সংযুক্ত আছে
                Promise.all(window.myFriends.map(async (uid) => {
                    const data = await window.getUserData(uid);
                    if (data) return { ...data, uid };
                    return null;
                })).then(friendsData => {
                    let html = '';
                    friendsData.forEach(u => {
                        if (u) {
                            let av = u.profile_pic ? `<img alt="" src="${u.profile_pic}" loading="lazy" class="w-12 h-12 rounded-full object-cover shadow-sm">` : `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-xl">${window.escapeHTML(u.name).charAt(0)}</div>`;
                            html += `<div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                                <div onclick="window.openUserProfile('${u.uid}')" class="cursor-pointer shrink-0">${av}</div>
                                <div onclick="window.openUserProfile('${u.uid}')" class="flex-1 cursor-pointer min-w-0">
                                    <h4 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(u.name)}${window.checkUserBadge(u)}</h4>
                                    <p class="text-xs text-gray-500 truncate">${window.escapeHTML(u.profession || 'সদস্য')}</p>
                                </div>
                                <button type="button" onclick="window.startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="shrink-0 w-9 h-9 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-100 transition"><i class="fa-brands fa-facebook-messenger text-sm"></i></button>
                                <button type="button" onclick="unfriend('${u.uid}')" class="shrink-0 w-9 h-9 bg-red-50 text-red-600 rounded-full flex items-center justify-center hover:bg-red-100 transition"><i class="fa-solid fa-user-xmark text-sm"></i></button>
                            </div>`;
                        }
                    });
                    container.innerHTML = html;
                });
            } else {
                container.innerHTML = '<p class="text-center text-gray-400 py-10">আপনার এখনো কোনো ফ্রেন্ড নেই</p>';
            }
        };

        window.checkFriendshipStatus = function(targetUid, targetName) {
            const actionDiv = document.getElementById('view-profile-actions');
            actionDiv.innerHTML = '<button type="button" class="w-full bg-gray-200 py-2 rounded-lg text-sm font-bold">Checking...</button>';

            // প্রথমে চেক করবে ইউজার ডিএক্টিভ কিনা
            get(ref(window.db, `users/${targetUid}/status`)).then(statusSnap => {
                if (statusSnap.val() === 'deactivated') {
                    actionDiv.innerHTML = `<button type="button" class="w-full bg-gray-200 text-gray-500 py-2 rounded-lg font-bold text-sm cursor-not-allowed">একাউন্টটি বর্তমানে ডিএক্টিভ রয়েছে</button>`;
                    return;
                }

                // ডিএক্টিভ না থাকলে নরমাল রিকোয়েস্ট/মেসেজ লজিক কাজ করবে
                get(ref(window.db, `users/${window.currentUser.uid}/friends/${targetUid}`)).then(snap => {
                    if (snap.exists()) actionDiv.innerHTML = `<button type="button" onclick="window.startChat('${targetUid}', '${window.escapeHTML(targetName)}')" class="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:bg-blue-700 flex items-center justify-center gap-2"><i class="fa-brands fa-facebook-messenger"></i> মেসেজ</button><button type="button" onclick="unfriend('${targetUid}')" class="w-12 bg-red-100 text-red-600 py-2 rounded-lg font-bold text-sm hover:bg-red-200 flex items-center justify-center"><i class="fa-solid fa-user-xmark"></i></button>`;
                    else get(ref(window.db, `friend_requests/${targetUid}/${window.currentUser.uid}`)).then(reqSnap => {
                        if (reqSnap.exists()) actionDiv.innerHTML = `<button type="button" onclick="toggleFriendRequest('${targetUid}')" class="flex-1 bg-gray-200 text-gray-600 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2">Cancel Request</button>`;
                        else get(ref(window.db, `friend_requests/${window.currentUser.uid}/${targetUid}`)).then(incSnap => {
                            if (incSnap.exists()) actionDiv.innerHTML = `<button type="button" onclick="acceptRequest('${targetUid}')" class="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:bg-green-700 flex items-center justify-center gap-2">Confirm</button><button type="button" onclick="cancelRequest('${targetUid}', true)" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-bold text-sm hover:bg-gray-300 flex items-center justify-center gap-2">Delete</button>`;
                            else actionDiv.innerHTML = `<button type="button" onclick="sendFriendRequest('${targetUid}')" class="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:bg-blue-700 flex items-center justify-center gap-2"><i class="fa-solid fa-user-plus"></i> অ্যাড ফ্রেন্ড</button><button type="button" onclick="window.startChat('${targetUid}', '${window.escapeHTML(targetName)}')" class="flex-1 bg-gray-200 text-black py-2 rounded-lg font-bold text-sm hover:bg-gray-300 flex items-center justify-center gap-2"><i class="fa-brands fa-facebook-messenger"></i> মেসেজ</button>`;
                        });
                    });
                });
            });
        }

        window.sendFriendRequest = (toUid) => set(ref(window.db, `friend_requests/${toUid}/${window.currentUser.uid}`), {
            fromName: window.userDetails.name,
            fromUid: window.currentUser.uid,
            timestamp: Date.now()
        }).then(() => {
            window.showToast("রিকুয়েস্ট পাঠানো হয়েছে!");
            window.checkFriendshipStatus(toUid, "User");
        });

        window.listenForFriendRequests = function listenForFriendRequests(uid) {
            onValue(ref(window.db, `friend_requests/${uid}`), updatePeopleTab);
        }

        // রিয়েল-টাইম আনরিড মেসেজ কাউন্টার এবং লাল ডট আপডেট লজিক
        window.listenForUnreadMessages = function listenForUnreadMessages(uid) {
            onValue(ref(window.db, `user_chats/${uid}`), (snapshot) => {
                let totalUnread = 0;
                if (snapshot.exists()) {
                    snapshot.forEach((child) => {
                        const chatInfo = child.val();
                        if (chatInfo && chatInfo.unread) {
                            totalUnread += parseInt(chatInfo.unread) || 0;
                        }
                    });
                }

                const badge = document.getElementById('nav-badge-messages');
                if (badge) {
                    if (totalUnread > 0) {
                        badge.innerText = totalUnread > 99 ? '99+' : totalUnread;
                        badge.style.display = 'block';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            });
        }

        window.acceptRequest = (fromUid) => update(ref(window.db), {
            [`users/${window.currentUser.uid}/friends/${fromUid}`]: true,
            [`users/${fromUid}/friends/${window.currentUser.uid}`]: true,
            [`friend_requests/${window.currentUser.uid}/${fromUid}`]: null
        }).then(() => {
            window.showToast("রিকুয়েস্ট এক্সেপ্ট করা হয়েছে!");
            get(ref(window.db, `users/${window.currentUser.uid}/friends`)).then((snap) => {
                window.myFriends = Object.keys(snap.val() || {});
                updatePeopleTab();
                window.loadQuickChatFriends();
            });
        });
        window.cancelRequest = (fromUid, isDelete) => remove(ref(window.db, isDelete ? `friend_requests/${window.currentUser.uid}/${fromUid}` : `friend_requests/${fromUid}/${window.currentUser.uid}`)).then(() => {
            window.showToast("রিকুয়েস্ট ডিলিট/বাতিল করা হয়েছে");
            if (!isDelete) {
                const btn = document.getElementById(`btn-req-${fromUid}`);
                if (btn) {
                    btn.classList.replace('bg-gray-200', 'bg-blue-600');
                    btn.classList.replace('text-gray-600', 'text-white');
                    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Add';
                    btn.disabled = false;
                }
            }
        });


// --- PULL TO REFRESH LOGIC FOR PEOPLE PAGE ---
let touchStartY = 0;
let isPulling = false;

const peoplePage = document.getElementById('page-people');
const ptrIndicator = document.getElementById('pull-to-refresh-indicator');

peoplePage.addEventListener('touchstart', (e) => {
    // শুধু তখনই কাজ করবে যখন পেজটি একদম উপরে থাকবে (স্ক্রল করা অবস্থায় নয়)
    if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
        ptrIndicator.style.transition = 'none'; // টানার সময় অ্যানিমেশন বন্ধ থাকবে
    }
}, { passive: true });

peoplePage.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const currentY = e.touches[0].clientY;
    const pullDistance = currentY - touchStartY;

    // যদি নিচের দিকে টানে এবং স্ক্রল একদম উপরে থাকে
    if (pullDistance > 0 && window.scrollY === 0) {
        // একটি নির্দিষ্ট লিমিট পর্যন্ত স্পিনারটি বড় হবে (Resistance)
        const height = Math.min(pullDistance * 0.4, 70);
        ptrIndicator.style.height = `${height}px`;
    }
}, { passive: true });

peoplePage.addEventListener('touchend', (e) => {
    if (!isPulling) return;
    isPulling = false;
    ptrIndicator.style.transition = 'height 0.3s ease'; // ছেড়ে দিলে অ্যানিমেশন চালু হবে

    const currentHeight = parseInt(ptrIndicator.style.height || '0');

    // যদি যথেষ্ট নিচে টানা হয় (যেমন 50px এর বেশি), তাহলে রিফ্রেশ হবে
    if (currentHeight > 50) {
        ptrIndicator.style.height = '60px'; // লোডিং অবস্থায় স্পিনারটি দেখাবে

        // নতুন ডাটা কল করা
        window.refreshPeople();

        // ১.৫ সেকেন্ড পর স্পিনার লুকিয়ে ফেলবে
        setTimeout(() => {
            ptrIndicator.style.height = '0px';
        }, 1500);
    } else {
        // যথেষ্ট না টানলে স্পিনার আবার লুকিয়ে যাবে
        ptrIndicator.style.height = '0px';
    }
});

