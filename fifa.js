// fifa.js

// যখন ফিফা ট্যাবে ক্লিক করা হবে তখন এই ফাংশনটি কল হবে
window.loadFifaData = function() {
    renderLiveMatch();
    renderUpcomingMatches();
};

function renderLiveMatch() {
    const container = document.getElementById('live-match-container');
    if(!container) return;

    // ডেমো লাইভ স্কোর (আপনি চাইলে API বা Firebase থেকে আনতে পারেন)
    const liveMatch = {
        team1: "Argentina",
        team1Flag: "🇦🇷",
        score1: 2,
        team2: "Brazil",
        team2Flag: "🇧🇷",
        score2: 1,
        time: "75'",
        status: "LIVE"
    };

    container.innerHTML = `
        <div class="flex justify-between items-center text-center">
            <div class="flex flex-col items-center flex-1">
                <span class="text-4xl mb-1">${liveMatch.team1Flag}</span>
                <span class="font-bold text-gray-800 text-sm">${liveMatch.team1}</span>
            </div>
            
            <div class="flex-1 flex flex-col items-center justify-center">
                <div class="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded animate-pulse mb-1">${liveMatch.status} ${liveMatch.time}</div>
                <div class="text-3xl font-extrabold text-gray-800 tracking-widest">
                    ${liveMatch.score1} - ${liveMatch.score2}
                </div>
            </div>

            <div class="flex flex-col items-center flex-1">
                <span class="text-4xl mb-1">${liveMatch.team2Flag}</span>
                <span class="font-bold text-gray-800 text-sm">${liveMatch.team2}</span>
            </div>
        </div>
    `;
}

function renderUpcomingMatches() {
    const container = document.getElementById('upcoming-matches-container');
    if(!container) return;

    // ডেমো আপকামিং ম্যাচ
    const matches = [
        { team1: "France", flag1: "🇫🇷", team2: "Germany", flag2: "🇩🇪", time: "Tonight, 9:00 PM" },
        { team1: "Portugal", flag1: "🇵🇹", team2: "Spain", flag2: "🇪🇸", time: "Tomorrow, 1:00 AM" }
    ];

    container.innerHTML = matches.map(match => `
        <div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
            <div class="flex items-center gap-2 w-1/3">
                <span class="text-2xl">${match.flag1}</span>
                <span class="font-bold text-gray-700 text-sm truncate">${match.team1}</span>
            </div>
            <div class="w-1/3 text-center">
                <span class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-1 rounded-full border">${match.time}</span>
            </div>
            <div class="flex items-center justify-end gap-2 w-1/3">
                <span class="font-bold text-gray-700 text-sm truncate">${match.team2}</span>
                <span class="text-2xl">${match.flag2}</span>
            </div>
        </div>
    `).join('');
}