import { get, ref } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- TRANSPORT SERVICES LOGIC ---

// ১. ব্যানার লোড করা
window.loadTransportBanners = () => {
    const container = document.getElementById('transport-banner-container');
    get(ref(window.db, 'admin_settings/transport_banners')).then((snap) => {
        const banners = snap.val();
        if (banners && Object.keys(banners).length > 0) {
            container.innerHTML = Object.values(banners).map(imgUrl =>
                `<img src="${imgUrl}" loading="lazy" class="min-w-full h-full object-cover shrink-0 snap-center">`
            ).join('');
        } else {
            container.innerHTML = `<div class="min-w-full h-full bg-teal-100 flex items-center justify-center shrink-0 snap-center"><span class="text-teal-600 font-bold"><i class="fa-solid fa-bus"></i> স্মার্ট পরিবহন সেবা</span></div>`;
        }
    }).catch(e => console.error(e));
};

// ২. রেন্ট-এ-কার লোড করা (শুধুমাত্র নিজের গ্রামের)
window.loadRentACar = () => {
    const container = document.getElementById('rent-a-car-list');
    const userVillage = window.userDetails.village;

    document.getElementById('user-village-name').innerText = userVillage || "আপনার গ্রামের";

    if (!userVillage || userVillage === "Unknown") {
        container.innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-triangle-exclamation text-4xl text-yellow-400 mb-3"></i><p class="text-gray-500 text-sm">প্রোফাইল থেকে আগে আপনার গ্রাম সেট করুন।</p></div>`;
        return;
    }

    container.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div></div>';

    get(ref(window.db, 'transport/rent_a_car')).then((snap) => {
        const data = snap.val() || {};

        const filteredCars = Object.values(data).filter(car => car.village === userVillage);

        if (filteredCars.length > 0) {
            container.innerHTML = filteredCars.map(car => `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex gap-3 items-center">
                        <div class="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center text-teal-600 text-xl shrink-0"><i class="fa-solid fa-car-side"></i></div>
                        <div>
                            <h4 class="font-bold text-gray-800 text-base">${window.escapeHTML(car.driverName)}</h4>
                            <p class="text-xs text-gray-500 font-medium">${window.escapeHTML(car.carModel)}</p>
                        </div>
                    </div>
                </div>
                <p class="text-[11px] text-gray-500 mb-3 bg-gray-50 p-2 rounded-lg"><i class="fa-solid fa-circle-info mr-1"></i> ${window.escapeHTML(car.details || 'কোনো বিস্তারিত তথ্য নেই')}</p>
                <div class="flex gap-2 mt-auto">
                    <a href="tel:${car.phone}" class="flex-1 bg-teal-600 text-white py-2 rounded-lg font-bold text-sm shadow hover:bg-teal-700 flex items-center justify-center gap-2 transition active:scale-95"><i class="fa-solid fa-phone"></i> কল করুন</a>
                </div>
            </div>
        `).join('');
        } else {
            container.innerHTML = `<div class="text-center py-10"><i class="fa-regular fa-face-frown text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">আপনার গ্রামে কোনো রেন্ট-এ-কার পাওয়া যায়নি।</p></div>`;
        }
    });
};

// ৩. বাস সার্ভিস লোড করা
window.loadBusServices = () => {
    const container = document.getElementById('bus-service-list');
    container.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';

    get(ref(window.db, 'transport/bus')).then((snap) => {
        const data = snap.val() || {};
        const buses = Object.values(data);

        if (buses.length > 0) {
            container.innerHTML = buses.map(bus => {
                const onlineTicketBtn = bus.website ? `<a href="${bus.website}" target="_blank" class="flex-1 bg-blue-50 text-blue-700 border border-blue-200 py-2 rounded-lg font-bold text-xs hover:bg-blue-100 flex items-center justify-center gap-2 transition active:scale-95"><i class="fa-solid fa-globe"></i> টিকিট বুকিং</a>` : '';

                return `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col mb-3">
                <div class="flex gap-3 items-center mb-3">
                    <div class="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600 text-xl shrink-0"><i class="fa-solid fa-bus-simple"></i></div>
                    <div class="flex-1">
                        <h4 class="font-bold text-gray-800 text-base">${window.escapeHTML(bus.name)}</h4>
                        <p class="text-[11px] text-gray-500"><i class="fa-solid fa-location-dot mr-1"></i> কাউন্টার: ${window.escapeHTML(bus.counterName)}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2 border-t pt-3">
                    <a href="tel:${bus.phone}" class="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold text-xs shadow hover:bg-green-700 flex items-center justify-center gap-2 transition active:scale-95"><i class="fa-solid fa-phone"></i> কল কাউন্টার</a>
                    ${onlineTicketBtn}
                </div>
            </div>
        `
            }).join('');
        } else {
            container.innerHTML = `<div class="text-center py-10"><p class="text-gray-500 text-sm">কোনো বাসের তথ্য পাওয়া যায়নি।</p></div>`;
        }
    });
};