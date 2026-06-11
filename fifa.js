const API_KEY = "0d32ccd98a1644f14f9f2b7bca0e0617baf38ac668768eb60612cda46a029209"; 

// আজকের এবং আগামী ৭ দিনের তারিখ বের করার ফাংশন
function getDates() {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7); // আগামী ৭ দিনের ডাটা

    return {
        from: today.toISOString().split('T')[0],
        to: nextWeek.toISOString().split('T')[0]
    };
}

const dates = getDates();
// লাইভ এর বদলে আমরা এখন নির্দিষ্ট তারিখের (আজ থেকে আগামী ৭ দিন) ডাটা কল করছি
const API_URL = `https://apiv3.apifootball.com/?action=get_events&from=${dates.from}&to=${dates.to}&APIkey=${API_KEY}`; 

let fifaUpdateInterval = null;

async function loadFifaUI() {
    try {
        const response = await fetch('fifa-ui.html'); // আপনার দেওয়া HTML ফাইল
        if (!response.ok) throw new Error('Failed to load FIFA UI');
        
        const htmlText = await response.text();
        const container = document.getElementById('fifa-ui-container');
        if (container) {
            container.innerHTML = htmlText;
            console.log("FIFA Design Loaded!");
            
            loadFifaApiData();
            
            if(fifaUpdateInterval) clearInterval(fifaUpdateInterval);
            fifaUpdateInterval = setInterval(loadFifaApiData, 60000); 
        }
    } catch (error) {
        console.error("Error loading FIFA UI:", error);
    }
}

window.loadFifaApiData = async () => {
    // এখানে আমরা দুটি আলাদা কন্টেইনার খুঁজবো (HTML এ এগুলো রাখতে হবে)
    const liveContainer = document.getElementById('fifa-live-container');
    const upcomingContainer = document.getElementById('fifa-upcoming-container');
    const statusText = document.getElementById('fifa-api-status');
    
    if(!liveContainer && !upcomingContainer) return;
    
    if(statusText) statusText.innerText = "Connecting to API...";

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API Error Status: ${response.status}`);
        const allMatches = await response.json(); 

        if (statusText) statusText.innerHTML = `<span class="text-green-600"><i class="fa-solid fa-circle-check"></i> Data Synced</span>`;

        if (!allMatches || allMatches.error) {
            showEmptyState(liveContainer, upcomingContainer);
            return;
        }

        // ==========================================
        // ১. ফিফা ফিল্টার করা হচ্ছে
        // ==========================================
        const fifaMatches = allMatches.filter(match => {
            if (!match.league_name) return false;
            const leagueName = match.league_name.toLowerCase();
            return leagueName.includes("world cup") || leagueName.includes("wc qualification");
        });

        if (fifaMatches.length === 0) {
            showEmptyState(liveContainer, upcomingContainer);
            return;
        }

        // ==========================================
        // ২. ম্যাচগুলোকে Live এবং Upcoming এ ভাগ করা হচ্ছে
        // ==========================================
        const liveMatches = [];
        const upcomingMatches = [];

        fifaMatches.forEach(match => {
            // apifootball এ আপকামিং ম্যাচের স্ট্যাটাস সাধারণত ফাঁকা থাকে অথবা ম্যাচের সময় (যেমন: 20:30) দেওয়া থাকে
            if (match.match_status === "" || match.match_status.includes(":")) {
                upcomingMatches.push(match);
            } 
            // যদি ম্যাচ শেষ না হয়ে থাকে, তবে সেটি লাইভ
            else if (match.match_status !== "Finished" && match.match_status !== "FT") {
                liveMatches.push(match);
            }
        });

        // ==========================================
        // ৩. লাইভ ম্যাচগুলো HTML এ পাঠানো
        // ==========================================
        if (liveContainer) {
            if (liveMatches.length > 0) {
                let liveHtml = "";
                liveMatches.forEach(match => {
                    liveHtml += generateMatchCard(match, true); // true মানে এটি লাইভ ম্যাচ
                });
                liveContainer.innerHTML = liveHtml;
            } else {
                liveContainer.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">এই মুহূর্তে কোনো লাইভ ম্যাচ নেই</p>`;
            }
        }

        // ==========================================
        // ৪. আপকামিং ম্যাচগুলো HTML এ পাঠানো
        // ==========================================
        if (upcomingContainer) {
            if (upcomingMatches.length > 0) {
                let upcomingHtml = "";
                upcomingMatches.forEach(match => {
                    upcomingHtml += generateMatchCard(match, false); // false মানে এটি আপকামিং ম্যাচ
                });
                upcomingContainer.innerHTML = upcomingHtml;
            } else {
                upcomingContainer.innerHTML = `<p class="text-center text-gray-500 text-sm py-4">আগামী ৭ দিনে কোনো ম্যাচ নেই</p>`;
            }
        }

    } catch (error) {
        console.error("API Fetch Error:", error);
        if (statusText) statusText.innerHTML = `<span class="text-red-500">API কানেকশন ফেইল করেছে</span>`;
    }
};

// কার্ড বানানোর ফাংশন (লাইভ এবং আপকামিং এর জন্য আলাদা স্টাইল)
function generateMatchCard(match, isLive) {
    const leagueName = match.country_name + " - " + match.league_name; 
    const team1 = match.match_hometeam_name;
    const logo1 = match.team_home_badge || "https://via.placeholder.com/50";
    const team2 = match.match_awayteam_name;
    const logo2 = match.team_away_badge || "https://via.placeholder.com/50";
    
    // লাইভ হলে স্কোর দেখাবে, আপকামিং হলে সময় দেখাবে
    const centerData = isLive 
        ? `<div class="text-xl font-black text-gray-800 tracking-wider">${match.match_hometeam_score} - ${match.match_awayteam_score}</div>` 
        : `<div class="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">${match.match_date}<br>${match.match_time}</div>`;

    // লাইভ হলে লাল রঙের মিনিট দেখাবে, আপকামিং হলে "Upcoming" দেখাবে
    const statusBadge = isLive 
        ? `<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse flex items-center gap-1"><span class="w-1.5 h-1.5 bg-red-600 rounded-full"></span> ${match.match_status}'</span>`
        : `<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200"><i class="fa-regular fa-clock"></i> Upcoming</span>`;

    return `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative mb-3">
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

function showEmptyState(liveContainer, upcomingContainer) {
    const emptyHtml = `
        <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center mt-4">
            <i class="fa-solid fa-futbol text-4xl text-gray-300 mb-3"></i>
            <p class="font-bold text-gray-600 text-sm">এই মুহূর্তে কোনো ম্যাচ ডাটা পাওয়া যায়নি</p>
        </div>`;
    if(liveContainer) liveContainer.innerHTML = emptyHtml;
    if(upcomingContainer) upcomingContainer.innerHTML = ""; // আপকামিং ফাঁকা থাকবে
}

document.addEventListener("DOMContentLoaded", () => {
    loadFifaUI();
});