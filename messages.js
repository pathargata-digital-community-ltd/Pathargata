// messages.js
import {
    ref, push, set, onValue, get, update, remove, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Global Variables
window.currentReplyTo = null;
window.selectedMsgForOptions = null;
window.selectedChatListUid = null;
let pressTimer;
let mediaRecorder;
let audioChunks = [];

// Pagination & Listeners
let currentChatUnsubscribe = null;
let typingUnsubscribe = null;
let currentChatLimit = 20;
let isFetchingOlder = false;
let lastScrollHeight = 0;

// Chat Helper Function
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

// Format Time
window.formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
};

// --- START & CLOSE CHAT ---
window.startChat = async (uid, name) => {
    try {
        window.currentChatUser = { uid, name };
        window.switchPage('messages');
        
        // Reset Pagination
        currentChatLimit = 20; 
        isFetchingOlder = false;

        const friendData = await window.getUserData(uid);
        window.currentChatUser.profile_pic = friendData?.profile_pic || null;

        document.getElementById('chat-list-view').classList.add('hidden', 'hidden-custom');
        document.getElementById('chat-conversation-view').classList.remove('hidden', 'hidden-custom');
        document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
        
        let headerImg = document.getElementById('chat-header-img');
        if (window.currentChatUser.profile_pic) {
            headerImg.innerHTML = `<img src="${window.currentChatUser.profile_pic}" class="w-full h-full object-cover">`;
        } else {
            headerImg.innerHTML = window.escapeHTML(name).charAt(0);
        }
        
        history.pushState({ page: 'chat-conversation', uid }, "", "#chat");
        window.loadMessages(uid);
        window.cancelReply(); 

        // Listen for typing status
        const typingRef = ref(window.db, `user_chats/${window.currentUser.uid}/${uid}/isTyping`);
        typingUnsubscribe = onValue(typingRef, (snap) => {
            const isTyping = snap.val();
            const typingEl = document.getElementById('chat-header-typing');
            if(isTyping) {
                typingEl.classList.remove('hidden');
                document.getElementById('chat-header-name').classList.add('text-sm');
            } else {
                typingEl.classList.add('hidden');
                document.getElementById('chat-header-name').classList.remove('text-sm');
            }
        });

    } catch (error) {
        console.error("Error starting chat:", error);
        window.showToast("চ্যাট ওপেন করতে সমস্যা হয়েছে", "error");
    }
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.add('hidden', 'hidden-custom');
    window.currentChatUser = null;
    window.cancelReply();
    
    if (currentChatUnsubscribe) { currentChatUnsubscribe(); currentChatUnsubscribe = null; }
    if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
};

// Handle My Typing Event
let typingTimer;
document.getElementById('msg-input').addEventListener('input', function() {
    if(!window.currentChatUser) return;
    const dbRef = ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`);
    update(dbRef, { isTyping: true });

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { update(dbRef, { isTyping: false }); }, 1500);
});

// --- QUICK CHAT FRIENDS (Top Bar) ---
window.loadQuickChatFriends = async () => {
    try {
        const div = document.getElementById('quick-chat-friends');
        if (!window.myFriends || window.myFriends.length === 0) {
            div.innerHTML = '<span class="text-xs text-gray-400">কোনো বন্ধু নেই</span>';
            return;
        }
        const friendsData = await Promise.all(window.myFriends.slice(0, 15).map(uid => window.getUserData(uid)));
        div.innerHTML = friendsData.filter(u => u).map(u => {
            let av = u.profile_pic ? 
                `<div class="w-12 h-12 relative"><img src="${u.profile_pic}" class="w-full h-full rounded-full object-cover shadow-sm"><div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>` : 
                `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-lg relative shadow-sm">${window.escapeHTML(u.name).charAt(0)}<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>`;
            return `<div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="flex flex-col items-center cursor-pointer min-w-[50px] transition-transform active:scale-95">${av}<span class="text-[10px] text-gray-600 mt-1 truncate w-14 text-center font-bold">${window.escapeHTML(u.name).split(' ')[0]}</span></div>`;
        }).join('');
    } catch (error) {
        console.error("Error loading quick friends:", error);
    }
};

// --- CHAT LIST LOGIC (WITH ARCHIVE & DELETE) ---
let listTouchStartX = 0;
let listPressTimer;

window.handleChatListTouchStart = (e, peerUid, name) => {
    listTouchStartX = e.changedTouches ? e.changedTouches[0].screenX : e.screenX;
    listPressTimer = setTimeout(() => {
        window.openChatListOptions(peerUid, name);
    }, 600);
};

window.handleChatListTouchMove = () => clearTimeout(listPressTimer);
window.handleChatListTouchEnd = () => clearTimeout(listPressTimer);

window.openChatListOptions = (peerUid, name) => {
    window.selectedChatListUid = peerUid;
    document.getElementById('chat-list-name-display').innerText = window.escapeHTML(name);
    document.getElementById('chat-list-options-modal').classList.remove('hidden');
    if(navigator.vibrate) navigator.vibrate(50);
};

window.closeChatListOptions = () => {
    document.getElementById('chat-list-options-modal').classList.add('hidden');
    window.selectedChatListUid = null;
};

window.archiveChat = () => {
    if(!window.selectedChatListUid) return;
    update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.selectedChatListUid}`), { isArchived: true });
    window.closeChatListOptions();
    window.showToast("চ্যাট আর্কাইভ করা হয়েছে");
};

window.deleteChat = async () => {
    if(!window.selectedChatListUid) return;
    const chatId = window.getChatId(window.currentUser.uid, window.selectedChatListUid);
    try {
        await remove(ref(window.db, `user_chats/${window.currentUser.uid}/${window.selectedChatListUid}`));
        await remove(ref(window.db, `chats/${chatId}`)); 
        window.closeChatListOptions();
        window.showToast("সকল ডাটা রিমুভ করা হয়েছে");
    } catch(e) { window.showToast("ডিলিট করতে সমস্যা হয়েছে", "error"); }
};

window.loadChatList = (uid) => {
    const container = document.getElementById('chat-list-container');
    container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">লোড হচ্ছে...</p>';

    // গ্লোবাল ভেরিয়েবল চেক
    if (!window.db || !uid) {
        container.innerHTML = '<p class="text-center text-red-500 mt-10 text-sm">সিস্টেম এরর: ডাটাবেস কানেকশন পাওয়া যায়নি।</p>';
        return;
    }

    // অনভ্যালু (onValue) এর ৩য় প্যারামিটারে Error হ্যান্ডেল করা হয়েছে
    onValue(ref(window.db, `user_chats/${uid}`), async (snap) => {
        const list = snap.val();
        if (!list || Object.keys(list).length === 0) {
            container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">কোনো কনভারসেশন নেই</p>';
            return;
        }

        try {
            const promises = Object.entries(list)
                .filter(([_, info]) => !info.isArchived) // Hide Archived
                .sort((a, b) => b[1].timestamp - a[1].timestamp)
                .map(async ([peerUid, info]) => {
                    try {
                        // যদি কোনো নির্দিষ্ট ইউজারের ডাটা পেতে সমস্যা হয়, তবে ক্র্যাশ না করে null রিটার্ন করবে
                        const userData = await window.getUserData(peerUid);
                        return { peerUid, info, profilePic: userData?.profile_pic };
                    } catch (userError) {
                        console.warn(`Failed to load data for user: ${peerUid}`, userError);
                        return { peerUid, info, profilePic: null }; 
                    }
                });

            const chatItems = await Promise.all(promises);

            container.innerHTML = chatItems.map(({ peerUid, info, profilePic }) => {
                let rawLastMsg = info.lastMessage || "";
                let prefix = rawLastMsg.startsWith("You: ") ? "You: " : "";
                if(prefix) rawLastMsg = rawLastMsg.substring(5);

                if (!rawLastMsg.includes("📷") && !rawLastMsg.includes("🎤")) {
                    try { rawLastMsg = window.decryptMsg(rawLastMsg); } catch(e) {}
                }
                
                // Show Typing Status
                let displayMsg = info.isTyping ? 
                    `<span class="text-green-500 font-bold italic animate-pulse">Typing...</span>` : 
                    `${prefix}${window.escapeHTML(rawLastMsg)}`;

                // যদি প্রোফাইল পিকচার না থাকে, নামের প্রথম অক্ষর দেখাবে
                let safeName = info.name ? window.escapeHTML(info.name) : "Unknown";
                let av = profilePic ?
                    `<img src="${profilePic}" class="w-12 h-12 rounded-full shrink-0 object-cover border border-gray-100 shadow-sm">` :
                    `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-xl shrink-0 shadow-sm">${safeName.charAt(0)}</div>`;

                return `
                <div onclick="startChat('${peerUid}', '${safeName}')" 
                     ontouchstart="handleChatListTouchStart(event, '${peerUid}', '${safeName}')"
                     ontouchmove="handleChatListTouchMove(event)"
                     ontouchend="handleChatListTouchEnd(event)"
                     class="p-4 border-b bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors select-none">
                    ${av}
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <h4 class="font-bold text-gray-800 text-base truncate pr-2">${safeName}</h4>
                            <span class="text-[10px] text-gray-400 shrink-0 font-medium">${window.timeAgo(info.timestamp)}</span>
                        </div>
                        <p class="text-sm text-gray-500 truncate block">${displayMsg}</p>
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error("Chat list rendering error:", err);
            // Catch ব্লকে লোডিং পরিবর্তন করে এরর মেসেজ দেখানো হলো
            container.innerHTML = '<p class="text-center text-red-500 mt-10 text-sm">ডাটা লোড করতে সমস্যা হয়েছে!</p>';
        }
    }, (error) => {
        // Firebase Permission Error Handle
        console.error("Firebase error:", error);
        container.innerHTML = '<p class="text-center text-red-500 mt-10 text-sm">সার্ভার সংযোগে সমস্যা বা পারমিশন নেই!</p>';
    });
};
                
                // Show Typing Status
                let displayMsg = info.isTyping ? 
                    `<span class="text-green-500 font-bold italic animate-pulse">Typing...</span>` : 
                    `${prefix}${window.escapeHTML(rawLastMsg)}`;

                let av = profilePic ?
                    `<img src="${profilePic}" class="w-12 h-12 rounded-full shrink-0 object-cover border border-gray-100 shadow-sm">` :
                    `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-xl shrink-0 shadow-sm">${window.escapeHTML(info.name).charAt(0)}</div>`;

                return `
                <div onclick="startChat('${peerUid}', '${window.escapeHTML(info.name)}')" 
                     ontouchstart="handleChatListTouchStart(event, '${peerUid}', '${window.escapeHTML(info.name)}')"
                     ontouchmove="handleChatListTouchMove(event)"
                     ontouchend="handleChatListTouchEnd(event)"
                     class="p-4 border-b bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors select-none">
                    ${av}
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <h4 class="font-bold text-gray-800 text-base truncate pr-2">${window.escapeHTML(info.name)}</h4>
                            <span class="text-[10px] text-gray-400 shrink-0 font-medium">${window.timeAgo(info.timestamp)}</span>
                        </div>
                        <p class="text-sm text-gray-500 truncate block">${displayMsg}</p>
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error(err);
        }
    });
};

// --- CUSTOM AUDIO PLAYER UI LOGIC ---
window.currentPlayingAudioId = null;

window.toggleCustomAudio = (msgId) => {
    const audioEl = document.getElementById(`audio-${msgId}`);
    const iconEl = document.getElementById(`play-icon-${msgId}`);

    if (window.currentPlayingAudioId && window.currentPlayingAudioId !== msgId) {
        const prevAudio = document.getElementById(`audio-${window.currentPlayingAudioId}`);
        const prevIcon = document.getElementById(`play-icon-${window.currentPlayingAudioId}`);
        if(prevAudio) { prevAudio.pause(); prevIcon.className = "fa-solid fa-play text-xs ml-0.5"; }
    }

    if (audioEl.paused) {
        audioEl.play();
        iconEl.className = "fa-solid fa-pause text-xs";
        window.currentPlayingAudioId = msgId;
    } else {
        audioEl.pause();
        iconEl.className = "fa-solid fa-play text-xs ml-0.5";
        window.currentPlayingAudioId = null;
    }
};

window.updateAudioProgress = (msgId) => {
    const audioEl = document.getElementById(`audio-${msgId}`);
    const progressEl = document.getElementById(`progress-${msgId}`);
    if(audioEl.duration) {
        const percentage = (audioEl.currentTime / audioEl.duration) * 100;
        progressEl.style.width = percentage + '%';
    }
};

window.audioEnded = (msgId) => {
    document.getElementById(`play-icon-${msgId}`).className = "fa-solid fa-play text-xs ml-0.5";
    document.getElementById(`progress-${msgId}`).style.width = '0%';
    if (window.currentPlayingAudioId === msgId) window.currentPlayingAudioId = null;
};


// --- LOAD MESSAGES (WITH TIMESTAMPS OUTSIDE & CUSTOM AUDIO) ---
window.loadMessages = (otherUid, isPagination = false) => {
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    
    if (!isPagination) div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">লোড হচ্ছে...</p>';

    div.onscroll = () => {
        if (div.scrollTop === 0 && !isFetchingOlder) {
            isFetchingOlder = true;
            lastScrollHeight = div.scrollHeight;
            currentChatLimit += 20; 
            window.loadMessages(otherUid, true);
        }
    };

    if (currentChatUnsubscribe) currentChatUnsubscribe();

    currentChatUnsubscribe = onValue(query(ref(window.db, `chats/${chatId}`), limitToLast(currentChatLimit)), (snap) => {
        const msgs = snap.val() || {};
        if (Object.keys(msgs).length > 0) {
            let html = '';
            let updatesForSeen = {}; 
            let unreadFound = false;

            Object.entries(msgs).forEach(([msgId, m]) => {
                if (m[`deletedFor_${window.currentUser.uid}`]) return;

                const isMe = m.sender === window.currentUser.uid;
                let content = '';

                if (!isMe && m.status !== 'seen') {
                    updatesForSeen[`chats/${chatId}/${msgId}/status`] = 'seen';
                    unreadFound = true;
                }

                // Reply Context Block
                if (m.replyToText) {
                    content += `<div class="bg-black/10 p-2 rounded-lg text-xs mb-1.5 border-l-4 ${isMe?'border-white text-white':'border-green-500 text-gray-600'} opacity-90"><i class="fa-solid fa-reply mr-1"></i>${window.escapeHTML(m.replyToText)}</div>`;
                }

                // Image
                if (m.image) content += `<img src="${m.image}" class="rounded-xl mb-1 max-w-[200px] h-auto cursor-pointer shadow-sm" onclick="window.open('${m.image}')">`;
                
                // Beautiful Custom Audio Player
                if (m.audio) {
                    content += `
                    <div class="flex items-center gap-3 ${isMe ? 'bg-white/20' : 'bg-green-50'} rounded-full p-1.5 w-[200px] mb-1">
                        <button onclick="toggleCustomAudio('${msgId}')" class="w-9 h-9 ${isMe ? 'bg-white text-green-600' : 'bg-green-500 text-white'} rounded-full flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95">
                            <i id="play-icon-${msgId}" class="fa-solid fa-play text-xs ml-0.5"></i>
                        </button>
                        <div class="flex-1 h-1.5 bg-black/10 rounded-full overflow-hidden relative">
                            <div id="progress-${msgId}" class="absolute left-0 top-0 h-full ${isMe ? 'bg-white' : 'bg-green-500'} w-0 transition-all duration-75"></div>
                        </div>
                        <audio id="audio-${msgId}" src="${m.audio}" class="hidden" ontimeupdate="updateAudioProgress('${msgId}')" onended="audioEnded('${msgId}')"></audio>
                    </div>`;
                }

                // Text Content
                if (m.text) {
                    try { content += `<span class="leading-relaxed block">${window.escapeHTML(window.decryptMsg(m.text))}</span>`; } 
                    catch(e) { content += `<span>[Error]</span>`; }
                }

                // Status & Time indicator (Placed below the bubble)
                let statusIcon = '';
                if (isMe) {
                    if (m.status === 'seen') {
                        statusIcon = window.currentChatUser.profile_pic ? 
                            `<img src="${window.currentChatUser.profile_pic}" class="w-3.5 h-3.5 rounded-full object-cover ml-1 shadow-sm">` : 
                            `<i class="fa-solid fa-circle-check text-green-500 text-[11px] ml-1"></i>`;
                    } else if (m.status === 'delivered') {
                        statusIcon = `<i class="fa-solid fa-circle-check text-gray-500 text-[11px] ml-1"></i>`;
                    } else {
                        statusIcon = `<i class="fa-regular fa-circle-check text-gray-400 text-[11px] ml-1"></i>`;
                    }
                }
                const timeStr = `<div class="text-[10px] text-gray-400 mt-1 flex items-center ${isMe ? 'justify-end' : 'justify-start'} w-full font-medium px-1">
                    ${window.formatMessageTime(m.timestamp)} ${statusIcon}
                </div>`;

                // Profile Picture (Friend)
                let profilePicHtml = '';
                if (!isMe) {
                    let pPic = window.currentChatUser.profile_pic ? 
                        `<img src="${window.currentChatUser.profile_pic}" class="w-7 h-7 rounded-full object-cover shadow-sm">` : 
                        `<div class="w-7 h-7 bg-green-200 rounded-full flex items-center justify-center text-xs font-bold text-green-800 shadow-sm">${window.currentChatUser.name.charAt(0)}</div>`;
                    profilePicHtml = `<div class="mr-2 self-end mb-5">${pPic}</div>`;
                }

                let rawText = m.text ? window.decryptMsg(m.text).replace(/'/g, "\\'") : (m.image ? "Photo" : "Voice Note");

                // Message Wrapper Construction
                html += `
                <div class="flex w-full ${isMe ? 'justify-end' : 'justify-start'} mb-3 group" 
                     id="msg-row-${msgId}" data-raw-text="${rawText}">
                    ${profilePicHtml}
                    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]" >
                        <!-- Draggable Bubble Wrapper for Swipe to Reply -->
                        <div id="bubble-wrap-${msgId}" 
                             ontouchstart="handleMsgTouchStart(event, '${msgId}', '${rawText}', ${isMe})" 
                             ontouchend="handleMsgTouchEnd(event)" 
                             ontouchmove="handleMsgTouchMove(event)"
                             class="px-4 py-2.5 shadow-sm text-[15px] break-words relative z-10
                                    ${isMe ? 'bg-gradient-to-br from-green-400 to-green-600 text-white rounded-2xl rounded-br-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-2xl rounded-bl-sm'}">
                            ${content}
                        </div>
                        ${timeStr}
                    </div>
                </div>`;
            });

            div.innerHTML = html;
            if (unreadFound) update(ref(window.db), updatesForSeen).catch(console.error);

            if (isPagination) {
                div.scrollTop = div.scrollHeight - lastScrollHeight;
                isFetchingOlder = false;
            } else {
                setTimeout(() => { div.scrollTop = div.scrollHeight; }, 50);
            }
        } else {
            div.innerHTML = '<p class="text-center text-sm text-gray-400 mt-10"><i class="fa-solid fa-hand-wave text-2xl mb-2 block"></i>কথপোকথন শুরু করুন</p>';
        }
    });
};


// --- SEND MESSAGE & IMAGE UPLOAD ---
window.sendMsg = async (imageUrl = null, audioUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text && !imageUrl && !audioUrl) return;
    
    const btn = document.getElementById('btn-chat-send');
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    const ts = Date.now();

    try {
        const encryptedText = text ? window.encryptMsg(text) : "";
        const msgData = { 
            sender: window.currentUser.uid, 
            timestamp: ts,
            status: 'sent'
        };
        
        if (text) msgData.text = encryptedText;
        if (imageUrl) msgData.image = imageUrl;
        if (audioUrl) msgData.audio = audioUrl;

        // Attach reply info
        if (window.currentReplyTo) {
            msgData.replyToText = window.currentReplyTo;
        }

        // Push to Firebase
        await push(ref(window.db, `chats/${chatId}`), msgData);

        // Update Last Message
        let lastMsgText = encryptedText;
        if (imageUrl) lastMsgText = text ? "📷 " + encryptedText : "📷 ছবি পাঠিয়েছেন";
        if (audioUrl) lastMsgText = "🎤 ভয়েস মেসেজ";

        const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsgText, timestamp: ts, isTyping: false };
        const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsgText, timestamp: ts };

        update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);
        update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);

        // Reset UI
        input.value = "";
        window.cancelReply(); 
        btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-0.5"></i>';
        btn.disabled = false;
        
        // Scroll to bottom
        const div = document.getElementById('messages-container');
        setTimeout(() => { div.scrollTop = div.scrollHeight; }, 50);

    } catch (error) {
        console.error("Error sending message:", error);
        window.showToast("মেসেজ পাঠাতে সমস্যা হয়েছে", "error");
        btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-0.5"></i>';
        btn.disabled = false;
    }
};

// --- SWIPE TO REPLY (WITH SMOOTH ANIMATION) & LONG PRESS ---
let swipeTouchStartX = 0;
let swipeEl = null;

window.handleMsgTouchStart = (e, msgId, msgText, isMe) => {
    swipeTouchStartX = e.changedTouches[0].screenX;
    swipeEl = document.getElementById(`bubble-wrap-${msgId}`);
    if(swipeEl) swipeEl.style.transition = 'none'; // Disable transition for instant follow
    
    pressTimer = setTimeout(() => {
        window.openMsgOptions(msgId, msgText, isMe);
    }, 600);
};

window.handleMsgTouchMove = (e) => {
    clearTimeout(pressTimer); 
    if(!swipeEl) return;
    
    let diffX = e.changedTouches[0].screenX - swipeTouchStartX;
    if (diffX > 0 && diffX < 80) { // Max swipe limit 80px
        swipeEl.style.transform = `translateX(${diffX}px)`;
    }
};

window.handleMsgTouchEnd = (e) => {
    clearTimeout(pressTimer); 
    if(!swipeEl) return;

    let diffX = e.changedTouches[0].screenX - swipeTouchStartX;
    
    // Smooth Snap Back Animation
    swipeEl.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    swipeEl.style.transform = 'translateX(0px)';

    if (diffX > 50) {
        if(navigator.vibrate) navigator.vibrate(50);
        let row = e.target.closest('[id^="msg-row-"]');
        let textToReply = row ? row.getAttribute('data-raw-text') : "Message";
        window.setupReply(textToReply.substring(0, 40) + (textToReply.length > 40 ? '...' : ''));
    }
    swipeEl = null;
};

window.setupReply = (text) => {
    window.currentReplyTo = text;
    document.getElementById('reply-context-view').classList.remove('hidden');
    document.getElementById('reply-to-msg').innerText = text;
    document.getElementById('msg-input').focus();
};

window.cancelReply = () => {
    window.currentReplyTo = null;
    document.getElementById('reply-context-view').classList.add('hidden');
};


// --- MESSAGE OPTIONS (UNSEND, REMOVE, FORWARD) ---
window.openMsgOptions = (msgId, text, isMe) => {
    if(navigator.vibrate) navigator.vibrate(50);
    window.selectedMsgForOptions = { msgId, text };
    document.getElementById('msg-options-modal').classList.remove('hidden');
    
    const unsendBtn = document.getElementById('btn-unsend');
    if(isMe) unsendBtn.style.display = 'flex';
    else unsendBtn.style.display = 'none';
};

window.closeMsgOptions = () => {
    document.getElementById('msg-options-modal').classList.add('hidden');
    window.selectedMsgForOptions = null;
};

window.unsendMessage = async () => {
    if(!window.selectedMsgForOptions || !window.currentChatUser) return;
    try {
        const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
        await remove(ref(window.db, `chats/${chatId}/${window.selectedMsgForOptions.msgId}`));
        window.showToast("Message Unsent");
        window.closeMsgOptions();
    } catch (error) {
        window.showToast("Unsend করতে সমস্যা হয়েছে", "error");
    }
};

window.removeMessageForMe = async () => {
    if(!window.selectedMsgForOptions || !window.currentChatUser) return;
    try {
        const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
        let updates = {};
        updates[`deletedFor_${window.currentUser.uid}`] = true;
        await update(ref(window.db, `chats/${chatId}/${window.selectedMsgForOptions.msgId}`), updates);
        window.closeMsgOptions();
    } catch (error) {
        window.showToast("Remove করতে সমস্যা হয়েছে", "error");
    }
};

// --- FORWARD MESSAGE LOGIC ---
window.forwardMessage = () => {
    document.getElementById('msg-options-modal').classList.add('hidden');
    document.getElementById('forward-modal').classList.remove('hidden');
    
    const div = document.getElementById('forward-friends-list');
    
    if (!window.myFriends || window.myFriends.length === 0) {
        div.innerHTML = '<p class="text-center text-gray-400 mt-4">কোনো বন্ধু নেই</p>';
        return;
    }

    Promise.all(window.myFriends.map(uid => window.getUserData(uid)))
    .then(friendsData => {
        div.innerHTML = friendsData.filter(u => u).map(u => {
            return `
            <div class="flex items-center justify-between p-3 border-b hover:bg-gray-50">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700">
                        ${u.profile_pic ? `<img src="${u.profile_pic}" class="w-full h-full rounded-full object-cover">` : u.name.charAt(0)}
                    </div>
                    <span class="font-bold text-gray-800">${window.escapeHTML(u.name)}</span>
                </div>
                <button onclick="doForward('${u.uid}')" class="bg-green-500 text-white px-4 py-1 rounded-full text-sm">Send</button>
            </div>`;
        }).join('');
    }).catch(error => {
        div.innerHTML = '<p class="text-center text-red-400 mt-4">বন্ধু তালিকা লোড হয়নি</p>';
    });
};

window.closeForwardModal = () => {
    document.getElementById('forward-modal').classList.add('hidden');
};

window.doForward = async (targetUid) => {
    if(!window.selectedMsgForOptions) return;
    try {
        const chatId = window.getChatId(window.currentUser.uid, targetUid);
        const ts = Date.now();
        const encryptedText = window.encryptMsg(window.selectedMsgForOptions.text);

        const msgData = { 
            sender: window.currentUser.uid, 
            timestamp: ts,
            text: encryptedText,
            status: 'sent'
        };

        await push(ref(window.db, `chats/${chatId}`), msgData);
        window.showToast("Forwarded Successfully");
        window.closeForwardModal();
    } catch (error) {
        window.showToast("Forward করতে সমস্যা হয়েছে", "error");
    }
};

// --- VOICE RECORDING LOGIC ---
window.startVoiceRecord = async () => {
    const btn = document.getElementById('btn-voice-record');
    btn.classList.add('text-red-500', 'bg-red-100'); 
    btn.innerHTML = '<i class="fa-solid fa-stop"></i>';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => {
            audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            try {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "voice_msg.webm", { type: 'audio/webm' });
                
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-gray-500"></i>';
                btn.classList.remove('text-red-500', 'bg-red-100');
                
                window.uploadMediaToCloudinary(audioFile).then(res => {
                    window.sendMsg(null, res.url); 
                    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                }).catch(e => {
                    window.showToast("ভয়েস আপলোডে সমস্যা!", 'error');
                    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                });
            } catch (err) {
                window.showToast("ভয়েস প্রসেসিং এ সমস্যা", "error");
                btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            }
        };

        mediaRecorder.start();
    } catch (err) {
        console.error(err);
        window.showToast("মাইক্রোফোনের পারমিশন দিন!", "error");
        btn.classList.remove('text-red-500', 'bg-red-100');
        btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    }
};

window.stopVoiceRecord = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); 
    }
};

// --- IMAGE SELECTION LOGIC ---
window.handleChatImageSelect = () => {
    try {
        const file = document.getElementById('chat-img-input').files[0];
        if (file) {
            const btn = document.getElementById('btn-chat-send');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            window.uploadMediaToCloudinary(file).then(res => {
                window.sendMsg(res.url, null); 
                document.getElementById('chat-img-input').value = "";
            }).catch(e => {
                window.showToast("ছবি আপলোড হয়নি", 'error');
                btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-0.5"></i>';
                btn.disabled = false;
            });
        }
    } catch (error) {
        window.showToast("ছবি সিলেক্ট করতে সমস্যা", "error");
    }
};