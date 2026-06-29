import {
    ref,
    set,
    onValue,
    remove,
    query,
    orderByChild,
    startAt,
    limitToLast,
    push 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// গ্লোবাল ভেরিয়েবল
let storyUsers = []; 
let currentUserIndex = 0; 
let currentSubStoryIndex = 0; 
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

// স্টোরি সাবমিট করা
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
            if (file.size > 10 * 1024 * 1024) {
                throw new Error("ফাইল ১০ এমবির বেশি হতে পারবে না");
            }

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

            document.getElementById('upload-progress-container').style.display = 'block';
            document.getElementById('upload-status-text').classList.remove('hidden');
            let progress = 0;
            const progressEl = document.getElementById('upload-progress-bar');
            const textEl = document.getElementById('upload-status-text');
            
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
        document.getElementById('upload-progress-container').style.display = 'none';
        document.getElementById('upload-status-text').classList.add('hidden');
    }
};

// নিজের স্টোরি ডিলিট করা
window.deleteMyStory = async (storyId, timestamp) => {
    if (confirm("আপনি কি এই স্টোরিটি ডিলিট করতে চান?")) {
        try {
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

// ফিডে কার্ড রেন্ডার করা
const renderStoryFeed = (usersData) => {
    const container = document.getElementById('notes-list-container');
    if (!container) return;

    let safeUser = window.userDetails || {};
    let myProfilePic = safeUser.profile_pic || 'https://via.placeholder.com/150';
    let myBg = safeUser.cover_pic || myProfilePic; 

    let html = `
    <div onclick="toggleNoteModal(true)" class="story-card group min-w-[100px] flex-shrink-0 relative rounded-xl overflow-hidden cursor-pointer shadow-sm border border-gray-200">
        <img src="${myBg}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
        <div class="story-add-btn absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
            <i class="fa-solid fa-plus text-xs"></i>
        </div>
        <p class="story-name text-center text-xs font-medium bg-white w-full absolute bottom-0 py-1">Add Story</p>
    </div>`;

    usersData.forEach((user, index) => {
        let av = user.authorPic || 'https://via.placeholder.com/150';
        let latestStory = user.stories[user.stories.length - 1];
        
        // ⭐️ ক্লাউডিনারি ভিডিও লিংকের এক্সটেনশন .jpg করে দিলে অটোমেটিক থাম্বনেইল তৈরি হয়
        let bgImg = av;
        let videoIcon = '';
        
        if (latestStory.mediaUrl) {
            // ক্লাউডিনারি লিংকে ট্রান্সফর্মেশন যুক্ত করে ছোট ছবি কল করা হচ্ছে (Data Optimization)
            let optimizedUrl = latestStory.mediaUrl;
            if (optimizedUrl.includes('/upload/')) {
                optimizedUrl = optimizedUrl.replace('/upload/', '/upload/w_300,h_400,c_fill,q_auto,f_auto/');
            }

            if (latestStory.mediaType === 'image') {
                bgImg = optimizedUrl;
            } else if (latestStory.mediaType === 'video') {
                bgImg = optimizedUrl.replace(/\.[^/.]+$/, ".jpg"); 
                videoIcon = '<i class="fa-solid fa-play absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-2xl drop-shadow-lg opacity-80"></i>';
            }
        }
        
        let isMe = window.currentUser && user.uid === window.currentUser.uid;
        let borderClass = isMe ? 'border-blue-500' : 'border-blue-400';

        html += `
        <div onclick="openStoryViewer(${index})" class="story-card min-w-[100px] flex-shrink-0 relative rounded-xl overflow-hidden cursor-pointer shadow-sm border-2 ${borderClass}">
            <img src="${bgImg}" class="w-full h-full object-cover">
            ${videoIcon}
            <img src="${av}" class="story-avatar absolute top-2 left-2 w-8 h-8 rounded-full border-2 border-white object-cover">
            <p class="story-name absolute bottom-1 left-2 text-white text-xs font-bold shadow-black drop-shadow-md truncate w-11/12">${isMe ? 'Your Story' : window.escapeHTML(user.author).split(' ')[0]}</p>
        </div>`;
    });

    // স্ক্রোল পজিশন ঠিক রাখার লজিক
    const currentScroll = container.scrollLeft; 
    container.innerHTML = html;
    container.scrollLeft = currentScroll; 
};

// স্টোরি লোড
window.loadNotes = () => {
    const cachedStories = localStorage.getItem('cachedStoryUsers');
    if (cachedStories) {
        try {
            storyUsers = JSON.parse(cachedStories);
            renderStoryFeed(storyUsers);
        } catch(e) { console.error("Cache parse error", e); }
    }

    const ONE_DAY = 24 * 60 * 60 * 1000;
    const yesterday = Date.now() - ONE_DAY;
    // শুধুমাত্র গত ২৪ ঘন্টার এবং লেটেস্ট ১০০টি স্টোরি ফেচ করবে (ব্যান্ডউইথ বাঁচানোর জন্য)
    const recentStoriesQuery = query(ref(window.db, 'stories'), orderByChild('timestamp'), startAt(yesterday), limitToLast(100));

    onValue(recentStoriesQuery, (snap) => {
        const storiesData = snap.val() || {};
        const now = Date.now();
        const validStories = [];

        for (const key in storiesData) {
            const story = storiesData[key];
            if (!story.storyId) story.storyId = key; 

            // ক্লায়েন্ট থেকে কোনো ডিলিট অপারেশন হবে না! 
            // শুধুমাত্র ২৪ ঘন্টার কম বয়সী স্টোরিগুলো অ্যাপে দেখাবে।
            if (now - story.timestamp <= ONE_DAY) {
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

        const newDataString = JSON.stringify(sortedUsers);
        if (newDataString !== localStorage.getItem('cachedStoryUsers')) {
            storyUsers = sortedUsers;
            try {
                localStorage.setItem('cachedStoryUsers', newDataString); 
            } catch(e) {
                // স্টোরেজ ফুল হয়ে গেলে পুরনো ক্যাশ ক্লিয়ার করে দিবে, অ্যাপ ক্র্যাশ করবে না
                localStorage.removeItem('cachedStoryUsers');
            }
            renderStoryFeed(storyUsers); 
            
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

// স্টোরি ভিউয়ার ওপেন 
window.openStoryViewer = (userIndex, subIndex = 0) => {
    if (!storyUsers || storyUsers.length === 0) return;
    currentUserIndex = userIndex;
    currentSubStoryIndex = subIndex;
    
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
    
    if (!fromBackButton && window.location.hash === '#story') {
        history.back();
    }
};

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
    
    const avatarDiv = document.getElementById('story-viewer-avatar');
    if (user.authorPic) {
        avatarDiv.innerHTML = `<img src="${user.authorPic}" class="w-full h-full object-cover">`;
    } else {
        avatarDiv.innerHTML = `<div class="w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold">${user.author.charAt(0)}</div>`;
    }
    
    document.getElementById('story-viewer-name').innerText = user.uid === window.currentUser?.uid ? 'Your Story' : user.author;
    document.getElementById('story-viewer-time').innerText = window.timeAgo(story.timestamp);
    document.getElementById('story-viewer-caption').innerText = story.text || "";

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
            startProgress(currentSubStoryIndex, duration, 'video');
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

    mediaContainer.onmousedown = mediaContainer.ontouchstart = () => pauseStory(currentSubStoryIndex);
    mediaContainer.onmouseup = mediaContainer.ontouchend = () => resumeStory(currentSubStoryIndex, duration, story.mediaType);
}

let timePassed = 0;
let storyStartTime = 0;

// 🔴 ফিক্স করা অংশ 🔴
function pauseStory(index) {
    clearTimeout(storyTimer);
    clearInterval(progressInterval);
    timePassed += Date.now() - storyStartTime; // কতক্ষণ চলেছে তা সেভ রাখা হলো
    
    const mediaContainer = document.getElementById('story-media-container');
    const video = mediaContainer.querySelector('video');
    if(video) video.pause();
    
    const topBar = document.querySelector('.absolute.top-4');
    if (topBar) topBar.style.opacity = '0';
    
    const replyInput = document.getElementById('story-reply-input');
    if (replyInput && replyInput.parentElement && replyInput.parentElement.parentElement) {
        replyInput.parentElement.parentElement.style.opacity = '0';
    }
}

// 🔴 ফিক্স করা অংশ 🔴
function resumeStory(index, totalDuration, type) {
    const mediaContainer = document.getElementById('story-media-container');
    const video = mediaContainer.querySelector('video');
    if(video) video.play();

    const topBar = document.querySelector('.absolute.top-4');
    if (topBar) topBar.style.opacity = '1';
    
    const replyInput = document.getElementById('story-reply-input');
    if (replyInput && replyInput.parentElement && replyInput.parentElement.parentElement) {
        replyInput.parentElement.parentElement.style.opacity = '1';
    }

    startProgress(index, totalDuration, type, true); 
}

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

window.sendReaction = async (emoji) => {
    const user = storyUsers[currentUserIndex];
    const story = user.stories[currentSubStoryIndex];
    if (!story) return;

    const modal = document.getElementById('story-viewer-modal');
    for(let i=0; i<7; i++) {
        const floatEl = document.createElement('div');
        floatEl.innerText = emoji;
        floatEl.className = `reaction-bubble text-3xl md:text-4xl`;
        
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

window.sendStoryReply = async () => {
    const input = document.getElementById('story-reply-input');
    const msg = input.value.trim();
    if (!msg) return;

    const user = storyUsers[currentUserIndex];
    const story = user.stories[currentSubStoryIndex];
    
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
            storyRefUrl: story.mediaUrl, 
            storyText: story.text,
            timestamp: Date.now(),
            type: "story_reply"
        };

        const newMsgRef = push(ref(window.db, `messages/${window.currentUser.uid}_${story.uid}`));
        await set(newMsgRef, replyData);
        
        window.showToast("রিপ্লাই পাঠানো হয়েছে!", "success");
        input.value = "";
        window.closeStoryViewer(); 
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
    
    if (!isResume) timePassed = 0; // নতুন স্টোরি শুরু হলে সময় রিসেট হবে
    storyStartTime = Date.now(); // টাইমার আবার শুরু হবে
    
    progressInterval = setInterval(() => {
        let elapsedTime = timePassed + (Date.now() - storyStartTime);
        let percentage = (elapsedTime / duration) * 100;
        if (percentage >= 100) {
            percentage = 100;
            clearInterval(progressInterval);
        }
        fill.style.width = `${percentage}%`;
    }, 16);

    if (type !== 'video') {
        let remainingTime = duration - timePassed; // রিজিউম করলে শুধু বাকি সময়টুকু চলবে
        storyTimer = setTimeout(() => {
            window.nextStory();
        }, remainingTime);
    }
}

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

setTimeout(() => {
    if (window.currentUser && typeof window.loadNotes === 'function') {
        window.loadNotes();
    }
}, 500);