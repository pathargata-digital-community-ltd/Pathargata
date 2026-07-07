// ==========================================
// 🤖 ADVANCED AI SMART BOT LOGIC 
// ==========================================

const BOT_UID = "smart_bot_ai";

// চ্যাট স্টার্ট ফাংশন
window.startBotChat = () => {
    window.currentChatUser = { uid: BOT_UID, name: "পাথরঘাটা অ্যাসিস্ট্যান্ট" };
    
    // মেইন চ্যাটের UI লুকানো এবং কনভারসেশন UI দেখানো
    const chatListView = document.getElementById('chat-list-view');
    const chatConvView = document.getElementById('chat-conversation-view');
    if(chatListView) chatListView.classList.add('hidden', 'hidden-custom');
    if(chatConvView) chatConvView.classList.remove('hidden', 'hidden-custom');
    
    // হেডার পরিবর্তন (AI Badge সহ)
    document.getElementById('chat-header-name').innerHTML = 'পাথরঘাটা অ্যাসিস্ট্যান্ট <span class="bg-blue-100 text-blue-600 text-[9px] px-2 py-0.5 rounded-full ml-1 font-extrabold uppercase border border-blue-200">Official AI</span>';
    document.getElementById('chat-header-img').innerHTML = `<div class="w-full h-full bg-blue-600 text-white flex items-center justify-center text-xl"><i class="fa-solid fa-robot"></i></div>`;
    
    history.pushState({ page: 'chat-conversation', uid: BOT_UID }, "", "#bot-chat");
    
    // মেইন সেন্ড মেসেজ ওভাররাইড করা
    if (!window.originalSendMsgBackup) {
        window.originalSendMsgBackup = window.sendMsg; 
    }
    window.sendMsg = (imageUrl = null, voiceUrl = null) => {
        if (window.currentChatUser && window.currentChatUser.uid === BOT_UID) {
            handleBotInteraction(imageUrl, voiceUrl);
        } else {
            if(typeof window.originalSendMsgBackup === 'function') window.originalSendMsgBackup(imageUrl, voiceUrl);
        }
    };

    loadBotMessages();
};

function loadBotMessages() {
    const div = document.getElementById('messages-container');
    const botHistory = JSON.parse(localStorage.getItem('bot_chat_history') || '[]');
    
    if (botHistory.length === 0) {
        const timeGreeting = getTimeBasedGreeting();
        const userName = window.userDetails?.name?.split(' ')[0] || 'প্রিয় গ্রাহক';
        const welcomeMsg = `${timeGreeting} ${userName}! 👋\nআমি পাথরঘাটা ডিজিটাল অ্যাপের আর্টিফিশিয়াল ইন্টেলিজেন্স (AI) বট। \n\nআপনি আমাকে অ্যাপের সেবা, রক্তদান, প্রশাসন বা অন্য যেকোনো বিষয়ে প্রশ্ন করতে পারেন। কীভাবে সাহায্য করতে পারি?`;
        botHistory.push({ sender: 'bot', text: welcomeMsg, timestamp: Date.now() });
        localStorage.setItem('bot_chat_history', JSON.stringify(botHistory));
    }
    
    renderBotMessages(botHistory);
}

function renderBotMessages(msgs) {
    const div = document.getElementById('messages-container');
    let html = "";
    
    msgs.forEach((m) => {
        const isMe = m.sender === 'me';
        const avatarHtml = isMe ? '' : `<div class="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-[12px] mr-2 shrink-0 mt-auto shadow-sm"><i class="fa-solid fa-robot"></i></div>`;
        const bubbleColor = isMe ? 'bg-green-600 text-white rounded-[18px_18px_0_18px]' : 'bg-white border border-gray-200 text-gray-800 rounded-[18px_18px_18px_0] shadow-sm';
        
        html += `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 animate-fade">
            ${avatarHtml}
            <div class="px-4 py-2.5 max-w-[80%] text-[15px] leading-relaxed ${bubbleColor}">
                ${m.text.replace(/\n/g, '<br>')}
                <div class="text-[9px] mt-1 ${isMe ? 'text-green-200 text-right' : 'text-gray-400'}">${formatBotTime(m.timestamp)}</div>
            </div>
        </div>`;
    });
    
    div.innerHTML = html;
    setTimeout(() => div.scrollTop = div.scrollHeight, 100);
}

function handleBotInteraction(imageUrl, voiceUrl) {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text && !imageUrl && !voiceUrl) return;
    
    if (imageUrl || voiceUrl) {
        if(window.showToast) window.showToast("দুঃখিত, আমি এখনো ছবি বা ভয়েস কমান্ড প্রসেস করতে পারি না। দয়া করে লিখে জানান।", "error");
        input.value = "";
        return;
    }

    const botHistory = JSON.parse(localStorage.getItem('bot_chat_history') || '[]');
    botHistory.push({ sender: 'me', text: text, timestamp: Date.now() });
    renderBotMessages(botHistory);
    input.value = "";
    
    // রিয়েলিস্টিক টাইপিং ইফেক্ট
    const typingStatus = document.getElementById('chat-typing-status');
    if(typingStatus) {
        typingStatus.innerHTML = '<span class="text-blue-500"><i class="fa-solid fa-pen"></i> AI is typing...</span>';
        typingStatus.classList.remove('hidden');
    }

    // মেসেজের লেন্থ অনুযায়ী টাইপিং ডিলে হবে (বেশি বড় মেসেজ হলে বট একটু বেশি সময় নিবে)
    const typingDelay = Math.min(Math.max(text.length * 30, 800), 2500);

    setTimeout(() => {
        const reply = getAdvancedBotReply(text.toLowerCase());
        botHistory.push({ sender: 'bot', text: reply, timestamp: Date.now() });
        localStorage.setItem('bot_chat_history', JSON.stringify(botHistory));
        
        if(typingStatus) typingStatus.classList.add('hidden');
        renderBotMessages(botHistory);
        if(window.playSound) window.playSound('message');
        
    }, typingDelay); 
}

// ==========================================
// 🧠 এআই ব্রেইন (Advanced Intent Matching)
// ==========================================
function getAdvancedBotReply(msg) {
    const userName = window.userDetails?.name?.split(' ')[0] || 'বন্ধু';
    const userVillage = window.userDetails?.village || 'আপনার এলাকায়';

    // 1. Greetings (সালাম ও কুশলাদি)
    if (msg.includes('salam') || msg.includes('assalamu') || msg.includes('সালাম') || msg.includes('আসসালামু')) {
        return `ওয়ালাইকুমুস সালাম ওয়া রাহমাতুল্লাহ! 😇\nআশা করি ভালো আছেন, ${userName}। বলুন, কীভাবে সহায়তা করতে পারি?`;
    }
    if (msg.includes('hello') || msg.includes('হ্যালো') || msg.includes('hi') || msg.includes('হাই')) {
        return `হ্যালো ${userName}! আমি পাথরঘাটা ডিজিটাল অ্যাপের AI। আপনার কোনো প্রশ্ন থাকলে নির্দ্বিধায় করতে পারেন।`;
    }
    if (msg.includes('kemon') || msg.includes('কেমন আছ') || msg.includes('valoni') || msg.includes('ভালো নি')) {
        return `আলহামদুলিল্লাহ, আমি একটি আর্টিফিশিয়াল ইন্টেলিজেন্স, তাই আমার মন সবসময় ফুরফুরে থাকে! 😅\nআপনার কী অবস্থা? দিনকাল কেমন যাচ্ছে?`;
    }

    // 2. Services Help (সার্ভিস বিষয়ক)
    if (msg.includes('rokt') || msg.includes('রক্ত') || msg.includes('blood')) {
        return `🩸 রক্তের প্রয়োজনে আপনি আমাদের অ্যাপের **'সকল সেবা'** থেকে **'রক্তদান'** অপশনে যেতে পারেন। সেখানে রক্তের গ্রুপ অনুযায়ী ডোনারদের নাম্বার দেওয়া আছে। আপনি চাইলে সরাসরি তাদের কল করতে পারবেন।`;
    }
    if (msg.includes('doctor') || msg.includes('ডাক্তার') || msg.includes('হাসপাতাল') || msg.includes('medical')) {
        return `🩺 পাথরঘাটার সকল বিশেষজ্ঞ ডাক্তার, হাসপাতাল ও ডায়াগনস্টিক সেন্টারের সিরিয়াল নাম্বার আমাদের **'প্রশাসনিক ও জরুরি ডিরেক্টরি'** অপশনে দেওয়া আছে। আপনি 'সকল সেবা' থেকে সেখানে যেতে পারেন।`;
    }
    if (msg.includes('ovijog') || msg.includes('অভিযোগ') || msg.includes('সমস্যা') || msg.includes('complain')) {
        return `⚖️ আপনার এলাকায় কোনো সমস্যা বা দুর্নীতি হলে আপনি অ্যাপের **'স্মার্ট অভিযোগ বক্স'** এর মাধ্যমে সরাসরি ইউএনও (UNO) বা ওসি (OC) স্যারকে জানাতে পারেন। চাইলে নিজের নাম গোপন রেখেও অভিযোগ করা যায়।`;
    }
    if (msg.includes('police') || msg.includes('থানা') || msg.includes('পুলিশ')) {
        return `🚓 পুলিশ বা থানার সাথে যোগাযোগ করতে চাইলে ডিরেক্টরি থেকে **'থানা পুলিশ'** অপশনে যান। সেখানে ওসির নাম্বার দেওয়া আছে। জরুরি প্রয়োজনে সরাসরি ৯৯৯ এ কল করতে পারেন।`;
    }

    // 3. Fun & Interactions (মজা ও কৌতুক)
    if (msg.includes('joke') || msg.includes('কৌতুক') || msg.includes('হাসি')) {
        const jokes = [
            "শিক্ষক: বল্টু, মশা কয় প্রকার?\nবল্টু: মশা পাঁচ প্রকার।\n১. দিনের মশা\n২. রাতের মশা\n৩. সুযোগ সন্ধানী মশা\n৪. কানের কাছে গান গাওয়া মশা\n৫. সাইজ বড় কাজে জিরো মশা! 😂",
            "ডাক্তার: আপনার ওজন কমানো দরকার। রোজ সকালে ঘাম ঝরাবেন।\nরোগী: আমি তো রোজ সকালেই ঘাম ঝরাই ডাক্তারবাবু!\nডাক্তার: কীভাবে?\nরোগী: গরম চা খেয়ে! ☕😅",
            "স্যার: বলতো, মশা কয়টি দাঁত দিয়ে কামড়ায়?\nছাত্র: মশার তো দাঁতই নেই স্যার!\nস্যার: তাহলে কামড়ায় কীভাবে?\nছাত্র: ওরা তো কামড়ায় না স্যার, ইনজেকশন দেয়! 💉😂"
        ];
        return jokes[Math.floor(Math.random() * jokes.length)] + "\n\nআশা করি একটু হলেও হাসি পেয়েছে! আর কোনো সাহায্য লাগবে?";
    }

    // 4. Identity & Developer (বটের পরিচয়)
    if (msg.includes('toiri') || msg.includes('তৈরি') || msg.includes('developer') || msg.includes('বানাইছে')) {
        return `আমি **পাথরঘাটা ডিজিটাল কমিউনিটি লিমিটেড** এর সম্মানিত ডেভেলপারদের দ্বারা তৈরি একটি আধুনিক স্মার্ট বট। আমার কাজ হলো অ্যাপের ইউজারদের সাহায্য করা। 🤖`;
    }
    if (msg.includes('name') || msg.includes('নাম কি') || msg.includes('porichoy')) {
        return `আমার নির্দিষ্ট কোনো নাম নেই, তবে সবাই আমাকে **পাথরঘাটা এআই (AI)** বলে ডাকে। আর আপনার নাম তো ${userName}, তাই না? আমি আপনাকে চিনি! 😎`;
    }
    if (msg.includes('bari koi') || msg.includes('বাড়ি কোথায়') || msg.includes('gram')) {
        return `আমি তো অনলাইনেই থাকি ভাই! তবে আপনার গ্রাম হলো **${userVillage}**। ঠিক বললাম তো? 🏠`;
    }

    // 5. Thanks & Closing (বিদায়)
    if (msg.includes('thank') || msg.includes('ধন্যবাদ') || msg.includes('thanks')) {
        return `আপনাকেও অসংখ্য ধন্যবাদ! আপনার যেকোনো প্রয়োজনে আমাকে স্মরণ করতে পারেন। আপনার দিনটি শুভ হোক! ❤️`;
    }
    if (msg.includes('bye') || msg.includes('বিদায়') || msg.includes('allah hafez') || msg.includes('আল্লাহ হাফেজ')) {
        return `আল্লাহ হাফেজ! ভালো থাকবেন, সুস্থ থাকবেন। আবার কথা হবে! 👋`;
    }

    // 6. Default Fallback (বুঝতে না পারলে)
    const fallbacks = [
        `দুঃখিত, আমি আপনার কথাটি ঠিক বুঝতে পারিনি। আপনি কি আরেকটু ক্লিয়ার করে বলবেন? 🤔`,
        `আপনার এই প্রশ্নটির উত্তর আমার জানা নেই। আমি বিষয়টি আমার ডেটাবেসে সেভ করে রাখছি, যাতে পরবর্তীতে শিখতে পারি! 📝`,
        `ভাই, আমি তো একটা ছোট রোবট! এত কঠিন কথা বললে আমি কীভাবে বুঝব? 😅 দয়া করে সহজ করে বলুন।`,
        `আমি মূলত অ্যাপের সেবা, রক্তদান, ডাক্তার বা অভিযোগ নিয়ে সাহায্য করতে পারি। আপনি কি এই সংক্রান্ত কিছু জানতে চান?`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// হেল্পার: সময় অনুযায়ী গ্রিটিং
function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour < 12 && hour >= 5) return 'শুভ সকাল';
    if (hour < 15 && hour >= 12) return 'শুভ দুপুর';
    if (hour < 18 && hour >= 15) return 'শুভ বিকেল';
    if (hour < 21 && hour >= 18) return 'শুভ সন্ধ্যা';
    return 'শুভ রাত্রি';
}

// হেল্পার: মেসেজের টাইম ফরম্যাট
function formatBotTime(timestamp) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
}