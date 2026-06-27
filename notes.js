import {
    ref,
    set,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// গ্লোবাল ভেরিয়েবল
let allActiveStories = [];
let currentStoryIndex = 0;
let storyTimer = null;
let progressInterval = null;

// মডাল ওপেন/ক্লোজ
window.toggleNoteModal = (show) => {
    const modal = document.getElementById('note-modal');
    if (show) {
        document.getElementById('note-input-text').value = '';
        document.getElementById('story-file-input').value = '';
        modal.classList.remove('hidden-custom');
    } else {
        modal.classList.add('hidden-custom');
    }
};

// স্টোরি সাবমিট করা (ভিডিও/ছবি সহ)
window.submitStory = async () => {
    const text = document.getElementById('note-input-text').value.trim();
    const fileInput = document.getElementById('story-file-input');
    const file = fileInput.files[0];

    if (!file && !text) return window.showToast("ছবি, ভিডিও অথবা টেক্সট দিন", "error");

    const btn = document.getElementById('btn-note-submit');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> শেয়ার হচ্ছে...';
    btn.disabled = true;

    try {
        let mediaUrl = "";
        let mediaType = "text";

        if (file) {
            // ১. ফাইল সাইজ চেক (সর্বোচ্চ ৫ MB)
            if (file.size > 5 * 1024 * 1024) {
                throw new Error("ফাইল ৫ এমবির বেশি হতে পারবে না");
            }

            // ২. ভিডিও হলে ১৫ সেকেন্ড ডিউরেশন চেক
            if (file.type.startsWith('video/')) {
                mediaType = "video";
                await new Promise((resolve, reject) => {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = function() {
                        window.URL.revokeObjectURL(video.src);
                        if (video.duration > 16) { // 16 for safety margin
                            reject(new Error("ভিডিও ১৫ সেকেন্ডের বেশি হতে পারবে না"));
                        } else {
                            resolve();
                        }
                    }
                    video.onerror = () => reject(new Error("ভিডিও ফাইলটিতে সমস্যা আছে"));
                    video.src = URL.createObjectURL(file);
                });
            } else if (file.type.startsWith('image/')) {
                mediaType = "image";
            } else {
                throw new Error("শুধুমাত্র ছবি বা ভিডিও দেওয়া যাবে");
            }

            // ৩. ক্লাউডিনারিতে আপলোড (isStory = true পাস করা হয়েছে যাতে ভিডিও আপলোড হয়)
            const res = await window.uploadMediaToCloudinary(file, true);
            mediaUrl = res.url;
        }

        // ৪. ডাটাবেসে সেভ (প্রতি ইউজারের একটাই স্টোরি থাকবে, নতুন দিলে আগেরটা রিপ্লেস হবে)
        await set(ref(window.db, `stories/${window.currentUser.uid}`), {
            uid: window.currentUser.uid,
            author: window.userDetails.name,
            authorPic: window.userDetails.profile_pic || "",
            text: text,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            timestamp: Date.now()
        });

        window.showToast("স্টোরি শেয়ার করা হয়েছে!", "success");
        window.toggleNoteModal(false);

    } catch (e) {
        window.showToast(e.message, "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> স্টোরি শেয়ার করুন';
        btn.disabled = false;
    }
};

// নিজের স্টোরি ডিলিট করা
window.deleteMyStory = async (uid, timestamp) => {
    if (confirm("আপনি কি আপনার স্টোরি ডিলিট করতে চান?")) {
        try {
            // ডিলিট হওয়া স্টোরি ট্র্যাশে পাঠানো
            const story = allActiveStories.find(s => s.uid === uid);
            if (story) {
                await set(ref(window.db, `story_trash/${uid}_${timestamp}`), story);
            }
            
            // মেইন ডাটাবেস থেকে রিমুভ করা
            await remove(ref(window.db, `stories/${uid}`));
            window.showToast("স্টোরি ডিলিট করা হয়েছে", "success");
            window.closeStoryViewer();
        } catch (e) {
            window.showToast("ডিলিট করতে সমস্যা হয়েছে: " + e.message, "error");
        }
    }
};

// স্টোরি লোড করা এবং ২৪ ঘণ্টা পার হলে অটো ডিলিট করে অ্যাডমিন ট্র্যাশে পাঠানো
window.loadNotes = () => {
    const container = document.getElementById('notes-list-container');
    if (!container) return;

    onValue(ref(window.db, 'stories'), async (snap) => {
        const storiesData = snap.val() || {};
        const now = Date.now();
        const validStories = [];
        const ONE_DAY = 24 * 60 * 60 * 1000;

        for (const uid in storiesData) {
            const story = storiesData[uid];
            // ২৪ ঘণ্টা পার হলে ট্র্যাশে পাঠানো
            if (now - story.timestamp > ONE_DAY) {
                // অ্যাডমিনের story_trash ফোল্ডারে কপি করা
                await set(ref(window.db, `story_trash/${uid}_${story.timestamp}`), story);
                // মেইন জায়গা থেকে রিমুভ করা
                await remove(ref(window.db, `stories/${uid}`));
            } else {
                validStories.push(story);
            }
        }

        // নতুন স্টোরি আগে দেখানোর জন্য সর্ট করা
        validStories.sort((a, b) => b.timestamp - a.timestamp);
        
        // গ্লোবাল ভেরিয়েবলে সেভ করে রাখা প্লেব্যাক এর জন্য
        allActiveStories = validStories;

        // নিজের "Add Story" কার্ড তৈরি (Safeguard added)
        let safeUser = window.userDetails || {};
        let myProfilePic = safeUser.profile_pic || 'https://via.placeholder.com/150';
        let myBg = safeUser.cover_pic || myProfilePic; 

        let html = `
        <div onclick="toggleNoteModal(true)" class="story-card group">
            <img src="${myBg}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
            <div class="story-add-btn">
                <i class="fa-solid fa-plus text-xs"></i>
            </div>
            <p class="story-name text-center" style="bottom: 4px;">Add Story</p>
        </div>`;

        // অন্য ইউজারদের কার্ড রেন্ডার করা (নিজের স্টোরিটাও থাকবে)
        validStories.forEach((s, index) => {
            let av = s.authorPic ? s.authorPic : 'https://via.placeholder.com/150';
            let bgImg = s.mediaType === 'image' && s.mediaUrl ? s.mediaUrl : (s.mediaType === 'video' ? 'https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png' : av);
            
            html += `
            <div onclick="openStoryViewer(${index})" class="story-card border-2 ${s.uid === window.currentUser?.uid ? 'border-blue-500' : 'border-gray-200'}">
                <img src="${bgImg}" class="w-full h-full object-cover">
                <img src="${av}" class="story-avatar">
                <p class="story-name">${s.uid === window.currentUser?.uid ? 'Your Story' : window.escapeHTML(s.author).split(' ')[0]}</p>
            </div>`;
        });

        container.innerHTML = html;
    });
};

// --- স্টোরি অটো লোডার ---
setTimeout(() => {
    if (window.currentUser && typeof window.loadNotes === 'function') {
        window.loadNotes();
    }
}, 2000);

// ==========================================
// STORY VIEWER LOGIC (Facebook/Insta Style)
// ==========================================

window.openStoryViewer = (index) => {
    if (!allActiveStories || allActiveStories.length === 0) return;
    currentStoryIndex = index;
    const modal = document.getElementById('story-viewer-modal');
    modal.classList.remove('hidden-custom');
    playStory(currentStoryIndex);
};

window.closeStoryViewer = () => {
    const modal = document.getElementById('story-viewer-modal');
    modal.classList.add('hidden-custom');
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    document.getElementById('story-media-container').innerHTML = ''; // মিডিয়া ক্লিয়ার
    document.getElementById('story-viewer-delete-btn')?.remove(); // ডিলিট বাটন ক্লিয়ার
};

function playStory(index) {
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    
    if (index < 0 || index >= allActiveStories.length) {
        closeStoryViewer();
        return;
    }

    const story = allActiveStories[index];
    
    // UI Update
    const avatarDiv = document.getElementById('story-viewer-avatar');
    if (story.authorPic) {
        avatarDiv.innerHTML = `<img src="${story.authorPic}" class="w-full h-full object-cover">`;
    } else {
        avatarDiv.innerHTML = `<div class="w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold">${story.author.charAt(0)}</div>`;
    }
    
    document.getElementById('story-viewer-name').innerText = story.uid === window.currentUser?.uid ? 'Your Story' : story.author;
    document.getElementById('story-viewer-time').innerText = window.timeAgo(story.timestamp);
    document.getElementById('story-viewer-caption').innerText = story.text || "";

    // ⭐️ ডিলিট বাটন (শুধু নিজের স্টোরির ক্ষেত্রে) ⭐️
    document.getElementById('story-viewer-delete-btn')?.remove(); // আগের বাটন থাকলে ডিলিট করবে
    if (story.uid === window.currentUser?.uid) {
        const headerDiv = document.querySelector('#story-viewer-modal .absolute.top-4');
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'story-viewer-delete-btn';
        deleteBtn.className = 'w-8 h-8 text-white rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 shadow-md ml-auto mr-3';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash text-sm"></i>';
        deleteBtn.onclick = () => window.deleteMyStory(story.uid, story.timestamp);
        headerDiv.insertBefore(deleteBtn, headerDiv.lastElementChild);
    }

    // Progress Bar Setup
    setupProgressBars(index);

    // Media Setup
    const mediaContainer = document.getElementById('story-media-container');
    mediaContainer.innerHTML = '';
    
    let duration = 15000; // ডিফল্ট ১৫ সেকেন্ড

    if (story.mediaType === 'video' && story.mediaUrl) {
        const video = document.createElement('video');
        video.src = story.mediaUrl;
        video.className = "max-w-full max-h-full object-contain";
        video.autoplay = true;
        video.playsInline = true;
        
        video.onloadedmetadata = () => {
            duration = video.duration * 1000;
            startProgress(index, duration);
        };
        video.onended = () => nextStory();
        
        mediaContainer.appendChild(video);
    } else if (story.mediaType === 'image' && story.mediaUrl) {
        const img = document.createElement('img');
        img.src = story.mediaUrl;
        img.className = "max-w-full max-h-full object-contain";
        mediaContainer.appendChild(img);
        startProgress(index, duration);
    } else {
        // শুধু টেক্সট হলে
        mediaContainer.innerHTML = `<div class="w-full h-full flex items-center justify-center p-6 bg-gradient-to-br from-blue-900 to-purple-900"><p class="text-white text-2xl text-center font-bold">${window.escapeHTML(story.text)}</p></div>`;
        document.getElementById('story-viewer-caption').innerText = ''; // ক্যাপশন হাইড
        startProgress(index, duration);
    }
}

function setupProgressBars(activeIndex) {
    const container = document.getElementById('story-progress-container');
    container.innerHTML = '';
    
    allActiveStories.forEach((_, i) => {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        
        const fill = document.createElement('div');
        fill.className = 'story-progress-fill';
        fill.id = `progress-fill-${i}`;
        
        // আগের স্টোরিগুলো ফুল দেখাবে
        if (i < activeIndex) fill.style.width = '100%';
        
        bar.appendChild(fill);
        container.appendChild(bar);
    });
}

function startProgress(index, duration) {
    const fill = document.getElementById(`progress-fill-${index}`);
    if (!fill) return;

    let startTime = Date.now();
    
    progressInterval = setInterval(() => {
        let elapsedTime = Date.now() - startTime;
        let percentage = (elapsedTime / duration) * 100;
        
        if (percentage >= 100) {
            percentage = 100;
            clearInterval(progressInterval);
        }
        fill.style.width = `${percentage}%`;
    }, 16);

    storyTimer = setTimeout(() => {
        nextStory();
    }, duration);
}

window.nextStory = () => {
    if (currentStoryIndex < allActiveStories.length - 1) {
        openStoryViewer(currentStoryIndex + 1);
    } else {
        closeStoryViewer();
    }
};

window.prevStory = () => {
    if (currentStoryIndex > 0) {
        openStoryViewer(currentStoryIndex - 1);
    } else {
        openStoryViewer(0);
    }
};