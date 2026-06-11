// আপনার apifootball.com এর API Key এখানে দিন
const API_KEY = "0d32ccd98a1644f14f9f2b7bca0e0617baf38ac668768eb60612cda46a029209"; 

// apifootball.com এর লাইভ ম্যাচের URL (একাউন্টের API Key সহ)
const API_URL = `https://apiv3.apifootball.com/?action=get_events&match_live=1&APIkey=${API_KEY}`; 

let fifaUpdateInterval = null;

// ১. HTML ফাইল ফেচ করে কন্টেইনারে বসানোর ফাংশন (আগের মতোই থাকবে)
async function loadFifaUI() {
    try {
        const response = await fetch('fifa-ui.html');
        if (!response.ok) throw new Error('Failed to load FIFA UI');
        
        const htmlText = await response.text();
        const container = document.getElementById('fifa-ui-container');
        if (container) {
            container.innerHTML = htmlText;
            console.log("FIFA Design Loaded Successfully!");
            
            // UI লোড হওয়ার পর API থেকে ডাটা আনা শুরু করবে
            loadFifaApiData();
            
            // প্রতি ১ মিনিট (৬০০০০ মিলি-সেকেন্ড) পর পর লাইভ স্কোর আপডেট করবে
            if(fifaUpdateInterval) clearInterval(fifaUpdateInterval);
            fifaUpdateInterval = setInterval(loadFifaApiData, 60000); 
        }
    } catch (error) {
        console.error("Error loading FIFA UI:", error);
    }
}

// ২. API থেকে ডাটা আনার ফাংশন (apifootball.com এর জন্য মডিফাই করা হয়েছে)
window.loadFifaApiData = async () => {
    const container = document.getElementById('fifa-matches-container');
    const statusText = document.getElementById('fifa-api-status');
    
    if(!container) return;
    
    // শুধু প্রথমবার লোডিং দেখানোর জন্য
    if(container.innerHTML.trim() === "") {
        statusText.innerText = "Connecting to Live API...";
    }

    try {
        // apifootball.com এ কোনো header লাগে না, সরাসরি fetch করলেই হয়
        const response = await fetch(API_URL);

        if (!response.ok) throw new Error(`API Error Status: ${response.status}`);

        const matches = await response.json(); 

        if (statusText) {
            statusText.innerHTML = `<span class="text-green-600"><i class="fa-solid fa-circle-check"></i> Live Data Synced</span>`;
        }

        // যদি কোনো লাইভ ম্যাচ না থাকে অথবা API এ কোনো এরর আসে
        if (!matches || matches.length === 0 || matches.error) {
            container.innerHTML = `
                <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
                    <i class="fa-solid fa-futbol text-4xl text-gray-300 mb-3"></i>
                    <p class="font-bold text-gray-600 text-sm">এই মুহূর্তে কোনো লাইভ ম্যাচ নেই</p>
                </div>`;
            return;
        }

        let html = "";
        matches.forEach(match => {
            // apifootball.com এর JSON ফরম্যাট অনুযায়ী ভেরিয়েবলগুলো সেট করা হয়েছে
            const leagueName = match.country_name + " - " + match.league_name; 
            
            const team1 = match.match_hometeam_name;
            const logo1 = match.team_home_badge || "https://via.placeholder.com/50"; // লোগো না থাকলে ডেমো লোগো
            const score1 = match.match_hometeam_score || 0;
            
            const team2 = match.match_awayteam_name;
            const logo2 = match.team_away_badge || "https://via.placeholder.com/50";
            const score2 = match.match_awayteam_score || 0;
            
            const timeElapsed = match.match_status + "'"; 

            html += `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative mb-3">
                <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                    <span class="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded truncate max-w-[200px]">${leagueName}</span>
                    <span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse flex items-center gap-1">
                        <span class="w-1.5 h-1.5 bg-red-600 rounded-full"></span> ${timeElapsed}
                    </span>
                </div>
                <div class="flex justify-between items-center px-2">
                    <div class="flex flex-col items-center w-1/3">
                        <img src="${logo1}" class="w-10 h-10 object-contain mb-2 drop-shadow-md" alt="${team1}">
                        <h4 class="font-bold text-gray-800 text-xs text-center line-clamp-1">${team1}</h4>
                    </div>
                    <div class="w-1/3 flex flex-col items-center justify-center bg-gray-50 rounded-lg py-2 border border-gray-100">
                        <div class="text-xl font-black text-gray-800 tracking-wider">${score1} - ${score2}</div>
                    </div>
                    <div class="flex flex-col items-center w-1/3">
                        <img src="${logo2}" class="w-10 h-10 object-contain mb-2 drop-shadow-md" alt="${team2}">
                        <h4 class="font-bold text-gray-800 text-xs text-center line-clamp-1">${team2}</h4>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error("API Fetch Error:", error);
        if (statusText) {
            statusText.innerHTML = `<span class="text-red-500"><i class="fa-solid fa-triangle-exclamation"></i> API কানেকশন ফেইল করেছে</span>`;
        }
    }
};

// ৩. পেজ লোড হলে অটোমেটিক UI ফেচ করবে
document.addEventListener("DOMContentLoaded", () => {
    loadFifaUI();
});