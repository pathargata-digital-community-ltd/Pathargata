import {
    ref, push, set, onValue, get, update, query, limitToLast, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CHAT HELPER FUNCTIONS ---
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

let replyMessageData = null;
let showArchived = false;

window.startChat = (uid, name) => {
    window.currentChatUser = { uid, name };
    window.switchPage('messages');
    
    document.getElementById('chat-list-view').classList.add('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
    document.getElementById('chat-header-img').innerHTML = `<div class="w-full h-full bg-green-100 flex items-center justify-center">${window.escapeHTML(name).charAt(0)}</div>`;
    
    window.getUserData(uid).then(u => {
        if(u && u.profile_pic) {
            document.getElementById('chat-header-img').innerHTML = `<img src="${u.profile_pic}" class="w-full h-full object-cover">`;
        }
    });

    history.pushState({ page: 'chat-conversation', uid }, "", "#chat");
    window.loadMessages(uid);
    window.listenToTyping(uid);
    
    const chatId = window.getChatId(window.currentUser.uid, uid);
    update(ref(window.db, `user_chats/${window.currentUser.uid}/${uid}`), { unread: 0 });
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.add('hidden', 'hidden-custom');
    window.currentChatUser = null;
    cancelReply();
    
    if (window.currentPlayingAudio) {
        window.currentPlayingAudio.pause();
        window.currentPlayingAudio = null;
    }
    
    if(window.currentUser) {
        set(ref(window.db, `chats_typing/${window.currentUser.uid}`), false);
    }
};

window.searchChatFriends = async (val) => {
    const q = val.toLowerCase().trim();
    const container = document.getElementById('chat-list-container');
    
    if (!q) {
        window.loadChatList(window.currentUser.uid); 
        return;
    }
    
    const friendsData = await Promise.all(window.myFriends.map(uid => window.getUserData(uid)));
    const matched = friendsData.filter(u => u && u.name.toLowerCase().includes(q));
    
    if (matched.length > 0) {
        container.innerHTML = `<h4 class="px-4 py-2 text-xs font-bold text-gray-500">Search Results</h4>` + 
        matched.map(u => {
            let av = u.profile_pic ? 
                `<img src="${u.profile_pic}" class="w-12 h-12 rounded-full object-cover border border-gray-200">` : 
                `<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-700 text-xl">${window.escapeHTML(u.name).charAt(0)}</div>`;
            
            return `
            <div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="p-4 border-b bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-3">
                ${av}
                <div class="flex-1 font-bold text-gray-800">${window.escapeHTML(u.name)}</div>
            </div>`;
        }).join('');
    } else {
        container.innerHTML = '<p class="text-center text-gray-400 mt-5 text-sm">কাউকে পাওয়া যায়নি</p>';
    }
};

window.loadQuickChatFriends = async () => {
    const div = document.getElementById('quick-chat-friends');
    if (!window.myFriends || window.myFriends.length === 0) {
        div.innerHTML = '<span class="text-xs text-gray-400">কোনো বন্ধু নেই</span>';
        return;
    }
    const friendsData = await Promise.all(window.myFriends.slice(0, 15).map(uid => window.getUserData(uid)));
    div.innerHTML = friendsData.filter(u => u).map(u => {
        let av = u.profile_pic ? 
            `<div class="w-12 h-12 relative"><img src="${u.profile_pic}" class="w-full h-full rounded-full object-cover"><div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>` : 
            `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-lg relative">${window.escapeHTML(u.name).charAt(0)}<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>`;
        return `<div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="flex flex-col items-center cursor-pointer min-w-[50px]">${av}<span class="text-[10px] text-gray-600 mt-1 truncate w-14 text-center font-bold">${window.escapeHTML(u.name).split(' ')[0]}</span></div>`;
    }).join('');
};

window.toggleArchivedChats = () => {
    showArchived = !showArchived;
    window.loadChatList(window.currentUser.uid);
};

window.loadChatList = (uid) => {
    onValue(ref(window.db, `user_chats/${uid}`), async (snap) => {
        const list = snap.val() || {};
        const container = document.getElementById('chat-list-container');
        
        try {
            const archSnap = await get(ref(window.db, `user_archived_chats/${uid}`));
            const archivedUids = archSnap.val() || {};

            if (Object.keys(list).length > 0) {
                const promises = Object.entries(list).map(async ([peerUid, info]) => {
                    const userData = await window.getUserData(peerUid);
                    return { peerUid, info, profilePic: userData?.profile_pic };
                });

                let chatItems = await Promise.all(promises);
                chatItems.sort((a, b) => b.info.timestamp - a.info.timestamp);
                
                if(showArchived) {
                    chatItems = chatItems.filter(item => archivedUids[item.peerUid]);
                } else {
                    chatItems = chatItems.filter(item => !archivedUids[item.peerUid]);
                }

                if(chatItems.length === 0) {
                    container.innerHTML = `<p class="text-center text-gray-400 mt-10 text-sm">${showArchived ? 'আর্কাইভে কোনো চ্যাট নেই' : 'কোনো কনভারসেশন নেই'}</p>`;
                    return;
                }

                container.innerHTML = chatItems.map(({ peerUid, info, profilePic }) => {
                    let rawLastMsg = info.lastMessage || "";
                    let displayMsg = rawLastMsg;
                    let isMe = false;

                    if (rawLastMsg.startsWith("You: ")) {
                        isMe = true;
                        rawLastMsg = rawLastMsg.substring(5);
                    }

                    if (rawLastMsg.includes("[Unsent]")) {
                        displayMsg = isMe ? "You unsent a message" : "Message unsent";
                    } else {
                        if (!rawLastMsg.includes("📷") && !rawLastMsg.includes("🎤")) {
                            rawLastMsg = window.decryptMsg(rawLastMsg);
                        }
                        displayMsg = (isMe ? "You: " : "") + rawLastMsg;
                    }
                    
                    const fontWeight = (info.unread > 0 && !isMe) ? 'font-extrabold text-black' : 'font-normal text-gray-500';

                    let av = profilePic ?
                        `<img src="${profilePic}" class="w-12 h-12 rounded-full shrink-0 object-cover border border-gray-200">` :
                        `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-xl shrink-0">${window.escapeHTML(info.name).charAt(0)}</div>`;

                    return `
                <div id="chat-item-${peerUid}" class="chat-list-item p-4 border-b bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-3 select-none" 
                     onclick="startChat('${peerUid}', '${window.escapeHTML(info.name)}')"
                     oncontextmenu="openChatListOptions(event, '${peerUid}', '${window.escapeHTML(info.name)}'); return false;">
                    ${av}
                    <div class="flex-1 min-w-0 pointer-events-none">
                        <div class="flex justify-between items-center mb-0.5">
                            <h4 class="${info.unread > 0 ? 'font-bold' : 'font-semibold'} text-gray-800 text-base truncate pr-2">${window.escapeHTML(info.name)}</h4>
                            <span class="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">${window.timeAgo(info.timestamp)}</span>
                        </div>
                        <p class="text-sm ${fontWeight} truncate block">${window.escapeHTML(displayMsg)}</p>
                    </div>
                </div>`;
                }).join('');
                
                document.querySelectorAll('.chat-list-item').forEach(el => {
                    let timer;
                    el.addEventListener('touchstart', (e) => {
                        const uid = el.id.split('-')[2];
                        const name = el.querySelector('h4').innerText;
                        timer = setTimeout(() => {
                            openChatListOptions(e, uid, name);
                        }, 600);
                    });
                    el.addEventListener('touchend', () => clearTimeout(timer));
                    el.addEventListener('touchmove', () => clearTimeout(timer));
                });

            } else {
                container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">কোনো কনভারসেশন নেই</p>';
            }
        } catch (error) {
            console.error("Error processing chat list:", error);
        }
    });
};

window.openChatListOptions = (e, uid, name) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('chat-options-uid').value = uid;
    document.getElementById('chat-options-name').innerText = name;
    
    const modal = document.getElementById('chat-list-options-modal');
    const sheet = document.getElementById('chat-list-sheet');
    modal.classList.remove('hidden');
    setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
    if(navigator.vibrate) navigator.vibrate(50);
};

window.closeChatListOptions = () => {
    const sheet = document.getElementById('chat-list-sheet');
    sheet.classList.add('translate-y-full');
    setTimeout(() => document.getElementById('chat-list-options-modal').classList.add('hidden'), 300);
};

window.archiveChat = () => {
    const uid = document.getElementById('chat-options-uid').value;
    const isArchiving = !showArchived; 
    
    if(isArchiving) {
        set(ref(window.db, `user_archived_chats/${window.currentUser.uid}/${uid}`), true);
        window.showToast("চ্যাট আর্কাইভে পাঠানো হয়েছে");
    } else {
        remove(ref(window.db, `user_archived_chats/${window.currentUser.uid}/${uid}`));
        window.showToast("আর্কাইভ থেকে সরানো হয়েছে");
    }
    closeChatListOptions();
    window.loadChatList(window.currentUser.uid); 
};

window.deleteChatConversation = () => {
    if(!confirm("পুরো কনভারসেশন ডিলিট করবেন? এটি আর ফিরে পাবেন না।")) return;
    const uid = document.getElementById('chat-options-uid').value;
    
    remove(ref(window.db, `user_chats/${window.currentUser.uid}/${uid}`)).then(() => {
        window.showToast("কনভারসেশন ডিলিট হয়েছে");
        closeChatListOptions();
    });
};

// --- DATE FORMATTER ---
function formatChatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('en-GB', options);
}

// --- CUSTOM AUDIO PLAYER LOGIC ---
window.currentPlayingAudio = null;

window.playCustomAudio = (audioId, btnElement) => {
    const audio = document.getElementById(audioId);
    const icon = btnElement.querySelector('i');

    if (window.currentPlayingAudio && window.currentPlayingAudio !== audio) {
        window.currentPlayingAudio.pause();
        const prevBtnId = window.currentPlayingAudio.id.replace('audio-', 'btn-');
        const prevIcon = document.getElementById(prevBtnId)?.querySelector('i');
        if(prevIcon) {
            prevIcon.classList.remove('fa-pause');
            prevIcon.classList.add('fa-play');
        }
    }

    if (audio.paused) {
        audio.play();
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
        window.currentPlayingAudio = audio;
    } else {
        audio.pause();
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
        window.currentPlayingAudio = null;
    }
};

window.updateAudioProgress = (msgId) => {
    const audio = document.getElementById(`audio-${msgId}`);
    const progress = document.getElementById(`progress-${msgId}`);
    const timeDisplay = document.getElementById(`time-${msgId}`);
    
    if (audio.duration) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progress.style.width = `${percent}%`;
        
        const currentSecs = Math.floor(audio.currentTime);
        const m = Math.floor(currentSecs / 60);
        const s = (currentSecs % 60).toString().padStart(2, '0');
        timeDisplay.innerText = `${m}:${s}`;
    }
};

window.setAudioDuration = (msgId) => {
    const audio = document.getElementById(`audio-${msgId}`);
    const timeDisplay = document.getElementById(`time-${msgId}`);
    if (audio.duration && audio.duration !== Infinity) {
        const totalSecs = Math.floor(audio.duration);
        const m = Math.floor(totalSecs / 60);
        const s = (totalSecs % 60).toString().padStart(2, '0');
        timeDisplay.innerText = `${m}:${s}`;
    }
};

window.resetAudio = (msgId) => {
    const btnIcon = document.getElementById(`btn-${msgId}`)?.querySelector('i');
    const progress = document.getElementById(`progress-${msgId}`);
    
    if(btnIcon) {
        btnIcon.classList.remove('fa-pause');
        btnIcon.classList.add('fa-play');
    }
    if(progress) progress.style.width = '0%';
    window.currentPlayingAudio = null;
};


// --- LOAD MESSAGES ---
window.loadMessages = (otherUid) => {
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">লোড হচ্ছে...</p>';
    
    onValue(query(ref(window.db, `chats/${chatId}`), limitToLast(50)), (snap) => {
        const msgs = snap.val() || {};
        if (Object.keys(msgs).length > 0) {
            
            let html = "";
            let lastDateStr = "";

            Object.entries(msgs).forEach(([msgId, m]) => {
                // Delete For Me Check (Don't render if hidden for me)
                if (m.deletedFor && m.deletedFor[window.currentUser.uid]) return;

                // --- Date Separator ---
                const msgDateStr = formatChatDate(m.timestamp);
                if (msgDateStr !== lastDateStr) {
                    html += `<div class="text-center my-4"><span class="bg-gray-200 text-gray-600 text-[10px] font-bold px-3 py-1 rounded-full">${msgDateStr}</span></div>`;
                    lastDateStr = msgDateStr;
                }

                const isMe = m.sender === window.currentUser.uid;
                
                let statusIcon = '';
                if(isMe) {
                    if (m.status === 'seen') {
                        statusIcon = `<img src="${document.getElementById('chat-header-img').querySelector('img')?.src || ''}" class="w-3 h-3 rounded-full ml-1 inline-block">`;
                    } else {
                        statusIcon = `<i class="fa-solid fa-circle-check text-[10px] text-gray-400 ml-1"></i>`;
                    }
                }

                if (m.isUnsent) {
                    html += `<div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-2">
                        <div class="px-4 py-2 max-w-[75%] text-sm bg-white border border-gray-200 text-gray-400 italic rounded-full shadow-sm"
                             data-id="${msgId}" data-sender="${isMe ? 'me' : 'other'}">
                            ${isMe ? 'You unsent a message' : 'Message unsent'}
                        </div>
                    </div>`;
                    return;
                }

                let content = '';
                
                if (m.replyTo) {
                    let repText = m.replyTo.text.includes("📷") ? "Photo" : (m.replyTo.text.includes("🎤") ? "Voice" : window.escapeHTML(window.decryptMsg(m.replyTo.text)));
                    content += `<div class="bg-black bg-opacity-10 border-l-2 border-green-700 pl-2 pr-2 py-1 mb-1 rounded text-[11px] opacity-80 truncate">
                        <span class="font-bold">${m.replyTo.name}</span><br>${repText}
                    </div>`;
                }

                if (m.image) content += `<img src="${m.image}" class="rounded-lg mb-1 max-w-full h-auto cursor-pointer" onclick="window.open('${m.image}')">`;
                
                // --- Custom Voice Player UI ---
                if (m.voice) {
                    const bgColor = isMe ? 'bg-green-700/20' : 'bg-gray-200';
                    const textColor = isMe ? 'text-white' : 'text-gray-600';
                    const progressColor = isMe ? 'bg-white' : 'bg-green-500';
                    const playBtnColor = isMe ? 'bg-white text-green-600' : 'bg-green-500 text-white';

                    content += `
                    <div class="flex items-center gap-2 ${bgColor} p-2 rounded-full min-w-[200px] mt-1 mb-1">
                        <button id="btn-${msgId}" onclick="playCustomAudio('audio-${msgId}', this)" class="w-8 h-8 ${playBtnColor} rounded-full flex items-center justify-center shrink-0 shadow-sm">
                            <i class="fa-solid fa-play text-xs pl-0.5"></i>
                        </button>
                        <div class="flex-1">
                            <div class="h-1.5 bg-black/10 rounded-full w-full relative overflow-hidden">
                                <div id="progress-${msgId}" class="absolute top-0 left-0 h-1.5 ${progressColor} rounded-full w-0 transition-all duration-100"></div>
                            </div>
                        </div>
                        <span id="time-${msgId}" class="text-[10px] ${textColor} font-bold w-8 text-center">0:00</span>
                        <audio id="audio-${msgId}" src="${m.voice}" class="hidden" ontimeupdate="updateAudioProgress('${msgId}')" onended="resetAudio('${msgId}')" onloadedmetadata="setAudioDuration('${msgId}')"></audio>
                    </div>`;
                }

                if (m.text) {
                    const decrypted = window.decryptMsg(m.text);
                    content += `<span>${window.escapeHTML(decrypted)}</span>`;
                }

                html += `<div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-2 msg-bubble-wrap" id="msg-wrap-${msgId}">
                    <div id="msg-${msgId}" 
                         class="msg-bubble px-4 py-2 max-w-[75%] text-[15px] shadow-sm transform transition-transform ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'} ${m.voice ? 'p-1' : ''}"
                         data-id="${msgId}" data-text="${window.escapeHTML(m.text ? window.decryptMsg(m.text) : (m.image?'Photo':'Voice'))}" data-sender="${isMe ? 'me' : 'other'}">
                        ${content}
                    </div>
                    <div class="flex items-end mb-1">${statusIcon}</div>
                </div>`;
            });

            div.innerHTML = html;
            setTimeout(() => div.scrollTop = div.scrollHeight, 100);
            initMessageInteractions();

            const lastMsgKey = Object.keys(msgs).pop();
            const lastMsg = msgs[lastMsgKey];
            if(lastMsg && lastMsg.sender !== window.currentUser.uid && lastMsg.status !== 'seen') {
                update(ref(window.db, `chats/${chatId}/${lastMsgKey}`), { status: 'seen' });
            }

        } else div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">কথপোকথন শুরু করুন</p>';
    });
};

// --- SWIPE TO REPLY & LONG PRESS LOGIC ---
function initMessageInteractions() {
    const bubbles = document.querySelectorAll('.msg-bubble');
    bubbles.forEach(bubble => {
        let startX = 0;
        let isSwiping = false;
        let pressTimer;

        bubble.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = false;
            pressTimer = setTimeout(() => {
                if(!isSwiping) openMsgOptions(bubble);
            }, 600);
        }, {passive: true});

        bubble.addEventListener('touchmove', (e) => {
            const currentX = e.touches[0].clientX;
            const diffX = currentX - startX;
            
            if(Math.abs(diffX) > 10) {
                isSwiping = true;
                clearTimeout(pressTimer);
            }

            if (diffX > 0 && diffX < 80) {
                bubble.style.transform = `translateX(${diffX}px)`;
            }
        }, {passive: true});

        bubble.addEventListener('touchend', (e) => {
            clearTimeout(pressTimer);
            const style = window.getComputedStyle(bubble);
            const matrix = new WebKitCSSMatrix(style.transform);
            
            if (matrix.m41 > 50) {
                const id = bubble.getAttribute('data-id');
                const text = bubble.getAttribute('data-text');
                const sender = bubble.getAttribute('data-sender');
                const name = sender === 'me' ? 'You' : window.currentChatUser.name;
                setReplyMode(id, text, name);
                if(navigator.vibrate) navigator.vibrate(40);
            }
            bubble.style.transform = 'translateX(0)';
        });
    });
}

// --- MESSAGE OPTIONS (UNSEND / DELETE) ---
window.openMsgOptions = (element) => {
    const id = element.getAttribute('data-id');
    const text = element.getAttribute('data-text');
    const isMe = element.getAttribute('data-sender') === 'me';
    
    document.getElementById('msg-options-id').value = id;
    document.getElementById('msg-options-text').value = text;
    
    if(isMe) {
        document.getElementById('btn-unsend-msg').classList.remove('hidden');
    } else {
        document.getElementById('btn-unsend-msg').classList.add('hidden');
    }

    document.getElementById('msg-options-modal').classList.remove('hidden');
    if(navigator.vibrate) navigator.vibrate(50);
};

window.closeMsgOptions = () => {
    document.getElementById('msg-options-modal').classList.add('hidden');
};

window.replyToMsgFromOptions = () => {
    const id = document.getElementById('msg-options-id').value;
    const text = document.getElementById('msg-options-text').value;
    setReplyMode(id, text, window.currentChatUser.name);
    closeMsgOptions();
};

window.copyMsgText = () => {
    const text = document.getElementById('msg-options-text').value;
    navigator.clipboard.writeText(text).then(() => window.showToast("কপি হয়েছে"));
    closeMsgOptions();
};

window.unsendMsg = () => {
    const msgId = document.getElementById('msg-options-id').value;
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    
    update(ref(window.db, `chats/${chatId}/${msgId}`), {
        isUnsent: true,
        text: null,
        image: null,
        voice: null
    }).then(() => {
        update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), { lastMessage: "You: [Unsent]" });
        update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), { lastMessage: "[Unsent]" });
    });
    closeMsgOptions();
};

window.removeMsgForMe = () => {
    const msgId = document.getElementById('msg-options-id').value;
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    
    update(ref(window.db, `chats/${chatId}/${msgId}/deletedFor`), {
        [window.currentUser.uid]: true
    }).then(() => {
        // রিয়েল টাইমে UI থেকে সরানোর জন্য
        const msgWrap = document.getElementById(`msg-wrap-${msgId}`);
        if(msgWrap) msgWrap.remove();
    });
    closeMsgOptions();
};

// --- REPLY UI LOGIC ---
function setReplyMode(id, text, name) {
    replyMessageData = { id, text, name };
    document.getElementById('reply-preview-name').innerText = name;
    document.getElementById('reply-preview-text').innerText = text;
    document.getElementById('reply-preview-box').classList.remove('hidden');
    document.getElementById('msg-input').focus();
}

window.cancelReply = () => {
    replyMessageData = null;
    document.getElementById('reply-preview-box').classList.add('hidden');
};

// --- TYPING INDICATOR ---
let typingTimeout;
window.triggerTyping = () => {
    if(!window.currentChatUser) return;
    const typingRef = ref(window.db, `chats_typing/${window.currentChatUser.uid}/${window.currentUser.uid}`);
    
    set(typingRef, true);
    clearTimeout(typingTimeout);
    
    typingTimeout = setTimeout(() => {
        set(typingRef, false);
    }, 2000);
};

window.listenToTyping = (otherUid) => {
    onValue(ref(window.db, `chats_typing/${window.currentUser.uid}/${otherUid}`), (snap) => {
        const isTyping = snap.val();
        const statusEl = document.getElementById('chat-typing-status');
        if(isTyping) {
            statusEl.classList.remove('hidden');
        } else {
            statusEl.classList.add('hidden');
        }
    });
};

// --- VOICE MESSAGE LOGIC ---
let chatMediaRecorder;
let chatAudioChunks = [];
let chatRecordingTimer;
let chatRecSeconds = 0;

window.startChatVoiceRecord = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chatMediaRecorder = new MediaRecorder(stream);
        chatAudioChunks = [];

        chatMediaRecorder.ondataavailable = e => chatAudioChunks.push(e.data);
        
        chatMediaRecorder.onstop = async () => {
            const blob = new Blob(chatAudioChunks, { type: 'audio/mp3' });
            const file = new File([blob], "voice.mp3", { type: 'audio/mp3' });
            
            const btn = document.getElementById('btn-chat-send');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            try {
                const res = await window.uploadMediaToCloudinary(file);
                window.sendMsg(null, res.url);
            } catch(e) {
                window.showToast("ভয়েস পাঠানো যায়নি", "error");
            } finally {
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                btn.disabled = false;
                window.cancelChatVoice();
            }
        };

        chatMediaRecorder.start();
        
        document.getElementById('chat-input-ui').classList.add('hidden');
        document.getElementById('chat-voice-ui').classList.remove('hidden');
        document.getElementById('chat-voice-ui').classList.add('flex');
        
        chatRecSeconds = 0;
        chatRecordingTimer = setInterval(() => {
            chatRecSeconds++;
            const m = Math.floor(chatRecSeconds / 60).toString().padStart(2, '0');
            const s = (chatRecSeconds % 60).toString().padStart(2, '0');
            document.getElementById('chat-voice-timer').innerText = `${m}:${s}`;
        }, 1000);

    } catch(err) {
        window.showToast("মাইক্রোফোন পারমিশন দিন", "error");
    }
};

window.cancelChatVoice = () => {
    if(chatMediaRecorder && chatMediaRecorder.state !== 'inactive') {
        chatMediaRecorder.stop();
        chatMediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(chatRecordingTimer);
    document.getElementById('chat-input-ui').classList.remove('hidden');
    document.getElementById('chat-voice-ui').classList.add('hidden');
    document.getElementById('chat-voice-ui').classList.remove('flex');
};

window.sendChatVoice = () => {
    if(chatMediaRecorder && chatMediaRecorder.state !== 'inactive') {
        chatMediaRecorder.stop(); 
        clearInterval(chatRecordingTimer);
    }
};

// --- SEND MESSAGE OVERRIDE ---
window.handleChatImageSelect = () => {
    const file = document.getElementById('chat-img-input').files[0];
    if (file) {
        const btn = document.getElementById('btn-chat-send');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        window.uploadMediaToCloudinary(file).then(res => {
            window.sendMsg(res.url, null);
            document.getElementById('chat-img-input').value = "";
        }).catch(e => {
            window.showToast("ছবি আপলোড হয়নি: " + e.message, 'error');
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            btn.disabled = false;
        });
    }
};

window.sendMsg = (imageUrl = null, voiceUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text && !imageUrl && !voiceUrl) return;
    
    const btn = document.getElementById('btn-chat-send');
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    const ts = Date.now();

    const encryptedText = text ? window.encryptMsg(text) : "";
    const msgData = { 
        sender: window.currentUser.uid, 
        timestamp: ts,
        status: 'sent' 
    };
    
    if (text) msgData.text = encryptedText;
    if (imageUrl) msgData.image = imageUrl;
    if (voiceUrl) msgData.voice = voiceUrl;
    if (replyMessageData) msgData.replyTo = replyMessageData;

    push(ref(window.db, `chats/${chatId}`), msgData);

    let lastMsg = encryptedText;
    if (imageUrl) lastMsg = text ? "📷 " + encryptedText : "📷 Photo";
    if (voiceUrl) lastMsg = "🎤 Voice message";

    const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsg, timestamp: ts };
    const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsg, timestamp: ts };

    get(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}/unread`)).then(snap => {
        let count = snap.val() || 0;
        peerUpdate.unread = count + 1;
        update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);
    });

    update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);

    input.value = "";
    cancelReply();
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    btn.disabled = false;
    
    set(ref(window.db, `chats_typing/${window.currentChatUser.uid}/${window.currentUser.uid}`), false);
};

// --- AUTO INITIALIZE CHAT DATA ---
setTimeout(() => {
    if (window.currentUser && document.getElementById('chat-list-container')) {
        if(typeof window.loadChatList === 'function') window.loadChatList(window.currentUser.uid);
        if(typeof window.loadQuickChatFriends === 'function') window.loadQuickChatFriends();
    }
}, 1500);