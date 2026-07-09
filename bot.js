// ==========================================
// 🤖 ADVANCED AI BOT LOGIC (Persona: MAYA v3.0 Ultimate)
// Features: Buttons, TTS, Gamification, Fallback, Context Memory
// ==========================================

const BOT_UID = "smart_bot_ira";

// --------------------------------------------------------
// ১. চ্যাট স্টার্ট এবং ইনিশিয়ালাইজেশন
// --------------------------------------------------------
window.startBotChat = () => {
    window.currentChatUser = { uid: BOT_UID, name: "ইরা" };
    
    // পূর্ববর্তী কোনো বন্ধুদের চ্যাটের ডাটাবেস লিসেনার সচল থাকলে তা বন্ধ করুন
    if (window.currentChatListenerRef) {
        try {
            const { off } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
            off(window.currentChatListenerRef);
        } catch(e) { console.warn(e); }
        window.currentChatListenerRef = null;
    }

    const proceedBotChat = () => {
        if (typeof window.switchPage === 'function') {
            try { window.switchPage('messages'); } catch(e) { console.warn(e); }
        }
        
        const chatListView = document.getElementById('chat-list-view');
        const chatConvView = document.getElementById('chat-conversation-view');
        if(chatListView) chatListView.classList.add('hidden', 'hidden-custom');
        if(chatConvView) chatConvView.classList.remove('hidden', 'hidden-custom');
        
        const isMuted = localStorage.getItem('maya_voice_muted') === 'true';
        const speakerIcon = isMuted ? 'fa-volume-xmark text-red-500' : 'fa-volume-high text-green-600';
        
        const hName = document.getElementById('chat-header-name');
        const hImg = document.getElementById('chat-header-img');
        
        if (hName) {
            hName.innerHTML = `ইরা <span class="bg-green-100 text-green-600 text-[9px] px-2 py-0.5 rounded-full ml-1 font-extrabold uppercase border border-green-200">AI</span> <button onclick="window.toggleMayaVoice()" class="ml-2 focus:outline-none" title="ভয়েস মিউট/আনমিউট করুন"><i id="maya-mute-icon" class="fa-solid ${speakerIcon}"></i></button>`;
        }
        if (hImg) {
            hImg.innerHTML = `<div class="w-full h-full bg-green-600 text-white flex items-center justify-center text-xl"><i class="fa-solid fa-user-astronaut"></i></div>`;
        }
        
        history.pushState({ page: 'chat-conversation', uid: BOT_UID }, "", "#bot-chat");
        
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

        localStorage.removeItem('maya_context');
        localStorage.setItem('maya_fail_count', '0');
        loadBotMessages();
    };

    if (typeof window.loadMessagesUI === 'function') {
        window.loadMessagesUI().then(proceedBotChat).catch(proceedBotChat);
    } else {
        proceedBotChat();
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
    const div = document.getElementById('messages-container');
    if (!div) return;
    
    let html = "";
    
    msgs.forEach((m) => {
        const isMe = m.sender === 'me';
        const avatarHtml = isMe ? '' : `<div class="w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-[12px] mr-2 shrink-0 mt-auto shadow-sm"><i class="fa-solid fa-user-astronaut"></i></div>`;
        const bubbleColor = isMe ? 'bg-green-600 text-white rounded-[18px_18px_0_18px]' : 'bg-white border border-gray-200 text-gray-800 rounded-[18px_18px_18px_0] shadow-sm';
        
        html += `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 animate-fade">
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
    const input = document.getElementById('msg-input');
    if (input) {
        input.value = cleanText;
        window.sendMsg(); 
    }
};

// --------------------------------------------------------
// ৪. ইউজার ইন্টারঅ্যাকশন এবং টাইপিং ইফেক্ট
// --------------------------------------------------------
function handleBotInteraction(imageUrl, voiceUrl) {
    const input = document.getElementById('msg-input');
    if (!input) return;
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
        typingStatus.innerHTML = '<span class="text-green-600 font-bold"><i class="fa-solid fa-pen"></i> Ira is typing...</span>';
        typingStatus.classList.remove('hidden');
    }

    const typingDelay = Math.min(Math.max(text.length * 30, 800), 2000);

    setTimeout(() => {
        const botResponse = getAdvancedBotReply(text.toLowerCase(), text);
        
        botHistory.push({ 
            sender: 'bot', 
            text: botResponse.reply, 
            buttons: botResponse.buttons, 
            timestamp: Date.now() 
        });
        localStorage.setItem('maya_chat_history', JSON.stringify(botHistory));
        
        if(typingStatus) typingStatus.classList.add('hidden');
        renderBotMessages(botHistory);
        if(window.playSound) window.playSound('message');
        
        const isVoiceMuted = localStorage.getItem('maya_voice_muted') === 'true';
        if ('speechSynthesis' in window && !isVoiceMuted) {
            window.speechSynthesis.cancel();
            
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
// 🧠 ৫. ইরার ব্রেইন (Ultimate Logic Controller)
// --------------------------------------------------------
function getAdvancedBotReply(msg, originalMsg) {
    const hasWords = (wordsArray) => wordsArray.some(w => msg.includes(w));
    
    const generateResponse = () => {
        const userName = window.userDetails?.name?.split(' ')[0] || 'বন্ধু';
        const currentContext = localStorage.getItem('maya_context');
        const addr = getGenderAddressing();
        
        if (currentContext && hasWords(['cancel', 'বাতিল', 'exit', 'বাহির', 'বাদ দাও', 'skip', 'স্কিপ'])) {
            localStorage.removeItem('maya_context');
            localStorage.removeItem('donor_temp_bg');
            return {
                reply: `ঠিক আছে বন্ধু, বিষয়টি এখানেই বাদ দিচ্ছি। চলুন নতুন কোনো বিষয় নিয়ে কথা বলি! 😊`,
                buttons: ['🛍️ উপজেলা মার্কেট', '💰 আমার পয়েন্ট', '🕌 নামাজের সময়']
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
                    buttons: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'বাতিল করুন']
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

        if (currentContext === 'ask_blood_group') {
            localStorage.removeItem('maya_context');
            saveUserDataToFirebase('blood_group', originalMsg);
            return { reply: `ধন্যবাদ! আপনার রক্তের গ্রুপ (${originalMsg}) প্রোফাইলে যুক্ত করা হয়েছে। ❤️` };
        }
        
        if (currentContext === 'ask_profession') {
            localStorage.removeItem('maya_context');
            saveUserDataToFirebase('profession', originalMsg);
            return { reply: `আর অসাধারণ পেশা! আপনার পেশা (${originalMsg}) প্রোফাইলে যুক্ত করে নিলাম। 🌟\n\nএখন বলুন, পাথরঘাটা অ্যাপের কোনো সেবা কি আপনার দরকার?`, buttons: ['উপজেলা মার্কেট', 'ডাক্তার ও হাসপাতাল'] };
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
                return { reply: `🎉 একদম সঠিক উত্তর! পুকুর কাটলেই বড় হয়। আপনার ব্রেন তো খুব শার্প!\n\n🎁 **উপহার:** সঠিক উত্তরের জন্য আপনার একাউন্টে ৫ পয়েন্ট যোগ করা হয়েছে!`, buttons: ['আরেকটি ধাঁধা', 'আমার পয়েন্ট'] };
            }
            return { reply: `ইশশ! একটু ভুল হয়ে গেল। সঠিক উত্তরটি হবে "পুকুর" (পুকুর কাটলে বড় হয়)। কোনো ব্যাপার না, আবার চেষ্টা করতে চাইলে 'ধাঁধা' লিখুন। 😉`, buttons: ['ধাঁধা'] };
        }
        
        if (currentContext === 'ask_riddle_2') {
            localStorage.removeItem('maya_context');
            if (hasWords(['matha', 'মাথা'])) {
                if (typeof window.addRewardPoints === 'function') window.addRewardPoints(5);
                return { reply: `🎉 কংগ্রাচুলেশনস! সঠিক উত্তর! মাথা খারাপ হলেই মানুষ সেটা অন্যের ঘাড়ে চাপাতে চায়। \n\n🎁 **উপহার:** ৫ পয়েন্ট! 😎`, buttons: ['পয়েন্ট চেক করুন'] };
            }
            return { reply: `হলো না! উত্তরটা হতো "মাথা" (মাথা খারাপ হলেই মানুষ অন্যের ঘাড়ে চাপায়)। মজাই লাগলো, তাই না? 😂` };
        }

        if (currentContext === 'ask_ptg_quiz_1') {
            localStorage.removeItem('maya_context');
            if (hasWords(['laldia', 'লালদিয়া', 'লালদিয়া'])) {
                if (typeof window.addRewardPoints === 'function') window.addRewardPoints(10);
                return { reply: `🎉 ওয়াও! সঠিক উত্তর। লালদিয়া সমুদ্র সৈকত পাথরঘাটার একটি অন্যতম সুন্দর পর্যটন কেন্দ্র। \n\n🎁 **উপহার:** আরও ১০ পয়েন্ট জিতে নিলেন! 🏖️`, buttons: ['আমার পয়েন্ট'] };
            }
            return { reply: `হলো না! উত্তরটি হতো "লালদিয়া সমুদ্র সৈকত"। আবার চেষ্টা করতে 'পাথরঘাটা কুইজ' লিখুন।` };
        }

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

        if (hasWords(['password', 'পাসওয়ার্ড', 'পাসওয়ার্ড ভুলে'])) {
            return { reply: `🔐 **পাসওয়ার্ড পরিবর্তন গাইড:**\nপাসওয়ার্ড ভুলে গেলে লগইন পেজের "পাসওয়ার্ড ভুলে গেছেন?" অপশনে ক্লিক করে আপনার ইমেইল দিন। সেখানে একটি রিসেট লিংক পাঠানো হবে।` };
        }
        if (hasWords(['number change', 'নাম্বার চেঞ্জ', 'email change', 'ইমেইল পরিবর্তন'])) {
            return { reply: `📱 **정보 পরিবর্তন:**\nআপনি অ্যাপের 'প্রোফাইল' > 'একাউন্ট ডিটেইলস' থেকে আপনার মোবাইল নাম্বার ও ইমেইল পরিবর্তন করতে পারবেন।` };
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

        if (hasWords(['obhijog', 'অভিযোগ', 'ticket', 'report', 'সমস্যা হয়েছে', 'admin dako', 'অ্যাডমিন'])) {
            localStorage.setItem('maya_context', 'creating_ticket');
            return { reply: `আমি আপনার সমস্যাটি অ্যাডমিনের কাছে পাঠাতে প্রস্তুত। 📝\n\nদয়া করে আপনার সমস্যা বা অভিযোগটি এক মেসেজে বিস্তারিতভাবে লিখে পাঠান।` };
        }

        if (hasWords(['namaj', 'নামাজ', 'ওয়াক্ত', 'azan', 'আযান'])) {
            return { reply: `🕌 **আজকের নামাজের সম্ভাব্য সময়সূচি:**\nফজর: ৫:২০ এএম\nযোহর: ১:৩০ পিএম\nআসর: ৪:৪৫ পিএম\nমাগরিব: ৬:১০ পিএম\nএশা: ৭:৩০ পিএম` };
        }

        if (hasWords(['point', 'পয়েন্ট', 'balance', 'ব্যালেন্স'])) {
            const userPoints = window.userDetails?.total_points || 0;
            return { reply: `💰 আপনার বর্তমান ব্যালেন্স হলো **${userPoints} পয়েন্ট**!`, buttons: ['ইনকাম কিভাবে করব?'] };
        }

        if (hasWords(['taka', 'টাকা', 'income', 'ইনকাম'])) {
            return { reply: `পাথরঘাটা ডিজিটাল অ্যাপে খুব সহজেই পয়েন্ট জমিয়ে টাকা ইনকাম করতে পারেন! 🤩\n১. বন্ধুদের রেফার করে।\n২. ভালো পোস্ট করে।\n৩. পোস্টে লাইক/কমেন্ট করে।` };
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
    };

    let response = generateResponse();

    if (response && !localStorage.getItem('maya_context') && !response.reply.includes('?')) {
        let proactiveText = "";
        
        if (!window.userDetails?.is_donor && !sessionStorage.getItem('maya_asked_donor')) {
            localStorage.setItem('maya_context', 'ask_donor_interest');
            sessionStorage.setItem('maya_asked_donor', 'true');
            proactiveText = `\n\n💡 আচ্ছা বন্ধু, আমাদের পাথরঘাটার বহু মানুষ মাঝেমধ্যে জরুরি রক্তের জন্য খুব সমস্যায় পড়েন। আপনি কি আমাদের অ্যাপে একজন 'রক্তদাতা' (Blood Donor) হিসেবে যুক্ত হতে চান? ❤️`;
            response = response || { reply: "" };
            response.buttons = ['হ্যাঁ, আমি রাজী ❤️', 'না, পরে ভাববো'];
        }

        if (proactiveText) {
            response.reply += proactiveText; 
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
            reply: `দুঃখিত, আমি আপনার কথাটি ঠিক বুঝতে পারিনি। আপনি কি বিষয়টা আরেকতু বুঝিয়ে বলবেন? 🤔`, 
            buttons: ['উপজেলা মার্কেট', 'আমার পয়েন্ট'] 
        };
    }
}

// ==========================================
// 🛠️ HELPER FUNCTIONS
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

console.log("🌸 Ira AI (v3.0 Ultimate) Fix Installed Successfully!");