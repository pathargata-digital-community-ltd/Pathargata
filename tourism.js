import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// গ্লোবাল ভ্যারিয়েবল ডাটা ক্যাশ করার জন্য
window.tourismRawData = [];

window.loadTourismContent = async function() {
    const container = document.getElementById('tourism-items-container');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-center p-10">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>`;

    try {
        const db = window.db || getDatabase();
        const snapshot = await get(ref(db, 'services/data/history_tourism'));
        const items = snapshot.val() || {};
        
        // এরে ফরম্যাটে রূপান্তর এবং ক্যাশ সংরক্ষণ
        window.tourismRawData = Object.values(items);
        
        // ডিফল্টভাবে সব ডাটা দেখানো হবে
        renderTourismList(window.tourismRawData);

    } catch (error) {
        console.error("Error loading tourism data:", error);
        container.innerHTML = `
            <div class="text-center py-12 bg-white rounded-2xl border border-gray-100">
                <i class="fa-solid fa-triangle-exclamation text-red-500 text-4xl mb-3"></i>
                <p class="text-red-500 font-semibold">তথ্য লোড করতে সমস্যা হয়েছে</p>
            </div>`;
    }
};

// ডাটা রেন্ডার করার জন্য কমন ফাংশন
function renderTourismList(data) {
    const container = document.getElementById('tourism-items-container');
    if (!container) return;

    if (data.length > 0) {
        container.innerHTML = data.map(item => {
            const imgHtml = item.image 
                ? `<div class="h-48 bg-gray-200 overflow-hidden relative">
                     <img src="${item.image}" loading="lazy" class="w-full h-full object-cover">
                   </div>` 
                : '';
            
            // ফোন কল বাটন
            const phoneBtn = item.phone 
                ? `<a href="tel:${item.phone}" class="w-9 h-9 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center hover:bg-purple-100 transition active:scale-95">
                     <i class="fa-solid fa-phone"></i>
                   </a>` 
                : '';

            // গুগল ম্যাপ বাটন (ম্যাপ কোঅর্ডিনেট বা অ্যাড্রেস দিয়ে সার্চ করার জন্য)
            const mapQuery = item.coordinates || item.title + " পাথরঘাটা";
            const mapBtn = `
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}" target="_blank" class="w-9 h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition active:scale-95">
                    <i class="fa-solid fa-location-arrow"></i>
                </a>`;

            return `
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all hover:shadow-md duration-200">
                    ${imgHtml}
                    <div class="p-4">
                        <div class="flex justify-between items-start gap-4">
                            <div class="flex-1">
                                <h3 class="font-bold text-gray-800 text-base leading-snug">${window.escapeHTML(item.title)}</h3>
                                <p class="text-xs text-gray-500 mt-2 leading-relaxed">${window.escapeHTML(item.details || '')}</p>
                            </div>
                            <div class="flex flex-col gap-2">
                                ${phoneBtn}
                                ${mapBtn}
                            </div>
                        </div>
                        ${item.address ? `
                        <div class="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
                            <i class="fa-solid fa-location-dot text-purple-500"></i>
                            <span class="truncate">${window.escapeHTML(item.address)}</span>
                        </div>` : ''}
                    </div>
                </div>`;
        }).join('');
    } else {
        container.innerHTML = `
            <div class="text-center py-12 bg-white rounded-2xl border border-gray-100">
                <i class="fa-regular fa-folder-open text-5xl text-gray-300 mb-3"></i>
                <p class="text-gray-400 font-medium">এই ক্যাটাগরিতে কোনো তথ্য পাওয়া যায়নি</p>
            </div>`;
    }
}

// ক্যাটাগরি ফিল্টারিং ফাংশন
window.filterTourism = function(category) {
    // সব ফিল্টার বাটনের ব্যাকগ্রাউন্ড রিসেট করা
    document.querySelectorAll('.tourism-cat-btn').forEach(btn => {
        btn.classList.remove('bg-purple-600', 'text-white');
        btn.classList.add('bg-white', 'text-gray-600', 'border-gray-100');
    });

    // সিলেক্টেড বাটনের স্টাইল পরিবর্তন
    const activeBtn = document.getElementById(`cat-tourism-${category}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-white', 'text-gray-600', 'border-gray-100');
        activeBtn.classList.add('bg-purple-600', 'text-white');
    }

    if (category === 'all') {
        renderTourismList(window.tourismRawData);
    } else {
        // ক্যাটাগরি অনুযায়ী ফিল্টার (ডাটাবেস থেকে পাওয়া item.category ম্যাচ করবে)
        const filtered = window.tourismRawData.filter(item => item.category === category);
        renderTourismList(filtered);
    }
};