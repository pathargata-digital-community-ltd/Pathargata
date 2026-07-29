import {
    ref,
    onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// গ্লোবাল ডিরেক্টরি ওপেনার ফাংশন
window.openDirectoryCategory = (category, title) => {
    switchPage('directory-list');
    
    const listTitle = document.getElementById('directory-list-title');
    if (listTitle) listTitle.innerText = title;
    
    const container = document.getElementById('directory-items-container');
    if (container) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-600 mb-3"></div>
                <p class="text-sm text-gray-500 font-semibold">তথ্য লোড হচ্ছে...</p>
            </div>`;
    }
    
    onValue(ref(window.db, `directory/${category}`), (snap) => {
        const data = snap.val() || {};
        if (!container) return;

        const itemsArray = Object.values(data);

        if (itemsArray.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <i class="fa-regular fa-folder-open text-5xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">এই বিভাগে বর্তমানে কোনো তথ্য পাওয়া যায়নি</p>
                </div>`;
            return;
        }

        container.innerHTML = itemsArray.map(item => {
            // ডাটা সুরক্ষিতভাবে হ্যান্ডেল করা হচ্ছে
            const name = window.escapeHTML(item.name || 'নাম উল্লেখ নেই');
            const designation = window.escapeHTML(item.designation || item.details || 'পদবী উল্লেখ নেই');
            const address = window.escapeHTML(item.address || 'ঠিকানা উল্লেখ নেই');
            const phone = window.escapeHTML(item.phone || '');
            const email = window.escapeHTML(item.email || '');
            const availability = window.escapeHTML(item.availability || item.hours || '');
            
            // ১. প্রোফাইল ছবি নির্ধারণ (ছবি না থাকলে ডিফল্ট ইউজার-টাই আইকন)
            let avatarHTML = '';
            if (item.profile_pic || item.image) {
                avatarHTML = `<img src="${item.profile_pic || item.image}" alt="${name}" loading="lazy" class="w-14 h-14 rounded-full object-cover border-2 border-green-100 shadow-sm shrink-0">`;
            } else {
                avatarHTML = `
                    <div class="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-100 shadow-sm shrink-0">
                        <i class="fa-solid fa-user-tie text-2xl"></i>
                    </div>`;
            }

            // ২. ফোন কল বাটন জেনারেটর
            const callBtn = phone ? `
                <a href="tel:${phone}" class="w-11 h-11 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition duration-150 shrink-0">
                    <i class="fa-solid fa-phone text-lg animate-pulse"></i>
                </a>` : '';

            // ৩. ইমেইল ফিল্ড হ্যান্ডেল (ঐচ্ছিক)
            const emailHTML = email ? `
                <p class="text-xs text-gray-500 flex items-center gap-1.5 mt-1 truncate">
                    <i class="fa-regular fa-envelope text-gray-400 w-3.5 text-center"></i> ${email}
                </p>` : '';

            // ৪. উপলব্ধতার সময় (যেমন: সকাল ১০টা - বিকেল ৪টা)
            const availabilityHTML = availability ? `
                <p class="text-[11px] text-blue-600 font-bold flex items-center gap-1 mt-1.5 bg-blue-50 px-2 py-0.5 rounded-md w-max">
                    <i class="fa-regular fa-clock text-blue-500"></i> ${availability}
                </p>` : '';

            return `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4 hover:shadow-md transition duration-200">
                ${avatarHTML}
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-gray-800 text-base leading-tight truncate">${name}</h4>
                    <p class="text-xs font-bold text-green-600 mt-0.5 leading-snug">${designation}</p>
                    
                    <div class="mt-2 space-y-1">
                        <!-- ঠিকানা -->
                        <p class="text-xs text-gray-500 flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-gray-400 mt-0.5 w-3.5 text-center shrink-0"></i>
                            <span class="leading-relaxed font-medium">${address}</span>
                        </p>
                        ${emailHTML}
                        ${availabilityHTML}
                    </div>
                </div>
                ${callBtn}
            </div>`;
        }).join('');
    });
};