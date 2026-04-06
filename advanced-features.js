// --- Advanced Security & UI Module for Patharghata Digital ---

window.ADVANCED_FEATURES = {
    patharghataLat: 22.0450,
    patharghataLng: 89.9675,
    maxRadiusKm: 15, 

    getDistanceFromLatLonInKm: function(lat1, lon1, lat2, lon2) {
        var R = 6371; 
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    checkUserLocation: function() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ status: 'pending', lat: null, lng: null }); return;
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
                (error) => resolve({ status: 'pending', lat: null, lng: null }),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    },

    // আপডেট করা লক স্ক্রিন (NID আপলোড ও স্ট্যাটাস সহ)
    showLockScreen: function(userData) {
        document.getElementById('main-app').style.display = 'none';
        
        if(document.getElementById('smart-lock-screen')) {
            document.getElementById('smart-lock-screen').remove();
        }

        let statusHTML = '';

        // যদি ইউজার NID জমা দিয়ে থাকে (যাচাই চলছে)
        if (userData.status === 'pending_review') {
            statusHTML = `
                <div class="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 text-4xl mb-4 shadow-lg border-4 border-white mx-auto">
                    <i class="fa-solid fa-hourglass-half"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mb-2">যাচাই চলছে...</h2>
                <p class="text-sm text-gray-600 mb-6 bg-yellow-50 p-4 rounded-xl shadow-sm border border-yellow-200">
                    আপনার NID কার্ডটি অ্যাডমিন প্যানেলে জমা হয়েছে। যাচাই শেষে আপনাকে অ্যাপে প্রবেশের অনুমতি দেওয়া হবে।
                </p>
                <button onclick="window.location.reload()" class="mt-4 bg-gray-100 text-gray-700 px-6 py-2 rounded-full font-bold shadow-sm hover:bg-gray-200">রিফ্রেশ করুন</button>
            `;
        } 
        // যদি নতুন ইউজার হয় (পেন্ডিং)
        else {
            statusHTML = `
                <div class="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-4xl mb-4 shadow-lg border-4 border-white mx-auto">
                    <i class="fa-solid fa-lock"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mb-2">অ্যাকাউন্ট পেন্ডিং!</h2>
                <p class="text-sm text-gray-600 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    আপনার বর্তমান লোকেশন পাথরঘাটার সীমানার বাইরে। আপনি যদি পাথরঘাটার স্থানীয় বাসিন্দা হন, তবে NID দিয়ে প্রমাণ দিন। অথবা ট্যুরিস্ট হিসেবে প্রবেশ করুন।
                </p>
                
                <div id="lock-options" class="w-full max-w-sm space-y-3 mx-auto">
                    <button onclick="ADVANCED_FEATURES.showNidUploadForm()" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow hover:bg-blue-700 transition flex justify-center items-center gap-2">
                        <i class="fa-solid fa-id-card"></i> NID / জন্ম নিবন্ধন আপলোড
                    </button>
                    
                    <a href="#" id="admin-wa-btn" target="_blank" class="w-full bg-green-500 text-white font-bold py-3.5 rounded-xl shadow hover:bg-green-600 transition flex justify-center items-center gap-2 block">
                        <i class="fa-brands fa-whatsapp text-lg"></i> অ্যাডমিনের সাথে কথা বলুন
                    </a>
                    
                    <div class="my-4 border-t border-gray-300 relative">
                        <span class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gray-50 px-2 text-gray-500 text-sm font-bold">অথবা</span>
                    </div>
                    
                    <button onclick="ADVANCED_FEATURES.requestTouristMode()" class="w-full bg-white text-purple-600 border-2 border-purple-600 font-bold py-3.5 rounded-xl shadow hover:bg-purple-50 transition flex justify-center items-center gap-2">
                        <i class="fa-solid fa-plane-departure"></i> ট্যুরিস্ট হিসেবে প্রবেশ করুন
                    </button>
                </div>

                <!-- লুকানো NID আপলোড ফর্ম -->
                <div id="nid-upload-section" class="w-full max-w-sm mx-auto hidden bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 class="font-bold text-gray-800 mb-2 text-left text-sm">NID/জন্ম নিবন্ধন আপলোড করুন</h3>
                    <input type="file" id="nid-file-input" accept="image/*" class="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg text-sm mb-3">
                    <div class="flex gap-2">
                        <button onclick="ADVANCED_FEATURES.cancelNidUpload()" class="flex-1 bg-gray-200 text-gray-700 font-bold py-2.5 rounded-lg text-sm">বাতিল</button>
                        <button onclick="ADVANCED_FEATURES.submitNid()" id="nid-submit-btn" class="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-lg text-sm flex justify-center items-center gap-2">সাবমিট করুন</button>
                    </div>
                </div>

                <button onclick="window.location.reload()" class="mt-8 text-sm text-gray-500 hover:text-red-500 font-bold underline">লগআউট করুন</button>
            `;
        }

        let lockScreenHtml = `<div id="smart-lock-screen" class="fixed inset-0 bg-gray-50 z-[9999] flex flex-col items-center justify-center p-6 text-center overflow-y-auto">${statusHTML}</div>`;
        document.body.insertAdjacentHTML('beforeend', lockScreenHtml);

        // ফায়ারবেস থেকে হোয়াটসঅ্যাপ লিংক কল করা
        window.dispatchEvent(new CustomEvent('fetchWhatsAppLink'));
    },

    showNidUploadForm: function() {
        document.getElementById('lock-options').classList.add('hidden');
        document.getElementById('nid-upload-section').classList.remove('hidden');
    },

    cancelNidUpload: function() {
        document.getElementById('lock-options').classList.remove('hidden');
        document.getElementById('nid-upload-section').classList.add('hidden');
        document.getElementById('nid-file-input').value = "";
    },

    // NID সাবমিট বাটন (ইভেন্ট পাঠাবে)
    submitNid: function() {
        const fileInput = document.getElementById('nid-file-input');
        if(!fileInput.files || fileInput.files.length === 0) {
            alert("দয়া করে একটি ছবি নির্বাচন করুন!"); return;
        }
        const btn = document.getElementById('nid-submit-btn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> আপলোড হচ্ছে...';
        btn.disabled = true;
        window.dispatchEvent(new CustomEvent('uploadNIDEvent', { detail: { file: fileInput.files[0] } }));
    },

    // ট্যুরিস্ট মোড রিকোয়েস্ট (ইভেন্ট পাঠাবে)
    requestTouristMode: function() {
        if(confirm("ট্যুরিস্ট মোডে প্রবেশ করলে আপনি আর সাধারণ ইউজারে ফিরে যেতে পারবেন না এবং পোস্ট করতে পারবেন না। আপনি কি নিশ্চিত?")) {
            window.dispatchEvent(new CustomEvent('updateStatusEvent', { detail: { newStatus: 'tourist' } }));
        }
    },

    enableTouristMode: function() {
        const lockScreen = document.getElementById('smart-lock-screen');
        if(lockScreen) lockScreen.remove();
        
        document.getElementById('main-app').style.display = 'block';
        
        const fab = document.getElementById('fab-container');
        if(fab) fab.style.display = 'none';
        
        const sellBtn = document.querySelector('button[onclick="toggleSellModal(true)"]');
        if(sellBtn) sellBtn.style.display = 'none';
        
        if(!document.getElementById('tourist-css')) {
            const style = document.createElement('style');
            style.id = 'tourist-css';
            style.innerHTML = `.tourist-hidden { display: none !important; } .chat-bubble-me, .chat-bubble-other { filter: blur(2px); pointer-events: none; }`;
            document.head.appendChild(style);
        }
    }
};

window.openDynamicCategory = (catId, title) => {
    switchPage('dynamic-content');
    document.getElementById('dynamic-content-title').innerText = title;
    const container = document.getElementById('dynamic-items-container');
    container.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    window.dispatchEvent(new CustomEvent('fetchDynamicData', { detail: { catId, containerId: 'dynamic-items-container', title } }));
};

window.renderBeautifulCards = (items, containerId) => {
    const container = document.getElementById(containerId);
    container.innerHTML = Object.keys(items).length > 0 ? Object.values(items).map(item => {
        const imgHtml = item.image ? `<div class="h-40 w-full relative overflow-hidden"><img src="${item.image}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"></div>` : `<div class="h-24 bg-gray-100 flex items-center justify-center text-gray-400"><i class="fa-solid fa-image text-3xl"></i></div>`;
        let actionBtns = '';
        if(item.phone) actionBtns += `<a href="tel:${item.phone}" class="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shadow-sm hover:bg-green-500 hover:text-white transition-all border border-green-200"><i class="fa-solid fa-phone"></i></a>`;
        if(item.map) actionBtns += `<a href="${item.map}" target="_blank" class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm hover:bg-blue-500 hover:text-white transition-all border border-blue-200"><i class="fa-solid fa-location-dot"></i></a>`;
        if(item.website) actionBtns += `<a href="${item.website}" target="_blank" class="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shadow-sm hover:bg-purple-500 hover:text-white transition-all border border-purple-200"><i class="fa-solid fa-globe"></i></a>`;
        return `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4 transform transition-all hover:shadow-md">${imgHtml}<div class="p-4"><h3 class="font-bold text-gray-800 text-lg mb-1">${escapeHTML(item.title)}</h3><p class="text-sm text-gray-500 mb-4 line-clamp-3 leading-relaxed">${escapeHTML(item.details || '')}</p><div class="flex justify-end gap-2 border-t pt-3 mt-2 border-gray-50">${actionBtns}</div></div></div>`;
    }).join('') : `<div class="text-center py-10"><p class="text-gray-500 font-medium">শীঘ্রই তথ্য যুক্ত করা হবে</p></div>`;
};
