import {
    ref, push, set, onValue, get, update, remove, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ==========================================
// 1. GLOBAL VARIABLES & CACHE
// ==========================================
window.userCache = window.userCache || {};
let statusUnsubscribe = null;
let currentChatId = null;
window.isCurrentChatGroup = false;
let replyingToMsg = null;

// Voice Recording Variables
let chatMediaRecorder;
let chatAudioChunks = [];
let chatRecordingTimer;
let chatRecordSeconds = 0;

// Android Native Bubble Variables
let floatingChatUserId = null;
let floatingChatUserName = null;
let initialChatLoad = true;

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
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

// ==========================================
// 3. UI FEATURES (Search, Photo, Audio)
// ==========================================
window.searchChats = () => {
    const input = document.getElementById('chat-search-input').value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-list-item');
    chatItems.forEach(item => {
        const name = item.querySelector('.chat-name').innerText.toLowerCase();
        const msg = item.querySelector('.chat-msg').innerText.toLowerCase();
        item.style.display = (name.includes(input) || msg.includes(input)) ? 'flex' : 'none';
    });
};

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

window.toggleCustomAudio = (msgId) => {
    const audio = document.getElementById('audio-' + msgId);
    const icon = document.getElementById('audio-icon-' + msgId);
    const progress = document.getElementById('audio-progress-' + msgId);

    if (audio.paused) {
        document.querySelectorAll('.chat-audio-element').forEach(a => {
            if(!a.paused) {
                a.pause();
                const oldIcon = document.getElementById('audio-icon-' + a.id.split('-')[1]);
                if(oldIcon) oldIcon.className = 'fa-solid fa-play text-white text-xs pl-0.5';
            }
        });
        audio.play();
        icon.className = 'fa-solid fa-pause text-white text-xs';
    } else {
        audio.pause();
        icon.className = 'fa-solid fa-play text-white text-xs pl-0.5';
    }

    audio.ontimeupdate = () => { progress.style.width = ((audio.currentTime / audio.duration) * 100) + '%'; };
    audio.onended = () => { icon.className = 'fa-solid fa-play text-white text-xs pl-0.5'; progress.style.width = '0%'; };
};

// ==========================================
// 4. SWIPE TO REPLY LOGIC 
// ==========================================
window.prepareReply = (msgId, senderName, text) => {
    replyingToMsg = { id: msgId, name: senderName, text: text };
    document.getElementById('reply-preview-box').classList.remove('hidden');
    document.getElementById('reply-preview-name').innerText = senderName;
    document.getElementById('reply-preview-text').innerText = text;
    document.getElementById('msg-input').focus();
};

window.cancelReply = () => {
    replyingToMsg = null;
    const previewBox = document.getElementById('reply-preview-box');
    if(previewBox) previewBox.classList.add('hidden');
};

let touchStartX = 0;
let swipingBlock = null;

document.addEventListener('touchstart', e => {
    const container = e.target.closest('#messages-container');
    if (!container) return; 
    
    const block = e.target.closest('.msg-swipe-block');
    if (block) {
        touchStartX = e.changedTouches[0].screenX;
        swipingBlock = block;
        block.style.transition = 'none';
    }
}, {passive: true});

document.addEventListener('touchmove', e => {
    if (!swipingBlock) return;
    const diff = e.changedTouches[0].screenX - touchStartX;
    if (diff > 0 && diff < 80) swipingBlock.style.transform = `translateX(${diff}px)`;
}, {passive: true});

document.addEventListener('touchend', e => {
    if (!swipingBlock) return;
    const diff = e.changedTouches[0].screenX - touchStartX;
    swipingBlock.style.transition = 'transform 0.3s ease';
    swipingBlock.style.transform = 'translateX(0)';
    
    if (diff > 50) {
        window.prepareReply(
            swipingBlock.getAttribute('data-id'), 
            swipingBlock.getAttribute('data-name'), 
            swipingBlock.getAttribute('data-text')
        );
    }
    swipingBlock = null;
});

// ==========================================
// 5. CORE CHAT LOGIC (Open, Close, List)
// ==========================================
window.startChat = (targetId, name, isGroup = false) => {
    window.currentChatUser = { uid: targetId, name, isGroup }; 
    window.isCurrentChatGroup = isGroup;
    currentChatId = isGroup ? targetId : window.getChatId(window.currentUser.uid, targetId);
    window.cancelReply(); 
    
    window.switchPage('messages'); 
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

    history.pushState({ page: 'chat-conversation', uid: targetId }, "", "#chat");
    window.loadMessages();
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden');
    document.getElementById('chat-conversation-view').classList.add('hidden');
    window.currentChatUser = null;
    currentChatId = null;
    window.cancelReply(); 
    if (statusUnsubscribe) { statusUnsubscribe(); statusUnsubscribe = null; }
};

window.loadChatList = (uid) => {
    onValue(ref(window.db, `user_chats/${uid}`), async (snap) => {
        const list = snap.val() || {};
        const container = document.getElementById('chat-list-container');

        if (Object.keys(list).length > 0) {
            const chatItems = await Promise.all(
                Object.entries(list).sort((a, b) => b[1].timestamp - a[1].timestamp).map(async ([peerUid, info]) => {
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
            container.innerHTML = '<div class="text-center mt-20 text-gray-400"><div class="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-comments text-2xl text-gray-400"></i></div><p class="text-sm font-bold">কোনো চ্যাট নেই</p></div>';
        }
    });
};

// ==========================================
// 6. LOAD MESSAGES, READ RECEIPTS & DELETE BTN
// ==========================================
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

                let avatarHtml = '';
                if (!isMe) {
                    avatarHtml = peerProfilePic 
                        ? `<img src="${peerProfilePic}" class="w-7 h-7 rounded-full object-cover shrink-0 mr-2 self-end mb-1 border border-gray-200">` 
                        : `<div class="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center text-[11px] font-bold text-green-700 shrink-0 mr-2 self-end mb-1">${window.currentChatUser?.name?.charAt(0) || 'U'}</div>`;
                }

                let senderNameText = isMe ? "You" : window.currentChatUser.name;
                if (!isMe && window.isCurrentChatGroup) {
                    const senderData = await window.getCachedUserData(m.sender);
                    senderNameText = senderData ? senderData.name.split(' ')[0] : 'Member';
                }

                let rawText = "";
                let contentHtml = '';
                
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
                    contentHtml += `
                    <div class="flex items-center gap-2 ${isMe ? 'bg-green-700' : 'bg-gray-200'} p-1.5 rounded-full mb-1 w-[180px]">
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

                let statusIcon = '';
                let deleteBtn = '';

                if (isMe) {
                    if (m.status === 'seen') statusIcon = `<i class="fa-solid fa-check-double text-blue-300 ml-1 text-[10px]" title="Seen"></i>`;
                    else if (m.status === 'delivered') statusIcon = `<i class="fa-solid fa-check-double text-white/70 ml-1 text-[10px]" title="Delivered"></i>`;
                    else statusIcon = `<i class="fa-solid fa-check text-white/70 ml-1 text-[10px]" title="Sent"></i>`;
                    
                    // Added Delete Button for specific message
                    deleteBtn = `<button onclick="window.deleteSpecificMessage('${currentChatId}', '${msgId}')" class="ml-3 text-white/70 hover:text-red-400 transition" title="Delete Message"><i class="fa-solid fa-trash text-[10px]"></i></button>`;
                }

                const msgDateHtml = `<div class="text-[9px] flex items-center justify-end gap-1 ${isMe ? 'text-green-100' : 'text-gray-400'} mt-1 min-w-[50px]"><span>${window.timeAgo(m.timestamp)}</span>${statusIcon}${deleteBtn}</div>`;

                htmlContent += `
                <div id="msg-${msgId}" class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-3 overflow-hidden">
                    ${avatarHtml}
                    <div class="msg-swipe-block max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}" data-id="${msgId}" data-name="${window.escapeHTML(senderNameText)}" data-text="${window.escapeHTML(rawText)}">
                        ${(!isMe && window.isCurrentChatGroup) ? `<div class="text-[10px] font-bold text-blue-600 mb-0.5 ml-2">${senderNameText}</div>` : ''}
                        
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

// ==========================================
// 7. SEND MESSAGE LOGIC
// ==========================================
window.sendMsg = (imageUrl = null, audioUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text && !imageUrl && !audioUrl) return;
    
    const ts = Date.now();
    const msgData = { sender: window.currentUser.uid, timestamp: ts, status: 'sent' };
    
    if (replyingToMsg) msgData.replyTo = replyingToMsg;

    let lastMsgPreview = "";
    if (text) { msgData.text = window.encryptMsg(text); lastMsgPreview = text; }
    if (imageUrl) { msgData.image = imageUrl; lastMsgPreview = text ? ("📷 " + text) : "📷 ছবি"; }
    if (audioUrl) { msgData.audio = audioUrl; lastMsgPreview = "🎤 ভয়েস মেসেজ"; }

    push(ref(window.db, `chats/${currentChatId}`), msgData).then(() => {
        input.value = "";
        window.cancelReply(); 
    }).catch(e => window.showToast("মেসেজ পাঠানো যায়নি!", "error"));

    if (window.isCurrentChatGroup) {
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

// ==========================================
// 8. VOICE & IMAGE UPLOAD LOGIC
// ==========================================
window.startChatRecording = async () => {
    if (navigator.userAgent.indexOf('wv') > -1 || navigator.userAgent.indexOf('Median') > -1) {
        window.location.href = 'median://permissions/request?permissions=android.permission.RECORD_AUDIO';
    }
    await new Promise(r => setTimeout(r, 500));
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return window.showToast("অডিও সাপোর্ট করছে না।", "error");

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chatMediaRecorder = new MediaRecorder(stream);
        chatAudioChunks = [];
        chatMediaRecorder.ondataavailable = event => { if (event.data.size > 0) chatAudioChunks.push(event.data); };
        chatMediaRecorder.onstop = () => { sendChatVoice(new Blob(chatAudioChunks, { type: 'audio/mp3' })); };
        chatMediaRecorder.start();
        
        document.getElementById('chat-default-input-ui').classList.add('hidden');
        document.getElementById('chat-voice-recording-ui').classList.remove('hidden');
        
        chatRecordSeconds = 0;
        document.getElementById('chat-record-timer').innerText = "00:00";
        chatRecordingTimer = setInterval(() => {
            chatRecordSeconds++;
            const mins = Math.floor(chatRecordSeconds / 60).toString().padStart(2, '0');
            const secs = (chatRecordSeconds % 60).toString().padStart(2, '0');
            document.getElementById('chat-record-timer').innerText = `${mins}:${secs}`;
        }, 1000);
    } catch (err) { window.showToast("মাইক্রোফোন পারমিশন দিন", "error"); }
};

window.stopAndSendChatRecording = () => {
    if (chatMediaRecorder && chatMediaRecorder.state !== 'inactive') {
        chatMediaRecorder.stop(); 
        clearInterval(chatRecordingTimer);
        chatMediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
};

window.cancelChatRecording = () => {
    if (chatMediaRecorder && chatMediaRecorder.state !== 'inactive') {
        chatMediaRecorder.onstop = null; 
        chatMediaRecorder.stop();
        chatMediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(chatRecordingTimer);
    document.getElementById('chat-voice-recording-ui').classList.add('hidden');
    document.getElementById('chat-default-input-ui').classList.remove('hidden');
};

const sendChatVoice = async (audioBlob) => {
    const file = new File([audioBlob], "chat_voice.mp3", { type: 'audio/mp3' });
    document.getElementById('chat-voice-recording-ui').classList.add('hidden');
    document.getElementById('chat-default-input-ui').classList.remove('hidden');
    const msgInput = document.getElementById('msg-input');
    msgInput.placeholder = "Sending audio..."; msgInput.disabled = true;

    try {
        const res = await window.uploadMediaToCloudinary(file);
        window.sendMsg(null, res.url); 
    } catch (e) { window.showToast("ভয়েস পাঠানো যায়নি!", 'error'); } 
    finally { msgInput.placeholder = "মেসেজ লিখুন..."; msgInput.disabled = false; }
};

window.handleChatImageSelect = () => {
    const file = document.getElementById('chat-img-input').files[0];
    if (file) {
        const btn = document.getElementById('btn-chat-send');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sm"></i>'; btn.disabled = true;

        window.uploadMediaToCloudinary(file).then(res => {
            window.sendMsg(res.url);
            document.getElementById('chat-img-input').value = "";
        }).catch(e => window.showToast("ছবি আপলোড হয়নি", 'error'))
          .finally(() => { btn.innerHTML = oldHtml; btn.disabled = false; });
    }
};

// ==========================================
// 9. GROUP CREATION LOGIC (FIXED)
// ==========================================
window.selectedGroupFriends = [];

window.openGroupCreateModal = async () => {
    window.selectedGroupFriends = [];
    document.getElementById('group-name-input').value = "";
    document.getElementById('group-create-modal').classList.remove('hidden', 'hidden-custom');
    
    const listDiv = document.getElementById('group-friends-list');
    listDiv.innerHTML = '<p class="text-center text-sm text-gray-500 py-4">লোড হচ্ছে...</p>';

    if (!window.myFriends || window.myFriends.length === 0) {
        listDiv.innerHTML = '<p class="text-center text-sm text-red-400 py-4">আগে বন্ধু যুক্ত করুন!</p>'; 
        return;
    }
    
    const friendsData = await Promise.all(window.myFriends.map(uid => window.getCachedUserData(uid)));
    listDiv.innerHTML = friendsData.filter(u => u).map(u => {
        let av = u.profile_pic ? `<img src="${u.profile_pic}" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold">${window.escapeHTML(u.name).charAt(0)}</div>`;
        return `
        <label class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition">
            <input type="checkbox" value="${u.uid}" onchange="window.toggleGroupFriend(this)" class="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-500">
            ${av} <span class="font-bold text-gray-700">${window.escapeHTML(u.name)}</span>
        </label>`;
    }).join('');
};

window.closeGroupModal = () => document.getElementById('group-create-modal').classList.add('hidden', 'hidden-custom');

window.toggleGroupFriend = (cb) => { 
    if (cb.checked) window.selectedGroupFriends.push(cb.value); 
    else window.selectedGroupFriends = window.selectedGroupFriends.filter(id => id !== cb.value); 
};

window.createGroup = () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (!name) return window.showToast("গ্রুপের নাম দিন!", "error");
    if (window.selectedGroupFriends.length < 1) return window.showToast("অন্তত ১ জন বন্ধু সিলেক্ট করুন!", "error");

    const btn = document.querySelector('#group-create-modal button.bg-green-600');
    const originalText = btn.innerText;
    btn.innerText = "তৈরি হচ্ছে...";
    btn.disabled = true;

    const groupId = 'group_' + Date.now();
    const members = [...window.selectedGroupFriends, window.currentUser.uid];

    set(ref(window.db, `groups/${groupId}`), { 
        name: name, 
        admin: window.currentUser.uid, 
        members: members, 
        createdAt: Date.now() 
    }).then(() => {
        const ts = Date.now();
        const updates = {};
        
        // Update user_chats for all selected members simultaneously
        members.forEach(memberUid => {
            updates[`user_chats/${memberUid}/${groupId}`] = { 
                name: name, 
                lastMessage: "Group created", 
                timestamp: ts, 
                isGroup: true, 
                unreadCount: 0 
            };
        });
        
        update(ref(window.db), updates).then(() => {
            window.closeGroupModal();
            window.startChat(groupId, name, true); 
            btn.innerText = originalText;
            btn.disabled = false;
        });
    }).catch(e => {
        window.showToast("ত্রুটি: " + e.message, "error");
        btn.innerText = originalText;
        btn.disabled = false;
    });
};

// ==========================================
// 10. DELETE CHATS
// ==========================================
window.deleteSpecificMessage = (chatId, msgId) => {
    if(confirm("এই মেসেজটি ডিলিট করতে চান?")) {
        remove(ref(window.db, `chats/${chatId}/${msgId}`)).then(() => {
            window.showToast("ডিলিট হয়েছে");
        }).catch(e => {
            window.showToast("ডিলিট করতে সমস্যা হয়েছে", "error");
        });
    }
};

window.deleteEntireConversation = () => {
    if(!window.currentChatUser) return;
    if(confirm("পুরো চ্যাট হিস্ট্রি ডিলিট করতে চান?")) {
        remove(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`)).then(() => {
            window.showToast("চ্যাট ডিলিট হয়েছে"); window.closeChat(); 
        });
    }
};

// ==========================================
// 11. NATIVE ANDROID BUBBLE (SYSTEM ALERT)
// ==========================================
window.listenForGlobalMessages = (uid) => {
    onValue(ref(window.db, `user_chats/${uid}`), (snap) => {
        if (initialChatLoad) { initialChatLoad = false; return; }
        const list = snap.val() || {};
        let latestPeer = null; let latestInfo = null;
        
        for (const [peerUid, info] of Object.entries(list)) {
            if (!latestInfo || info.timestamp > latestInfo.timestamp) { latestInfo = info; latestPeer = peerUid; }
        }

        if (latestInfo && latestPeer) {
            if (!latestInfo.lastMessage.startsWith("You:") && (!window.currentChatUser || window.currentChatUser.uid !== latestPeer)) {
                showFloatingChatHead(latestPeer, latestInfo);
            }
        }
    });
};

function showFloatingChatHead(peerUid, info) {
    floatingChatUserId = peerUid;
    floatingChatUserName = info.name;
    
    if (window.AndroidBridge) {
        if (window.AndroidBridge.requestBubblePermission) {
            window.AndroidBridge.requestBubblePermission();
        }
        if (window.AndroidBridge.showBubble) {
            window.AndroidBridge.showBubble();
        }
    }
}

// ==========================================
// 12. AUTO LOAD CHATS & ACTIVE FRIENDS (REAL-TIME STATUS)
// ==========================================
window.loadQuickChatFriends = async () => {
    const container = document.getElementById('quick-chat-friends');
    if (!container) return;

    if (!window.myFriends || window.myFriends.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 pl-2">আগে বন্ধু যুক্ত করুন।</p>';
        return;
    }

    let html = '';
    for (let uid of window.myFriends) {
        const u = await window.getCachedUserData(uid);
        if (u) {
            let av = u.profile_pic 
                ? `<img src="${u.profile_pic}" class="w-12 h-12 rounded-full object-cover border-2 border-gray-200 p-0.5 shadow-sm">` 
                : `<div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-700 text-lg border-2 border-gray-200 p-0.5 shadow-sm">${window.escapeHTML(u.name).charAt(0)}</div>`;
            
            html += `
            <div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="inline-flex flex-col items-center cursor-pointer min-w-[60px] transform transition hover:scale-105">
                <div class="relative">
                    ${av}
                    <div id="status-dot-${u.uid}" class="absolute bottom-0 right-0 w-3.5 h-3.5 bg-gray-400 border-2 border-white rounded-full hidden"></div>
                </div>
                <span class="text-[10px] font-bold text-gray-700 mt-1 truncate w-14 text-center">${window.escapeHTML(u.name).split(' ')[0]}</span>
                <span id="status-text-${u.uid}" class="text-[8px] text-gray-400 truncate w-14 text-center">Offline</span>
            </div>`;
        }
    }
    container.innerHTML = html;

    // Attach Real-Time Listeners for Each Friend's Status
    window.myFriends.forEach(uid => {
        onValue(ref(window.db, `status/${uid}`), (snap) => {
            const dot = document.getElementById(`status-dot-${uid}`);
            const text = document.getElementById(`status-text-${uid}`);
            if (!dot || !text) return;

            if (snap.exists()) {
                const data = snap.val();
                dot.classList.remove('hidden'); 
                if (data.state === 'online') {
                    dot.classList.replace('bg-gray-400', 'bg-green-500');
                    text.innerText = 'Active';
                    text.classList.replace('text-gray-400', 'text-green-500');
                } else {
                    dot.classList.replace('bg-green-500', 'bg-gray-400');
                    text.innerText = window.timeAgo(data.last_changed) || 'Offline';
                    text.classList.replace('text-green-500', 'text-gray-400');
                }
            } else {
                dot.classList.add('hidden');
                text.innerText = 'Offline';
            }
        });
    });
};

// Auto Initialize Check
setTimeout(() => {
    if (window.currentUser) {
        if (window.loadChatList) window.loadChatList(window.currentUser.uid);
        if (window.loadQuickChatFriends) window.loadQuickChatFriends();
    }
}, 1500);