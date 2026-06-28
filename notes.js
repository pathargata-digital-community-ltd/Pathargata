<script type="module">
import {
    ref,
    set,
    onValue,
    remove,
    update
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

// স্টোরি সাবমিট করা (ভিডিও/ছবি সহ) - আনলিমিটেড সাপোর্ট
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
            if (file.size > 5 * 1024 * 1024) {
                throw new Error("ফাইল ৫ এমবির বেশি হতে পারবে এন্টি");
            }
            if (file.type.startsWith('video/')) {
                mediaType = "video";
                await new Promise((resolve, reject) => {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = function() {
                        window.URL.revokeObjectURL(video.src);
                        if (video.duration > 16) { 
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
            const res = await window.uploadMediaToCloudinary(file, true);
            mediaUrl = res.url;
        }

        // আনলিমিটেড স্টোরি: ইউনিক আইডি তৈরি করা হলো
        const timestamp = Date.now();
        const storyId = `${window.currentUser.uid}_${timestamp}`;

        await set(ref(window.db, `stories/${storyId}`), {
            storyId: storyId,
            uid: window.currentUser.uid,
            author: window.userDetails.name,
            authorPic: window.userDetails.profile_pic || "",
            text: text,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            timestamp: timestamp,
            reactions: {} // রিঅ্যাকশনের জন্য ফাঁকা অবজেক্ট
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
window.deleteMyStory = async (storyId, timestamp) => {
    if (confirm("আপনি কি আপনার স্টোরি ডিলিট করতে চান?")) {
        try {
            const story = allActiveStories.find(s => s.storyId === storyId);
            if (story) {
                await set(ref(window.db, `story_trash/${storyId}`), story);
            }
            await remove(ref(window.db, `stories/${storyId}`));
            window.showToast("স্টোরি ডিলিট করা হয়েছে", "success");
            window.closeStoryViewer();
        } catch (e) {
            window.showToast("ডিলিট করতে সমস্যা হয়েছে: " + e.message, "error");
        }
    }
};

// স্টোরি লোড করা
window.loadNotes = () => {
    const container = document.getElementById('notes-list-container');
    if (!container) return;

    onValue(ref(window.db, 'stories'), async (snap) => {
        const storiesData = snap.val() || {};
        const now = Date.now();
        const validStories = [];
        const ONE_DAY = 24 * 60 * 60 * 1000;

        for (const key in storiesData) {
            const story = storiesData[key];
            // পুরানো স্টোরির জন্য storyId না থাকলে key টাই storyId হিসেবে ধরবে
            if (!story.storyId) story.storyId = key; 

            if (now - story.timestamp > ONE_DAY) {
                await set(ref(window.db, `story_trash/${story.storyId}`), story);
                await remove(ref(window.db, `stories/${story.storyId}`));
            } else {
                validStories.push(story);
            }
        }

        validStories.sort((a, b) => b.timestamp - a.timestamp);
        allActiveStories = validStories;

        let safeUser = window.userDetails || {};
        let myProfilePic = safeUser.profile_pic || 'https://via.placeholder.com/150';
        let myBg = safeUser.cover_pic || myProfilePic; 

        let html = `
        <div onclick="toggleNoteModal(true)" class="story-card group min-w-[100px]">
            <img src="${myBg}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
            <div class="story-add-btn">
                <i class="fa-solid fa-plus text-xs"></i>
            </div>
            <p class="story-name text-center" style="bottom: 4px;">Add Story</p>
        </div>`;

        validStories.forEach((s, index) => {
            let av = s.authorPic ? s.authorPic : 'https://via.placeholder.com/150';
            let bgImg = s.mediaType === 'image' && s.mediaUrl ? s.mediaUrl : (s.mediaType === 'video' ? 'https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png' : av);
            
            html += `
            <div onclick="openStoryViewer(${index})" class="story-card min-w-[100px] border-2 ${s.uid === window.currentUser?.uid ? 'border-blue-500' : 'border-gray-200'}">
                <img src="${bgImg}" class="w-full h-full object-cover">
                <img src="${av}" class="story-avatar">
                <p class="story-name">${s.uid === window.currentUser?.uid ? 'Your Story' : window.escapeHTML(s.author).split(' ')[0]}</p>
            </div>`;
        });

        container.innerHTML = html;
        
        // ভিউয়ার ওপেন থাকলে লাইভ রিয়্যাকশন আপডেট করার জন্য
        if (!document.getElementById('story-viewer-modal').classList.contains('hidden-custom')) {
            renderReactions(currentStoryIndex);
        }
    });
};

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
    document.getElementById('story-media-container').innerHTML = ''; 
    document.getElementById('story-viewer-delete-btn')?.remove(); 
};

function playStory(index) {
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    
    if (index < 0 || index >= allActiveStories.length) {
        closeStoryViewer();
        return;
    }

    const story = allActiveStories[index];
    
    const avatarDiv = document.getElementById('story-viewer-avatar');
    if (story.authorPic) {
        avatarDiv.innerHTML = `<img src="${story.authorPic}" class="w-full h-full object-cover">`;
    } else {
        avatarDiv.innerHTML = `<div class="w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold">${story.author.charAt(0)}</div>`;
    }
    
    document.getElementById('story-viewer-name').innerText = story.uid === window.currentUser?.uid ? 'Your Story' : story.author;
    document.getElementById('story-viewer-time').innerText = window.timeAgo(story.timestamp);
    document.getElementById('story-viewer-caption').innerText = story.text || "";

    // ডিলিট বাটন (শুধু নিজের স্টোরি হলে)
    document.getElementById('story-viewer-delete-btn')?.remove(); 
    if (story.uid === window.currentUser?.uid) {
        const headerDiv = document.querySelector('#story-viewer-modal .absolute.top-4');
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'story-viewer-delete-btn';
        deleteBtn.className = 'w-8 h-8 text-white rounded-full flex items-center justify-center bg-red-600 hover:bg-red-700 shadow-md ml-auto mr-3';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash text-sm"></i>';
        deleteBtn.onclick = () => window.deleteMyStory(story.storyId, story.timestamp);
        headerDiv.insertBefore(deleteBtn, headerDiv.lastElementChild);
    }

    renderReactions(index);
    setupProgressBars(index);

    const mediaContainer = document.getElementById('story-media-container');
    mediaContainer.innerHTML = '';
    let duration = 15000; 

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
        mediaContainer.innerHTML = `<div class="w-full h-full flex items-center justify-center p-6 bg-gradient-to-br from-blue-900 to-purple-900"><p class="text-white text-2xl text-center font-bold">${window.escapeHTML(story.text)}</p></div>`;
        document.getElementById('story-viewer-caption').innerText = ''; 
        startProgress(index, duration);
    }
}

// রিঅ্যাকশন রেন্ডার করা
function renderReactions(index) {
    const display = document.getElementById('story-reactions-display');
    const story = allActiveStories[index];
    display.innerHTML = '';

    if (story && story.reactions) {
        let reactionCounts = {};
        let total = 0;
        
        for (let rUid in story.reactions) {
            let emoji = story.reactions[rUid];
            reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
            total++;
        }

        if (total > 0) {
            let html = `<div class="flex -space-x-1 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full">`;
            for (let emoji in reactionCounts) {
                html += `<span class="text-lg">${emoji}</span>`;
            }
            html += `<span class="ml-2 font-bold">${total}</span></div>`;
            display.innerHTML = html;
        }
    }
}

// রিঅ্যাকশন ডাটাবেসে সেভ করা এবং ফ্লোটিং এনিমেশন
window.sendReaction = async (emoji) => {
    const story = allActiveStories[currentStoryIndex];
    if (!story) return;

    // ভাসমান ইমোজি তৈরি করা (ভিজ্যুয়াল ইফেক্ট)
    const floatEl = document.createElement('div');
    floatEl.innerText = emoji;
    floatEl.className = 'absolute bottom-20 left-1/2 text-5xl animate-float-up z-[400]';
    document.getElementById('story-viewer-modal').appendChild(floatEl);
    
    setTimeout(() => floatEl.remove(), 1500);

    // ফায়ারবেসে সেভ করা
    try {
        await set(ref(window.db, `stories/${story.storyId}/reactions/${window.currentUser.uid}`), emoji);
    } catch (e) {
        console.error("Reaction save failed: ", e);
    }
};

function setupProgressBars(activeIndex) {
    const container = document.getElementById('story-progress-container');
    container.innerHTML = '';
    
    allActiveStories.forEach((_, i) => {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        const fill = document.createElement('div');
        fill.className = 'story-progress-fill';
        fill.id = `progress-fill-${i}`;
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
</script>