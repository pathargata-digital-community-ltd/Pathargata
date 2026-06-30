import { ref, push, get, remove, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let replyingToCommentId = null;
let replyingToAuthor = null;

// Helper function to safely escape HTML
const safeHTML = (str) => window.escapeHTML ? window.escapeHTML(str) : str;

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

// --- কমেন্টে লাইক দেওয়ার ফাংশন ---
window.toggleCommentLike = (postId, commentId) => {
    if (!window.currentUser) return window.showToast("আগে লগইন করুন", "error");
    
    const uid = window.currentUser.uid;
    const likeRef = ref(window.db, `posts/${postId}/comments/${commentId}/likes/${uid}`);
    
    get(likeRef).then((snap) => {
        if (snap.exists()) {
            remove(likeRef); // লাইক রিমুভ
        } else {
            set(likeRef, true); // লাইক অ্যাড
            if(window.playSound) window.playSound('like');
        }
    });
};

// --- মেইন কমেন্ট রেন্ডার লজিক (দাগ টানা রিপ্লাই সিস্টেম) ---
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

        // Parent এবং Child (Reply) আলাদা করা
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

        // সময়ের ক্রমানুসারে সাজানো
        mainComments.sort((a, b) => a.time - b.time);

        // HTML জেনারেট করা
        let html = '';
        mainComments.forEach(mainComment => {
            html += generateCommentHTML(postId, mainComment, false);
            
            // যদি এই কমেন্টের কোনো রিপ্লাই থাকে, তবে সেগুলো দাগ টেনে নিচে দেখানো হবে
            if (replies[mainComment.id]) {
                replies[mainComment.id].sort((a, b) => a.time - b.time);
                html += `<div class="ml-5 pl-4 border-l-2 border-gray-200 mt-2 space-y-3 relative">`;
                replies[mainComment.id].forEach(reply => {
                    html += generateCommentHTML(postId, reply, true);
                });
                html += `</div>`;
            }
        });

        // স্ক্রল পজিশন ঠিক রাখা (লাইক দিলে যেন উপরে চলে না যায়)
        const currentScroll = container.scrollTop;
        container.innerHTML = html;
        container.scrollTop = currentScroll || container.scrollHeight;
    });
};

// --- HTML জেনারেটর (Main & Reply উভয়ের জন্য) ---
function generateCommentHTML(postId, c, isReply) {
    const profileClick = `onclick="closeFullCommentModal(); setTimeout(()=> { if(window.openUserProfile) window.openUserProfile('${c.authorUid}'); }, 300);"`;
    
    // Avatar
    const avatarSize = isReply ? "w-7 h-7" : "w-9 h-9";
    const avatar = c.authorPic 
        ? `<img ${profileClick} src="${c.authorPic}" class="${avatarSize} rounded-full object-cover shrink-0 border border-gray-100 cursor-pointer">` 
        : `<div ${profileClick} class="${avatarSize} rounded-full bg-blue-50 flex items-center justify-center font-bold text-blue-600 text-xs shrink-0 cursor-pointer border border-blue-100">${safeHTML(c.author || 'U').charAt(0)}</div>`;
    
    // Like Logic
    const myUid = window.currentUser ? window.currentUser.uid : null;
    const isLiked = c.likes && myUid && c.likes[myUid];
    const likeCount = c.likes ? Object.keys(c.likes).length : 0;
    const likeIcon = isLiked ? `<i class="fa-solid fa-heart text-red-500"></i>` : `<i class="fa-regular fa-heart text-gray-500"></i>`;
    const likeBtn = `<button onclick="toggleCommentLike('${postId}', '${c.id}')" class="text-[11px] ${isLiked ? 'text-red-500 font-bold' : 'text-gray-500 font-bold'} hover:text-red-600 transition flex items-center gap-1">${likeIcon} ${likeCount > 0 ? likeCount : 'লাইক'}</button>`;

    // Action Buttons
    const delBtn = (window.currentUser && c.authorUid === window.currentUser.uid) 
        ? `<button onclick="deleteComment('${postId}','${c.id}')" class="text-[11px] text-gray-400 font-bold hover:text-red-500">ডিলিট</button>` : '';

    // রিপ্লাই বাটনে ক্লিক করলে Parent ID পাস হবে
    const replyTargetId = isReply ? c.parentId : c.id; 
    const replyBtn = `<button onclick="initiateReply('${replyTargetId}', '${safeHTML(c.author)}')" class="text-[11px] text-gray-500 font-bold hover:text-blue-600">রিপ্লাই</button>`;

    // Reply Tag Text (যদি কেউ নির্দিষ্ট কাউকে মেনশন করে রিপ্লাই দেয়)
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

// --- 3. Reply Setup ---
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

// --- 4. Submit Logic ---
window.submitFullComment = () => window.submitCommentLogic(window.currentFullPostId, document.getElementById('full-comment-input'));
window.submitInlineComment = (postId) => window.submitCommentLogic(postId, document.getElementById(`inline-comment-input-${postId}`));

window.submitCommentLogic = (postId, inputElement) => {
    if (!inputElement) return;
    const text = inputElement.value.trim();
    if (!text || !postId || !window.currentUser) return;
    
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

    // যদি এটি রিপ্লাই হয়
    if (replyingToCommentId) {
        commentData.parentId = replyingToCommentId; // মূল কমেন্টের আইডি
        commentData.replyingTo = replyingToAuthor;  // যাকে মেনশন করা হয়েছে
    }

    const btnElement = inputElement.nextElementSibling;
    const originalIcon = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    push(ref(window.db, `posts/${postId}/comments`), commentData).then(() => {
        if(window.awardPoints) window.awardPoints('comment');
        if(window.playSound) window.playSound('send');
        
        inputElement.value = "";
        inputElement.style.height = ''; // Reset textarea height
        cancelReply(); 
        btnElement.innerHTML = originalIcon;

        // Notification System
        get(ref(window.db, `posts/${postId}`)).then(s => {
            const p = s.val();
            // পোস্ট ওনারকে নোটিফিকেশন
            if (p && p.uid !== window.currentUser.uid && !commentData.parentId) {
                sendNotification(p.uid, postId, authorName, 'comment');
            }
            // যদি কাউকে রিপ্লাই দেয়, তাকেও নোটিফিকেশন পাঠাবে
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