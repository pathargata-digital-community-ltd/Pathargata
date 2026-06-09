// messages.js
import {
    ref, push, set, onValue, get, update, remove, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Global Variables for New Features
window.currentReplyTo = null;
window.selectedMsgForOptions = null;
let pressTimer;
let mediaRecorder;
let audioChunks = [];

// --- CHAT HELPER FUNCTIONS ---
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

window.startChat = async (uid, name) => {
    window.currentChatUser = { uid, name };
    window.switchPage('messages');
    
    // Fetch and store friend's profile pic for messages
    const friendData = await window.getUserData(uid);
    window.currentChatUser.profile_pic = friendData?.profile_pic || null;

    document.getElementById('chat-list-view').classList.add('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
    
    // Header Pic Setup (Clicks to profile via HTML)
    let headerImg = document.getElementById('chat-header-img');
    if (window.currentChatUser.profile_pic) {
        headerImg.innerHTML = `<img src="${window.currentChatUser.profile_pic}" class="w-full h-full object-cover">`;
        headerImg.classList.remove('bg-green-100', 'text-green-700');
    } else {
        headerImg.innerHTML = window.escapeHTML(name).charAt(0);
        headerImg.classList.add('bg-green-100', 'text-green-700');
    }
    
    history.pushState({ page: 'chat-conversation', uid }, "", "#chat");
    window.loadMessages(uid);
    window.cancelReply(); // Reset reply state
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.add('hidden', 'hidden-custom');
    window.currentChatUser = null;
    window.cancelReply();
};

window.formatMessageTime = (timestamp) => {
    const date = new Date(timestamp);
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
};

// --- CHAT LIST --- (Kept original logic)
window.loadChatList = (uid) => {
    // ... (Your existing loadChatList code goes here, it is perfectly fine) ...
};

// --- LOAD MESSAGES (With Profile Pics, Time, Swipe, Long Press) ---
window.loadMessages = (otherUid) => {
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">লোড হচ্ছে...</p>';
    
    onValue(query(ref(window.db, `chats/${chatId}`), limitToLast(50)), (snap) => {
        const msgs = snap.val() || {};
        if (Object.keys(msgs).length > 0) {
            let html = '';
            
            Object.entries(msgs).forEach(([msgId, m]) => {
                // Check if removed for me
                if (m[`deletedFor_${window.currentUser.uid}`]) return;

                const isMe = m.sender === window.currentUser.uid;
                let content = '';

                // Reply Context
                if (m.replyToText) {
                    content += `<div class="bg-black bg-opacity-10 p-2 rounded text-xs mb-1 border-l-4 border-green-500 opacity-70">${window.escapeHTML(m.replyToText)}</div>`;
                }

                // Image
                if (m.image) content += `<img src="${m.image}" class="rounded-lg mb-1 max-w-full h-auto cursor-pointer" onclick="window.open('${m.image}')">`;
                
                // Audio
                if (m.audio) content += `<audio controls class="max-w-[200px] h-8 mb-1"><source src="${m.audio}" type="audio/webm">Your browser does not support audio.</audio>`;

                // Text
                if (m.text) {
                    const decrypted = window.decryptMsg(m.text);
                    content += `<span>${window.escapeHTML(decrypted)}</span>`;
                }

                // Time
                const timeStr = `<div class="text-[10px] text-gray-400 mt-1 text-right w-full">${window.formatMessageTime(m.timestamp)}</div>`;

                // Profile Pic for friend
                let profilePicHtml = '';
                if (!isMe) {
                    let pPic = window.currentChatUser.profile_pic ? 
                        `<img src="${window.currentChatUser.profile_pic}" class="w-6 h-6 rounded-full object-cover">` : 
                        `<div class="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-xs font-bold text-green-800">${window.currentChatUser.name.charAt(0)}</div>`;
                    profilePicHtml = `<div class="mr-2 self-end mb-1">${pPic}</div>`;
                }

                // Wrapper with touch events for Swipe & Long Press
                // (Escaping text to pass to JS functions)
                let rawText = m.text ? window.decryptMsg(m.text).replace(/'/g, "\\'") : (m.image ? "Photo" : "Voice Note");

                html += `
                <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-3" 
                     id="msg-wrap-${msgId}"
                     ontouchstart="handleMsgTouchStart(event, '${msgId}', '${rawText}', ${isMe})" 
                     ontouchend="handleMsgTouchEnd(event)" 
                     ontouchmove="handleMsgTouchMove(event)">
                     
                    ${profilePicHtml}
                    <div class="px-4 py-2 max-w-[75%] rounded-2xl shadow-sm text-sm flex flex-col ${isMe ? 'bg-green-500 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'}">
                        ${content}
                        ${timeStr}
                    </div>
                </div>`;
            });

            div.innerHTML = html || '<p class="text-center text-xs text-gray-400 mt-4">কথপোকথন শুরু করুন</p>';
            setTimeout(() => { div.scrollTop = div.scrollHeight; }, 100);
        } else {
            div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">কথপোকথন শুরু করুন</p>';
        }
    });
};

// --- SEND MESSAGE & IMAGE UPLOAD ---
window.sendMsg = (imageUrl = null, audioUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text && !imageUrl && !audioUrl) return;
    
    const btn = document.getElementById('btn-chat-send');
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    const ts = Date.now();

    const encryptedText = text ? window.encryptMsg(text) : "";
    const msgData = { sender: window.currentUser.uid, timestamp: ts };
    
    if (text) msgData.text = encryptedText;
    if (imageUrl) msgData.image = imageUrl;
    if (audioUrl) msgData.audio = audioUrl;

    // Attach reply info if exists
    if (window.currentReplyTo) {
        msgData.replyToText = window.currentReplyTo;
    }

    push(ref(window.db, `chats/${chatId}`), msgData);

    // Update Last Message List
    let lastMsgText = encryptedText;
    if (imageUrl) lastMsgText = text ? "📷 " + encryptedText : "📷 ছবি পাঠিয়েছেন";
    if (audioUrl) lastMsgText = "🎤 ভয়েস মেসেজ";

    const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsgText, timestamp: ts };
    const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsgText, timestamp: ts };

    update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);
    update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);

    input.value = "";
    window.cancelReply(); // Hide reply bar after sending
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    btn.disabled = false;
};

// --- SWIPE TO REPLY & LONG PRESS LOGIC ---
let touchStartX = 0;
let touchEndX = 0;

window.handleMsgTouchStart = (e, msgId, msgText, isMe) => {
    touchStartX = e.changedTouches[0].screenX;
    
    // Long Press logic
    pressTimer = setTimeout(() => {
        window.openMsgOptions(msgId, msgText, isMe);
    }, 600); // 600ms = Long press
};

window.handleMsgTouchMove = (e) => {
    clearTimeout(pressTimer); // Cancel long press if finger moves
};

window.handleMsgTouchEnd = (e) => {
    clearTimeout(pressTimer); // Cancel long press if finger lifts early
    
    touchEndX = e.changedTouches[0].screenX;
    // Right Swipe (Distance > 60px)
    if (touchEndX - touchStartX > 60) {
        window.setupReply(e.currentTarget.innerText.split('\n')[0].substring(0, 30) + '...');
    }
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
    window.selectedMsgForOptions = { msgId, text };
    document.getElementById('msg-options-modal').classList.remove('hidden');
    
    // Hide Unsend if it's not my message
    const unsendBtn = document.getElementById('btn-unsend');
    if(isMe) {
        unsendBtn.style.display = 'flex';
    } else {
        unsendBtn.style.display = 'none';
    }
    // Haptic feedback if supported
    if(navigator.vibrate) navigator.vibrate(50);
};

window.closeMsgOptions = () => {
    document.getElementById('msg-options-modal').classList.add('hidden');
    window.selectedMsgForOptions = null;
};

window.unsendMessage = () => {
    if(!window.selectedMsgForOptions || !window.currentChatUser) return;
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    
    remove(ref(window.db, `chats/${chatId}/${window.selectedMsgForOptions.msgId}`))
    .then(() => {
        window.showToast("Message Unsent");
        window.closeMsgOptions();
    });
};

window.removeMessageForMe = () => {
    if(!window.selectedMsgForOptions || !window.currentChatUser) return;
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    
    let updates = {};
    updates[`deletedFor_${window.currentUser.uid}`] = true;
    
    update(ref(window.db, `chats/${chatId}/${window.selectedMsgForOptions.msgId}`), updates)
    .then(() => {
        window.closeMsgOptions();
    });
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

    Promise.all(window.myFriends.map(uid => window.getUserData(uid))).then(friendsData => {
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
    });
};

window.closeForwardModal = () => {
    document.getElementById('forward-modal').classList.add('hidden');
};

window.doForward = (targetUid) => {
    if(!window.selectedMsgForOptions) return;
    
    const chatId = window.getChatId(window.currentUser.uid, targetUid);
    const ts = Date.now();
    const encryptedText = window.encryptMsg(window.selectedMsgForOptions.text);

    const msgData = { 
        sender: window.currentUser.uid, 
        timestamp: ts,
        text: encryptedText 
    };

    push(ref(window.db, `chats/${chatId}`), msgData);
    window.showToast("Forwarded Successfully");
    window.closeForwardModal();
};

// --- VOICE RECORDING LOGIC ---
window.startVoiceRecord = async () => {
    const btn = document.getElementById('btn-voice-record');
    btn.classList.add('text-red-500', 'bg-red-100'); // Show active state
    btn.innerHTML = '<i class="fa-solid fa-stop"></i>';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => {
            audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            // Convert Blob to File object so it works with your Cloudinary function
            const audioFile = new File([audioBlob], "voice_msg.webm", { type: 'audio/webm' });
            
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-gray-500"></i>';
            btn.classList.remove('text-red-500', 'bg-red-100');
            
            // Assuming your uploadMediaToCloudinary handles Files
            window.uploadMediaToCloudinary(audioFile).then(res => {
                window.sendMsg(null, res.url); // text=null, image=null, audio=res.url
                btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            }).catch(e => {
                window.showToast("ভয়েস পাঠানো যায়নি!", 'error');
                btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
            });
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
        mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Stop mic usage
    }
};

// Retain your handleChatImageSelect
window.handleChatImageSelect = () => {
    const file = document.getElementById('chat-img-input').files[0];
    if (file) {
        const btn = document.getElementById('btn-chat-send');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        window.uploadMediaToCloudinary(file).then(res => {
            window.sendMsg(res.url, null); // Pass URL to image, null to audio
            document.getElementById('chat-img-input').value = "";
        }).catch(e => {
            window.showToast("ছবি আপলোড হয়নি: " + e.message, 'error');
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            btn.disabled = false;
        });
    }
};