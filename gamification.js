// --- GAMIFICATION & REWARD SYSTEM (Hosted on GitHub) ---

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
        if(window.showToast) window.showToast("রেফার কোড কপি হয়েছে!");
    });
};

window.submitReferralCode = async (btnElem) => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, get, update } = window.firebaseHelpers;
    const code = document.getElementById('input-referral-code').value.trim();
    const myUid = window.currentUser.uid;
    const myDetails = window.appUserDetails || {};

    if(!code) return window.showToast("কোড দিন!", "error");
    if(code === myUid) return window.showToast("নিজের কোড নিজে ব্যবহার করা যাবে না!", "error");
    if(myDetails.referred_by) return window.showToast("আপনি ইতিমধ্যে একটি কোড ব্যবহার করেছেন!", "error");

    btnElem.disabled = true;
    btnElem.innerText = 'অপেক্ষা করুন...';

    try {
        const snap = await get(ref(db, `users/${code}`));
        if(snap.exists()) {
            await update(ref(db, `users/${myUid}`), { referred_by: code });
            
            await window.addPoints(code, 50, "Referral Bonus (Invited a friend)");
            await window.addPoints(myUid, 10, "Welcome Bonus (Used a code)");

            window.showToast("রেফার কোড সফলভাবে যুক্ত হয়েছে!", "success");
            
            if(window.appUserDetails) window.appUserDetails.referred_by = code; 
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

window.requestWithdraw = () => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, push } = window.firebaseHelpers;
    const myDetails = window.appUserDetails || {};
    const currentPoints = myDetails.points || 0;
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

    window.addPoints(window.currentUser.uid, -pointsNeeded, `Withdraw Request (${tk} Tk)`);

    push(ref(db, 'withdraw_requests'), {
        uid: window.currentUser.uid,
        name: myDetails.name || "Unknown",
        amountTk: tk,
        pointsDeducted: pointsNeeded,
        method: method,
        phone: phone,
        status: 'pending',
        timestamp: Date.now()
    }).then(() => {
        window.showToast("উইথড্র রিকোয়েস্ট সফলভাবে পাঠানো হয়েছে!", "success");
        window.checkMonetizationStatus(); 
    });
};

window.checkMonetizationStatus = () => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, get, query, orderByChild, equalTo } = window.firebaseHelpers;
    
    const myDetails = window.appUserDetails || {};
    const hasVerified = !!myDetails.isVerified;
    const friendCount = window.appMyFriends ? window.appMyFriends.length : 0;
    const uid = window.currentUser.uid;

    get(ref(db, `monetization_requests/${uid}`)).then(reqSnap => {
        let isApproved = false;
        let requestStatus = 'none';

        if (reqSnap.exists()) {
            const reqData = reqSnap.val();
            const latestReq = Object.values(reqData).pop();
            requestStatus = latestReq.status;
            if(requestStatus === 'approved') isApproved = true;
        }

        if (isApproved) {
            document.getElementById('monetization-criteria-section').classList.add('hidden-custom');
            document.getElementById('monetization-dashboard').classList.remove('hidden-custom');
            
            const points = myDetails.points || 0;
            const balance = (points / 100).toFixed(2);
            document.getElementById('m-points-display').innerText = points;
            document.getElementById('m-balance-display').innerText = balance + ' ৳';
        } else {
            get(query(ref(db, 'posts'), orderByChild('uid'), equalTo(uid))).then(snap => {
                const postCount = snap.exists() ? Object.keys(snap.val()).length : 0;
                window.updateMonetizationUI(friendCount, hasVerified, postCount, requestStatus);
            });
        }
    });
};

window.updateMonetizationUI = (friends, verified, posts, requestStatus) => {
    const btn = document.getElementById('btn-monetization-apply');
    if(!btn) return;

    const fIcon = document.getElementById('crit-follower-icon');
    if(fIcon) {
        if (friends >= 50) fIcon.innerHTML = '<i class="fa-solid fa-check"></i>', fIcon.classList.replace('criteria-cross', 'criteria-check');
        else fIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>', fIcon.classList.replace('criteria-check', 'criteria-cross');
    }

    const pIcon = document.getElementById('crit-post-icon');
    if(pIcon) {
        if (posts >= 50) pIcon.innerHTML = '<i class="fa-solid fa-check"></i>', pIcon.classList.replace('criteria-cross', 'criteria-check');
        else pIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>', pIcon.classList.replace('criteria-check', 'criteria-cross');
    }

    const vIcon = document.getElementById('crit-verified-icon');
    if(vIcon) {
        if (verified) vIcon.innerHTML = '<i class="fa-solid fa-check"></i>', vIcon.classList.replace('criteria-cross', 'criteria-check');
        else vIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>', vIcon.classList.replace('criteria-check', 'criteria-cross');
    }

    if ((friends >= 50 || posts >= 50) && verified) {
        btn.disabled = false;
        if (requestStatus === 'pending') {
            btn.innerHTML = 'আবেদন রিভিউতে আছে';
            btn.disabled = true;
        }
    } else {
        btn.disabled = true;
    }
};

window.applyForMonetization = () => {
    if(!window.firebaseHelpers || !window.currentUser) return;
    const { db, ref, push } = window.firebaseHelpers;
    const btn = document.getElementById('btn-monetization-apply');
    const myDetails = window.appUserDetails || {};
    
    btn.innerHTML = 'আবেদন জমা হচ্ছে...';
    btn.disabled = true;
    
    push(ref(db, 'monetization_requests'), {
        uid: window.currentUser.uid,
        name: myDetails.name || "Unknown",
        timestamp: Date.now(),
        status: 'pending'
    }).then(() => {
        window.showToast("আবেদন সফলভাবে জমা হয়েছে!");
        btn.innerHTML = 'আবেদন করা হয়েছে';
    }).catch(e => {
        window.showToast("সমস্যা হয়েছে: " + e.message, "error");
        btn.disabled = false;
        btn.innerHTML = 'আবেদন করুন';
    });
};
