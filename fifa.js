// আপনার apifootball.com এর API Key
const API_KEY = "3c3c2e2cedfcea673c0202ea21fd4ae246eb835c79233578a4ed8d125aadf572"; 

const CACHE_KEY = "fifa_matches_step_data";
const CACHE_TIME_KEY = "fifa_step_update_time";
let fifaUpdateInterval = null;

// তারিখ বের করার ফাংশন (৩ মাস করে ভাগ করা হলো যাতে API ফেইল না করে)
function getStepDates() {
    const today = new Date();
    
    const future = new Date();
    future.setDate(today.getDate() + 40); // আগামী ৩ মাস
    
    const past = new Date();
    past.setDate(today.getDate() - 40); // বিগত ৩ মাস

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    return {
        todayStr: today.toISOString().split('T')[0],
        futureStr: future.toISOString().split('T')[0],
        pastStr: past.toISOString().split('T')[0],
        yesterdayStr: yesterday.toISOString().split('T')[0]
    };
}

async function loadFifaUI() {
    try {
        const response = await fetch('fifa-ui.html'); // আপনার HTML ফাইল
        if (!response.ok) throw new Error('Failed to load FIFA UI');
        
        const htmlText = await response.text();
        const container = document.getElementById('fifa-ui-container');
        if (container) {
            container.innerHTML = htmlText;
            console.log("FIFA UI Loaded! Starting Step-by-Step Data Fetch...");
            
            loadFifaApiData();
            
            // প্রতি ২ মিনিট পর পর লাইভ ডাটা চেক করবে
            if(fifaUpdateInterval) clearInterval(fifaUpdateInterval);
            fifaUpdateInterval = setInterval(loadFifaApiData, 120000); 
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

// API কল করার জন্য আলাদা ফাংশন
async function fetchFifaData(fromDate, toDate) {
    const url = `https://apiv3.apifootball.com/?action=get_events&from=${fromDate}&to=${toDate}&APIkey=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("API Limit or Network Issue");
    
    const data = await response.json();
    if (data.error) return [];

    // শুধু ফিফার ডাটা ফিল্টার করা
    return data.filter(match => {
        if (!match.league_name) return false;
        const leagueName = match.league_name.toLowerCase();
        return leagueName.includes("world cup") || leagueName.includes("wc qualification");
    });
}

// ডাটা স্ক্রিনে দেখানোর ফাংশন
function renderData(matches) {
    const liveContainer = document.getElementById('fifa-live-container');
    const finishedContainer = document.getElementById('fifa-finished-container');
    const upcomingContainer = document.getElementById('fifa-upcoming-container');

    const liveMatches = [];
    const finishedMatches = [];
    const upcomingMatches = [];

    matches.forEach(match => {
        if (match.match_status === "Finished" || match.match_status === "FT") {
            finishedMatches.push(match);
        } else if (match.match_status === "" || match.match_status.includes(":")) {
            upcomingMatches.push(match);
        } else {
            liveMatches.push(match);
        }
    });

    upcomingMatches.sort((a, b) => new Date(`${a.match_date}T${a.match_time || "00:00"}`) - new Date(`${b.match_date}T${b.match_time || "00:00"}`));
    finishedMatches.sort((a, b) => new Date(`${b.match_date}T${b.match_time || "00:00"}`) - new Date(`${a.match_date}T${a.match_time || "00:00"}`));

    if (liveContainer && liveMatches.length > 0) liveContainer.innerHTML = liveMatches.map(m => generateMatchCard(m, 'live')).join('');
    else if (liveContainer) liveContainer.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">এই মুহূর্তে কোনো লাইভ ম্যাচ নেই</p>`;

    if (finishedContainer && finishedMatches.length > 0) finishedContainer.innerHTML = finishedMatches.map(m => generateMatchCard(m, 'finished')).join('');
    else if (finishedContainer) finishedContainer.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">ফলাফল লোড হচ্ছে অথবা নেই...</p>`;

    if (upcomingContainer && upcomingMatches.length > 0) upcomingContainer.innerHTML = upcomingMatches.map(m => generateMatchCard(m, 'upcoming')).join('');
    else if (upcomingContainer) upcomingContainer.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">আসন্ন ম্যাচ লোড হচ্ছে অথবা নেই...</p>`;
}

// মূল ফাংশন (ধাপে ধাপে লোড করবে)
window.loadFifaApiData = async () => {
    const statusText = document.getElementById('fifa-api-status');
    const cachedData = localStorage.getItem(CACHE_KEY);
    const lastUpdateTime = localStorage.getItem(CACHE_TIME_KEY);
    const now = Date.now();

    let allFetchedMatches = [];

    // ১. স্টোরেজে ডাটা থাকলে সাথে সাথে দেখাও
    if (cachedData) {
        try {
            allFetchedMatches = JSON.parse(cachedData);
            renderData(allFetchedMatches);
        } catch (e) { console.error("Cache parsing error"); }
    }

    // ২. ডাটা পুরনো হলে বা না থাকলে ধাপে ধাপে API থেকে আনো
    if (!cachedData || !lastUpdateTime || (now - parseInt(lastUpdateTime)) > 60000) {
        const dates = getStepDates();
        
        try {
            // --- ধাপ ১: লাইভ এবং আপকামিং ডাটা আনা (আজ থেকে আগামী ৩ মাস) ---
            if(statusText) statusText.innerHTML = `<span class="text-blue-500"><i class="fa-solid fa-spinner fa-spin"></i> Step 1: Loading Live & Upcoming...</span>`;
            
            const futureMatches = await fetchFifaData(dates.todayStr, dates.futureStr);
            renderData([...allFetchedMatches, ...futureMatches]); // যা পেয়েছে তা সাথে সাথে স্ক্রিনে দেখাও

            // --- ধাপ ২: ফলাফলের ডাটা আনা (বিগত ৩ মাস থেকে গতকাল পর্যন্ত) ---
            if(statusText) statusText.innerHTML = `<span class="text-blue-500"><i class="fa-solid fa-spinner fa-spin"></i> Step 2: Loading Past Results...</span>`;
            
            const pastMatches = await fetchFifaData(dates.pastStr, dates.yesterdayStr);
            
            // দুটি ধাপের ডাটা একসাথে করা
            allFetchedMatches = [...futureMatches, ...pastMatches];
            
            // ফাইনাল রেন্ডার এবং স্টোরেজে সেভ করা
            renderData(allFetchedMatches);
            localStorage.setItem(CACHE_KEY, JSON.stringify(allFetchedMatches));
            localStorage.setItem(CACHE_TIME_KEY, now.toString());

            if (statusText) statusText.innerHTML = `<span class="text-green-600"><i class="fa-solid fa-circle-check"></i> All Data Synced!</span>`;

        } catch (error) {
            console.error("API Fetch Error:", error);
            if (!cachedData && statusText) {
                statusText.innerHTML = `<span class="text-red-500"><i class="fa-solid fa-triangle-exclamation"></i> API Connection Failed. Retrying later.</span>`;
            }
        }
    }
};

function generateMatchCard(match, type) {
    const leagueName = match.country_name + " - " + match.league_name; 
    const roundName = match.match_round ? ` | ${match.match_round}` : ""; 
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

document.addEventListener("DOMContentLoaded", () => {
    loadFifaUI();
});