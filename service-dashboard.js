/* Service dashboard: category cards and dynamic service directory. */
import { ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const defaultServiceCategories = {
    directory: { title: "ডিরেক্টরি", icon: "fa-address-book", color: "text-blue-600", bg: "bg-blue-50" },
    blood: { title: "রক্তদান", icon: "fa-droplet", color: "text-red-600", bg: "bg-red-50" },
    emergency: { title: "জরুরী এলার্ট", icon: "fa-triangle-exclamation", color: "text-red-600", bg: "bg-red-50" },
    history_tourism: { title: "পর্যটন", icon: "fa-landmark", color: "text-purple-600", bg: "bg-purple-50" },
    transport: { title: "পরিবহন", icon: "fa-bus", color: "text-teal-600", bg: "bg-teal-50" },
    education: { title: "শিক্ষা", icon: "fa-graduation-cap", color: "text-yellow-600", bg: "bg-yellow-50" },
    complaints: { title: "অভিযোগ", icon: "fa-box-archive", color: "text-red-600", bg: "bg-red-50" },
    market: { title: "হাট", icon: "fa-store", color: "text-orange-600", bg: "bg-orange-50" },
    birth_reg: { title: "জন্ম নিবন্ধন", icon: "fa-address-card", color: "text-blue-600", bg: "bg-blue-50" },
    tin_cert: { title: "টিন সার্টিফিকেট", icon: "fa-file-invoice-dollar", color: "text-indigo-600", bg: "bg-indigo-50" },
    agriculture: { title: "কৃষি", icon: "fa-leaf", color: "text-green-600", bg: "bg-green-50" },
    result: { title: "বোর্ড রেজাল্ট", icon: "fa-award", color: "text-pink-600", bg: "bg-pink-50" }
};

const getDatabase = () => window.db;

window.loadServiceCategories = async function loadServiceCategories() {
    const grid = document.getElementById('services-grid');
    if (!grid || !getDatabase()) return;
    try {
        const snap = await get(ref(getDatabase(), 'services/categories'));
        const categories = { ...defaultServiceCategories, ...(snap.val() || {}) };
        grid.innerHTML = Object.entries(categories).map(([key, cat]) => {
            let onclick;
            if (['directory', 'blood', 'complaints', 'market', 'emergency', 'transport', 'education'].includes(key)) {
                onclick = `window.switchPage('${key}')`;
            } else if (key === 'history_tourism') {
                onclick = "window.switchPage('tourism')";
            } else if (key === 'birth_reg') {
                onclick = `window.openInAppWebview('${cat.title}', 'https://bdris.gov.bd/')`;
            } else if (key === 'tin_cert') {
                onclick = `window.openInAppWebview('${cat.title}', 'https://secure.incometax.gov.bd/TINHome')`;
            } else if (key === 'result') {
                onclick = `window.openInAppWebview('${cat.title}', 'https://eboardresults.com/v2/home')`;
            } else if (key === 'agriculture') {
                onclick = `window.openDirectoryCategory('agriculture', '${cat.title}')`;
            } else {
                onclick = `window.openDynamicCategory('${key}', '${cat.title}')`;
            }
            return `<div onclick="${onclick}" class="cursor-pointer group transform active:scale-95 transition bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center justify-center shadow-sm hover:shadow-md aspect-[4/3]"><div class="w-14 h-14 ${cat.bg} ${cat.color} rounded-full flex items-center justify-center mb-2"><i class="fa-solid ${cat.icon} text-2xl"></i></div><p class="text-base font-bold text-gray-700 text-center">${cat.title}</p></div>`;
        }).join('');
    } catch (error) {
        console.error('Service categories failed to load:', error);
        grid.innerHTML = '<p class="col-span-2 text-center text-red-400 py-4">সেবা লোড করা যায়নি</p>';
    }
};

window.openDynamicCategory = async function openDynamicCategory(catId, title) {
    window.switchPage('dynamic-content');
    const titleElement = document.getElementById('dynamic-content-title');
    const container = document.getElementById('dynamic-items-container');
    if (!container) return;
    if (titleElement) titleElement.innerText = title;
    container.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    try {
        const snap = await get(ref(getDatabase(), `services/data/${catId}`));
        const items = snap.val() || {};
        container.innerHTML = Object.keys(items).length > 0 ? Object.values(items).map(item => {
            const imgHtml = item.image ? `<div class="h-32 bg-gray-200 rounded-t-xl overflow-hidden"><img alt="" src="${item.image}" loading="lazy" class="w-full h-full object-cover"></div>` : '';
            const actionBtn = item.phone ? `<a href="tel:${item.phone}" class="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center shadow hover:bg-green-600 transition"><i class="fa-solid fa-phone"></i></a>` : '';
            return `<div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-3">${imgHtml}<div class="p-4 flex justify-between items-center"><div><h3 class="font-bold text-gray-800 text-lg">${window.escapeHTML(item.title)}</h3><p class="text-sm text-gray-500 mt-1">${window.escapeHTML(item.details || '')}</p></div>${actionBtn}</div></div>`;
        }).join('') : '<div class="text-center py-10"><i class="fa-regular fa-folder-open text-4xl text-gray-300 mb-3"></i><p class="text-gray-400">তথ্য যুক্ত করা হয়নি</p></div>';
    } catch (error) {
        console.error('Dynamic service data failed to load:', error);
        container.innerHTML = '<p class="text-center text-red-400 py-10">সেবার তথ্য লোড করা যায়নি</p>';
    }
};
