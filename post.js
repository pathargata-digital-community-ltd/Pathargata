import { ref, push, set, get, update, remove, query, limitToLast, runTransaction, startAt, endAt, orderByChild, orderByKey, limitToFirst, onChildAdded } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const getDb = () => window.db;

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let recordingTimerInterval;
let recordingSeconds = 0;

window.calculatePostScore = function(post) {
    const now = Date.now();
    const hoursAge = (now - post.timestamp) / (1000 * 60 * 60);
    const likeCount = post.likes ? Object.keys(post.likes).length : 0;
    const commentCount = post.comments ? Object.keys(post.comments).length : 0;
    let points = (likeCount * 5) + (commentCount * 15); 

    if (window.myFriends && window.myFriends.includes(post.uid)) points += 30; 
    if (window.userDetails && window.userDetails.village && post.village === window.userDetails.village) {
        points += 20; 
    } else if (window.userDetails && window.userDetails.union && post.union === window.userDetails.union) {
        points += 10; 
    }
    if (['admin', 'journalist'].includes(post.authorRole)) points += 40;
    if (post.adminScore) points += parseInt(post.adminScore);

    const randomBoost = Math.floor(Math.random() * 15);
    points += randomBoost;
    const score = (points + 1) / Math.pow((hoursAge + 1.5), 1.5);
    return score;
}

window.toggleVoiceRecorder = () => {
    const area = document.getElementById('voice-record-area');
    if (area.classList.contains('hidden')) {
        area.classList.remove('hidden');
        document.getElementById('color-picker-wrapper').style.display = 'none';
    } else {
        if (!audioBlob) {
            area.classList.add('hidden');
            if(!window.selectedImages || window.selectedImages.length === 0) {
                document.getElementById('color-picker-wrapper').style.display = 'block';
            }
        } else {
            window.showToast("রেকর্ডিং মুছতে চাইলে ট্র্যাশ আইকনে ক্লিক করুন", "warning");
        }
    }
}
window.startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return window.showToast("আপনার ডিভাইসে অডিও রেকর্ড সাপোর্ট করছে না।", "error");
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = event => { if (event.data.size > 0) audioChunks.push(event.data); };
        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPreview = document.getElementById('audio-preview');
            if (audioPreview) audioPreview.src = audioUrl;
            document.getElementById('audio-preview-container').classList.remove('hidden');
            document.getElementById('btn-record-start').classList.remove('hidden');
            document.getElementById('btn-record-stop').classList.add('hidden');
            document.getElementById('record-status-dot')?.classList.add('hidden');
            // Stop UI Animations
            document.getElementById('css-waveform')?.classList.remove('recording-active');
            document.getElementById('css-waveform')?.classList.replace('opacity-100', 'opacity-30');
            document.getElementById('recording-pulse-bg')?.classList.remove('opacity-100');
        };
        mediaRecorder.start();
        document.getElementById('btn-record-start').classList.add('hidden');
        document.getElementById('btn-record-stop').classList.remove('hidden');
        document.getElementById('record-status-dot')?.classList.remove('hidden');
        document.getElementById('audio-preview-container').classList.add('hidden');
        // Start UI Animations
        document.getElementById('css-waveform')?.classList.add('recording-active');
        document.getElementById('css-waveform')?.classList.replace('opacity-30', 'opacity-100');
        document.getElementById('recording-pulse-bg')?.classList.add('opacity-100');

        recordingSeconds = 0;
        const timerElem = document.getElementById('record-timer');
        if (timerElem) timerElem.innerText = "00:00";
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = setInterval(() => {
            recordingSeconds++;
            const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
            const secs = (recordingSeconds % 60).toString().padStart(2, '0');
            if (timerElem) timerElem.innerText = `${mins}:${secs}`;
        }, 1000);
    } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            alert("অ্যাপের পারমিশন ব্লক করা আছে। দয়া করে ফোনের Settings > Apps > [App Name] > Permissions -এ গিয়ে Microphone 'Allow' করে দিন।");
        } else {
            window.showToast("মাইক্রোফোন চালু করা যায়নি: " + err.message, "error");
        }
    }
};
window.stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        clearInterval(recordingTimerInterval);
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
};
window.cancelRecording = () => {
    audioBlob = null;
    audioChunks = [];
    const preview = document.getElementById('audio-preview');
    if(preview) preview.src = "";
    document.getElementById('audio-preview-container')?.classList.add('hidden');
    document.getElementById('record-status-dot')?.classList.add('hidden');
    document.getElementById('btn-record-start')?.classList.remove('hidden');
    document.getElementById('btn-record-stop')?.classList.add('hidden');
    
    // Reset timer & animations
    const timerElem = document.getElementById('record-timer');
    if (timerElem) timerElem.innerText = "00:00";
    document.getElementById('css-waveform')?.classList.remove('recording-active');
    document.getElementById('css-waveform')?.classList.replace('opacity-100', 'opacity-30');
    document.getElementById('recording-pulse-bg')?.classList.remove('opacity-100');
    
    clearInterval(recordingTimerInterval);
    
    // Bring back color picker if no images are selected
    if(!window.selectedImages || window.selectedImages.length === 0) {
        document.getElementById('color-picker-wrapper').style.display = 'block';
    }
};

window.resetPostForm = () => {
    document.getElementById('post-text').value = "";
    document.getElementById('selected-post-color').value = "";
    const ta = document.getElementById('post-text');
    ta.style.background = 'transparent';
    ta.style.color = 'black';
    ta.style.fontWeight = 'normal';
    ta.style.textAlign = 'left';
    ta.style.fontSize = '18px';
    ta.style.paddingTop = '0px';
    
    document.querySelectorAll('.post-color-dot').forEach((el, index) => {
        if(index === 0) {
            el.classList.add('selected', 'border-gray-800');
            el.classList.remove('border-transparent');
        } else {
            el.classList.remove('selected', 'border-gray-800');
            el.classList.add('border-transparent');
        }
    });

    document.getElementById('color-picker-wrapper').style.display = 'block';

    document.getElementById('post-image-file').value = "";
    document.getElementById('image-preview-area').classList.add('hidden');
    document.getElementById('preview-grid').innerHTML = "";
    window.selectedImages = [];
    window.cancelRecording();
    document.getElementById('voice-record-area').classList.add('hidden');

    window.taggedUsers = [];
    window.selectedFeeling = null;
    window.selectedLocation = null;
    if(typeof window.updatePostHeaderUI === 'function') window.updatePostHeaderUI(); 
    document.getElementById('post-mobile').value = "";
    document.getElementById('post-social-link').value = "";
    document.getElementById('post-privacy').value = "public";
    document.getElementById('post-ephemeral').checked = false; // Reset 24-hour checkbox
};

window.submitPost = async () => {
    const text = document.getElementById('post-text').value.trim();
    const files = window.selectedImages || [];
    const bgColor = document.getElementById('selected-post-color').value;
    const privacy = document.getElementById('post-privacy').value;
    const mobile = document.getElementById('post-mobile').value.trim();
    const socialLink = document.getElementById('post-social-link').value.trim();
    const isEphemeral = document.getElementById('post-ephemeral').checked; // 24-hour check

    if (!text && files.length === 0 && !window.selectedFeeling && !audioBlob) {
        return window.showToast("কিছু লিখুন অথবা রেকর্ড করুন!", 'error');
    }

    const btn = document.getElementById('btn-post-submit');
    const originalBtnText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> আপলোড হচ্ছে...';
    btn.disabled = true;

    try {
        let mediaUrls = [];
        let voiceUrl = null;
        let postType = 'text';

        if (files.length > 0) {
            const uploadPromises = files.map(file => window.uploadMediaToCloudinary(file));
            const results = await Promise.all(uploadPromises);
            mediaUrls = results.map(res => res.url);
        }

        if (audioBlob) {
            const audioFile = new File([audioBlob], "voice_record.mp3", { type: 'audio/mp3' });
            const res = await window.uploadMediaToCloudinary(audioFile);
            voiceUrl = res.url;
            postType = 'voice';
        }

        const newPostData = {
            uid: window.currentUser.uid,
            author: window.userDetails.name || "Unknown",
            authorPic: window.userDetails.profile_pic || null,
            content: text,
            images: mediaUrls,
            expiresAt: isEphemeral ? Date.now() + (24 * 60 * 60 * 1000) : null, // 24 hours from now
            image: mediaUrls[0] || "",
            audio: voiceUrl,
            type: postType,
            timestamp: Date.now(),
            likes: {},
            comments: {},
            repostCount: 0,
            bgColor: bgColor,
            privacy: privacy,
            union: window.userDetails.union || '',
            village: window.userDetails.village || '',
            authorRole: window.userDetails.role || 'user',
            authorVerified: !!(window.userDetails.isVerified),
            mobile: mobile || null,
            socialLink: socialLink || null,
            adminScore: 0,
            taggedFriends: window.taggedUsers || null,
            feeling: window.selectedFeeling || null,
            checkInLocation: window.selectedLocation || null
        };

        await push(ref(getDb(), 'posts'), newPostData);
        if(window.awardPoints) await window.awardPoints('post');

        window.resetPostForm();
        window.togglePostModal(false);
        if(window.playSound) window.playSound('send');
        window.showToast("পোস্ট করা হয়েছে!", "success");

        if (privacy !== 'only_me' && window.notifyFriends) window.notifyFriends(newPostData.uid, window.userDetails.name);
        if(window.loadFeed) window.loadFeed(window.currentFeedFilter, true);

    } catch (error) {
        console.error(error);
        window.showToast("সমস্যা হয়েছে: " + error.message, 'error');
    } finally {
        btn.innerHTML = originalBtnText;
        btn.disabled = false;
    }
};

window.repost = (postId) => {
    const card = document.getElementById(`post-card-${postId}`);
    const textElem = card.querySelector('.post-text-content') || card.querySelector('h4');
    const text = textElem ? textElem.innerText : "";
    runTransaction(ref(getDb(), `posts/${postId}/repostCount`), (c) => (c || 0) + 1);
    window.togglePostModal(true);
    document.getElementById('post-text').value = `[রিপোস্ট] ${text}\n\n`;
};

window.toggleLike = (postId) => {
    const icons = document.querySelectorAll(`[id^="like-icon-${postId}"]`),
          countSpans = document.querySelectorAll(`[id^="like-cnt-${postId}"]`);
    if (icons.length === 0) return;
    
    const isLiked = icons[0].classList.contains('fa-solid');
    let newCount = parseInt(countSpans[0].innerText) + (isLiked ? -1 : 1);
    
    icons.forEach(i => {
        i.classList[isLiked ? 'remove' : 'add']('fa-solid', 'text-green-600');
        i.classList[isLiked ? 'add' : 'remove']('fa-regular');
        if (!isLiked) {
            i.classList.remove('small-like-animate');
            void i.offsetWidth;
            i.classList.add('small-like-animate');
            if (navigator.vibrate) navigator.vibrate(40);
            if(window.playSound) window.playSound('like');
        }
    });
    
    countSpans.forEach(s => s.innerText = Math.max(0, newCount));
    
    const likeRef = ref(getDb(), `posts/${postId}/likes/${window.currentUser.uid}`);
    get(likeRef).then((snap) => {
        if (snap.exists()) set(likeRef, null);
        else {
            set(likeRef, true);
            if(window.awardPoints) window.awardPoints('like');
            get(ref(getDb(), `posts/${postId}`)).then(postSnap => {
                const post = postSnap.val();
                if (post && post.uid !== window.currentUser.uid) push(ref(getDb(), `notifications/${post.uid}`), {
                    type: 'like',
                    fromUid: window.currentUser.uid,
                    fromName: window.userDetails.name,
                    postId: postId,
                    timestamp: Date.now(),
                    read: false
                });
            });
        }
    });
};

window.filterFeed = (type) => {
    window.currentFeedFilter = type;
    
    ['all', 'union', 'village', 'contest', 'fifa'].forEach(t => {
        const el = document.getElementById(`tab-feed-${t}`);
        if(el) {
            if (t === 'contest') {
                el.classList.toggle('border-b-2', type === t);
                el.classList.toggle('border-purple-500', type === t);
            } else if (t === 'fifa') {
                el.classList.toggle('border-b-2', type === t);
                el.classList.toggle('border-green-600', type === t);
            } else {
                el.classList.toggle('active', type === t);
            }
        }
    });

    const regularFeedWrapper = document.getElementById('regular-feed-section');
    const contestContainer = document.getElementById('contest-ui-container');
    const fifaContainer = document.getElementById('fifa-ui-container');

    if (!regularFeedWrapper || !contestContainer || !fifaContainer) return;

    if (type === 'contest') {
        regularFeedWrapper.classList.add('hidden-custom');
        fifaContainer.classList.add('hidden-custom');
        contestContainer.classList.remove('hidden-custom');
        if (typeof window.loadContestFeed === 'function') window.loadContestFeed(); 
    } else if (type === 'fifa') {
        regularFeedWrapper.classList.add('hidden-custom');
        contestContainer.classList.add('hidden-custom');
        fifaContainer.classList.remove('hidden-custom');
        if (typeof window.loadFifaApiData === 'function') window.loadFifaApiData();
    } else {
        contestContainer.classList.add('hidden-custom');
        fifaContainer.classList.add('hidden-custom');
        regularFeedWrapper.classList.remove('hidden-custom');
        if(window.loadFeed) window.loadFeed(type, true); 
    }
}

window.loadFeed = (type, isInitial = false) => {
    if (window.isFeedLoading) return;
    window.isFeedLoading = true;

    const feedDiv = document.getElementById('news-feed');
    const loaderArea = document.getElementById('feed-loader-area');
    const btnLoadMore = document.getElementById('btn-load-more');
    const spinner = document.getElementById('loader-spinner');

    if(loaderArea) loaderArea.classList.remove('hidden');
    if(spinner) spinner.classList.remove('hidden');
    if(btnLoadMore) btnLoadMore.classList.add('hidden');

    if (isInitial) {
        window.lastLoadedPostKey = null;
        window.hasMorePosts = true;
        
        const cachedData = localStorage.getItem(`feed_cache_${type}`);
        if (cachedData) {
            try {
                const cachedPosts = JSON.parse(cachedData);
                let cacheHtml = '';
                cachedPosts.forEach((post, index) => {
                    if(window.createPostHTML) cacheHtml += window.createPostHTML(post, post.id);
                    if ((index + 1) % 5 === 0 && window.allAds && window.allAds.length > 0) {
                        const adIndex = Math.floor((index + 1) / 5) % window.allAds.length;
                        if(window.createAdHTML) cacheHtml += window.createAdHTML(window.allAds[adIndex]);
                    }
                });
                if(feedDiv) feedDiv.innerHTML = cacheHtml;
            } catch (e) {
                if(feedDiv) feedDiv.innerHTML = '<div class="flex flex-col gap-3 p-4"><div class="h-40 w-full skeleton"></div><div class="h-40 w-full skeleton"></div></div>';
            }
        } else {
            if(feedDiv) feedDiv.innerHTML = '<div class="flex flex-col gap-3 p-4"><div class="h-40 w-full skeleton"></div><div class="h-40 w-full skeleton"></div></div>';
        }
    }

    const pageSize = 15;
    let postsQuery;

    if (type === 'union' && window.userDetails && window.userDetails.union) {
        if (isInitial) postsQuery = query(ref(getDb(), 'posts'), orderByChild('union'), equalTo(window.userDetails.union), limitToLast(pageSize));
        else { window.hasMorePosts = false; postsQuery = null; }
    } else if (type === 'village' && window.userDetails && window.userDetails.village) {
        if (isInitial) postsQuery = query(ref(getDb(), 'posts'), orderByChild('village'), equalTo(window.userDetails.village), limitToLast(pageSize));
        else { window.hasMorePosts = false; postsQuery = null; }
    } else {
        if (isInitial) postsQuery = query(ref(getDb(), 'posts'), orderByKey(), limitToLast(pageSize));
        else postsQuery = query(ref(getDb(), 'posts'), orderByKey(), endAt(window.lastLoadedPostKey), limitToLast(pageSize + 1));
    }

    if (!postsQuery && !isInitial) {
        window.isFeedLoading = false;
        if(loaderArea) loaderArea.classList.add('hidden');
        return;
    }

    get(postsQuery).then((snapshot) => {
        const data = snapshot.val();
        if (isInitial && feedDiv) feedDiv.innerHTML = '';

        if (!data) {
            if (isInitial && feedDiv) feedDiv.innerHTML = '<div class="p-10 text-center text-gray-400">কোনো পোস্ট নেই</div>';
            window.hasMorePosts = false;
            if(loaderArea) loaderArea.classList.add('hidden');
        } else {
            let postsArr = [];
            Object.entries(data).forEach(([key, val]) => {
                // চেক: পোস্টের মেয়াদ শেষ হয়েছে কিনা?
                if (val.expiresAt && val.expiresAt < Date.now()) {
                    // ডিলিট না করে শুধু স্কিপ করে যাবো (অ্যাপে দেখাবে না, কিন্তু ডাটাবেসে থাকবে)
                    return; 
                } else {
                    postsArr.push({ id: key, ...val });
                }
            });

            postsArr.sort((a, b) => {
                if (a.id < b.id) return -1;
                if (a.id > b.id) return 1;
                return 0;
            });

            if (!isInitial) postsArr = postsArr.filter(p => p.id !== window.lastLoadedPostKey);

            if (postsArr.length === 0) window.hasMorePosts = false;
            else {
                window.lastLoadedPostKey = postsArr[0].id;
                if (postsArr.length < pageSize && !isInitial) window.hasMorePosts = false;
            }

            postsArr.forEach(post => post.algorithmicScore = window.calculatePostScore(post));
            const authorPostCount = {};
            postsArr.sort((a, b) => b.algorithmicScore - a.algorithmicScore);
            postsArr.forEach(post => {
                if (!authorPostCount[post.uid]) authorPostCount[post.uid] = 1;
                else {
                    authorPostCount[post.uid]++;
                    const penaltyFactor = Math.pow(0.5, authorPostCount[post.uid] - 1);
                    post.algorithmicScore = post.algorithmicScore * penaltyFactor;
                }
            });
            postsArr.sort((a, b) => b.algorithmicScore - a.algorithmicScore);
            
            if (isInitial && postsArr.length > 0) {
                localStorage.setItem(`feed_cache_${type}`, JSON.stringify(postsArr.slice(0, 15)));
                if(feedDiv) feedDiv.innerHTML = '';
            }

            let finalHtml = '';
            postsArr.forEach((post, index) => {
                if(window.createPostHTML) finalHtml += window.createPostHTML(post, post.id);

                if ((index + 1) % 5 === 0 && window.allAds && window.allAds.length > 0) {
                    const adIndex = Math.floor((index + 1) / 5) % window.allAds.length;
                    if(window.createAdHTML) finalHtml += window.createAdHTML(window.allAds[adIndex]);
                }

                if ((index + 1) % 7 === 0 && window.suggestionPool && window.suggestionPool.length > 0) {
                    const suggestedUsers = window.suggestionPool.slice(0, 3);
                    let suggHtml = `<div class="bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-3 max-w-lg mx-auto"><h4 class="font-bold text-gray-800 text-sm mb-3">আপনার পরিচিত হতে পারে</h4><div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">`;
                    suggestedUsers.forEach(u => {
                        let av = u.profile_pic ? `<img src="${u.profile_pic}" loading="lazy" class="w-16 h-16 rounded-full object-cover border border-gray-200 mx-auto mb-2">` : `<div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-2xl mx-auto mb-2 border border-blue-100">${window.escapeHTML(u.name).charAt(0)}</div>`;
                        suggHtml += `<div class="border rounded-xl p-3 min-w-[120px] text-center shrink-0">${av}<h5 class="font-bold text-gray-800 text-xs truncate">${window.escapeHTML(u.name).split(' ')[0]}</h5><p class="text-[10px] text-gray-500 truncate mb-2">${window.escapeHTML(u.village || u.union || 'পাথরঘাটা')}</p><button id="btn-feed-req-${u.uid}" onclick="window.sendSuggestionRequest('${u.uid}'); this.innerHTML='Sent'; this.disabled=true; this.classList.replace('bg-blue-600', 'bg-gray-200'); this.classList.replace('text-white', 'text-gray-600');" class="w-full bg-blue-600 text-white text-[10px] font-bold py-1.5 rounded-lg">Add Friend</button></div>`;
                    });
                    suggHtml += `</div></div>`;
                    finalHtml += suggHtml;
                }
            });

            if(feedDiv) feedDiv.insertAdjacentHTML('beforeend', finalHtml);

            if (window.hasMorePosts) {
                if(spinner) spinner.classList.add('hidden');
                if(btnLoadMore) btnLoadMore.classList.remove('hidden');
            } else {
                if(loaderArea) loaderArea.classList.add('hidden');
            }
        }
        window.isFeedLoading = false;
    }).catch(err => {
        window.isFeedLoading = false;
        if(spinner) spinner.classList.add('hidden');
        if(btnLoadMore) btnLoadMore.classList.remove('hidden');
    });
}

window.loadMorePosts = () => {
    if (!window.isFeedLoading && window.hasMorePosts) {
        document.getElementById('btn-load-more')?.classList.add('hidden');
        document.getElementById('loader-spinner')?.classList.remove('hidden');
        window.loadFeed(window.currentFeedFilter, false);
    }
};

window.setupInfiniteScroll = () => {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && window.hasMorePosts && !window.isFeedLoading) {
            window.loadMorePosts();
        }
    }, { rootMargin: "100px" });
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) observer.observe(sentinel);
};

window.selectPostColor = (color, element) => {
    const ta = document.getElementById('post-text');
    if (ta) {
        document.getElementById('selected-post-color').value = color;
        
        document.querySelectorAll('.post-color-dot').forEach(el => {
            el.classList.remove('selected', 'border-gray-800');
            el.classList.add('border-transparent');
        });
        
        if (element) {
            element.classList.add('selected', 'border-gray-800');
            element.classList.remove('border-transparent');
        }

        ta.style.background = color;
        ta.style.color = color ? 'white' : 'black';
        ta.style.fontWeight = color ? 'bold' : 'normal';
        ta.style.textAlign = color ? 'center' : 'left';
        ta.style.fontSize = color ? '24px' : '18px'; 
        ta.style.paddingTop = color ? '50px' : '0px'; 
    }
};

window.previewPostImage = (input) => {
    const previewGrid = document.getElementById('preview-grid');
    const imgArea = document.getElementById('image-preview-area');
    
    const defaultDot = document.querySelector('.post-color-dot');
    window.selectPostColor('', defaultDot);
    
    document.getElementById('color-picker-wrapper').style.display = 'none';

    if (input.files && input.files.length > 0) {
        window.selectedImages = Array.from(input.files).slice(0, 4); // লিমিট ৪ করা হলো
        const count = window.selectedImages.length;
        if(previewGrid) {
            // ছবির সংখ্যার উপর ভিত্তি করে গ্রিড ডিজাইন
            let gridClass = count === 1 ? 'grid grid-cols-1' : (count === 3 ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-2 gap-1 h-64');
            if(count === 4) gridClass = 'grid grid-cols-2 gap-1 h-64';
            previewGrid.className = `w-full rounded-lg overflow-hidden ${gridClass}`;
            previewGrid.innerHTML = '';
            
            // সিরিয়াল ঠিক রাখার জন্য Promise ব্যবহার করা হলো
            Promise.all(window.selectedImages.map(file => {
                return new Promise(resolve => {
                    const r = new FileReader();
                    r.onload = e => resolve(e.target.result);
                    r.readAsDataURL(file);
                });
            })).then(urls => {
                urls.forEach((url, index) => {
                    let imgClass = 'w-full h-full object-cover';
                    if (count === 3 && index === 0) imgClass += ' col-span-2 h-40'; // ৩টি ছবির ক্ষেত্রে প্রথমটি বড় হবে
                    previewGrid.innerHTML += `<img src="${url}" class="${imgClass}">`;
                });
            });
        }
        if(imgArea) imgArea.classList.remove('hidden');
    }
}

window.removePostImage = () => {
    document.getElementById('post-image-file').value = "";
    document.getElementById('image-preview-area')?.classList.add('hidden');
    const pg = document.getElementById('preview-grid');
    if(pg) pg.innerHTML = "";
    window.selectedImages = [];
    document.getElementById('color-picker-wrapper').style.display = 'block';
}

window.submitPoll = () => {
    const q = document.getElementById('poll-question').value.trim(), o1 = document.getElementById('poll-opt-1').value.trim(), o2 = document.getElementById('poll-opt-2').value.trim();
    if (!q || !o1 || !o2) return window.showToast("প্রশ্ন এবং অন্তত দুটি অপশন দিন", 'error');
    const options = [{ text: o1, votes: 0 }, { text: o2, votes: 0 }, document.getElementById('poll-opt-3').value.trim() ? { text: document.getElementById('poll-opt-3').value.trim(), votes: 0 } : null, document.getElementById('poll-opt-4').value.trim() ? { text: document.getElementById('poll-opt-4').value.trim(), votes: 0 } : null].filter(Boolean);
    push(ref(getDb(), 'posts'), {
        uid: window.currentUser.uid,
        author: window.userDetails.name,
        authorPic: window.userDetails.profile_pic || null,
        content: q, type: 'poll', options, timestamp: Date.now(), likes: {}, comments: {}, repostCount: 0, privacy: 'public',
        union: window.userDetails.union || '', village: window.userDetails.village || '', authorRole: window.userDetails.role || 'user', authorVerified: !!(window.userDetails.isVerified)
    }).then(() => {
        document.getElementById('poll-question').value = "";
        document.getElementById('poll-opt-1').value = "";
        document.getElementById('poll-opt-2').value = "";
        window.togglePollModal(false);
        window.showToast("পোল তৈরি হয়েছে!");
    });
};

window.votePoll = (postId, optionIdx) => {
    const voteRef = ref(getDb(), `posts/${postId}/voters/${window.currentUser.uid}`);
    get(voteRef).then(snap => {
        if (snap.exists()) return window.showToast("ইতিমধ্যে ভোট দিয়েছেন", 'error');
        runTransaction(ref(getDb(), `posts/${postId}/options/${optionIdx}/votes`), (v) => (v || 0) + 1).then(() => {
            set(voteRef, optionIdx);
            window.showToast("ভোট দেওয়া হয়েছে!");
        });
    });
};

window.toggleReadMore = (id) => {
    const m = document.getElementById(`more-${id}`), b = event.target;
    if(m) {
        m.classList.toggle('hidden');
        b.innerText = m.classList.contains('hidden') ? 'আরো পড়ুন' : 'আড়াল করুন';
    }
};

window.openEditPostModal = (postId) => {
    document.getElementById('edit-post-id').value = postId;
    const card = document.querySelector(`#post-card-${postId}`);
    const ta = document.getElementById('edit-post-text');
    if(ta) ta.value = card ? (card.querySelector('.post-text-content')?.innerText || "") : "";
    document.getElementById('edit-post-modal')?.classList.remove('hidden-custom');
};

window.submitEditPost = () => {
    const postId = document.getElementById('edit-post-id').value;
    const newText = document.getElementById('edit-post-text').value;
    update(ref(getDb(), `posts/${postId}`), { content: newText }).then(() => {
        window.showToast("পোস্ট আপডেট হয়েছে");
        document.getElementById('edit-post-modal')?.classList.add('hidden-custom');
        document.querySelectorAll(`#post-card-${postId}`).forEach(card => {
            const textElem = card.querySelector('.post-text-content');
            if (textElem) textElem.innerText = newText;
        });
    });
};

window.togglePostMenu = (event) => {
    event.stopPropagation();
    const btn = event.currentTarget;
    const menu = btn.nextElementSibling; 
    const isHidden = menu.classList.contains('hidden');
    document.querySelectorAll('.post-menu-dropdown').forEach(el => el.classList.add('hidden'));
    if (isHidden) menu.classList.remove('hidden');
};

window.hidePost = (postId) => {
    document.querySelectorAll(`#post-card-${postId}`).forEach(card => card.style.display = 'none');
};

window.deletePost = async (postId) => {
    if (confirm("পোস্ট ডিলিট করবেন?")) {
        const cards = document.querySelectorAll(`#post-card-${postId}`);
        cards.forEach(card => card.style.opacity = '0.5');
        try {
            const snap = await get(ref(getDb(), `posts/${postId}`));
            if (snap.exists()) {
                await set(ref(getDb(), `trash_bin/${postId}`), {
                    type: 'post', data: snap.val(), deletedBy: window.currentUser.uid, timestamp: Date.now()
                });
            }
            await remove(ref(getDb(), `posts/${postId}`));
            cards.forEach(card => card.remove());
            window.showToast("পোস্টটি মুছে ফেলা হয়েছে");
        } catch (e) {
            window.showToast("ডিলিট হয়নি: " + e.message, 'error');
            cards.forEach(card => card.style.opacity = '1');
        }
    }
};

window.copyPostText = (id) => {
    const card = document.querySelector(`#post-card-${id}`);
    const text = card ? card.querySelector('.post-text-content')?.innerText || "" : "";
    if (!text) return window.showToast("কপি করার মতো লেখা নেই", "error");
    navigator.clipboard.writeText(text).then(() => window.showToast("টেক্সট কপি হয়েছে"));
};

window.openImageViewer = (src) => {
    const img = document.getElementById('full-image-view');
    if(img) img.src = src;
    const modal = document.getElementById('image-viewer-modal');
    if(modal) {
        modal.classList.remove('hidden-custom');
        setTimeout(() => modal.classList.add('open'), 10);
    }
}
window.closeImageViewer = () => {
    const modal = document.getElementById('image-viewer-modal');
    if(modal) {
        modal.classList.remove('open');
        setTimeout(() => {
            modal.classList.add('hidden-custom');
            const img = document.getElementById('full-image-view');
            if(img) img.src = '';
        }, 300);
    }
}

// --- POST HTML GENERATOR ---
window.createPostHTML = function(post, id) {
    if (!window.currentUser || !window.userDetails) return ''; // সেফটি চেক
    
    let privacyIcon = '<i class="fa-solid fa-earth-americas text-[10px] text-gray-400"></i>';
    if (post.privacy === 'only_me') {
        if (post.uid !== window.currentUser.uid) return '';
        privacyIcon = '<i class="fa-solid fa-lock text-[10px] text-gray-400"></i>';
    } else if (post.privacy === 'friends' && post.uid !== window.currentUser.uid && window.myFriends && !window.myFriends.includes(post.uid)) return '';
    else if (post.privacy === 'friends') privacyIcon = '<i class="fa-solid fa-user-group text-[10px] text-gray-400"></i>';

    let displayStyle = "";
    let avatarHtml = post.authorPic ? `<img onclick="window.openUserProfile('${post.uid}')" src="${post.authorPic}" loading="lazy" class="cursor-pointer w-10 h-10 rounded-full object-cover shadow-sm">` : `<div onclick="window.openUserProfile('${post.uid}')" class="cursor-pointer w-10 h-10 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 shadow-sm text-lg">${post.author ? window.escapeHTML(post.author).charAt(0).toUpperCase() : 'U'}</div>`;
    let myInlineAvatar = window.userDetails.profile_pic ? `<img src="${window.userDetails.profile_pic}" loading="lazy" class="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-100">` : `<div class="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 shrink-0"><i class="fa-solid fa-user"></i></div>`;

    const isLiked = post.likes && post.likes[window.currentUser.uid];
    const realLikes = post.likes ? Object.keys(post.likes).length : 0;
    const likeCount = post.likeCount ? Math.max(post.likeCount, realLikes) : realLikes;
    const commentCount = post.comments ? Object.keys(post.comments).length : 0;
    let badge = post.authorRole === 'journalist' ? `<i class="fa-solid fa-feather-pointed journalist-badge" title="Journalist"></i>` : (post.authorVerified ? `<i class="fa-solid fa-circle-check verified-badge" title="Verified"></i>` : "");
    
    let topContributorTag = '';
    if (post.authorRole === 'journalist' || (post.adminScore && parseInt(post.adminScore) >= 100)) {
        topContributorTag = `<span class="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full ml-2 shadow-sm"><i class="fa-solid fa-award mr-0.5"></i> সেরা অবদানকারী</span>`;
    }
    let locationTag = (post.union ? `<span class="bg-gray-100 text-[10px] px-2 py-0.5 rounded-full text-gray-500 ml-2">${post.union}</span>` : '') + (post.village ? `<span class="bg-green-50 text-[10px] px-2 py-0.5 rounded-full text-green-600 ml-1 border border-green-100">${post.village}</span>` : '');

    // 24 Hour Timer Badge Logic
    let ephemeralBadge = '';
    if (post.expiresAt) {
        const timeLeft = post.expiresAt - Date.now();
        if (timeLeft <= 0) return ''; // মেয়াদ শেষ হলে দেখাবে না
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const timeText = hoursLeft > 0 ? `${hoursLeft} ঘণ্টা` : `${minsLeft} মিনিট`;
        ephemeralBadge = `<div class="bg-gradient-to-r from-orange-500 to-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-b-xl absolute top-0 left-1/2 transform -translate-x-1/2 shadow-md flex items-center gap-1 z-10"><i class="fa-solid fa-stopwatch animate-pulse"></i> মুছে যাবে ${timeText} পর</div>`;
    }

    let headerText = `<h4 onclick="window.openUserProfile('${post.uid}')" class="font-bold text-base text-gray-800 cursor-pointer hover:underline inline">${window.escapeHTML(post.author)}${badge}</h4> ${topContributorTag}`;

    if (post.feeling) headerText += ` <span class="text-gray-600 text-sm font-normal">is feeling ${post.feeling.emoji} ${window.escapeHTML(post.feeling.text)}</span>`;
    if (post.checkInLocation) headerText += ` <span class="text-gray-600 text-sm font-normal">at <span class="font-bold text-red-600"><i class="fa-solid fa-location-dot text-xs"></i> ${window.escapeHTML(post.checkInLocation)}</span></span>`;
    if (post.taggedFriends && post.taggedFriends.length > 0) {
        headerText += ` <span class="text-gray-600 text-sm">with <span class="font-bold text-gray-800">${window.escapeHTML(post.taggedFriends[0].name)}</span>`;
        if (post.taggedFriends.length > 1) headerText += ` and ${post.taggedFriends.length - 1} others`;
        headerText += `</span>`;
    }

    let contentHTML = '';
    if (post.type === 'voice' && post.audio) {
        // controlsList="nodownload noplaybackrate" prevents downloading from feed
        contentHTML += `<div class="w-full bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-2.5 mb-3 border border-gray-700 flex items-center gap-3 shadow-md relative overflow-hidden">
                            <div class="absolute left-0 top-0 bottom-0 w-16 bg-red-500/10 z-0 rounded-l-2xl"></div>
                            <div class="w-11 h-11 bg-gradient-to-br from-red-500 to-pink-600 rounded-full flex items-center justify-center text-white shrink-0 z-10 shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-red-400/50">
                                <i class="fa-solid fa-microphone-lines text-lg"></i>
                            </div>
                            <div class="flex-1 z-10 mr-1">
                                <audio controls controlsList="nodownload noplaybackrate" src="${post.audio}" class="w-full h-9 bg-transparent outline-none filter invert hue-rotate-180 grayscale contrast-150"></audio>
                            </div>
                        </div>`;
    }

    if (post.content) {
        if (post.bgColor && post.type === 'text') {
        contentHTML = `<div class="colored-post-bg relative cursor-pointer" style="background: ${post.bgColor};" ondblclick="window.handleDoubleTapLike('${id}')">
                          <i id="big-heart-${id}" class="fa-solid fa-heart big-heart-pop"></i>
                          ${window.escapeHTML(post.content)}
                       </div>`;
        } else {
            const ytMatch = post.content.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            const driveMatch = post.content.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
            let cleanText = window.escapeHTML(post.content);
            if (ytMatch) cleanText = cleanText.replace(ytMatch[0], '');
            if (driveMatch) cleanText = cleanText.replace(driveMatch[0], '[Drive Link]');
            if (cleanText.length > 150) cleanText = `<span>${cleanText.substring(0, 150)}...</span><span id="more-${id}" class="hidden">${cleanText.substring(150)}</span> <button onclick="window.toggleReadMore('${id}')" class="text-blue-600 text-xs font-bold">আরো পড়ুন</button>`;
            
            // Fix: Added += instead of = so audio player is not overwritten
            contentHTML += `<p class="post-text-content text-[15px] text-gray-800 mb-2 whitespace-pre-line leading-relaxed font-normal">${cleanText}</p>`;
            
            if (ytMatch) contentHTML += `<div class="video-container ${post.content.includes("shorts")?'portrait':''} mb-3 shadow-sm"><iframe id="yt-${id}" class="yt-player" src="https://www.youtube.com/embed/${ytMatch[1]}?enablejsapi=1&rel=0" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
            if (driveMatch) {
                const previewUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
                contentHTML += `<div class="mb-3 shadow-sm rounded-lg overflow-hidden border border-gray-200"><iframe src="${previewUrl}" width="100%" height="250" style="border:0;" allow="autoplay" loading="lazy"></iframe></div>`;
            }
        }
    }
    if (post.type === 'poll' && post.options) {
        let totalVotes = post.options.reduce((a, b) => a + (b.votes || 0), 0);
        contentHTML = `<h4 class="font-bold text-gray-800 mb-2">${window.escapeHTML(post.content)}</h4><div class="space-y-2 mb-3">` + post.options.map((opt, idx) => {
            const percent = totalVotes === 0 ? 0 : Math.round((opt.votes || 0) / totalVotes * 100);
            return `<div onclick="window.votePoll('${id}', ${idx})" class="poll-option relative w-full border rounded-lg h-10 overflow-hidden cursor-pointer hover:bg-gray-50"><div class="poll-fill absolute top-0 left-0 h-full bg-blue-100 z-0" style="width: ${percent}%"></div><div class="absolute inset-0 flex justify-between items-center px-3 z-10 pointer-events-none"><span class="text-sm font-semibold text-gray-700">${window.escapeHTML(opt.text)}</span><span class="text-xs font-bold text-gray-500">${percent}%</span></div></div>`;
        }).join('') + `<p class="text-xs text-right text-gray-400 mt-1 font-bold">${totalVotes} ভোট</p></div>`;
    }

    let mediaHtml = '';
    const images = post.images || (post.image ? [post.image] : []);
    if (images.length > 0) {
        const bigHeartHtml = `<i id="big-heart-${id}" class="fa-solid fa-heart big-heart-pop"></i>`;
        if (images.length === 1 && (post.mediaType === 'video' || images[0].endsWith('.mp4'))) {
            mediaHtml = `<div class="mb-3 w-full bg-black rounded-lg overflow-hidden relative shadow-sm cursor-pointer" ondblclick="window.handleDoubleTapLike('${id}')">
                            ${bigHeartHtml}
                            <video src="${images[0]}" controls class="w-full h-auto max-h-[400px]" playsinline preload="metadata"></video>
                         </div>`;
        } else {
            let gridClass = '';
            let imgsHtml = '';
            const count = images.length;
            
            if (count === 1) {
                gridClass = 'grid grid-cols-1';
                imgsHtml = `<img src="${images[0]}" loading="lazy" onclick="window.handleSmartImageClick('${id}', '${images[0]}')" class="w-full h-auto max-h-[400px] object-cover cursor-pointer">`;
            } else if (count === 2) {
                gridClass = 'grid grid-cols-2 gap-1 h-64';
                imgsHtml = images.map(img => `<img src="${img}" loading="lazy" onclick="window.handleSmartImageClick('${id}', '${img}')" class="w-full h-full object-cover cursor-pointer">`).join('');
            } else if (count === 3) {
                // ৩টি ছবির জন্য ফেসবুক স্টাইল (উপরে ১টি বড়, নিচে ২টি ছোট)
                gridClass = 'grid grid-cols-2 gap-1';
                imgsHtml = `<img src="${images[0]}" loading="lazy" onclick="window.handleSmartImageClick('${id}', '${images[0]}')" class="w-full h-48 object-cover cursor-pointer col-span-2">` +
                           `<img src="${images[1]}" loading="lazy" onclick="window.handleSmartImageClick('${id}', '${images[1]}')" class="w-full h-32 object-cover cursor-pointer">` +
                           `<img src="${images[2]}" loading="lazy" onclick="window.handleSmartImageClick('${id}', '${images[2]}')" class="w-full h-32 object-cover cursor-pointer">`;
            } else if (count >= 4) {
                // ৪টি ছবির জন্য ফেসবুক স্টাইল (২x২ গ্রিড)
                gridClass = 'grid grid-cols-2 gap-1 h-72';
                imgsHtml = images.slice(0, 4).map(img => `<img src="${img}" loading="lazy" onclick="window.handleSmartImageClick('${id}', '${img}')" class="w-full h-full object-cover cursor-pointer">`).join('');
            }

            mediaHtml = `<div class="mb-3 w-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative ${gridClass}">
                            ${bigHeartHtml}
                            ${imgsHtml}
                         </div>`;
        }
    }

    // থ্রি-ডট মেনু অপশনসমূহ (টেক্সট কপি, লিংক কপি, সেভ এবং নোটিফিকেশন অফ/অন সকলের জন্য প্রযোজ্য)
    let menuOptions = `
        <li onclick="window.copyPostText('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-gray-600"><i class="fa-regular fa-copy w-5"></i> টেক্সট কপি করুন</li>
        <li onclick="window.copyPostLink('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-gray-600"><i class="fa-solid fa-link w-5"></i> লিংক কপি করুন</li>
        <li onclick="window.savePost('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-gray-600"><i class="fa-regular fa-bookmark w-5"></i> পোস্ট সেভ করুন</li>
        <li onclick="window.mutePostNotifications('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-gray-600"><i class="fa-regular fa-bell-slash w-5"></i> নোটিফিকেশন অফ / অন</li>
    `;
    if (post.uid === window.currentUser.uid) {
        // শুধুমাত্র নিজের পোস্টের জন্য এডিট ও ডিলিট অপশন
        menuOptions += `
            <li onclick="window.openEditPostModal('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-blue-600"><i class="fa-solid fa-pen w-5"></i> এডিট করুন</li>
            <li onclick="window.deletePost('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-red-600"><i class="fa-solid fa-trash w-5"></i> ডিলিট করুন</li>
        `;
    } else {
        // অন্যের পোস্টের জন্য রিপোর্ট এবং ফিড থেকে হাইড করার অপশন
        menuOptions += `
            <li onclick="window.reportPost('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-yellow-600"><i class="fa-solid fa-triangle-exclamation w-5"></i> রিপোর্ট করুন</li>
            <li onclick="window.hidePost('${id}')" class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-gray-600"><i class="fa-regular fa-eye-slash w-5"></i> পোস্ট হাইড করুন</li>
        `;
    }

    let actionButtons = (post.mobile || post.socialLink) ? `<div class="grid grid-cols-2 gap-2 mt-3 mb-2">${post.mobile ? `<a href="tel:${post.mobile}" class="flex items-center justify-center gap-2 bg-green-50 text-green-700 py-2 rounded-lg font-bold text-sm hover:bg-green-100 transition border border-green-200"><i class="fa-solid fa-phone"></i> Call Now</a>` : '<div></div>'}${post.socialLink ? `<a href="${post.socialLink}" target="_blank" class="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 py-2 rounded-lg font-bold text-sm hover:bg-blue-100 transition border border-blue-200"><i class="fa-brands fa-whatsapp"></i> Message</a>` : '<div></div>'}</div>` : '';

    const suggestions = window.getCommentSuggestions ? window.getCommentSuggestions(post) : [];
    const suggestionsHtml = suggestions.length > 0 ? `<div id="comment-suggestions-${id}" class="flex gap-2 mt-3 overflow-x-auto hide-scrollbar pb-1">
        ${suggestions.map(s => `<button onclick="window.autoPostSuggestion('${id}', '${s}', this)" class="shrink-0 bg-gray-100 hover:bg-green-50 hover:text-green-700 hover:border-green-200 border border-transparent text-gray-600 text-[11px] font-bold px-3 py-1.5 rounded-full transition-all active:scale-95 shadow-sm">${s}</button>`).join('')}
    </div>` : '';

    let commentsPreviewHtml = '';
    if (post.comments) {
        commentsPreviewHtml = Object.entries(post.comments).slice(-2).map(([_, c]) => {
            let shortAvatar = c.authorPic 
                ? `<img src="${c.authorPic}" loading="lazy" class="w-7 h-7 rounded-full object-cover shrink-0 border border-gray-100 cursor-pointer" onclick="window.openUserProfile('${c.authorUid}')">` 
                : `<div class="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center font-bold text-blue-600 text-[10px] shrink-0 border border-blue-100 cursor-pointer" onclick="window.openUserProfile('${c.authorUid}')">${(c.author || 'U').charAt(0)}</div>`;
            
            return `
            <div class="flex items-start gap-2 mb-2 animate-fade">
                ${shortAvatar}
                <div class="bg-gray-100 px-3 py-2 rounded-2xl rounded-tl-md flex-1 min-w-0">
                    <span class="font-bold text-[13px] text-gray-900 cursor-pointer hover:underline mr-1" onclick="window.openUserProfile('${c.authorUid}')">${window.escapeHTML(c.author)}</span> 
                    <span class="text-[13px] text-gray-800 leading-snug break-words whitespace-pre-wrap">${window.escapeHTML(c.text)}</span>
                </div>
            </div>`;
        }).join('');
    }

    return `<div id="post-card-${id}" class="bg-white p-4 rounded-xl shadow-sm mb-3 border border-gray-100 relative max-w-lg mx-auto pt-6 ${post.authorRole === 'journalist' ? 'journalist-post' : ''}" style="${displayStyle}" data-union="${post.union||''}" data-village="${post.village||''}">
                ${ephemeralBadge}
                <div class="flex items-center justify-between mb-2"><div class="flex items-center gap-3">${avatarHtml}<div>${headerText}<p class="text-[11px] text-gray-400 flex flex-wrap gap-1 items-center font-medium">${window.timeAgo(post.timestamp)} ${privacyIcon} ${locationTag}</p></div></div><div class="relative"><button onclick="window.togglePostMenu(event)" class="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center transition"><i class="fa-solid fa-ellipsis-vertical text-lg"></i></button><div id="post-menu-${id}" class="post-menu-dropdown hidden absolute right-0 top-8 w-48 bg-white shadow-xl rounded-lg z-20 border border-gray-100 py-1 text-sm text-gray-700"><ul>${menuOptions}</ul></div></div></div>${contentHTML}${mediaHtml}${actionButtons}<div class="grid grid-cols-3 border-t border-b border-gray-100 py-2 mt-2"><button id="like-btn-${id}" onclick="window.toggleLike('${id}')" class="flex items-center justify-center gap-2 hover:bg-gray-50 py-1.5 rounded transition text-gray-500"><i id="like-icon-${id}" class="${isLiked ? 'fa-solid text-green-600' : 'fa-regular'} fa-thumbs-up text-lg"></i> <span id="like-cnt-${id}" class="text-sm ${isLiked ? 'font-bold text-green-600' : ''}">${likeCount}</span></button><button onclick="window.openFullCommentModal('${id}')" class="flex items-center justify-center gap-2 hover:bg-gray-50 py-1.5 rounded transition text-gray-500"><i class="fa-regular fa-comment text-lg"></i> <span id="comment-cnt-${id}" class="text-sm">${commentCount}</span></button><button onclick="window.repost('${id}')" class="flex items-center justify-center gap-2 hover:bg-gray-50 py-1.5 rounded transition text-gray-500"><i class="fa-solid fa-share text-lg"></i> <span class="text-sm">${post.repostCount||0}</span></button></div><div class="mt-2"><div id="comments-preview-${id}" class="mt-3">${commentsPreviewHtml}</div>${commentCount > 0 ? `<button onclick="window.openFullCommentModal('${id}')" class="text-xs text-green-600 font-bold mt-1 hover:underline w-full text-left">সকল কমেন্ট দেখুন (${commentCount})</button>` : ''} ${suggestionsHtml} <div class="mt-3 flex gap-2 items-center">${myInlineAvatar}<input type="text" id="inline-comment-input-${id}" onkeydown="window.handleEnter(event, 'comment', '${id}')" placeholder="আপনার মতামত..." class="flex-1 bg-gray-100 border-0 rounded-full px-4 py-2 text-sm focus:ring-1 focus:ring-green-500"><button onclick="window.submitInlineComment('${id}')" class="text-green-600 w-9 h-9 flex items-center justify-center bg-green-50 rounded-full hover:bg-green-100"><i class="fa-solid fa-paper-plane text-sm"></i></button></div></div></div>`;
}

window.openSinglePostModal = (postId) => {
    const c = document.getElementById('single-post-content');
    if(c) {
        document.getElementById('single-post-modal')?.classList.remove('hidden-custom');
        c.innerHTML = '<div class="flex justify-center p-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>';
        get(ref(getDb(), `posts/${postId}`)).then(snap => c.innerHTML = snap.exists() ? window.createPostHTML(snap.val(), postId) : '<p class="text-center text-gray-400 mt-10">পোস্টটি পাওয়া যায়নি</p>');
    }
};

// --- TAGS & FEELING ---
window.openTagModal = () => {
    const tm = document.getElementById('tag-friends-modal');
    if(tm) {
        tm.classList.remove('hidden-custom');
        setTimeout(() => tm.classList.add('open'), 10);
    }
    const list = document.getElementById('tag-friends-list');
    if(list) list.innerHTML = '<div class="flex justify-center py-10"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
    
    if (!window.myFriends || window.myFriends.length === 0) {
        if(list) list.innerHTML = '<p class="text-center text-gray-400 mt-10">আপনার কোনো বন্ধু নেই</p>'; 
        return;
    }
    const promises = window.myFriends.map(uid => window.getUserData(uid));
    Promise.all(promises).then(friendsData => {
        let html = '';
        friendsData.forEach(u => {
            if (u) {
                const isTagged = window.taggedUsers && window.taggedUsers.some(t => t.uid === u.uid);
                let avatar = u.profile_pic ? `<img src="${u.profile_pic}" loading="lazy" class="w-10 h-10 rounded-full object-cover shadow-sm">` : `<div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-lg font-bold shadow-sm">${u.name.charAt(0)}</div>`;
                html += `<div onclick="window.toggleTagUser('${u.uid}', '${window.escapeHTML(u.name)}')" class="bg-white p-3 mb-3 rounded-xl flex justify-between items-center cursor-pointer transition-all border-2 ${isTagged ? 'border-green-500 bg-green-50 shadow-md' : 'border-transparent shadow-sm'} tag-item-${u.uid}"><div class="flex items-center gap-3">${avatar}<div><span class="font-bold text-sm text-gray-800 block">${window.escapeHTML(u.name)}</span><span class="text-[10px] text-gray-500">${window.escapeHTML(u.village || 'পাথরঘাটা')}</span></div></div><i class="fa-solid fa-check-circle text-2xl ${isTagged ? 'text-green-600' : 'text-gray-200'} tag-icon-${u.uid}"></i></div>`;
            }
        });
        if(list) list.innerHTML = html;
    });
};
window.closeTagModal = () => {
    const tm = document.getElementById('tag-friends-modal');
    if(tm) tm.classList.remove('open');
    setTimeout(() => {
        if(tm) tm.classList.add('hidden-custom');
    }, 300);
};
window.toggleTagUser = (uid, name) => {
    if(!window.taggedUsers) window.taggedUsers = [];
    const index = window.taggedUsers.findIndex(u => u.uid === uid);
    const item = document.querySelector(`.tag-item-${uid}`);
    const icon = document.querySelector(`.tag-icon-${uid}`);
    if (index > -1) {
        window.taggedUsers.splice(index, 1);
        if(item) {
            item.classList.remove('border-green-500', 'bg-green-50', 'shadow-md');
            item.classList.add('border-transparent', 'shadow-sm');
        }
        if(icon) {
            icon.classList.remove('text-green-600');
            icon.classList.add('text-gray-200');
        }
    } else {
        window.taggedUsers.push({ uid, name });
        if(item) {
            item.classList.add('border-green-500', 'bg-green-50', 'shadow-md');
            item.classList.remove('border-transparent', 'shadow-sm');
        }
        if(icon) {
            icon.classList.add('text-green-600');
            icon.classList.remove('text-gray-200');
        }
    }
};
window.saveTags = () => {
    window.closeTagModal();
    if(window.updatePostHeaderUI) window.updatePostHeaderUI();
    if (window.taggedUsers && window.taggedUsers.length > 0) window.showToast(`${window.taggedUsers.length} জনকে ট্যাগ করা হয়েছে`);
};
window.updatePostHeaderUI = () => {
    const tagInfo = document.getElementById('post-modal-tagged-info');
    if (!tagInfo) return;
    let html = '';
    
    if (window.selectedFeeling) {
        html += ` <span class="text-gray-600 font-normal inline-flex items-center gap-1">is feeling ${window.selectedFeeling.emoji} <b class="text-gray-800">${window.selectedFeeling.text}</b> <button onclick="window.clearFeeling()" class="text-gray-400 hover:text-red-500 bg-gray-100 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition ml-1" title="Remove"><i class="fa-solid fa-xmark text-xs"></i></button></span>`;
    }
    if (window.selectedLocation) {
        html += ` <span class="text-gray-600 font-normal inline-flex items-center gap-1">at <b class="text-red-600"><i class="fa-solid fa-location-dot text-[10px]"></i> ${window.escapeHTML(window.selectedLocation)}</b> <button onclick="window.clearLocation()" class="text-gray-400 hover:text-red-500 bg-gray-100 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition ml-1" title="Remove"><i class="fa-solid fa-xmark text-xs"></i></button></span>`;
    }
    if (window.taggedUsers && window.taggedUsers.length > 0) {
        html += ` <span class="text-gray-600 font-normal inline-flex items-center gap-1">with <b class="text-gray-800">${window.escapeHTML(window.taggedUsers[0].name)}</b>`;
        if (window.taggedUsers.length > 1) html += ` and <b class="text-gray-800">আরও ${window.taggedUsers.length - 1} জন</b>`;
        html += ` <button onclick="window.clearTags()" class="text-gray-400 hover:text-red-500 bg-gray-100 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition ml-1" title="Remove"><i class="fa-solid fa-xmark text-xs"></i></button></span>`;
    }

    if (html !== '') {
        tagInfo.innerHTML = html; 
        tagInfo.classList.remove('hidden');
        tagInfo.classList.add('flex', 'flex-wrap', 'items-center', 'gap-1.5', 'mt-1.5');
    } else {
        tagInfo.innerHTML = ''; 
        tagInfo.classList.add('hidden');
        tagInfo.classList.remove('flex', 'flex-wrap', 'items-center', 'gap-1.5', 'mt-1.5');
    }
};

window.clearFeeling = () => { window.selectedFeeling = null; window.updatePostHeaderUI(); };
window.clearLocation = () => { window.selectedLocation = null; window.updatePostHeaderUI(); };
window.clearTags = () => { 
    window.taggedUsers = []; 
    window.updatePostHeaderUI(); 
    document.querySelectorAll('[class*="tag-item-"]').forEach(item => { item.classList.remove('border-green-500', 'bg-green-50', 'shadow-md'); item.classList.add('border-transparent', 'shadow-sm'); });
    document.querySelectorAll('[class*="tag-icon-"]').forEach(icon => { icon.classList.remove('text-green-600'); icon.classList.add('text-gray-200'); });
};
window.openFeelingModal = () => {
    const fm = document.getElementById('feeling-modal');
    if(fm) {
        fm.classList.remove('hidden-custom');
        setTimeout(() => fm.classList.add('open'), 10);
    }
};
window.closeFeelingModal = () => {
    const fm = document.getElementById('feeling-modal');
    if(fm) fm.classList.remove('open');
    setTimeout(() => {
        if(fm) fm.classList.add('hidden-custom');
    }, 300);
};
window.selectFeeling = (text, emoji) => {
    window.selectedFeeling = { text, emoji };
    window.closeFeelingModal();
    if(window.updatePostHeaderUI) window.updatePostHeaderUI();
};
// Location Check-in Logic
window.openLocationModal = () => {
    const lm = document.getElementById('location-modal');
    if(lm) {
        lm.classList.remove('hidden-custom');
        setTimeout(() => {
            lm.classList.add('open');
            lm.style.transform = 'translateY(0)';
        }, 20);
    }
};

window.closeLocationModal = () => {
    const lm = document.getElementById('location-modal');
    if(lm) {
        lm.style.transform = 'translateY(100%)';
        setTimeout(() => {
            lm.classList.add('hidden-custom');
            lm.classList.remove('open');
        }, 300);
    }
};

window.selectLocation = (locName) => {
    window.selectedLocation = locName;
    window.closeLocationModal();
    if(window.updatePostHeaderUI) window.updatePostHeaderUI();
    window.showToast(`লোকেশন সেট করা হয়েছে: ${locName}`);
};

window.selectCustomLocation = () => {
    const customLoc = document.getElementById('custom-location-input').value.trim();
    if (!customLoc) return window.showToast("অনুগ্রহ করে লোকেশনের নাম লিখুন", "error");
    window.selectLocation(customLoc);
    document.getElementById('custom-location-input').value = "";
};

// --- ALERTS & DOUBLE TAP ---
window.refreshFeed = () => {
    document.getElementById('new-post-alert')?.classList.add('hidden'); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
    if(window.loadFeed) window.loadFeed(window.currentFeedFilter, true); 
};
window.listenForNewPosts = () => {
    const appOpenTime = Date.now();
    const recentPostsQuery = query(ref(getDb(), 'posts'), orderByChild('timestamp'), startAt(appOpenTime));
    onChildAdded(recentPostsQuery, (snapshot) => {
        const post = snapshot.val();
        if (window.currentUser && post.uid !== window.currentUser.uid) {
            const alertBtn = document.getElementById('new-post-alert');
            if (alertBtn && alertBtn.classList.contains('hidden')) {
                alertBtn.classList.remove('hidden');
                if(window.playSound) window.playSound('notification');
            }
        }
    });
}
window.handleDoubleTapLike = (postId) => {
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    const bigHeart = document.getElementById(`big-heart-${postId}`);
    if (bigHeart) {
        bigHeart.classList.remove('animate'); 
        void bigHeart.offsetWidth; 
        bigHeart.classList.add('animate'); 
    }
    const icon = document.getElementById(`like-icon-${postId}`);
    if (icon && icon.classList.contains('fa-regular')) { 
        if(window.toggleLike) window.toggleLike(postId);
    }
};

let imageClickTimer = null;
window.handleSmartImageClick = (postId, imgSrc) => {
    if (imageClickTimer === null) {
        imageClickTimer = setTimeout(() => {
            imageClickTimer = null;
            if(window.openImageViewer) window.openImageViewer(imgSrc); 
        }, 300);
    } else {
        clearTimeout(imageClickTimer); 
        imageClickTimer = null;
        if(window.handleDoubleTapLike) window.handleDoubleTapLike(postId); 
    }
};

// --- ১. পোস্ট সেভ / বুকমার্ক করার ফাংশন ---
window.savePost = (postId) => {
    const userSaveRef = ref(getDb(), `users/${window.currentUser.uid}/saved_posts/${postId}`);
    get(userSaveRef).then((snap) => {
        if (snap.exists()) {
            set(userSaveRef, null).then(() => {
                window.showToast("সেভ তালিকা থেকে সরানো হয়েছে", "success");
            });
        } else {
            set(userSaveRef, true).then(() => {
                window.showToast("পোস্টটি বুকমার্ক সেকশনে সেভ করা হয়েছে!", "success");
            });
        }
    }).catch(e => window.showToast("ত্রুটি: " + e.message, "error"));
};

// --- ২. পোস্ট লিংক কপি করার ফাংশন ---
window.copyPostLink = (postId) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?post=${postId}#single-post-modal`;
    navigator.clipboard.writeText(shareUrl).then(() => {
        window.showToast("পোস্ট লিংক ক্লিপবোর্ডে কপি হয়েছে!", "success");
    }).catch(() => {
        window.showToast("লিংক কপি করা যায়নি", "error");
    });
};

// --- ৩. পোস্ট রিপোর্ট করার ফাংশন ---
window.reportPost = (postId) => {
    const reason = prompt("রিপোর্ট করার কারণটি উল্লেখ করুন (যেমন: ভুয়া তথ্য, আপত্তিকর ভাষা ইত্যাদি):");
    if (reason === null) return; // ব্যবহারকারী ক্যানসেল করলে
    if (!reason.trim()) return window.showToast("কারণ লেখা বাধ্যতামূলক", "error");
    
    const reportRef = ref(getDb(), `reports/${postId}/${window.currentUser.uid}`);
    set(reportRef, {
        reason: reason.trim(),
        timestamp: Date.now(),
        reporterName: window.userDetails.name || "Unknown User"
    }).then(() => {
        window.showToast("অ্যাডমিন প্যানেলে রিপোর্ট পাঠানো হয়েছে। ধন্যবাদ।", "success");
    }).catch(e => window.showToast("রিপোর্ট পাঠানো যায়নি: " + e.message, "error"));
};

// --- ৪. পোস্টের নোটিফিকেশন অফ/অন (Mute) করার ফাংশন ---
window.mutePostNotifications = (postId) => {
    const muteRef = ref(getDb(), `users/${window.currentUser.uid}/muted_posts/${postId}`);
    get(muteRef).then((snap) => {
        if (snap.exists()) {
            set(muteRef, null).then(() => {
                window.showToast("পোস্টের নোটিফিকেশন পুনরায় চালু করা হয়েছে।");
            });
        } else {
            set(muteRef, true).then(() => {
                window.showToast("এই পোস্টের নতুন নোটিফিকেশন বন্ধ করা হয়েছে।");
            });
        }
    }).catch(e => window.showToast("ত্রুটি: " + e.message, "error"));
};

// --- ৫. পোস্ট হাইড করার ফাংশন (আপগ্রেডেড স্মুথ এনিমেশন সহ) ---
window.hidePost = (postId) => {
    document.querySelectorAll(`#post-card-${postId}`).forEach(card => {
        card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => card.remove(), 300);
    });
    window.showToast("পোস্টটি আপনার ফিড থেকে লুকানো হয়েছে।");
};

// পেজ লোড হওয়ার সাথে সাথে অ্যালার্ট লিসেনার চালু করা
if(window.currentUser) {
    window.listenForNewPosts();
}

// --- শেয়ার করা ইউআরএল লিংক থেকে সরাসরি নির্দিষ্ট পোস্ট ওপেন করার লজিক (Deep Linking) ---
(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const postIdParam = urlParams.get('post');
    if (postIdParam) {
        // ফায়ারবেস অথেন্টিকেশন এবং কোর উইন্ডো ফাংশন লোড হওয়া পর্যন্ত অপেক্ষা করা হবে
        const checkAuthInterval = setInterval(() => {
            if (window.currentUser && typeof window.openSinglePostModal === 'function') {
                clearInterval(checkAuthInterval);
                setTimeout(() => {
                    window.openSinglePostModal(postIdParam);
                }, 1000); // ইউজার ইন্টারফেস সম্পূর্ণ রেন্ডার হওয়ার জন্য সাময়িক ১ সেকেন্ডের বিরতি
            }
        }, 300);
        
        // ফেইল-সেফ গার্ড: কোনো কারণে লোড না হলে ১০ সেকেন্ড পর লুপ বন্ধ হবে
        setTimeout(() => clearInterval(checkAuthInterval), 10000);
    }
})();