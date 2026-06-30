import { ref, push, get, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let replyingToCommentId = null;
let replyingToAuthor = null;

// Helper function to safely escape HTML
const safeHTML = (str) => window.escapeHTML ? window.escapeHTML(str) : str;

// --- 1. Modal Open/Close Logic (Floating Style) ---
window.openFullCommentModal = (postId) => {
    window.currentFullPostId = postId;
    const modal = document.getElementById('comment-full-modal');
    const overlay = document.getElementById('comment-overlay');
    
    if(modal) modal.classList.remove('hidden-custom');
    if(overlay) overlay.classList.remove('hidden-custom');
    
    // Allow slight delay for display block to render before animating
    setTimeout(() => {
        if(modal) modal.classList.remove('translate-y-full');
        if(overlay) overlay.classList.remove('opacity-0');
    }, 10);
    
    history.pushState({ page: 'comment-modal', postId }, "", "#comments");
    loadFullComments(postId);
};

window.closeFullCommentModal = () => {
    const modal = document.getElementById('comment-full-modal');
    const overlay = document.getElementById('comment-overlay');
    
    if(modal) modal.classList.add('translate-y-full');
    if(overlay) overlay.classList.add('opacity-0');
    
    setTimeout(() => {
        if(modal) modal.classList.add('hidden-custom');
        if(overlay) overlay.classList.add('hidden-custom');
        window.currentFullPostId = null;
        cancelReply(); 
    }, 300);
};

// --- 2. Load Comments with Reply & Profile Navigation ---
window.loadFullComments = (postId) => {
    const container = document.getElementById('full-comments-list');
    if(!container) return;

    container.innerHTML = '<div class="flex justify-center p-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div></div>';
    
    onValue(ref(window.db, `posts/${postId}/comments`), (snap) => {
        if (window.currentFullPostId !== postId) return;
        const comments = snap.val() || {};
        const countElement = document.getElementById('full-comment-count');
        if(countElement) countElement.innerText = Object.keys(comments).length;
        
        container.innerHTML = Object.keys(comments).length > 0 ? Object.entries(comments).sort((a, b) => a[1].time - b[1].time).map(([cId, c]) => {
            
            // Profile Navigation Links
            const profileClick = `onclick="closeFullCommentModal(); setTimeout(()=> { if(window.openUserProfile) window.openUserProfile('${c.authorUid}'); }, 300);"`;
            
            // Avatar HTML
            const commentAvatar = c.authorPic 
                ? `<img ${profileClick} src="${c.authorPic}" class="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-100 cursor-pointer hover:opacity-80">` 
                : `<div ${profileClick} class="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center font-bold text-green-600 text-xs shrink-0 cursor-pointer border border-green-100">${safeHTML(c.author || 'U').charAt(0)}</div>`;
            
            // Actions (Reply & Delete)
            let actionsHtml = `<button onclick="initiateReply('${cId}', '${safeHTML(c.author || 'User')}')" class="text-[11px] text-gray-500 font-bold hover:text-blue-600 transition">রিপ্লাই</button>`;
            
            if (window.currentUser && c.authorUid === window.currentUser.uid) {
                actionsHtml += `<button onclick="deleteComment('${postId}','${cId}')" class="text-[11px] text-red-400 font-bold ml-3 hover:text-red-600 transition">ডিলিট</button>`;
            }

            // Reply Tag UI
            let replyTagHtml = c.replyingTo ? `<span class="block text-[10px] text-blue-500 mb-0.5"><i class="fa-solid fa-reply fa-rotate-180 mr-1"></i> ${safeHTML(c.replyingTo)} -কে রিপ্লাই</span>` : '';

            return `
            <div class="flex gap-2.5 mb-2 animate-fade">
                ${commentAvatar}
                <div class="flex flex-col max-w-[85%]">
                    <div class="bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-2 relative group">
                        <h4 ${profileClick} class="font-bold text-xs text-gray-900 cursor-pointer hover:underline mb-0.5">${safeHTML(c.author || 'User')}</h4>
                        ${replyTagHtml}
                        <p class="text-[14px] text-gray-800 leading-snug whitespace-pre-wrap">${safeHTML(c.text)}</p>
                    </div>
                    <div class="flex items-center gap-3 mt-1 ml-1">
                        <span class="text-[10px] text-gray-400 font-medium">${window.timeAgo ? window.timeAgo(c.time) : 'কিছুক্ষণ আগে'}</span>
                        ${actionsHtml}
                    </div>
                </div>
            </div>`;
        }).join('') : '<div class="h-full flex flex-col items-center justify-center pt-10"><i class="fa-regular fa-comments text-4xl text-gray-200 mb-2"></i><p class="text-center text-gray-400">প্রথম কমেন্ট করুন!</p></div>';
        
        container.scrollTop = container.scrollHeight;
    });
};

// --- 3. Reply Logic ---
window.initiateReply = (commentId, authorName) => {
    replyingToCommentId = commentId;
    replyingToAuthor = authorName;
    
    document.getElementById('replying-to-indicator').classList.remove('hidden');
    document.getElementById('reply-to-name').innerText = authorName;
    
    const input = document.getElementById('full-comment-input');
    if(input) input.focus();
};

window.cancelReply = () => {
    replyingToCommentId = null;
    replyingToAuthor = null;
    const indicator = document.getElementById('replying-to-indicator');
    if(indicator) indicator.classList.add('hidden');
};

// --- 4. Submit Comment/Reply ---
window.submitFullComment = () => window.submitCommentLogic(window.currentFullPostId, document.getElementById('full-comment-input'));
window.submitInlineComment = (postId) => window.submitCommentLogic(postId, document.getElementById(`inline-comment-input-${postId}`));

window.submitCommentLogic = (postId, inputElement) => {
    if (!inputElement) return;
    const text = inputElement.value.trim();
    if (!text || !postId || !window.currentUser) return;
    
    // ERROR FIX: Ensuring author is NEVER undefined
    const authorName = window.userDetails?.name || window.currentUser?.displayName || "Unknown User";
    const authorPic = window.userDetails?.profile_pic || window.currentUser?.photoURL || null;

    const commentData = {
        author: authorName,
        authorUid: window.currentUser.uid,
        authorPic: authorPic,
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
                    fromName: authorName,
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

// --- 5. Smart Comment Suggestion Algorithm ---
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

    const originalText = btnElement.innerText;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnElement.disabled = true;

    // ERROR FIX: Ensuring author is NEVER undefined
    const authorName = window.userDetails?.name || window.currentUser?.displayName || "Unknown User";
    const authorPic = window.userDetails?.profile_pic || window.currentUser?.photoURL || null;

    push(ref(window.db, `posts/${postId}/comments`), {
        author: authorName,
        authorUid: window.currentUser.uid,
        authorPic: authorPic,
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
                    fromName: authorName,
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