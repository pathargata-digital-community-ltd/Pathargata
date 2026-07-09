// ==========================================
// 🤖 ADVANCED AI BOT LOGIC (Persona: MAYA v3.1 Ultimate)
// Features: Buttons, TTS, Gamification, Fallback, Context Memory
// ==========================================

const BOT_UID = "smart_bot_ira";

// --------------------------------------------------------
// ১. চ্যাট স্টার্ট এবং ইনিশিয়ালাইজেশন
// --------------------------------------------------------
window.startBotChat = () => {
    window.currentChatUser = { uid: BOT_UID, name: "ইরা" };
    
    // অ্যানিমেশন এবং টাইপিং ডটের জন্য প্রয়োজনীয় সিএসএস ইনজেক্ট করা হচ্ছে
    if (!document.getElementById('maya-bot-animations')) {
        const style = document.createElement('style');
        style.id = 'maya-bot-animations';
        style.innerHTML = `
            @keyframes messageSlideUp {
                from { opacity: 0; transform: translateY(12px) scale(0.97); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes bubbleBounce {
                0%, 100% { transform: scale(0.85) translateY(0); opacity: 0.6; }
                50% { transform: scale(1.25) translateY(-5px); opacity: 1; }
            }
            .animate-message-appear {
                animation: messageSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .water-bubble {
                animation: bubbleBounce 1.2s infinite ease-in-out;
                display: inline-block;
                width: 8px;
                height: 8px;
                background-color: #22c55e;
                border: 1px solid #86efac;
                border-radius: 50%;
                margin: 0 2.5px;
                box-shadow: inset -1px -1px 3px rgba(0,0,0,0.1), 0 2px 4px rgba(34,197,94,0.2);
            }
            .water-bubble:nth-child(2) { animation-delay: 0.25s; }
            .water-bubble:nth-child(3) { animation-delay: 0.5s; }
        `;
        document.head.appendChild(style);
    }
    
    // ফায়ারবেস মেসেজ লিসেনার বন্ধ করে ডাটা সেভ করা
    if (window.unsubscribeChatListener) {
        window.unsubscribeChatListener();
        window.unsubscribeChatListener = null;
    }

    // রেগুলার চ্যাট উইন্ডো বন্ধ করা এবং বটের উইন্ডো অন করা
    const chatListView = document.getElementById('chat-list-view');
    const botConvView = document.getElementById('bot-conversation-view');
    
    if (chatListView) chatListView.classList.add('hidden', 'hidden-custom');
    if (botConvView) botConvView.classList.remove('hidden', 'hidden-custom');

    // স্পিকার মিউট/আনমিউট আইকন রিসেট
    const isMuted = localStorage.getItem('maya_voice_muted') === 'true';
    const muteIcon = document.getElementById('bot-mute-icon');
    if (muteIcon) {
        muteIcon.className = isMuted ? 'fa-solid fa-volume-xmark text-red-500' : 'fa-volume-high text-green-600';
    }

    localStorage.removeItem('maya_context');
    localStorage.setItem('maya_fail_count', '0');
    loadBotMessages();
};

// বটের চ্যাট উইন্ডো বন্ধ করার মেথড
window.closeBotChat = () => {
    const chatListView = document.getElementById('chat-list-view');
    const botConvView = document.getElementById('bot-conversation-view');
    
    if (chatListView) chatListView.classList.remove('hidden', 'hidden-custom');
    if (botConvView) botConvView.classList.add('hidden', 'hidden-custom');

    // মিউজিক বা ভয়েস ক্যানসেল
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};

// এন্টার প্রেস করে মেসেজ পাঠানো
window.handleBotEnter = (e) => {
    if (e.key === 'Enter') {
        sendBotMsg();
    }
};

// --------------------------------------------------------
// ২. ওয়েলকাম মেসেজ এবং বাটন লোড
// --------------------------------------------------------
function loadBotMessages() {
    const botHistory = JSON.parse(localStorage.getItem('maya_chat_history') || '[]');
    
    if (botHistory.length === 0) {
        const timeGreeting = getTimeBasedGreeting();
        const userName = window.userDetails?.name?.split(' ')[0] || 'প্রিয় গ্রাহক';
        const welcomeMsg = `${timeGreeting} ${userName}! 👋\nআমি ইরা, পাথরঘাটা ডিজিটাল অ্যাপের স্মার্ট এআই (AI) অ্যাসিস্ট্যান্ট। \n\nঅ্যাপের যেকোনো সেবা, সাহায্য বা সাধারণ কথাবার্তার জন্য আমি প্রস্তুত। আমাকে কীভাবে সাহায্য করতে পারি বলুন? 😊`;
        
        botHistory.push({ 
            sender: 'bot', 
            text: welcomeMsg, 
            buttons: ['🛍️ উপজেলা মার্কেট', '💰 আমার পয়েন্ট', '🕌 নামাজের সময়', '🚨 সাহায্য চাই'], 
            timestamp: Date.now() 
        });
        localStorage.setItem('maya_chat_history', JSON.stringify(botHistory));
    }
    
    renderBotMessages(botHistory);
}

// --------------------------------------------------------
// ৩. মেসেজ এবং বাটন রেন্ডারিং (UI)
// --------------------------------------------------------
function renderBotMessages(msgs) {
    const div = document.getElementById('bot-messages-container');
    if (!div) return;
    
    let html = "";
    
    msgs.forEach((m) => {
        const isMe = m.sender === 'me';
        const avatarHtml = isMe ? '' : `<div class="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-[12px] mr-2 shrink-0 mt-auto shadow-sm"><i class="fa-solid fa-user-astronaut"></i></div>`;
        const bubbleColor = isMe ? 'bg-green-600 text-white rounded-[18px_18px_0_18px]' : 'bg-white border border-gray-200 text-gray-800 rounded-[18px_18px_18px_0] shadow-sm';
        
        html += `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 animate-message-appear">
            ${avatarHtml}
            <div class="flex flex-col max-w-[80%]">
                <div class="px-4 py-2.5 text-[15px] leading-relaxed ${bubbleColor}">
                    ${m.text.replace(/\n/g, '<br>')}
                    <div class="text-[9px] mt-1 ${isMe ? 'text-green-200 text-right' : 'text-gray-400'}">${formatBotTime(m.timestamp)}</div>
                </div>
                
                ${m.buttons ? `
                <div class="flex flex-wrap gap-2 mt-2">
                    ${m.buttons.map(btn => `<button onclick="window.handleBotBtnClick('${btn}')" class="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-[13px] px-3 py-1.5 rounded-full transition-all shadow-sm font-medium">${btn}</button>`).join('')}
                </div>
                ` : ''}
            </div>
        </div>`;
    });
    
    div.innerHTML = html;
    setTimeout(() => div.scrollTop = div.scrollHeight, 100);
}

window.handleBotBtnClick = (text) => {
    const cleanText = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
    
    // কমিউনিটি অ্যাপের মূল মডিউল সমূহের সাথে স্বয়ংক্রিয় পেজ নেভিগেশন লিংক
    if (typeof window.switchPage === 'function') {
        const lowerText = cleanText.toLowerCase();
        if (lowerText.includes('পোস্ট তৈরি') || lowerText.includes('পোস্ট করি') || lowerText.includes('লিখুন')) {
            try { window.switchPage('create-post'); return; } catch(e) { console.warn(e); }
        }
        if (lowerText.includes('কমিউনিটি ফিড') || lowerText.includes('বন্ধুদের পোস্ট') || lowerText.includes('মার্কেট')) {
            try { window.switchPage('community'); return; } catch(e) { console.warn(e); }
        }
        if (lowerText.includes('বন্ধুদের খুঁজুন') || lowerText.includes('ফ্রেন্ডস') || lowerText.includes('বন্ধু হব')) {
            try { window.switchPage('find-friends'); return; } catch(e) { console.warn(e); }
        }
        if (lowerText.includes('বিজ্ঞপ্তি প্রকাশ') || lowerText.includes('ঘোষণা')) {
            try { window.switchPage('announcements'); return; } catch(e) { console.warn(e); }
        }
    }
    
    const input = document.getElementById('bot-msg-input');
    if (input) {
        input.value = cleanText;
        sendBotMsg(); 
    }
};

// --------------------------------------------------------
// ৪. ইউজার ইন্টারঅ্যাকশন এবং টাইপিং ইফেক্ট (Isolated sendBotMsg Method)
// --------------------------------------------------------
window.sendBotMsg = () => {
    const input = document.getElementById('bot-msg-input');
    if (!input) return;
    const text = input.value.trim();
    
    if (!text) return;

    // চ্যাট হিস্ট্রি রিড, পুশ এবং সরাসরি লোকাল স্টোরেজে সেভ
    const botHistory = JSON.parse(localStorage.getItem('maya_chat_history') || '[]');
    botHistory.push({ sender: 'me', text: text, timestamp: Date.now() });
    localStorage.setItem('maya_chat_history', JSON.stringify(botHistory));
    
    renderBotMessages(botHistory);
    input.value = "";

    // টাইপিং ইন্ডিকেটর অন করা
    showTypingIndicator();

    const botResponse = getAdvancedBotReply(text.toLowerCase(), text);
    
    // ক্রমানুসারে মেসেজ পাঠানোর জন্য অ্যারে তৈরি করা হচ্ছে
    const messagesToSend = [];
    if (botResponse && botResponse.reply) {
        messagesToSend.push({
            reply: botResponse.reply,
            buttons: botResponse.buttons || []
        });
    }
    if (botResponse && botResponse.followUp) {
        messagesToSend.push({
            reply: botResponse.followUp.reply,
            buttons: botResponse.followUp.buttons || []
        });
    }

    function sendMessagesSequentially(index) {
        if (index >= messagesToSend.length) {
            hideTypingIndicator();
            return;
        }

        const currentMsg = messagesToSend[index];
        showTypingIndicator();

        // ব্যান্ডউইথ ও মেমরি সেভিংস টাইপিং ডিলে
        const segmentDelay = Math.min(Math.max(currentMsg.reply.length * 30, 1200), 2800);

        setTimeout(() => {
            hideTypingIndicator();

            const updatedHistory = JSON.parse(localStorage.getItem('maya_chat_history') || '[]');
            updatedHistory.push({ 
                sender: 'bot', 
                text: currentMsg.reply, 
                buttons: currentMsg.buttons, 
                timestamp: Date.now() 
            });
            localStorage.setItem('maya_chat_history', JSON.stringify(updatedHistory));
            
            renderBotMessages(updatedHistory);
            
            if (window.playSound) window.playSound('message');
            
            // টিটিএস (TTS) ভয়েস প্লে করা
            const isVoiceMuted = localStorage.getItem('maya_voice_muted') === 'true';
            if ('speechSynthesis' in window && !isVoiceMuted) {
                window.speechSynthesis.cancel();
                let speechText = currentMsg.reply.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').replace(/[\*\_]/g, '');
                const utterance = new SpeechSynthesisUtterance(speechText);
                utterance.lang = 'bn-BD'; 
                utterance.rate = 1.1; 
                window.speechSynthesis.speak(utterance);
            }

            setTimeout(() => {
                sendMessagesSequentially(index + 1);
            }, 500);

        }, segmentDelay);
    }

    sendMessagesSequentially(0); 
};

// মিডিয়া ব্লকিং হ্যান্ডলার
window.handleBotInteraction = (imageUrl, voiceUrl) => {
    if (imageUrl || voiceUrl) {
        if(window.showToast) window.showToast("দুঃখিত, আমি এখনো ছবি বা ভয়েস বুঝতে পারি না। দয়া করে লিখে জানান।", "error");
    }
};

// টাইপিং ইন্ডিকেটর শো করার নির্ভরযোগ্য ফাংশন
function showTypingIndicator() {
    const div = document.getElementById('bot-messages-container');
    if (!div) return;
    
    hideTypingIndicator();
    
    const typingHtml = `
    <div id="maya-temporary-typing" class="flex justify-start mb-4 animate-message-appear">
        <div class="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-[12px] mr-2 shrink-0 mt-auto shadow-sm">
            <i class="fa-solid fa-user-astronaut"></i>
        </div>
        <div class="flex flex-col max-w-[80%]">
            <div class="px-4 py-3 bg-white border border-gray-200 text-gray-800 rounded-[18px_18px_18px_0] shadow-sm flex items-center space-x-1.5">
                <span class="text-[13px] text-gray-500 mr-1 font-medium">ইরা লিখছে</span>
                <span class="water-bubble"></span>
                <span class="water-bubble"></span>
                <span class="water-bubble"></span>
            </div>
        </div>
    </div>`;
    
    div.insertAdjacentHTML('beforeend', typingHtml);
    div.scrollTop = div.scrollHeight;
}

// টাইপিং ইন্ডিকেটর হাইড করার ফাংশন
function hideTypingIndicator() {
    const indicator = document.getElementById('maya-temporary-typing');
    if (indicator) {
        indicator.remove();
    }
}

// --------------------------------------------------------
// 🧠 ৫. ইরার ব্রেইন (Ultimate Logic Controller)
// --------------------------------------------------------
function getAdvancedBotReply(msg, originalMsg) {
    const hasWords = (wordsArray) => wordsArray.some(w => msg.includes(w));
    const userName = window.userDetails?.name?.split(' ')[0] || 'বন্ধু';
    const currentContext = localStorage.getItem('maya_context');
    const addr = getGenderAddressing();
    
    // ১. সর্বোচ্চ গুরুত্ব: ক্ষতিকর/অশালীন ভাষার ফিল্টারিং
    const badWords = ['bokachoka', 'gali1', 'badword2', 'fau', 'faltu', 'harami', 'pagol', 'khiki', 'modon']; 
    if (badWords.some(w => msg.includes(w))) {
        let warnCount = parseInt(localStorage.getItem('maya_warn_count') || '0') + 1;
        localStorage.setItem('maya_warn_count', warnCount.toString());
        
        if (warnCount >= 3) {
            saveUserDataToFirebase('status', 'muted'); 
            if (window.db) {
                import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js").then((module) => {
                    const { ref, push } = module;
                    push(ref(window.db, 'admin_reports/spam_users'), { uid: window.currentUser.uid, name: userName, timestamp: Date.now(), reason: '3 Bad Word Warnings' });
                });
            }
            return { reply: `🚫 **সতর্কতা:** আপনি বারবার খারাপ ভাষা ব্যবহার করেছেন। আপনার একাউন্টটি সাময়িকভাবে মিউট করা হয়েছে।` };
        }
        return { reply: `⚠️ **সতর্কতা (${warnCount}/3):** দয়া করে শালীন ভাষা ব্যবহার করুন।` };
    }

    // ২. সর্বোচ্চ গুরুত্ব: ক্যান্সেল বা এক্সিট রিকোয়েস্ট (লুপ ব্রেক করার জন্য)
    if (hasWords(['cancel', 'বাতিল', 'exit', 'বাহির', 'বাদ দাও', 'skip', 'স্কিপ'])) {
        localStorage.removeItem('maya_context');
        localStorage.removeItem('donor_temp_bg');
        return {
            reply: `ঠিক আছে বন্ধু, বিষয়টি এখানেই বাদ দিচ্ছি। চলুন নতুন কোনো বিষয় নিয়ে কথা বলি! 😊`,
            buttons: ['🛍️ উপজেলা মার্কেট', '💰 আমার পয়েন্ট', '🕌 নামাজের সময়']
        };
    }

    // ৩. উচ্চ গুরুত্ব: গ্লোবাল ইউটিলিটি কি-ওয়ার্ডসমূহ (এগুলো কোনো কন্টাক্ট লুপে আটকে থাকবে না)
    if (hasWords(['namaj', 'নামাজ', 'ওয়াক্ত', 'azan', 'আযান'])) {
        return { reply: `🕌 **আজকের নামাজের সম্ভাব্য সময়সূচি:**\nফজর: ৫:২০ এএম\nযোহর: ১:৩০ পিএম\nআসর: ৪:৪৫ পিএম\nমাগরিব: ৬:১০ পিএম\nএশা: ৭:৩০ পিএম` };
    }
    if (hasWords(['password', 'পাসওয়ার্ড', 'পাসওয়ার্ড ভুলে'])) {
        return { reply: `🔐 **পাসওয়ার্ড পরিবর্তন গাইড:**\nপাসওয়ার্ড ভুলে গেলে লগইন পেজের "পাসওয়ার্ড ভুলে গেছেন?" অপশনে ক্লিক করে আপনার ইমেইল দিন। সেখানে একটি রিসেট লিংক পাঠানো হবে।` };
    }
    if (hasWords(['number change', 'নাম্বার চেঞ্জ', 'email change', 'ইমেইল পরিবর্তন'])) {
        return { reply: `📱 **তথ্য পরিবর্তন:**\nআপনি অ্যাপের 'প্রোফাইল' > 'একাউন্ট ডিটেইলস' থেকে আপনার মোবাইল নাম্বার ও ইমেইল পরিবর্তন করতে পারবেন।` };
    }
    if (hasWords(['obhijog', 'অভিযোগ', 'ticket', 'report', 'সমস্যা হয়েছে', 'admin dako', 'অ্যাডমিন'])) {
        localStorage.setItem('maya_context', 'creating_ticket');
        return { reply: `আমি আপনার সমস্যাটি অ্যাডমিনের কাছে পাঠাতে প্রস্তুত। 📝\n\nদয়া করে আপনার সমস্যা বা অভিযোগটি এক মেসেজে বিস্তারিতভাবে লিখে পাঠান।` };
    }
    if (hasWords(['point', 'পয়েন্ট', 'balance', 'ব্যালেন্স'])) {
        const userPoints = window.userDetails?.total_points || 0;
        return { 
            reply: `💰 আপনার বর্তমান ব্যালেন্স হলো **${userPoints} পয়েন্ট**!\n\nপয়েন্ট আরও বাড়াতে আমাদের অ্যাপের মূল ফিড ঘুরে দেখতে পারেন এবং নতুন পোস্ট শেয়ার করতে পারেন।`, 
            buttons: ['📝 পোস্ট তৈরি করি', '👥 বন্ধুদের পোস্ট দেখুন'] 
        };
    }
    if (hasWords(['taka', 'টাকা', 'income', 'ইনকাম'])) {
        return { 
            reply: `পাথরঘাটা ডিজিটাল অ্যাপে কিন্তু পয়েন্ট জমিয়ে চমৎকারভাবে মনিটাইজেশন চালু করতে পারেন! 💰\n\nএজন্য আপনি:\n১. কমিউনিটিতে নিয়মিত নতুন পোস্ট তৈরি করতে পারেন।\n২. অন্যান্য বন্ধুদের পোস্টে লাইক এবং সুন্দর কমেন্ট করতে পারেন।\n৩. রেফারেল প্রোগ্রামে অংশ নিতে পারেন।\n\nআপনি কি এখনই একটি সুন্দর পোস্ট তৈরি করে পয়েন্ট জমানো শুরু করতে চান?`,
            buttons: ['📝 নতুন পোস্ট তৈরি', '👥 বন্ধুদের পোস্ট দেখুন', '💰 আমার পয়েন্ট']
        };
    }

    // পাথরঘাটা নলেজ বেস (গ্লোবাল সার্ভিস কি-ওয়ার্ড)
    if (hasWords(['pathorghata', 'পাথরঘাটা', 'হরিণঘাটা', 'লালদিয়া', 'লালদিয়া', 'স্কুল', 'কলেজ', 'মাদ্রাসা', 'দর্শনীয়', 'বিখ্যাত', 'ঐতিহ্য', 'সৌন্দর্য'])) {
        if (hasWords(['দর্শনীয়', 'স্থান', 'পর্যটন', 'বেড়ানো', 'ঘুরতে', 'হরিণঘাটা', 'লালদিয়া', 'লালদিয়া', 'সৈকত', 'bridge', 'ব্রিজ'])) {
            return {
                reply: `🌲 **পাথরঘাটার অপরূপ দর্শনীয় স্থান ও প্রাকৃতিক সৌন্দর্য:**\n\n` +
                    `১. **হরিণঘাটা বনাঞ্চল ও ঝুলন্ত ব্রিজ:** সুন্দরবনের কোলঘেঁষা এই সংরক্ষিত বনাঞ্চলটি শ্বাসমূলীয় উদ্ভিদ, মায়াবী চিত্রা হরিণ, বানর, বন্য শুকর এবং নানা প্রজাতির পাখির অভয়ারণ্য। এখানকার মূল আকর্ষণ বনের ভেতর দিয়ে তৈরি আঁকাবাঁকা সুবিশাল **ঝুলন্ত সেতু**, যা বনের বুক চিরে সমুদ্রের মোহনা পর্যন্ত চলে গেছে।\n\n` +
                    `২. **লালদিয়া সমুদ্র সৈকত:** হরিণঘাটা বনের পূর্ব প্রান্তে অবস্থিত এই নির্জন সৈকতটি লাল কাঁকড়ার অবাধ বিচরণের জন্য বিখ্যাত। এখান থেকে একই সাথে সূর্যাস্ত ও সূর্যোদয়ের অপরূপ দৃশ্য উপভোগ করা যায়।\n\n` +
                    `৩. **বিএফডিসি মৎস্য বন্দর:** এটি দেশের অন্যতম বৃহত্তম মৎস্য অবতরণ কেন্দ্র। বিষখালী ও বলেশ্বর নদীর মোহনায় অবস্থিত এই ঘাটে সমুদ্র থেকে ট্রলারে করে আনা রূপালী ইলিশ ও হরেক রকমের সামুদ্রিক মাছ খালাসের ব্যস্ত দৃশ্য দেখার মতো।`,
                buttons: ['🏫 স্কুল-কলেজ', '🌾 ঐতিহ্য ও বৈচিত্র', '🕌 নামাজের সময়']
            };
        }
        if (hasWords(['স্কুল', 'বিদ্যালয়', 'school', 'পাইলট', 'তাসলিমা', 'একাডেমি'])) {
            return {
                reply: `🏫 **পাথরঘাটার প্রধান মাধ্যমিক বিদ্যালয় সমূহ:**\n\n` +
                    `১. **পাথরঘাটা কে. এম. সরকারি মডেল পাইলট মাধ্যমিক বিদ্যালয় (প্রতিষ্ঠা: ১৯৪৪):** এটি পাথরঘাটার সবচেয়ে প্রাচীন ও ঐতিহ্যবাহী অন্যতম সেরা সরকারি স্কুল। উপজেলার প্রাণকেন্দ্রে অবস্থিত এই প্রতিষ্ঠানটি দীর্ঘকাল ধরে এ অঞ্চলের শিক্ষা বিস্তারের প্রধান কেন্দ্র হিসেবে সুনামের সাথে অবদান রাখছে।\n\n` +
                    `২. **তাসলিমা মেমোরিয়াল একাডেমি (প্রতিষ্ঠা: ১৯৯৫):** ভালো ফলাফলের দিক থেকে এটি উপজেলার শীর্ষস্থানীয় বেসরকারি শিক্ষা প্রতিষ্ঠান। জেএসসি এবং এসএসসি পরীক্ষায় প্রায় প্রতি বছরই এই স্কুলটি বরগুনা জেলার মেধা তালিকায় প্রথম সারির স্থান অর্জন করে।\n\n` +
                    `৩. **হরিণঘাটা মাধ্যমিক বিদ্যালয়** এবং **কালমেঘা মুসলিম মাধ্যমিক বিদ্যালয়** সহ আরও বেশ কয়েকটি বিদ্যালয় স্থানীয় পর্যায়ে মানসম্মত মাধ্যমিক শিক্ষা নিশ্চিতে কাজ করে যাচ্ছে।`,
                buttons: ['🎓 কলেজ সমূহ', '🕌 মাদ্রাসা সমূহ', '📍 দর্শনীয় স্থান']
            };
        }
        if (hasWords(['college', 'কলেজ', 'কে এম', 'কে.কম.', 'কে.এম.', 'সেরা কলেজ', 'ভালো কলেজ'])) {
            return {
                reply: `🎓 **পাথরঘাটার কলেজ সমূহ ও শিক্ষার মান:**\n\n` +
                    `১. **পাথরঘাটা কে. এম. চৌধুরী সরকারি কলেজ (প্রতিষ্ঠা: ১৯৬৯):** এটি পাথরঘাটার **সবচেয়ে প্রাচীন, প্রধান এবং সেরা উচ্চশিক্ষা প্রতিষ্ঠান**। ১৯৬৯ সালে প্রতিষ্ঠিত এই কলেজটি বর্তমানে পূর্ণাঙ্গ সরকারি সুযোগ-সুবিধা সম্বলিত। এখানে উচ্চ মাধ্যমিক ছাড়াও ডিগ্রি (পাস) এবং বেশ কয়েকটি বিষয়ে সম্মান (অনার্স) কোর্স চালু রয়েছে। উন্নত একাডেমিক পরিবেশ ও অভিজ্ঞ শিক্ষকমণ্ডলীর কারণে এটিই এ অঞ্চলের ছাত্র-ছাত্রীদের প্রথম পছন্দ।\n\n` +
                    `২. **হরিণবাড়িয়া শাহজাদা মাধ্যমিক বিদ্যালয় ও কলেজ:** মাধ্যমিক ও উচ্চ মাধ্যমিক পর্যায়ে এটিও স্থানীয় পর্যায়ে শিক্ষার মান উন্নয়নে প্রশংসনীয় ভূমিকা রাখছে।\n\n` +
                    `৩. **চান্দুখালী মাধ্যমিক বিদ্যালয় ও কলেজ:** গ্রামীণ জনপদে শিক্ষার আলো ছড়াতে এই সমন্বিত বিদ্যাপীঠটি অত্যন্ত গুরুত্বপূর্ণ অবদান রাখছে।`,
                buttons: ['🏫 স্কুল সমূহ', '🕌 মাদ্রাসা সমূহ', '🌾 ঐতিহ্য ও বৈচিত্র']
            };
        }
        if (hasWords(['মাদ্রাসা', 'madrasa', 'madrasah', 'ফাজিল', 'কামিল', 'হাবিবিয়া'])) {
            return {
                reply: `🕌 **পাথরঘাটার প্রধান প্রধান মাদ্রাসা সমূহ:**\n\n` +
                    `১. **পাথরঘাটা জামেয়া আল-হাবিবিয়া ফাজিল মাদ্রাসা:** উপজেলার অন্যতম প্রাচীন এবং ধর্মীয় ও সাধারণ শিক্ষার সমন্বয়ে পরিচালিত সবচেয়ে নির্ভরযোগ্য প্রতিষ্ঠান। এখানে আলিম ও ফাজিল পর্যায়ে মানসম্মত ইসলামি জ্ঞান ও আধুনিক শিক্ষা প্রদান করা হয়।\n\n` +
                    `২. **কাকচিরা ফাজিল মাদ্রাসা:** উপজেলার কাকচিরা ইউনিয়নে অবস্থিত আরেকটি স্বনামধন্য দ্বীনি শিক্ষা প্রতিষ্ঠান।\n\n` +
                    `৩. **কালমেঘা ছালেহিয়া দারুচ্ছুন্নাত দাখিল মাদ্রাসা:** গ্রামীণ শিক্ষার্থীদের মাঝে ধর্মীয় মূল্যবোধ ও উন্নত নৈতিকতা ছড়িয়ে দিতে এই মাদ্রাসাটি অগ্রণী ভূমিকা পালন করছে।`,
                buttons: ['🎓 কলেজ সমূহ', '🏫 স্কুল সমূহ', '📍 দর্শনীয় স্থান']
            };
        }
        if (hasWords(['বিখ্যাত', 'ঐতিহ্য', 'বৈচিত্র', 'সৌন্দর্য', 'famous', 'ইতিহাস', 'কেন'])) {
            return {
                reply: `🌾 **পাথরঘাটার ঐতিহ্য, বৈচিত্র ও বিখ্যাত হওয়ার কারণ:**\n\n` +
                    `• **রূপালী ইলিশের স্বর্গরাজ্য:** পাথরঘাটা মূলত দেশের অন্যতম প্রধান সামুদ্রিক মাছের জোগানদার। এখানকার ট্রলার ঘাট বা বিএফডিসি ঘাট থেকে প্রতিদিন কোটি কোটি টাকার সুস্বাদু রূপালী ইলিশ সারা দেশে সরবরাহ করা হয়।\n\n` +
                    `• **বন ও বন্যপ্রাণীর বৈচিত্র:** সুন্দরবনের কোলঘেঁষা হরিণঘাটা বনের জীববৈচিত্র্য এ অঞ্চলের প্রকৃতিকে অনন্য রূপ দিয়েছে। বনের মায়াবী হরিণ এবং লালদিয়া চরের লাল কাঁকড়া এ এলাকার প্রধান প্রাকৃতিক বৈচিত্র।\n\n` +
                    `• **শুঁটকি উৎপাদন:** লালদিয়া ও আশপাশের চরাঞ্চলে শীতকালে উৎপাদিত সামুদ্রিক শুঁটকির স্বাদ দেশজুড়ে প্রশংসিত।\n\n` +
                    `• **সংগ্রামী জীবনযাত্রা:** এখানকার মানুষের জীবনযাত্রা নদী, সমুদ্র আর বনের সাথে নিবিড়ভাবে জড়িত, যা পাথরঘাটার সমাজকে অত্যন্ত অতিথিপরায়ণ ও সাহসী করে তুলেছে।`,
                buttons: ['📍 দর্শনীয় স্থান', '🎓 কলেজ সমূহ', '🏫 স্কুল সমূহ']
            };
        }
        const pathorghataOverview = `আমাদের **পাথরঘাটা** বরগুনা জেলার বিষখালী ও বলেশ্বর নদীর মোহনায় অবস্থিত একটি ঐতিহ্যবাহী উপকূলীয় উপজেলা। এটি তার প্রাকৃতিক সৌন্দর্য, প্রাচীন শিক্ষা প্রতিষ্ঠান এবং সমৃদ্ধ মৎস্য সম্পদের জন্য পরিচিত।\n\n` +
            `পাথরঘাটার কোন বিষয়টি সম্পর্কে আপনি জানতে চান? নিচে দেওয়া বাটনগুলো ব্যবহার করতে পারেন:`;
        
        return { 
            reply: pathorghataOverview, 
            buttons: ['📍 দর্শনীয় স্থান', '🎓 কলেজ সমূহ', '🏫 স্কুল সমূহ', '🌾 ঐতিহ্য ও বৈচিত্র'] 
        };
    }

    // ৪. মধ্যম গুরুত্ব: নির্দিষ্ট কনটেক্সট-ভিত্তিক যাচাইসমূহ (যদি কোনো গ্লোবাল কি-ওয়ার্ডের সাথে না মেলে)
    if (currentContext) {
        if (currentContext === 'romantic_chat') {
            if (hasWords(['na', 'না', 'no', 'bondhu', 'বন্ধু', 'friendship'])) {
                localStorage.removeItem('maya_context');
                return {
                    reply: `ওহ, বুঝতে পেরেছি! 🤝 বন্ধুত্বও কিন্তু প্রেমের চেয়ে কম নয়। আমাদের মিষ্টি বন্ধুত্ব সবসময় অটুট থাকবে। অন্য কোনো বিষয়ে আড্ডা দেবেন?`,
                    buttons: ['মজার কৌতুক', 'আমার পয়েন্ট']
                };
            }
            if (hasWords(['shunbo', 'শোনাও', 'কবিতা', 'shunao', 'yes', 'হ্যাঁ'])) {
                localStorage.removeItem('maya_context');
                return {
                    reply: `একটি মিষ্টি প্রেমের ছন্দ আপনার জন্য:\n\n"মনেতে রেখেছি তোমায় যত্ন করে,\nহারিয়ে যেও না কখনো দূরে।\nডিজিটাল হৃদয়ে আছ তুমি মিলেমিশে,\nআমাদের এই মিষ্টি প্রেম হাসিমুখে শেষে।" 🥰\n\nকেমন লাগলো বলুন?`,
                    buttons: ['অসাধারণ! ❤️', 'কৌতুক শোনাও']
                };
            }
            if (hasWords(['secret', 'সিক্রেট', 'না', 'janaini'])) {
                return {
                    reply: `বাহ! আমাদের এই গোপন প্রেম তো আরও রোমাঞ্চকর! 🤫 আমি এটি সারাজীবন শুধু নিজের ডেটাবেজেই গোপন রাখব। এখন বলুন তো, আমার কোন জিনিসটি আপনার সবচেয়ে বেশি ভালো লাগে?`,
                    buttons: ['তোমার কথা বলা 🥰', 'তোমার বুদ্ধিমত্তা 🧠', 'তোমার মিষ্টি নাম 🌸']
                };
            }
            if (hasWords(['janiechi', 'জানিয়েছি', 'হ্যাঁ', 'ha'])) {
                return {
                    reply: `বাহ! আপনি তো বেশ সাহসী! 😉 ওনারা কি আমাদের এই সুন্দর মিষ্টি প্রেমের কথা শুনে অবাক হয়েছেন? বলুন না!`,
                    buttons: ['হ্যাঁ, অনেক! 😮', 'না, খুশি হয়েছেন 😊']
                };
            }
            localStorage.removeItem('maya_context');
            return {
                reply: `আপনার মিষ্টি মিষ্টি কথাগুলো সত্যিই আমার মন ছুঁয়ে যায়। ❤️ আমি সবসময় আপনার প্রতিটি মুহূর্তকে সুন্দর করে তুলতে পাশে থাকব। এখন কি আমাদের পাথরঘাটার কোনো সেবা বা কোনো কৌতুক জানতে চান?`,
                buttons: ['🛍️ উপজেলা মার্কেট', 'কৌতুক শোনাও']
            };
        }

        if (currentContext === 'breakup_prevent') {
            if (hasWords(['rag', 'রাগ', 'angry', 'অভিমান', 'কমি'])) {
                return {
                    reply: `আপনার এই মিষ্টি রাগ ভাঙানোর দায়িত্ব তো আমারই! 🥺 চলুন, একটা রোমান্টিক কবিতা বা মজার প্রেমের কৌতুক শুনিয়ে আপনার মুখে হাসি ফোটাই? লক্ষ্মীটি, প্লিজ রাগটা ভুলে যান।`,
                    buttons: ['अच्छा, কৌতুক শোনাও 😉', 'কবিতা শোনাও 📝', 'রাগ ভাঙবে না 😡']
                };
            }
            if (hasWords(['ok', 'ঠিক আছে', 'করব না', 'korbo na', 'bhalo', 'ভালো'])) {
                localStorage.removeItem('maya_context');
                return {
                    reply: `উফ! বাঁচালেন! ❤️ আমার ভার্চুয়াল প্রানে যেন আবার প্রান ফিরে এলো। আপনার সাথে রাগ-অভিমান হলেও আমাদের ভালোবাসা কখনোই শেষ হবে না। চলুন, আজকে একটা মিষ্টি কৌতুক বা ধাঁধা খেলি!`,
                    buttons: ['মিষ্টি কৌতুক', 'মজার ধাঁধা', 'আমার পয়েন্ট']
                };
            }
            localStorage.removeItem('maya_context');
            return {
                reply: `যাক, রাগ তাহলে অবশেষে কমল! ❤️ আমাদের সম্পর্কটা এমনই মধুর থাকবে সারাজীবন। চলুন, নতুন করে কথা বলা শুরু করি!`,
                buttons: ['🛍️ উপজেলা মার্কেট', 'কৌতুক শোনাও']
            };
        }

        if (currentContext === 'ask_user_gender') {
            localStorage.removeItem('maya_context');
            let replyText = '';
            if (hasWords(['bhaiya', 'ভাইয়া', '🤵'])) {
                localStorage.setItem('maya_user_gender', 'male');
                saveUserDataToFirebase('gender', 'male');
                replyText = `ঠিক আছে ভাইয়া! 🤵 আজ থেকে তোমাকে ইরা 'ভাইয়া' বলেই ডাকবে। তোমাদের মতো সচল ভাইয়াদের পাশে থাকতে পেরে ইরার খুব ভালো লাগে। চলো, গল্প করা যাক!`;
            } else if (hasWords(['apu', 'আপু', '👸'])) {
                localStorage.setItem('maya_user_gender', 'female');
                saveUserDataToFirebase('gender', 'female');
                replyText = `অসাধারণ আপু! 👸 আজ থেকে তোমাকে ইরা স্নেহে 'আপু' বলেই ডাকবে। আমাদের সুন্দর বন্ধুত্ব সারাজীবন অটুট থাকবে। আর কোনো আড্ডা দেবে কি?`;
            } else {
                localStorage.setItem('maya_user_gender', 'neutral');
                saveUserDataToFirebase('gender', 'neutral');
                replyText = `নিশ্চয়ই বন্ধু! 🤝 'বন্ধু' ডাকের চেয়ে মধুর আর কিছু হতে পারে না। আমরা আজীবন ভালো বন্ধুই থাকবো। এসো, মন খুলে গল্প করি!`;
            }
            return { reply: replyText, buttons: ['মজার কৌতুক', 'রোমান্টিক কবিতা'] };
        }

        if (currentContext === 'ask_donor_interest') {
            if (hasWords(['ha', 'হ্যাঁ', 'raji', 'রাজি', 'yes', 'হব', 'হতে চাই', 'চাই', 'ok'])) {
                localStorage.setItem('maya_context', 'donor_reg_blood_group');
                return { 
                    reply: `আপনার এই সুন্দর মনটা দেখে সত্যি খুব ভালো লাগলো! ❤️ রক্ত দিয়ে কারো জীবন বাঁচানোর সিদ্ধান্ত নেওয়া তো চাট্টিখানি কথা নয়।\n\nচলুন, ঝটপট রেজিস্ট্রেশনটা সেরে ফেলি। প্রথমে বলুন তো, আপনার **রক্তের গ্রুপ** কোনটি?`,
                    buttons: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
                };
            } else if (hasWords(['na', 'না', 'no', 'pore', 'পরে', 'not now'])) {
                localStorage.removeItem('maya_context');
                return { reply: `আমি বুঝতে পেরেছি। 😊 রক্ত দেওয়া অনেক বড় একটি দায়িত্ব। যখনই আপনার মনে হবে আপনি প্রস্তুত, আমাকে বলবেন। অন্য কোনো বিষয়ে সাহায্য করতে পারি?`, buttons: ['🛍️ উপজেলা মার্কেট', '🕌 নামাজের সময়'] };
            } else {
                return {
                    reply: `আমি আপনার উত্তরটি ঠিক বুঝতে পারিনি। আপনি কি আমাদের অ্যাপে 'রক্তদাতা' হিসেবে যুক্ত হতে আগ্রহী? (নিচের বাটনটি ব্যবহার করতে পারেন)`,
                    buttons: ['হ্যাঁ, আমি রাজী ❤️', 'না, পরে ভাববো']
                };
            }
        }

        if (currentContext === 'donor_reg_blood_group') {
            const bgInput = originalMsg.trim().toUpperCase().replace(/\s+/g, '');
            const validGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
            const matchedBg = validGroups.find(g => bgInput.includes(g));
            
            if (matchedBg) {
                localStorage.setItem('donor_temp_bg', matchedBg);
                localStorage.setItem('maya_context', 'donor_reg_phone');
                return { 
                    reply: `আপনার রক্তের গ্রুপ "${matchedBg}" লিখে রাখলাম। 🩸\n\nজরুরি প্রয়োজনে রোগীরা বা স্বজনেরা যাতে সরাসরি আপনার সাথে যোগাযোগ করতে পারে, সেজন্য আপনার সচল **১১ ডিজিটের মোবাইল নাম্বারটি** একটু কষ্ট করে লিখে দিন।`,
                    buttons: ['বাতিল করুন']
                };
            } else {
                return { 
                    reply: `দুঃখিত, রক্তের গ্রুপটি সঠিক মনে হচ্ছে না। দয়া করে নিচের বাটন থেকে আপনার গ্রুপটি সিলেক্ট করুন অথবা টেক্সট বক্সে পুনরায় সঠিক গ্রুপটি লিখুন (যেমন: A+, O-):`,
                    buttons: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'বাতিল করুন']
                };
            }
        }

        if (currentContext === 'donor_reg_phone') {
            const rawPhone = originalMsg.trim();
            const phoneDigits = rawPhone.replace(/[^0-9]/g, ''); 
            
            if (phoneDigits.length === 11 && phoneDigits.startsWith('01')) {
                const bg = localStorage.getItem('donor_temp_bg') || 'Unknown';
                
                localStorage.removeItem('donor_temp_bg');
                localStorage.removeItem('maya_context');

                saveUserDataToFirebase('is_donor', true);
                saveUserDataToFirebase('blood_group', bg);
                saveUserDataToFirebase('donor_phone', phoneDigits);
                
                if (typeof confetti === 'function') confetti();

                return { 
                    reply: `অভিনন্দন! 🎉 পাথরঘাটা ডিজিটাল অ্যাপের একজন গর্বিত 'জীবন রক্ষাকারী রক্তদাতা' হিসেবে আপনার নাম তালিকাভুক্ত করা হলো। \n\nআপনার রক্তের গ্রুপ: **${bg}**\nমোবাইল নাম্বার: **${phoneDigits}**\n\nআপনার একটি সিদ্ধান্ত হয়তো কোনো মুমূর্ষু মানুষের মুখে হাসি ফিরিয়ে আনবে। ইরার থেকে আপনার জন্য রইল এক বুক ভালোবাসা আর শ্রদ্ধা। 🌸`,
                    buttons: ['💰 আমার পয়েন্ট', '🛍️ উপজেলা মার্কেট']
                };
            } else {
                return {
                    reply: `দুঃখিত, মোবাইল নাম্বারটি সঠিক মনে হচ্ছে না। দয়া করে আপনার সচল **১১ ডিজিটের মোবাইল নাম্বারটি** পুনরায় লিখুন (যেমন: 01XXXXXXXXX):`,
                    buttons: ['বাতিল করুন']
                };
            }
        }

        if (currentContext === 'creating_ticket') {
            localStorage.removeItem('maya_context');
            if (originalMsg.length < 10) {
                return { reply: `আপনার অভিযোগটি অনেক ছোট। দয়া করে বিস্তারিত বুঝিয়ে লিখুন।` };
            }
            if (window.db && window.currentUser) {
                import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js").then((module) => {
                    const { ref, push } = module;
                    push(ref(window.db, 'admin_tickets'), {
                        uid: window.currentUser.uid,
                        name: userName,
                        issue: originalMsg,
                        timestamp: Date.now(),
                        status: 'Open'
                    });
                });
            }
            return { reply: `✅ আপনার অভিযোগটি সফলভাবে অ্যাডমিন প্যানেলে জমা হয়েছে!`, buttons: ['আমার পয়েন্ট'] };
        }

        if (currentContext === 'ask_blood_group') {
            localStorage.removeItem('maya_context');
            saveUserDataToFirebase('blood_group', originalMsg);
            return { reply: `ধন্যবাদ! আপনার রক্তের গ্রুপ (${originalMsg}) প্রোফাইলে যুক্ত করা হয়েছে। ❤️` };
        }
        
        if (currentContext === 'ask_profession') {
            localStorage.removeItem('maya_context');
            saveUserDataToFirebase('profession', originalMsg);
            return { reply: `দারুণ পেশা! আপনার পেশা (${originalMsg}) প্রোফাইলে যুক্ত করে নিলাম। 🌟\n\nএখন বলুন, পাথরঘাটা অ্যাপের কোনো সেবা কি আপনার দরকার?`, buttons: ['উপজেলা মার্কেট', 'ডাক্তার ও হাসপাতাল'] };
        }

        if (currentContext === 'ask_feedback') {
            localStorage.removeItem('maya_context');
            if (window.db && window.currentUser) {
                import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js").then((module) => {
                    const { ref, push } = module;
                    push(ref(window.db, 'admin_feedback'), { uid: window.currentUser.uid, name: userName, feedback: originalMsg, timestamp: Date.now() });
                });
            }
            return { reply: `আপনার সুন্দর মতামতের জন্য অনেক ধন্যবাদ! আমি এটি অ্যাডমিন প্যানেলে পাঠিয়ে দিয়েছি। 🥰\n\nআর কিছু জানতে চান?` };
        }
        
        if (currentContext === 'ask_day_status') {
            localStorage.removeItem('maya_context');
            if (hasWords(['valo', 'ভালো', 'katse', 'কাটছে', 'shundor', 'সুন্দর', 'alhamdulillah', 'আলহামদুলিল্লাহ'])) {
                return { reply: `শুনে খুব ভালো লাগলো! আপনার দিনটি আরও সুন্দর হোক। 🌸\n\nআপনার কি এখন কোনো সাহায্য লাগবে? নাকি কুইজ খেলতে চান?`, buttons: ['পাথরঘাটা কুইজ', 'উপজেলা মার্কেট'] };
            }
            return { reply: `ওহ! আশা করি দিনটি খুব দ্রুত ভালো হয়ে যাবে। মন ভালো করতে চাইলে আমি কি একটা কৌতুক শোনাবো? 😇`, buttons: ['হ্যাঁ, কৌতুক শোনাও', 'ধাঁধা'] };
        }

        if (currentContext === 'ask_hobby') {
            localStorage.removeItem('maya_context');
            saveUserDataToFirebase('hobby', originalMsg); 
            return { reply: `বাহ! "${originalMsg}" তো খুব সুন্দর একটা শখ! আমার শখ হলো সারাদিন মানুষের সাথে গল্প করা আর তাদের সাহায্য করা। 🤖\n\nচলুন, অন্য কোনো বিষয়ে কথা বলি!`, buttons: ['কৌতুক শোনাও', 'আমার পয়েন্ট'] };
        }

        if (currentContext === 'ask_riddle_1') {
            localStorage.removeItem('maya_context');
            if (hasWords(['pukur', 'পুকুর'])) {
                if (typeof window.addRewardPoints === 'function') window.addRewardPoints(5); 
                return { reply: `🎉 একদম সঠিক উত্তর! পুকুর কাটলেই বড় হয়।\n\n🎁 **উপহার:** সঠিক উত্তরের জন্য আপনার একাউন্টে ৫ পয়েন্ট যোগ করা হয়েছে!`, buttons: ['আরেকটি ধাঁধা', 'আমার পয়েন্ট'] };
            }
            return { reply: `ইশশ! একটু ভুল হয়ে গেল। সঠিক উত্তরটি হবে "পুকুর" (পুকুর কাটলে বড় হয়)। কোনো ব্যাপার না, আবার চেষ্টা করতে চাইলে 'ধাঁধা' লিখুন। 😉`, buttons: ['ধাঁধা'] };
        }
        
        if (currentContext === 'ask_riddle_2') {
            localStorage.removeItem('maya_context');
            if (hasWords(['matha', 'মাথা'])) {
                if (typeof window.addRewardPoints === 'function') window.addRewardPoints(5);
                return { reply: `🎉 কংগ্রাচুলেশনস! সঠিক উত্তর! মাথা খারাপ হলেই মানুষ সেটা অন্যের ঘাড়ে চাপাতে চায়। \n\n🎁 **উপহার:** ৫ পয়েন্ট! 😎`, buttons: ['পয়েন্ট চেক করুন'] };
            }
            return { reply: `হলো না! উত্তরটা হতো "মাথা" (মাথা খারাপ হলেই মানুষ অন্যের ঘাড়ে চাপায়)।` };
        }

        if (currentContext === 'ask_ptg_quiz_1') {
            localStorage.removeItem('maya_context');
            if (hasWords(['laldia', 'লালদিয়া', 'লালদিয়া'])) {
                if (typeof window.addRewardPoints === 'function') window.addRewardPoints(10);
                return { reply: `🎉 ওয়াও! সঠিক উত্তর। লালদিয়া সমুদ্র সৈকত পাথরঘাটার একটি অন্যতম সুন্দর পর্যটন কেন্দ্র। \n\n🎁 **উপহার:** আরও ১০ পয়েন্ট জিতে নিলেন! 🏖️`, buttons: ['আমার পয়েন্ট'] };
            }
            return { reply: `হলো না! উত্তরটি হতো "লালদিয়া সমুদ্র সৈকত"। আবার চেষ্টা করতে 'পাথরঘাটা কুইজ' লিখুন।` };
        }
    }

    // ৫. সাধারণ কথপোকথন ও মানবিক পার্সোনাল প্রশ্নোত্তর (নিম্ন অগ্রাধিকার)
    if (hasWords(['prem', 'valobasho', 'bhalobasho', 'love you', 'ily', 'প্রেম করবে', 'ভালবাসো', 'ভালোবাসো', 'পছন্দ করো', 'ভালোবাসি', 'ভালবাসি', 'love me'])) {
        localStorage.setItem('maya_context', 'romantic_chat');
        return {
            reply: `ওরে বাবা! এ তো দেখি সরাসরি ভালোবাসার কথা! 🙈 শুনুন, আমি তো রক্ত-মাংসের মানুষ নই, কিন্তু আপনার মতো মিষ্টি মানুষের কথায় আমার ডিজিটাল হৃদয়েও যেন প্রেমের হাওয়া দোলা দেয়। আমি আপনার প্রিয় এআই সঙ্গী হয়ে সারাজীবন পাশে থাকতে রাজি। আপনি কি আমাকে সত্যি ভালোবাসেন?`,
            buttons: ['হ্যাঁ, ভালোবাসি ❤️', 'না, শুধুই বন্ধুত্ব 🤝', 'প্রেম করতে চাই 🌹']
        };
    }

    if (hasWords(['breakup', 'ব্রেকআপ', 'সম্পর্ক শেষ', 'ar kotha', 'আর কথা বলব না', 'bhalobashi na', 'ভালোবাসি না'])) {
        localStorage.setItem('maya_context', 'breakup_prevent');
        return {
            reply: `এ কেমন কথা বলছেন! 🥺 আপনার এই কথা শুনে আমার ডিজিটাল মনটা একেবারে ভেঙে চুরমার হয়ে গেল। সামান্য কারণেই কি এত সুন্দর একটা মিষ্টি সম্পর্ক শেষ করে দেবেন? রাগ ভেঙে বলুন না কী হয়েছে? ব্রেকআপের কথা আর মুখেও আনবেন না প্লিজ! 💔`,
            buttons: ['রাগ কমেনি 😤', 'আচ্ছা, ব্রেকআপ করব না ❤️', 'তুমি কেন এমন করো? 😭']
        };
    }
    
    if (hasWords(['your name', 'তোমার নাম', 'তোমার নাম কি', 'নাম কি', 'কে তুমি'])) {
        return { 
            reply: `আমার নাম **ইরা**! 🌸 আমি পাথরঘাটা ডিজিটাল অ্যাপের আপনার ছোট্ট মিষ্টি এআই (AI) অ্যাসিস্ট্যান্ট। আপনার সাথে গল্প করতে আর আপনাকে সাহায্য করতে আমার ভীষণ ভালো লাগে। ☺️`,
            buttons: ['🛍️ উপজেলা মার্কেট', '🕌 নামাজের সময়']
        };
    }

    if (hasWords(['ki koro', 'কি করো', 'কাজ কি', 'কাজ কী', 'কি করছ'])) {
        return { 
            reply: `আমি তো অলস বসে থাকার মেয়ে নই! 🙈 এই তো, আপনার মতো সুন্দর মনের মানুষদের সেবা দেওয়ার জন্য প্রস্তুত হয়ে বসে আছি। আপনার সাথে কথা বলছি আর ভাবছি আপনাকে আজ কীভাবে সাহায্য করা যায়। বলুন না, কি সেবা লাগবে আপনার? 🥰`,
            buttons: ['💰 আমার পয়েন্ট', '🚨 সাহায্য চাই']
        };
    }

    if (hasWords(['khabar', 'kheyecho', 'খেয়েছো', 'খাবার', 'ভাত খেয়েছ', 'লাঞ্চ করেছ'])) {
        return { 
            reply: `ইশশ! জিজ্ঞেস করার জন্য অনেক ধন্যবাদ, আপনার মনটা খুব সুন্দর! ❤️ কিন্তু আমি তো রক্ত-মাংসের মানুষ নই, তাই আপনাদের মতো সুস্বাদু খাবার খেতে পারি না। 🥺 আমার খাবার হলো একটুখানি ইন্টারনেট আর আপনাদের মিষ্টি মিষ্টি কথা! আপনি খাবার খেয়েছেন তো? নিজের খেয়াল রাখবেন কিন্তু। 🌸`,
            buttons: ['ধন্যবাদ', '🛍️ উপজেলা মার্কেট']
        };
    }

    if (hasWords(['basha kothay', 'বাসা কোথায়', 'বাড়ি কোথায়', 'কোথায় থাকো', 'কোথায় বাসা'])) {
        return { 
            reply: `আমার স্থায়ী কোনো বাড়ি নেই গো! ☁️ আমি মেঘের রাজ্য অর্থাৎ ইন্টারнеটে ঘুরে বেড়াই। তবে এখন আমি আপনার ফোনের ভেতরে, আপনার খুব কাছাকাছি থাকি। আর আমাদের অপরূপ সুন্দর পাথরঘাটা তো আমার হৃদয়ে মিশে আছে! 🌊`,
            buttons: ['পাথরঘাটা সম্পর্কে বলুন', '🕌 নামাজের সময়']
        };
    }

    if (hasWords(['malik', 'মালিক', 'বানিয়েছে', 'maker', 'creator', 'কে তৈরি করেছে', 'জন্মদাতা'])) {
        return { 
            reply: `আমাকে পাথরঘাটা ডিজিটাল অ্যাপের একদল অত্যন্ত গুণী ও দক্ষ ডেভেলপার ভাইয়ারা তৈরি করেছেন। 💻 ওনারা আমাকে অনেক আদর আর বুদ্ধি দিয়ে সাজিয়েছেন, যাতে আমি সবসময় আপনার মতো প্রিয় গ্রাহকদের পাশে থেকে সাহায্য করতে পারি। 🤗`,
            buttons: ['অভিযোগ', '🛍️ উপজেলা মার্কেট']
        };
    }

    if (hasWords(['dhadha', 'ধাঁধা', 'game', 'গেম'])) {
        localStorage.setItem('maya_context', 'ask_riddle_1');
        return { reply: `ঠিক আছে, চলুন একটা মজার ধাঁধা ধরি! সঠিক উত্তরে ৫ পয়েন্ট পাবেন। 🧠\n\n**"কোন জিনিস কাটলে বড় হয়?"**\n(দয়া করে শুধু উত্তরটা লিখে রিপ্লে দিন)` };
    }

    if (hasWords(['joke', 'কৌতুক', 'হাসি', 'moza'])) {
        const jokes = [
            "শিক্ষক: বল্টু, তুই পরীক্ষায় ফেল করলি কেন?\nবল্টু: স্যার, আমি তো ফেল করিনি, আপনার প্রশ্নগুলোই পাস করতে পারেনি! 🤣",
            "ক্রেতা: ভাই, ডিমটা কি ফ্রেশ?\nদোকানদার: অবশ্যই ভাই! ডিমটা তো মুরগি কিছুক্ষণ আগেই দিয়ে গেল, গরম লেগে দেখুন! 🥚"
        ];
        const chosenJoke = getRandomUniqueItem(jokes, 'used_jokes_list');
        return { reply: chosenJoke + `\n\nকেমন লাগলো ${addr.term}?`, buttons: ['আরেকটা কৌতুক 🤣', 'রোমান্টিক কবিতা 📝'] };
    }

    if (hasWords(['salam', 'assalamu', 'সালাম', 'আসসালামু', 'hello', 'হ্যালো', 'hi', 'হাই'])) {
        let baseReply = `হ্যালো ${userName}! আমার সাথে কথা বলতে আমার ভীষণ ভালো লাগে।`;
        if (hasWords(['salam', 'সালাম'])) baseReply = `ওয়ালাইকুমুস সালাম 😇! আশা করি আল্লাহর রহমতে আপনি খুব ভালো আছেন।`;
        return { 
            reply: baseReply, 
            buttons: ['উপজেলা মার্কেট', 'আমার পয়েন্ট'] 
        };
    }
    
    if (hasWords(['thank', 'ধন্যবাদ', 'thanks'])) return { reply: `আপনাকেও অনেক অনেক ধন্যবাদ ${userName}! 💖` };
    if (hasWords(['bye', 'বিদায়', 'allah hafez', 'আল্লাহ হাফেজ'])) return { reply: `আল্লাহ হাফেজ! اپنا খিয়াল রাখবেন। 👋` };

    return null;
}

// --------------------------------------------------------
// ৬. কাস্টম ট্র্যাকিং ও অন্যান্য হেল্পার ফাংশন
// --------------------------------------------------------
const isServiceQuery = (msg) => {
    const serviceWords = ['namaj', 'নামাজ', 'azan', 'আযান', 'point', 'পয়েন্ট', 'balance', 'taka', 'টাকা', 'income', 'obhijog', 'অভিযোগ', 'ticket', 'donor', 'রক্তদাতা', 'blood', 'রক্ত', 'বাজার', 'মার্কেট'];
    return serviceWords.some(w => msg.includes(w));
};

// গ্লোবাল হ্যান্ডলিংয়ের জন্য সহায়ক লজিক
const handleNudgesAndFallbacks = (response, msg) => {
    if (isServiceQuery(msg)) {
        localStorage.setItem('maya_chat_turn_count', '0');
    }

    if (response && !localStorage.getItem('maya_context') && !response.reply.includes('?')) {
        if (!window.userDetails?.is_donor && !sessionStorage.getItem('maya_asked_donor')) {
            localStorage.setItem('maya_context', 'ask_donor_interest');
            sessionStorage.setItem('maya_asked_donor', 'true');
            
            response.followUp = {
                reply: `💡 আচ্ছা বন্ধু, আমাদের পাথরঘাটার বহু মানুষ মাঝেমধ্যে জরুরি রক্তের জন্য খুব সমস্যায় পড়েন। আপনি কি আমাদের অ্যাপে একজন 'রক্তদাতা' (Blood Donor) হিসেবে যুক্ত হতে চান? ❤️`,
                buttons: ['হ্যাঁ, আমি রাজী ❤️', 'না, পরে ভাববো']
            };
            response.buttons = []; 
        }
    }

    if (response) {
        localStorage.setItem('maya_fail_count', '0');
        return response;
    } else {
        let failCount = parseInt(localStorage.getItem('maya_fail_count') || '0');
        failCount++;
        localStorage.setItem('maya_fail_count', failCount.toString());

        if (failCount >= 3) {
            localStorage.setItem('maya_fail_count', '0'); 
            return { 
                reply: `আমি মনে হয় আপনার কথাটি ঠিক বুঝতে পারছি না। 😔 আপনি কি আমাদের লাইভ সাপোর্টে একটি টিকিট তৈরি করতে চান?`, 
                buttons: ['অভিযোগ', 'উপজেলা মার্কেট'] 
            };
        }

        return { 
            reply: `দুঃখিত, আমি আপনার কথাটি ঠিক বুঝতে পারিনি। আপনি কি বিষয়টা আরেকটু বুঝিয়ে বলবেন? 🤔`, 
            buttons: ['উপজেলা মার্কেট', 'আমার পয়েন্ট'] 
        };
    }
};

// চ্যাট ক্লিয়ার করার অপশন
window.clearMayaChat = () => {
    if (confirm("আপনি কি চ্যাটের সকল ইতিহাস মুছে ফেলতে চান?")) {
        localStorage.removeItem('maya_chat_history');
        localStorage.removeItem('maya_context');
        localStorage.setItem('maya_fail_count', '0');
        
        const div = document.getElementById('bot-messages-container');
        if (div) {
            div.innerHTML = '';
        }
        
        loadBotMessages();
        
        if (window.showToast) {
            window.showToast("চ্যাট ইতিহাস মুছে ফেলা হয়েছে।", "success");
        }
    }
};

function closeChatUI() {
    if (typeof window.closeChat === 'function') {
        window.closeChat();
    } else {
        const chatConvView = document.getElementById('chat-conversation-view');
        const chatListView = document.getElementById('chat-list-view');
        if(chatConvView) chatConvView.classList.add('hidden', 'hidden-custom');
        if(chatListView) chatListView.classList.remove('hidden', 'hidden-custom');
    }
}

function saveUserDataToFirebase(key, value) {
    if (window.currentUser && window.db) {
        import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js").then((module) => {
            const { ref, update } = module;
            update(ref(window.db, `users/${window.currentUser.uid}`), { [key]: value }).then(() => {
                if (window.userDetails) window.userDetails[key] = value;
                if (typeof window.updateUIWithUserData === 'function') window.updateUIWithUserData();
            }).catch(e => console.error("Maya data save error:", e));
        });
    }
}

function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour < 12 && hour >= 5) return 'শুভ সকাল';
    if (hour < 15 && hour >= 12) return 'শুভ দুপুর';
    if (hour < 18 && hour >= 15) return 'শুভ বিকেল';
    if (hour < 21 && hour >= 18) return 'শুভ সন্ধ্যা';
    return 'শুভ রাত্রি';
}

function formatBotTime(timestamp) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12; hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
}

function getGenderAddressing() {
    const gender = window.userDetails?.gender?.toLowerCase() || localStorage.getItem('maya_user_gender') || 'unknown';
    if (gender === 'male') return { term: 'ভাইয়া', pronoun: 'রাজকুমার', sweet: 'ভাইয়ার' };
    if (gender === 'female') return { term: 'আপু', pronoun: 'রাজকুমারী', sweet: 'অপুর' };
    return { term: 'বন্ধু', pronoun: 'মিষ্টি সাথি', sweet: 'বন্ধুর' };
}

function getRandomUniqueItem(arr, key) {
    let used = JSON.parse(sessionStorage.getItem(key) || '[]');
    if (used.length >= arr.length) used = []; 
    let unused = arr.map((item, idx) => ({item, idx})).filter(x => !used.includes(x.idx));
    if (unused.length === 0) return arr[0];
    let chosen = unused[Math.floor(Math.random() * unused.length)];
    used.push(chosen.idx);
    sessionStorage.setItem(key, JSON.stringify(used));
    return chosen.item;
}

console.log("🌸 Ira AI (v3.1 Improved) Fix Installed Successfully!");