import { ref, push, get, remove, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let replyingToCommentId = null;
let replyingToAuthor = null;

// Helper function to safely escape HTML
const safeHTML = (str) => window.escapeHTML ? window.escapeHTML(str) : str;

// --- 1. Modal Open/Close Logic ---
window.openFullCommentModal = (postId) => {
    window.currentFullPostId = postId;
    const modal = document.getElementById('comment-full-modal');
    modal.classList.remove('hidden-custom');
    setTimeout(() => modal.classList.add('open'), 10);
    history.pushState({ page: 'comment-modal', postId }, "", "#comments");
    loadFullComments(postId);
};

window.closeFullCommentModal = () => {
    const modal = document.getElementById('comment-full-modal');
    modal.classList.remove('open');
    setTimeout(() => {
        modal.classList.add('hidden-custom');
        window.currentFullPostId = null;
        cancelReply();
    }, 300);
};

// --- 2. Toggle Comment Like ---
window.toggleCommentLike = (postId, commentId) => {
    if (!window.currentUser) return window.showToast ? window.showToast("আগে লগইন করুন", "error") : alert("আগে লগইন করুন");
    
    const uid = window.currentUser.uid;
    const likeRef = ref(window.db, `posts/${postId}/comments/${commentId}/likes/${uid}`);
    
    get(likeRef).then((snap) => {
        if (snap.exists()) {
            remove(likeRef); 
        } else {
            set(likeRef, true); 
            if(window.playSound) window.playSound('like');
        }
    });
};

// --- 3. Load Comments & Nested Replies ---
window.loadFullComments = (postId) => {
    const container = document.getElementById('full-comments-list');
    if(!container) return;

    container.innerHTML = '<div class="flex justify-center p-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>';
    
    onValue(ref(window.db, `posts/${postId}/comments`), (snap) => {
        if (window.currentFullPostId !== postId) return;
        const commentsData = snap.val() || {};
        
        const countEl = document.getElementById('full-comment-count');
        if(countEl) countEl.innerText = Object.keys(commentsData).length;
        
        if (Object.keys(commentsData).length === 0) {
            container.innerHTML = '<div class="flex flex-col items-center justify-center pt-20"><i class="fa-regular fa-comments text-5xl text-gray-200 mb-3"></i><p class="text-gray-400 font-medium">কোনো কমেন্ট নেই, প্রথম কমেন্ট করুন!</p></div>';
            return;
        }

        let mainComments = [];
        let replies = {};

        Object.entries(commentsData).forEach(([cId, c]) => {
            if (c.parentId) {
                if (!replies[c.parentId]) replies[c.parentId] = [];
                replies[c.parentId].push({ id: cId, ...c });
            } else {
                mainComments.push({ id: cId, ...c });
            }
        });

        mainComments.sort((a, b) => a.time - b.time);

        let html = '';
        mainComments.forEach(mainComment => {
            html += generateCommentHTML(postId, mainComment, false);
            
            if (replies[mainComment.id]) {
                replies[mainComment.id].sort((a, b) => a.time - b.time);
                html += `<div class="ml-5 pl-4 border-l-2 border-gray-200 mt-2 space-y-3 relative">`;
                replies[mainComment.id].forEach(reply => {
                    html += generateCommentHTML(postId, reply, true);
                });
                html += `</div>`;
            }
        });

        const currentScroll = container.scrollTop;
        container.innerHTML = html;
        container.scrollTop = currentScroll || container.scrollHeight;
    });
};

// --- HTML Generator ---
function generateCommentHTML(postId, c, isReply) {
    const profileClick = `onclick="closeFullCommentModal(); setTimeout(()=> { if(window.openUserProfile) window.openUserProfile('${c.authorUid}'); }, 300);"`;
    
    const avatarSize = isReply ? "w-7 h-7" : "w-9 h-9";
    const avatar = c.authorPic 
        ? `<img ${profileClick} src="${c.authorPic}" class="${avatarSize} rounded-full object-cover shrink-0 border border-gray-100 cursor-pointer">` 
        : `<div ${profileClick} class="${avatarSize} rounded-full bg-blue-50 flex items-center justify-center font-bold text-blue-600 text-xs shrink-0 cursor-pointer border border-blue-100">${safeHTML(c.author || 'U').charAt(0)}</div>`;
    
    const myUid = window.currentUser ? window.currentUser.uid : null;
    const isLiked = c.likes && myUid && c.likes[myUid];
    const likeCount = c.likes ? Object.keys(c.likes).length : 0;
    const likeIcon = isLiked ? `<i class="fa-solid fa-heart text-red-500"></i>` : `<i class="fa-regular fa-heart text-gray-500"></i>`;
    const likeBtn = `<button onclick="toggleCommentLike('${postId}', '${c.id}')" class="text-[11px] ${isLiked ? 'text-red-500 font-bold' : 'text-gray-500 font-bold'} hover:text-red-600 transition flex items-center gap-1">${likeIcon} ${likeCount > 0 ? likeCount : 'লাইক'}</button>`;

    const delBtn = (window.currentUser && c.authorUid === window.currentUser.uid) 
        ? `<button onclick="deleteComment('${postId}','${c.id}')" class="text-[11px] text-gray-400 font-bold hover:text-red-500">ডিলিট</button>` : '';

    const replyTargetId = isReply ? c.parentId : c.id; 
    const replyBtn = `<button onclick="initiateReply('${replyTargetId}', '${safeHTML(c.author)}')" class="text-[11px] text-gray-500 font-bold hover:text-blue-600">রিপ্লাই</button>`;

    const mentionTag = isReply && c.replyingTo ? `<span class="text-blue-600 font-medium mr-1">@${safeHTML(c.replyingTo)}</span>` : '';

    return `
    <div class="flex gap-2.5 ${isReply ? 'mt-1' : 'mb-4'} animate-fade">
        ${avatar}
        <div class="flex flex-col w-full max-w-[85%]">
            <div class="bg-gray-100 rounded-2xl ${isReply ? 'rounded-tl-md' : 'rounded-tl-sm'} px-3 py-2">
                <h4 ${profileClick} class="font-bold text-[13px] text-gray-900 cursor-pointer hover:underline inline-block">${safeHTML(c.author || 'User')}</h4>
                ${c.authorRole === 'admin' ? '<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>' : ''}
                <p class="text-[14px] text-gray-800 leading-snug mt-0.5 whitespace-pre-wrap word-break">${mentionTag}${safeHTML(c.text)}</p>
            </div>
            <div class="flex items-center gap-4 mt-1.5 ml-2">
                <span class="text-[10px] text-gray-400 font-medium">${window.timeAgo ? window.timeAgo(c.time) : 'কিছুক্ষণ আগে'}</span>
                ${likeBtn}
                ${replyBtn}
                ${delBtn}
            </div>
        </div>
    </div>`;
}

// --- 4. Reply Setup ---
window.initiateReply = (parentId, authorName) => {
    replyingToCommentId = parentId;
    replyingToAuthor = authorName;
    document.getElementById('replying-to-indicator').classList.remove('hidden');
    document.getElementById('reply-to-name').innerText = authorName;
    document.getElementById('full-comment-input').focus();
};

window.cancelReply = () => {
    replyingToCommentId = null;
    replyingToAuthor = null;
    document.getElementById('replying-to-indicator').classList.add('hidden');
};

// --- 5. Submit Logic ---
window.submitFullComment = () => window.submitCommentLogic(window.currentFullPostId, document.getElementById('full-comment-input'));
window.submitInlineComment = (postId) => window.submitCommentLogic(postId, document.getElementById(`inline-comment-input-${postId}`));

// --- Anti-Spam / Profanity Filter List ---
const badWordsList = [
    // বাংলা গালি (Bengali Unicode)
    "শালা", "শালি", "কুত্তা", "মাগী", "মাগি", "খানকি", "শুয়োর", "শুয়োর", "বোকাচোদা", "মাদারচোদ", 
    "চুদানি", "বাল", "ফাউল", "নটি", "বেশ্যা", "হালারপো", "হারামী", "হারামি", "লুইচ্চা", "চুতমারানি", 
    "ভাতার", "ভাতারী", "চুদিরভাই", "চোদ", "চুদি", "চুদা", "খচ্চর", "বেয়াদব", "শুয়োরের বাচ্চা", 
    "কুত্তার বাচ্চা", "আবাল", "চুদ", "গান্ডু", "নটিমাগি", "ছিনাল",

    // বাংলিশ গালি (Banglish - Bengali typed in English)
    "shala", "shali", "kutta", "magi", "khanki", "shuor", "shuorer baccha", "kuttar baccha", 
    "bokachoda", "madarchod", "maderchod", "chudani", "bal", "baal", "foul", "noti", "besha", 
    "halarpo", "harami", "luiccha", "chutmarani", "vatar", "bhatar", "chod", "chudi", "chuda", 
    "khocchor", "beyadob", "abal", "gandu", "bokachud", "chinal",

    // ইংরেজি গালি (English Profanity)
    "stupid", "idiot", "bastard", "fuck", "bitch", "asshole", "motherfucker", "dick", "cunt", 
    "pussy", "slut", "whore", "bullshit", "shit", "fucker", "wtf", "nigga", "nigger"
];

window.submitCommentLogic = (postId, inputElement) => {
    if (!inputElement) return;
    const text = inputElement.value.trim();
    if (!text || !postId || !window.currentUser) return;

    // --- Spam & Profanity Filter Logic ---
    const lowerText = text.toLowerCase();
    const isSpam = badWordsList.some(badWord => lowerText.includes(badWord.toLowerCase()));
    
    if (isSpam) {
        if(window.showToast) window.showToast("সতর্কতা: আপনার কমেন্টে অশালীন বা আপত্তিকর শব্দ রয়েছে। এটি পোস্ট করা যাবে না!", "error");
        else alert("সতর্কতা: আপনার কমেন্টে আপত্তিকর শব্দ রয়েছে।");
        return; // কমেন্ট সাবমিট হওয়া এখানেই আটকে যাবে
    }
    
    const authorName = window.userDetails?.name || window.currentUser?.displayName || "Unknown User";
    const authorPic = window.userDetails?.profile_pic || window.currentUser?.photoURL || null;
    const authorRole = window.userDetails?.role || 'user';

    const commentData = {
        author: authorName,
        authorUid: window.currentUser.uid,
        authorPic: authorPic,
        authorRole: authorRole,
        text: text,
        time: Date.now()
    };

    if (replyingToCommentId) {
        commentData.parentId = replyingToCommentId; 
        commentData.replyingTo = replyingToAuthor;  
    }

    const btnElement = inputElement.nextElementSibling;
    const originalIcon = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    push(ref(window.db, `posts/${postId}/comments`), commentData).then(() => {
        if(window.awardPoints) window.awardPoints('comment');
        if(window.playSound) window.playSound('send');
        
        inputElement.value = "";
        inputElement.style.height = ''; 
        cancelReply(); 
        btnElement.innerHTML = originalIcon;

        // Notification
        get(ref(window.db, `posts/${postId}`)).then(s => {
            const p = s.val();
            if (p && p.uid !== window.currentUser.uid && !commentData.parentId) {
                sendNotification(p.uid, postId, authorName, 'comment');
            }
            if (commentData.parentId) {
                get(ref(window.db, `posts/${postId}/comments/${commentData.parentId}`)).then(parentSnap => {
                    const parentComment = parentSnap.val();
                    if (parentComment && parentComment.authorUid !== window.currentUser.uid) {
                        sendNotification(parentComment.authorUid, postId, authorName, 'reply');
                    }
                });
            }
        });
    }).catch(e => {
        btnElement.innerHTML = originalIcon;
        if(window.showToast) window.showToast("কমেন্ট করা যায়নি", "error");
    });
};

function sendNotification(targetUid, postId, fromName, type) {
    push(ref(window.db, `notifications/${targetUid}`), {
        type: type,
        fromUid: window.currentUser.uid,
        fromName: fromName,
        postId: postId,
        timestamp: Date.now(),
        read: false
    });
}

window.deleteComment = (postId, commentId) => {
    if(confirm("কমেন্টটি ডিলিট করবেন?")) {
        remove(ref(window.db, `posts/${postId}/comments/${commentId}`));
    }
};

// ============================================================================
// 6. SMART AI COMMENT SUGGESTION ALGORITHM (TEXT, EMOJI & STICKER STYLE)
// ============================================================================
window.getCommentSuggestions = (post) => {
    const text = (post.content || '').toLowerCase();
    const feeling = post.feeling ? post.feeling.text.toLowerCase() : '';
    const type = post.type;
    const hasImage = (post.images && post.images.length > 0) || post.image;

    // ১. দুঃখ, অসুস্থতা বা মৃত্যু সংবাদ
    if (feeling === 'sad' || feeling === 'sick' || text.includes('অসুস্থ') || text.includes('দোয়া') || text.includes('মারা') || text.includes('ইন্নালিল্লাহ') || text.includes('কষ্ট')) {
        return ["আল্লাহ দ্রুত সুস্থতা দান করুন 🤲", "ইন্নালিল্লাহি ওয়াইন্না ইলাইহি রাজিউন 😔", "আল্লাহ সহায় হোন", "😔", "🤲"];
    }
    // ২. ইসলামিক বা ধর্মীয় পোস্ট
    if (text.includes('জুম্মা') || text.includes('নামাজ') || text.includes('আলহামদুলিল্লাহ') || text.includes('সুবহানাল্লাহ')) {
        return ["মাশাআল্লাহ ❤️", "জুম্মা মোবারক 🕌", "আমিন 🤲", "সুবহানাল্লাহ", "🕋"];
    }
    // ৩. খুশি, সাফল্য বা জন্মদিন
    if (feeling === 'happy' || feeling === 'blessed' || feeling === 'celebrating' || text.includes('অভিনন্দন') || text.includes('সাফল্য') || text.includes('জন্মদিন') || text.includes('খুশি')) {
        return ["অনেক অনেক অভিনন্দন 🎉", "মাশাআল্লাহ, এগিয়ে যান ❤️", "আলহামদুলিল্লাহ 🤲", "শুভকামনা রইলো", "🎉", "❤️"];
    }
    // ৪. রক্ত, জরুরী এলার্ট বা সাহায্য
    if (text.includes('রক্ত') || text.includes('জরুরি') || text.includes('বিপদ') || text.includes('সাহায্য') || text.includes('হেল্প')) {
        return ["ইনবক্স চেক করেন", "শেয়ার করে দিলাম 🔄", "আল্লাহ সহজ করুন 🤲", "🆘", "🩸"];
    }
    // ৫. পোল বা প্রশ্ন
    if (type === 'poll' || text.includes('কোনটি') || text.includes('কি বলেন') || text.includes('মতামত')) {
        return ["দারুণ উদ্যোগ 👍", "ভোট দিলাম!", "খুব সুন্দর বিষয় 🤔", "👍", "🤔"];
    }
    // ৬. ছবি বা ভিডিও (Media)
    if (hasImage) {
        return ["অসাধারণ ছবি! 😍", "মাশাআল্লাহ খুব সুন্দর লাগছে ❤️", "চমৎকার! 🔥", "😍", "🔥", "👌"];
    }
    
    // ৭. ডিফল্ট বা সাধারণ পোস্ট
    return ["সহমত পোষণ করছি 👍", "দারুণ পোস্ট! 🔥", "খুব সুন্দর কথা ❤️", "👍", "❤️", "😊"];
};

// --- সাজেশন থেকে অটো কমেন্ট করার ফাংশন ---
window.autoPostSuggestion = (postId, text, btnElement) => {
    if (!window.currentUser) return window.showToast ? window.showToast("আগে লগইন করুন", "error") : alert("আগে লগইন করুন");

    const myName = window.userDetails?.name || window.currentUser?.displayName || "Unknown User";
    const myPic = window.userDetails?.profile_pic || window.currentUser?.photoURL || null;
    const myRole = window.userDetails?.role || 'user';

    const originalText = btnElement.innerText;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnElement.disabled = true;

    push(ref(window.db, `posts/${postId}/comments`), {
        author: myName,
        authorUid: window.currentUser.uid,
        authorPic: myPic,
        authorRole: myRole,
        text: text,
        time: Date.now()
    }).then(() => {
        // অ্যানিমেশন দিয়ে সাজেশন বার হাইড করা
        const suggContainer = document.getElementById(`comment-suggestions-${postId}`);
        if(suggContainer) {
            suggContainer.style.transition = "opacity 0.3s, transform 0.3s";
            suggContainer.style.opacity = "0";
            suggContainer.style.transform = "translateY(-10px)";
            setTimeout(() => suggContainer.style.display = 'none', 300);
        }

        if(window.awardPoints) window.awardPoints('comment');
        if(window.playSound) window.playSound('send');
        if(window.showToast) window.showToast("কমেন্ট করা হয়েছে!");

        // নোটিফিকেশন পাঠানো
        get(ref(window.db, `posts/${postId}`)).then(s => {
            const p = s.val();
            if (p && p.uid !== window.currentUser.uid) {
                push(ref(window.db, `notifications/${p.uid}`), {
                    type: 'comment',
                    fromUid: window.currentUser.uid,
                    fromName: myName,
                    postId: postId,
                    timestamp: Date.now(),
                    read: false
                });
            }
        });
    }).catch(e => {
        btnElement.innerText = originalText;
        btnElement.disabled = false;
        if(window.showToast) window.showToast("সমস্যা হয়েছে: " + e.message, "error");
    });
};