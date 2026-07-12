import {
    ref, push, set, onValue, get, update, query, limitToLast, remove, serverTimestamp, off
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- SAFELY DEFINE FALLBACKS TO PREVENT CRASHES ---
if (typeof window.escapeHTML !== 'function') {
    window.escapeHTML = function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
}

// --- CHAT HELPER FUNCTIONS ---
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

let replyMessageData = null;
let showArchived = false;
let myBlockedUsers = {}; // আমার ব্লক করা ইউজারদের তালিকা

window.startChat = (uid, name) => {
    window.currentChatUser = { uid, name };

    const proceedStartChat = () => {
        if (typeof window.switchPage === 'function') {
            try { window.switchPage('messages'); } catch(e) { console.warn(e); }
        }
        
        const chatListView = document.getElementById('chat-list-view');
        const chatConvView = document.getElementById('chat-conversation-view');
        
        if (chatListView) chatListView.classList.add('hidden', 'hidden-custom');
        if (chatConvView) chatConvView.classList.remove('hidden', 'hidden-custom');
        
        const escapedName = typeof window.escapeHTML === 'function' ? window.escapeHTML(name) : name;
        
        const headerName = document.getElementById('chat-header-name');
        if (headerName) headerName.innerText = escapedName;
        
        const headerImg = document.getElementById('chat-header-img');
        if (headerImg) {
            headerImg.innerHTML = `<div class="w-full h-full bg-green-100 flex items-center justify-center">${escapedName.charAt(0)}</div>`;
        }
        
        if (typeof window.getUserData === 'function') {
            window.getUserData(uid).then(u => {
                if(u && u.profile_pic && headerImg) {
                    headerImg.innerHTML = `<img src="${u.profile_pic}" loading="lazy" class="w-full h-full object-cover">`;
                }
            }).catch(err => console.warn("User data fetch issue:", err));
        }

        try {
            history.pushState({ page: 'chat-conversation', uid }, "", "#chat");
        } catch(e) {}
        
        if (window.currentUser) {
            if (typeof window.loadMessages === 'function') window.loadMessages(uid);
            if (typeof window.listenToTyping === 'function') window.listenToTyping(uid);
            
            if (window.db) {
                update(ref(window.db, `user_chats/${window.currentUser.uid}/${uid}`), { unread: 0 }).catch(o => {});
            }
        }
    };

    if (typeof window.loadMessagesUI === 'function') {
        window.loadMessagesUI().then(proceedStartChat).catch(proceedStartChat);
    } else {
        proceedStartChat();
    }
};

window.closeChat = () => {
    const chatListView = document.getElementById('chat-list-view');
    const chatConvView = document.getElementById('chat-conversation-view');
    
    if (chatListView) chatListView.classList.remove('hidden', 'hidden-custom');
    if (chatConvView) chatConvView.classList.add('hidden', 'hidden-custom');
    
    window.currentChatUser = null;
    cancelReply();
    
    if (window.currentPlayingAudio) {
        window.currentPlayingAudio.pause();
        window.currentPlayingAudio = null;
    }
    
    if(window.currentUser && window.db) {
        set(ref(window.db, `chats_typing/${window.currentUser.uid}`), false);
    }
    
    // Unsubscribe active chat listener
    if (window.unsubscribeChatListener) {
        window.unsubscribeChatListener();
        window.unsubscribeChatListener = null;
    }
};

window.searchChatFriends = async (val) => {
    const q = val.toLowerCase().trim();
    const container = document.getElementById('chat-list-container');
    if (!container) return;
    
    if (!q) {
        if (window.currentUser) window.loadChatList(window.currentUser.uid); 
        return;
    }
    
    const friendsData = await Promise.all(window.myFriends.map(uid => window.getUserData(uid)));
    const matched = friendsData.filter(u => u && u.name.toLowerCase().includes(q));
    
    if (matched.length > 0) {
        container.innerHTML = `<h4 class="px-4 py-2 text-xs font-bold text-gray-500">Search Results</h4>` + 
        matched.map(u => {
            let av = u.profile_pic ? 
                `<img src="${u.profile_pic}" loading="lazy" class="w-12 h-12 rounded-full object-cover border border-gray-200">` : 
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
    if (!div) return;
    
    if (!window.myFriends || window.myFriends.length === 0) {
        div.innerHTML = '<span class="text-xs text-gray-400">কোনো বন্ধু নেই</span>';
        return;
    }
    const friendsData = await Promise.all(window.myFriends.slice(0, 15).map(uid => window.getUserData(uid)));
    div.innerHTML = friendsData.filter(u => u).map(u => {
        let av = u.profile_pic ? 
            `<div class="w-12 h-12 relative"><img src="${u.profile_pic}" loading="lazy" class="w-full h-full rounded-full object-cover"><div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>` : 
            `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-lg relative">${window.escapeHTML(u.name).charAt(0)}<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>`;
        return `<div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="flex flex-col items-center cursor-pointer min-w-[50px]">${av}<span class="text-[10px] text-gray-600 mt-1 truncate w-14 text-center font-bold">${window.escapeHTML(u.name).split(' ')[0]}</span></div>`;
    }).join('');
};

window.toggleArchivedChats = () => {
    showArchived = !showArchived;
    if (window.currentUser) window.loadChatList(window.currentUser.uid);
};

// --- DATA CACHE AND LISTENERS ---
let chatListCache = {};
let archivedUidsCache = null;
let isChatListenerAttached = false;

window.loadChatList = async (uid) => {
    const container = document.getElementById('chat-list-container');
    if (!container) return;
    
    if (Object.keys(chatListCache).length > 0) {
        renderChatListUI();
    } else if (!isChatListenerAttached) {
        container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">লোড হচ্ছে...</p>';
    }

    if (isChatListenerAttached) {
        renderChatListUI();
        return;
    }
    
    isChatListenerAttached = true;

    // ব্লকড লিস্টের রিয়েল-টাইম লিসেনার
    onValue(ref(window.db, `user_blocks/${uid}`), (blockSnap) => {
        myBlockedUsers = blockSnap.val() || {};
        renderChatListUI();
    });

    onValue(ref(window.db, `user_archived_chats/${uid}`), (archSnap) => {
        archivedUidsCache = archSnap.val() || {};
        renderChatListUI();
    });

    onValue(ref(window.db, `user_chats/${uid}`), (snap) => {
        chatListCache = snap.val() || {};
        renderChatListUI();
    });
};

async function renderChatListUI() {
    const container = document.getElementById('chat-list-container');
    if (!container || archivedUidsCache === null) return;

    try {
        if (Object.keys(chatListCache).length === 0) {
            container.innerHTML = `<p class="text-center text-gray-400 mt-10 text-sm">${showArchived ? 'আর্কাইভে কোনো চ্যাট নেই' : 'কোনো কনভারসেশন নেই'}</p>`;
            return;
        }

        const promises = Object.entries(chatListCache).map(async ([peerUid, info]) => {
            const userData = await window.getUserData(peerUid);
            return { 
                peerUid, 
                info, 
                profilePic: userData?.profile_pic || null,
                displayName: userData?.name || info.name || "User"
            };
        });

        let chatItems = await Promise.all(promises);
        
        // সর্টিং: সর্বশেষ মেসেজ পাঠানো বা রিসিভ হওয়া চ্যাটটি তালিকার শীর্ষে যাবে
        chatItems.sort((a, b) => {
            const timeA = a.info.timestamp || 0;
            const timeB = b.info.timestamp || 0;
            return timeB - timeA;
        });
        
        if(showArchived) {
            chatItems = chatItems.filter(item => archivedUidsCache[item.peerUid]);
        } else {
            chatItems = chatItems.filter(item => !archivedUidsCache[item.peerUid]);
        }

        if(chatItems.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-400 mt-10 text-sm">${showArchived ? 'আর্কাইভে কোনো চ্যাট নেই' : 'কোনো কনভারসেশন নেই'}</p>`;
            return;
        }

        container.innerHTML = chatItems.map(({ peerUid, info, profilePic, displayName }) => {
            let rawLastMsg = info.lastMessage || "";
            let displayMsg = rawLastMsg;
            let isMe = false;

            if (rawLastMsg.startsWith("You: ")) {
                isMe = true;
                rawLastMsg = rawLastMsg.substring(5).trim();
            }

            if (rawLastMsg.includes("[Unsent]")) {
                displayMsg = isMe ? "You unsent a message" : "Message unsent";
            } else {
                let decrypted = rawLastMsg;
                if (!rawLastMsg.includes("📷") && !rawLastMsg.includes("🎤")) {
                    try { decrypted = window.decryptMsg(rawLastMsg); } catch(e) {}
                }
                displayMsg = (isMe ? "You: " : "") + decrypted;
            }
            
            const isUnread = info.unread > 0 && !isMe;
            const textStyle = isUnread ? 'font-extrabold text-green-600' : 'font-normal text-gray-500';
            const nameStyle = isUnread ? 'font-extrabold text-black' : 'font-semibold text-gray-800';
            const bgStyle = isUnread ? 'bg-green-50/60 border-l-4 border-l-green-500' : 'bg-white';
            const timeColor = isUnread ? 'text-green-600 font-bold' : 'text-gray-400';

            const userIsBlocked = myBlockedUsers && myBlockedUsers[peerUid];
            const blockedBadge = userIsBlocked ? `<span class="ml-2 bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded font-bold">Blocked</span>` : '';

            let av = profilePic ?
                `<img src="${profilePic}" loading="lazy" class="w-12 h-12 rounded-full shrink-0 object-cover border border-gray-200">` :
                `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-xl shrink-0">${window.escapeHTML(displayName).charAt(0)}</div>`;

            return `
            <div id="chat-item-${peerUid}" class="chat-list-item p-4 border-b ${bgStyle} hover:bg-gray-50 cursor-pointer flex items-center gap-3 select-none" 
                 onclick="startChat('${peerUid}', '${window.escapeHTML(displayName)}')"
                 oncontextmenu="openChatListOptions(event, '${peerUid}', '${window.escapeHTML(displayName)}', ${isUnread}); return false;">
                ${av}
                <div class="flex-1 min-w-0 pointer-events-none">
                    <div class="flex justify-between items-center mb-0.5">
                        <h4 class="${nameStyle} text-base truncate pr-2 flex items-center">${window.escapeHTML(displayName)}${blockedBadge}</h4>
                        <span class="text-[10px] ${timeColor} shrink-0 whitespace-nowrap">${window.timeAgo(info.timestamp)}</span>
                    </div>
                    <p class="text-sm ${textStyle} truncate block">${window.escapeHTML(displayMsg)}</p>
                </div>
                ${isUnread ? '<div class="w-3.5 h-3.5 bg-green-600 rounded-full shrink-0 shadow-sm animate-pulse"></div>' : ''}
            </div>`;
        }).join('');
        
        document.querySelectorAll('.chat-list-item').forEach(el => {
            let timer;
            el.addEventListener('touchstart', (e) => {
                const uid = el.id.split('-')[2];
                const name = el.querySelector('h4') ? el.querySelector('h4').innerText.replace("Blocked", "").trim() : '';
                const isUnread = el.querySelector('.bg-green-600') !== null;
                timer = setTimeout(() => {
                    openChatListOptions(e, uid, name, isUnread);
                }, 600);
            });
            el.addEventListener('touchend', () => clearTimeout(timer));
            el.addEventListener('touchmove', () => clearTimeout(timer));
        });

    } catch (error) {
        console.error("Error processing chat list:", error);
    }
}

window.openChatListOptions = (e, uid, name, isUnread = false) => {
    e.preventDefault();
    e.stopPropagation();
    
    const uidInput = document.getElementById('chat-options-uid');
    const nameText = document.getElementById('chat-options-name');
    if (uidInput) uidInput.value = uid;
    if (nameText) nameText.innerText = name;
    
    const toggleBtnText = document.getElementById('text-toggle-read');
    const toggleBtnIcon = document.getElementById('btn-toggle-read') ? document.getElementById('btn-toggle-read').querySelector('i') : null;
    
    if (toggleBtnText && toggleBtnIcon) {
        if (isUnread) {
            toggleBtnText.innerText = "মার্ক অ্যাজ রিড (Mark as Read)";
            toggleBtnIcon.className = "fa-solid fa-envelope-open";
            document.getElementById('btn-toggle-read').setAttribute('data-action', 'read');
        } else {
            toggleBtnText.innerText = "মার্ক অ্যাজ আনরিড (Mark as Unread)";
            toggleBtnIcon.className = "fa-solid fa-envelope";
            document.getElementById('btn-toggle-read').setAttribute('data-action', 'unread');
        }
    }

    // ব্লক / আনব্লক বাটন টেক্সট আপডেট
    const toggleBlockText = document.getElementById('text-toggle-block');
    const toggleBlockIcon = document.getElementById('btn-toggle-block') ? document.getElementById('btn-toggle-block').querySelector('i') : null;
    if (toggleBlockText && toggleBlockIcon) {
        const isBlocked = myBlockedUsers && myBlockedUsers[uid];
        if (isBlocked) {
            toggleBlockText.innerText = "আনব্লক করুন (Unblock User)";
            toggleBlockIcon.className = "fa-solid fa-user-check text-green-600";
        } else {
            toggleBlockText.innerText = "ব্লক করুন (Block User)";
            toggleBlockIcon.className = "fa-solid fa-user-slash text-red-600";
        }
    }

    const modal = document.getElementById('chat-list-options-modal');
    const sheet = document.getElementById('chat-list-sheet');
    if (modal && sheet) {
        modal.classList.remove('hidden');
        setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
    }
    
    if(navigator.vibrate) navigator.vibrate(50);
};

window.closeChatListOptions = () => {
    const sheet = document.getElementById('chat-list-sheet');
    const modal = document.getElementById('chat-list-options-modal');
    if (sheet && modal) {
        sheet.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

window.toggleReadStatus = () => {
    const uid = document.getElementById('chat-options-uid')?.value;
    const action = document.getElementById('btn-toggle-read')?.getAttribute('data-action');
    if (!uid || !action || !window.currentUser) return;
    
    const unreadCount = action === 'unread' ? 1 : 0;
    
    update(ref(window.db, `user_chats/${window.currentUser.uid}/${uid}`), {
        unread: unreadCount
    }).then(() => {
        if (typeof window.showToast === 'function') {
            window.showToast(action === 'unread' ? "আনরিড করা হয়েছে" : "রিড করা হয়েছে");
        }
        closeChatListOptions();
    });
};

// --- BLOCK / UNBLOCK LOGIC ---
window.toggleBlockUser = () => {
    const uid = document.getElementById('chat-options-uid')?.value;
    if (!uid || !window.currentUser) return;
    
    const isBlocked = myBlockedUsers && myBlockedUsers[uid];
    const blockRef = ref(window.db, `user_blocks/${window.currentUser.uid}/${uid}`);
    
    if (isBlocked) {
        // আনব্লক করা
        remove(blockRef).then(() => {
            if (typeof window.showToast === 'function') window.showToast("ইউজারকে আনব্লক করা হয়েছে");
            closeChatListOptions();
        });
    } else {
        // ব্লক করা
        if (confirm("আপনি কি নিশ্চিতভাবে এই ইউজারকে ব্লক করতে চান?")) {
            set(blockRef, true).then(() => {
                if (typeof window.showToast === 'function') window.showToast("ইউজারকে ব্লক করা হয়েছে");
                closeChatListOptions();
            });
        }
    }
};

window.archiveChat = () => {
    const uid = document.getElementById('chat-options-uid')?.value;
    if (!uid || !window.currentUser) return;
    const isArchiving = !showArchived; 
    
    if(isArchiving) {
        set(ref(window.db, `user_archived_chats/${window.currentUser.uid}/${uid}`), true);
        if (typeof window.showToast === 'function') window.showToast("চ্যাট আর্কাইভে পাঠানো হয়েছে");
    } else {
        remove(ref(window.db, `user_archived_chats/${window.currentUser.uid}/${uid}`));
        if (typeof window.showToast === 'function') window.showToast("আর্কাইভ থেকে সরানো হয়েছে");
    }
    closeChatListOptions();
    window.loadChatList(window.currentUser.uid); 
};

window.deleteChatConversation = () => {
    const uid = document.getElementById('chat-options-uid')?.value;
    if (!uid || !window.currentUser) return;
    if(!confirm("পুরো কনভারসেশন ডিলিট করবেন? এটি আর ফিরে পাবেন না।")) return;
    
    remove(ref(window.db, `user_chats/${window.currentUser.uid}/${uid}`)).then(() => {
        if (typeof window.showToast === 'function') window.showToast("কনভারসেশন ডিলিট হয়েছে");
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
    if (!audio || !icon) return;

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
    
    if (audio && audio.duration && progress && timeDisplay) {
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
    if (audio && audio.duration && audio.duration !== Infinity && timeDisplay) {
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
window.unsubscribeChatListener = null;

window.loadMessages = (otherUid) => {
    if (!window.currentUser) {
        console.warn("User state not verified.");
        return;
    }
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    if (!div) return;
    div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">লোড হচ্ছে...</p>';
    
    // Unsubscribe previous listeners to prevent performance lags and duplicate loads
    if (window.unsubscribeChatListener) {
        window.unsubscribeChatListener();
    }
    
    const chatQuery = query(ref(window.db, `chats/${chatId}`), limitToLast(50));
    
    window.unsubscribeChatListener = onValue(chatQuery, (snap) => {
        const msgs = snap.val() || {};
        
        // Auto-clear unread counter if we are actively viewing this chat window
        if (window.currentChatUser && window.currentChatUser.uid === otherUid) {
            update(ref(window.db, `user_chats/${window.currentUser.uid}/${otherUid}`), { unread: 0 }).catch(() => {});
        }

        if (Object.keys(msgs).length > 0) {
            let html = "";
            let lastDateStr = "";

            Object.entries(msgs).forEach(([msgId, m]) => {
                if (m.deletedFor && m.deletedFor[window.currentUser.uid]) return;

                const msgDateStr = formatChatDate(m.timestamp);
                if (msgDateStr !== lastDateStr) {
                    html += `<div class="text-center my-4"><span class="bg-gray-200 text-gray-600 text-[10px] font-bold px-3 py-1 rounded-full">${msgDateStr}</span></div>`;
                    lastDateStr = msgDateStr;
                }

                const isMe = m.sender === window.currentUser.uid;
                
                let statusIcon = '';
                if(isMe) {
                    if (m.status === 'seen') {
                        const headerImgEl = document.getElementById('chat-header-img');
                        const headerImgSrc = headerImgEl ? (headerImgEl.querySelector('img')?.src || '') : '';
                        statusIcon = `<img src="${headerImgSrc}" loading="lazy" class="w-3 h-3 rounded-full ml-1 inline-block">`;
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

                if (m.image) content += `<img src="${m.image}" loading="lazy" class="rounded-lg mb-1 max-w-full h-auto cursor-pointer" onclick="window.open('${m.image}')">`;
                
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
    
    const idInput = document.getElementById('msg-options-id');
    const textInput = document.getElementById('msg-options-text');
    const unsendBtn = document.getElementById('btn-unsend-msg');
    
    if (idInput) idInput.value = id;
    if (textInput) textInput.value = text;
    
    if(unsendBtn) {
        if(isMe) {
            unsendBtn.classList.remove('hidden');
        } else {
            unsendBtn.classList.add('hidden');
        }
    }

    const modal = document.getElementById('msg-options-modal');
    if (modal) modal.classList.remove('hidden');
    if(navigator.vibrate) navigator.vibrate(50);
};

window.closeMsgOptions = () => {
    const modal = document.getElementById('msg-options-modal');
    if (modal) modal.classList.add('hidden');
};

window.replyToMsgFromOptions = () => {
    const id = document.getElementById('msg-options-id')?.value;
    const text = document.getElementById('msg-options-text')?.value;
    if (id) {
        setReplyMode(id, text || '', window.currentChatUser ? window.currentChatUser.name : '');
    }
    closeMsgOptions();
};

window.copyMsgText = () => {
    const text = document.getElementById('msg-options-text')?.value;
    if (text) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof window.showToast === 'function') window.showToast("কপি হয়েছে");
        });
    }
    closeMsgOptions();
};

window.unsendMsg = () => {
    const msgId = document.getElementById('msg-options-id')?.value;
    if (!msgId || !window.currentUser || !window.currentChatUser) return;
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
    const msgId = document.getElementById('msg-options-id')?.value;
    if (!msgId || !window.currentUser || !window.currentChatUser) return;
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    
    update(ref(window.db, `chats/${chatId}/${msgId}/deletedFor`), {
        [window.currentUser.uid]: true
    }).then(() => {
        const msgWrap = document.getElementById(`msg-wrap-${msgId}`);
        if(msgWrap) msgWrap.remove();
    });
    closeMsgOptions();
};

// --- REPLY UI LOGIC ---
function setReplyMode(id, text, name) {
    replyMessageData = { id, text, name };
    const nameEl = document.getElementById('reply-preview-name');
    const textEl = document.getElementById('reply-preview-text');
    const boxEl = document.getElementById('reply-preview-box');
    const inputEl = document.getElementById('msg-input');
    
    if (nameEl) nameEl.innerText = name;
    if (textEl) textEl.innerText = text;
    if (boxEl) boxEl.classList.remove('hidden');
    if (inputEl) inputEl.focus();
}

window.cancelReply = () => {
    replyMessageData = null;
    const boxEl = document.getElementById('reply-preview-box');
    if (boxEl) boxEl.classList.add('hidden');
};

// --- TYPING INDICATOR ---
let typingTimeout;
window.triggerTyping = () => {
    if(!window.currentChatUser || !window.currentUser) return;
    const typingRef = ref(window.db, `chats_typing/${window.currentChatUser.uid}/${window.currentUser.uid}`);
    
    set(typingRef, true);
    clearTimeout(typingTimeout);
    
    typingTimeout = setTimeout(() => {
        set(typingRef, false);
    }, 2000);
};

// --- CHECK IF USER ACTIVE/TYPING ---
window.listenToTyping = (otherUid) => {
    if (!window.currentUser) return;
    onValue(ref(window.db, `chats_typing/${window.currentUser.uid}/${otherUid}`), (snap) => {
        const isTyping = snap.val();
        const statusEl = document.getElementById('chat-typing-status');
        if (statusEl) {
            if(isTyping) {
                statusEl.classList.remove('hidden');
            } else {
                statusEl.classList.add('hidden');
            }
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
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                btn.disabled = true;
            }

            try {
                const res = await window.uploadMediaToCloudinary(file);
                window.sendMsg(null, res.url);
            } catch(e) {
                if (typeof window.showToast === 'function') window.showToast("ভয়েস পাঠানো যায়নি", "error");
            } finally {
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                    btn.disabled = false;
                }
                window.cancelChatVoice();
            }
        };

        chatMediaRecorder.start();
        
        const inputUI = document.getElementById('chat-input-ui');
        const voiceUI = document.getElementById('chat-voice-ui');
        if (inputUI) inputUI.classList.add('hidden');
        if (voiceUI) {
            voiceUI.classList.remove('hidden');
            voiceUI.classList.add('flex');
        }
        
        chatRecSeconds = 0;
        chatRecordingTimer = setInterval(() => {
            chatRecSeconds++;
            const m = Math.floor(chatRecSeconds / 60).toString().padStart(2, '0');
            const s = (chatRecSeconds % 60).toString().padStart(2, '0');
            const timerEl = document.getElementById('chat-voice-timer');
            if (timerEl) timerEl.innerText = `${m}:${s}`;
        }, 1000);

    } catch(err) {
        if (typeof window.showToast === 'function') window.showToast("মাইক্রোফোন পারমিশন দিন", "error");
    }
};

window.cancelChatVoice = () => {
    if(chatMediaRecorder && chatMediaRecorder.state !== 'inactive') {
        chatMediaRecorder.stop();
        chatMediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(chatRecordingTimer);
    const inputUI = document.getElementById('chat-input-ui');
    const voiceUI = document.getElementById('chat-voice-ui');
    if (inputUI) inputUI.classList.remove('hidden');
    if (voiceUI) {
        voiceUI.classList.add('hidden');
        voiceUI.classList.remove('flex');
    }
};

window.sendChatVoice = () => {
    if(chatMediaRecorder && chatMediaRecorder.state !== 'inactive') {
        chatMediaRecorder.stop(); 
        clearInterval(chatRecordingTimer);
    }
};

// --- SEND MESSAGE OVERRIDE ---
window.handleChatImageSelect = () => {
    const fileInput = document.getElementById('chat-img-input');
    const file = fileInput ? fileInput.files[0] : null;
    if (file) {
        const btn = document.getElementById('btn-chat-send');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        window.uploadMediaToCloudinary(file).then(res => {
            window.sendMsg(res.url, null);
            if (fileInput) fileInput.value = "";
        }).catch(e => {
            if (typeof window.showToast === 'function') window.showToast("ছবি আপলোড হয়নি: " + e.message, 'error');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                btn.disabled = false;
            }
        });
    }
};

window.sendMsg = (imageUrl = null, voiceUrl = null) => {
    if (!window.currentUser || !window.currentChatUser) return;

    const input = document.getElementById('msg-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text && !imageUrl && !voiceUrl) return;
    
    const btn = document.getElementById('btn-chat-send');

    // ১. আমি তাকে ব্লক করেছি কি না চেক (আমার লোকাল ব্লক লিস্ট থেকে)
    if (myBlockedUsers && myBlockedUsers[window.currentChatUser.uid]) {
        if (typeof window.showToast === 'function') {
            window.showToast("আপনি এই ইউজারকে ব্লক করে রেখেছেন। মেসেজ পাঠাতে প্রথমে আনব্লক করুন।", "error");
        } else {
            alert("আপনি এই ইউজারকে ব্লক করে রেখেছেন। মেসেজ পাঠাতে প্রথমে আনব্লক করুন।");
        }
        return;
    }

    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;
    }

    // মেসেজ পাঠানোর মূল লজিক (যা ব্লক না থাকলে বা চেক সফল হলে রান করবে)
    const executeMessageSend = () => {
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

        push(ref(window.db, `chats/${chatId}`), msgData).then(() => {
            let lastMsg = encryptedText;
            if (imageUrl) lastMsg = text ? "📷 " + encryptedText : "📷 Photo";
            if (voiceUrl) lastMsg = "🎤 Voice message";

            const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsg, timestamp: ts };
            const peerUpdate = { name: window.userDetails ? window.userDetails.name : "User", lastMessage: lastMsg, timestamp: ts };

            // অপর প্রান্তের ইউজারের আনরিড মেসেজ কাউন্টার আপডেট
            get(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}/unread`)).then(snap => {
                let count = snap.val() || 0;
                peerUpdate.unread = count + 1;
                update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate).catch(() => {});
            }).catch(() => {
                // রিড পারমিশন ফেইল করলেও চ্যাট লিস্ট তথ্য সরাসরি আপডেট হবে
                update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate).catch(() => {});
            });

            // আমার চ্যাট লিস্টে আপডেট
            update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate).catch(() => {});

            // ইনপুট ফিল্ড ও রিপ্লাই মোড ক্লিয়ার করা
            input.value = "";
            cancelReply();
            
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                btn.disabled = false;
            }
            
            set(ref(window.db, `chats_typing/${window.currentChatUser.uid}/${window.currentUser.uid}`), false).catch(() => {});
        }).catch(err => {
            console.error("Failed to send message:", err);
            if (typeof window.showToast === 'function') {
                window.showToast("মেসেজ পাঠানো সম্ভব হয়নি।", "error");
            }
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                btn.disabled = false;
            }
        });
    };

    // ২. সে আমাকে ব্লক করেছে কি না চেক (অন্য প্রান্তের ব্লক লিস্ট চেক)
    const peerBlockedMeRef = ref(window.db, `user_blocks/${window.currentChatUser.uid}/${window.currentUser.uid}`);
    
    get(peerBlockedMeRef).then(snap => {
        const isBlockedByPeer = snap.val();
        if (isBlockedByPeer) {
            if (typeof window.showToast === 'function') {
                window.showToast("এই ইউজারটি আপনাকে ব্লক করেছেন। মেসেজ পাঠানো সম্ভব নয়।", "error");
            } else {
                alert("এই ইউজারটি আপনাকে ব্লক করেছেন। মেসেজ পাঠানো সম্ভব নয়।");
            }
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                btn.disabled = false;
            }
            return;
        }

        // কোনো ব্লক না থাকলে মেসেজ চলে যাবে
        executeMessageSend();

    }).catch(err => {
        // যদি ফায়ারবেস পারমিশন রুলস রিড করতে বাধা দেয় (৯৯% ক্ষেত্রে), তবে সরাসরি মেসেজ পাঠিয়ে দেবে
        console.warn("Block check bypassed safely:", err);
        executeMessageSend();
    });
};

// --- AUTO INITIALIZE CHAT DATA ---
setTimeout(() => {
    if (window.currentUser && document.getElementById('chat-list-container')) {
        if(typeof window.loadChatList === 'function') window.loadChatList(window.currentUser.uid);
        if(typeof window.loadQuickChatFriends === 'function') window.loadQuickChatFriends();
    }
}, 1500);