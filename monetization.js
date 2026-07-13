import {
    ref,
    get,
    set,
    update,
    push,
    runTransaction,
    onValue,
    query,
    orderByChild,
    equalTo
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ডাটাবেস ইনস্ট্যান্স মেইন ফাইল থেকে নেওয়া হচ্ছে
const db = window.db;

// --- GLOBALS FOR MONETIZATION & POINTS ---
window.dynamicPoints = {
    refer: 50, 
    post: 5, 
    like: 1, 
    comment: 2, 
    limit_post: 5, 
    limit_like: 20, 
    limit_comment: 20, 
    min_withdraw: 1000,
    taka_per_1000: 10
};

// Fetch Dynamic Points from Admin Settings
onValue(ref(db, 'admin_settings/point_system'), (snap) => {
    if(snap.exists()){
        window.dynamicPoints = { ...window.dynamicPoints, ...snap.val() };
        // মনিটাইজেশন পেজ যদি খোলা থাকে তবে ইন্সট্যান্ট UI রিফ্রেশ করবে
        const page = document.getElementById('page-monetization');
        if (page && !page.classList.contains('hidden')) {
            window.checkMonetizationStatus();
        }
    }
});

// --- CORE POINT AWARDING SYSTEM WITH DAILY LIMITS ---
window.awardPoints = async (actionType) => {
    if (!window.currentUser) return;
    if (!window.userDetails || window.userDetails.monetization_status !== 'approved') return;

    const uid = window.currentUser.uid;
    const today = new Date().toLocaleDateString('en-GB'); // Format: DD/MM/YYYY
    const trackerRef = ref(db, `users/${uid}/daily_tracker/${today}`);
    
    try {
        const snap = await get(trackerRef);
        let tracker = snap.exists() ? snap.val() : { post: 0, like: 0, comment: 0 };
        
        // Fetch dynamic limits & points
        const limit = window.dynamicPoints[`limit_${actionType}`] || 0;
        const pointsToAward = window.dynamicPoints[actionType] || 0;

        if (tracker[actionType] < limit) {
            // Update Tracker
            tracker[actionType] += 1;
            await set(trackerRef, tracker);

            // Award Points using Transaction
            await runTransaction(ref(db, `users/${uid}/total_points`), (currentPoints) => {
                return (currentPoints || 0) + pointsToAward;
            });
        }
    } catch (error) {
        console.error("Point Award Error:", error);
    }
};

// --- UPDATE UI FOR DASHBOARD & QUALIFICATION ---
window.checkMonetizationStatus = async () => {
    if (!window.currentUser || !window.userDetails) return;
    
    const uid = window.currentUser.uid;
    const qualView = document.getElementById('monetization-qualification-view');
    const dashView = document.getElementById('monetization-dashboard-view');
    
    // সেফগার্ড: এলিমেন্টগুলো পেজে রেন্ডার না হলে এক্সিকিউশন বন্ধ রাখবে
    if (!qualView || !dashView) return; 

    const pts = window.userDetails.total_points || 0;
    const refCount = window.userDetails.referral_count || 0;
    
    // Approved State
    if (window.userDetails.monetization_status === 'approved') {
        qualView.classList.add('hidden');
        dashView.classList.remove('hidden');

        // Update Dashboard Values
        const totalPointsEl = document.getElementById('dash-total-points');
        const totalReferEl = document.getElementById('dash-total-refer');
        const minWithdrawTextEl = document.getElementById('min-withdraw-text');
        const takaValEl = document.getElementById('taka-value-display');
        const pointValEl = document.getElementById('point-value-display');

        if (totalPointsEl) totalPointsEl.innerHTML = `${pts} <i class="fa-solid fa-coins text-yellow-300 text-3xl"></i>`;
        if (totalReferEl) totalReferEl.innerText = refCount;
        if (minWithdrawTextEl) minWithdrawTextEl.innerText = window.dynamicPoints.min_withdraw || 1000;
        if (takaValEl) takaValEl.innerText = window.dynamicPoints.taka_per_1000 || 10;
        if (pointValEl) pointValEl.innerText = "1000";

        window.loadWithdrawalHistory();

        // Load Today's Tracker
        const today = new Date().toLocaleDateString('en-GB');
        get(ref(db, `users/${uid}/daily_tracker/${today}`)).then(snap => {
            const t = snap.exists() ? snap.val() : { post: 0, like: 0, comment: 0 };
            
            const postTrackerEl = document.getElementById('dash-today-post');
            const likeTrackerEl = document.getElementById('dash-today-like');
            const commentTrackerEl = document.getElementById('dash-today-comment');

            if (postTrackerEl) postTrackerEl.innerText = `${t.post || 0}/${window.dynamicPoints.limit_post}`;
            if (likeTrackerEl) likeTrackerEl.innerText = `${t.like || 0}/${window.dynamicPoints.limit_like}`;
            if (commentTrackerEl) commentTrackerEl.innerText = `${t.comment || 0}/${window.dynamicPoints.limit_comment}`;
        });
    } else {
        // Qualification View
        dashView.classList.add('hidden');
        qualView.classList.remove('hidden');
        
        const qualPointsEl = document.getElementById('qual-points');
        const qualReferEl = document.getElementById('qual-refer');
        const critFriendTextEl = document.getElementById('crit-friend-text');
        const critPostTextEl = document.getElementById('crit-post-text');

        if (qualPointsEl) qualPointsEl.innerText = pts;
        if (qualReferEl) qualReferEl.innerText = refCount;

        const isVerified = !!window.userDetails.isVerified;
        const friendCount = window.myFriends ? window.myFriends.length : 0;
        const postSnap = await get(query(ref(db, 'posts'), orderByChild('uid'), equalTo(uid)));
        const postCount = postSnap.exists() ? Object.keys(postSnap.val()).length : 0;

        // Update UI Criteria Text
        if (critFriendTextEl) critFriendTextEl.innerText = `বর্তমান: ${friendCount}/50`;
        if (critPostTextEl) critPostTextEl.innerText = `বর্তমান: ${postCount}/15`;

        const toggleIcon = (id, passed) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (passed) {
                el.className = "w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600";
                el.innerHTML = '<i class="fa-solid fa-check"></i>';
            } else {
                el.className = "w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400";
                el.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            }
        };

        toggleIcon('crit-friend-icon', friendCount >= 50);
        toggleIcon('crit-verify-icon', isVerified);
        toggleIcon('crit-post-icon', postCount >= 15);

        const btn = document.getElementById('btn-monetization-apply');
        if (!btn) return;

        if (window.userDetails.monetization_status === 'pending') {
            btn.innerText = "আবেদন রিভিউতে আছে";
            btn.disabled = true;
        } else if (friendCount >= 50 && isVerified && postCount >= 15) {
            btn.innerText = "মনিটাইজেশনের আবেদন করুন";
            btn.disabled = false;
        } else {
            btn.innerText = "শর্ত পূরণ হয়নি";
            btn.disabled = true;
        }
    }
};

window.applyForMonetization = async () => {
    if (!window.currentUser) return;
    const btn = document.getElementById('btn-monetization-apply');
    if (!btn) return;

    btn.innerHTML = 'আবেদন জমা হচ্ছে...';
    btn.disabled = true;
    try {
        await update(ref(db, `users/${window.currentUser.uid}`), { monetization_status: 'pending' });
        await set(ref(db, `monetization_requests/${window.currentUser.uid}`), {
            uid: window.currentUser.uid,
            name: window.userDetails.name || "User",
            timestamp: Date.now(),
            status: 'pending'
        });
        window.userDetails.monetization_status = 'pending';
        window.showToast("আবেদন সফলভাবে জমা হয়েছে!");
        window.checkMonetizationStatus();
    } catch (e) {
        window.showToast("সমস্যা হয়েছে: " + e.message, "error");
        btn.innerHTML = 'আবেদন করুন';
        btn.disabled = false;
    }
};

// --- WITHDRAWAL LOGIC ---
window.submitWithdrawal = async () => {
    if (!window.currentUser) return;
    const method = document.getElementById('withdraw-method').value;
    const accNumber = document.getElementById('withdraw-number').value.trim();
    const withdrawAmtInput = document.getElementById('withdraw-amount');
    const amount = withdrawAmtInput ? parseInt(withdrawAmtInput.value) : 0;
    const uid = window.currentUser.uid;

    if (!accNumber) return window.showToast("একাউন্ট নাম্বার দিন", "error");
    if (isNaN(amount) || amount < window.dynamicPoints.min_withdraw) {
        return window.showToast(`সর্বনিম্ন ${window.dynamicPoints.min_withdraw} পয়েন্ট তুলতে পারবেন`, "error");
    }

    const btn = document.getElementById('btn-withdraw');
    if (!btn) return;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> প্রসেস হচ্ছে...';
    btn.disabled = true;

    try {
        // Use Transaction to safely deduct points
        const pointsRef = ref(db, `users/${uid}/total_points`);
        const transactionResult = await runTransaction(pointsRef, (currentPoints) => {
            if (currentPoints === null) return currentPoints;
            if (currentPoints >= amount) {
                return currentPoints - amount;
            } else {
                return undefined; // Abort transaction
            }
        });

        if (transactionResult.committed) {
            // Points deducted successfully, save request to admin panel
            await push(ref(db, 'withdraw_requests'), {
                uid: uid,
                name: window.userDetails.name || "User",
                method: method,
                account_number: accNumber,
                points_withdrawn: amount,
                timestamp: Date.now(),
                status: 'pending'
            });
            
            window.userDetails.total_points = (window.userDetails.total_points || 0) - amount; // Update local state
            if (withdrawAmtInput) withdrawAmtInput.value = "";
            window.showToast("উত্তোলন রিকোয়েস্ট সফল হয়েছে!", "success");
            window.checkMonetizationStatus(); // Refresh Dashboard UI
            window.loadWithdrawalHistory(); // রিফ্রেশ হিস্ট্রি লিস্ট
        } else {
            window.showToast("আপনার পর্যাপ্ত পয়েন্ট নেই!", "error");
        }
    } catch (err) {
        window.showToast("ত্রুটি: " + err.message, "error");
    } finally {
        btn.innerHTML = 'উত্তোলন রিকোয়েস্ট পাঠান';
        btn.disabled = false;
    }
};

// --- LOAD WITHDRAWAL HISTORY ---
window.loadWithdrawalHistory = () => {
    if (!window.currentUser) return;
    const uid = window.currentUser.uid;
    const historyContainer = document.getElementById('withdrawal-history-list');
    
    if (!historyContainer) return;

    // ডাটাবেস থেকে ইউজারের হিস্ট্রি খোঁজা
    const historyQuery = query(ref(db, 'withdraw_requests'), orderByChild('uid'), equalTo(uid));
    
    get(historyQuery).then((snap) => {
        if (!snap.exists()) {
            historyContainer.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">আপনার কোনো উত্তোলনের হিসেব নেই</p>';
            return;
        }

        const data = snap.val();
        const requests = Object.values(data).sort((a, b) => b.timestamp - a.timestamp); // নতুনগুলো উপরে

        historyContainer.innerHTML = requests.map(req => {
            let statusBadge = '';
            // স্ট্যাটাস অনুযায়ী ব্যাজের রং
            if (req.status === 'approved') {
                statusBadge = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-check mr-1"></i>Approved</span>';
            } else if (req.status === 'rejected') {
                statusBadge = '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-xmark mr-1"></i>Rejected</span>';
            } else {
                statusBadge = '<span class="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-clock mr-1"></i>Pending</span>';
            }

            // তারিখ ফরমেট
            const dateStr = new Date(req.timestamp).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });

            return `
            <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center animate-fade">
                <div>
                    <h4 class="font-bold text-gray-800 text-sm">${req.points_withdrawn} পয়েন্ট <span class="text-xs text-gray-400 font-normal">(${req.method})</span></h4>
                    <p class="text-[10px] text-gray-500 mt-1">${dateStr}</p>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>`;
        }).join('');
    }).catch(err => {
        console.error("History Load Error:", err);
        historyContainer.innerHTML = '<p class="text-center text-red-400 py-4 text-xs">হিস্ট্রি লোড করতে সমস্যা হয়েছে</p>';
    });
};