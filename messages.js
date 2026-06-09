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

// Pagination & Listeners
let currentChatUnsubscribe = null;
let currentChatLimit = 20; // Initially load 20 messages
let isFetchingOlder = false;
let lastScrollHeight = 0;

// --- CHAT HELPER FUNCTIONS ---
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

window.startChat = async (uid, name) => {
    try {
        window.currentChatUser = { uid, name };
        window.switchPage('messages');
        
        // Reset Pagination
        currentChatLimit = 20; 
        isFetchingOlder = false;

        // Fetch and store friend's profile pic for messages
        const friendData = await window.getUserData(uid);
        window.currentChatUser.profile_pic = friendData?.profile_pic || null;

        document.getElementById('chat-list-view').classList.add('hidden', 'hidden-custom');
        document.getElementById('chat-conversation-view').classList.remove('hidden', 'hidden-custom');
        document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
        
        // Header Pic Setup
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
        window.cancelReply(); 
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
    
    // Unsubscribe from chat listener to save memory
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe();
        currentChatUnsubscribe = null;
    }
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
                `<div class="w-12 h-12 relative"><img src="${u.profile_pic}" class="w-full h-full rounded-full object-cover"><div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>` : 
                `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-lg relative">${window.escapeHTML(u.name).charAt(0)}<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div></div>`;
            return `<div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="flex flex-col items-center cursor-pointer min-w-[50px]">${av}<span class="text-[10px] text-gray-600 mt-1 truncate w-14 text-center font-bold">${window.escapeHTML(u.name).split(' ')[0]}</span></div>`;
        }).join('');
    } catch (error) {
        console.error("Error loading quick friends:", error);
    }
};

// --- CHAT LIST (Recent Conversations) ---
window.loadChatList = (uid) => {
    try {
        const container = document.getElementById('chat-list-container');
        container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">লোড হচ্ছে...</p>';

        onValue(ref(window.db, `user_chats/${uid}`), async (snap) => {
            const list = snap.val();
            
            // Error Handling: If no chats found
            if (!list || Object.keys(list).length === 0) {
                container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">কোনো কনভারসেশন নেই</p>';
                return;
            }

            try {
                const promises = Object.entries(list).sort((a, b) => b[1].timestamp - a[1].timestamp).map(async ([peerUid, info]) => {
                    const userData = await window.getUserData(peerUid);
                    const profilePic = userData?.profile_pic;
                    return { peerUid, info, profilePic };
                });

                const chatItems = await Promise.all(promises);

                container.innerHTML = chatItems.map(({ peerUid, info, profilePic }) => {
                    let rawLastMsg = info.lastMessage || "";
                    let displayMsg = rawLastMsg;

                    let prefix = "";
                    if (rawLastMsg.startsWith("You: ")) {
                        prefix = "You: ";
                        rawLastMsg = rawLastMsg.substring(5);
                    }

                    if (!rawLastMsg.includes("📷") && !rawLastMsg.includes("🎤")) {
                        try { rawLastMsg = window.decryptMsg(rawLastMsg); } 
                        catch(e) { rawLastMsg = "মেসেজটি পড়া যাচ্ছে না"; }
                    }
                    displayMsg = prefix + rawLastMsg;

                    let av = profilePic ?
                        `<img src="${profilePic}" class="w-12 h-12 rounded-full shrink-0 object-cover border border-gray-200">` :
                        `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-xl shrink-0">${window.escapeHTML(info.name).charAt(0)}</div>`;

                    return `
                <div onclick="startChat('${peerUid}', '${window.escapeHTML(info.name)}')" class="p-4 border-b bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-3">
                    ${av}
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-0.5">
                            <h4 class="font-bold text-gray-800 text-base truncate pr-2">${window.escapeHTML(info.name)}</h4>
                            <span class="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">${window.timeAgo(info.timestamp)}</span>
                        </div>
                        <p class="text-sm text-gray-500 truncate block">${window.escapeHTML(displayMsg)}</p>
                    </div>
                </div>`;
                }).join('');
            } catch (err) {
                container.innerHTML = '<p class="text-center text-red-400 mt-10 text-sm">ডাটা লোড করতে সমস্যা হয়েছে</p>';
                console.error("Error mapping chats:", err);
            }
        }, (error) => {
            container.innerHTML = '<p class="text-center text-red-400 mt-10 text-sm">ডাটাবেস কানেকশনে সমস্যা</p>';
            console.error("Firebase Read Error:", error);
        });
    } catch (error) {
        console.error("Error in loadChatList:", error);
    }
};

// --- LOAD MESSAGES (Lazy Load, Status, Time, Profile Pics) ---
window.loadMessages = (otherUid, isPagination = false) => {
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    
    if (!isPagination) {
        div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">লোড হচ্ছে...</p>';
    }

    // Handle Scroll for Lazy Loading
    div.onscroll = () => {
        if (div.scrollTop === 0 && !isFetchingOlder) {
            isFetchingOlder = true;
            lastScrollHeight = div.scrollHeight;
            currentChatLimit += 20; // Load 20 more messages
            window.loadMessages(otherUid, true);
        }
    };

    if (currentChatUnsubscribe) {
        currentChatUnsubscribe(); // Unsubscribe previous listener
    }

    try {
        currentChatUnsubscribe = onValue(query(ref(window.db, `chats/${chatId}`), limitToLast(currentChatLimit)), (snap) => {
            const msgs = snap.val() || {};
            
            if (Object.keys(msgs).length > 0) {
                let html = '';
                let updatesForSeen = {}; // To mark messages as seen
                let unreadFound = false;

                Object.entries(msgs).forEach(([msgId, m]) => {
                    // Skip if removed for me
                    if (m[`deletedFor_${window.currentUser.uid}`]) return;

                    const isMe = m.sender === window.currentUser.uid;
                    let content = '';

                    // Mark as Seen logic
                    if (!isMe && m.status !== 'seen') {
                        updatesForSeen[`chats/${chatId}/${msgId}/status`] = 'seen';
                        unreadFound = true;
                    }

                    // Reply Context
                    if (m.replyToText) {
                        content += `<div class="bg-black bg-opacity-10 p-2 rounded text-xs mb-1 border-l-4 border-green-500 opacity-70">${window.escapeHTML(m.replyToText)}</div>`;
                    }

                    // Content types
                    if (m.image) content += `<img src="${m.image}" class="rounded-lg mb-1 max-w-full h-auto cursor-pointer" onclick="window.open('${m.image}')">`;
                    if (m.audio) content += `<audio controls class="max-w-[200px] h-8 mb-1"><source src="${m.audio}" type="audio/webm">Your browser does not support audio.</audio>`;
                    if (m.text) {
                        try {
                            const decrypted = window.decryptMsg(m.text);
                            content += `<span>${window.escapeHTML(decrypted)}</span>`;
                        } catch(e) { content += `<span>[Error decrypting]</span>`; }
                    }

                    // Message Status Indicator (For my messages)
                    let statusIcon = '';
                    if (isMe) {
                        if (m.status === 'seen') {
                            statusIcon = window.currentChatUser.profile_pic ? 
                                `<img src="${window.currentChatUser.profile_pic}" class="w-3 h-3 rounded-full ml-1 inline-block object-cover" title="Seen">` : 
                                `<i class="fa-solid fa-circle-check text-green-500 text-[10px] ml-1" title="Seen"></i>`;
                        } else if (m.status === 'delivered') {
                            statusIcon = `<i class="fa-solid fa-circle-check text-gray-500 text-[10px] ml-1" title="Delivered"></i>`;
                        } else {
                            // Default to Sent
                            statusIcon = `<i class="fa-regular fa-circle-check text-gray-400 text-[10px] ml-1" title="Sent"></i>`;
                        }
                    }

                    // Time and Status String
                    const timeStr = `<div class="text-[10px] text-gray-400 mt-1 flex items-center justify-end w-full">${window.formatMessageTime(m.timestamp)} ${statusIcon}</div>`;

                    // Profile Pic for friend
                    let profilePicHtml = '';
                    if (!isMe) {
                        let pPic = window.currentChatUser.profile_pic ? 
                            `<img src="${window.currentChatUser.profile_pic}" class="w-6 h-6 rounded-full object-cover">` : 
                            `<div class="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-xs font-bold text-green-800">${window.currentChatUser.name.charAt(0)}</div>`;
                        profilePicHtml = `<div class="mr-2 self-end mb-1">${pPic}</div>`;
                    }

                    // Wrapper
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

                div.innerHTML = html;

                // Update seen status in DB
                if (unreadFound) {
                    update(ref(window.db), updatesForSeen).catch(console.error);
                }

                // Adjust Scroll Position
                if (isPagination) {
                    div.scrollTop = div.scrollHeight - lastScrollHeight;
                    isFetchingOlder = false;
                } else {
                    setTimeout(() => { div.scrollTop = div.scrollHeight; }, 50);
                }

            } else {
                div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">কথপোকথন শুরু করুন</p>';
            }
        }, (error) => {
            console.error("Error fetching messages:", error);
            div.innerHTML = '<p class="text-center text-red-400 mt-4">মেসেজ লোড করতে সমস্যা হয়েছে</p>';
        });
    } catch (error) {
        console.error("Setup listener error:", error);
    }
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
            status: 'sent' // Initial status
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

        const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsgText, timestamp: ts };
        const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsgText, timestamp: ts };

        update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);
        update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);

        // Reset UI
        input.value = "";
        window.cancelReply(); 
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        btn.disabled = false;
        
        // Scroll to bottom
        const div = document.getElementById('messages-container');
        setTimeout(() => { div.scrollTop = div.scrollHeight; }, 50);

    } catch (error) {
        console.error("Error sending message:", error);
        window.showToast("মেসেজ পাঠাতে সমস্যা হয়েছে", "error");
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        btn.disabled = false;
    }
};

// --- SWIPE TO REPLY & LONG PRESS LOGIC ---
let touchStartX = 0;
let touchEndX = 0;

window.handleMsgTouchStart = (e, msgId, msgText, isMe) => {
    touchStartX = e.changedTouches[0].screenX;
    
    pressTimer = setTimeout(() => {
        window.openMsgOptions(msgId, msgText, isMe);
    }, 600);
};

window.handleMsgTouchMove = (e) => {
    clearTimeout(pressTimer); 
};

window.handleMsgTouchEnd = (e) => {
    clearTimeout(pressTimer); 
    
    touchEndX = e.changedTouches[0].screenX;
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
    
    const unsendBtn = document.getElementById('btn-unsend');
    if(isMe) unsendBtn.style.display = 'flex';
    else unsendBtn.style.display = 'none';

    if(navigator.vibrate) navigator.vibrate(50);
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
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                btn.disabled = false;
            });
        }
    } catch (error) {
        window.showToast("ছবি সিলেক্ট করতে সমস্যা", "error");
    }
};