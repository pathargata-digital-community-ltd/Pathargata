import {
    ref,
    onValue,
    get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ডাটাবেস ভেরিয়েবল নিশ্চিত করা
const db = window.db;

// ১. ট্যাব পরিবর্তনের ফাংশন
window.switchEduTab = function(targetTab) {
    const sections = ['institutions', 'tutors', 'notices'];
    sections.forEach(sec => {
        const el = document.getElementById('edu-sec-' + sec);
        if (sec === targetTab) {
            el?.classList.remove('hidden');
        } else {
            el?.classList.add('hidden');
        }
    });

    const buttons = {
        institutions: { id: 'tab-btn-inst', activeClass: 'bg-green-600', activeText: 'text-white' },
        tutors: { id: 'tab-btn-tutors', activeClass: 'bg-blue-600', activeText: 'text-white' },
        notices: { id: 'tab-btn-notices', activeClass: 'bg-orange-600', activeText: 'text-white' }
    };

    Object.entries(buttons).forEach(([key, config]) => {
        const btn = document.getElementById(config.id);
        const icon = btn?.querySelector('i');
        
        if (btn) {
            if (key === targetTab) {
                btn.className = `py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1.5 shadow-md ${config.activeClass} ${config.activeText}`;
                if (icon) icon.className = icon.className.replace(/text-\w+-\d+/g, 'text-white');
            } else {
                btn.className = `py-2.5 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center gap-1.5 bg-white text-gray-600 border border-gray-100 hover:bg-gray-50`;
                if (icon) {
                    if (key === 'institutions') icon.className = "fa-solid fa-school text-lg text-green-600";
                    if (key === 'tutors') icon.className = "fa-solid fa-chalkboard-user text-lg text-blue-500";
                    if (key === 'notices') icon.className = "fa-solid fa-bullhorn text-lg text-orange-500";
                }
            }
        }
    });
};

// ২. রিয়েল-টাইম সার্চ করার ফাংশন
window.filterEduItems = function(query) {
    query = query.toLowerCase().trim();
    const cards = document.querySelectorAll('.edu-card');
    cards.forEach(card => {
        const name = card.getAttribute('data-name')?.toLowerCase() || "";
        if (name.includes(query)) {
            card.style.setProperty('display', 'flex', 'important');
        } else {
            card.style.setProperty('display', 'none', 'important');
        }
    });
};

// ৩. ডাটা লোড করার মাস্টার ফাংশন
export function loadEducationContent() {
    loadInstitutions();
    loadTutors();
    loadNotices();
}

// গ্লোবাল উইন্ডো অবজেক্টে বাইন্ড করা (যাতে index.html এটি সরাসরি খুঁজে পায়)
window.loadEducationContent = loadEducationContent;

// ৪. ডাটাবেস থেকে শিক্ষা প্রতিষ্ঠান লোড করা
function loadInstitutions() {
    const target = document.getElementById('institutions-list-target');
    if (!target) return;

    onValue(ref(db, 'services/education/institutions'), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            target.innerHTML = '<p class="text-center text-gray-400 py-6 text-xs">কোনো প্রতিষ্ঠান পাওয়া যায়নি</p>';
            return;
        }

        target.innerHTML = Object.values(data).map(item => `
            <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center edu-card animate-fade" data-name="${window.escapeHTML(item.name || '')}">
                <div class="flex items-start gap-3 min-w-0">
                    <div class="w-11 h-11 bg-green-50 text-green-600 rounded-xl flex items-center justify-center text-lg shrink-0">
                        <i class="fa-solid fa-school"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(item.name || '')}</h3>
                        <p class="text-xs text-gray-500 mt-0.5 truncate"><i class="fa-solid fa-user-tie text-[10px] mr-1"></i>প্রধান: ${window.escapeHTML(item.head || 'উল্লেখ নেই')}</p>
                        <p class="text-[11px] text-gray-400 mt-1 truncate"><i class="fa-solid fa-location-dot text-[10px] mr-1"></i>${window.escapeHTML(item.address || 'পাথরঘাটা')}</p>
                    </div>
                </div>
                ${item.phone ? `
                <a href="tel:${item.phone}" class="w-9 h-9 bg-green-500 text-white rounded-full flex items-center justify-center shadow hover:bg-green-600 transition shrink-0 ml-2">
                    <i class="fa-solid fa-phone text-sm"></i>
                </a>` : ''}
            </div>
        `).join('');
    });
}

// ৫. ডাটাবেস থেকে গৃহশিক্ষক লোড করা
function loadTutors() {
    const target = document.getElementById('tutors-list-target');
    if (!target) return;

    onValue(ref(db, 'services/education/tutors'), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            target.innerHTML = '<p class="text-center text-gray-400 py-6 text-xs">নিবন্ধিত কোনো শিক্ষক নেই</p>';
            return;
        }

        target.innerHTML = Object.values(data).map(item => `
            <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center edu-card animate-fade" data-name="${window.escapeHTML(item.name || '')} ${window.escapeHTML(item.subject || '')}">
                <div class="flex items-start gap-3 min-w-0">
                    <div class="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg shrink-0">
                        <i class="fa-solid fa-chalkboard-user"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(item.name || '')}</h3>
                        <p class="text-xs text-blue-600 mt-0.5 font-medium truncate">শ্রেণি: ${window.escapeHTML(item.classes || 'সকল শ্রেণি')}</p>
                        <p class="text-[11px] text-gray-500 mt-1 truncate"><i class="fa-solid fa-graduation-cap text-[10px] mr-1"></i>${window.escapeHTML(item.qualification || 'শিক্ষাগত যোগ্যতা নেই')}</p>
                    </div>
                </div>
                ${item.phone ? `
                <a href="tel:${item.phone}" class="w-9 h-9 bg-blue-500 text-white rounded-full flex items-center justify-center shadow hover:bg-blue-600 transition shrink-0 ml-2">
                    <i class="fa-solid fa-phone text-sm"></i>
                </a>` : ''}
            </div>
        `).join('');
    });
}

// ৬. ডাটাবেস থেকে নোটিশ লোড করা
function loadNotices() {
    const target = document.getElementById('notices-list-target');
    if (!target) return;

    onValue(ref(db, 'services/education/notices'), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            target.innerHTML = '<p class="text-center text-gray-400 py-6 text-xs">কোনো নোটিশ নেই</p>';
            return;
        }

        target.innerHTML = Object.values(data).map(item => `
            <div class="bg-white p-4 rounded-2xl border-l-4 border-orange-500 shadow-sm animate-fade">
                <div class="flex justify-between items-center mb-1">
                    <span class="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full">${window.escapeHTML(item.tag || 'নোটিশ')}</span>
                    <span class="text-[10px] text-gray-400">${window.timeAgo ? window.timeAgo(item.timestamp) : 'সম্প্রতি'}</span>
                </div>
                <h3 class="font-bold text-gray-800 text-sm">${window.escapeHTML(item.title || '')}</h3>
                <p class="text-xs text-gray-600 mt-1.5 leading-relaxed">${window.escapeHTML(item.desc || '')}</p>
            </div>
        `).join('');
    });
}