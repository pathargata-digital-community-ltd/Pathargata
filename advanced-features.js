window.ADVANCED_FEATURES = {
    // পাথরঘাটার জিরো পয়েন্টের Latitude ও Longitude (কেন্দ্রবিন্দু)
    patharghataLat: 22.0450,
    patharghataLng: 89.9675,
    maxRadiusKm: 25, // ২৫ কিলোমিটারের মধ্যে থাকলে অটো অ্যাপ্রুভ

    // দূরত্ব মাপার ফাংশন (Haversine Formula)
    getDistanceFromLatLonInKm: function(lat1, lon1, lat2, lon2) {
        var R = 6371; // পৃথিবীর ব্যাসার্ধ (কিলোমিটার)
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    // ইউজারের লোকেশন চেক করার ফাংশন (রেজিস্ট্রেশনের সময় কল হবে)
    checkUserLocation: function() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                // লোকেশন সাপোর্ট না করলে পেন্ডিং হয়ে যাবে
                resolve({ status: 'pending', lat: null, lng: null });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    let userLat = position.coords.latitude;
                    let userLng = position.coords.longitude;
                    let distance = this.getDistanceFromLatLonInKm(this.patharghataLat, this.patharghataLng, userLat, userLng);
                    
                    if (distance <= this.maxRadiusKm) {
                        resolve({ status: 'approved', lat: userLat, lng: userLng });
                    } else {
                        resolve({ status: 'pending', lat: userLat, lng: userLng });
                    }
                },
                (error) => {
                    // পারমিশন না দিলে পেন্ডিং হয়ে যাবে
                    resolve({ status: 'pending', lat: null, lng: null });
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    },

    // লক স্ক্রিন দেখানোর ফাংশন (HTML Injector)
    showLockScreen: function() {
        // অ্যাপের মূল অংশ লুকিয়ে ফেলা
        document.getElementById('main-app').style.display = 'none';
        
        let lockScreenHtml = `
        <div id="smart-lock-screen" class="fixed inset-0 bg-gray-50 z-[9999] flex flex-col items-center justify-center p-6 text-center">
            <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-4xl mb-4 shadow-lg border-4 border-white">
                <i class="fa-solid fa-lock"></i>
            </div>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">অ্যাকাউন্ট পেন্ডিং!</h2>
            <p class="text-sm text-gray-600 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                আপনার বর্তমান লোকেশন পাথরঘাটার সীমানার বাইরে। আপনি যদি পাথরঘাটার স্থানীয় বাসিন্দা হন, তবে প্রমাণ দিন। অথবা ট্যুরিস্ট হিসেবে প্রবেশ করুন।
            </p>
            
            <div class="w-full max-w-sm space-y-3">
                <button onclick="alert('NID আপলোড সিস্টেম শিঘ্রই আসছে')" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow hover:bg-blue-700 transition flex justify-center items-center gap-2">
                    <i class="fa-solid fa-id-card"></i> NID / জন্ম নিবন্ধন আপলোড করুন
                </button>
                <a href="https://wa.me/8801700000000" target="_blank" class="w-full bg-green-500 text-white font-bold py-3.5 rounded-xl shadow hover:bg-green-600 transition flex justify-center items-center gap-2 block">
                    <i class="fa-brands fa-whatsapp text-lg"></i> অ্যাডমিনের সাথে কথা বলুন
                </a>
                <div class="my-4 border-t border-gray-300 relative">
                    <span class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gray-50 px-2 text-gray-500 text-sm font-bold">অথবা</span>
                </div>
                <button onclick="ADVANCED_FEATURES.enterAsTourist()" class="w-full bg-white text-purple-600 border-2 border-purple-600 font-bold py-3.5 rounded-xl shadow hover:bg-purple-50 transition flex justify-center items-center gap-2">
                    <i class="fa-solid fa-plane-departure"></i> ট্যুরিস্ট হিসেবে প্রবেশ করুন
                </button>
            </div>
            <button onclick="window.location.reload()" class="mt-8 text-sm text-gray-500 hover:text-red-500 font-bold underline">লগআউট করুন</button>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', lockScreenHtml);
    },

    // ট্যুরিস্ট হিসেবে প্রবেশ
    enterAsTourist: function() {
        document.getElementById('smart-lock-screen').remove();
        document.getElementById('main-app').style.display = 'block';
        this.enableTouristMode();
        showToast("ট্যুরিস্ট হিসেবে স্বাগতম! কিছু ফিচারে সীমাবদ্ধতা রয়েছে।", "success");
    },

    // ট্যুরিস্টদের জন্য রেস্ট্রিকশন
    enableTouristMode: function() {
        // নতুন পোস্ট করার বাটন হাইড করা
        const fab = document.getElementById('fab-container');
        if(fab) fab.style.display = 'none';
        
        // मार्केटে পণ্য বিক্রির বাটন হাইড করা
        const sellBtn = document.querySelector('button[onclick="toggleSellModal(true)"]');
        if(sellBtn) sellBtn.style.display = 'none';
        
        // CSS এর মাধ্যমে আরও কিছু অপশন হাইড করা (যেমন কমেন্ট বক্স)
        const style = document.createElement('style');
        style.innerHTML = `
            .tourist-hidden { display: none !important; }
            .chat-bubble-me, .chat-bubble-other { filter: blur(2px); pointer-events: none; }
        `;
        document.head.appendChild(style);
    }
};

// --- শিক্ষা এবং পর্যটনের জন্য নতুন ওভাররাইড করা ডাইনামিক ফাংশন ---
window.openDynamicCategory = (catId, title) => {
    switchPage('dynamic-content');
    document.getElementById('dynamic-content-title').innerText = title;
    const container = document.getElementById('dynamic-items-container');
    container.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    
    // ডাটা ফায়ারবেস থেকে আনার জন্য ইভেন্ট লিসেনার ব্যবহার (যেহেতু ফায়ারবেস মেইন ফাইলে আছে)
    window.dispatchEvent(new CustomEvent('fetchDynamicData', { detail: { catId, containerId: 'dynamic-items-container', title } }));
};

// ডাটা রেন্ডার করার হেল্পার
window.renderBeautifulCards = (items, containerId) => {
    const container = document.getElementById(containerId);
    container.innerHTML = Object.keys(items).length > 0 ? Object.values(items).map(item => {
        const imgHtml = item.image 
            ? `<div class="h-40 w-full relative overflow-hidden"><img src="${item.image}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"></div>` 
            : `<div class="h-24 bg-gray-100 flex items-center justify-center text-gray-400"><i class="fa-solid fa-image text-3xl"></i></div>`;
        
        let actionBtns = '';
        if(item.phone) actionBtns += `<a href="tel:${item.phone}" class="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shadow-sm hover:bg-green-500 hover:text-white transition-all"><i class="fa-solid fa-phone"></i></a>`;
        if(item.map) actionBtns += `<a href="${item.map}" target="_blank" class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm hover:bg-blue-500 hover:text-white transition-all"><i class="fa-solid fa-location-dot"></i></a>`;
        if(item.website) actionBtns += `<a href="${item.website}" target="_blank" class="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shadow-sm hover:bg-purple-500 hover:text-white transition-all"><i class="fa-solid fa-globe"></i></a>`;

        return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4 transform transition-all hover:shadow-md">
            ${imgHtml}
            <div class="p-4">
                <h3 class="font-bold text-gray-800 text-lg mb-1">${escapeHTML(item.title)}</h3>
                <p class="text-sm text-gray-500 mb-4 line-clamp-3 leading-relaxed">${escapeHTML(item.details || '')}</p>
                <div class="flex justify-end gap-2 border-t pt-3 mt-2 border-gray-50">${actionBtns}</div>
            </div>
        </div>`;
    }).join('') : `<div class="text-center py-10"><p class="text-gray-500">শীঘ্রই তথ্য যুক্ত করা হবে</p></div>`;
};
