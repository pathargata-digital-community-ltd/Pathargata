// --- GAMIFICATION & REWARD SYSTEM ---

window.addPoints = async (uid, pointsToAdd, reason) => {
    if(!window.firebaseHelpers) return;
    const { db, ref, runTransaction, push } = window.firebaseHelpers;
    
    const userRef = ref(db, `users/${uid}/points`);
    try {
        await runTransaction(userRef, (currentPoints) => {
            return (currentPoints || 0) + pointsToAdd;
        });
        
        await push(ref(db, `point_history/${uid}`), {
            amount: pointsToAdd,
            reason: reason,
            timestamp: Date.now()
        });
    } catch(e) { console.error("Point update error", e); }
};

window.copyReferralCode = () => {
    if(!window.currentUser) return;
    navigator.clipboard.writeText(window.currentUser.uid).then(() => {
        if(window.showToast) window.showToast("রেফার কোড কপি হয়েছে!", "success");
    });
};

window.submitReferralCode = async (btnElem) => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, get, update } = window.firebaseHelpers;
    const code = document.getElementById('input-referral-code').value.trim();
    const myUid = window.currentUser.uid;

    if(!code) return window.showToast("কোড দিন!", "error");
    if(code === myUid) return window.showToast("নিজের কোড নিজে ব্যবহার করা যাবে না!", "error");

    btnElem.disabled = true;
    btnElem.innerText = 'অপেক্ষা করুন...';

    try {
        // চেক করা হচ্ছে ইউজার আগেই কোড ব্যবহার করেছে কিনা
        const mySnap = await get(ref(db, `users/${myUid}`));
        const myData = mySnap.val() || {};

        if(myData.referred_by) {
            window.showToast("আপনি ইতিমধ্যে একটি কোড ব্যবহার করেছেন!", "error");
            btnElem.disabled = false;
            btnElem.innerText = 'সাবমিট';
            return;
        }

        // যার কোড তার ডাটা চেক করা
        const targetSnap = await get(ref(db, `users/${code}`));
        if(targetSnap.exists()) {
            await update(ref(db, `users/${myUid}`), { referred_by: code });
            
            await window.addPoints(code, 50, "Referral Bonus (Invited a friend)");
            await window.addPoints(myUid, 10, "Welcome Bonus (Used a code)");

            window.showToast("রেফার কোড সফলভাবে যুক্ত হয়েছে!", "success");
            
            const statusText = document.getElementById('referral-status-text');
            if(statusText) statusText.innerText = "আপনি ইতিমধ্যে কোড ব্যবহার করেছেন।";
            document.getElementById('input-referral-code').disabled = true;
        } else {
            window.showToast("ভুল বা ইনভ্যালিড রেফার কোড!", "error");
        }
    } catch(e) {
        window.showToast("এরর: " + e.message, "error");
    } finally {
        btnElem.disabled = false;
        btnElem.innerText = 'সাবমিট';
    }
};

window.requestWithdraw = async () => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, push, get } = window.firebaseHelpers;
    const uid = window.currentUser.uid;

    try {
        const userSnap = await get(ref(db, `users/${uid}`));
        const userData = userSnap.val() || {};
        const currentPoints = userData.points || 0;
        const balanceTk = Math.floor(currentPoints / 100);

        if(currentPoints < 5000) { 
            return window.showToast(`উত্তোলনের জন্য কমপক্ষে ৫০০০ পয়েন্ট (৫০ টাকা) প্রয়োজন। আপনার আছে ${currentPoints} পয়েন্ট।`, "error");
        }

        const amount = prompt(`আপনার ব্যালেন্স: ${balanceTk} টাকা।\nকত টাকা তুলতে চান? (১০০ পয়েন্ট = ১ টাকা)`);
        if(!amount || isNaN(amount)) return;
        
        const tk = parseInt(amount);
        const pointsNeeded = tk * 100;

        if(tk < 50) return window.showToast("কমপক্ষে ৫০ টাকা তুলতে হবে", "error");
        if(currentPoints < pointsNeeded) return window.showToast("আপনার পর্যাপ্ত পয়েন্ট নেই!", "error");

        const method = prompt("কিসে টাকা নিবেন? (Bkash / Nagad / Rocket)");
        if(!method) return;
        const phone = prompt("আপনার একাউন্ট নাম্বার দিন:");
        if(!phone) return;

        // পয়েন্ট কেটে নেওয়া
        await window.addPoints(uid, -pointsNeeded, `Withdraw Request (${tk} Tk)`);

        await push(ref(db, 'withdraw_requests'), {
            uid: uid,
            name: userData.name || "Unknown",
            amountTk: tk,
            pointsDeducted: pointsNeeded,
            method: method,
            phone: phone,
            status: 'pending',
            timestamp: Date.now()
        });

        window.showToast("উইথড্র রিকোয়েস্ট সফলভাবে পাঠানো হয়েছে!", "success");
        window.checkMonetizationStatus(); 
    } catch(e) {
        window.showToast("এরর: " + e.message, "error");
    }
};

window.checkMonetizationStatus = async () => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, get, query, orderByChild, equalTo } = window.firebaseHelpers;
    const uid = window.currentUser.uid;

    try {
        const userSnap = await get(ref(db, `users/${uid}`));
        const userData = userSnap.val() || {};
        const hasVerified = !!userData.isVerified;
        const points = userData.points || 0;

        const friendsSnap = await get(ref(db, `users/${uid}/friends`));
        const friendCount = friendsSnap.exists() ? Object.keys(friendsSnap.val()).length : 0;

        const postsSnap = await get(query(ref(db, 'posts'), orderByChild('uid'), equalTo(uid)));
        const postCount = postsSnap.exists() ? Object.keys(postsSnap.val()).length : 0;

        const reqSnap = await get(query(ref(db, 'monetization_requests'), orderByChild('uid'), equalTo(uid)));
        let isApproved = false;
        let requestStatus = 'none';

        if (reqSnap.exists()) {
            const requests = reqSnap.val();
            // সর্বশেষ স্ট্যাটাস চেক করা
            const latestReq = Object.values(requests).sort((a,b) => b.timestamp - a.timestamp)[0];
            requestStatus = latestReq.status;
            if(requestStatus === 'approved') isApproved = true;
        }

        if (isApproved) {
            document.getElementById('monetization-criteria-section').classList.add('hidden-custom');
            document.getElementById('monetization-dashboard').classList.remove('hidden-custom');
            
            const balance = (points / 100).toFixed(2);
            document.getElementById('m-points-display').innerText = points;
            document.getElementById('m-balance-display').innerText = balance + ' ৳';
        } else {
            window.updateMonetizationUI(friendCount, hasVerified, postCount, requestStatus);
        }
    } catch(e) {
        console.error(e);
    }
};

window.updateMonetizationUI = (friends, verified, posts, requestStatus) => {
    const btn = document.getElementById('btn-monetization-apply');
    if(!btn) return;

    const fIcon = document.getElementById('crit-follower-icon');
    if(fIcon) {
        if (friends >= 50 || posts >= 50) {
            fIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
            fIcon.className = 'criteria-icon criteria-check';
        } else {
            fIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            fIcon.className = 'criteria-icon criteria-cross';
        }
    }

    const pIcon = document.getElementById('crit-post-icon');
    if(pIcon) {
        if (posts >= 50) {
            pIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
            pIcon.className = 'criteria-icon criteria-check';
        } else {
            pIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            pIcon.className = 'criteria-icon criteria-cross';
        }
    }

    const vIcon = document.getElementById('crit-verified-icon');
    if(vIcon) {
        if (verified) {
            vIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
            vIcon.className = 'criteria-icon criteria-check';
        } else {
            vIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            vIcon.className = 'criteria-icon criteria-cross';
        }
    }

    // যেকোনো একটি ক্রাইটেরিয়া (৫০ ফ্রেন্ড অথবা ৫০ পোস্ট) এবং ভেরিফাইড হলে এপ্লাই করতে পারবে
    if ((friends >= 50 || posts >= 50) && verified) {
        if (requestStatus === 'pending') {
            btn.innerHTML = 'আবেদন রিভিউতে আছে';
            btn.disabled = true;
        } else {
            btn.innerHTML = 'আবেদন করুন';
            btn.disabled = false;
        }
    } else {
        btn.disabled = true;
        btn.innerHTML = 'আবেদন করুন';
    }
};

window.applyForMonetization = async () => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, push, get } = window.firebaseHelpers;
    const btn = document.getElementById('btn-monetization-apply');
    const uid = window.currentUser.uid;
    
    btn.innerHTML = 'আবেদন জমা হচ্ছে...';
    btn.disabled = true;
    
    try {
        const userSnap = await get(ref(db, `users/${uid}`));
        const userData = userSnap.val() || {};

        await push(ref(db, 'monetization_requests'), {
            uid: uid,
            name: userData.name || "Unknown",
            timestamp: Date.now(),
            status: 'pending'
        });

        window.showToast("আবেদন সফলভাবে জমা হয়েছে!", "success");
        btn.innerHTML = 'আবেদন রিভিউতে আছে';
    } catch(e) {
        window.showToast("সমস্যা হয়েছে: " + e.message, "error");
        btn.disabled = false;
        btn.innerHTML = 'আবেদন করুন';
    }
};
