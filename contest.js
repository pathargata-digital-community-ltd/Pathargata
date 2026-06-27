import {
    ref, set, get, remove, runTransaction, onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CONTEST MODALS & UPLOAD ---
window.toggleContestModal = (show) => {
    const modal = document.getElementById('contest-upload-modal');
    if (show) {
        get(ref(window.db, `contest_participants/${window.currentUser.uid}`)).then((snap) => {
            if (snap.exists()) {
                window.showToast("আপনি ইতিমধ্যে একটি ছবি আপলোড করেছেন!", "error");
            } else {
                document.getElementById('contest-caption').value = '';
                document.getElementById('contest-img-preview').src = '';
                document.getElementById('contest-img-preview').classList.add('hidden');
                document.getElementById('contest-img-input').value = '';
                modal.classList.remove('hidden-custom');
            }
        });
    } else {
        modal.classList.add('hidden-custom');
    }
};

window.previewContestImage = (input) => {
    if (input.files && input.files[0]) {
        const r = new FileReader();
        r.onload = (e) => {
            document.getElementById('contest-img-preview').src = e.target.result;
            document.getElementById('contest-img-preview').classList.remove('hidden');
        };
        r.readAsDataURL(input.files[0]);
    }
};

window.submitContestPhoto = async () => {
    const file = document.getElementById('contest-img-input').files[0];
    const caption = document.getElementById('contest-caption').value.trim();
    if (!file) return window.showToast("দয়া করে একটি ছবি নির্বাচন করুন", "error");

    const btn = document.getElementById('btn-contest-submit');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> আপলোড হচ্ছে...';
    btn.disabled = true;

    try {
        const res = await window.uploadMediaToCloudinary(file);
        const contestData = {
            uid: window.currentUser.uid,
            authorName: window.userDetails.name,
            authorPic: window.userDetails.profile_pic || '',
            image: res.url,
            caption: caption,
            votes: 0,
            timestamp: Date.now()
        };
        await set(ref(window.db, `contest_participants/${window.currentUser.uid}`), contestData);
        window.showToast("প্রতিযোগিতায় আপনার ছবি যুক্ত হয়েছে!", "success");
        window.toggleContestModal(false);
        window.loadContestFeed();
    } catch (e) {
        window.showToast("সমস্যা হয়েছে: " + e.message, "error");
    } finally {
        btn.innerHTML = 'সাবমিট করুন';
        btn.disabled = false;
    }
};

window.toggleContestRulesModal = (show) => {
    const modal = document.getElementById('contest-rules-modal');
    if (show) modal.classList.remove('hidden-custom');
    else modal.classList.add('hidden-custom');
};

window.deleteContestPhoto = async (participantUid) => {
    if(!confirm("আপনি কি নিশ্চিত যে আপনার ছবিটি মুছে ফেলতে চান? আপনার প্রাপ্ত ভোটগুলোও চিরতরে মুছে যাবে।")) return;
    try {
        await remove(ref(window.db, `contest_participants/${participantUid}`));
        window.showToast("আপনার ছবিটি সফলভাবে মুছে ফেলা হয়েছে!", "success");
        window.loadContestFeed();
    } catch (e) {
        window.showToast("মুছে ফেলতে সমস্যা হয়েছে: " + e.message, "error");
    }
};

// --- DYNAMIC DATA LOADER (CHECKS STATUS) ---
window.loadContestFeed = () => {
    const grid = document.getElementById('contest-photos-grid');
    if (!grid) return;
    
    // প্রথমে ডাটাবেস থেকে কনটেস্টের ইনফো এবং স্ট্যাটাস চেক করা হবে
    onValue(ref(window.db, 'admin_settings/contest_info'), async (infoSnap) => {
        const info = infoSnap.val() || {};
        
        // UI Information Update (Active view parts)
        const sponsorEl = document.getElementById('dyn-contest-sponsor');
        const dateEl = document.getElementById('dyn-contest-date');
        const prizeContainer = document.getElementById('dyn-contest-prizes-container');
        const prizeText = document.getElementById('dyn-contest-prizes');
        const rulesList = document.getElementById('dyn-contest-rules-list');

        if(sponsorEl) sponsorEl.innerText = info.sponsor || 'পাথরঘাটা ডিজিটাল';
        if(dateEl) dateEl.innerText = info.endDate || 'অনির্দিষ্ট';
        if(prizeText && prizeContainer) {
            if (info.prizes && info.prizes.trim() !== "") {
                prizeText.innerText = info.prizes;
                prizeContainer.classList.remove('hidden-custom');
            } else {
                prizeContainer.classList.add('hidden-custom');
            }
        }
        if(rulesList) {
            if(info.rules && Array.isArray(info.rules)) {
                rulesList.innerHTML = info.rules.map(rule => `<li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-1"></i> <span>${window.escapeHTML(rule)}</span></li>`).join('');
            } else {
                 rulesList.innerHTML = `<li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-1"></i> <span>কোনো নিয়মাবলি সেট করা নেই।</span></li>`;
            }
        }

        // Fetch Participants
        const partSnap = await get(ref(window.db, 'contest_participants'));
        const data = partSnap.val();
        let participants = data ? Object.values(data).sort((a, b) => (b.votes || 0) - (a.votes || 0)) : [];
        
        const totalEl = document.getElementById('contest-total-participants');
        if(totalEl) totalEl.innerText = `${participants.length} জন`;

        // VIEW SWITCHER LOGIC (Active vs Result)
        const activeView = document.getElementById('contest-active-view');
        const resultView = document.getElementById('contest-result-view');

        if (info.status === 'ended') {
            // শো রেজাল্ট পেজ
            if (activeView) activeView.classList.add('hidden-custom');
            if (resultView) resultView.classList.remove('hidden-custom');
            renderContestResults(participants);
        } else {
            // শো এক্টিভ পেজ
            if (resultView) resultView.classList.add('hidden-custom');
            if (activeView) activeView.classList.remove('hidden-custom');
            renderActiveContestGrid(participants);
        }
    }, { onlyOnce: true });
};

// --- RENDER ACTIVE CONTEST GRID ---
async function renderActiveContestGrid(participants) {
    const grid = document.getElementById('contest-photos-grid');
    if (participants.length === 0) {
        grid.innerHTML = '<p class="col-span-2 text-center text-gray-400 py-10">এখনো কেউ অংশগ্রহণ করেনি</p>';
        return;
    }

    let myVotedUid = null;
    if (window.currentUser) {
        try {
            const myVotesSnap = await get(ref(window.db, `contest_votes_by_user/${window.currentUser.uid}`));
            myVotedUid = myVotesSnap.exists() ? myVotesSnap.val().votedFor : null;
        } catch (e) {}
    }

    grid.innerHTML = participants.map((p, index) => {
        const isVotedByMe = (myVotedUid === p.uid);
        const rankBadge = index === 0 && (p.votes > 0) ? `<div class="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 w-8 h-8 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-md z-10"><i class="fa-solid fa-crown text-sm"></i></div>` : '';
        
        let actionBtnHtml = '';
        if (isVotedByMe) {
            actionBtnHtml = `<button class="w-full mt-2 bg-green-100 text-green-700 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 border border-green-200" disabled><i class="fa-solid fa-check-circle"></i> ভোটেড</button>`;
        } else if (myVotedUid) {
            actionBtnHtml = `<button class="w-full mt-2 bg-gray-100 text-gray-400 py-2 rounded-lg font-bold text-xs cursor-not-allowed" disabled>ভোট দিয়েছেন</button>`;
        } else if (window.currentUser && p.uid === window.currentUser.uid) {
            actionBtnHtml = `<button onclick="deleteContestPhoto('${p.uid}')" class="w-full mt-2 bg-red-50 text-red-600 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 border border-red-200 hover:bg-red-100 transition"><i class="fa-solid fa-trash"></i> ডিলিট করুন</button>`;
        } else {
            actionBtnHtml = `<button onclick="voteForContestant('${p.uid}')" id="vote-btn-${p.uid}" class="w-full mt-2 bg-purple-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-purple-700 transform active:scale-95 transition flex items-center justify-center gap-1"><i class="fa-solid fa-heart"></i> ভোট দিন</button>`;
        }

        return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative flex flex-col" style="transform: translateZ(0);">
            ${rankBadge}
            <div class="h-40 w-full relative bg-gray-100" onclick="window.openImageViewer('${p.image}')">
                <img src="${p.image}" loading="lazy" class="w-full h-full object-cover cursor-pointer">
                <div class="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-md">
                    <i class="fa-solid fa-heart text-pink-400"></i> <span id="vote-count-${p.uid}">${p.votes || 0}</span>
                </div>
            </div>
            <div class="p-2 flex-1 flex flex-col justify-between">
                <div class="flex items-center gap-2 mb-1">
                    <img src="${p.authorPic || 'https://via.placeholder.com/40'}" class="w-6 h-6 rounded-full object-cover border border-gray-200">
                    <span class="text-xs font-bold text-gray-800 truncate">${window.escapeHTML(p.authorName || 'অজ্ঞাত')}</span>
                </div>
                <p class="text-[10px] text-gray-500 line-clamp-2 mb-1">${window.escapeHTML(p.caption || '')}</p>
                ${actionBtnHtml}
            </div>
        </div>`;
    }).join('');
}

// --- RENDER RESULT PAGE (NEW) ---
function renderContestResults(participants) {
    const podiumGrid = document.getElementById('contest-podium-grid');
    const leaderboardList = document.getElementById('contest-leaderboard-list');
    const winnerActionPanel = document.getElementById('winner-action-panel');
    
    if (participants.length === 0) {
        podiumGrid.innerHTML = '<p class="text-center text-gray-500 py-10">কোনো অংশগ্রহণকারী ছিল না।</p>';
        return;
    }

    const top3 = participants.slice(0, 3);
    const others = participants.slice(3);
    
    // Check if Current User is a Winner (Top 3)
    let amIAWinner = false;
    if (window.currentUser) {
        amIAWinner = top3.some(p => p.uid === window.currentUser.uid);
    }
    
    if (amIAWinner) {
        winnerActionPanel.classList.remove('hidden-custom');
    } else {
        winnerActionPanel.classList.add('hidden-custom');
    }

    // 1. Build Podium (Top 3)
    let podiumHtml = '';
    
    // 1st Place (Huge Card)
    if (top3[0]) {
        podiumHtml += `
        <div class="bg-white rounded-2xl shadow-lg border-2 border-yellow-400 overflow-hidden relative">
            <div class="absolute top-0 left-0 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-br-2xl font-bold shadow z-10 flex items-center gap-1">
                <i class="fa-solid fa-crown"></i> ১ম স্থান
            </div>
            <div class="h-56 w-full relative" onclick="window.openImageViewer('${top3[0].image}')">
                <img src="${top3[0].image}" class="w-full h-full object-cover cursor-pointer">
            </div>
            <div class="p-4 text-center bg-gradient-to-t from-yellow-50 to-white">
                <img src="${top3[0].authorPic}" class="w-16 h-16 rounded-full object-cover border-4 border-white shadow-md mx-auto -mt-12 relative z-10">
                <h4 class="font-extrabold text-gray-800 text-lg mt-2">${window.escapeHTML(top3[0].authorName)}</h4>
                <p class="text-sm text-yellow-700 font-bold bg-yellow-100 inline-block px-3 py-1 rounded-full mt-1">মোট ভোট: ${top3[0].votes}</p>
            </div>
        </div>`;
    }

    // 2nd & 3rd Place (Side by side Grid)
    if (top3[1] || top3[2]) {
        podiumHtml += `<div class="grid grid-cols-2 gap-3 mt-4">`;
        
        // 2nd Place
        if (top3[1]) {
            podiumHtml += `
            <div class="bg-white rounded-xl shadow border-2 border-gray-300 overflow-hidden relative">
                <div class="absolute top-0 left-0 bg-gray-300 text-gray-800 px-2 py-0.5 rounded-br-lg text-xs font-bold shadow z-10">২য় স্থান</div>
                <div class="h-32 w-full" onclick="window.openImageViewer('${top3[1].image}')">
                    <img src="${top3[1].image}" class="w-full h-full object-cover cursor-pointer">
                </div>
                <div class="p-2 text-center bg-gray-50">
                    <img src="${top3[1].authorPic}" class="w-10 h-10 rounded-full object-cover border-2 border-white shadow mx-auto -mt-6 relative z-10">
                    <h4 class="font-bold text-gray-800 text-xs mt-1 truncate">${window.escapeHTML(top3[1].authorName)}</h4>
                    <p class="text-[10px] text-gray-600 font-bold">${top3[1].votes} ভোট</p>
                </div>
            </div>`;
        }
        
        // 3rd Place
        if (top3[2]) {
            podiumHtml += `
            <div class="bg-white rounded-xl shadow border-2 border-amber-600 overflow-hidden relative">
                <div class="absolute top-0 left-0 bg-amber-600 text-white px-2 py-0.5 rounded-br-lg text-xs font-bold shadow z-10">৩য় স্থান</div>
                <div class="h-32 w-full" onclick="window.openImageViewer('${top3[2].image}')">
                    <img src="${top3[2].image}" class="w-full h-full object-cover cursor-pointer">
                </div>
                <div class="p-2 text-center bg-amber-50">
                    <img src="${top3[2].authorPic}" class="w-10 h-10 rounded-full object-cover border-2 border-white shadow mx-auto -mt-6 relative z-10">
                    <h4 class="font-bold text-gray-800 text-xs mt-1 truncate">${window.escapeHTML(top3[2].authorName)}</h4>
                    <p class="text-[10px] text-amber-700 font-bold">${top3[2].votes} ভোট</p>
                </div>
            </div>`;
        }
        podiumHtml += `</div>`;
    }

    podiumGrid.innerHTML = podiumHtml;

    // 2. Build Leaderboard (Others)
    if (others.length > 0) {
        leaderboardList.innerHTML = others.map((p, index) => `
        <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <span class="text-gray-400 font-bold w-4 text-center">#${index + 4}</span>
                <img src="${p.authorPic}" class="w-10 h-10 rounded-full object-cover border border-gray-200">
                <div>
                    <h4 class="font-bold text-gray-800 text-sm">${window.escapeHTML(p.authorName)}</h4>
                    <p class="text-[11px] text-gray-500 truncate w-32">${window.escapeHTML(p.caption)}</p>
                </div>
            </div>
            <div class="bg-gray-100 px-3 py-1 rounded-full text-xs font-bold text-gray-600 shadow-inner">
                ${p.votes} ভোট
            </div>
        </div>`).join('');
    } else {
        leaderboardList.innerHTML = '<p class="text-center text-gray-400 text-xs py-4">অন্য কোনো প্রতিযোগী নেই</p>';
    }
}

// Contact Admin Action
window.contactAdminForPrize = () => {
    // ডাটাবেস থেকে এডমিনের হোয়াটসঅ্যাপ নাম্বার নিয়ে চ্যাটে নিয়ে যাবে
    get(ref(window.db, 'admin_settings/whatsapp_link')).then((snap) => {
        const link = snap.val();
        if (link) {
            window.open(link, '_blank');
        } else {
            window.showToast("এডমিনের নাম্বার পাওয়া যায়নি!", "error");
        }
    });
};

// --- ACTIVE CONTEST VOTING LOGIC ---
window.voteForContestant = async (participantUid) => {
    if (!window.currentUser) return window.showToast("ভোট দেওয়ার জন্য লগইন করুন", "error");
    if (!confirm("আপনি কি নিশ্চিত যে এই ছবিটিতে ভোট দিতে চান?\n(একবার ভোট দিলে তা আর পরিবর্তন করা যাবে না)")) return;

    const btn = document.getElementById(`vote-btn-${participantUid}`);
    const countSpan = document.getElementById(`vote-count-${participantUid}`);
    if (countSpan) countSpan.innerText = (parseInt(countSpan.innerText) || 0) + 1;
    if (btn) {
        btn.className = "w-full mt-2 bg-green-100 text-green-700 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 border border-green-200";
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> ভোটেড';
        btn.disabled = true;
    }
    
    document.querySelectorAll('[id^="vote-btn-"]').forEach(button => {
        if (button.id !== `vote-btn-${participantUid}`) {
            button.className = "w-full mt-2 bg-gray-100 text-gray-400 py-2 rounded-lg font-bold text-xs cursor-not-allowed";
            button.innerHTML = 'ভোট দিয়েছেন';
            button.disabled = true;
        }
    });

    try {
        const myVoteRef = ref(window.db, `contest_votes_by_user/${window.currentUser.uid}`);
        const myVoteSnap = await get(myVoteRef);
        if (myVoteSnap.exists()) {
            window.showToast("আপনি ইতিমধ্যে একজনকে ভোট দিয়েছেন!", "error");
            window.loadContestFeed(); 
            return;
        }
        const participantRef = ref(window.db, `contest_participants/${participantUid}/votes`);
        await runTransaction(participantRef, (currentVotes) => (currentVotes || 0) + 1);
        await set(myVoteRef, { votedFor: participantUid, timestamp: Date.now() });
        window.showToast("আপনার ভোট সফলভাবে গ্রহণ করা হয়েছে!", "success");
    } catch (error) {
        window.showToast("ভোট দিতে সমস্যা: " + error.message, "error"); 
        window.loadContestFeed();
    }
};