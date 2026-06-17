// আপনার apifootball.com এর API Key এখানে দিন
const API_KEY = "0d32ccd98a1644f14f9f2b7bca0e0617baf38ac668768eb60612cda46a029209"; 

// বিগত ১ বছর এবং আগামী ১ বছরের তারিখ বের করার ফাংশন (যাতে সব রাউন্ডের ম্যাচ পাওয়া যায়)
function getDates() {
    const today = new Date();
    const nextYear = new Date();
    const pastYear = new Date();
    
    nextYear.setFullYear(today.getFullYear() + 1); // আগামী ১ বছরের ডাটা
    pastYear.setFullYear(today.getFullYear() - 1); // বিগত ১ বছরের ডাটা

    return {
        from: pastYear.toISOString().split('T')[0],
        to: nextYear.toISOString().split('T')[0]
    };
}

const dates = getDates();
const API_URL = `https://apiv3.apifootball.com/?action=get_events&from=${dates.from}&to=${dates.to}&APIkey=${API_KEY}`; 

let fifaUpdateInterval = null;
const CACHE_KEY = "fifa_all_matches_data";
const CACHE_TIME_KEY = "fifa_last_update_time";

async function loadFifaUI() {
    try {
        const response = await fetch('fifa-ui.html'); // আপনার HTML ফাইল
        if (!response.ok) throw new Error('Failed to load FIFA UI');
        
        const htmlText = await response.text();
        const container = document.getElementById('fifa-ui-container');
        if (container) {
            container.innerHTML = htmlText;
            console.log("FIFA Design with Tabs & Storage Loaded!");
            
            loadFifaApiData();
            
            // প্রতি ১ মিনিট পর পর শুধু ব্যাকগ্রাউন্ডে ডাটা আপডেট হবে
            if(fifaUpdateInterval) clearInterval(fifaUpdateInterval);
            fifaUpdateInterval = setInterval(loadFifaApiData, 60000); 
        }
    } catch (error) {
        console.error("Error loading FIFA UI:", error);
    }
}

// === ট্যাব পরিবর্তনের ফাংশন ===
window.toggleFifaTab = (tabName) => {
    const upcomingBtn = document.getElementById('tab-upcoming');
    const finishedBtn = document.getElementById('tab-finished');
    const upcomingContainer = document.getElementById('fifa-upcoming-container');
    const finishedContainer = document.getElementById('fifa-finished-container');

    if (tabName === 'upcoming') {
        upcomingContainer.classList.replace('hidden', 'block');
        finishedContainer.classList.replace('block', 'hidden');
        upcomingBtn.className = "w-1/2 py-2 text-xs font-bold rounded-md bg-white text-blue-600 shadow-sm transition-all flex justify-center items-center gap-2";
        finishedBtn.className = "w-1/2 py-2 text-xs font-bold rounded-md text-gray-500 hover:text-gray-700 transition-all flex justify-center items-center gap-2";
    } else {
        finishedContainer.classList.replace('hidden', 'block');
        upcomingContainer.classList.replace('block', 'hidden');
        finishedBtn.className = "w-1/2 py-2 text-xs font-bold rounded-md bg-white text-green-600 shadow-sm transition-all flex justify-center items-center gap-2";
        upcomingBtn.className = "w-1/2 py-2 text-xs font-bold rounded-md text-gray-500 hover:text-gray-700 transition-all flex justify-center items-center gap-2";
    }
};

// ডাটা প্রসেস এবং রেন্ডার করার মূল ফাংশন
function processAndRenderData(allMatches) {
    const liveContainer = document.getElementById('fifa-live-container');
    const finishedContainer = document.getElementById('fifa-finished-container');
    const upcomingContainer = document.getElementById('fifa-upcoming-container');

    if (!allMatches || allMatches.error) {
        showEmptyState(liveContainer, finishedContainer, upcomingContainer);
        return;
    }

    const fifaMatches = allMatches.filter(match => {
        if (!match.league_name) return false;
        const leagueName = match.league_name.toLowerCase();
        return leagueName.includes("world cup") || leagueName.includes("wc qualification");
    });

    if (fifaMatches.length === 0) {
        showEmptyState(liveContainer, finishedContainer, upcomingContainer);
        return;
    }

    const liveMatches = [];
    const finishedMatches = [];
    const upcomingMatches = [];

    fifaMatches.forEach(match => {
        if (match.match_status === "Finished" || match.match_status === "FT") {
            finishedMatches.push(match);
        } else if (match.match_status === "" || match.match_status.includes(":")) {
            upcomingMatches.push(match);
        } else {
            liveMatches.push(match);
        }
    });

    // ক্রমানুসারে সাজানো (Round 1, 2 সব অটোমেটিক ডেট অনুযায়ী সাজানো থাকবে)
    upcomingMatches.sort((a, b) => new Date(`${a.match_date}T${a.match_time || "00:00"}`) - new Date(`${b.match_date}T${b.match_time || "00:00"}`));
    finishedMatches.sort((a, b) => new Date(`${b.match_date}T${b.match_time || "00:00"}`) - new Date(`${a.match_date}T${a.match_time || "00:00"}`));

    if (liveContainer) liveContainer.innerHTML = liveMatches.length > 0 ? liveMatches.map(m => generateMatchCard(m, 'live')).join('') : `<p class="text-center text-gray-500 text-sm py-4">এই মুহূর্তে কোনো লাইভ ম্যাচ নেই</p>`;
    if (finishedContainer) finishedContainer.innerHTML = finishedMatches.length > 0 ? finishedMatches.map(m => generateMatchCard(m, 'finished')).join('') : `<p class="text-center text-gray-500 text-sm py-4">কোনো ম্যাচের ফলাফল পাওয়া যায়নি</p>`;
    if (upcomingContainer) upcomingContainer.innerHTML = upcomingMatches.length > 0 ? upcomingMatches.map(m => generateMatchCard(m, 'upcoming')).join('') : `<p class="text-center text-gray-500 text-sm py-4">কোনো আসন্ন ম্যাচ নেই</p>`;
}

// API থেকে ডাটা আনার ফাংশন (Storage System সহ)
window.loadFifaApiData = async () => {
    const statusText = document.getElementById('fifa-api-status');
    const cachedData = localStorage.getItem(CACHE_KEY);
    const lastUpdateTime = localStorage.getItem(CACHE_TIME_KEY);
    const now = Date.now();

    // ১. যদি স্টোরেজে ডাটা থাকে, তাহলে সাথে সাথে দেখাও (যাতে লোডিং না দেখতে হয়)
    if (cachedData) {
        try {
            const parsedData = JSON.parse(cachedData);
            processAndRenderData(parsedData);
        } catch (e) { console.error("Cache parsing error"); }
    }

    // ২. যদি ডাটা না থাকে অথবা ১ মিনিটের বেশি পুরনো হয়, তাহলে API কল করো
    if (!cachedData || !lastUpdateTime || (now - parseInt(lastUpdateTime)) > 60000) {
        if(statusText) statusText.innerText = "Syncing latest data...";
        
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`API Error Status: ${response.status}`);
            const allMatches = await response.json(); 

            // ডাটা লোকাল স্টোরেজে সেভ করা হচ্ছে
            localStorage.setItem(CACHE_KEY, JSON.stringify(allMatches));
            localStorage.setItem(CACHE_TIME_KEY, now.toString());

            // নতুন ডাটা দিয়ে UI আপডেট করা হচ্ছে
            processAndRenderData(allMatches);

            if (statusText) statusText.innerHTML = `<span class="text-green-600"><i class="fa-solid fa-circle-check"></i> Data Synced Successfully</span>`;
        } catch (error) {
            console.error("API Fetch Error:", error);
            if (!cachedData && statusText) {
                statusText.innerHTML = `<span class="text-red-500">API কানেকশন ফেইল করেছে</span>`;
            }
        }
    }
};

function generateMatchCard(match, type) {
    const leagueName = match.country_name + " - " + match.league_name; 
    const roundName = match.match_round ? ` | ${match.match_round}` : ""; // রাউন্ডের নাম যুক্ত করা হলো
    const team1 = match.match_hometeam_name;
    const logo1 = match.team_home_badge || "https://via.placeholder.com/50";
    const team2 = match.match_awayteam_name;
    const logo2 = match.team_away_badge || "https://via.placeholder.com/50";
    
    let centerData = "";
    let statusBadge = "";

    if (type === 'live') {
        centerData = `<div class="text-xl font-black text-gray-800 tracking-wider">${match.match_hometeam_score} - ${match.match_awayteam_score}</div>`;
        statusBadge = `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse flex items-center gap-1"><span class="w-1.5 h-1.5 bg-red-600 rounded-full"></span> ${match.match_status}'</span>`;
    } 
    else if (type === 'finished') {
        centerData = `<div class="text-xl font-black text-gray-800 tracking-wider">${match.match_hometeam_score} - ${match.match_awayteam_score}</div><div class="text-[9px] text-gray-500 mt-1">${match.match_date}</div>`;
        statusBadge = `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200"><i class="fa-solid fa-check-double"></i> Full Time</span>`;
    } 
    else {
        centerData = `<div class="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-1.5 rounded-md border border-blue-100">${match.match_date}<br>${match.match_time}</div>`;
        statusBadge = `<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200"><i class="fa-regular fa-clock"></i> Upcoming</span>`;
    }

    return `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative mb-3 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
            <span class="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded truncate max-w-[220px]">${leagueName}${roundName}</span>
            ${statusBadge}
        </div>
        <div class="flex justify-between items-center px-2">
            <div class="flex flex-col items-center w-1/3">
                <img src="${logo1}" class="w-10 h-10 object-contain mb-2 drop-shadow-md" alt="${team1}">
                <h4 class="font-bold text-gray-800 text-xs text-center line-clamp-1">${team1}</h4>
            </div>
            <div class="w-1/3 flex flex-col items-center justify-center text-center">
                ${centerData}
            </div>
            <div class="flex flex-col items-center w-1/3">
                <img src="${logo2}" class="w-10 h-10 object-contain mb-2 drop-shadow-md" alt="${team2}">
                <h4 class="font-bold text-gray-800 text-xs text-center line-clamp-1">${team2}</h4>
            </div>
        </div>
    </div>`;
}

function showEmptyState(liveContainer, finishedContainer, upcomingContainer) {
    const emptyHtml = `
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center mt-4">
            <i class="fa-solid fa-futbol text-4xl text-gray-300 mb-3"></i>
            <p class="font-bold text-gray-600 text-sm">এই মুহূর্তে কোনো ম্যাচ ডাটা পাওয়া যায়নি</p>
        </div>`;
    if(liveContainer) liveContainer.innerHTML = emptyHtml;
    if(finishedContainer) finishedContainer.innerHTML = ""; 
    if(upcomingContainer) upcomingContainer.innerHTML = ""; 
}

document.addEventListener("DOMContentLoaded", () => {
    loadFifaUI();
});