import {
    ref,
    set,
    get,
    remove,
    runTransaction,
    onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CONTEST LOGIC ---

window.toggleContestModal = (show) => {
    const modal = document.getElementById('contest-upload-modal');
    if (show) {
        // চেক করুন ইউজার ইতিমধ্যে অংশগ্রহণ করেছে কিনা
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
        // ছবি Cloudinary তে আপলোড
        const res = await window.uploadMediaToCloudinary(file);
        
        // ডাটাবেসে সেভ করা
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
        window.loadContestFeed(); // রিলোড ফিড

    } catch (e) {
        window.showToast("সমস্যা হয়েছে: " + e.message, "error");
    } finally {
        btn.innerHTML = 'সাবমিট করুন';
        btn.disabled = false;
    }
};

// Rules Modal Toggle
window.toggleContestRulesModal = (show) => {
    const modal = document.getElementById('contest-rules-modal');
    if (show) modal.classList.remove('hidden-custom');
    else modal.classList.add('hidden-custom');
};

// Delete Own Photo Logic
window.deleteContestPhoto = async (participantUid) => {
    if(!confirm("আপনি কি নিশ্চিত যে আপনার ছবিটি মুছে ফেলতে চান? আপনার প্রাপ্ত ভোটগুলোও চিরতরে মুছে যাবে।")) return;

    try {
        // ডাটাবেস থেকে ইউজারের ডাটা মুছে ফেলা
        await remove(ref(window.db, `contest_participants/${participantUid}`));
        window.showToast("আপনার ছবিটি সফলভাবে মুছে ফেলা হয়েছে!", "success");
        window.loadContestFeed(); // ফিড রিলোড করা
    } catch (e) {
        window.showToast("মুছে ফেলতে সমস্যা হয়েছে: " + e.message, "error");
    }
};

// --- LOAD DYNAMIC CONTEST INFO ---
window.loadContestInfo = () => {
    onValue(ref(window.db, 'admin_settings/contest_info'), (snap) => {
        const info = snap.val();
        if (info) {
            // Sponsor & Date
            const sponsorEl = document.getElementById('dyn-contest-sponsor');
            const dateEl = document.getElementById('dyn-contest-date');
            if(sponsorEl) sponsorEl.innerText = info.sponsor || 'পাথরঘাটা ডিজিটাল';
            if(dateEl) dateEl.innerText = info.endDate || 'অনির্দিষ্ট';
            
            // Prizes
            const prizeContainer = document.getElementById('dyn-contest-prizes-container');
            const prizeText = document.getElementById('dyn-contest-prizes');
            if(prizeText && prizeContainer) {
                if (info.prizes && info.prizes.trim() !== "") {
                    prizeText.innerText = info.prizes;
                    prizeContainer.classList.remove('hidden-custom');
                } else {
                    prizeContainer.classList.add('hidden-custom');
                }
            }
            
            // Rules
            const rulesList = document.getElementById('dyn-contest-rules-list');
            if(rulesList) {
                if(info.rules && Array.isArray(info.rules)) {
                    rulesList.innerHTML = info.rules.map(rule => 
                        `<li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-1"></i> <span>${window.escapeHTML(rule)}</span></li>`
                    ).join('');
                } else {
                     rulesList.innerHTML = `<li class="flex items-start gap-2"><i class="fa-solid fa-circle-check text-green-500 mt-1"></i> <span>কোনো নিয়মাবলি সেট করা নেই।</span></li>`;
                }
            }
        }
    });
};

// --- LOAD CONTEST FEED (NO ADS) ---
window.loadContestFeed = () => {
    window.loadContestInfo(); // ইনফো লোড করবে
    const grid = document.getElementById('contest-photos-grid');
    
    // সেফগার্ড: HTML এলিমেন্ট না পাওয়া গেলে ফাংশনটি বন্ধ হয়ে যাবে
    if (!grid) {
        console.warn("contest-photos-grid পাওয়া যায়নি। HTML লোড হওয়ার জন্য অপেক্ষা করা হচ্ছে...");
        return;
    }

    grid.innerHTML = '<div class="col-span-2 flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div></div>';

    get(ref(window.db, 'contest_participants')).then(async (snap) => {
        const data = snap.val();
        if (!data) {
            grid.innerHTML = '<p class="col-span-2 text-center text-gray-400 py-10">এখনো কেউ অংশগ্রহণ করেনি</p>';
            const totalEl = document.getElementById('contest-total-participants');
            if(totalEl) totalEl.innerText = "0 জন";
            return;
        }

        let myVotedUid = null;
        if (window.currentUser) {
            try {
                const myVotesSnap = await get(ref(window.db, `contest_votes_by_user/${window.currentUser.uid}`));
                myVotedUid = myVotesSnap.exists() ? myVotesSnap.val().votedFor : null;
            } catch (e) {
                console.warn("ভোট চেক করতে সমস্যা হয়েছে", e);
            }
        }

        const participants = Object.values(data).sort((a, b) => (b.votes || 0) - (a.votes || 0));
        const totalEl = document.getElementById('contest-total-participants');
        if(totalEl) totalEl.innerText = `${participants.length} জন`;

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
                    <img src="${p.image}" loading="lazy" decoding="async" class="w-full h-full object-cover cursor-pointer">
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
    }).catch(err => {
        console.error("Contest Data Load Error:", err);
        grid.innerHTML = '<p class="col-span-2 text-center text-red-400 py-10">ডাটা লোড করতে সমস্যা হয়েছে। রিফ্রেশ করুন।</p>';
    });
};

// --- CONTEST VOTING LOGIC ---
window.voteForContestant = async (participantUid) => {
    if (!window.currentUser) {
        window.showToast("ভোট দেওয়ার জন্য লগইন করুন", "error");
        return;
    }

    if (!confirm("আপনি কি নিশ্চিত যে এই ছবিটিতে ভোট দিতে চান?\n(একবার ভোট দিলে তা আর পরিবর্তন করা যাবে না)")) {
        return;
    }

    const btn = document.getElementById(`vote-btn-${participantUid}`);
    const countSpan = document.getElementById(`vote-count-${participantUid}`);

    if (countSpan) {
        let currentVotes = parseInt(countSpan.innerText) || 0;
        countSpan.innerText = currentVotes + 1;
    }

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
        await runTransaction(participantRef, (currentVotes) => {
            return (currentVotes || 0) + 1;
        });

        await set(myVoteRef, {
            votedFor: participantUid,
            timestamp: Date.now()
        });

        window.showToast("আপনার ভোট সফলভাবে গ্রহণ করা হয়েছে!", "success");

    } catch (error) {
        console.error("Voting error:", error);
        window.showToast("ভোট দিতে সমস্যা: " + error.message, "error"); 
        window.loadContestFeed();
    }
};
