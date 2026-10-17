/* Global search: fast multi-source search with Facebook-style live results. */
import {
    ref, get, query, orderByChild, startAt, endAt, limitToFirst, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const getDb = () => window.db;
let searchSequence = 0;
let searchTimer;
let lastTrendingLoaded = false;

const normalize = (value) => String(value || '').toLocaleLowerCase('bn-BD').trim();
const escape = (value) => window.escapeHTML ? window.escapeHTML(String(value || '')) : String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const matches = (item, term, fields) => fields.some(field => normalize(item?.[field]).includes(term));
const closeSearch = () => window.toggleGlobalSearch(false);

function resultHeader(icon, color, title, count) {
    return `<div class="flex items-center justify-between mb-2"><h3 class="font-bold text-sm text-gray-800 flex items-center gap-2"><span class="w-7 h-7 rounded-lg ${color} flex items-center justify-center"><i class="fa-solid ${icon} text-xs"></i></span>${title}</h3><span class="text-[10px] text-gray-400">${count}টি</span></div>`;
}

function userCard(user) {
    const avatar = user.profile_pic
        ? `<img src="${escape(user.profile_pic)}" alt="" class="w-10 h-10 rounded-full object-cover">`
        : `<div class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">${escape((user.name || 'U').charAt(0))}</div>`;
    return `<button type="button" onclick="window.openUserProfile('${escape(user.uid)}'); window.toggleGlobalSearch(false)" class="w-full text-left bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 hover:border-blue-200 transition"><span>${avatar}</span><span class="min-w-0"><strong class="block text-sm text-gray-800 truncate">${escape(user.name || 'অজানা')}</strong><small class="block text-xs text-gray-400 truncate">${escape(user.profession || user.village || 'সদস্য')}</small></span><i class="fa-solid fa-chevron-right ml-auto text-xs text-gray-300"></i></button>`;
}

function postCard(post) {
    const id = post.id || post.uid;
    const text = post.content || post.text || post.description || 'ছবি/ভিডিও পোস্ট';
    const media = post.image || (Array.isArray(post.images) ? post.images[0] : '');
    return `<button type="button" onclick="window.openSinglePostModal('${escape(id)}'); window.toggleGlobalSearch(false)" class="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:border-green-200 transition">${media ? `<img src="${escape(media)}" alt="" loading="lazy" class="w-full h-28 object-cover">` : ''}<div class="p-3"><p class="text-sm text-gray-700 line-clamp-2">${escape(text)}</p><small class="text-[10px] text-gray-400 mt-1 block">${escape(post.authorName || post.name || 'পোস্ট')}</small></div></button>`;
}

function marketCard(item) {
    return `<button type="button" onclick="window.openProductDetails && window.openProductDetails('${escape(item.id)}'); window.toggleGlobalSearch(false)" class="w-full text-left bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 hover:border-orange-200 transition"><div class="w-10 h-10 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center"><i class="fa-solid fa-store"></i></div><span class="min-w-0"><strong class="block text-sm text-gray-800 truncate">${escape(item.title || item.name || 'পণ্য')}</strong><small class="text-xs text-orange-600">${item.price ? `৳ ${escape(item.price)}` : 'বিস্তারিত দেখুন'}</small></span></button>`;
}

function directoryCard(item) {
    return `<div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><i class="fa-solid fa-address-book"></i></div><span class="min-w-0 flex-1"><strong class="block text-sm text-gray-800 truncate">${escape(item.name || item.title)}</strong><small class="text-xs text-gray-400 truncate block">${escape(item.category || item.address || 'ডিরেক্টরি')}</small></span>${item.phone ? `<a href="tel:${escape(item.phone)}" class="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center"><i class="fa-solid fa-phone text-xs"></i></a>` : ''}</div>`;
}

function serviceCard(item) {
    return `<button type="button" onclick="window.openDynamicCategory('${escape(item.id)}','${escape(item.title)}'); window.toggleGlobalSearch(false)" class="w-full text-left bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 hover:border-green-200 transition"><div class="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><i class="fa-solid fa-layer-group"></i></div><span class="min-w-0"><strong class="block text-sm text-gray-800 truncate">${escape(item.title)}</strong><small class="text-xs text-gray-400">সেবা ও তথ্য</small></span></button>`;
}

async function collectResults(rawQuery, sequence) {
    const term = normalize(rawQuery);
    if (!term || !getDb()) return { users: [], posts: [], market: [], directory: [], services: [] };
    const database = getDb();
    const [userSnap, postSnap, marketSnap, directorySnap, serviceSnap, categorySnap] = await Promise.all([
        get(query(ref(database, 'users'), orderByChild('name'), startAt(rawQuery.trim()), endAt(rawQuery.trim() + '\uf8ff'), limitToFirst(12))),
        get(query(ref(database, 'posts'), orderByKey(), limitToLast(250))),
        get(ref(database, 'market_items')),
        get(ref(database, 'directory')),
        get(ref(database, 'services/data')),
        get(ref(database, 'services/categories'))
    ]);
    if (sequence !== searchSequence) return null;
    const users = [];
    userSnap.forEach(child => { if (child.key !== window.currentUser?.uid) users.push({ uid: child.key, ...child.val() }); });
    const posts = [];
    postSnap.forEach(child => { const value = { id: child.key, ...child.val() }; if (matches(value, term, ['content', 'text', 'description', 'authorName', 'name', 'location'])) posts.push(value); });
    const market = marketSnap.exists() ? Object.entries(marketSnap.val()).map(([id, value]) => ({ id, ...value })).filter(item => matches(item, term, ['title', 'description', 'shopName', 'category'])) : [];
    const directory = [];
    if (directorySnap.exists()) Object.entries(directorySnap.val()).forEach(([category, entries]) => Object.values(entries || {}).forEach(item => { if (matches(item, term, ['name', 'title', 'address', 'phone', 'profession'])) directory.push({ ...item, category }); }));
    const services = [];
    if (categorySnap.exists()) Object.entries(categorySnap.val()).forEach(([id, item]) => { if (matches(item, term, ['title'])) services.push({ id, ...item }); });
    if (serviceSnap.exists()) Object.entries(serviceSnap.val()).forEach(([id, entries]) => Object.values(entries || {}).forEach(item => { if (matches(item, term, ['title', 'details', 'phone'])) services.push({ id, ...item }); }));
    return { users: users.filter(user => matches(user, term, ['name', 'profession', 'village', 'union'])), posts: posts.slice(0, 8), market: market.slice(0, 8), directory: directory.slice(0, 8), services: services.slice(0, 8) };
}

function renderResults(results, term) {
    const container = document.getElementById('search-results-list');
    if (!container || !results) return;
    const sections = [];
    if (results.users.length) sections.push(`<section>${resultHeader('fa-users', 'bg-blue-50 text-blue-600', 'মানুষ', results.users.length)}<div class="space-y-2">${results.users.map(userCard).join('')}</div></section>`);
    if (results.posts.length) sections.push(`<section>${resultHeader('fa-newspaper', 'bg-green-50 text-green-600', 'পোস্ট', results.posts.length)}<div class="grid grid-cols-2 gap-3">${results.posts.map(postCard).join('')}</div></section>`);
    if (results.market.length) sections.push(`<section>${resultHeader('fa-store', 'bg-orange-50 text-orange-600', 'হাট / পণ্য', results.market.length)}<div class="space-y-2">${results.market.map(marketCard).join('')}</div></section>`);
    if (results.directory.length) sections.push(`<section>${resultHeader('fa-address-book', 'bg-purple-50 text-purple-600', 'ডিরেক্টরি', results.directory.length)}<div class="space-y-2">${results.directory.map(directoryCard).join('')}</div></section>`);
    if (results.services.length) sections.push(`<section>${resultHeader('fa-layer-group', 'bg-teal-50 text-teal-600', 'সেবা', results.services.length)}<div class="space-y-2">${results.services.map(serviceCard).join('')}</div></section>`);
    container.innerHTML = sections.length ? `<div class="flex items-center justify-between mb-4"><p class="text-xs text-gray-500">“<strong>${escape(term)}</strong>” এর ফলাফল</p><span class="text-[10px] text-gray-400">Live search</span></div>${sections.join('')}` : '<div class="text-center py-16"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><i class="fa-solid fa-magnifying-glass text-2xl"></i></div><h3 class="font-bold text-gray-700">কিছু পাওয়া যায়নি</h3><p class="text-xs text-gray-400 mt-1">অন্য কোনো নাম বা keyword দিয়ে চেষ্টা করুন</p></div>';
}

window.toggleGlobalSearch = function(open) {
    const modal = document.getElementById('search-modal');
    if (!modal) return;
    if (open) {
        modal.classList.remove('hidden-custom');
        setTimeout(() => modal.classList.add('open'), 10);
        const input = document.getElementById('global-search-input');
        if (input) { input.value = ''; input.focus(); }
        document.getElementById('search-empty-state')?.classList.remove('hidden-custom');
        document.getElementById('search-results-list')?.classList.add('hidden-custom');
        document.getElementById('search-loading-state')?.classList.add('hidden-custom');
        window.loadTrendingPhotos();
    } else {
        modal.classList.remove('open');
        searchSequence++;
        setTimeout(() => modal.classList.add('hidden-custom'), 300);
    }
};

window.clearGlobalSearch = () => {
    const input = document.getElementById('global-search-input');
    if (input) input.value = '';
    window.debouncedGlobalSearch('');
    input?.focus();
};

window.loadTrendingPhotos = async function() {
    const grid = document.getElementById('trending-explore-grid');
    if (!grid || lastTrendingLoaded) return;
    try {
        const snap = await get(query(ref(getDb(), 'posts'), orderByKey(), limitToLast(60)));
        const posts = [];
        snap.forEach(child => { const p = child.val(); if (p.image || (p.images && p.images.length)) posts.push({ id: child.key, ...p }); });
        posts.sort((a, b) => ((b.likeCount || 0) + (b.comments ? Object.keys(b.comments).length : 0)) - ((a.likeCount || 0) + (a.comments ? Object.keys(a.comments).length : 0)));
        grid.innerHTML = posts.slice(0, 18).map(p => `<button type="button" onclick="window.openSinglePostModal('${escape(p.id)}'); window.toggleGlobalSearch(false)" class="relative aspect-square cursor-pointer bg-gray-100 overflow-hidden"><img src="${escape(p.images?.[0] || p.image)}" alt="" loading="lazy" class="w-full h-full object-cover"><span class="absolute bottom-1 left-1 text-white text-[10px] drop-shadow"><i class="fa-solid fa-heart"></i> ${p.likeCount || 0}</span></button>`).join('') || '<p class="col-span-3 text-center text-gray-400 py-10">এখনো কোনো ট্রেন্ডিং পোস্ট নেই</p>';
        const status = document.getElementById('search-trending-status'); if (status) status.innerText = `${posts.length}টি পোস্ট`;
        lastTrendingLoaded = true;
    } catch (error) { grid.innerHTML = '<p class="col-span-3 text-center text-gray-400 py-10">ট্রেন্ডিং লোড করা যায়নি</p>'; }
};

window.debouncedGlobalSearch = (value) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        const term = String(value || '').trim();
        const empty = document.getElementById('search-empty-state');
        const results = document.getElementById('search-results-list');
        const loading = document.getElementById('search-loading-state');
        const clear = document.getElementById('global-search-clear');
        if (clear) clear.classList.toggle('hidden-custom', !term);
        if (!term) { empty?.classList.remove('hidden-custom'); results?.classList.add('hidden-custom'); loading?.classList.add('hidden-custom'); return; }
        empty?.classList.add('hidden-custom'); results?.classList.add('hidden-custom'); loading?.classList.remove('hidden-custom');
        const sequence = ++searchSequence;
        try { const found = await collectResults(term, sequence); if (sequence !== searchSequence) return; loading?.classList.add('hidden-custom'); results?.classList.remove('hidden-custom'); renderResults(found, term); } catch (error) { loading?.classList.add('hidden-custom'); results?.classList.remove('hidden-custom'); results.innerHTML = '<p class="text-center text-red-400 py-12">Search সাময়িকভাবে কাজ করছে না। আবার চেষ্টা করুন।</p>'; console.error('Global search failed:', error); }
    }, 220);
};
