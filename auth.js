/* Authentication UI and account flows for Pathargata Digital. */
import {
    ref, get, set, update, push, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    GoogleAuthProvider,
    FacebookAuthProvider,
    signInWithPopup,
    signInWithRedirect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const getDb = () => window.db;
const getAuth = () => window.auth;

window.toggleAuth = (view) => {
    ['login-form', 'register-form', 'forgot-form'].forEach((id) => {
        document.getElementById(id)?.classList.add('hidden-custom');
    });
    document.getElementById(`${view}-form`)?.classList.remove('hidden-custom');
};

        window.previewRegImage = (input) => {
            if (input.files && input.files[0]) {
                const r = new FileReader();
                r.onload = (e) => {
                    document.getElementById('reg-img-preview').src = e.target.result;
                    document.getElementById('reg-img-preview').classList.remove('hidden');
                    document.getElementById('reg-img-placeholder').classList.add('hidden');
                };
                r.readAsDataURL(input.files[0]);
            }
        }

        // --- MULTI-STEP REGISTRATION LOGIC ---
        window.nextRegStep = (step) => {
            // Validation before going to next step
            if (step === 2) {
                const name = document.getElementById('reg-name').value.trim();
                const phone = document.getElementById('reg-phone').value.trim();
                const email = document.getElementById('reg-email').value.trim();

                if (!name || !phone || !email) return window.showToast("নাম, ইমেইল এবং মোবাইল নাম্বার দিন!", "error");
                if (!/^01[3-9]\d{8}$/.test(phone)) return window.showToast("সঠিক মোবাইল নম্বর দিন", "error");
            }
            else if (step === 3) {
                const union = document.getElementById('reg-union').value;
                const village = document.getElementById('reg-village').value;
                if (!union || !village) return window.showToast("ইউনিয়ন এবং গ্রাম নির্বাচন করুন!", "error");
            }

            // Hide all steps
            for(let i=1; i<=4; i++) {
                document.getElementById(`reg-step-${i}`).classList.add('hidden-custom');
                // Progress Bar Update
                const pBar = document.getElementById(`progress-${i}`);
                if (i <= step) {
                    pBar.classList.replace('bg-gray-200', 'bg-green-600');
                } else {
                    pBar.classList.replace('bg-green-600', 'bg-gray-200');
                }
            }
            // Show target step
            document.getElementById(`reg-step-${step}`).classList.remove('hidden-custom');
            document.getElementById('step-indicator').innerText = `ধাপ ${step}/৪`;
        };

        window.prevRegStep = (step) => {
            for(let i=1; i<=4; i++) {
                document.getElementById(`reg-step-${i}`).classList.add('hidden-custom');
                const pBar = document.getElementById(`progress-${i}`);
                if (i <= step) {
                    pBar.classList.replace('bg-gray-200', 'bg-green-600');
                } else {
                    pBar.classList.replace('bg-green-600', 'bg-gray-200');
                }
            }
            document.getElementById(`reg-step-${step}`).classList.remove('hidden-custom');
            document.getElementById('step-indicator').innerText = `ধাপ ${step}/৪`;
        };
        // -------------------------------------

        window.handleRegister = async () => {
            const name = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const phone = document.getElementById('reg-phone').value.trim();
            const pass = document.getElementById('reg-pass').value;
            const union = document.getElementById('reg-union').value;
            const village = document.getElementById('reg-village').value;
            const file = document.getElementById('reg-profile-pic').files[0];
            const isPolicyChecked = document.getElementById('reg-privacy-agree').checked;

            if (!isPolicyChecked) return window.showToast("দয়া করে গোপনীয়তা ও নীতিমালার সাথে একমত হোন", "error");

            const nameRegex = /^[a-zA-Z\u0980-\u09FF\s]+$/;
            if (!name || !email || !phone || !pass || !union || !village) return window.showToast("সব তথ্য দিন!", 'error');
            if (!nameRegex.test(name)) return window.showToast("নামে ইমোজি বা সিম্বল ব্যবহার করা যাবে না", 'error');
            if (name.length > 20) return window.showToast("নাম ২০ অক্ষরের বেশি হতে পারবে না", 'error');
            if (!/^01[3-9]\d{8}$/.test(phone)) return window.showToast("সঠিক মোবাইল নম্বর দিন", 'error');

            const btn = document.getElementById('btn-reg-action');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> অপেক্ষা করুন...';
            btn.disabled = true;

            try {
                const locData = await window.ADVANCED_FEATURES.checkUserLocation();
                let profilePicUrl = "";
                if (file) {
                    // ইমেজ আপলোড ফাংশন কল করা হচ্ছে
                    try {
                        const res = await window.uploadMediaToCloudinary(file);
                        profilePicUrl = res.url;
                    } catch (err) {
                        console.warn("Image upload failed, continuing without image");
                    }
                }

                // --- ANTI-FRAUD REGISTRATION LOGIC START ---
                let visitorId = "unknown_device";
                let userIP = "unknown_ip";
                try {
                    // Fingerprint (Layer 2)
                    const fp = await window.FingerprintJS.load();
                    const fpResult = await fp.get();
                    visitorId = fpResult.visitorId;

                    // Fetch IP (Layer 3)
                    const ipRes = await fetch('https://api.ipify.org?format=json');
                    const ipData = await ipRes.json();
                    userIP = ipData.ip;
                } catch (err) {
                    console.warn("Anti-fraud fetch failed, proceeding with fallback.", err);
                }

                // Check if device is already registered
                const deviceRef = ref(getDb(), `registered_devices/${visitorId}`);
                const deviceSnap = await get(deviceRef);
                const isNewDevice = !deviceSnap.exists() && !localStorage.getItem('has_registered_before');
                // --- ANTI-FRAUD REGISTRATION LOGIC END ---

                // ১. ফায়ারবেস অথেন্টিকেশনে ইউজার তৈরি
                const cred = await createUserWithEmailAndPassword(getAuth(), email, pass);

                // ২. অথেন্টিকেশন প্রোফাইলে নাম আপডেট (যাতে ডাটাবেস মিস হলেও নাম থাকে)
                await updateProfile(cred.user, {
                    displayName: name,
                    photoURL: profilePicUrl
                });

                // ৩. রিয়েলটাইম ডাটাবেসে তথ্য সেভ
                await set(ref(getDb(), 'users/' + cred.user.uid), {
                    name,
                    email,
                    phone,
                    union,
                    village,
                    role: 'user',
                    uid: cred.user.uid,
                    joinDate: new Date().toLocaleDateString(),
                    isVerified: false,
                    profile_pic: profilePicUrl,
                    status: locData.status,
lat: locData.lat,
lng: locData.lng
                });
// Mark Device & LocalStorage
                localStorage.setItem('has_registered_before', 'true');
                await set(deviceRef, { ip: userIP, timestamp: Date.now(), uid: cred.user.uid });

                // Process Referral Reward (Only if New Device)
const manualRefCode = document.getElementById('reg-ref-code').value.trim();
let inviterUid = manualRefCode || localStorage.getItem('inviter_uid');

if (inviterUid && isNewDevice) {
    // রেফারারকে (যিনি ইনভাইট করেছেন) পয়েন্ট দেওয়া
    await runTransaction(ref(getDb(), `users/${inviterUid}/total_points`), (currentPoints) => {
        return (currentPoints || 0) + window.dynamicPoints.refer;
    });

await runTransaction(ref(getDb(), `users/${inviterUid}/referral_count`), (currentCount) => {
    return (currentCount || 0) + 1;
});

    // রেফারারকে নোটিফিকেশন পাঠানো
    await push(ref(getDb(), `notifications/${inviterUid}`), {
        type: 'referral_bonus',
        fromName: name,
        text: `আপনার রেফারেন্সে ${name} যুক্ত হয়েছে! আপনি ${window.dynamicPoints.refer} পয়েন্ট পেয়েছেন।`,
        timestamp: Date.now(),
        read: false
    });

    // কাজ শেষ হলে স্টোরেজ ক্লিয়ার করা
    localStorage.removeItem('inviter_uid');
}
                window.showToast("রেজিস্ট্রেশন সফল হয়েছে!", "success");

                // ফর্ম ক্লিয়ার এবং প্রথম ধাপে রিসেট করে দেওয়া
                document.getElementById('reg-name').value = '';
                document.getElementById('reg-email').value = '';
                document.getElementById('reg-phone').value = '';
                document.getElementById('reg-pass').value = '';
                document.getElementById('reg-privacy-agree').checked = false;
                window.prevRegStep(1); // আবার প্রথম ধাপে নিয়ে যাওয়া

            } catch (e) {
                window.showToast(e.message, 'error');
            } finally {
                btn.innerText = "রেজিস্ট্রেশন সম্পন্ন করুন";
                btn.disabled = false;
            }
        };

        // ==========================================
        // MULTI-ACCOUNT SWITCH SYSTEM LOGIC
        // ==========================================

        window.showLoginForm = () => {
            document.getElementById('saved-accounts-view').classList.add('hidden-custom');
            document.getElementById('login-form').classList.remove('hidden-custom');
            document.getElementById('login-email').value = "";
            document.getElementById('login-pass').value = "";
        };

        window.loadSavedAccounts = () => {
            const savedData = localStorage.getItem('saved_accounts');
            const accountsList = document.getElementById('saved-accounts-list');
            const savedView = document.getElementById('saved-accounts-view');
            const loginForm = document.getElementById('login-form');

            if (savedData) {
                const accounts = JSON.parse(savedData);
                if (accounts.length > 0) {
                    // সেভ করা একাউন্ট থাকলে সেগুলো দেখাবে, লগইন ফর্ম লুকাবে
                    savedView.classList.remove('hidden-custom');
                    loginForm.classList.add('hidden-custom');

                    accountsList.innerHTML = accounts.map(acc => `
                        <div class="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm text-center relative hover:border-green-500 hover:shadow-md transition cursor-pointer group">
                            <button type="button" onclick="removeSavedAccount('${acc.email}', event)" class="absolute top-2 right-2 w-6 h-6 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 text-xs transition z-10"><i class="fa-solid fa-xmark"></i></button>
                            <div onclick="quickLogin('${acc.email}', '${acc.pass}')">
                                <img alt="" src="${acc.pic || 'https://via.placeholder.com/100'}" loading="lazy" class="w-16 h-16 rounded-full object-cover mx-auto mb-2 border-2 border-green-100 group-hover:scale-105 transition">
                                <h4 class="font-bold text-gray-800 text-sm truncate">${window.escapeHTML(acc.name)}</h4>
                                <p class="text-[10px] text-gray-400 truncate mt-0.5">${window.escapeHTML(acc.email)}</p>
                            </div>
                        </div>
                    `).join('');
                    return true;
                }
            }
            // সেভ করা একাউন্ট না থাকলে সরাসরি লগইন ফর্ম দেখাবে
            savedView.classList.add('hidden-custom');
            loginForm.classList.remove('hidden-custom');
            return false;
        };

        window.saveAccountLocally = (email, plainPass, uid) => {
            let accounts = JSON.parse(localStorage.getItem('saved_accounts') || '[]');
            accounts = accounts.filter(a => a.email !== email); // Remove duplicate if exists

            accounts.push({
                email: email,
                pass: window.encryptMsg(plainPass), // Password Encrypted
                uid: uid,
                name: "অপেক্ষা করুন...",
                pic: ""
            });
            localStorage.setItem('saved_accounts', JSON.stringify(accounts));
        };

        window.updateSavedAccountProfile = (email, name, pic) => {
            let accounts = JSON.parse(localStorage.getItem('saved_accounts') || '[]');
            let accIndex = accounts.findIndex(a => a.email === email);
            if(accIndex > -1) {
                accounts[accIndex].name = name;
                accounts[accIndex].pic = pic;
                localStorage.setItem('saved_accounts', JSON.stringify(accounts));
            }
        };

        window.removeSavedAccount = (email, event) => {
            event.stopPropagation();
            if(!confirm("এই একাউন্টটি রিমুভ করতে চান?")) return;
            let accounts = JSON.parse(localStorage.getItem('saved_accounts') || '[]');
            accounts = accounts.filter(a => a.email !== email);
            localStorage.setItem('saved_accounts', JSON.stringify(accounts));
            window.loadSavedAccounts(); // UI Refresh
        };

        window.quickLogin = (email, encryptedPass) => {
            if (!navigator.onLine) return window.showToast("ইন্টারনেট সংযোগ নেই!", 'error');

            // স্ক্রিনে একটি সুন্দর লোডিং স্পিনার দেখানো হবে যাতে ডাবল ক্লিক না পড়ে
            const savedView = document.getElementById('saved-accounts-view');
            savedView.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 animate-fade">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-4 border-green-600 mb-4"></div>
                    <p class="font-bold text-gray-600 text-lg">একাউন্টে প্রবেশ করা হচ্ছে...</p>
                    <p class="text-xs text-gray-400 mt-1">দয়া করে অপেক্ষা করুন</p>
                </div>
            `;

            const plainPass = window.decryptMsg(encryptedPass);

            signInWithEmailAndPassword(getAuth(), email, plainPass).catch((e) => {
                window.showToast("পাসওয়ার্ড বা একাউন্ট বাতিল হয়েছে। আবার লগইন করুন।", 'error');
                window.showLoginForm();
                window.loadSavedAccounts(); // ডাটা ভুল হলে আবার লিস্ট ফিরিয়ে আনবে
            });
        };

        window.handleAccountSwitch = async () => {
            await signOut(getAuth()); // Sign out but keep local storage
            window.location.reload(); // রিলোড করলে স্বয়ংক্রিয়ভাবে সেভ করা একাউন্ট পেজে চলে যাবে
        };
        // ==========================================

        window.handleLogin = () => {
            if (!navigator.onLine) {
                window.showToast("ইন্টারনেট সংযোগ নেই! চেক করুন।", 'error');
                return;
            }
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-pass').value;
            const btn = document.getElementById('btn-login-action');

            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> যাচাই হচ্ছে...';
            btn.disabled = true;

            signInWithEmailAndPassword(getAuth(), email, pass).then((cred) => {
                // লগইন সফল হলে ব্রাউজারে সেভ করে রাখা হচ্ছে
                window.saveAccountLocally(email, pass, cred.user.uid);
            }).catch((e) => {
                window.showToast("ভুল ইমেইল বা পাসওয়ার্ড", 'error');
                btn.innerText = "লগইন";
                btn.disabled = false;
            });
        };

        // --- GOOGLE LOGIN FUNCTION (HYBRID SMART REDIRECT) ---
        window.handleGoogleLogin = async () => {
            if (!navigator.onLine) {
                window.showToast("ইন্টারনেট সংযোগ নেই! চেক করুন।", 'error');
                return;
            }

            const btn = document.getElementById('btn-google-login');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Google যাচাই হচ্ছে...';
            btn.disabled = true;

            try {
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });

                // যদি পপ-আপ সম্ভব হয় (যেমন ক্রোম ব্রাউজার), তবে দ্রুত লগইন করবে
                // অন্যথায় WebView হলে স্বয়ংক্রিয়ভাবে রিডাইরেক্ট করবে
                try {
                    const result = await signInWithPopup(getAuth(), provider);
                    if (result && result.user) {
                        const userRef = ref(getDb(), 'users/' + result.user.uid);
                        const snap = await get(userRef);
                        if (!snap.exists()) {
                            await set(userRef, {
                                name: result.user.displayName || "Google User",
                                email: result.user.email || "",
                                uid: result.user.uid,
                                profile_pic: result.user.photoURL || "",
                                role: 'user',
                                union: 'Unknown',
                                village: 'Unknown',
                                joinDate: new Date().toLocaleDateString(),
                                isVerified: false,
                                status: 'user',
                                phone: result.user.phoneNumber || ""
                            });
                        }
                        document.getElementById('auth-screen')?.classList.add('hidden-custom');
                        document.getElementById('main-app')?.classList.remove('hidden-custom');
                        window.showToast("লগইন সফল হয়েছে!", "success");
                    }
                } catch (popupErr) {
                    console.log("Popup blocked or failed, falling back to redirect...", popupErr);
                    await signInWithRedirect(getAuth(), provider);
                }
            } catch (error) {
                console.error("Google Login Error:", error);
                window.showToast("ত্রুটি: " + error.message, "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        // --- FACEBOOK LOGIN FUNCTION ---
        window.handleFacebookLogin = async () => {
            if (!navigator.onLine) {
                window.showToast("ইন্টারনেট সংযোগ নেই! চেক করুন।", 'error');
                return;
            }

            const btn = document.getElementById('btn-facebook-login');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> অপেক্ষা করুন...';
            btn.disabled = true;

            try {
                const provider = new FacebookAuthProvider();
                const result = await signInWithPopup(getAuth(), provider);
                const user = result.user;

                // ডাটাবেসে ইউজার চেক করা
                const { get, ref, set } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
                const userRef = ref(getDb(), 'users/' + user.uid);
                const snapshot = await get(userRef);

                if (!snapshot.exists()) {
                    // নতুন একাউন্ট হলে ডাটাবেসে তথ্য সেভ করা
                    const newUserData = {
                        name: user.displayName || "অজ্ঞাত ইউজার",
                        email: user.email || "", // Facebook sometimes doesn't provide email
                        uid: user.uid,
                        profile_pic: user.photoURL || "",
                        role: 'user',
                        union: 'Unknown',
                        village: 'Unknown',
                        joinDate: new Date().toLocaleDateString(),
                        isVerified: false,
                        status: 'user',
                        phone: user.phoneNumber || ""
                    };
                    await set(userRef, newUserData);

                    // Anti-fraud device check
                    try {
                        const fp = await window.FingerprintJS.load();
                        const fpResult = await fp.get();
                        let userIP = "unknown_ip";
                        try {
                            const ipRes = await fetch('https://api.ipify.org?format=json');
                            const ipData = await ipRes.json();
                            userIP = ipData.ip;
                        } catch(err) {}

                        await set(ref(getDb(), `registered_devices/${fpResult.visitorId}`), {
                            ip: userIP, timestamp: Date.now(), uid: user.uid
                        });
                        localStorage.setItem('has_registered_before', 'true');
                    } catch(err) {}

                    window.showToast("Facebook একাউন্ট খোলা সফল হয়েছে!", "success");
                } else {
                    window.showToast("লগইন সফল হয়েছে!", "success");
                }

            } catch (error) {
                console.error("Facebook Login Error:", error);
                if(error.code === 'auth/popup-closed-by-user') {
                    window.showToast("লগইন বাতিল করা হয়েছে", "error");
                } else if (error.code === 'auth/account-exists-with-different-credential') {
                    window.showToast("এই ইমেইল দিয়ে আগেই Google বা ইমেইল-পাসওয়ার্ড দিয়ে একাউন্ট খোলা হয়েছে!", "error");
                } else {
                    window.showToast("ত্রুটি: " + error.message, "error");
                }
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        window.submitMissingInfo = async () => {
            const union = document.getElementById('missing-union').value;
            const village = document.getElementById('missing-village').value;
            const phone = document.getElementById('missing-phone').value.trim();

            if (!union || !village) {
                return window.showToast("ইউনিয়ন এবং গ্রাম অবশ্যই নির্বাচন করতে হবে!", "error");
            }
            if (phone && !/^01[3-9]\d{8}$/.test(phone)) {
                return window.showToast("সঠিক মোবাইল নম্বর দিন", "error");
            }

            const btn = document.getElementById('btn-save-missing-info');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> সংরক্ষণ হচ্ছে...';
            btn.disabled = true;

            try {
                const updates = { union: union, village: village };
                if (phone) updates.phone = phone;

                // Firebase Database এ আপডেট করা
                await update(ref(getDb(), 'users/' + window.currentUser.uid), updates);

                // লোকাল ভেরিয়েবল আপডেট করা
                window.userDetails.union = union;
                window.userDetails.village = village;
                if (phone) window.userDetails.phone = phone;

                updateUIWithUserData();

                document.getElementById('missing-info-modal').classList.add('hidden-custom');
                window.showToast("আপনার তথ্য সফলভাবে সংরক্ষিত হয়েছে!", "success");
            } catch (e) {
                window.showToast("ত্রুটি: " + e.message, "error");
                btn.innerHTML = 'সংরক্ষণ করুন <i class="fa-solid fa-check"></i>';
                btn.disabled = false;
            }
        };

        window.handleForgotPass = () => {
            const email = document.getElementById('forgot-email').value.trim();
            if (!email) return window.showToast("আপনার ইমেইল দিন", 'error');
            const btn = document.getElementById('btn-forgot-action');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> পাঠানো হচ্ছে...';
            btn.disabled = true;
            sendPasswordResetEmail(getAuth(), email).then(() => {
                window.showToast("লিংক পাঠানো হয়েছে!");
                btn.innerText = "লিংক পাঠান";
                btn.disabled = false;
                window.toggleAuth('login');
            }).catch((e) => {
                window.showToast("ত্রুটি: " + e.message, 'error');
                btn.disabled = false;
            });
        };

