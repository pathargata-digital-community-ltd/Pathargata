// আপনার apifootball.com এর API Key
const API_KEY = "0d32ccd98a1644f14f9f2b7bca0e0617baf38ac668768eb60612cda46a029209"; 

// সব রেজাল্ট দেখার জন্য গত ৩৬৫ দিন এবং আগামী ৭ দিনের তারিখ বের করার ফাংশন
function getDates() {
    const today = new Date();
    
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 365); // গত ১ বছরের সব রেজাল্ট

    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 7); // আগামী ৭ দিন

    return {
        from: pastDate.toISOString().split('T')[0],
        to: futureDate.toISOString().split('T')[0]
    };
}

const dates = getDates();
const API_URL = `https://apiv3.apifootball.com/?action=get_events&from=${dates.from}&to=${dates.to}&APIkey=${API_KEY}`; 

let fifaUpdateInterval = null;

// মূল API ডাটা কল করার ফাংশন
async function loadFifaApiData() {
    const liveContainer = document.getElementById('fifa-live-container');
    const resultsContainer = document.getElementById('fifa-results-container');
    const upcomingContainer = document.getElementById('fifa-upcoming-container');
    const statusText = document.getElementById('fifa-api-status');
    
    if(!liveContainer || !upcomingContainer || !resultsContainer) return;
    
    if(statusText) statusText.innerText = "Connecting to API...";

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const allMatches = await response.json(); 

        if (statusText) statusText.innerHTML = `<span class="text-green-600"><i class="fa-solid fa-circle-check"></i> Data Synced Successfully</span>`;

        if (!allMatches || allMatches.error) {
            showEmptyState(liveContainer, upcomingContainer, resultsContainer);
            return;
        }

        // ফিফা বিশ্বকাপ এবং বাছাইপর্ব ফিল্টার করা হচ্ছে
        const fifaMatches = allMatches.filter(match => {
            if (!match.league_name) return false;
            const leagueName = match.league_name.toLowerCase();
            return leagueName.includes("world cup") || leagueName.includes("wc qualification");
        });

        if (fifaMatches.length === 0) {
            showEmptyState(liveContainer, upcomingContainer, resultsContainer);
            return;
        }

        const liveMatches = [];
        const upcomingMatches = [];
        const finishedMatches = [];

        // লাইভ, আসন্ন এবং শেষ হওয়া ম্যাচ আলাদা করা
        fifaMatches.forEach(match => {
            if (match.match_status === "Finished" || match.match_status === "FT") {
                finishedMatches.push(match);
            } 
            else if (match.match_status === "" || match.match_status.includes(":")) {
                upcomingMatches.push(match);
            } 
            else {
                liveMatches.push(match);
            }
        });

        // আপকামিং ম্যাচগুলোকে তারিখ অনুযায়ী ক্রমানুসারে সাজানো (শীঘ্রই যে ম্যাচটি হবে সেটি আগে)
        upcomingMatches.sort((a, b) => new Date(`${a.match_date}T${a.match_time || "00:00"}`) - new Date(`${b.match_date}T${b.match_time || "00:00"}`));
        
        // রেজাল্টগুলোকে উল্টো ক্রমানুসারে সাজানো (সবশেষ শেষ হওয়া ম্যাচটি আগে)
        finishedMatches.sort((a, b) => new Date(`${b.match_date}T${b.match_time || "00:00"}`) - new Date(`${a.match_date}T${a.match_time || "00:00"}`));

        // HTML এ ডাটা রেন্ডার করা
        renderMatches(liveContainer, liveMatches, 'live', "এই মুহূর্তে কোনো লাইভ ম্যাচ নেই");
        renderMatches(resultsContainer, finishedMatches, 'finished', "কোনো ম্যাচের ফলাফল পাওয়া যায়নি");
        renderMatches(upcomingContainer, upcomingMatches, 'upcoming', "আগামী ৭ দিনে কোনো ম্যাচ নেই");

    } catch (error) {
        console.error("API Fetch Error:", error);
        if (statusText) statusText.innerHTML = `<span class="text-red-500"><i class="fa-solid fa-circle-xmark"></i> API কানেকশন ফেইল করেছে</span>`;
        showEmptyState(liveContainer, upcomingContainer, resultsContainer);
    }
}

// HTML এ ইনজেক্ট করার হেল্পার ফাংশন
function renderMatches(container, matches, type, emptyMessage) {
    if (matches.length > 0) {
        container.innerHTML = matches.map(match => generateMatchCard(match, type)).join("");
    } else {
        container.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">${emptyMessage}</p>`;
    }
}

// কার্ড বানানোর ফাংশন (লাইভ, আপকামিং এবং রেজাল্টের জন্য আলাদা ডিজাইন)
function generateMatchCard(match, type) {
    const leagueName = match.country_name + " - " + match.league_name; 
    const team1 = match.match_hometeam_name;
    const logo1 = match.team_home_badge || "https://via.placeholder.com/50";
    const team2 = match.match_awayteam_name;
    const logo2 = match.team_away_badge || "https://via.placeholder.com/50";
    
    let centerData, statusBadge;

    if (type === 'live') {
        centerData = `<div class="text-xl font-black text-gray-800 tracking-wider">${match.match_hometeam_score} - ${match.match_awayteam_score}</div>`;
        statusBadge = `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse flex items-center gap-1"><span class="w-1.5 h-1.5 bg-red-600 rounded-full"></span> Live ${match.match_status}'</span>`;
    } 
    else if (type === 'finished') {
        centerData = `<div class="text-xl font-black text-gray-800 tracking-wider">${match.match_hometeam_score} - ${match.match_awayteam_score}</div>`;
        statusBadge = `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold border border-green-200">FT (সমাপ্ত) <br><span class="text-[8px]">${match.match_date}</span></span>`;
    } 
    else { // Upcoming
        centerData = `<div class="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-1.5 rounded-md border border-blue-100">${match.match_date}<br>${match.match_time}</div>`;
        statusBadge = `<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200"><i class="fa-regular fa-clock"></i> Upcoming</span>`;
    }

    return `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative mb-3">
        <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
            <span class="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded truncate max-w-[180px]">${leagueName}</span>
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

// কোনো ডাটা না পেলে এই মেসেজ দেখাবে
function showEmptyState(liveContainer, upcomingContainer, resultsContainer) {
    const emptyHtml = `
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center mt-4">
            <i class="fa-solid fa-futbol text-4xl text-gray-300 mb-3"></i>
            <p class="font-bold text-gray-600 text-sm">কোনো ম্যাচ ডাটা পাওয়া যায়নি</p>
        </div>`;
    
    if(liveContainer) liveContainer.innerHTML = emptyHtml;
    if(resultsContainer) resultsContainer.innerHTML = ""; 
    if(upcomingContainer) upcomingContainer.innerHTML = ""; 
}

// পেজ লোড হওয়ার পর স্ক্রিপ্ট রান করবে
document.addEventListener("DOMContentLoaded", () => {
    loadFifaApiData();
    
    // প্রতি ১ মিনিট পর পর ডেটা অটো রিফ্রেশ হবে
    if(fifaUpdateInterval) clearInterval(fifaUpdateInterval);
    fifaUpdateInterval = setInterval(loadFifaApiData, 60000); 
});