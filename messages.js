import {
    ref, push, set, onValue, get, update, remove, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CHAT ID GENERATOR (FIXED) ---
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

// --- STATUS FORMATTER HELPER ---
function formatStatusTime(timestamp) {
    if (!timestamp || typeof timestamp !== 'number') return "Offline";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Active just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Active ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Active ${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return `Active 1 day ago`;
    return `Active ${days} days ago`;
}

let statusUnsubscribe = null;

window.startChat = (uid, name) => {
    window.currentChatUser = { uid, name, profile_pic: null }; 
    window.switchPage('messages');
    
    document.getElementById('chat-list-view').classList.add('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
    
    // Fetch Profile Image safely
    window.getUserData(uid).then(u => {
        if(u && u.profile_pic) {
            document.getElementById('chat-header-img').innerHTML = `<img src="${u.profile_pic}" class="w-full h-full object-cover">`;
            window.currentChatUser.profile_pic = u.profile_pic; 
        } else {
            document.getElementById('chat-header-img').innerHTML = window.escapeHTML(name).charAt(0);
        }
    });

    // --- REALTIME STATUS LISTENER ---
    const statusText = document.getElementById('chat-header-status');
    statusText.innerText = "Connecting..."; 
    
    if (statusUnsubscribe) statusUnsubscribe();
    
    const statusRef = ref(window.db, `status/${uid}`);
    statusUnsubscribe = onValue(statusRef, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            if (data.state === 'online') {
                statusText.innerText = "Active now";
                statusText.classList.remove('text-gray-500');
                statusText.classList.add('text-green-500');
            } else {
                statusText.innerText = formatStatusTime(data.last_changed);
                statusText.classList.remove('text-green-500');
                statusText.classList.add('text-gray-500');
            }
        } else {
            statusText.innerText = "Offline";
            statusText.classList.remove('text-green-500');
            statusText.classList.add('text-gray-500');
        }
    }, (error) => {
        console.error("Status check failed:", error);
        statusText.innerText = "Offline";
    });

    history.pushState({ page: 'chat-conversation', uid }, "", "#chat");
    window.loadMessages(uid);
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.add('hidden', 'hidden-custom');
    window.currentChatUser = null;
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
                        try {
                            const userData = await window.getUserData(peerUid);
                            return { peerUid, info, profilePic: userData?.profile_pic || null };
                        } catch (e) {
                            return { peerUid, info, profilePic: null };
                        }
                    })
            );

            container.innerHTML = chatItems.map(({ peerUid, info, profilePic }) => {
                let rawLastMsg = info.lastMessage || "";
                let displayMsg = rawLastMsg;

                let prefix = "";
                if (rawLastMsg.startsWith("You: ")) {
                    prefix = "You: ";
                    rawLastMsg = rawLastMsg.substring(5);
                }

                if (!rawLastMsg.includes("📷") && !rawLastMsg.includes("🎤")) {
                    rawLastMsg = window.decryptMsg(rawLastMsg);
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
        } else {
            container.innerHTML = '<div class="text-center mt-20"><div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300 text-3xl"><i class="fa-solid fa-comments"></i></div><p class="text-gray-400 text-sm font-bold">কোনো চ্যাট হিস্ট্রি নেই</p></div>';
        }
    });
};

// --- LOAD MESSAGES ---
window.loadMessages = (otherUid) => {
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    div.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';
    
    onValue(query(ref(window.db, `chats/${chatId}`), limitToLast(50)), (snap) => {
        const msgs = snap.val() || {};
        if (Object.keys(msgs).length > 0) {
            
            const myPic = window.userDetails?.profile_pic;
            const myAvatarHtml = myPic 
                ? `<img src="${myPic}" class="w-6 h-6 rounded-full object-cover self-end mb-1 ml-2 border border-gray-200 shrink-0">` 
                : `<div class="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 self-end mb-1 ml-2 shrink-0">${window.userDetails?.name?.charAt(0) || 'M'}</div>`;

            const peerPic = window.currentChatUser?.profile_pic;
            const peerAvatarHtml = peerPic 
                ? `<img src="${peerPic}" class="w-6 h-6 rounded-full object-cover self-end mb-1 mr-2 border border-gray-200 shrink-0">` 
                : `<div class="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-[10px] font-bold text-green-700 self-end mb-1 mr-2 shrink-0">${window.currentChatUser?.name?.charAt(0) || 'U'}</div>`;

            div.innerHTML = Object.entries(msgs).map(([msgId, m]) => {
                const isMe = m.sender === window.currentUser.uid;
                let content = '';
                
                if (m.image) content += `<img src="${m.image}" class="rounded-lg mb-1 max-w-[200px] h-auto cursor-pointer border border-black/10" onclick="window.open('${m.image}')">`;
                if (m.audio) content += `<audio controls src="${m.audio}" class="w-full max-w-[220px] h-10 mb-1"></audio>`;
                if (m.text) {
                    const decrypted = window.decryptMsg(m.text);
                    content += `<span class="break-words">${window.escapeHTML(decrypted)}</span>`;
                }

                const deleteBtn = isMe ? `<div onclick="deleteSpecificMessage('${chatId}', '${msgId}')" class="opacity-0 group-hover:opacity-100 transition cursor-pointer text-red-400 text-xs self-center mx-2 hover:text-red-600" title="Delete"><i class="fa-solid fa-trash"></i></div>` : '';

                return `
                <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-1 group items-end">
                    ${isMe ? deleteBtn : peerAvatarHtml}
                    <div class="px-3.5 py-2.5 max-w-[70%] text-[15px] shadow-sm ${isMe ? 'bg-green-600 text-white rounded-[18px_18px_4px_18px]' : 'bg-white text-gray-800 rounded-[18px_18px_18px_4px] border border-gray-100'} relative">
                        ${content}
                        <div class="text-[9px] ${isMe ? 'text-green-100' : 'text-gray-400'} text-right mt-1">${window.timeAgo(m.timestamp)}</div>
                    </div>
                    ${isMe ? myAvatarHtml : deleteBtn}
                </div>`;
            }).join('');

            setTimeout(() => { div.scrollTop = div.scrollHeight; }, 100);
        } else {
            div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-10">কথপোকথন শুরু করুন</p>';
        }
    });
};

window.deleteSpecificMessage = (chatId, msgId) => {
    if(confirm("এই মেসেজটি ডিলিট করতে চান? (এটি উভয়ের চ্যাট থেকেই ডিলিট হবে)")) {
        remove(ref(window.db, `chats/${chatId}/${msgId}`)).then(() => {
            window.showToast("মেসেজ ডিলিট হয়েছে");
        });
    }
};

window.deleteEntireConversation = () => {
    if(!window.currentChatUser) return;
    if(confirm("পুরো চ্যাট হিস্ট্রি ডিলিট করতে চান? (শুধুমাত্র আপনার লিস্ট থেকে মুছে যাবে)")) {
        remove(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`)).then(() => {
            window.showToast("চ্যাট ডিলিট করা হয়েছে");
            window.closeChat(); 
        });
    }
};

// --- SEND MESSAGE LOGIC ---
window.sendMsg = (imageUrl = null, audioUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text && !imageUrl && !audioUrl) return;
    
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    const ts = Date.now();

    const msgData = { sender: window.currentUser.uid, timestamp: ts };
    let lastMsgPreview = "";

    if (text) {
        msgData.text = window.encryptMsg(text);
        lastMsgPreview = msgData.text;
    }
    if (imageUrl) {
        msgData.image = imageUrl;
        lastMsgPreview = text ? ("📷 " + msgData.text) : "📷 ছবি পাঠিয়েছেন";
    }
    if (audioUrl) {
        msgData.audio = audioUrl;
        lastMsgPreview = "🎤 ভয়েস মেসেজ";
    }

    push(ref(window.db, `chats/${chatId}`), msgData).then(() => {
        input.value = "";
    }).catch(e => {
        console.error("Message send failed:", e);
        window.showToast("মেসেজ পাঠানো যায়নি!", "error");
    });

    const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsgPreview, timestamp: ts };
    const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsgPreview, timestamp: ts };

    update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);
    update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);
};

// --- VOICE RECORDING LOGIC ---
let chatMediaRecorder;
let chatAudioChunks = [];
let chatRecordingTimer;
let chatRecordSeconds = 0;

window.startChatRecording = async () => {
    if (navigator.userAgent.indexOf('wv') > -1 || navigator.userAgent.indexOf('Median') > -1) {
        window.location.href = 'median://permissions/request?permissions=android.permission.RECORD_AUDIO';
    }
    await new Promise(r => setTimeout(r, 500));

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return window.showToast("অডিও রেকর্ড সাপোর্ট করছে না।", "error");
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chatMediaRecorder = new MediaRecorder(stream);
        chatAudioChunks = [];

        chatMediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) chatAudioChunks.push(event.data);
        };

        chatMediaRecorder.onstop = () => {
            const audioBlob = new Blob(chatAudioChunks, { type: 'audio/mp3' });
            sendChatVoice(audioBlob); 
        };

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

    } catch (err) {
        window.showToast("মাইক্রোফোন পারমিশন দিন", "error");
    }
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
    msgInput.placeholder = "Sending audio...";
    msgInput.disabled = true;

    try {
        const res = await window.uploadMediaToCloudinary(file);
        window.sendMsg(null, res.url); 
    } catch (e) {
        window.showToast("ভয়েস পাঠানো যায়নি!", 'error');
    } finally {
        msgInput.placeholder = "মেসেজ লিখুন...";
        msgInput.disabled = false;
    }
};

// Image Upload Fix
window.handleChatImageSelect = () => {
    const file = document.getElementById('chat-img-input').files[0];
    if (file) {
        const btn = document.getElementById('btn-chat-send');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sm"></i>';
        btn.disabled = true;

        window.uploadMediaToCloudinary(file).then(res => {
            window.sendMsg(res.url);
            document.getElementById('chat-img-input').value = "";
        }).catch(e => {
            window.showToast("ছবি আপলোড হয়নি: " + e.message, 'error');
        }).finally(() => {
            btn.innerHTML = oldHtml;
            btn.disabled = false;
        });
    }
};

// QUICK CHAT FRIENDS (Top Bar)
window.loadQuickChatFriends = async () => {
    const div = document.getElementById('quick-chat-friends');
    if (!window.myFriends || window.myFriends.length === 0) {
        div.innerHTML = '<span class="text-xs text-gray-400">কোনো বন্ধু নেই</span>';
        return;
    }
    const friendsData = await Promise.all(window.myFriends.slice(0, 15).map(uid => window.getUserData(uid)));
    div.innerHTML = friendsData.filter(u => u).map(u => {
        let av = u.profile_pic ? 
            `<div class="w-12 h-12 relative"><img src="${u.profile_pic}" class="w-full h-full rounded-full object-cover border border-gray-200"></div>` : 
            `<div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-lg relative border border-green-200">${window.escapeHTML(u.name).charAt(0)}</div>`;
        return `<div onclick="startChat('${u.uid}', '${window.escapeHTML(u.name)}')" class="flex flex-col items-center cursor-pointer min-w-[50px] transform active:scale-95 transition">${av}<span class="text-[10px] text-gray-600 mt-1 truncate w-14 text-center font-bold">${window.escapeHTML(u.name).split(' ')[0]}</span></div>`;
    }).join('');
};


// =========================================================
// --- NATIVE FLOATING CHAT HEAD LOGIC (SYSTEM ALERT WINDOW) ---
// =========================================================

let floatingChatUserId = null;
let floatingChatUserName = null;
let initialChatLoad = true; 

// অ্যাপ চালু হওয়ার পর গ্লোবালি মেসেজ চেক করা
window.listenForGlobalMessages = (uid) => {
    onValue(ref(window.db, `user_chats/${uid}`), (snap) => {
        if (initialChatLoad) {
            initialChatLoad = false;
            return; // প্রথমবার অ্যাপ লোড হওয়ার সময় বাবল দেখাবে না
        }

        const list = snap.val() || {};
        
        // সর্বশেষ মেসেজটি বের করা
        let latestPeer = null;
        let latestInfo = null;
        
        for (const [peerUid, info] of Object.entries(list)) {
            if (!latestInfo || info.timestamp > latestInfo.timestamp) {
                latestInfo = info;
                latestPeer = peerUid;
            }
        }

        if (latestInfo && latestPeer) {
            // যদি মেসেজটা নিজের পাঠানো না হয় এবং ইউজার বর্তমানে ওই চ্যাটে না থাকে
            if (!latestInfo.lastMessage.startsWith("You:") && (!window.currentChatUser || window.currentChatUser.uid !== latestPeer)) {
                showFloatingChatHead(latestPeer, latestInfo);
            }
        }
    });
};

// ফ্লোটিং বাবল দেখানোর ফাংশন (অ্যান্ড্রয়েড নেটিভ বাবল কল করা)
function showFloatingChatHead(peerUid, info) {
    floatingChatUserId = peerUid;
    floatingChatUserName = info.name;
    
    // AndroidBridge কল করে নেটিভ বাবল দেখানো
    if (window.AndroidBridge && window.AndroidBridge.showBubble) {
        window.AndroidBridge.showBubble();
    } else {
        console.warn("Android Bridge not found. Cannot show native bubble.");
    }
}
