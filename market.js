import { getDatabase, ref, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.db || getDatabase();
window.selectedSellImages = [];

// ছবি প্রিভিউ করার ফাংশন
window.previewSellImages = (input) => {
    const previewContainer = document.getElementById('sell-image-preview');
    previewContainer.innerHTML = '';
    
    if (input.files && input.files.length > 0) {
        window.selectedSellImages = Array.from(input.files).slice(0, 4); // সর্বোচ্চ ৪টি ছবি
        
        window.selectedSellImages.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewContainer.innerHTML += `<div class="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-gray-300 relative">
                        <img src="${e.target.result}" class="w-full h-full object-cover">
                    </div>`;
                };
                reader.readAsDataURL(file);
            }
        });
    }
};

// পণ্য আপলোড করার ফাংশন (একাধিক ছবি সহ)
window.submitProduct = async () => {
    const title = document.getElementById('sell-title').value.trim();
    const price = document.getElementById('sell-price').value.trim();
    const desc = document.getElementById('sell-desc').value.trim();
        
    if (!title || !price) return window.showToast("পণ্যের নাম এবং দাম দিতে হবে", "error");
    if (window.selectedSellImages.length === 0) return window.showToast("অন্তত একটি ছবি দিন", "error");
    
    const btn = document.getElementById('btn-sell-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> আপলোড হচ্ছে...';
    btn.disabled = true;
    
    try {
        let imgUrls = [];
        // সব ছবি একসাথে ক্লাউডিনারিতে আপলোড করা
        const uploadPromises = window.selectedSellImages.map(file => window.uploadMediaToCloudinary(file));
        const results = await Promise.all(uploadPromises);
        imgUrls = results.map(res => res.url);
        
        await push(ref(db, 'market_items'), {
            uid: window.currentUser.uid,
            seller: window.userDetails.name,
            sellerPic: window.userDetails.profile_pic || '',
            title,
            price,
            desc,
            images: imgUrls, // Array of images
            time: Date.now()
        });
        
        if (typeof window.toggleSellModal === 'function') window.toggleSellModal(false);
        // ফর্ম রিসেট
        document.getElementById('sell-title').value = "";
        document.getElementById('sell-price').value = "";
        document.getElementById('sell-desc').value = "";
        document.getElementById('sell-image-file').value = "";
        document.getElementById('sell-image-preview').innerHTML = "";
        window.selectedSellImages = [];
        
        if (typeof window.showToast === 'function') window.showToast("পণ্য সফলভাবে যুক্ত হয়েছে!", "success");
    } catch (e) {
        console.error(e);
        if (typeof window.showToast === 'function') window.showToast("আপলোডে সমস্যা: " + e.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// রিয়েল-টাইমে পণ্য লোড করার ফাংশন
onValue(ref(db, 'market_items'), (snap) => {
    // ডাটাবেস থেকে ID সহ ডাটা নেওয়া হচ্ছে
    window.globalMarketItems = snap.exists() ? Object.entries(snap.val()).map(([id, item]) => ({ id, ...item })).reverse() : [];
    
    const marketListContainer = document.getElementById('market-list');
    
    if(marketListContainer) {
        marketListContainer.innerHTML = window.globalMarketItems.length > 0 ? window.globalMarketItems.map(item => {
            // আগের সিঙ্গেল ইমেজ বা নতুন মাল্টিপল ইমেজ সাপোর্ট
            const firstImage = (item.images && item.images.length > 0) ? item.images[0] : (item.image || '');
            const imgTag = firstImage ? `<img src="${firstImage}" class="h-full w-full object-cover group-hover:scale-105 transition-transform">` : `<div class="h-full w-full flex items-center justify-center bg-gray-200"><i class="fa-solid fa-image text-3xl text-gray-400"></i></div>`;
            const imageCountBadge = (item.images && item.images.length > 1) ? `<span class="absolute top-2 right-2 bg-black bg-opacity-60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"><i class="fa-regular fa-images"></i> ${item.images.length}</span>` : '';

            return `<div onclick="openProductDetails('${item.id}')" class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between overflow-hidden cursor-pointer hover:shadow-md transition group">
                <div class="relative h-32 w-full overflow-hidden bg-gray-100">
                    ${imgTag}
                    ${imageCountBadge}
                </div>
                <div class="p-3">
                    <h3 class="font-bold text-sm text-gray-800 line-clamp-2 leading-tight">${window.escapeHTML(item.title)}</h3>
                    <p class="text-orange-600 font-extrabold text-base mt-1">৳ ${window.escapeHTML(item.price)}</p>
                    <p class="text-[10px] text-gray-500 mt-2 flex items-center gap-1 truncate"><i class="fa-solid fa-user-tag"></i> ${window.escapeHTML(item.seller).split(' ')[0]}</p>
                </div>
            </div>`;
        }).join('') : '<p class="col-span-2 text-center text-gray-400 py-10">কোনো পণ্য পাওয়া যায়নি</p>';
    }
    
    // যদি My Products মডাল ওপেন থাকে, তবে সেটাও আপডেট হবে
    if(!document.getElementById('my-products-modal').classList.contains('hidden-custom')) {
        renderMyProducts();
    }
});

// প্রোডাক্ট ডিটেইলস ভিউ ওপেন করা
window.openProductDetails = (id) => {
    const product = window.globalMarketItems.find(p => p.id === id);
    if (!product) return;
    
    const contentDiv = document.getElementById('product-details-content');
    
    // ছবিগুলো রেন্ডার করা (Horizontal scroll if multiple)
    let imagesHtml = '';
    const imagesArray = (product.images && product.images.length > 0) ? product.images : (product.image ? [product.image] : []);
    
    if (imagesArray.length > 0) {
        imagesHtml = `<div class="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide bg-black h-64 sm:h-72 w-full">
            ${imagesArray.map(img => `<img src="${img}" onclick="window.openImageViewer('${img}')" class="w-full h-full object-contain shrink-0 snap-center">`).join('')}
        </div>`;
    } else {
        imagesHtml = `<div class="h-48 w-full bg-gray-200 flex items-center justify-center"><i class="fa-solid fa-image text-5xl text-gray-400"></i></div>`;
    }
    
    // সেলার অপশন (নিজের প্রোডাক্ট হলে ডিলিট, অন্যের হলে মেসেজ/কল)
    let actionButtons = '';
    if (product.uid === window.currentUser.uid) {
        actionButtons = `<button onclick="deleteProduct('${id}', true)" class="w-full bg-red-100 text-red-600 font-bold py-3 rounded-xl hover:bg-red-200 transition flex justify-center items-center gap-2"><i class="fa-solid fa-trash"></i> বিজ্ঞাপনটি মুছুন</button>`;
    } else {
        actionButtons = `<div class="flex gap-2 w-full">
            <button onclick="startChat('${product.uid}', '${window.escapeHTML(product.seller)}'); closeProductDetails();" class="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-md flex justify-center items-center gap-2"><i class="fa-brands fa-facebook-messenger"></i> মেসেজ</button>
            <a href="tel:${product.desc.match(/\d{11}/) ? product.desc.match(/\d{11}/)[0] : ''}" onclick="if(!this.href.includes('tel:0')) { alert('যোগাযোগের নম্বর দেওয়া নেই'); return false; }" class="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition shadow-md flex justify-center items-center gap-2"><i class="fa-solid fa-phone"></i> কল করুন</a>
        </div>`;
    }

    const sellerAvatar = product.sellerPic ? `<img src="${product.sellerPic}" class="w-12 h-12 rounded-full object-cover">` : `<div class="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-xl">${product.seller.charAt(0)}</div>`;

    contentDiv.innerHTML = `
        ${imagesHtml}
        ${imagesArray.length > 1 ? `<p class="text-center text-[10px] text-gray-400 bg-gray-100 py-1"><i class="fa-solid fa-arrows-left-right"></i> স্লাইড করে বাকি ছবি দেখুন</p>` : ''}
        <div class="p-5">
            <h2 class="text-xl font-bold text-gray-900 leading-tight mb-2">${window.escapeHTML(product.title)}</h2>
            <p class="text-2xl font-extrabold text-orange-600 mb-4">৳ ${window.escapeHTML(product.price)}</p>
            
            <h4 class="font-bold text-sm text-gray-700 border-b pb-1 mb-2">বিস্তারিত বিবরণ</h4>
            <p class="text-sm text-gray-600 whitespace-pre-line mb-6">${window.escapeHTML(product.desc)}</p>
            
            <div class="bg-gray-50 p-3 rounded-xl flex items-center justify-between mb-6 border border-gray-100">
                <div class="flex items-center gap-3" onclick="openUserProfile('${product.uid}'); closeProductDetails();" style="cursor:pointer;">
                    ${sellerAvatar}
                    <div>
                        <p class="text-xs text-gray-500">বিক্রেতা</p>
                        <h4 class="font-bold text-gray-800">${window.escapeHTML(product.seller)}</h4>
                    </div>
                </div>
            </div>
            
            <div class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t sm:relative sm:border-t-0 sm:p-0">
                ${actionButtons}
            </div>
        </div>
    `;
    
    const modal = document.getElementById('product-details-modal');
    modal.classList.remove('hidden-custom');
    // Animation trigger
    setTimeout(() => {
        modal.classList.remove('translate-y-full');
    }, 10);
};

window.closeProductDetails = () => {
    const modal = document.getElementById('product-details-modal');
    modal.classList.add('translate-y-full');
    setTimeout(() => {
        modal.classList.add('hidden-custom');
    }, 300);
};

// আমার পণ্যসমূহ ওপেন করা
window.openMyProducts = () => {
    document.getElementById('my-products-modal').classList.remove('hidden-custom');
    renderMyProducts();
};

window.closeMyProducts = () => {
    document.getElementById('my-products-modal').classList.add('hidden-custom');
};

// নিজের প্রোডাক্ট রেন্ডার করা
function renderMyProducts() {
    const myProducts = window.globalMarketItems.filter(p => p.uid === window.currentUser.uid);
    const container = document.getElementById('my-products-list');
    
    if (myProducts.length > 0) {
        container.innerHTML = myProducts.map(item => {
            const firstImage = (item.images && item.images.length > 0) ? item.images[0] : (item.image || '');
            const imgTag = firstImage ? `<img src="${firstImage}" class="w-16 h-16 rounded-lg object-cover">` : `<div class="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center"><i class="fa-solid fa-image text-gray-400"></i></div>`;
            
            return `<div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 overflow-hidden cursor-pointer" onclick="openProductDetails('${item.id}')">
                    ${imgTag}
                    <div class="truncate">
                        <h4 class="font-bold text-sm text-gray-800 truncate">${window.escapeHTML(item.title)}</h4>
                        <p class="text-orange-600 font-bold text-xs mt-0.5">৳ ${window.escapeHTML(item.price)}</p>
                        <p class="text-[10px] text-gray-400 mt-1">${window.timeAgo(item.time)}</p>
                    </div>
                </div>
                <button onclick="deleteProduct('${item.id}')" class="w-10 h-10 shrink-0 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-100 transition"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
        }).join('');
    } else {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full pt-20 text-gray-400">
                <i class="fa-solid fa-box-open text-5xl mb-3 text-gray-300"></i>
                <p>আপনি এখনো কোনো পণ্য আপলোড করেননি</p>
                <button onclick="closeMyProducts(); toggleSellModal(true);" class="mt-4 bg-orange-100 text-orange-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-orange-200"><i class="fa-solid fa-plus"></i> নতুন পণ্য যোগ করুন</button>
            </div>
        `;
    }
}

// প্রোডাক্ট ডিলিট করার ফাংশন
window.deleteProduct = async (id, closeDetails = false) => {
    if (confirm("আপনি কি নিশ্চিত যে এই বিজ্ঞাপনটি মুছে ফেলতে চান?")) {
        try {
            await remove(ref(db, 'market_items/' + id));
            if (typeof window.showToast === 'function') window.showToast("পণ্য মুছে ফেলা হয়েছে!");
            if (closeDetails) closeProductDetails();
        } catch (e) {
            console.error(e);
            if (typeof window.showToast === 'function') window.showToast("সমস্যা হয়েছে: " + e.message, 'error');
        }
    }
};