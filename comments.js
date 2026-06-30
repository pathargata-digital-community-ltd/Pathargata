import { ref, push, get, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let replyingToCommentId = null;
let replyingToAuthor = null;

// --- 1. Modal Open/Close Logic (Standard Full Screen) ---
window.openFullCommentModal = (postId) => {
    window.currentFullPostId = postId;
    const modal = document.getElementById('comment-full-modal');
    
    modal.classList.remove('hidden-custom');
    // আপনার অরিজিনাল ফাইলের ট্রানজিশন চালানোর জন্য
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

// --- 2. Load Comments ---
window.loadFullComments = (postId) => {
    const container = document.getElementById('full-comments-list');
    if(!container) return;

    container.innerHTML = '<div class="flex justify-center p-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div></div>';
    
    onValue(ref(window.db, `posts/${postId}/comments`), (snap) => {
        if (window.currentFullPostId !== postId) return;
        const comments = snap.val() || {};
        
        const countEl = document.getElementById('full-comment-count');
        if(countEl) countEl.innerText = Object.keys(comments).length;
        
        container.innerHTML = Object.keys(comments).length > 0 ? Object.entries(comments).sort((a, b) => a[1].time - b[1].time).map(([cId, c]) => {
            
            // Profile Navigation
            const profileClick = `onclick="closeFullCommentModal(); setTimeout(()=> { if(window.openUserProfile) window.openUserProfile('${c.authorUid}'); }, 300);"`;
            
            // Avatar
            const commentAvatar = c.authorPic 
                ? `<img ${profileClick} src="${c.authorPic}" class="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-100 cursor-pointer">` 
                : `<div ${profileClick} class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-xs shrink-0 cursor-pointer">${window.escapeHTML(c.author).charAt(0)}</div>`;
            
            // Delete button for post owner
            const delBtn = (window.currentUser && c.authorUid === window.currentUser.uid) 
                ? `<button onclick="deleteComment('${postId}','${cId}')" class="text-xs text-red-400 ml-2 hover:text-red-600">ডিলিট</button>` 
                : '';

            // Reply button
            const replyBtn = `<button onclick="initiateReply('${cId}', '${window.escapeHTML(c.author)}')" class="text-xs text-blue-500 ml-2 hover:text-blue-700">রিপ্লাই</button>`;
            
            // Reply Tag (If replying to someone)
            const replyTag = c.replyingTo ? `<span class="block text-[10px] text-blue-600 mb-0.5"><i class="fa-solid fa-reply fa-rotate-180"></i> ${window.escapeHTML(c.replyingTo)}</span>` : '';

            return `
            <div class="flex gap-2 mb-3">
                ${commentAvatar}
                <div class="bg-gray-100 rounded-2xl px-3 py-2 relative group max-w-[85%]">
                    <h4 ${profileClick} class="font-bold text-xs text-gray-800 cursor-pointer hover:underline mb-0.5">${window.escapeHTML(c.author)}</h4>
                    ${replyTag}
                    <p class="text-sm text-gray-700 leading-snug">${window.escapeHTML(c.text)}</p>
                    <div class="flex gap-2 mt-1">
                        <span class="text-[10px] text-gray-400">${window.timeAgo ? window.timeAgo(c.time) : 'কিছুক্ষণ আগে'}</span>
                        ${replyBtn}
                        ${delBtn}
                    </div>
                </div>
            </div>`;
        }).join('') : '<p class="text-center text-gray-400 mt-10">কোনো কমেন্ট নেই, প্রথম কমেন্ট করুন!</p>';
        
        container.scrollTop = container.scrollHeight;
    });
};

// --- 3. Reply Logic ---
window.initiateReply = (commentId, authorName) => {
    replyingToCommentId = commentId;
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

// --- 4. Submit Comment Logic (FIXED AUTHOR NAME) ---
window.submitFullComment = () => window.submitCommentLogic(window.currentFullPostId, document.getElementById('full-comment-input'));
window.submitInlineComment = (postId) => window.submitCommentLogic(postId, document.getElementById(`inline-comment-input-${postId}`));

window.submitCommentLogic = (postId, inputElement) => {
    if (!inputElement) return;
    const text = inputElement.value.trim();
    if (!text || !postId || !window.currentUser) return;
    
    // মেইন অ্যাপ থেকে ইউজারের সঠিক নাম এবং ছবি নেওয়া হচ্ছে
    const myName = window.userDetails.name;
    const myPic = window.userDetails.profile_pic || null;

    if (!myName) {
        if(window.showToast) window.showToast("আপনার প্রোফাইল লোড হচ্ছে, একটু অপেক্ষা করুন", "error");
        return;
    }

    const commentData = {
        author: myName,
        authorUid: window.currentUser.uid,
        authorPic: myPic,
        text: text,
        time: Date.now()
    };

    if (replyingToAuthor) {
        commentData.replyingTo = replyingToAuthor;
    }

    push(ref(window.db, `posts/${postId}/comments`), commentData).then(() => {
        if(window.awardPoints) window.awardPoints('comment');
        if(window.playSound) window.playSound('send');
        
        inputElement.value = "";
        cancelReply(); 

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
        if(window.showToast) window.showToast("কমেন্ট করা যায়নি: " + e.message, "error");
    });
};

window.deleteComment = (postId, commentId) => {
    if(confirm("কমেন্ট ডিলিট করবেন?")) {
        remove(ref(window.db, `posts/${postId}/comments/${commentId}`));
    }
};

// --- 5. Smart Comment Suggestion Algorithm (FIXED AUTHOR NAME) ---
window.getCommentSuggestions = (post) => {
    const text = (post.content || '').toLowerCase();
    const feeling = post.feeling ? post.feeling.text.toLowerCase() : '';
    const type = post.type;

    if (feeling === 'sad' || feeling === 'sick' || text.includes('অসুস্থ') || text.includes('দোয়া') || text.includes('মারা') || text.includes('ইন্নালিল্লাহ')) {
        return ["আল্লাহ সহায় হোন", "আল্লাহ দ্রুত সুস্থতা দান করুন", "ইন্নালিল্লাহি ওয়াইন্না ইলাইহি রাজিউন"];
    }
    if (feeling === 'happy' || feeling === 'blessed' || feeling === 'celebrating' || text.includes('আলহামদুলিল্লাহ') || text.includes('অভিনন্দন') || text.includes('সাফল্য')) {
        return ["মাশাআল্লাহ!", "অভিনন্দন ভাই!", "আলহামদুলিল্লাহ, শুভকামনা"];
    }
    if (type === 'poll' || text.includes('কোনটি') || text.includes('কি বলেন')) {
        return ["দারুণ উদ্যোগ", "ভোট দিলাম!", "সুন্দর বিষয়"];
    }
    if (post.images && post.images.length > 0 || post.image) {
        return ["অসাধারণ ছবি!", "মাশাআল্লাহ খুব সুন্দর!", "চমৎকার!"];
    }
    if (text.includes('রক্ত') || text.includes('জরুরি') || text.includes('বিপদ') || text.includes('সাহায্য')) {
        return ["ইনবক্স চেক করেন", "শেয়ার করে দিলাম", "আল্লাহ সহজ করুন"];
    }
    return ["সহমত পোষণ করছি", "দারুণ পোস্ট!", "খুব সুন্দর কথা"];
};

window.autoPostSuggestion = (postId, text, btnElement) => {
    if (!window.currentUser) return window.showToast ? window.showToast("আগে লগইন করুন", "error") : alert("আগে লগইন করুন");

    const myName = window.userDetails.name;
    const myPic = window.userDetails.profile_pic || null;

    if (!myName) {
        if(window.showToast) window.showToast("আপনার প্রোফাইল লোড হচ্ছে, একটু অপেক্ষা করুন", "error");
        return;
    }

    const originalText = btnElement.innerText;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnElement.disabled = true;

    push(ref(window.db, `posts/${postId}/comments`), {
        author: myName,
        authorUid: window.currentUser.uid,
        authorPic: myPic,
        text: text,
        time: Date.now()
    }).then(() => {
        const suggContainer = document.getElementById(`comment-suggestions-${postId}`);
        if(suggContainer) {
            suggContainer.style.transition = "opacity 0.3s, transform 0.3s";
            suggContainer.style.opacity = "0";
            suggContainer.style.transform = "translateY(-10px)";
            setTimeout(() => suggContainer.style.display = 'none', 300);
        }

        if(window.awardPoints) window.awardPoints('comment');
        if(window.playSound) window.playSound('send');
        if(window.showToast) window.showToast("সাজেশন থেকে কমেন্ট করা হয়েছে!");

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