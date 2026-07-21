import { ref, push, onValue, query, orderByChild, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.db;
const auth = window.auth;

// জিপিএস লোকেশন রিট্রিভ করার মেথড
window.getComplaintLocation = (btn) => {
    const statusText = document.getElementById('location-status-text');
    if (!navigator.geolocation) {
        return showToast("আপনার ব্রাউজার বা ডিভাইসে জিপিএস সাপোর্ট করে না।", "error");
    }
    statusText.innerText = "খোঁজা হচ্ছে...";
    navigator.geolocation.getCurrentPosition(
        (position) => {
            document.getElementById('complaint-lat').value = position.coords.latitude;
            document.getElementById('complaint-lng').value = position.coords.longitude;
            statusText.innerText = "যুক্ত হয়েছে ✔";
            btn.classList.replace('bg-gray-100', 'bg-green-50');
            btn.classList.add('border', 'border-green-300');
            showToast("লোকেশন সফলভাবে যুক্ত করা হয়েছে");
        },
        (error) => {
            statusText.innerText = "ব্যর্থ হয়েছে";
            showToast("লোকেশন পেতে ব্যর্থ: " + error.message, "error");
        }
    );
};

window.submitComplaint = async () => {
    const text = document.getElementById('complaint-text').value.trim();
    const fileInput = document.getElementById('complaint-file');
    const submitBtn = document.getElementById('btn-complaint-submit');
    
    if (!text) return showToast("অভিযোগের বিস্তারিত লিখুন", 'error');
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> প্রসেস হচ্ছে...';

    try {
        let attachmentUrl = "";
        
        // ছবি সিলেক্ট করা থাকলে ক্লাউডিনারিতে আপলোড হবে
        if (fileInput && fileInput.files[0]) {
            const uploadResult = await window.uploadMediaToCloudinary(fileInput.files[0]);
            attachmentUrl = uploadResult.url;
        }

        const lat = document.getElementById('complaint-lat').value;
        const lng = document.getElementById('complaint-lng').value;

        // অভিযোগের তথ্য ডাটাবেসে পুশ
        await push(ref(db, 'complaints'), {
            uid: auth.currentUser.uid,
            authorName: document.getElementById('complaint-anon').checked ? "নাম প্রকাশে অনিচ্ছুক" : window.userDetails.name,
            type: document.getElementById('complaint-type').value,
            submitTo: document.getElementById('complaint-to').value,
            text,
            image: attachmentUrl, // ছবি লিংক
            lat: lat || "",       // ল্যাটিটিউড
            lng: lng || "",       // লঙ্গিটিউড
            timestamp: Date.now(),
            status: 'Pending',
            union: window.userDetails.union || 'Unknown',
            village: window.userDetails.village || 'Unknown'
        });

        showToast("অভিযোগ সফলভাবে জমা হয়েছে!");
        
        // ফর্ম রিসেট
        document.getElementById('complaint-text').value = "";
        document.getElementById('complaint-anon').checked = false;
        if(fileInput) fileInput.value = "";
        document.getElementById('complaint-lat').value = "";
        document.getElementById('complaint-lng').value = "";
        
        // লোকেশন বাটন রিস্টোর
        const locBtn = document.querySelector('[onclick="window.getComplaintLocation(this)"]');
        if(locBtn) {
            locBtn.classList.remove('bg-green-50', 'border', 'border-green-300');
            locBtn.classList.add('bg-gray-100');
            document.getElementById('location-status-text').innerText = "লোকেশন দিন";
        }
        
    } catch (e) {
        showToast("ত্রুটি: " + e.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "জমা দিন";
    }
};

window.loadMyComplaints = () => {
    const listContainer = document.getElementById('my-complaints-list');
    if (!listContainer) return;

    onValue(query(ref(db, 'complaints'), orderByChild('uid'), startAt(auth.currentUser.uid), endAt(auth.currentUser.uid)), (snap) => {
        const data = Object.values(snap.val() || {}).sort((a, b) => b.timestamp - a.timestamp);
        listContainer.innerHTML = data.length > 0 ? data.map(c => {
            const statusMap = {
                'Processing': {
                    c: 'text-blue-600 bg-blue-100',
                    t: 'কাজ চলছে'
                },
                'Resolved': {
                    c: 'text-green-600 bg-green-100',
                    t: 'সমাধান হয়েছে'
                }
            };
            const st = statusMap[c.status] || {
                c: 'text-yellow-600 bg-yellow-100',
                t: 'জমা হয়েছে'
            };
            
            const imgHtml = c.image ? `<div class="mt-2"><img src="${c.image}" class="max-h-32 rounded-lg object-cover cursor-pointer" onclick="window.viewImage('${c.image}')"></div>` : '';
            const locHtml = (c.lat && c.lng) ? `<div class="mt-1"><a href="https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}" target="_blank" class="text-xs text-blue-600 font-bold flex items-center gap-1"><i class="fa-solid fa-map-location-dot"></i> ম্যাপে পিন দেখুন</a></div>` : '';

            return `
            <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">To: ${c.submitTo}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded ${st.c}">${st.t}</span>
                </div>
                <p class="text-sm text-gray-800 mt-2">${escapeHTML(c.text)}</p>
                ${imgHtml}
                ${locHtml}
                <p class="text-[10px] text-gray-400 mt-2 text-right">${timeAgo(c.timestamp)}</p>
            </div>`;
        }).join('') : '<p class="text-center text-gray-400 text-xs py-4">কোনো অভিযোগ নেই</p>';
    });
};

// মডিউল লোড হলে মেথডটি রান করবে
window.loadMyComplaints();