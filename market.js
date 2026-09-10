import { getDatabase, ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.db || getDatabase();
window.selectedSellImages = [];
window.selectedShopLogo = null;
window.globalShops = [];
window.globalMarketItems = [];
window.userFavorites = { shops: {}, products: {} };
window.currentViewingShopId = null;
window.activeMarketTab = 'products';
window.currentOrderingProduct = null;

// ======================== ট্যাব সুইচিং ========================
window.switchMarketTab = (tab) => {
    window.activeMarketTab = tab;
    const prodBtn = document.getElementById('tab-btn-products');
    const shopBtn = document.getElementById('tab-btn-shops');
    const prodList = document.getElementById('market-products-list');
    const shopList = document.getElementById('market-shops-list');

    if (tab === 'products') {
        prodBtn.className = "flex-1 py-2 rounded-lg bg-orange-500 text-white shadow transition flex items-center justify-center gap-1.5";
        shopBtn.className = "flex-1 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition flex items-center justify-center gap-1.5";
        prodList.classList.remove('hidden');
        shopList.classList.add('hidden');
        renderMarketProducts();
    } else {
        shopBtn.className = "flex-1 py-2 rounded-lg bg-orange-500 text-white shadow transition flex items-center justify-center gap-1.5";
        prodBtn.className = "flex-1 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition flex items-center justify-center gap-1.5";
        shopList.classList.remove('hidden');
        prodList.classList.add('hidden');
        renderShopsList();
    }
};

window.handleMarketSearch = () => {
    if (window.activeMarketTab === 'products') {
        renderMarketProducts();
    } else {
        renderShopsList();
    }
};

// ======================== ফেভারিট লিসেনার ========================
function initFavoritesListener() {
    if (!window.currentUser?.uid) return;
    onValue(ref(db, `market_favorites/${window.currentUser.uid}`), (snap) => {
        window.userFavorites = snap.val() || { shops: {}, products: {} };
        if (window.renderShopsList) renderShopsList();
        if (window.currentViewingShopId) renderShopProducts(window.currentViewingShopId);
    });
}

// ফেভারিট টগল (Shop/Product)
window.toggleFavorite = async (type, id, event) => {
    if (event) event.stopPropagation();
    if (!window.currentUser?.uid) return window.showToast("অনুগ্রহ করে লগইন করুন", "error");

    const isFav = window.userFavorites[type]?.[id];
    const favRef = ref(db, `market_favorites/${window.currentUser.uid}/${type}/${id}`);

    try {
        if (isFav) {
            await remove(favRef);
            window.showToast("পছন্দের তালিকা থেকে সরানো হয়েছে");
        } else {
            await set(favRef, true);
            window.showToast("পছন্দের তালিকায় যুক্ত হয়েছে", "success");
        }
    } catch (e) {
        console.error(e);
    }
};

// ======================== দোকান ম্যানেজমেন্ট ========================

// দোকান তৈরির ছবি প্রিভিউ
window.previewShopLogo = (input) => {
    if (input.files && input.files[0]) {
        window.selectedShopLogo = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('shop-logo-preview').src = e.target.result;
            document.getElementById('shop-logo-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// নতুন দোকান তৈরি
window.submitCreateShop = async () => {
    const name = document.getElementById('shop-name').value.trim();
    const category = document.getElementById('shop-category').value.trim();
    const phone = document.getElementById('shop-phone').value.trim();
    const address = document.getElementById('shop-address').value.trim();
    const desc = document.getElementById('shop-desc').value.trim();

    if (!name || !phone || !address) return window.showToast("দোকানের নাম, ফোন এবং ঠিকানা আবশ্যক", "error");

    const btn = document.getElementById('btn-shop-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> দোকান তৈরি হচ্ছে...';
    btn.disabled = true;

    try {
        let logoUrl = '';
        if (window.selectedShopLogo) {
            const res = await window.uploadMediaToCloudinary(window.selectedShopLogo);
            logoUrl = res.url;
        }

        await push(ref(db, 'market_shops'), {
            uid: window.currentUser.uid,
            ownerName: window.userDetails.name,
            name,
            category: category || 'সাধারণ',
            phone,
            address,
            desc,
            logo: logoUrl,
            time: Date.now()
        });

        window.toggleCreateShopModal(false);
        // রিসেট
        document.getElementById('shop-name').value = '';
        document.getElementById('shop-phone').value = '';
        document.getElementById('shop-address').value = '';
        document.getElementById('shop-desc').value = '';
        document.getElementById('shop-logo-preview').classList.add('hidden');
        window.selectedShopLogo = null;

        window.showToast("দোকান সফলভাবে তৈরি হয়েছে!", "success");
    } catch (e) {
        console.error(e);
        window.showToast("সমস্যা: " + e.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// দোকান ডাটাবেস লিসেনার
onValue(ref(db, 'market_shops'), (snap) => {
    window.globalShops = snap.exists() ? Object.entries(snap.val()).map(([id, item]) => ({ id, ...item })).reverse() : [];
    initFavoritesListener();
    renderShopsList();
});

// সকল পণ্য মার্কেটপ্লেসে রেন্ডার করা
window.renderMarketProducts = () => {
    const query = (document.getElementById('market-search-input')?.value || '').toLowerCase();
    const container = document.getElementById('market-products-list');
    if (!container) return;

    const filtered = window.globalMarketItems.filter(p => 
        p.title.toLowerCase().includes(query) || 
        (p.desc && p.desc.toLowerCase().includes(query)) ||
        (p.seller && p.seller.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p class="col-span-2 text-center text-gray-400 py-10">কোনো পণ্য পাওয়া যায়নি</p>';
        return;
    }

    container.innerHTML = filtered.map(item => {
        const isFav = window.userFavorites?.products?.[item.id];
        const firstImage = (item.images && item.images.length > 0) ? item.images[0] : (item.image || '');
        const imgTag = firstImage ? `<img src="${firstImage}" loading="lazy" class="h-full w-full object-cover">` : `<div class="h-full w-full flex items-center justify-center bg-gray-200"><i class="fa-solid fa-image text-3xl text-gray-400"></i></div>`;

        return `
            <div onclick="openProductDetails('${item.id}')" class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between overflow-hidden cursor-pointer hover:shadow-md transition relative">
                <button onclick="toggleFavorite('products', '${item.id}', event)" class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/80 backdrop-blur shadow flex items-center justify-center ${isFav ? 'text-red-500' : 'text-gray-400'}">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart text-xs"></i>
                </button>
                <div class="relative h-32 w-full overflow-hidden bg-gray-100">
                    ${imgTag}
                </div>
                <div class="p-3">
                    <h3 class="font-bold text-xs text-gray-800 line-clamp-1 leading-tight">${window.escapeHTML(item.title)}</h3>
                    <p class="text-orange-600 font-extrabold text-sm mt-1">৳ ${window.escapeHTML(item.price)}</p>
                    <div class="mt-2 pt-1.5 border-t flex items-center justify-between">
                        <span class="text-[10px] text-gray-500 truncate"><i class="fa-solid fa-store text-orange-500"></i> ${window.escapeHTML(item.seller).split(' ')[0]}</span>
                        <span class="text-[10px] text-blue-600 font-bold">অর্ডার করুন</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

// দোকান লিস্ট রেন্ডার
window.renderShopsList = () => {
    const query = (document.getElementById('shop-search-input')?.value || '').toLowerCase();
    const container = document.getElementById('market-shops-list');
    if (!container) return;

    const filtered = window.globalShops.filter(s => 
        s.name.toLowerCase().includes(query) || 
        s.category.toLowerCase().includes(query) || 
        s.address.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p class="col-span-2 text-center text-gray-400 py-10">কোনো দোকান পাওয়া যায়নি</p>';
        return;
    }

    container.innerHTML = filtered.map(shop => {
        const isFav = window.userFavorites?.shops?.[shop.id];
        const logo = shop.logo ? `<img src="${shop.logo}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center bg-orange-100 text-orange-600 font-bold text-xl"><i class="fa-solid fa-store"></i></div>`;

        return `
            <div onclick="openShopDetails('${shop.id}')" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition relative flex flex-col">
                <button onclick="toggleFavorite('shops', '${shop.id}', event)" class="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm shadow flex items-center justify-center ${isFav ? 'text-red-500' : 'text-gray-400'}">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>
                <div class="h-28 w-full bg-gray-50 flex items-center justify-center relative">
                    ${logo}
                </div>
                <div class="p-3 flex-1 flex flex-col justify-between">
                    <div>
                        <span class="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-bold">${window.escapeHTML(shop.category)}</span>
                        <h3 class="font-bold text-gray-800 text-sm mt-1 truncate">${window.escapeHTML(shop.name)}</h3>
                        <p class="text-xs text-gray-500 truncate"><i class="fa-solid fa-location-dot text-red-500 text-[10px]"></i> ${window.escapeHTML(shop.address)}</p>
                    </div>
                    <div class="mt-2 pt-2 border-t flex justify-between items-center text-xs text-gray-500">
                        <span class="text-[11px]"><i class="fa-solid fa-user"></i> ${window.escapeHTML(shop.ownerName).split(' ')[0]}</span>
                        <span class="text-orange-600 font-bold flex items-center gap-1">ভিজিট <i class="fa-solid fa-chevron-right text-[10px]"></i></span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

// ======================== দোকান ডিটেইলস এবং প্রোডাক্ট ========================

window.openShopDetails = (shopId) => {
    window.currentViewingShopId = shopId;
    const shop = window.globalShops.find(s => s.id === shopId);
    if (!shop) return;

    const isFav = window.userFavorites?.shops?.[shop.id];
    const isOwner = shop.uid === window.currentUser?.uid;

    document.getElementById('shop-detail-name').innerText = shop.name;
    document.getElementById('shop-detail-cat').innerText = shop.category;
    document.getElementById('shop-detail-address').innerText = shop.address;
    document.getElementById('shop-detail-phone').innerText = shop.phone;
    document.getElementById('shop-detail-phone-btn').href = `tel:${shop.phone}`;
    document.getElementById('shop-detail-desc').innerText = shop.desc || 'কোনো বিবরণ নেই';

    const logoContainer = document.getElementById('shop-detail-logo');
    logoContainer.innerHTML = shop.logo ? `<img src="${shop.logo}" class="w-full h-full object-cover rounded-xl">` : `<div class="w-full h-full rounded-xl bg-orange-100 flex items-center justify-center text-2xl text-orange-600 font-bold"><i class="fa-solid fa-store"></i></div>`;

    const favBtn = document.getElementById('shop-detail-fav-btn');
    favBtn.innerHTML = `<i class="${isFav ? 'fa-solid text-red-500' : 'fa-regular text-gray-500'} fa-heart text-xl"></i>`;
    favBtn.onclick = (e) => toggleFavorite('shops', shop.id, e);

    // ওনার বাটন
    const addProductBtn = document.getElementById('shop-add-product-btn');
    if (isOwner) {
        addProductBtn.classList.remove('hidden');
    } else {
        addProductBtn.classList.add('hidden');
    }

    renderShopProducts(shopId);

    document.getElementById('shop-details-modal').classList.remove('hidden-custom');
};

window.closeShopDetails = () => {
    window.currentViewingShopId = null;
    document.getElementById('shop-details-modal').classList.add('hidden-custom');
};

// নির্দিষ্ট দোকানের পণ্য লোড করা
function renderShopProducts(shopId) {
    const container = document.getElementById('shop-products-list');
    if (!container) return;

    const products = window.globalMarketItems.filter(p => p.shopId === shopId);

    if (products.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center py-10 text-gray-400">
            <i class="fa-solid fa-box-open text-4xl mb-2 text-gray-300"></i>
            <p>এই দোকানে এখনো কোনো পণ্য নেই</p>
        </div>`;
        return;
    }

    container.innerHTML = products.map(item => {
        const isFav = window.userFavorites?.products?.[item.id];
        const firstImage = (item.images && item.images.length > 0) ? item.images[0] : (item.image || '');
        const imgTag = firstImage ? `<img src="${firstImage}" loading="lazy" class="h-full w-full object-cover">` : `<div class="h-full w-full flex items-center justify-center bg-gray-200"><i class="fa-solid fa-image text-2xl text-gray-400"></i></div>`;

        return `
            <div onclick="openProductDetails('${item.id}')" class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between overflow-hidden cursor-pointer hover:shadow-md transition relative">
                <button onclick="toggleFavorite('products', '${item.id}', event)" class="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/80 shadow flex items-center justify-center ${isFav ? 'text-red-500' : 'text-gray-400'}">
                    <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart text-xs"></i>
                </button>
                <div class="relative h-28 w-full overflow-hidden bg-gray-100">
                    ${imgTag}
                </div>
                <div class="p-2.5">
                    <h3 class="font-bold text-xs text-gray-800 line-clamp-1 leading-tight">${window.escapeHTML(item.title)}</h3>
                    <p class="text-orange-600 font-extrabold text-sm mt-1">৳ ${window.escapeHTML(item.price)}</p>
                </div>
            </div>
        `;
    }).join('');
}

// ======================== পণ্য আপলোড ও লিস্ট ========================

window.previewSellImages = (input) => {
    const previewContainer = document.getElementById('sell-image-preview');
    previewContainer.innerHTML = '';
    
    if (input.files && input.files.length > 0) {
        window.selectedSellImages = Array.from(input.files).slice(0, 4);
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

window.submitProduct = async () => {
    if (!window.currentViewingShopId) return window.showToast("দোকান পাওয়া যায়নি", "error");

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
        const uploadPromises = window.selectedSellImages.map(file => window.uploadMediaToCloudinary(file));
        const results = await Promise.all(uploadPromises);
        const imgUrls = results.map(res => res.url);
        
        await push(ref(db, 'market_items'), {
            shopId: window.currentViewingShopId,
            uid: window.currentUser.uid,
            seller: window.userDetails.name,
            sellerPic: window.userDetails.profile_pic || '',
            title,
            price,
            desc,
            images: imgUrls,
            time: Date.now()
        });
        
        window.toggleSellModal(false);
        document.getElementById('sell-title').value = "";
        document.getElementById('sell-price').value = "";
        document.getElementById('sell-desc').value = "";
        document.getElementById('sell-image-file').value = "";
        document.getElementById('sell-image-preview').innerHTML = "";
        window.selectedSellImages = [];
        
        window.showToast("পণ্য সফলভাবে যুক্ত হয়েছে!", "success");
    } catch (e) {
        console.error(e);
        window.showToast("আপলোডে সমস্যা: " + e.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

onValue(ref(db, 'market_items'), (snap) => {
    window.globalMarketItems = snap.exists() ? Object.entries(snap.val()).map(([id, item]) => ({ id, ...item })).reverse() : [];
    if (window.activeMarketTab === 'products') {
        renderMarketProducts();
    }
    if (window.currentViewingShopId) {
        renderShopProducts(window.currentViewingShopId);
    }
});

// ======================== অর্ডার ফাংশনালিটি ========================

window.openOrderModal = (productId) => {
    const product = window.globalMarketItems.find(p => p.id === productId);
    if (!product) return;
    
    window.currentOrderingProduct = product;
    document.getElementById('order-prod-title').innerText = product.title;
    document.getElementById('order-prod-price').innerText = `৳ ${product.price}`;
    
    const img = (product.images && product.images[0]) ? product.images[0] : (product.image || '');
    document.getElementById('order-prod-img').src = img || 'https://via.placeholder.com/150';
    
    if (window.userDetails) {
        document.getElementById('order-buyer-name').value = window.userDetails.name || '';
        document.getElementById('order-buyer-phone').value = window.userDetails.phone || '';
    }

    toggleOrderModal(true);
};

window.toggleOrderModal = (show) => {
    document.getElementById('order-modal').classList.toggle('hidden-custom', !show);
};

window.submitOrder = async () => {
    if (!window.currentOrderingProduct) return;

    const buyerName = document.getElementById('order-buyer-name').value.trim();
    const buyerPhone = document.getElementById('order-buyer-phone').value.trim();
    const buyerAddress = document.getElementById('order-buyer-address').value.trim();
    const quantity = document.getElementById('order-quantity').value || 1;

    if (!buyerName || !buyerPhone || !buyerAddress) {
        return window.showToast("নাম, ফোন এবং ডেলিভারি ঠিকানা দিন", "error");
    }

    const btn = document.getElementById('btn-submit-order');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> অর্ডার প্রসেস হচ্ছে...';

    try {
        await push(ref(db, 'market_orders'), {
            productId: window.currentOrderingProduct.id,
            productTitle: window.currentOrderingProduct.title,
            productPrice: window.currentOrderingProduct.price,
            productImage: (window.currentOrderingProduct.images && window.currentOrderingProduct.images[0]) || '',
            sellerUid: window.currentOrderingProduct.uid,
            sellerName: window.currentOrderingProduct.seller,
            buyerUid: window.currentUser.uid,
            buyerName,
            buyerPhone,
            buyerAddress,
            quantity,
            status: 'pending',
            time: Date.now()
        });

        toggleOrderModal(false);
        closeProductDetails();
        window.showToast("আপনার অর্ডার সফলভাবে প্লেস হয়েছে!", "success");
    } catch (e) {
        console.error(e);
        window.showToast("অর্ডার দিতে সমস্যা হয়েছে: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> অর্ডার প্লেস করুন';
    }
};

// ======================== প্রোডাক্ট ডিটেইলস ========================

window.openProductDetails = (id) => {
    const product = window.globalMarketItems.find(p => p.id === id);
    if (!product) return;
    
    const isFav = window.userFavorites?.products?.[product.id];
    const contentDiv = document.getElementById('product-details-content');
    const imagesArray = (product.images && product.images.length > 0) ? product.images : (product.image ? [product.image] : []);
    
    let imagesHtml = imagesArray.length > 0 
        ? `<div class="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide bg-black h-64 sm:h-72 w-full">${imagesArray.map(img => `<img src="${img}" loading="lazy" onclick="window.openImageViewer('${img}')" class="w-full h-full object-contain shrink-0 snap-center">`).join('')}</div>` 
        : `<div class="h-48 w-full bg-gray-200 flex items-center justify-center"><i class="fa-solid fa-image text-5xl text-gray-400"></i></div>`;
    
    let actionButtons = product.uid === window.currentUser?.uid
        ? `<button onclick="deleteProduct('${id}', true)" class="w-full bg-red-100 text-red-600 font-bold py-3 rounded-xl hover:bg-red-200 transition flex justify-center items-center gap-2"><i class="fa-solid fa-trash"></i> পণ্যটি মুছুন</button>`
        : `<div class="space-y-2 w-full">
            <button onclick="openOrderModal('${product.id}')" class="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition shadow-md flex justify-center items-center gap-2"><i class="fa-solid fa-truck-fast"></i> সরাসরি অর্ডার করুন</button>
            <div class="flex gap-2 w-full">
                <button onclick="startChat('${product.uid}', '${window.escapeHTML(product.seller)}'); closeProductDetails();" class="flex-1 bg-blue-50 text-blue-600 font-bold py-2.5 rounded-xl border border-blue-200 hover:bg-blue-100 transition flex justify-center items-center gap-1.5 text-xs"><i class="fa-brands fa-facebook-messenger"></i> চ্যাট করুন</button>
                <a href="tel:${product.desc.match(/\d{11}/) ? product.desc.match(/\d{11}/)[0] : ''}" onclick="if(!this.href.includes('tel:0')) { alert('যোগাযোগের নম্বর দেওয়া নেই'); return false; }" class="flex-1 bg-green-50 text-green-600 font-bold py-2.5 rounded-xl border border-green-200 hover:bg-green-100 transition flex justify-center items-center gap-1.5 text-xs"><i class="fa-solid fa-phone"></i> কল দিন</a>
            </div>
        </div>`;

    contentDiv.innerHTML = `
        <div class="relative">
            ${imagesHtml}
            <button onclick="toggleFavorite('products', '${product.id}', event); openProductDetails('${product.id}');" class="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/80 backdrop-blur shadow-md flex items-center justify-center ${isFav ? 'text-red-500' : 'text-gray-600'}">
                <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart text-lg"></i>
            </button>
        </div>
        ${imagesArray.length > 1 ? `<p class="text-center text-[10px] text-gray-400 bg-gray-100 py-1"><i class="fa-solid fa-arrows-left-right"></i> স্লাইড করে বাকি ছবি দেখুন</p>` : ''}
        <div class="p-5">
            <h2 class="text-xl font-bold text-gray-900 leading-tight mb-2">${window.escapeHTML(product.title)}</h2>
            <p class="text-2xl font-extrabold text-orange-600 mb-4">৳ ${window.escapeHTML(product.price)}</p>
            
            <h4 class="font-bold text-sm text-gray-700 border-b pb-1 mb-2">বিবরণ</h4>
            <p class="text-sm text-gray-600 whitespace-pre-line mb-6">${window.escapeHTML(product.desc)}</p>
            
            <div class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t sm:relative sm:border-t-0 sm:p-0">
                ${actionButtons}
            </div>
        </div>
    `;
    
    const modal = document.getElementById('product-details-modal');
    modal.classList.remove('hidden-custom');
    setTimeout(() => modal.classList.remove('translate-y-full'), 10);
};

window.closeProductDetails = () => {
    const modal = document.getElementById('product-details-modal');
    modal.classList.add('translate-y-full');
    setTimeout(() => modal.classList.add('hidden-custom'), 300);
};

window.deleteProduct = async (id, closeDetails = false) => {
    if (confirm("আপনি কি নিশ্চিত যে পণ্যটি মুছে ফেলতে চান?")) {
        try {
            await remove(ref(db, 'market_items/' + id));
            window.showToast("পণ্য মুছে ফেলা হয়েছে!");
            if (closeDetails) closeProductDetails();
        } catch (e) {
            window.showToast("সমস্যা: " + e.message, 'error');
        }
    }
};

// ======================== ফেভারিট পেজ ভিউ ========================
window.openFavoritesModal = () => {
    renderFavoritesList();
    document.getElementById('favorites-modal').classList.remove('hidden-custom');
};

window.closeFavoritesModal = () => {
    document.getElementById('favorites-modal').classList.add('hidden-custom');
};

window.renderFavoritesList = () => {
    const favShopIds = Object.keys(window.userFavorites?.shops || {});
    const favProdIds = Object.keys(window.userFavorites?.products || {});

    const favShops = window.globalShops.filter(s => favShopIds.includes(s.id));
    const favProducts = window.globalMarketItems.filter(p => favProdIds.includes(p.id));

    const shopsContainer = document.getElementById('fav-shops-list');
    const prodsContainer = document.getElementById('fav-products-list');

    shopsContainer.innerHTML = favShops.length > 0 ? favShops.map(s => `
        <div onclick="closeFavoritesModal(); openShopDetails('${s.id}')" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-orange-100 overflow-hidden flex items-center justify-center font-bold text-orange-600">
                    ${s.logo ? `<img src="${s.logo}" class="w-full h-full object-cover">` : '<i class="fa-solid fa-store"></i>'}
                </div>
                <div>
                    <h4 class="font-bold text-sm text-gray-800">${window.escapeHTML(s.name)}</h4>
                    <p class="text-xs text-gray-500">${window.escapeHTML(s.address)}</p>
                </div>
            </div>
            <button onclick="toggleFavorite('shops', '${s.id}', event); renderFavoritesList();" class="text-red-500 p-2"><i class="fa-solid fa-heart"></i></button>
        </div>
    `).join('') : '<p class="text-xs text-gray-400 text-center py-4">কোনো পছন্দের দোকান নেই</p>';

    prodsContainer.innerHTML = favProducts.length > 0 ? favProducts.map(p => `
        <div onclick="closeFavoritesModal(); openProductDetails('${p.id}')" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
                    ${(p.images && p.images[0]) ? `<img src="${p.images[0]}" class="w-full h-full object-cover">` : '<i class="fa-solid fa-image text-gray-400"></i>'}
                </div>
                <div>
                    <h4 class="font-bold text-sm text-gray-800">${window.escapeHTML(p.title)}</h4>
                    <p class="text-xs font-bold text-orange-600">৳ ${window.escapeHTML(p.price)}</p>
                </div>
            </div>
            <button onclick="toggleFavorite('products', '${p.id}', event); renderFavoritesList();" class="text-red-500 p-2"><i class="fa-solid fa-heart"></i></button>
        </div>
    `).join('') : '<p class="text-xs text-gray-400 text-center py-4">কোনো পছন্দের পণ্য নেই</p>';
};

// মডাল কন্ট্রোল
window.toggleCreateShopModal = (show) => {
    document.getElementById('create-shop-modal').classList.toggle('hidden-custom', !show);
};
window.toggleSellModal = (show) => {
    document.getElementById('sell-modal').classList.toggle('hidden-custom', !show);
};