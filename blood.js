import { getDatabase, ref, set, push, onValue, get, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.db || getDatabase();
window.allDonors = [];

// ==========================================
// ১. ডোনার রেজিস্ট্রেশন এবং পয়েন্ট রিওয়ার্ড
// ==========================================
window.submitDonor = async () => {
    const bloodGroup = document.getElementById('donor-blood-group').value;
    const phone = document.getElementById('donor-phone').value;
    const hidePhone = document.getElementById('donor-hide-phone').checked;
    
    if (!bloodGroup || !phone) return window.showToast("রক্তের গ্রুপ এবং মোবাইল নাম্বার আবশ্যক!", 'error');
    if (!/^01[3-9]\d{8}$/.test(phone)) return window.showToast("সঠিক মোবাইল নম্বর দিন", 'error');
    
    const uid = window.currentUser.uid;
    const donorRef = ref(db, 'donors/' + uid);

    try {
        const snap = await get(donorRef);
        const isNewDonor = !snap.exists();

        await set(donorRef, {
            name: window.userDetails.name,
            bloodGroup,
            phone,
            hidePhone,
            lastDate: document.getElementById('donor-last-date').value || "",
            uid: uid,
            union: window.userDetails.union || '',
            village: window.userDetails.village || '',
            isBloodHero: true,
            timestamp: Date.now()
        });

        if (isNewDonor) {
            await runTransaction(ref(db, `users/${uid}/total_points`), (currentPoints) => {
                return (currentPoints || 0) + 100;
            });
            window.showToast("ব্লাড হিরো ব্যাজ এবং ১০০ পয়েন্ট যুক্ত হয়েছে!", "success");
        } else {
            window.showToast("আপনার ডোনার প্রোফাইল আপডেট হয়েছে!", "success");
        }

        window.toggleDonorModal(false);
    } catch (e) {
        window.showToast("ত্রুটি: " + e.message, "error");
    }
};

// ==========================================
// ২. লাইভ ইমার্জেন্সি রিকোয়েস্ট
// ==========================================
window.sendEmergencyBloodRequest = async () => {
    const group = document.getElementById('req-blood-group').value;
    const location = document.getElementById('req-location').value.trim();
    const contact = document.getElementById('req-contact').value.trim();
    const details = document.getElementById('req-details').value.trim();
    
    if (!group || !contact) return window.showToast("গ্রুপ এবং মোবাইল নম্বর আবশ্যক", 'error');
    
    const btn = document.getElementById('btn-blood-req');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> প্রসেসিং...';
    btn.disabled = true;

    try {
        await push(ref(db, 'blood_requests'), {
            uid: window.currentUser.uid,
            name: window.userDetails.name,
            bloodGroup: group,
            location: location || 'স্থান উল্লেখ নেই',
            contact: contact,
            details: details,
            timestamp: Date.now()
        });

        const donorsSnap = await get(ref(db, 'donors'));
        let notificationCount = 0;
        
        if (donorsSnap.exists()) {
            const matchedDonors = Object.values(donorsSnap.val()).filter(d => d.bloodGroup === group && d.uid !== window.currentUser.uid);
            matchedDonors.forEach(d => {
                push(ref(db, `notifications/${d.uid}`), {
                    type: 'blood_req',
                    group, location, contact,
                    fromName: window.userDetails.name,
                    timestamp: Date.now(),
                    read: false
                });
            });
            notificationCount = matchedDonors.length;
        }
        
        window.showToast(`রিকোয়েস্ট লাইভ হয়েছে এবং ${notificationCount} জনকে নোটিফিকেশন পাঠানো হয়েছে!`, "success");
        window.toggleBloodRequestModal(false);
        
        ['req-blood-group', 'req-location', 'req-contact', 'req-details'].forEach(id => document.getElementById(id).value = "");
    } catch (e) {
        window.showToast("ত্রুটি: " + e.message, "error");
    } finally {
        btn.innerHTML = 'রিকোয়েস্ট পোস্ট করুন';
        btn.disabled = false;
    }
}

onValue(ref(db, 'blood_requests'), (snapshot) => {
    const container = document.getElementById('live-blood-requests-container');
    const list = document.getElementById('live-requests-list');
    if (!list) return;

    if (snapshot.exists()) {
        const requests = Object.entries(snapshot.val())
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.timestamp - a.timestamp); 

        container.classList.remove('hidden');
        list.innerHTML = requests.map(req => {
            const isMine = req.uid === window.currentUser?.uid;
            return `
            <div class="min-w-[250px] max-w-[280px] bg-red-50 border border-red-200 p-3 rounded-xl shrink-0 snap-center relative">
                ${isMine ? `<button onclick="deleteBloodRequest('${req.id}')" class="absolute top-2 right-2 text-red-400 hover:text-red-600"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                <div class="flex items-center gap-2 mb-2">
                    <span class="bg-red-600 text-white font-bold text-xs px-2 py-1 rounded shadow-sm">${req.bloodGroup}</span>
                    <span class="text-[10px] text-gray-500"><i class="fa-regular fa-clock"></i> ${window.timeAgo(req.timestamp)}</span>
                </div>
                <h4 class="font-bold text-gray-800 text-sm truncate"><i class="fa-solid fa-location-dot text-red-500"></i> ${window.escapeHTML(req.location)}</h4>
                <p class="text-[11px] text-gray-600 mt-1 line-clamp-2">${window.escapeHTML(req.details)}</p>
                <div class="mt-3 pt-2 border-t border-red-200 flex justify-between items-center">
                    <span class="text-[10px] text-gray-500 font-bold">${window.escapeHTML(req.name)}</span>
                    <a href="tel:${req.contact}" class="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow hover:bg-red-700 transition"><i class="fa-solid fa-phone"></i> কল</a>
                </div>
            </div>`;
        }).join('');
    } else {
        container.classList.add('hidden');
        list.innerHTML = '';
    }
});

window.deleteBloodRequest = (id) => {
    if(confirm("রক্ত ম্যানেজ হয়েছে বা রিকোয়েস্টটি ডিলিট করতে চান?")) {
        remove(ref(db, `blood_requests/${id}`));
        window.showToast("রিকোয়েস্ট মুছে ফেলা হয়েছে");
    }
};

// ==========================================
// ৩. ডোনার লিস্ট লোড (Local Storage Cache + Background Update)
// ==========================================

// প্রথমে লোকাল স্টোরেজ থেকে ডাটা নিয়ে ইনস্ট্যান্ট দেখিয়ে দেওয়া হচ্ছে (Zero loading time)
const cachedDonors = localStorage.getItem('cached_blood_donors');
if (cachedDonors) {
    try {
        window.allDonors = JSON.parse(cachedDonors);
        setTimeout(() => {
            if(document.getElementById('donor-list')) window.filterDonors();
        }, 100);
    } catch (e) {
        console.error("Cache parsing error", e);
    }
}

// ব্যাকগ্রাউন্ডে ফায়ারবেস থেকে নতুন ডাটা নিয়ে আসা হচ্ছে
onValue(ref(db, 'donors'), (snapshot) => {
    if (snapshot.exists()) {
        const freshDonors = Object.values(snapshot.val());
        window.allDonors = freshDonors;
        // নতুন ডাটা লোকাল স্টোরেজে সেভ করে রাখা হচ্ছে ভবিষ্যতের জন্য
        localStorage.setItem('cached_blood_donors', JSON.stringify(freshDonors));
    } else {
        window.allDonors = [];
        localStorage.removeItem('cached_blood_donors'); 
    }
    
    // ব্যাকগ্রাউন্ড ডাটা আসার পর UI আপডেট করা হচ্ছে
    if(document.getElementById('donor-list')) {
        window.filterDonors();
    }
});

// ==========================================
// ৪. ফিল্টার, স্ট্যাটাস ট্র্যাকার এবং হোয়াটসঅ্যাপ
// ==========================================
window.filterDonors = () => {
    const bgFilter = document.getElementById('blood-filter')?.value || 'all';
    const unionFilter = document.getElementById('blood-union-filter')?.value || 'all';
    const container = document.getElementById('donor-list');
    if(!container) return;

    const filtered = window.allDonors.filter(d => 
        (bgFilter === 'all' || d.bloodGroup === bgFilter) && 
        (unionFilter === 'all' || d.union === unionFilter)
    );
    
    container.innerHTML = filtered.length > 0 ? filtered.map(donor => {
        const isMe = donor.uid === window.currentUser?.uid;
        let isAvailable = true;
        let eligibilityBadge = '<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold"><i class="fa-solid fa-check-circle"></i> Available</span>';
        
        if (donor.lastDate) {
            const lastDonation = new Date(donor.lastDate).getTime();
            const now = new Date().getTime();
            const diffDays = Math.floor((now - lastDonation) / (1000 * 60 * 60 * 24));
            
            if (diffDays < 120) {
                isAvailable = false;
                const daysLeft = 120 - diffDays;
                eligibilityBadge = `<span class="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold"><i class="fa-solid fa-clock"></i> ${daysLeft} দিন পর পারবে</span>`;
            }
        }

        let contactButtons = '';
        if (isMe) {
            contactButtons = `<button onclick="removeMeFromDonor()" class="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded hover:bg-red-100 border border-red-200 shadow-sm"><i class="fa-solid fa-trash-can"></i> রিমুভ</button>`;
        } else {
            const chatBtn = `<button onclick="startChat('${donor.uid}', '${window.escapeHTML(donor.name)}')" class="bg-blue-50 text-blue-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-blue-100 transition shadow-sm" title="মেসেজ"><i class="fa-brands fa-facebook-messenger"></i></button>`;
            if (donor.hidePhone) {
                contactButtons = chatBtn;
            } else {
                let waNumber = donor.phone.startsWith('0') ? '88' + donor.phone : donor.phone;
                const waMsg = encodeURIComponent(`আসসালামু আলাইকুম। আমার ইমার্জেন্সি ${donor.bloodGroup} রক্ত লাগবে। আপনি কি রক্ত দিতে পারবেন?`);
                const waBtn = `<a href="https://wa.me/${waNumber}?text=${waMsg}" target="_blank" class="bg-green-100 text-green-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-green-200 transition shadow-sm" title="WhatsApp"><i class="fa-brands fa-whatsapp text-lg"></i></a>`;
                const callBtn = `<a href="tel:${donor.phone}" class="bg-green-500 text-white w-9 h-9 rounded-full flex items-center justify-center shadow hover:bg-green-600 transition hover:scale-105" title="কল"><i class="fa-solid fa-phone text-sm"></i></a>`;
                contactButtons = `${chatBtn} ${waBtn} ${callBtn}`;
            }
        }

        const heroBadge = donor.isBloodHero ? `<i class="fa-solid fa-drop text-red-500 ml-1" title="Blood Hero"></i>` : '';

        return `
        <div class="bg-white p-3 rounded-xl shadow-sm border ${isAvailable ? 'border-red-50' : 'border-gray-200 opacity-80'} flex justify-between items-center group transition">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 ${isAvailable ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-100 text-gray-500 border-gray-200'} rounded-full flex items-center justify-center font-extrabold text-sm border group-hover:scale-105 transition shrink-0">
                    ${window.escapeHTML(donor.bloodGroup)}
                </div>
                <div>
                    <p class="font-bold text-gray-800 text-sm flex items-center">
                        ${window.escapeHTML(donor.name)} ${heroBadge}
                        ${isMe ? '<span class="bg-blue-100 text-blue-600 text-[9px] px-1 rounded ml-1">আপনি</span>' : ''}
                    </p>
                    <p class="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                        <i class="fa-solid fa-location-dot"></i> ${window.escapeHTML(donor.union || 'এলাকা নেই')}
                    </p>
                    <div class="mt-1">${eligibilityBadge}</div>
                </div>
            </div>
            <div class="flex gap-2 shrink-0">
                ${contactButtons}
            </div>
        </div>`;
    }).join('') : '<div class="flex flex-col items-center justify-center py-10 text-gray-400"><i class="fa-solid fa-droplet-slash text-4xl mb-2 text-gray-300"></i><p class="text-sm">এই শর্তে কোনো ডোনার পাওয়া যায়নি</p></div>';
};

window.removeMeFromDonor = () => {
    if(confirm("আপনি কি ডোনার তালিকা থেকে আপনার নাম মুছে ফেলতে চান?")) {
        remove(ref(db, 'donors/' + window.currentUser.uid)).then(() => {
            window.showToast("আপনার নাম তালিকা থেকে মুছে ফেলা হয়েছে");
            if(document.getElementById('donor-phone')) document.getElementById('donor-phone').value = "";
            if(document.getElementById('donor-last-date')) document.getElementById('donor-last-date').value = "";
            if(document.getElementById('donor-hide-phone')) document.getElementById('donor-hide-phone').checked = false;
        });
    }
}