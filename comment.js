import { ref, push, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- ১. স্মার্ট কমেন্ট সাজেশন অ্যালগরিদম ---
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

// --- ২. অটো কমেন্ট সাবমিট করার ফাংশন ---
window.autoPostSuggestion = (postId, text, btnElement) => {
    if (!window.currentUser) return window.showToast("আগে লগইন করুন", "error");

    const originalText = btnElement.innerText;
    btnElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnElement.disabled = true;

    // মেইন ফাইল থেকে গ্লোবাল ভেরিয়েবলগুলো নেওয়া হচ্ছে
    const db = window.db; 
    const userDetails = window.userDetails;

    push(ref(db, `posts/${postId}/comments`), {
        author: userDetails.name,
        authorUid: window.currentUser.uid,
        authorPic: userDetails.profile_pic || null,
        text: text,
        time: Date.now()
    }).then(() => {
        // অ্যানিমেশন দিয়ে সাজেশন বার লুকিয়ে ফেলা
        const suggContainer = document.getElementById(`comment-suggestions-${postId}`);
        if(suggContainer) {
            suggContainer.style.transition = "opacity 0.3s, transform 0.3s";
            suggContainer.style.opacity = "0";
            suggContainer.style.transform = "translateY(-10px)";
            setTimeout(() => suggContainer.style.display = 'none', 300);
        }

        // পয়েন্ট, সাউন্ড এবং টোস্ট
        if(window.awardPoints) window.awardPoints('comment');
        if(window.playSound) window.playSound('send');
        if(window.showToast) window.showToast("সাজেশন থেকে কমেন্ট করা হয়েছে!");

        // নোটিফিকেশন পাঠানো
        get(ref(db, `posts/${postId}`)).then(s => {
            const p = s.val();
            if (p && p.uid !== window.currentUser.uid) {
                push(ref(db, `notifications/${p.uid}`), {
                    type: 'comment',
                    fromUid: window.currentUser.uid,
                    fromName: userDetails.name,
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