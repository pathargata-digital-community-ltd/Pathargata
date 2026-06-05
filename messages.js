import {
    ref, push, set, onValue, get, update, remove, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- GLOBAL VARIABLES & CACHE ---
window.userCache = window.userCache || {};
let statusUnsubscribe = null;
let currentChatId = null;
let isCurrentChatGroup = false;
let replyingToMsg = null; // নতুন: রিপ্লাই ট্র্যাকিং

// --- HELPER FUNCTIONS ---
window.getChatId = function(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; };

window.getCachedUserData = async (uid) => {
    if (window.userCache[uid]) return window.userCache[uid];
    try {
        const data = await window.getUserData(uid);
        if (data) window.userCache[uid] = data;
        return data;
    } catch (e) { return null; }
};

window.scrollToBottom = () => {
    const div = document.getElementById('messages-container');
    if (div) div.scrollTo({ top: div.scrollHeight, behavior: 'smooth' });
};

function formatStatusTime(timestamp) {
    if (!timestamp || typeof timestamp !== 'number') return "Offline";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Active just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Active ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Active ${hours}h ago`;
    return `Active ${Math.floor(hours / 24)} days ago`;
}

// --- SEARCH FEATURE ---
window.searchChats = () => {
    const input = document.getElementById('chat-search-input').value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-list-item');
    
    chatItems.forEach(item => {
        const name = item.querySelector('.chat-name').innerText.toLowerCase();
        const msg = item.querySelector('.chat-msg').innerText.toLowerCase();
        if (name.includes(input) || msg.includes(input)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

// --- PHOTO VIEWER FEATURE ---
window.openPhotoViewer = (url) => {
    const modal = document.getElementById('photo-viewer-modal');
    const img = document.getElementById('photo-viewer-img');
    img.src = url;
    modal.classList.remove('hidden');
    setTimeout(() => img.classList.remove('scale-95'), 10);
};

window.closePhotoViewer = () => {
    document.getElementById('photo-viewer-modal').classList.add('hidden');
    document.getElementById('photo-viewer-img').classList.add('scale-95');
};

// --- CUSTOM AUDIO PLAYER (NEW FEATURE) ---
window.toggleCustomAudio = (msgId) => {
    const audio = document.getElementById('audio-' + msgId);
    const icon = document.getElementById('audio-icon-' + msgId);
    const progress = document.getElementById('audio-progress-' + msgId);

    if (audio.paused) {
        // Pause other audios
        document.querySelectorAll('.chat-audio-element').forEach(a => {
            if(!a.paused) {
                a.pause();
                document.getElementById('audio-icon-' + a.id.split('-')[1]).className = 'fa-solid fa-play text-white';
            }
        });
        audio.play();
        icon.className = 'fa-solid fa-pause text-white';
    } else {
        audio.pause();
        icon.className = 'fa-solid fa-play text-white';
    }

    audio.ontimeupdate = () => {
        const percent = (audio.currentTime / audio.duration) * 100;
        progress.style.width = percent + '%';
    };

    audio.onended = () => {
        icon.className = 'fa-solid fa-play text-white';
        progress.style.width = '0%';
    };
};

// --- OPEN CHAT ---
window.startChat = (targetId, name, isGroup = false) => {
    window.currentChatUser = { uid: targetId, name, isGroup }; 
    isCurrentChatGroup = isGroup;
    currentChatId = isGroup ? targetId : window.getChatId(window.currentUser.uid, targetId);
    cancelReply(); // Reset reply
    
    document.getElementById('chat-list-view').classList.add('hidden');
    document.getElementById('chat-conversation-view').classList.remove('hidden');
    document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
    
    const statusText = document.getElementById('chat-header-status');
    
    if (isGroup) {
        document.getElementById('chat-header-img').innerHTML = `<div class="w-full h-full bg-blue-100 flex items-center justify-center text-blue-600"><i class="fa-solid fa-users"></i></div>`;
        statusText.innerText = "Group Chat";
        statusText.className = "text-[11px] text-gray-500 font-medium truncate";
        if (statusUnsubscribe) { statusUnsubscribe(); statusUnsubscribe = null; }
    } else {
        window.getCachedUserData(targetId).then(u => {
            if(u && u.profile_pic) {
                document.getElementById('chat-header-img').innerHTML = `<img src="${u.profile_pic}" class="w-full h-full object-cover">`;
                window.currentChatUser.profile_pic = u.profile_pic; 
            } else {
                document.getElementById('chat-header-img').innerHTML = window.escapeHTML(name).charAt(0);
            }
        });

        statusText.innerText = "Connecting..."; 
        if (statusUnsubscribe) statusUnsubscribe();
        
        statusUnsubscribe = onValue(ref(window.db, `status/${targetId}`), (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                if (data.state === 'online') {
                    statusText.innerText = "Active now";
                    statusText.className = "text-[11px] text-green-500 font-bold truncate";
                } else {
                    statusText.innerText = formatStatusTime(data.last_changed);
                    statusText.className = "text-[11px] text-gray-500 font-medium truncate";
                }
            } else {
                statusText.innerText = "Offline";
                statusText.className = "text-[11px] text-gray-500 font-medium truncate";
            }
        });
    }

    window.loadMessages();
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden');
    document.getElementById('chat-conversation-view').classList.add('hidden');
    window.currentChatUser = null;
    currentChatId = null;
    cancelReply();
    if (statusUnsubscribe) { statusUnsubscribe(); statusUnsubscribe = null; }
};

// --- CHAT LIST ---
window.loadChatList = (uid) => {
    onValue(ref(window.db, `user_chats/${uid}`), async (snap) => {
        const list = snap.val() || {};
        const container = document.getElementById('chat-list-container');

        if (Object.keys(list).length > 0) {
            const chatItems = await Promise.all(
                Object.entries(list)
                    .sort((a, b) => b[1].timestamp - a[1].timestamp)
                    .map(async ([peerUid, info]) => {
                        let profilePic = null;
                        if (!info.isGroup) {
                            const userData = await window.getCachedUserData(peerUid);
                            profilePic = userData?.profile_pic || null;
                        }
                        return { peerUid, info, profilePic };
                    })
            );

            container.innerHTML = chatItems.map(({ peerUid, info, profilePic }) => {
                let rawLastMsg = info.lastMessage || "";
                let displayMsg = rawLastMsg;
                let isUnread = info.unreadCount > 0;

                let prefix = rawLastMsg.startsWith("You: ") ? "You: " : "";
                if (prefix) rawLastMsg = rawLastMsg.substring(5);

                if (!rawLastMsg.includes("📷") && !rawLastMsg.includes("🎤")) {
                    try { rawLastMsg = window.decryptMsg(rawLastMsg); } catch(e) {}
                }
                displayMsg = prefix + rawLastMsg;

                let av = info.isGroup ? 
                    `<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 text-xl shrink-0 border border-blue-200"><i class="fa-solid fa-users text-sm"></i></div>` :
                    (profilePic ? `<img src="${profilePic}" class="w-12 h-12 rounded-full shrink-0 object-cover border border-gray-200" loading="lazy">` : `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-xl shrink-0">${window.escapeHTML(info.name).charAt(0)}</div>`);

                // Added 'chat-list-item', 'chat-name', 'chat-msg' for Search Feature
                return `
            <div onclick="startChat('${peerUid}', '${window.escapeHTML(info.name)}', ${info.isGroup ? 'true' : 'false'})" class="chat-list-item p-4 border-b bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition">
                ${av}
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <h4 class="chat-name ${isUnread && !prefix ? 'font-extrabold text-black' : 'font-bold text-gray-800'} text-base truncate pr-2">${window.escapeHTML(info.name)}</h4>
                        <span class="text-[10px] ${isUnread && !prefix ? 'text-green-600 font-bold' : 'text-gray-400'} shrink-0 whitespace-nowrap">${window.timeAgo(info.timestamp)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <p class="chat-msg text-sm ${isUnread && !prefix ? 'font-bold text-gray-800' : 'text-gray-500'} truncate block">${window.escapeHTML(displayMsg)}</p>
                        ${isUnread && !prefix ? `<span class="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">${info.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>`;
            }).join('');
        } else {
            container.innerHTML = '<div class="text-center mt-20"><div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300 text-2xl"><i class="fa-solid fa-comments"></i></div><p class="text-gray-400 text-sm font-bold">কোনো চ্যাট নেই</p></div>';
        }
    });
};

// --- SWIPE TO REPLY LOGIC (NEW) ---
window.prepareReply = (msgId, senderName, text) => {
    replyingToMsg = { id: msgId, name: senderName, text: text };
    document.getElementById('reply-preview-box').classList.remove('hidden');
    document.getElementById('reply-preview-name').innerText = senderName;
    document.getElementById('reply-preview-text').innerText = text;
    document.getElementById('msg-input').focus();
};

window.cancelReply = () => {
    replyingToMsg = null;
    document.getElementById('reply-preview-box').classList.add('hidden');
};

// Touch Swiper logic
let touchStartX = 0;
let swipingBlock = null;

document.getElementById('messages-container').addEventListener('touchstart', e => {
    const block = e.target.closest('.msg-swipe-block');
    if (block) {
        touchStartX = e.changedTouches[0].screenX;
        swipingBlock = block;
        block.style.transition = 'none';
    }
}, {passive: true});

document.getElementById('messages-container').addEventListener('touchmove', e => {
    if (!swipingBlock) return;
    const currentX = e.changedTouches[0].screenX;
    const diff = currentX - touchStartX;
    if (diff > 0 && diff < 80) { // Only swipe right up to 80px
        swipingBlock.style.transform = `translateX(${diff}px)`;
    }
}, {passive: true});

document.getElementById('messages-container').addEventListener('touchend', e => {
    if (!swipingBlock) return;
    const currentX = e.changedTouches[0].screenX;
    const diff = currentX - touchStartX;
    swipingBlock.style.transition = 'transform 0.3s ease';
    swipingBlock.style.transform = 'translateX(0)';
    
    if (diff > 50) {
        // Trigger Reply
        const msgId = swipingBlock.getAttribute('data-id');
        const sName = swipingBlock.getAttribute('data-name');
        const text = swipingBlock.getAttribute('data-text');
        window.prepareReply(msgId, sName, text);
    }
    swipingBlock = null;
});

// --- LOAD MESSAGES ---
window.loadMessages = () => {
    const div = document.getElementById('messages-container');
    div.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';
    update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), { unreadCount: 0 });

    onValue(query(ref(window.db, `chats/${currentChatId}`), limitToLast(100)), async (snap) => {
        const msgs = snap.val() || {};
        if (Object.keys(msgs).length > 0) {
            
            let htmlContent = "";
            let peerProfilePic = window.currentChatUser?.profile_pic;

            for (const [msgId, m] of Object.entries(msgs)) {
                const isMe = m.sender === window.currentUser.uid;
                if (!isMe && m.status !== 'seen') {
                    update(ref(window.db, `chats/${currentChatId}/${msgId}`), { status: 'seen' });
                }

                // Profile Pic Logic (Left Side) - NEW ALIGNMENT
                let avatarHtml = '';
                if (!isMe) {
                    avatarHtml = peerProfilePic 
                        ? `<img src="${peerProfilePic}" class="w-7 h-7 rounded-full object-cover shrink-0 mr-2 self-end mb-1 border border-gray-200">` 
                        : `<div class="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center text-[11px] font-bold text-green-700 shrink-0 mr-2 self-end mb-1">${window.currentChatUser?.name?.charAt(0) || 'U'}</div>`;
                }

                // Sender Name Resolution
                let senderNameText = isMe ? "You" : window.currentChatUser.name;
                if (!isMe && isCurrentChatGroup) {
                    const senderData = await window.getCachedUserData(m.sender);
                    senderNameText = senderData ? senderData.name.split(' ')[0] : 'Member';
                }

                // Message Content Decryption
                let rawText = "";
                let contentHtml = '';
                
                // Reply Block Rendering
                if (m.replyTo) {
                    contentHtml += `
                    <div class="bg-black/5 border-l-4 ${isMe ? 'border-green-300' : 'border-green-500'} p-1.5 rounded mb-1.5 text-left cursor-pointer hover:bg-black/10 transition" onclick="document.getElementById('msg-${m.replyTo.id}').scrollIntoView({behavior:'smooth'})">
                        <p class="text-[10px] font-bold ${isMe ? 'text-green-100' : 'text-green-600'}">${window.escapeHTML(m.replyTo.name)}</p>
                        <p class="text-[11px] ${isMe ? 'text-white/80' : 'text-gray-500'} truncate w-full max-w-[150px]">${window.escapeHTML(m.replyTo.text)}</p>
                    </div>`;
                }

                if (m.image) {
                    contentHtml += `<img src="${m.image}" onload="window.scrollToBottom()" class="rounded-lg mb-1 max-w-[200px] h-auto cursor-pointer border border-black/10 transition transform active:scale-95" onclick="window.openPhotoViewer('${m.image}')">`;
                    rawText = "📷 Photo";
                }
                if (m.audio) {
                    // Custom Audio Player UI
                    contentHtml += `
                    <div class="flex items-center gap-2 ${isMe ? 'bg-green-700' : 'bg-gray-100'} p-1.5 rounded-full mb-1 w-[180px]">
                        <button onclick="window.toggleCustomAudio('${msgId}')" class="${isMe ? 'bg-green-500' : 'bg-green-500'} w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm active:scale-90 transition">
                            <i id="audio-icon-${msgId}" class="fa-solid fa-play text-white text-xs pl-0.5"></i>
                        </button>
                        <div class="flex-1 h-1.5 bg-black/10 rounded-full relative overflow-hidden">
                            <div id="audio-progress-${msgId}" class="absolute left-0 top-0 h-full ${isMe ? 'bg-green-300' : 'bg-green-500'} w-0"></div>
                        </div>
                        <audio id="audio-${msgId}" class="chat-audio-element hidden" src="${m.audio}"></audio>
                    </div>`;
                    rawText = "🎤 Voice";
                }
                if (m.text) {
                    try {
                        const decrypted = window.decryptMsg(m.text);
                        contentHtml += `<span class="break-words inline-block text-left">${window.escapeHTML(decrypted)}</span>`;
                        rawText = decrypted;
                    } catch(e) { contentHtml += `Corrupted`; }
                }

                // Status Icon
                let statusIcon = '';
                if (isMe) {
                    if (m.status === 'seen') statusIcon = `<i class="fa-solid fa-check-double text-blue-300 ml-1 text-[10px]" title="Seen"></i>`;
                    else if (m.status === 'delivered') statusIcon = `<i class="fa-solid fa-check-double text-white/70 ml-1 text-[10px]" title="Delivered"></i>`;
                    else statusIcon = `<i class="fa-solid fa-check text-white/70 ml-1 text-[10px]" title="Sent"></i>`;
                }

                const msgDateHtml = `<div class="text-[9px] flex items-center justify-end gap-1 ${isMe ? 'text-green-100' : 'text-gray-400'} mt-1 min-w-[50px]"><span>${window.timeAgo(m.timestamp)}</span>${statusIcon}</div>`;

                // Swipe Block wrapper logic
                htmlContent += `
                <div id="msg-${msgId}" class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-3 overflow-hidden">
                    ${avatarHtml}
                    <div class="msg-swipe-block max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}" data-id="${msgId}" data-name="${window.escapeHTML(senderNameText)}" data-text="${window.escapeHTML(rawText)}">
                        ${(!isMe && isCurrentChatGroup) ? `<div class="text-[10px] font-bold text-blue-600 mb-0.5 ml-2">${senderNameText}</div>` : ''}
                        
                        <div class="px-3.5 py-2.5 text-[15px] shadow-sm relative ${isMe ? 'bg-green-600 text-white rounded-[18px_18px_4px_18px]' : 'bg-white text-gray-800 rounded-[18px_18px_18px_4px] border border-gray-100'}">
                            ${contentHtml}
                            ${msgDateHtml}
                        </div>
                    </div>
                </div>`;
            }

            div.innerHTML = htmlContent;
            requestAnimationFrame(() => window.scrollToBottom());
        } else {
            div.innerHTML = '<div class="text-center mt-20 text-gray-400"><div class="bg-gray-200 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-hand-wave text-2xl text-gray-500"></i></div><p class="text-sm font-bold">কথপোকথন শুরু করুন</p></div>';
        }
    });
};

// --- SEND MESSAGE (UPDATED FOR REPLY) ---
window.sendMsg = (imageUrl = null, audioUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text && !imageUrl && !audioUrl) return;
    
    const ts = Date.now();
    const msgData = { sender: window.currentUser.uid, timestamp: ts, status: 'sent' };
    
    // Attach reply data if exists
    if (replyingToMsg) {
        msgData.replyTo = replyingToMsg;
    }

    let lastMsgPreview = "";

    if (text) {
        msgData.text = window.encryptMsg(text);
        lastMsgPreview = text;
    }
    if (imageUrl) {
        msgData.image = imageUrl;
        lastMsgPreview = text ? ("📷 " + text) : "📷 ছবি";
    }
    if (audioUrl) {
        msgData.audio = audioUrl;
        lastMsgPreview = "🎤 ভয়েস মেসেজ";
    }

    push(ref(window.db, `chats/${currentChatId}`), msgData).then(() => {
        input.value = "";
        cancelReply(); // Clear reply after sending
    }).catch(e => window.showToast("মেসেজ পাঠানো যায়নি!", "error"));

    // Update Recent Chats
    if (isCurrentChatGroup) {
        get(ref(window.db, `groups/${currentChatId}/members`)).then(snap => {
            const members = snap.val() || [];
            members.forEach(memberUid => {
                const isMe = memberUid === window.currentUser.uid;
                const prefix = isMe ? "You: " : `${window.userDetails.name.split(' ')[0]}: `;
                const updateData = { name: window.currentChatUser.name, lastMessage: prefix + lastMsgPreview, timestamp: ts, isGroup: true };
                
                get(ref(window.db, `user_chats/${memberUid}/${currentChatId}/unreadCount`)).then(uSnap => {
                    let count = uSnap.val() || 0;
                    if (!isMe) updateData.unreadCount = count + 1;
                    update(ref(window.db, `user_chats/${memberUid}/${currentChatId}`), updateData);
                });
            });
        });
    } else {
        const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsgPreview, timestamp: ts, isGroup: false };
        const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsgPreview, timestamp: ts, isGroup: false };

        update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);
        get(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}/unreadCount`)).then(uSnap => {
            peerUpdate.unreadCount = (uSnap.val() || 0) + 1;
            update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);
        });
    }
};

window.handleEnter = (e) => { if (e.key === 'Enter') window.sendMsg(); };
