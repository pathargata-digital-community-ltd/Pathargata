import {
    ref,
    set,
    onValue,
    remove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ==========================================
// গ্লোবাল ভেরিয়েবল
// ==========================================
let storyUsers = []; 
let currentUserIndex = 0; 
let currentSubStoryIndex = 0; 
let progressInterval = null;
let isPaused = false; 
let elapsedTime = 0; 
let currentStoryDuration = 15000; 

const bgColors = [
    "bg-gray-50 text-gray-800", // Default
    "bg-gradient-to-br from-blue-900 to-purple-900 text-white",
    "bg-gradient-to-br from-green-500 to-blue-600 text-white",
    "bg-gradient-to-br from-pink-500 to-orange-400 text-white",
    "bg-gradient-to-br from-gray-900 to-black text-white"
];
let currentBgIndex = 0;

// হেল্পার ফাংশন
function getStoryThumbnail(url) {
    if (!url) return '';
    if (url.includes('cloudinary') && url.match(/\.(mp4|webm|mov)$/i)) {
        return url.replace(/\.(mp4|webm|mov)$/i, '.jpg'); 
    }
    return url; 
}

function getRandomColor(name) {
    const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'];
    let charCode = name.charCodeAt(0) || 0;
    return colors[charCode % colors.length];
}

// ==========================================
// স্টোরি তৈরি ও আপলোড 
// ==========================================
window.toggleNoteModal = (show) => {
    const modal = document.getElementById('note-modal');
    const input = document.getElementById('note-input-text');
    if (show) {
        input.value = '';
        document.getElementById('story-file-input').value = '';
        currentBgIndex = 0; 
        input.className = `w-full border-0 p-4 rounded-xl text-lg focus:outline-none resize-none font-bold text-center transition-colors ${bgColors[0]}`;
        modal.classList.remove('hidden-custom');
    } else {
        modal.classList.add('hidden-custom');
    }
};

window.changeStoryBackground = () => {
    currentBgIndex = (currentBgIndex + 1) % bgColors.length;
    const input = document.getElementById('note-input-text');
    input.className = `w-full border-0 p-4 rounded-xl text-lg focus:outline-none resize-none font-bold text-center transition-colors shadow-inner ${bgColors[currentBgIndex]}`;
};

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
            if (file.size > 10 * 1024 * 1024) throw new Error("ফাইল ১০ এমবির বেশি হতে পারবে না");

            if (file.type.startsWith('video/')) {
                mediaType = "video";
                await new Promise((resolve, reject) => {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = function() {
                        window.URL.revokeObjectURL(video.src);
                        if (video.duration > 31) reject(new Error("ভিডিও ৩০ সেকেন্ডের বেশি হতে পারবে না"));
                        else resolve();
                    }
                    video.onerror = () => {
                        window.URL.revokeObjectURL(video.src);
                        reject(new Error("ভিডিও ফাইলটিতে সমস্যা আছে"));
                    }
                    video.src = URL.createObjectURL(file);
                });
            } else if (file.type.startsWith('image/')) {
                mediaType = "image";
            } else throw new Error("শুধুমাত্র ছবি বা ভিডিও দেওয়া যাবে");

            const res = await window.uploadMediaToCloudinary(file, true);
            mediaUrl = res.url;
        }

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
            bgColor: bgColors[currentBgIndex], 
            timestamp: timestamp,
            reactions: {},
            views: {} 
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

window.deleteMyStory = async (storyId) => {
    if (confirm("আপনি কি এই স্টোরিটি ডিলিট করতে চান?")) {
        try {
            await set(ref(window.db, `story_trash/${storyId}`), { deletedAt: Date.now() });
            await remove(ref(window.db, `stories/${storyId}`));
            window.showToast("স্টোরি ডিলিট করা হয়েছে", "success");
            window.closeStoryViewer();
        } catch (e) { window.showToast("সমস্যা হয়েছে: " + e.message, "error"); }
    }
};

// ==========================================
// ফিড রেন্ডার ও লোড 
// ==========================================
const renderStoryFeed = (usersData) => {
    const container = document.getElementById('notes-list-container');
    if (!container) return;

    let safeUser = window.userDetails || {};
    let myBg = safeUser.cover_pic || safeUser.profile_pic || 'https://via.placeholder.com/150';

    let html = `
    <div onclick="toggleNoteModal(true)" class="story-card group w-[100px] h-[150px] flex-shrink-0 relative rounded-xl overflow-hidden cursor-pointer shadow-sm border border-gray-200">
        <img src="${myBg}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
        <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center border-2 border-white shadow-md z-10">
            <i class="fa-solid fa-plus text-xs"></i>
        </div>
        <div class="absolute bottom-0 left-0 w-full bg-white pt-3 pb-1 text-center z-0">
            <p class="text-[11px] font-bold text-gray-800">Add Story</p>
        </div>
    </div>`;

    usersData.forEach((user, index) => {
        let av = user.authorPic || 'https://via.placeholder.com/150';
        let latestStory = user.stories[user.stories.length - 1];
        
        let bgImg = latestStory.mediaType === 'image' && latestStory.mediaUrl ? latestStory.mediaUrl 
                    : (latestStory.mediaType === 'video' ? getStoryThumbnail(latestStory.mediaUrl) : av);
        
        let isMe = window.currentUser && user.uid === window.currentUser.uid;
        let borderClass = isMe ? 'border-blue-500' : 'border-blue-400';

        html += `
        <div onclick="openStoryViewer(${index})" class="story-card w-[100px] h-[150px] flex-shrink-0 relative rounded-xl overflow-hidden cursor-pointer shadow-sm border-2 ${borderClass}">
            ${latestStory.mediaType === 'text' && !latestStory.mediaUrl ? 
              `<div class="w-full h-full flex items-center justify-center p-2 text-center text-[10px] font-bold ${latestStory.bgColor}">${latestStory.text.substring(0,30)}...</div>` 
              : `<img src="${bgImg}" class="w-full h-full object-cover">`}
            <img src="${av}" class="absolute top-2 left-2 w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm">
            <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-2">
                <p class="text-white text-[11px] font-bold truncate">${isMe ? 'Your Story' : window.escapeHTML(user.author).split(' ')[0]}</p>
            </div>
        </div>`;
    });

    container.innerHTML = html;
};

window.loadNotes = () => {
    const cachedStories = localStorage.getItem('cachedStoryUsers');
    if (cachedStories) { try { renderStoryFeed(JSON.parse(cachedStories)); } catch(e) {} }

    onValue(ref(window.db, 'stories'), (snap) => {
        const storiesData = snap.val() || {};
        const now = Date.now();
        const validStories = [];
        const ONE_DAY = 24 * 60 * 60 * 1000;

        for (const key in storiesData) {
            const story = storiesData[key];
            if (!story.storyId) story.storyId = key; 

            if (now - story.timestamp > ONE_DAY) {
                remove(ref(window.db, `stories/${story.storyId}`));
            } else {
                validStories.push(story);
            }
        }

        let groups = {};
        validStories.forEach(s => {
            if (!groups[s.uid]) groups[s.uid] = { uid: s.uid, author: s.author, authorPic: s.authorPic, stories: [] };
            groups[s.uid].stories.push(s);
        });

        Object.values(groups).forEach(user => user.stories.sort((a, b) => a.timestamp - b.timestamp));

        let sortedUsers = Object.values(groups);
        sortedUsers.sort((a, b) => {
            if (window.currentUser && a.uid === window.currentUser.uid) return -1;
            if (window.currentUser && b.uid === window.currentUser.uid) return 1;
            return b.stories[b.stories.length - 1].timestamp - a.stories[a.stories.length - 1].timestamp;
        });

        localStorage.setItem('cachedStoryUsers', JSON.stringify(sortedUsers.slice(0, 15))); 
        storyUsers = sortedUsers;
        renderStoryFeed(storyUsers); 
        
        const modal = document.getElementById('story-viewer-modal');
        if (modal && !modal.classList.contains('hidden-custom')) {
            if(!storyUsers[currentUserIndex] || !storyUsers[currentUserIndex].stories[currentSubStoryIndex]) {
                window.closeStoryViewer(); 
            } else {
                renderReactions(); 
                updateViewsAndFooterUI();
            }
        }
    });
};
setTimeout(() => { if (window.currentUser) window.loadNotes(); }, 500);

// ==========================================
// STORY VIEWER LOGIC 
// ==========================================
window.openStoryViewer = (userIndex, subIndex = 0) => {
    if (!storyUsers || storyUsers.length === 0) return;
    currentUserIndex = userIndex;
    currentSubStoryIndex = subIndex;
    history.pushState({ modal: 'storyViewer' }, null, '#story');
    document.getElementById('story-viewer-modal').classList.remove('hidden-custom');
    playStory();
};

window.closeStoryViewer = (fromBackButton = false) => {
    document.getElementById('story-viewer-modal').classList.add('hidden-custom');
    clearInterval(progressInterval);
    isPaused = false;
    document.getElementById('story-media-container').innerHTML = ''; 
    if (!fromBackButton && window.location.hash === '#story') history.back();
};

window.addEventListener('popstate', (e) => {
    const modal = document.getElementById('story-viewer-modal');
    if (modal && !modal.classList.contains('hidden-custom')) window.closeStoryViewer(true);
});

function playStory() {
    clearInterval(progressInterval);
    elapsedTime = 0;
    isPaused = false;
    
    if (currentUserIndex >= storyUsers.length) return window.closeStoryViewer();
    const user = storyUsers[currentUserIndex];
    if (currentSubStoryIndex >= user.stories.length) return window.nextStory();

    const story = user.stories[currentSubStoryIndex];
    
    // UI Update (Header)
    const avatarDiv = document.getElementById('story-viewer-avatar');
    if (user.authorPic) {
        avatarDiv.innerHTML = `<img src="${user.authorPic}" class="w-full h-full object-cover">`;
    } else {
        avatarDiv.innerHTML = `<div class="w-full h-full ${getRandomColor(user.author)} flex items-center justify-center text-white font-bold">${user.author.charAt(0)}</div>`;
    }
    
    document.getElementById('story-viewer-name').innerText = user.uid === window.currentUser?.uid ? 'Your Story' : user.author;
    document.getElementById('story-viewer-time').innerText = window.timeAgo(story.timestamp);
    document.getElementById('story-viewer-caption').innerText = story.text || "";

    // Delete Button (Only for my story)
    const headerActions = document.getElementById('header-actions');
    document.getElementById('story-viewer-delete-btn')?.remove();
    if (story.uid === window.currentUser?.uid) {
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'story-viewer-delete-btn';
        deleteBtn.className = 'text-white bg-red-600/80 rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 backdrop-blur-md';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash text-sm"></i>';
        deleteBtn.onclick = () => window.deleteMyStory(story.storyId);
        headerActions.prepend(deleteBtn);
    } else {
        // Mark as seen
        set(ref(window.db, `stories/${story.storyId}/views/${window.currentUser.uid}`), Date.now());
    }

    updateViewsAndFooterUI();
    renderReactions();
    setupProgressBars(user.stories.length, currentSubStoryIndex);

    // Media Setup
    const mediaContainer = document.getElementById('story-media-container');
    mediaContainer.innerHTML = '';
    currentStoryDuration = 15000; 

    if (story.mediaType === 'video' && story.mediaUrl) {
        const video = document.createElement('video');
        video.src = story.mediaUrl;
        video.className = "max-w-full max-h-full object-contain";
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; 
        
        const muteBtn = document.createElement('button');
        muteBtn.className = "absolute top-4 right-4 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center z-50 backdrop-blur-md";
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark text-sm"></i>';
        muteBtn.onclick = (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            muteBtn.innerHTML = video.muted ? '<i class="fa-solid fa-volume-xmark text-sm"></i>' : '<i class="fa-solid fa-volume-high text-sm"></i>';
        };
        mediaContainer.appendChild(muteBtn);

        video.onloadedmetadata = () => { currentStoryDuration = video.duration * 1000; startProgress(currentSubStoryIndex); };
        video.onended = () => window.nextStory();
        mediaContainer.appendChild(video);
    } else if (story.mediaType === 'image' && story.mediaUrl) {
        const img = document.createElement('img');
        img.src = story.mediaUrl;
        img.className = "max-w-full max-h-full object-contain";
        mediaContainer.appendChild(img);
        startProgress(currentSubStoryIndex);
    } else {
        let txtBg = story.bgColor || bgColors[0];
        mediaContainer.innerHTML = `<div class="w-full h-full flex items-center justify-center p-8 ${txtBg}"><p class="text-3xl text-center font-bold leading-relaxed break-words">${window.escapeHTML(story.text)}</p></div>`;
        document.getElementById('story-viewer-caption').innerText = ''; 
        startProgress(currentSubStoryIndex);
    }

    setupTouchAndClickControls(mediaContainer);
}

// Swipe, Tap, Hold Logic 
function setupTouchAndClickControls(container) {
    let startX = 0, pressTimer;

    const handleStart = (e) => {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
        pressTimer = setTimeout(() => {
            isPaused = true;
            const video = container.querySelector('video');
            if(video) video.pause();
        }, 200); 
    };

    const handleEnd = (e) => {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        clearTimeout(pressTimer);
        let endX = e.type.includes('mouse') ? e.pageX : e.changedTouches[0].clientX;
        
        if (isPaused) {
            isPaused = false;
            const video = container.querySelector('video');
            if(video) video.play();
            return; 
        }

        let diffX = startX - endX;
        if (Math.abs(diffX) > 50) {
            if (diffX > 0) window.nextStory(); 
            else window.prevStory(); 
        } else {
            if (endX < window.innerWidth * 0.3) window.prevStory();
            else window.nextStory();
        }
    };

    container.addEventListener('mousedown', handleStart);
    container.addEventListener('touchstart', handleStart);
    container.addEventListener('mouseup', handleEnd);
    container.addEventListener('touchend', handleEnd);
}

// Progress Bar
function startProgress(index) {
    const fill = document.getElementById(`progress-fill-${index}`);
    if (!fill) return;
    progressInterval = setInterval(() => {
        if (!isPaused) {
            elapsedTime += 16;
            let percentage = (elapsedTime / currentStoryDuration) * 100;
            if (percentage >= 100) {
                percentage = 100;
                clearInterval(progressInterval);
                if(!document.querySelector('#story-media-container video')) window.nextStory(); 
            }
            fill.style.width = `${percentage}%`;
        }
    }, 16);
}

function setupProgressBars(total, activeIndex) {
    const container = document.getElementById('story-progress-container');
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
        container.innerHTML += `<div class="flex-1 bg-white/30 h-full rounded-full overflow-hidden"><div class="bg-white h-full w-0" id="progress-fill-${i}" style="${i < activeIndex ? 'width:100%' : ''}"></div></div>`;
    }
}

// Dynamic Footer (Views vs Reply/Reactions)
function updateViewsAndFooterUI() {
    const user = storyUsers[currentUserIndex];
    if(!user) return;
    const story = user.stories[currentSubStoryIndex];
    const footer = document.getElementById('story-footer-container');
    
    if(story.uid === window.currentUser?.uid) {
        let viewCount = story.views ? Object.keys(story.views).length : 0;
        footer.innerHTML = `
            <div class="w-full flex justify-center pb-2">
                <div class="flex items-center gap-2 text-white font-medium cursor-pointer backdrop-blur-md bg-black/40 px-4 py-2 rounded-full border border-white/20">
                    <i class="fa-solid fa-eye"></i> ${viewCount} Views
                </div>
            </div>`;
    } else {
        footer.innerHTML = `
            <div class="flex items-center gap-2 pb-2">
                <div class="flex-1 flex bg-black/40 backdrop-blur-md border border-white/40 rounded-full px-4 py-3 shadow-lg">
                    <input type="text" id="story-reply-input" placeholder="Reply to ${user.author.split(' ')[0]}..." class="flex-1 bg-transparent text-white outline-none text-sm placeholder-white/70">
                    <button onclick="sendStoryReply('${story.storyId}')" class="text-white ml-2 hover:text-blue-400 transition"><i class="fa-solid fa-paper-plane"></i></button>
                </div>
                <button onclick="sendReaction('❤️')" class="text-3xl hover:scale-125 transition drop-shadow-md">❤️</button>
                <button onclick="sendReaction('😂')" class="text-3xl hover:scale-125 transition drop-shadow-md">😂</button>
            </div>`;
    }
}

// Reactions & Replies
window.sendStoryReply = async (storyId) => {
    const input = document.getElementById('story-reply-input');
    if(!input.value.trim()) return;
    try {
        await set(ref(window.db, `story_replies/${storyId}/${window.currentUser.uid}_${Date.now()}`), input.value.trim());
        input.value = '';
        window.showToast("Reply sent!", "success");
    } catch(e) {}
};

window.sendReaction = async (emoji) => {
    const user = storyUsers[currentUserIndex];
    const story = user.stories[currentSubStoryIndex];
    if (!story) return;

    const modal = document.getElementById('story-viewer-modal');
    for(let i=0; i<3; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.innerText = emoji;
            el.className = `reaction-bubble text-4xl`;
            el.style.left = `${30 + Math.random() * 40}%`;
            modal.appendChild(el);
            setTimeout(() => el.remove(), 1500);
        }, i * 150); 
    }
    try { await set(ref(window.db, `stories/${story.storyId}/reactions/${window.currentUser.uid}`), emoji); } catch (e) {}
};

function renderReactions() {
    const display = document.getElementById('story-reactions-display');
    if(!display) return;
    const user = storyUsers[currentUserIndex];
    const story = user?.stories[currentSubStoryIndex];
    display.innerHTML = '';

    if (story?.reactions) {
        let counts = {}, total = 0;
        for (let rUid in story.reactions) { counts[story.reactions[rUid]] = (counts[story.reactions[rUid]] || 0) + 1; total++; }
        if (total > 0) {
            let html = `<div class="flex -space-x-1 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full items-center border border-white/20">`;
            for (let emoji in counts) html += `<span class="text-base">${emoji}</span>`;
            html += `<span class="ml-2 font-bold text-white text-xs">${total}</span></div>`;
            display.innerHTML = html;
        }
    }
}

// Next/Prev Logic
window.nextStory = () => {
    let user = storyUsers[currentUserIndex];
    if (currentSubStoryIndex < user.stories.length - 1) { currentSubStoryIndex++; playStory(); } 
    else if (currentUserIndex < storyUsers.length - 1) { currentUserIndex++; currentSubStoryIndex = 0; playStory(); } 
    else window.closeStoryViewer();
};
window.prevStory = () => {
    if (currentSubStoryIndex > 0) { currentSubStoryIndex--; playStory(); } 
    else if (currentUserIndex > 0) { currentUserIndex--; currentSubStoryIndex = storyUsers[currentUserIndex].stories.length - 1; playStory(); } 
    else { currentSubStoryIndex = 0; playStory(); }
};