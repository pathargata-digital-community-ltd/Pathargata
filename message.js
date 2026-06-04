// messages.js
import {
    ref, push, set, onValue, get, update, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- CHAT HELPER FUNCTIONS ---
window.getChatId = function(uid1, uid2) {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

window.startChat = (uid, name) => {
    window.currentChatUser = { uid, name };
    window.switchPage('messages');
    
    document.getElementById('chat-list-view').classList.add('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-header-name').innerText = window.escapeHTML(name);
    document.getElementById('chat-header-img').innerText = window.escapeHTML(name).charAt(0);
    
    history.pushState({ page: 'chat-conversation', uid }, "", "#chat");
    window.loadMessages(uid);
};

window.closeChat = () => {
    document.getElementById('chat-list-view').classList.remove('hidden', 'hidden-custom');
    document.getElementById('chat-conversation-view').classList.add('hidden', 'hidden-custom');
    window.currentChatUser = null;
};

// --- QUICK CHAT FRIENDS (Top Bar) ---
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

// --- CHAT LIST (Recent Conversations) ---
window.loadChatList = (uid) => {
    onValue(ref(window.db, `user_chats/${uid}`), async (snap) => {
        const list = snap.val() || {};
        const container = document.getElementById('chat-list-container');

        if (Object.keys(list).length > 0) {
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

                if (!rawLastMsg.includes("📷")) {
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
            container.innerHTML = '<p class="text-center text-gray-400 mt-10 text-sm">কোনো কনভারসেশন নেই</p>';
        }
    });
};

// --- LOAD MESSAGES (Inside Conversation) ---
window.loadMessages = (otherUid) => {
    const chatId = window.getChatId(window.currentUser.uid, otherUid);
    const div = document.getElementById('messages-container');
    div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">লোড হচ্ছে...</p>';
    
    onValue(query(ref(window.db, `chats/${chatId}`), limitToLast(50)), (snap) => {
        const msgs = snap.val() || {};
        if (Object.keys(msgs).length > 0) {
            div.innerHTML = Object.values(msgs).map(m => {
                const isMe = m.sender === window.currentUser.uid;
                let content = '';
                if (m.image) content += `<img src="${m.image}" class="rounded-lg mb-1 max-w-full h-auto cursor-pointer" onclick="window.open('${m.image}')">`;

                if (m.text) {
                    const decrypted = window.decryptMsg(m.text);
                    content += `<span>${window.escapeHTML(decrypted)}</span>`;
                }

                return `<div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-2"><div class="px-4 py-2 max-w-[75%] text-sm ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}">${content}</div></div>`;
            }).join('');

            setTimeout(() => {
                div.scrollTop = div.scrollHeight;
            }, 100);
        } else div.innerHTML = '<p class="text-center text-xs text-gray-400 mt-4">কথপোকথন শুরু করুন</p>';
    });
};

// --- SEND MESSAGE & IMAGE UPLOAD ---
window.handleChatImageSelect = () => {
    const file = document.getElementById('chat-img-input').files[0];
    if (file) {
        const btn = document.getElementById('btn-chat-send');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        window.uploadMediaToCloudinary(file).then(res => {
            window.sendMsg(res.url);
            document.getElementById('chat-img-input').value = "";
        }).catch(e => {
            window.showToast("ছবি আপলোড হয়নি: " + e.message, 'error');
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            btn.disabled = false;
        });
    }
};

window.sendMsg = (imageUrl = null) => {
    if (!window.currentChatUser) return;
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text && !imageUrl) return;
    
    const btn = document.getElementById('btn-chat-send');
    const chatId = window.getChatId(window.currentUser.uid, window.currentChatUser.uid);
    const ts = Date.now();

    const encryptedText = text ? window.encryptMsg(text) : "";
    const msgData = { sender: window.currentUser.uid, timestamp: ts };
    if (text) msgData.text = encryptedText;
    if (imageUrl) msgData.image = imageUrl;

    push(ref(window.db, `chats/${chatId}`), msgData);

    const lastMsg = imageUrl ? (text ? "📷 " + encryptedText : "📷 ছবি পাঠিয়েছেন") : encryptedText;
    const myUpdate = { name: window.currentChatUser.name, lastMessage: "You: " + lastMsg, timestamp: ts };
    const peerUpdate = { name: window.userDetails.name, lastMessage: lastMsg, timestamp: ts };

    update(ref(window.db, `user_chats/${window.currentUser.uid}/${window.currentChatUser.uid}`), myUpdate);
    update(ref(window.db, `user_chats/${window.currentChatUser.uid}/${window.currentUser.uid}`), peerUpdate);

    input.value = "";
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    btn.disabled = false;
};