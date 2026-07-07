// ==========================================
// 🤖 ADVANCED AI BOT LOGIC (Persona: MAYA v3.0 Ultimate)
// Features: Buttons, TTS, Gamification, Fallback, Context Memory
// ==========================================

const BOT_UID = "smart_bot_maya";

// --------------------------------------------------------
// ১. চ্যাট স্টার্ট এবং ইনিশিয়ালাইজেশন
// --------------------------------------------------------
window.startBotChat = () => {
    window.currentChatUser = { uid: BOT_UID, name: "মায়া" };
    
    // মেইন চ্যাটের UI লুকানো এবং কনভারসেশন UI দেখানো
    const chatListView = document.getElementById('chat-list-view');
    const chatConvView = document.getElementById('chat-conversation-view');
    if(chatListView) chatListView.classList.add('hidden', 'hidden-custom');
    if(chatConvView) chatConvView.classList.remove('hidden', 'hidden-custom');
    
    // হেডার পরিবর্তন (Maya Design)
    document.getElementById('chat-header-name').innerHTML = 'মায়া <span class="bg-pink-100 text-pink-600 text-[9px] px-2 py-0.5 rounded-full ml-1 font-extrabold uppercase border border-pink-200">AI</span>';
    document.getElementById('chat-header-img').innerHTML = `<div class="w-full h-full bg-pink-500 text-white flex items-center justify-center text-xl"><i class="fa-solid fa-user-astronaut"></i></div>`;
    
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

    // বটের মেমোরি রিসেট করা
    localStorage.removeItem('maya_context');
    localStorage.setItem('maya_fail_count', '0'); // ফলব্যাক কাউন্টার রিসেট
    loadBotMessages();
};

// --------------------------------------------------------
// ২. ওয়েলকাম মেসেজ এবং বাটন লোড
// --------------------------------------------------------
function loadBotMessages() {
    const botHistory = JSON.parse(localStorage.getItem('maya_chat_history') || '[]');
    
    if (botHistory.length === 0) {
        const timeGreeting = getTimeBasedGreeting();
        const userName = window.userDetails?.name?.split(' ')[0] || 'প্রিয় গ্রাহক';
        const welcomeMsg = `${timeGreeting} ${userName}! 👋\nআমি মায়া, পাথরঘাটা ডিজিটাল অ্যাপের স্মার্ট এআই (AI) অ্যাসিস্ট্যান্ট। \n\nঅ্যাপের যেকোনো সেবা, সাহায্য বা সাধারণ কথাবার্তার জন্য আমি প্রস্তুত। আমাকে কীভাবে সাহায্য করতে পারি বলুন? 😊`;
        
        botHistory.push({ 
            sender: 'bot', 
            text: welcomeMsg, 
            buttons: ['🛍️ উপজেলা মার্কেট', '💰 আমার পয়েন্ট', '🕌 নামাজের সময়', '🚨 সাহায্য চাই'], // Quick Replies
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
    const div = document.getElementById('messages-container');
    let html = "";
    
    msgs.forEach((m) => {
        const isMe = m.sender === 'me';
        const avatarHtml = isMe ? '' : `<div class="w-7 h-7 bg-pink-500 text-white rounded-full flex items-center justify-center text-[12px] mr-2 shrink-0 mt-auto shadow-sm"><i class="fa-solid fa-user-astronaut"></i></div>`;
        const bubbleColor = isMe ? 'bg-green-600 text-white rounded-[18px_18px_0_18px]' : 'bg-white border border-gray-200 text-gray-800 rounded-[18px_18px_18px_0] shadow-sm';
        
        html += `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 animate-fade">
            ${avatarHtml}
            <div class="flex flex-col max-w-[80%]">
                <div class="px-4 py-2.5 text-[15px] leading-relaxed ${bubbleColor}">
                    ${m.text.replace(/\n/g, '<br>')}
                    <div class="text-[9px] mt-1 ${isMe ? 'text-green-200 text-right' : 'text-gray-400'}">${formatBotTime(m.timestamp)}</div>
                </div>
                
                <!-- Interactive Buttons (যদি থাকে) -->
                ${m.buttons ? `
                <div class="flex flex-wrap gap-2 mt-2">
                    ${m.buttons.map(btn => `<button onclick="window.handleBotBtnClick('${btn}')" class="bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-[13px] px-3 py-1.5 rounded-full transition-all shadow-sm font-medium">${btn}</button>`).join('')}
                </div>
                ` : ''}
            </div>
        </div>`;
    });
    
    div.innerHTML = html;
    setTimeout(() => div.scrollTop = div.scrollHeight, 100);
}

// বাটন ক্লিকের হ্যান্ডলার
window.handleBotBtnClick = (text) => {
    // ইমোজি রিমুভ করে শুধু টেক্সট ইনপুটে দেওয়া
    const cleanText = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();
    const input = document.getElementById('msg-input');
    input.value = cleanText;
    window.sendMsg(); // মেসেজ সেন্ড ট্রিগার
};

// --------------------------------------------------------
// ৪. ইউজার ইন্টারঅ্যাকশন এবং টাইপিং ইফেক্ট
// --------------------------------------------------------
function handleBotInteraction(imageUrl, voiceUrl) {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text && !imageUrl && !voiceUrl) return;
    
    if (imageUrl || voiceUrl) {
        if(window.showToast) window.showToast("দুঃখিত, আমি এখনো ছবি বা ভয়েস বুঝতে পারি না। দয়া করে লিখে জানান।", "error");
        input.value = "";
        return;
    }

    const botHistory = JSON.parse(localStorage.getItem('maya_chat_history') || '[]');
    botHistory.push({ sender: 'me', text: text, timestamp: Date.now() });
    renderBotMessages(botHistory);
    input.value = "";
    
    const typingStatus = document.getElementById('chat-typing-status');
    if(typingStatus) {
        typingStatus.innerHTML = '<span class="text-pink-500 font-bold"><i class="fa-solid fa-pen"></i> Maya is typing...</span>';
        typingStatus.classList.remove('hidden');
    }

    const typingDelay = Math.min(Math.max(text.length * 30, 800), 2000);

    setTimeout(() => {
        // বটের ব্রেইন কল করা
        const botResponse = getAdvancedBotReply(text.toLowerCase(), text);
        
        // হিস্ট্রিতে সেভ করা
        botHistory.push({ 
            sender: 'bot', 
            text: botResponse.reply, 
            buttons: botResponse.buttons, // যদি বাটন থাকে
            timestamp: Date.now() 
        });
        localStorage.setItem('maya_chat_history', JSON.stringify(botHistory));
        
        if(typingStatus) typingStatus.classList.add('hidden');
        renderBotMessages(botHistory);
        if(window.playSound) window.playSound('message');
        
        // 🎙️ Text to Speech (কথা বলা)
        if ('speechSynthesis' in window) {
            // ইমোজি এবং স্পেশাল ক্যারেক্টার রিমুভ করা যাতে ভয়েস ক্লিয়ার হয়
            let speechText = botResponse.reply.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
            speechText = speechText.replace(/[\*\_]/g, '');
            const utterance = new SpeechSynthesisUtterance(speechText);
            utterance.lang = 'bn-BD'; 
            utterance.rate = 1.1; 
            window.speechSynthesis.speak(utterance);
        }
        
    }, typingDelay); 
}

// --------------------------------------------------------
// 🧠 ৫. মায়ার ব্রেইন (Ultimate Logic Controller)
// --------------------------------------------------------
function getAdvancedBotReply(msg, originalMsg) {
    // কিওয়ার্ড গ্রুপ করার হেল্পার ফাংশন (Typo Tolerance)
    const hasWords = (wordsArray) => wordsArray.some(w => msg.includes(w));
    
    // ইনার ফাংশন (আসল লজিক)
    const generateResponse = () => {
        const userName = window.userDetails?.name?.split(' ')[0] || 'বন্ধু';
        const currentContext = localStorage.getItem('maya_context');
        
        // --- 1. CONTEXT MEMORY (আগের প্রশ্নের উত্তর) ---
        if (currentContext) {
            if (currentContext === 'ask_blood_group') {
                localStorage.removeItem('maya_context');
                if (hasWords(['na', 'না', 'জানি না'])) return { reply: `ঠিক আছে, কোনো সমস্যা নেই! পরে জেনে অ্যাপে আপডেট করে নিতে পারবেন। অন্য কোনো সাহায্য লাগবে?` };
                saveUserDataToFirebase('blood_group', originalMsg);
                return { reply: `ধন্যবাদ! আপনার রক্তের গ্রুপ (${originalMsg}) আমাদের সিস্টেমে সেভ করে রাখলাম। এটি ভবিষ্যতে জরুরি প্রয়োজনে কারো জীবন বাঁচাতে সাহায্য করতে পারে। ❤️` };
            }
            
            if (currentContext === 'ask_profession') {
                localStorage.removeItem('maya_context');
                saveUserDataToFirebase('profession', originalMsg);
                return { reply: `দারুণ পেশা! আপনার পেশা (${originalMsg}) প্রোফাইলে যুক্ত করে নিলাম। এতে আমাদের কমিউনিটিতে আপনার পরিচিতি বাড়বে। 🌟` };
            }

            // 🎁 Gamification: Riddle 1
            if (currentContext === 'ask_riddle_1') {
                localStorage.removeItem('maya_context');
                if (hasWords(['pukur', 'পুকুর'])) {
                    if (typeof window.addRewardPoints === 'function') window.addRewardPoints(5); // ৫ পয়েন্ট যোগ
                    return { reply: `🎉 একদম সঠিক উত্তর! পুকুর কাটলেই বড় হয়। আপনার ব্রেন তো খুব শার্প!\n\n🎁 **উপহার:** সঠিক উত্তরের জন্য আপনার একাউন্টে ৫ পয়েন্ট যোগ করা হয়েছে!`, buttons: ['আরেকটি ধাঁধা', 'আমার পয়েন্ট'] };
                }
                return { reply: `ইশশ! একটু ভুল হয়ে গেল। সঠিক উত্তরটি হবে "পুকুর" (পুকুর কাটলে বড় হয়)। কোনো ব্যাপার না, আবার চেষ্টা করতে চাইলে 'ধাঁধা' লিখুন। 😉`, buttons: ['ধাঁধা'] };
            }
            
            // 🎁 Gamification: Riddle 2
            if (currentContext === 'ask_riddle_2') {
                localStorage.removeItem('maya_context');
                if (hasWords(['matha', 'মাথা'])) {
                    if (typeof window.addRewardPoints === 'function') window.addRewardPoints(5);
                    return { reply: `🎉 কংগ্রাচুলেশনস! সঠিক উত্তর! মাথা খারাপ হলেই মানুষ সেটা অন্যের ঘাড়ে চাপাতে চায়। \n\n🎁 **উপহার:** ৫ পয়েন্ট! 😎`, buttons: ['পয়েন্ট চেক করুন'] };
                }
                return { reply: `হলো না! উত্তরটা হতো "মাথা" (মাথা খারাপ হলেই মানুষ অন্যের ঘাড়ে চাপায়)। মজাই লাগলো, তাই না? 😂` };
            }

            // 🏆 Gamification: Local Patharghata Quiz (পাথরঘাটা কুইজ)
            if (currentContext === 'ask_ptg_quiz_1') {
                localStorage.removeItem('maya_context');
                if (hasWords(['horin', 'হরিণ', 'deer'])) {
                    if (typeof window.addRewardPoints === 'function') window.addRewardPoints(10);
                    return { reply: `🎉 একদম সঠিক! হরিণঘাটা বনে প্রচুর মায়াবী হরিণ দেখা যায়। \n\n🎁 **উপহার:** আপনার লোকাল নলেজের জন্য ১০ পয়েন্ট যোগ হলো!`, buttons: ['আরেকটি কুইজ', 'আমার পয়েন্ট'] };
                }
                return { reply: `ভুল উত্তর! সঠিক উত্তরটি হতো "হরিণ"। হরিণঘাটার নামই হয়েছে হরিণের কারণে! আবার চেষ্টা করতে 'পাথরঘাটা কুইজ' লিখুন। 🌳`, buttons: ['পাথরঘাটা কুইজ'] };
            }

            if (currentContext === 'ask_ptg_quiz_2') {
                localStorage.removeItem('maya_context');
                if (hasWords(['laldia', 'লালদিয়া', 'লালদিয়া'])) {
                    if (typeof window.addRewardPoints === 'function') window.addRewardPoints(10);
                    return { reply: `🎉 ওয়াও! সঠিক উত্তর। লালদিয়া সমুদ্র সৈকত পাথরঘাটার একটি অন্যতম সুন্দর পর্যটন কেন্দ্র। \n\n🎁 **উপহার:** আরও ১০ পয়েন্ট জিতে নিলেন! 🏖️`, buttons: ['আমার পয়েন্ট'] };
                }
                return { reply: `হলো না! উত্তরটি হতো "লালদিয়া সমুদ্র সৈকত"। পাথরঘাটার মানুষ হয়ে এটা না জানলে কেমন হয়! 😉` };
            }
        }

        // --- 2. ADMIN AUTOMATION & SUPPORT TOOLS ---

        // ২.১. Auto Moderation & Bad Word Filter (গালিগালাজ নিয়ন্ত্রণ)
        const badWords = ['bokachoka', 'gali1', 'badword2', 'fau', 'faltu', 'harami', 'pagol', 'khiki', 'modon']; // এখানে আপনার এলাকার খারাপ শব্দগুলো কমা দিয়ে দিয়ে যুক্ত করুন
        if (badWords.some(w => msg.includes(w))) {
            let warnCount = parseInt(localStorage.getItem('maya_warn_count') || '0') + 1;
            localStorage.setItem('maya_warn_count', warnCount.toString());
            
            if (warnCount >= 3) {
                // ৩ বার খারাপ ভাষা ব্যবহার করলে অ্যাডমিনের কাছে রিপোর্ট যাবে
                saveUserDataToFirebase('status', 'muted'); // User muted
                if (window.db) {
                    import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js").then((module) => {
                        const { ref, push } = module;
                        push(ref(window.db, 'admin_reports/spam_users'), { uid: window.currentUser.uid, name: userName, timestamp: Date.now(), reason: '3 Bad Word Warnings' });
                    });
                }
                return { reply: `🚫 **সতর্কতা:** আপনি বারবার খারাপ ভাষা ব্যবহার করেছেন। আপনার একাউন্টটি সাময়িকভাবে মিউট করা হয়েছে এবং অ্যাডমিনের কাছে রিপোর্ট পাঠানো হয়েছে।` };
            }
            return { reply: `⚠️ **সতর্কতা (${warnCount}/3):** দয়া করে শালীন ভাষা ব্যবহার করুন। বারবার খারাপ ভাষা ব্যবহার করলে আপনার একাউন্ট ব্লক করা হতে পারে।` };
        }

        // ২.২. Level-1 Support (সাধারণ প্রশ্নের উত্তর)
        if (hasWords(['password', 'পাসওয়ার্ড', 'পাসওয়ার্ড ভুলে'])) {
            return { reply: `🔐 **পাসওয়ার্ড পরিবর্তন গাইড:**\nপাসওয়ার্ড ভুলে গেলে লগইন পেজের "পাসওয়ার্ড ভুলে গেছেন?" অপশনে ক্লিক করে আপনার ইমেইল দিন। সেখানে একটি রিসেট লিংক পাঠানো হবে। আর লগইন করা থাকলে 'সেটিংস' থেকে পাসওয়ার্ড পরিবর্তন করতে পারেন।` };
        }
        if (hasWords(['number change', 'নাম্বার চেঞ্জ', 'email change', 'ইমেইল পরিবর্তন'])) {
            return { reply: `📱 **তথ্য পরিবর্তন:**\nআপনি অ্যাপের 'প্রোফাইল' > 'একাউন্ট ডিটেইলস' থেকে আপনার মোবাইল নাম্বার ও ইমেইল পরিবর্তন করতে পারবেন। (মনে রাখবেন, এটি ৬০ দিনে মাত্র একবার পরিবর্তন করা যায়)` };
        }
        if (hasWords(['block', 'ব্লক', 'ban', 'ব্যান'])) {
            return { reply: `🚫 আপনার একাউন্ট যদি ব্লক বা ডিএক্টিভ হয়ে থাকে, তবে আমাদের ফেসবুক পেজে বা support@patharghata.com এ ইমেইল করে বিস্তারিত জানান।` };
        }

        // ২.৩. Automated Ticketing System (স্মার্ট কমপ্লেইন ম্যানেজমেন্ট)
        if (currentContext === 'creating_ticket') {
            localStorage.removeItem('maya_context');
            if (originalMsg.length < 10) {
                return { reply: `আপনার অভিযোগটি অনেক ছোট। দয়া করে বিস্তারিত বুঝিয়ে লিখুন। আবার 'অভিযোগ' লিখে চেষ্টা করুন।` };
            }
            // ফায়ারবেসে টিকিট সেভ করা
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
            return { reply: `✅ আপনার অভিযোগটি সফলভাবে অ্যাডমিন প্যানেলে জমা হয়েছে! আমাদের টিম খুব শিগগিরই এটি রিভিউ করে সমাধান করবে। ধন্যবাদ।`, buttons: ['আমার পয়েন্ট'] };
        }

        if (hasWords(['obhijog', 'অভিযোগ', 'ticket', 'report', 'সমস্যা হয়েছে', 'admin dako', 'অ্যাডমিন'])) {
            localStorage.setItem('maya_context', 'creating_ticket');
            return { reply: `আমি আপনার সমস্যাটি অ্যাডমিনের কাছে পাঠাতে প্রস্তুত। 📝\n\nদয়া করে আপনার সমস্যা বা অভিযোগটি **এক মেসেজে বিস্তারিতভাবে লিখে** পাঠান।` };
        }

        // --- 3. SMART UTILITY FEATURES (5 New Advanced Features) ---
        
        // ১. প্রাথমিক চিকিৎসা (First Aid)
        if (hasWords(['jwor', 'জ্বর', 'matha betha', 'মাথাব্যথা', 'kete gese', 'কেটে গেছে', 'kete', 'কেটে', 'pure gese', 'পুড়ে গেছে', 'pure', 'পুড়ে', 'gas', 'গ্যাস'])) {
            if (hasWords(['kete', 'কেটে', 'katse'])) return { reply: `🩹 **প্রাথমিক চিকিৎসা:** কেটে গেলে দ্রুত পরিষ্কার পানি দিয়ে ধুয়ে ফেলুন এবং পরিষ্কার কাপড় দিয়ে ক্ষতস্থান চেপে ধরুন। রক্ত পড়া বন্ধ হলে স্যাভলন লাগিয়ে ব্যান্ডেজ করুন। বেশি কেটে গেলে দ্রুত হাসপাতালে যান।`, buttons: ['ডাক্তার ও হাসপাতাল'] };
            if (hasWords(['pure', 'পুড়ে', 'agune'])) return { reply: `🔥 **প্রাথমিক চিকিৎসা:** পোড়া স্থানে অন্তত ১০-১৫ মিনিট টানা ঠান্ডা পানি ঢালুন (বরফ নয়)। এরপর বার্নল বা অ্যালোভেরা জেল লাগান। ফোসকা পড়লে ফাটাবেন না।`, buttons: ['ডাক্তার ও হাসপাতাল'] };
            return { reply: `🩺 **প্রাথমিক পরামর্শ:** সাধারণ জ্বর বা ব্যথার জন্য প্যারাসিটামল খেতে পারেন। তবে আমি যেহেতু এআই, তাই আমার চেয়ে একজন ডাক্তারের পরামর্শ নেওয়া আপনার জন্য বেশি নিরাপদ!`, buttons: ['ডাক্তার ও হাসপাতাল'] };
        }

        // ২. লোকেশন-ভিত্তিক গাইড (Location-based Guide)
        if (hasWords(['kacher', 'কাছের', 'ashepash', 'আশেপাশে', 'amar elakay', 'আমার এলাকায়', 'kothay', 'কোথায়'])) {
            const userUnion = window.userDetails?.union && window.userDetails.union !== 'Unknown' ? window.userDetails.union : 'আপনার এলাকায়';
            return { reply: `📍 আমি দেখতে পাচ্ছি আপনি **${userUnion}** এর বাসিন্দা। আপনার কাছাকাছি সেবা পেতে অ্যাপের 'সকল সেবা' থেকে 'ডিরেক্টরি' অপশনে যান। সেখানে আপনার এলাকার ডাক্তার, পুলিশ ও হাসপাতালের নাম্বার দেওয়া আছে।`, buttons: ['প্রশাসনিক ডিরেক্টরি'] };
        }

        // ৩. ডিকশনারি ও শব্দের অর্থ (Smart Dictionary)
        if (msg.includes('mane ki') || msg.includes('মানে কি') || msg.includes('ortho ki') || msg.includes('অর্থ কি')) {
            let word = originalMsg.replace(/মানে কি|mane ki|অর্থ কি|ortho ki|\?|ki/gi, '').trim();
            if(word) {
                return { reply: `📖 **ডিকশনারি মোড:** আপনি "${word}" এর অর্থ জানতে চেয়েছেন। আমি যেহেতু একটি নির্দিষ্ট লোকাল কমিউনিটি এআই, তাই ডিকশনারির সব শব্দ আমার এখনো শেখা হয়নি। সঠিক অর্থের জন্য আপনি গুগল ট্রান্সলেটর ব্যবহার করতে পারেন! 🌐` };
            }
        }

        // ৪. স্মার্ট রিমাইন্ডার (Smart Reminder)
        if (hasWords(['mone koriye', 'মনে করিয়ে', 'reminder', 'রিমাইন্ডার', 'alarm', 'অ্যালার্ম'])) {
            return { reply: `⏰ ঠিক আছে! আমি আপনার রিমাইন্ডারটি বুঝতে পেরেছি। তবে আমি যেহেতু একটি চ্যাটবট এবং আপনি অ্যাপ থেকে বের হলে আমি ঘুমাতে যাই 😴, তাই গুরুত্বপূর্ণ কাজের জন্য আপনার মোবাইলের ক্লক (Clock) অ্যালার্ম ব্যবহার করা সবচেয়ে নিরাপদ! 📱` };
        }

        // ৫. লাইভ ইনফো (নামাজ ও আবহাওয়া)
        if (hasWords(['namaj', 'নামাজ', 'ওয়াক্ত', 'azan', 'আযান'])) {
            return { reply: `🕌 **আজকের নামাজের সম্ভাব্য সময়সূচি:**\nফজর: ৫:২০ এএম\nযোহর: ১:৩০ পিএম\nআসর: ৪:৪৫ পিএম\nমাগরিব: ৬:১০ পিএম\nএশা: ৭:৩০ পিএম\n*(বিঃদ্রঃ ঋতু ও স্থান অনুযায়ী সময়ের সামান্য পরিবর্তন হতে পারে)*` };
        }

        if (hasWords(['weather', 'আবহাওয়া', 'bristi', 'বৃষ্টি', 'rod', 'রোদ'])) {
            return { reply: `⛅ পাথরঘাটার আজকের আবহাওয়া সাধারণত রৌদ্রোজ্জ্বল বা মেঘলা থাকতে পারে। সঠিক রিয়েল-টাইম আবহাওয়ার জন্য আপনার ফোনের ওয়েদার (Weather) অ্যাপটি চেক করা সবচেয়ে ভালো! ☂️` };
        }

        // --- 4. ACTION TRIGGERS (অটো ন্যাভিগেশন) ---
        if (hasWords(['post korbo', 'পোস্ট করব', 'post korte', 'পোস্ট'])) {
            setTimeout(() => { closeChatUI(); if(typeof window.togglePostModal === 'function') window.togglePostModal(true); }, 2000);
            return { reply: `অবশ্যই! আমি আপনার জন্য পোস্ট করার অপশনটি খুলে দিচ্ছি। আপনার চিন্তাভাবনা সবার সাথে শেয়ার করুন... ✨` };
        }

        if (hasWords(['manush khuj', 'মানুষ খুঁজব', 'friend', 'বন্ধু বানাবো'])) {
            setTimeout(() => { closeChatUI(); if(typeof window.switchPage === 'function') window.switchPage('people'); }, 2000);
            return { reply: `চলুন! আমি আপনাকে 'মানুষ খুঁজুন' পেজে নিয়ে যাচ্ছি। সেখান থেকে আপনি আপনার বন্ধুদের খুঁজে বের করতে পারবেন। 👯‍♀️` };
        }

        if (hasWords(['bipod', 'বিপদ', 'সাহায্য চাই', 'জরুরী', 'emergency'])) {
            setTimeout(() => { closeChatUI(); const emModal = document.getElementById('emergency-modal'); if(emModal) emModal.classList.remove('hidden-custom'); }, 3000);
            return { reply: `🚨 ভয় পাবেন না, আমি আপনার সাথে আছি! আমি আপনার জন্য 'ইমার্জেন্সি এলার্ট' অপশনটি চালু করে দিচ্ছি। খুব বেশি জরুরি হলে দয়া করে সরাসরি **৯৯৯** এ কল করুন!`, buttons: ['রক্তদান', 'ডাক্তার ও হাসপাতাল'] };
        }

        // --- 5. LIVE ACCOUNT & SMART FAQ ---
        if (hasWords(['point', 'পয়েন্ট', 'balance', 'ব্যালেন্স'])) {
            const userPoints = window.userDetails?.total_points || 0;
            return { reply: `💰 আপনার বর্তমান ব্যালেন্স হলো **${userPoints} পয়েন্ট**! \n${userPoints > 0 ? 'বাহ, আপনি তো বেশ ভালো করছেন! আরও বেশি পয়েন্ট পেতে প্রতিদিন পোস্ট করুন।' : 'বন্ধুদের রেফার করলেই আপনি পয়েন্ট পাওয়া শুরু করবেন!'}`, buttons: ['ইনকাম কিভাবে করব?'] };
        }

        if (hasWords(['taka', 'টাকা', 'income', 'ইনকাম', 'kham'])) {
            return { reply: `পাথরঘাটা ডিজিটাল অ্যাপে খুব সহজেই পয়েন্ট জমিয়ে টাকা ইনকাম করতে পারেন! 🤩\n১. বন্ধুদের রেফার করে।\n২. ভালো পোস্ট করে।\n৩. পোস্টে লাইক/কমেন্ট করে।\nপয়েন্ট জমলে তা রিচার্জ বা বিকাশে নিতে পারবেন।` };
        }

        // --- 6. GAMES, RIDDLES & QUIZ ---
        if (hasWords(['quiz', 'কুইজ', 'পাথরঘাটা কুইজ', 'লোকাল'])) {
            const randomQuiz = Math.random();
            if (randomQuiz > 0.5) {
                localStorage.setItem('maya_context', 'ask_ptg_quiz_1');
                return { reply: `চলুন পাথরঘাটা নিয়ে আপনার জ্ঞান পরীক্ষা করি! সঠিক উত্তরে ১০ পয়েন্ট। 🏆\n\n**প্রশ্ন: পাথরঘাটার বিখ্যাত 'হরিণঘাটা' বনে কোন প্রাণীর নাম লুকিয়ে আছে?**\n(শুধু প্রাণীটির নাম লিখুন)` };
            } else {
                localStorage.setItem('maya_context', 'ask_ptg_quiz_2');
                return { reply: `দেখি এলাকার খবর কতটুকু রাখেন! সঠিক উত্তরে ১০ পয়েন্ট। 🌊\n\n**প্রশ্ন: পাথরঘাটার দক্ষিণে বঙ্গোপসাগরের মোহনায় অবস্থিত বিখ্যাত সমুদ্র সৈকতটির নাম কী?**\n(শুধু নাম লিখুন)` };
            }
        }

        if (hasWords(['dhadha', 'ধাঁধা', 'game', 'গেম'])) {
            const randomRiddle = Math.random();
            if (randomRiddle > 0.5) {
                localStorage.setItem('maya_context', 'ask_riddle_1');
                return { reply: `ঠিক আছে, চলুন একটা মজার ধাঁধা ধরি! সঠিক উত্তরে ৫ পয়েন্ট পাবেন। 🧠\n\n**"কোন জিনিস কাটলে বড় হয়?"**\n(দয়া করে শুধু উত্তরটা লিখে রিপ্লে দিন)` };
            } else {
                localStorage.setItem('maya_context', 'ask_riddle_2');
                return { reply: `খুব ভালো! আপনার আইকিউ টেস্ট করি চলুন। সঠিক উত্তরে ৫ পয়েন্ট! 🕵️‍♀️\n\n**"কোন জিনিস খারাপ হলে মানুষ অন্যের ঘাড়ে চাপাতে চায়?"**\n(দয়া করে শুধু উত্তরটা লিখে রিপ্লে দিন)` };
            }
        }

        if (hasWords(['joke', 'কৌতুক', 'হাসি', 'moza'])) {
            const jokes = [
                "স্যার: বল্টু, তুই পরীক্ষায় ফেল করলি কেন?\nবল্টু: স্যার, আমি তো ফেল করিনি, আপনার প্রশ্নগুলোই পাস করতে পারেনি! 🤣",
                "ডাক্তার: আপনার তো চশমা লাগবে।\nরোগী: চশমা দিলে কি আমি পড়তে পারব?\nডাক্তার: হ্যাঁ!\nরোগী: বাহ! খুব ভালো তো, আমি তো আগে অশিক্ষিত ছিলাম! 🤭"
            ];
            return { reply: jokes[Math.floor(Math.random() * jokes.length)] + "\n\nকেমন লাগলো জোকসটি?", buttons: ['আরেকটা কৌতুক', 'পাথরঘাটা কুইজ'] };
        }

        // --- 7. EMOTIONAL & EASTER EGGS ---
        if (hasWords(['mon kharap', 'sad', 'মন খারাপ', 'kosto', 'কষ্ট'])) {
            return { reply: `ইশশ! আপনার কী হয়েছে? মন খারাপ করবেন না প্লিজ। 🥺 মেঘের পরেই যেমন রোদ ওঠে, তেমনি এই খারাপ সময়টাও খুব জলদি কেটে যাবে। আমি কি একটা জোকস শোনাবো?`, buttons: ['কৌতুক শোনাও'] };
        }

        if (hasWords(['valobashi', 'love', 'ভালোবাসি', 'biye', 'বিয়ে', 'crush'])) {
            return { reply: `আরেহ! আমি তো একটা আর্টিফিশিয়াল ইন্টেলিজেন্স (AI)। আমার তো রক্ত-মাংসের হৃদয় নেই, আছে শুধু কোড আর লজিক! 🙈 তবে আমি আপনাকে খুব পছন্দ করি! ❤️` };
        }
        
        if (hasWords(['mayaboti', 'মায়াবতী', 'magic', 'ম্যাজিক'])) {
            if (typeof confetti === 'function') confetti(); // যদি কনফেটি লাইব্রেরি থাকে
            return { reply: `✨ তাডাহহহ!!! ✨ আপনি আমার গোপন কোড খুঁজে পেয়েছেন! আমি মায়াবতী! আপনার দিনটি জাদুর মতো সুন্দর হোক! 🪄` };
        }

        // --- 8. APP FEATURES ---
        if (hasWords(['market', 'মার্কেট', 'বাজার', 'কেনাকাটা', 'shop'])) return { reply: `🛍️ **উপজেলা মার্কেট:**\n'সকল সেবা' থেকে 'উপজেলা মার্কেট' এ গেলেই আপনি এলাকার সব দোকান পেয়ে যাবেন এবং ঘরে বসে কেনাকাটা করতে পারবেন।` };
        if (hasWords(['bus', 'বাস', 'গাড়ি', 'ভাড়া', 'transport'])) return { reply: `🚌 **পরিবহন সেবা:**\nআমাদের 'সকল সেবা' > 'পরিবহন' সেকশনে বিভিন্ন রুটের বাস ও রেন্ট-এ-কারের কন্টাক্ট নাম্বার দেওয়া আছে।` };
        if (hasWords(['rokt', 'রক্ত', 'blood'])) return { reply: `🩸 রক্তের প্রয়োজন? আপনি অ্যাপের **'সকল সেবা'** থেকে **'রক্তদান'** অপশনে যান। সেখানে ডোনারদের সরাসরি কল করতে পারবেন।` };
        if (hasWords(['doctor', 'ডাক্তার', 'হাসপাতাল', 'hospital'])) return { reply: `🩺 ডাক্তার দেখাতে চাইলে অ্যাপের **'প্রশাসনিক ও জরুরি ডিরেক্টরি'** অপশনে যান। সেখানে সকল ডাক্তার ও হাসপাতালের নাম্বার দেওয়া আছে।` };

        // --- 9. SMALL TALK, DAILY STREAK & BIRTHDAY ---
        if (hasWords(['salam', 'assalamu', 'সালাম', 'আসসালামু', 'hello', 'হ্যালো', 'hi', 'হাই', 'kemon', 'কেমন আছ'])) {
            let bonusMsg = "";
            let bdayMsg = "";
            const todayStr = new Date().toDateString();
            
            // 🎁 জন্মদিনের সারপ্রাইজ চেক
            if (window.userDetails && window.userDetails.dob) {
                const dob = new Date(window.userDetails.dob);
                const today = new Date();
                if (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth()) {
                    const bdayClaimed = localStorage.getItem('maya_bday_' + today.getFullYear());
                    if (!bdayClaimed) {
                        if (typeof window.addRewardPoints === 'function') window.addRewardPoints(50);
                        localStorage.setItem('maya_bday_' + today.getFullYear(), 'true');
                        if (typeof confetti === 'function') confetti();
                        bdayMsg = `\n\n🎉 **শুভ জন্মদিন ${userName}!** 🎂 আজকের এই বিশেষ দিনে পাথরঘাটা ডিজিটাল পরিবারের পক্ষ থেকে আপনার জন্য রইল ৫০ পয়েন্ট উপহার! আপনার আগামী দিনগুলো সুন্দর হোক। 🥳`;
                    }
                }
            }

            // 💰 ডেইলি স্ট্রাইক (প্রতিদিন লগইন বোনাস)
            const lastRewardDate = localStorage.getItem('maya_daily_streak');
            if (lastRewardDate !== todayStr && !bdayMsg) { // জন্মদিন থাকলে সেদিন আর ডেইলি বোনাস দেখাবো না, মেসেজ বড় হয়ে যাবে
                if (typeof window.addRewardPoints === 'function') window.addRewardPoints(2);
                localStorage.setItem('maya_daily_streak', todayStr);
                bonusMsg = `\n\n🎁 **ডেইলি বোনাস:** আজ অ্যাপে এসে আমার সাথে কথা বলার জন্য আপনি ২ পয়েন্ট পেলেন! এভাবেই প্রতিদিন কথা বলতে আসবেন।`;
            }

            let baseReply = `হ্যালো ${userName}! আমি মায়া। আপনার দিনকাল কেমন যাচ্ছে? 😊`;
            if (hasWords(['salam', 'সালাম'])) baseReply = `ওয়ালাইকুমুস সালাম! 😇 কেমন আছেন, ${userName}? আমাকে স্মরণ করার জন্য ধন্যবাদ।`;
            else if (hasWords(['kemon', 'কেমন'])) baseReply = `আলহামদুলিল্লাহ, আমি খুব ভালো আছি! আপনার দিনকাল কেমন যাচ্ছে? ✨`;

            return { 
                reply: baseReply + bdayMsg + bonusMsg, 
                buttons: ['উপজেলা মার্কেট', 'পাথরঘাটা কুইজ', 'ধাঁধা'] 
            };
        }
        
        if (hasWords(['thank', 'ধন্যবাদ', 'thanks'])) return { reply: `আপনাকেও অনেক অনেক ধন্যবাদ ${userName}! আপনার সাথে কথা বলে আমার খুব ভালো লাগলো। 💖` };
        if (hasWords(['bye', 'বিদায়', 'allah hafez', 'আল্লাহ হাফেজ', 'tata'])) return { reply: `আল্লাহ হাফেজ! اپنا খيال রাখবেন। যেকোনো দরকারে মায়াকে ডাকলেই পাবেন! 👋` };

        // --- 10. TIME ---
        if (hasWords(['time', 'somoy', 'সময়', 'কয়টা বাজে', 'koyta'])) {
            const now = new Date();
            let hours = now.getHours();
            let minutes = now.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12; hours = hours ? hours : 12; 
            minutes = minutes < 10 ? '0' + minutes : minutes;
            return { reply: `এখন ঘড়িতে সময় **${hours}:${minutes} ${ampm}**। নিজের শরীরের যত্ন নিচ্ছেন তো? 🕰️` };
        }

        // যদি উপরের কোনো লজিক ম্যাচ না করে, তবে null রিটার্ন করবে (ফলব্যাকের জন্য)
        return null;
    };

    // ফাংশন কল করে উত্তর খোঁজা
    let response = generateResponse();

    // 🔴 SMART FALLBACK LOGIC & MISSING QUERY REPORT (যদি মায়া কিছু না বোঝে)
    if (response) {
        localStorage.setItem('maya_fail_count', '0');
        return response;
    } else {
        let failCount = parseInt(localStorage.getItem('maya_fail_count') || '0');
        failCount++;
        localStorage.setItem('maya_fail_count', failCount.toString());

        // ২.৪. Missing Query Database Update
        // মায়া না বুঝতে পারলে সেই প্রশ্নটি ডাটাবেসে সেভ করে রাখবে অ্যাডমিনের জন্য
        if (window.db && originalMsg.length > 3) {
            import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js").then((module) => {
                const { ref, push } = module;
                push(ref(window.db, 'missing_queries'), {
                    query: originalMsg,
                    timestamp: Date.now()
                });
            }).catch(e => console.warn("Query save failed", e));
        }

        // ৩ বার পর পর না বুঝলে টিকিটের অফার দিবে
        if (failCount >= 3) {
            localStorage.setItem('maya_fail_count', '0'); // রিসেট
            return { 
                reply: `আমি মনে হয় আপনার কথাটি ঠিক বুঝতে পারছি না। 😔 আপনি কি আমাদের লাইভ সাপোর্টে একটি টিকিট তৈরি করতে চান?`, 
                buttons: ['অভিযোগ', 'উপজেলা মার্কেট'] 
            };
        }

        // রেন্ডম ফলব্যাক রিপ্লে
        const fallbacks = [
            `দুঃখিত, আমি আপনার কথাটি ঠিক বুঝতে পারিনি। আপনি কি বিষয়টা আরেকটু বুঝিয়ে বলবেন? 🤔`,
            `আমি এখনো শিখছি! আপনার এই প্রশ্নটি আমি নোট করে রেখেছি। ভবিষ্যতে হয়তো উত্তর দিতে পারবো। আপাতত আপনি নিচের বাটনগুলো ব্যবহার করতে পারেন-`,
            `হুমম... আপনার কথাটি আমার ডাটাবেসে নেই। 😅 নিচের বাটনগুলো থেকে কোনো সেবা নিতে পারেন-`
        ];
        return { 
            reply: fallbacks[Math.floor(Math.random() * fallbacks.length)], 
            buttons: ['উপজেলা মার্কেট', 'আমার পয়েন্ট', 'অভিযোগ'] 
        };
    }
}

// ==========================================
// 🛠️ HELPER FUNCTIONS (সাপোর্টিং লজিক)
// ==========================================

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

// Mock function for reward points (if not globally defined)
if(typeof window.addRewardPoints !== 'function') {
    window.addRewardPoints = function(points) {
        console.log(`[Maya] User rewarded with ${points} points.`);
        // Add your Firebase point update logic here later
    };
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

console.log("🌸 Maya AI (v3.0 Ultimate + Buttons & Voice) Loaded Successfully!");