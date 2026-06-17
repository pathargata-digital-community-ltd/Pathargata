// আপনার apifootball.com এর API Key এখানে দিন
const API_KEY = "0d32ccd98a1644f14f9f2b7bca0e0617baf38ac668768eb60612cda46a029209"; 

// বিগত ৭ দিন এবং আগামী ৭ দিনের তারিখ বের করার ফাংশন (ফলাফলের জন্য)
function getDates() {
    const today = new Date();
    const nextWeek = new Date();
    const pastWeek = new Date();
    
    nextWeek.setDate(today.getDate() + 7); // আগামী ৭ দিনের ডাটা
    pastWeek.setDate(today.getDate() - 7); // বিগত ৭ দিনের ডাটা

    return {
        from: pastWeek.toISOString().split('T')[0],
        to: nextWeek.toISOString().split('T')[0]
    };
}

const dates = getDates();
const API_URL = `https://apiv3.apifootball.com/?action=get_events&from=${dates.from}&to=${dates.to}&APIkey=${API_KEY}`; 

let fifaUpdateInterval = null;

async function loadFifaUI() {
    try {
        const response = await fetch('fifa-ui.html'); // আপনার HTML ফাইল
        if (!response.ok) throw new Error('Failed to load FIFA UI');
        
        const htmlText = await response.text();
        const container = document.getElementById('fifa-ui-container');
        if (container) {
            container.innerHTML = htmlText;
            console.log("FIFA Design with Video Player Loaded!");
            
            loadFifaApiData();
            
            if(fifaUpdateInterval) clearInterval(fifaUpdateInterval);
            fifaUpdateInterval = setInterval(loadFifaApiData, 60000); 
        }
    } catch (error) {
        console.error("Error loading FIFA UI:", error);
    }
}

window.loadFifaApiData = async () => {
    const liveContainer = document.getElementById('fifa-live-container');
    const finishedContainer = document.getElementById('fifa-finished-container');
    const upcomingContainer = document.getElementById('fifa-upcoming-container');
    const statusText = document.getElementById('fifa-api-status');
    
    if(!liveContainer && !upcomingContainer && !finishedContainer) return;
    
    if(statusText) statusText.innerText = "Connecting to API...";

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API Error Status: ${response.status}`);
        const allMatches = await response.json(); 

        if (statusText) statusText.innerHTML = `<span class="text-green-600"><i class="fa-solid fa-circle-check"></i> Data Synced Successfully</span>`;

        if (!allMatches || allMatches.error) {
            showEmptyState(liveContainer, finishedContainer, upcomingContainer);
            return;
        }

        // ফিফা বিশ্বকাপ এবং বাছাইপর্ব ফিল্টার করা হচ্ছে
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

        // লাইভ, আপকামিং এবং ফিনিশড (রেজাল্ট) আলাদা করা
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

        // আপকামিং ম্যাচগুলোকে ক্রমানুসারে সাজানো (কাছের সময় আগে)
        upcomingMatches.sort((a, b) => new Date(`${a.match_date}T${a.match_time || "00:00"}`) - new Date(`${b.match_date}T${b.match_time || "00:00"}`));
        
        // ফিনিশড ম্যাচগুলোকে ক্রমানুসারে সাজানো (সর্বশেষ ম্যাচ আগে)
        finishedMatches.sort((a, b) => new Date(`${b.match_date}T${b.match_time || "00:00"}`) - new Date(`${a.match_date}T${a.match_time || "00:00"}`));

        // লাইভ ম্যাচগুলো HTML এ পাঠানো
        if (liveContainer) {
            liveContainer.innerHTML = liveMatches.length > 0 ? liveMatches.map(m => generateMatchCard(m, 'live')).join('') : `<p class="text-center text-gray-500 text-sm py-4">এই মুহূর্তে কোনো লাইভ ম্যাচ নেই</p>`;
        }

        // শেষ হওয়া ম্যাচগুলো (রেজাল্ট) HTML এ পাঠানো
        if (finishedContainer) {
            finishedContainer.innerHTML = finishedMatches.length > 0 ? finishedMatches.map(m => generateMatchCard(m, 'finished')).join('') : `<p class="text-center text-gray-500 text-sm py-4">বিগত ৭ দিনে কোনো ম্যাচের ফলাফল নেই</p>`;
        }

        // আপকামিং ম্যাচগুলো HTML এ পাঠানো
        if (upcomingContainer) {
            upcomingContainer.innerHTML = upcomingMatches.length > 0 ? upcomingMatches.map(m => generateMatchCard(m, 'upcoming')).join('') : `<p class="text-center text-gray-500 text-sm py-4">আগামী ৭ দিনে কোনো ম্যাচ নেই</p>`;
        }

    } catch (error) {
        console.error("API Fetch Error:", error);
        if (statusText) statusText.innerHTML = `<span class="text-red-500">API কানেকশন ফেইল করেছে</span>`;
    }
};

// কার্ড বানানোর ফাংশন (অবস্থা অনুযায়ী কার্ডের ডিজাইন চেঞ্জ হবে)
function generateMatchCard(match, type) {
    const leagueName = match.country_name + " - " + match.league_name; 
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
            <span class="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded truncate max-w-[200px]">${leagueName}</span>
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