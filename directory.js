import {
    ref,
    onValue,
    push,
    set,
    get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// গ্লোবাল ভ্যারিয়েবলসমূহ
window.currentLoadedCategory = '';
window.currentCategoryItems = [];
window.isBookmarkOnlyView = false;

// ক্যাটাগরি পেজ ওপেন করার মেইন লজিক
window.openDirectoryCategory = (category, title) => {
    window.isBookmarkOnlyView = false;
    window.currentLoadedCategory = category;
    switchPage('directory-list');
    
    const listTitle = document.getElementById('directory-list-title');
    if (listTitle) listTitle.innerText = title;
    
    // সার্চ ইনপুট ক্লিয়ার
    const searchInput = document.getElementById('directory-search-input');
    if (searchInput) searchInput.value = '';

    const container = document.getElementById('directory-items-container');
    if (container) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <div class="animate-spin rounded-full h-10 w-10 border-4 border-green-200 border-t-green-600 mb-3"></div>
                <p class="text-sm text-gray-500 font-semibold">তথ্য লোড হচ্ছে...</p>
            </div>`;
    }
    
    // রিয়াল-টাইম ডাটা ফেচিং
    onValue(ref(window.db, `directory/${category}`), (snap) => {
        if (window.isBookmarkOnlyView) return; // বুকমার্ক মুডে থাকলে ওভাররাইট বন্ধ থাকবে
        
        const data = snap.val() || {};
        // ডাটা প্রসেস ও ক্যাশে রাখা (সার্চ ফিল্টারের জন্য)
        window.currentCategoryItems = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
        }));
        
        renderDirectoryItems(window.currentCategoryItems);
    });
};

// ব্যাক বাটন ক্লিক হ্যান্ডেলার
window.goBackToDirectoryRoot = () => {
    if (window.isBookmarkOnlyView) {
        toggleBookmarkView(false);
    } else {
        switchPage('directory');
    }
};

// স্বয়ংক্রিয় চেম্বার সময় গণনার জন্য হেল্পার ফাংশন (২৪ ঘণ্টার ফরম্যাট অনুযায়ী)
function checkDoctorAvailability(timeRangeStr) {
    if (!timeRangeStr) return false;
    try {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        // যদি কমা দিয়ে একাধিক সময় থাকে (যেমন: "08:00-10:00, 17:00-21:00")
        const ranges = timeRangeStr.split(',');
        for (let range of ranges) {
            const parts = range.trim().split('-');
            if (parts.length === 2) {
                const [startH, startM] = parts[0].trim().split(':').map(Number);
                const [endH, endM] = parts[1].trim().split(':').map(Number);
                
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;
                
                if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                    return true;
                }
            }
        }
    } catch (e) {
        console.error("Time range parse error", e);
    }
    return false;
}

// হোয়াটসঅ্যাপের জন্য লিংক এবং শুভেচ্ছা বার্তা জেনারেটর
function generateWhatsAppLink(phoneNum, name) {
    if (!phoneNum) return '#';
    let cleanNum = phoneNum.replace(/\D/g, ''); // সব সিম্বল মুছে শুধু সংখ্যা রাখবে
    
    if (cleanNum.startsWith('0')) {
        cleanNum = '88' + cleanNum; // বাংলাদেশি কোড যুক্ত করবে
    } else if (cleanNum.startsWith('+')) {
        cleanNum = cleanNum.replace('+', '');
    }
    
    const message = `আসসালামু আলাইকুম ${name} সাহেব, 'পাথরঘাটা ডিজিটাল' অ্যাপের ডিরেক্টরি থেকে আপনার সাথে যোগাযোগ করছি।`;
    return `https://api.whatsapp.com/send?phone=${cleanNum}&text=${encodeURIComponent(message)}`;
}

// আইটেম রেন্ডারিং মাস্টার ফাংশন
window.renderDirectoryItems = (items) => {
    const container = document.getElementById('directory-items-container');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <i class="fa-regular fa-folder-open text-5xl text-gray-300 mb-3"></i>
                <p class="text-gray-500 font-semibold">কোনো তথ্য পাওয়া যায়নি</p>
            </div>`;
        return;
    }

    // লোকাল বুকমার্ক লিডিং লিস্ট লোড করা
    const bookmarks = JSON.parse(localStorage.getItem('directory_bookmarks') || '[]');

    container.innerHTML = items.map(item => {
        const id = item.id;
        const name = window.escapeHTML(item.name || 'নাম উল্লেখ নেই');
        const designation = window.escapeHTML(item.designation || item.details || 'পদবী উল্লেখ নেই');
        const address = window.escapeHTML(item.address || 'ঠিকানা উল্লেখ নেই');
        const phone = window.escapeHTML(item.phone || '');
        const email = window.escapeHTML(item.email || '');
        const website = window.escapeHTML(item.website || '');
        const chatUid = window.escapeHTML(item.chat_uid || ''); // অ্যাপ চ্যাট আইডি (ঐচ্ছিক)
        const availability = window.escapeHTML(item.availability || item.hours || '');
        const is24_7 = item.is_active_24_7 === true;
        
        // ডাক্তার স্পেসিফিক অতিরিক্ত ডাটা লোডিং
        const specialty = window.escapeHTML(item.specialty || '');
        const chamberTime = window.escapeHTML(item.chamber_time || '');
        const daysAvailable = window.escapeHTML(item.days_available || '');
        const hospitalChamber = window.escapeHTML(item.hospital_chamber || '');
        
        // স্বয়ংক্রিয় লাইভ চেম্বার সময় গণনা
        const isAvailableNow = checkDoctorAvailability(item.chamber_time);

        // রেটিং ও রিভিউ প্রসেসিং
        const averageRating = item.rating ? parseFloat(item.rating).toFixed(1) : '0.0';
        const totalReviews = item.total_reviews || 0;

        // বুকমার্ক করা আছে কিনা চেক
        const isBookmarked = bookmarks.includes(id);
        const starClass = isBookmarked ? 'fa-solid text-yellow-500' : 'fa-regular text-gray-400';

        // ১. ছবি বা ডিফল্ট অ্যাভাটার জেনারেশন (ডাক্তারদের জন্য বিশেষ থিম)
        let avatarHTML = '';
        if (item.profile_pic || item.image) {
            avatarHTML = `<img src="${item.profile_pic || item.image}" alt="${name}" loading="lazy" class="w-14 h-14 rounded-full object-cover border-2 border-green-100 shadow-sm shrink-0">`;
        } else {
            const iconClass = specialty ? 'fa-user-md' : 'fa-user-tie';
            avatarHTML = `
                <div class="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-100 shadow-sm shrink-0">
                    <i class="fa-solid ${iconClass} text-2xl"></i>
                </div>`;
        }

        // ২. ম্যাপ রিডাইরেক্ট ইউআরএল জেনারেশন (চেম্বার বা জেনারেল অ্যাড্রেস)
        const mapsQuery = item.lat && item.lng ? `${item.lat},${item.lng}` : encodeURIComponent(`${name} ${hospitalChamber || address}`);
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

        // ৩. ডাইনামিক ডিটেইলস ব্লক রেন্ডারিং (ডাক্তার বনাম সাধারণ কন্ট্যাক্ট)
        let detailsBlockHTML = '';
        if (specialty) {
            // লাইভ চেম্বার স্ট্যাটাস ইন্ডিকেটর
            const liveStatusBadge = isAvailableNow ? `
                <span class="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-100 w-max animate-pulse">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> চেম্বারে আছেন / রোগী দেখছেন
                </span>` : `
                <span class="text-[10px] text-gray-500 font-bold bg-gray-50 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-gray-100 w-max">
                    <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span> চেম্বার বর্তমানে বন্ধ
                </span>`;

            detailsBlockHTML = `
                <div class="mt-2.5 space-y-1.5 border-t border-dashed border-gray-100 pt-2">
                    <p class="text-xs text-gray-700 flex items-center gap-1.5 font-bold">
                        <i class="fa-solid fa-stethoscope text-green-500 w-3.5 text-center"></i> ${specialty}
                    </p>
                    <p class="text-xs text-gray-500 flex items-start gap-1.5">
                        <i class="fa-solid fa-hospital text-gray-400 mt-0.5 w-3.5 text-center shrink-0"></i>
                        <span class="font-medium">চেম্বার: <span class="text-gray-800 font-bold">${hospitalChamber}</span></span>
                    </p>
                    <p class="text-xs text-gray-500 flex items-start gap-1.5">
                        <i class="fa-regular fa-calendar-check text-gray-400 mt-0.5 w-3.5 text-center shrink-0"></i>
                        <span class="font-medium">দিন: <span class="text-gray-700 font-semibold">${daysAvailable}</span></span>
                    </p>
                    <p class="text-xs text-gray-500 flex items-start gap-1.5">
                        <i class="fa-regular fa-clock text-gray-400 mt-0.5 w-3.5 text-center shrink-0"></i>
                        <span class="font-medium">সময়: <span class="text-gray-700 font-semibold">${chamberTime}</span></span>
                    </p>
                    <div class="pt-1 flex flex-wrap gap-2 items-center">
                        ${liveStatusBadge}
                        <a href="${mapsLink}" target="_blank" class="text-[10px] text-blue-600 font-bold hover:underline bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 flex items-center gap-1 shadow-sm" title="গুগল ম্যাপে চেম্বার দেখুন">
                            <i class="fa-solid fa-map-location-dot text-blue-500"></i> চেম্বার ম্যাপ
                        </a>
                    </div>
                </div>`;
        } else {
            // সাধারণ কন্ট্যাক্টদের জন্য সাধারণ লেআউট
            const timeHTML = is24_7 ? `
                <span class="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse border border-red-100">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-600"></span> ২৪ ঘণ্টা খোলা
                </span>` : (availability ? `
                <span class="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-blue-100">
                    <i class="fa-regular fa-clock"></i> ${availability}
                </span>` : '');

            detailsBlockHTML = `
                <div class="mt-2.5 space-y-1.5">
                    <p class="text-xs text-gray-500 flex items-start gap-1.5">
                        <i class="fa-solid fa-location-dot text-gray-400 mt-0.5 w-3.5 text-center shrink-0"></i>
                        <span class="leading-relaxed font-medium flex-1 min-w-0 truncate">${address}</span>
                        <a href="${mapsLink}" target="_blank" class="text-[10px] text-blue-600 font-bold hover:underline shrink-0 flex items-center gap-0.5" title="গুগল ম্যাপে দেখুন">
                            <i class="fa-solid fa-map-location-dot"></i> ম্যাপস
                        </a>
                    </p>
                    ${email ? `<p class="text-xs text-gray-500 flex items-center gap-1.5 truncate"><i class="fa-regular fa-envelope text-gray-400 w-3.5 text-center"></i> ${email}</p>` : ''}
                    ${website ? `<button onclick="window.openInAppWebview('${name}', '${website}')" class="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1.5 text-left transition"><i class="fa-solid fa-globe text-blue-400 w-3.5 text-center"></i> ওয়েবসাইট দেখুন</button>` : ''}
                    
                    <div class="pt-1 flex flex-wrap gap-2">
                        ${timeHTML}
                    </div>
                </div>`;
        }

        // ৪. ৩টি যোগাযোগ বাটন (কল করুন, ইন-অ্যাপ চ্যাট, হোয়াটসঅ্যাপ চ্যাট)
        let actionButtonsHTML = '';
        if (phone) {
            // ইন-অ্যাপ মেসেঞ্জার বাটন
            const chatBtnHTML = chatUid ? `
                <button onclick="triggerDirectAppChat('${chatUid}', '${name}')" class="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-95 transition" title="ইন-অ্যাপ চ্যাট">
                    <i class="fa-brands fa-facebook-messenger"></i> মেসেজ
                </button>` : `
                <button class="flex-1 bg-gray-100 text-gray-400 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed" title="চ্যাট অনুপলব্ধ">
                    <i class="fa-solid fa-comment-slash"></i> মেসেজ
                </button>`;

            // হোয়াটসঅ্যাপ ডিরেক্ট এপিআই লিংক
            const waLink = generateWhatsAppLink(phone, name);
            const whatsappBtnHTML = `
                <a href="${waLink}" target="_blank" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-95 transition" title="হোয়াটসঅ্যাপে মেসেজ পাঠান">
                    <i class="fa-brands fa-whatsapp text-sm"></i> WhatsApp
                </a>`;

            actionButtonsHTML = `
                <div class="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                    <a href="tel:${phone}" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition">
                        <i class="fa-solid fa-phone"></i> কল করুন
                    </a>
                    ${chatBtnHTML}
                    ${whatsappBtnHTML}
                </div>`;
        }

        return `
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition duration-200 relative">
            
            <!-- স্টার বাটন (বুকমার্ক) -->
            <button onclick="toggleBookmark('${id}')" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border hover:bg-yellow-50/50 transition duration-150">
                <i class="${starClass}"></i>
            </button>

            <!-- প্রধান কন্ট্যাক্ট বডি -->
            <div class="flex items-start gap-3">
                ${avatarHTML}
                <div class="flex-1 min-w-0 pr-6">
                    <h4 class="font-bold text-gray-800 text-base leading-snug truncate">${name}</h4>
                    <p class="text-xs font-bold text-green-600 mt-0.5 leading-snug">${designation}</p>
                    
                    <!-- রেটিং ও রিভিউ -->
                    <div onclick="openRatingModal('${id}', '${window.currentLoadedCategory}', '${name}')" class="flex items-center gap-1 mt-1 cursor-pointer hover:opacity-80">
                        <span class="text-xs font-bold text-amber-500 flex items-center gap-0.5">
                            <i class="fa-solid fa-star"></i> ${averageRating}
                        </span>
                        <span class="text-[10px] text-gray-400">(${totalReviews} রিভিউ)</span>
                    </div>

                    ${detailsBlockHTML}
                    
                    <!-- সাবমিট সংশোধন বাটন -->
                    <div class="mt-2.5">
                        <button onclick="openSuggestEditModal('${id}', '${window.currentLoadedCategory}', '${name}', '${phone}')" class="text-[10px] font-bold text-orange-500 bg-orange-50/80 px-2 py-0.5 rounded-full border border-orange-100 hover:bg-orange-100 transition">
                            <i class="fa-solid fa-triangle-exclamation"></i> তথ্য পরিবর্তন করতে আবেদন করুন
                        </button>
                    </div>
                </div>
            </div>
            
            ${actionButtonsHTML}
        </div>`;
    }).join('');
};

// লাইভ সার্চ ফিল্টার হ্যান্ডেলার
window.handleDirectoryLiveSearch = (queryText) => {
    const term = queryText.toLowerCase().trim();
    if (!term) {
        renderDirectoryItems(window.currentCategoryItems);
        return;
    }
    const filtered = window.currentCategoryItems.filter(item => {
        const name = (item.name || '').toLowerCase();
        const details = (item.designation || item.details || '').toLowerCase();
        const address = (item.address || '').toLowerCase();
        return name.includes(term) || details.includes(term) || address.includes(term);
    });
    renderDirectoryItems(filtered);
};

// কপি টু ক্লিপবোর্ড
window.copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        window.showToast("নম্বরটি ক্লিপবোর্ডে কপি করা হয়েছে!");
    }).catch(() => {
        window.showToast("কপি করা সম্ভব হয়নি", "error");
    });
};

// চ্যাট ট্র্রিগার সিস্টেম
window.triggerDirectAppChat = (chatUid, name) => {
    if (chatUid === window.currentUser.uid) {
        window.showToast("নিজেকে মেসেজ পাঠানো সম্ভব নয়!", "error");
        return;
    }
    window.switchPage('messages');
    setTimeout(() => {
        if (typeof window.startChat === 'function') {
            window.startChat(chatUid, name);
        }
    }, 150);
};

// বুকমার্ক এড/রিমুভ (Local Storage)
window.toggleBookmark = (itemId) => {
    let bookmarks = JSON.parse(localStorage.getItem('directory_bookmarks') || '[]');
    if (bookmarks.includes(itemId)) {
        bookmarks = bookmarks.filter(id => id !== itemId);
        window.showToast("বুকমার্ক থেকে সরানো হয়েছে");
    } else {
        bookmarks.push(itemId);
        window.showToast("বুকমার্কে যুক্ত করা হয়েছে");
    }
    localStorage.setItem('directory_bookmarks', JSON.stringify(bookmarks));
    
    // ভিউ রিফ্রেশ
    if (window.isBookmarkOnlyView) {
        renderBookmarksList();
    } else {
        renderDirectoryItems(window.currentCategoryItems);
    }
};

// বুকমার্ক মুড বাটন টগল
window.toggleBookmarkView = (show) => {
    window.isBookmarkOnlyView = show;
    if (show) {
        switchPage('directory-list');
        const listTitle = document.getElementById('directory-list-title');
        if (listTitle) listTitle.innerText = "আমার বুকমার্কসমূহ";
        renderBookmarksList();
    } else {
        switchPage('directory');
    }
};

// বুকমার্ক আইটেম রেন্ডার
window.renderBookmarksList = () => {
    const bookmarks = JSON.parse(localStorage.getItem('directory_bookmarks') || '[]');
    if (bookmarks.length === 0) {
        renderDirectoryItems([]);
        return;
    }

    // অল ক্যাটাগরির ডাটাবেস থেকে বুকমার্ক করা আইডিগুলো ফেচিং (Low Latency)
    const container = document.getElementById('directory-items-container');
    container.innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-green-600 text-2xl"></i></div>`;
    
    get(ref(window.db, 'directory')).then((snap) => {
        const categories = snap.val() || {};
        let bookmarkedItems = [];

        Object.keys(categories).forEach(cat => {
            Object.keys(categories[cat]).forEach(id => {
                if (bookmarks.includes(id)) {
                    bookmarkedItems.push({
                        id: id,
                        category: cat,
                        ...categories[cat][id]
                    });
                }
            });
        });

        renderDirectoryItems(bookmarkedItems);
    });
};

// --- তথ্য সংশোধন মডাল হ্যান্ডেলারস ---
window.openSuggestEditModal = (id, category, name, phone) => {
    document.getElementById('suggest-item-id').value = id;
    document.getElementById('suggest-item-category').value = category;
    document.getElementById('suggest-name').value = name;
    document.getElementById('suggest-phone').value = phone;
    document.getElementById('directory-suggest-modal').classList.remove('hidden');
};

window.closeSuggestEditModal = () => {
    document.getElementById('directory-suggest-modal').classList.add('hidden');
};

window.submitSuggestedEdit = () => {
    const id = document.getElementById('suggest-item-id').value;
    const cat = document.getElementById('suggest-item-category').value;
    const name = document.getElementById('suggest-name').value.trim();
    const phone = document.getElementById('suggest-phone').value.trim();
    const details = document.getElementById('suggest-details').value.trim();

    if (!name || !phone) {
        window.showToast("নাম এবং ফোন নম্বর পূরণ করুন!", "error");
        return;
    }

    const editRef = ref(window.db, `directory_edits/${cat}/${id}`);
    push(editRef, {
        suggestedName: name,
        suggestedPhone: phone,
        details: details,
        submitterUid: window.currentUser.uid,
        submitterName: window.userDetails.name || 'অজ্ঞাত ব্যবহারকারী',
        timestamp: Date.now()
    }).then(() => {
        window.showToast("আপনার সংশোধনের আবেদন সফলভাবে পাঠানো হয়েছে!");
        closeSuggestEditModal();
        document.getElementById('suggest-details').value = '';
    }).catch(() => {
        window.showToast("আবেদন পাঠাতে সমস্যা হয়েছে", "error");
    });
};

// --- রেটিং/রিভিউ মডাল হ্যান্ডেলারস ---
window.openRatingModal = (id, category, name) => {
    document.getElementById('rating-item-id').value = id;
    document.getElementById('rating-item-category').value = category;
    document.getElementById('rating-item-name').innerText = name;
    
    // স্টার রিসেট
    setRatingValue(0);
    document.getElementById('rating-comment').value = '';
    document.getElementById('directory-rating-modal').classList.remove('hidden');
};

window.closeDirectoryRatingModal = () => {
    document.getElementById('directory-rating-modal').classList.add('hidden');
};

window.setRatingValue = (val) => {
    document.getElementById('selected-star-val').value = val;
    for (let i = 1; i <= 5; i++) {
        const star = document.getElementById(`star-${i}`);
        if (i <= val) {
            star.classList.replace('text-gray-300', 'text-yellow-500');
        } else {
            star.classList.replace('text-yellow-500', 'text-gray-300');
        }
    }
};

window.submitDirectoryRating = () => {
    const id = document.getElementById('rating-item-id').value;
    const cat = document.getElementById('rating-item-category').value;
    const starVal = parseInt(document.getElementById('selected-star-val').value);
    const comment = document.getElementById('rating-comment').value.trim();

    if (starVal === 0) {
        window.showToast("দয়া করে অন্তত ১টি স্টার নির্বাচন করুন!", "error");
        return;
    }

    const userUid = window.currentUser.uid;
    const ratingRef = ref(window.db, `directory_reviews/${cat}/${id}/${userUid}`);

    set(ratingRef, {
        rating: starVal,
        comment: comment,
        userName: window.userDetails.name || 'অজ্ঞাত ব্যবহারকারী',
        timestamp: Date.now()
    }).then(() => {
        window.showToast("আপনার রেটিং প্রদানের জন্য ধন্যবাদ!");
        closeDirectoryRatingModal();
    }).catch(() => {
        window.showToast("রেটিং জমা দিতে ব্যর্থ হয়েছে", "error");
    });
};