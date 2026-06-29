import {
    ref,
    set,
    onValue,
    remove,
    query,
    orderByChild,
    startAt,
    push // <--- এটি ইমপোর্ট করা মিসিং ছিল
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// গ্লোবাল ভেরিয়েবল
let storyUsers = []; // স্টোরিগুলোকে ইউজার অনুযায়ী গ্রুপ করে রাখা হবে
let currentUserIndex = 0; // কোন ইউজারের স্টোরি দেখছি
let currentSubStoryIndex = 0; // ওই ইউজারের কত নাম্বার স্টোরি দেখছি
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

// ইনস্ট্যান্ট ফাইল সাইজ চেক (গ্যালারি থেকে সিলেক্ট করার সাথে সাথে)
window.checkFileSize = (input) => {
    if (input.files && input.files[0]) {
        if (input.files[0].size > 10 * 1024 * 1024) {
            window.showToast("ফাইল সাইজ ১০ এমবির বেশি। ছোট সাইজের ফাইল দিন।", "error");
            input.value = ""; // ফাইল রিমুভ করে দেওয়া হলো
        }
    }
};

// স্টোরি সাবমিট করা (ভিডিও/ছবি সহ - ১০ এমবি ও ৩০ সেকেন্ড লিমিট)
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
            // ১. ফাইল সাইজ চেক (সর্বোচ্চ ১০ MB করা হলো)
            if (file.size > 10 * 1024 * 1024) {
                throw new Error("ফাইল ১০ এমবির বেশি হতে পারবে না");
            }

            // ২. ভিডিও হলে ৩০ সেকেন্ড ডিউরেশন চেক (সেফটি মার্জিনের জন্য ৩১ সেকেন্ড দেওয়া হলো)
            if (file.type.startsWith('video/')) {
                mediaType = "video";
                await new Promise((resolve, reject) => {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = function() {
                        window.URL.revokeObjectURL(video.src);
                        if (video.duration > 31) { 
                            reject(new Error("ভিডিও ৩০ সেকেন্ডের বেশি হতে পারবে না"));
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

            // ৩. ক্লাউডিনারিতে আপলোড এবং প্রগ্রেস বার অ্যানিমেশন
            document.getElementById('upload-progress-container').style.display = 'block';
            document.getElementById('upload-status-text').classList.remove('hidden');
            let progress = 0;
            const progressEl = document.getElementById('upload-progress-bar');
            const textEl = document.getElementById('upload-status-text');
            
            // ফেক প্রগ্রেস সিমুলেশন (যেহেতু ক্লাউডিনারি ফাংশনে প্রগ্রেস ইভেন্ট নেই)
            let simInterval = setInterval(() => {
                if(progress < 90) {
                    progress += Math.floor(Math.random() * 5) + 2;
                    progressEl.style.width = progress + '%';
                    textEl.innerText = `আপলোড হচ্ছে... ${progress}%`;
                }
            }, 300);

            const res = await window.uploadMediaToCloudinary(file, true);
            
            clearInterval(simInterval);
            progressEl.style.width = '100%';
            textEl.innerText = "আপলোড সম্পন্ন হয়েছে! প্রসেস হচ্ছে...";
            mediaUrl = res.url;
        }

        const timestamp = Date.now();
        const storyId = `${window.currentUser.uid}_${timestamp}`;

        // ৪. ডাটাবেসে সেভ (আনলিমিটেড স্টোরি স্ট্রাকচার)
        await set(ref(window.db, `stories/${storyId}`), {
            storyId: storyId,
            uid: window.currentUser.uid,
            author: window.userDetails.name,
            authorPic: window.userDetails.profile_pic || "",
            text: text,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            timestamp: timestamp,
            reactions: {} 
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
    if (confirm("আপনি কি এই স্টোরিটি ডিলিট করতে চান?")) {
        try {
            // খুঁজে বের করা স্টোরিটি
            let targetStory = null;
            storyUsers.forEach(user => {
                user.stories.forEach(s => {
                    if(s.storyId === storyId) targetStory = s;
                });
            });

            if (targetStory) {
                await set(ref(window.db, `story_trash/${storyId}`), targetStory);
            }
            await remove(ref(window.db, `stories/${storyId}`));
            window.showToast("স্টোরি ডিলিট করা হয়েছে", "success");
            window.closeStoryViewer();
        } catch (e) {
            window.showToast("ডিলিট করতে সমস্যা হয়েছে: " + e.message, "error");
        }
    }
};

// ফিডে কার্ড রেন্ডার করার ফাংশন (UI Update)
const renderStoryFeed = (usersData) => {
    const container = document.getElementById('notes-list-container');
    if (!container) return;

    let safeUser = window.userDetails || {};
    let myProfilePic = safeUser.profile_pic || 'https://via.placeholder.com/150';
    let myBg = safeUser.cover_pic || myProfilePic; 

    // Add Story Card (Always First)
    let html = `
    <div onclick="toggleNoteModal(true)" class="story-card group min-w-[100px] flex-shrink-0 relative rounded-xl overflow-hidden cursor-pointer shadow-sm border border-gray-200">
        <img src="${myBg}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
        <div class="story-add-btn absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
            <i class="fa-solid fa-plus text-xs"></i>
        </div>
        <p class="story-name text-center text-xs font-medium bg-white w-full absolute bottom-0 py-1">Add Story</p>
    </div>`;

    // Users Story Cards (One per user)
    usersData.forEach((user, index) => {
        let av = user.authorPic || 'https://via.placeholder.com/150';
        let latestStory = user.stories[user.stories.length - 1];
        let bgImg = latestStory.mediaType === 'image' && latestStory.mediaUrl ? latestStory.mediaUrl 
                    : (latestStory.mediaType === 'video' ? 'https://developers.elementor.com/docs/assets/img/elementor-placeholder-image.png' : av);
        
        let isMe = window.currentUser && user.uid === window.currentUser.uid;
        let borderClass = isMe ? 'border-blue-500' : 'border-blue-400';

        html += `
        <div onclick="openStoryViewer(${index})" class="story-card min-w-[100px] flex-shrink-0 relative rounded-xl overflow-hidden cursor-pointer shadow-sm border-2 ${borderClass}">
            <img src="${bgImg}" class="w-full h-full object-cover">
            <img src="${av}" class="story-avatar absolute top-2 left-2 w-8 h-8 rounded-full border-2 border-white object-cover">
            <p class="story-name absolute bottom-1 left-2 text-white text-xs font-bold shadow-black drop-shadow-md truncate w-11/12">${isMe ? 'Your Story' : window.escapeHTML(user.author).split(' ')[0]}</p>
        </div>`;
    });

    container.innerHTML = html;
};

// স্টোরি লোড ও ক্যাশিং লজিক
window.loadNotes = () => {
    // ১. প্রথমে Local Storage থেকে ইনস্ট্যান্ট লোড করা
    const cachedStories = localStorage.getItem('cachedStoryUsers');
    if (cachedStories) {
        try {
            storyUsers = JSON.parse(cachedStories);
            renderStoryFeed(storyUsers);
        } catch(e) { console.error("Cache parse error", e); }
    }

    // ২. ব্যাকগ্রাউন্ডে ফায়ারবেস থেকে রিয়েল-টাইম আপডেট চেক করা (শুধু গত ২৪ ঘণ্টার ডাটা)
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const yesterday = Date.now() - ONE_DAY;
    const recentStoriesQuery = query(ref(window.db, 'stories'), orderByChild('timestamp'), startAt(yesterday));

    onValue(recentStoriesQuery, async (snap) => {
        const storiesData = snap.val() || {};
        const now = Date.now();
        const validStories = [];
        const ONE_DAY = 24 * 60 * 60 * 1000;

        for (const key in storiesData) {
            const story = storiesData[key];
            if (!story.storyId) story.storyId = key; 

            if (now - story.timestamp > ONE_DAY) {
                await set(ref(window.db, `story_trash/${story.storyId}`), story);
                await remove(ref(window.db, `stories/${story.storyId}`));
            } else {
                validStories.push(story);
            }
        }

        let groups = {};
        validStories.forEach(s => {
            if (!groups[s.uid]) {
                groups[s.uid] = { 
                    uid: s.uid, 
                    author: s.author, 
                    authorPic: s.authorPic, 
                    stories: [] 
                };
            }
            groups[s.uid].stories.push(s);
        });

        Object.values(groups).forEach(user => {
            user.stories.sort((a, b) => a.timestamp - b.timestamp);
        });

        let sortedUsers = Object.values(groups);
        sortedUsers.sort((a, b) => {
            if (window.currentUser) {
                if (a.uid === window.currentUser.uid) return -1;
                if (b.uid === window.currentUser.uid) return 1;
            }
            let aLatest = a.stories[a.stories.length - 1].timestamp;
            let bLatest = b.stories[b.stories.length - 1].timestamp;
            return bLatest - aLatest;
        });

        // ৩. ক্যাশের সাথে নতুন ডাটা মিলিয়ে দেখা
        const newDataString = JSON.stringify(sortedUsers);
        if (newDataString !== localStorage.getItem('cachedStoryUsers')) {
            storyUsers = sortedUsers;
            localStorage.setItem('cachedStoryUsers', newDataString); 
            renderStoryFeed(storyUsers); 
            
            // ভিউয়ার ওপেন থাকলে লাইভ রিয়্যাকশন বা ডিলিট হওয়া স্টোরি আপডেট করা
            const modal = document.getElementById('story-viewer-modal');
            if (modal && !modal.classList.contains('hidden-custom')) {
                if(!storyUsers[currentUserIndex] || !storyUsers[currentUserIndex].stories[currentSubStoryIndex]) {
                    window.closeStoryViewer(); 
                } else {
                    renderReactions(); 
                }
            }
        }
    });
};

setTimeout(() => {
    if (window.currentUser && typeof window.loadNotes === 'function') {
        window.loadNotes();
    }
}, 500);


// ==========================================
// STORY VIEWER LOGIC 
// ==========================================

window.openStoryViewer = (userIndex, subIndex = 0) => {
    if (!storyUsers || storyUsers.length === 0) return;
    currentUserIndex = userIndex;
    currentSubStoryIndex = subIndex;
    
    // History API দিয়ে ব্যাক বাটনের জন্য স্টেট সেভ করা
    history.pushState({ modal: 'storyViewer' }, null, '#story');

    const modal = document.getElementById('story-viewer-modal');
    modal.classList.remove('hidden-custom');
    playStory();
};

window.closeStoryViewer = (fromBackButton = false) => {
    const modal = document.getElementById('story-viewer-modal');
    if(modal) modal.classList.add('hidden-custom');
    
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    const mediaContainer = document.getElementById('story-media-container');
    if(mediaContainer) mediaContainer.innerHTML = ''; 
    document.getElementById('story-viewer-delete-btn')?.remove(); 
    
    // যদি ব্যাক বাটন ছাড়া অন্যভাবে ক্লোজ হয়, তাহলে URL থেকে হ্যাশ রিমুভ করা
    if (!fromBackButton && window.location.hash === '#story') {
        history.back();
    }
};

// ফোনের ব্যাক বাটন চাপলে ভিউয়ার ক্লোজ করার লিসেনার
window.addEventListener('popstate', (event) => {
    const modal = document.getElementById('story-viewer-modal');
    if (modal && !modal.classList.contains('hidden-custom')) {
        window.closeStoryViewer(true);
    }
});

function playStory() {
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    
    if (currentUserIndex >= storyUsers.length) {
        window.closeStoryViewer();
        return;
    }

    const user = storyUsers[currentUserIndex];
    if (currentSubStoryIndex >= user.stories.length) {
        window.nextStory();
        return;
    }

    const story = user.stories[currentSubStoryIndex];
    
    // UI Update
    const avatarDiv = document.getElementById('story-viewer-avatar');
    if (user.authorPic) {
        avatarDiv.innerHTML = `<img src="${user.authorPic}" class="w-full h-full object-cover">`;
    } else {
        avatarDiv.innerHTML = `<div class="w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold">${user.author.charAt(0)}</div>`;
    }
    
    document.getElementById('story-viewer-name').innerText = user.uid === window.currentUser?.uid ? 'Your Story' : user.author;
    document.getElementById('story-viewer-time').innerText = window.timeAgo(story.timestamp);
    document.getElementById('story-viewer-caption').innerText = story.text || "";

    // ডিলিট বাটন
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

    renderReactions();
    setupProgressBars(user.stories.length, currentSubStoryIndex);

    // Media Setup
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
            startProgress(currentSubStoryIndex, duration, 'video'); // টাইপ পাঠানো হলো
        };
        video.onended = () => window.nextStory();
        mediaContainer.appendChild(video);
    } else if (story.mediaType === 'image' && story.mediaUrl) {
        const img = document.createElement('img');
        img.src = story.mediaUrl;
        img.className = "max-w-full max-h-full object-contain";
        mediaContainer.appendChild(img);
        startProgress(currentSubStoryIndex, duration);
    } else {
        mediaContainer.innerHTML = `<div class="w-full h-full flex items-center justify-center p-6 bg-gradient-to-br from-blue-900 to-purple-900"><p class="text-white text-2xl text-center font-bold">${window.escapeHTML(story.text)}</p></div>`;
        document.getElementById('story-viewer-caption').innerText = ''; 
        startProgress(currentSubStoryIndex, duration);
    }

    // অ্যাডভান্সড ফিচার: স্ক্রিনে চাপ দিয়ে ধরলে স্টোরি পজ হওয়া
    mediaContainer.onmousedown = mediaContainer.ontouchstart = () => pauseStory(currentSubStoryIndex);
    mediaContainer.onmouseup = mediaContainer.ontouchend = () => resumeStory(currentSubStoryIndex, duration, story.mediaType);
}

// Pause & Resume Logic
let pauseTime = 0;
let remainingDuration = 0;
let currentStartTime = 0;

function pauseStory(index) {
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    pauseTime = Date.now();
    const mediaContainer = document.getElementById('story-media-container');
    const video = mediaContainer.querySelector('video');
    if(video) video.pause();
    
    // UI hide to see image clearly
    document.querySelector('.absolute.top-4').style.opacity = '0';
    document.getElementById('story-reply-input')?.parentElement.parentElement.style.opacity = '0';
}

function resumeStory(index, totalDuration, type) {
    let passedTime = pauseTime - currentStartTime;
    remainingDuration = totalDuration - passedTime;
    
    const mediaContainer = document.getElementById('story-media-container');
    const video = mediaContainer.querySelector('video');
    if(video) video.play();

    // UI show back
    document.querySelector('.absolute.top-4').style.opacity = '1';
    document.getElementById('story-reply-input')?.parentElement.parentElement.style.opacity = '1';

    // Resume progress
    startProgress(index, totalDuration, type, true); 
}

// রিঅ্যাকশন রেন্ডার করা
function renderReactions() {
    const display = document.getElementById('story-reactions-display');
    const user = storyUsers[currentUserIndex];
    if(!user) return;
    const story = user.stories[currentSubStoryIndex];
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

// অ্যাডভান্সড রিঅ্যাকশন অ্যানিমেশন (Burst Effect) ও ফায়ারবেস সেভ
window.sendReaction = async (emoji) => {
    const user = storyUsers[currentUserIndex];
    const story = user.stories[currentSubStoryIndex];
    if (!story) return;

    const modal = document.getElementById('story-viewer-modal');
    // ৬-৭ টি ইমোজির বার্স্ট অ্যানিমেশন
    for(let i=0; i<7; i++) {
        const floatEl = document.createElement('div');
        floatEl.innerText = emoji;
        floatEl.className = `reaction-bubble text-3xl md:text-4xl`;
        
        // র‍্যান্ডম দিকে ছড়িয়ে পড়ার হিসাব
        let tx = (Math.random() - 0.5) * 200 + 'px'; 
        let ty = -(Math.random() * 200 + 100) + 'px'; 
        floatEl.style.setProperty('--tx', tx);
        floatEl.style.setProperty('--ty', ty);
        
        modal.appendChild(floatEl);
        setTimeout(() => floatEl.remove(), 1200);
    }

    try {
        await set(ref(window.db, `stories/${story.storyId}/reactions/${window.currentUser.uid}`), emoji);
    } catch (e) {}
};

// স্টোরিতে মেসেঞ্জারে রিপ্লাই দেওয়া
window.sendStoryReply = async () => {
    const input = document.getElementById('story-reply-input');
    const msg = input.value.trim();
    if (!msg) return;

    const user = storyUsers[currentUserIndex];
    const story = user.stories[currentSubStoryIndex];
    
    // নিজের স্টোরিতে নিজে রিপ্লাই দেওয়া বন্ধ করা
    if(story.uid === window.currentUser.uid) {
        window.showToast("নিজের স্টোরিতে রিপ্লাই দেওয়া যায় না", "error");
        input.value = "";
        return;
    }

    try {
        const replyData = {
            senderId: window.currentUser.uid,
            receiverId: story.uid,
            message: msg,
            storyRefUrl: story.mediaUrl, // স্টোরির ছবি/ভিডিও লিংক
            storyText: story.text,
            timestamp: Date.now(),
            type: "story_reply"
        };

        // এখানে আপনার মেসেঞ্জার ডাটাবেস এর পাথ বসাবেন (আমি একটি ডেমো পাথ দিলাম)
        const newMsgRef = push(ref(window.db, `messages/${window.currentUser.uid}_${story.uid}`));
        await set(newMsgRef, replyData);
        
        window.showToast("রিপ্লাই পাঠানো হয়েছে!", "success");
        input.value = "";
        window.closeStoryViewer(); // রিপ্লাই দেওয়ার পর চাইলে ভিউয়ার ক্লোজ করে দিতে পারেন
    } catch (e) {
        window.showToast("রিপ্লাই পাঠাতে সমস্যা হয়েছে", "error");
    }
};

function setupProgressBars(totalStories, activeIndex) {
    const container = document.getElementById('story-progress-container');
    container.innerHTML = '';
    
    for (let i = 0; i < totalStories; i++) {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        const fill = document.createElement('div');
        fill.className = 'story-progress-fill';
        fill.id = `progress-fill-${i}`;
        if (i < activeIndex) fill.style.width = '100%';
        bar.appendChild(fill);
        container.appendChild(bar);
    }
}

function startProgress(index, duration, type = 'image', isResume = false) {
    const fill = document.getElementById(`progress-fill-${index}`);
    if (!fill) return;
    
    if(!isResume) currentStartTime = Date.now();
    let startTime = isResume ? Date.now() - (pauseTime - currentStartTime) : currentStartTime;
    
    progressInterval = setInterval(() => {
        let elapsedTime = Date.now() - startTime;
        let percentage = (elapsedTime / duration) * 100;
        if (percentage >= 100) {
            percentage = 100;
            clearInterval(progressInterval);
        }
        fill.style.width = `${percentage}%`;
    }, 16);

    // শুধুমাত্র ছবি বা টেক্সটের ক্ষেত্রে টাইমার কাজ করবে, ভিডিওর ক্ষেত্রে onended কাজ করবে
    if (type !== 'video') {
        storyTimer = setTimeout(() => {
            window.nextStory();
        }, duration);
    }
}

// Next Story Logic
window.nextStory = () => {
    let user = storyUsers[currentUserIndex];
    if (currentSubStoryIndex < user.stories.length - 1) {
        currentSubStoryIndex++;
        playStory();
    } else {
        if (currentUserIndex < storyUsers.length - 1) {
            currentUserIndex++;
            currentSubStoryIndex = 0;
            playStory();
        } else {
            window.closeStoryViewer();
        }
    }
};

// Prev Story Logic
window.prevStory = () => {
    if (currentSubStoryIndex > 0) {
        currentSubStoryIndex--;
        playStory();
    } else {
        if (currentUserIndex > 0) {
            currentUserIndex--;
            currentSubStoryIndex = storyUsers[currentUserIndex].stories.length - 1;
            playStory();
        } else {
            currentSubStoryIndex = 0;
            playStory();
        }
    }
};