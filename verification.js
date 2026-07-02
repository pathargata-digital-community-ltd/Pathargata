import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- VERIFICATION LOGIC ---
window.checkVerificationStatus = () => {
    const db = window.db;
    const uid = window.currentUser.uid;
    get(ref(db, `users/${uid}`)).then(snap => {
        const user = snap.val();
        const status = user.verificationStatus || 'none';
        const expiry = user.verificationExpiry || 0;
        const verifyCategory = user.verificationCategory || 'verified';
        const banner = document.getElementById('verify-status-banner');
        const formContainer = document.getElementById('verify-form-container');
        const plansContainer = document.getElementById('verification-plans-container');

        if (status === 'verified' && Date.now() > expiry) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-4">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-clock-rotate-left text-red-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-red-800">মেয়াদ শেষ হয়েছে</h4>
                        <p class="text-sm text-red-600">আপনার ভেরিফিকেশন ব্যাজের মেয়াদ শেষ হয়েছে। পুনরায় আবেদন করুন।</p>
                    </div>
                </div>
            </div>`;
            formContainer.classList.remove('hidden');
            loadVerificationPlans(plansContainer);
            return;
        }

        if (status === 'pending') {
            banner.classList.remove('hidden');
            banner.innerHTML = `
            <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-hourglass-half text-yellow-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-yellow-800">আবেদন পর্যালোচনাধীন</h4>
                        <p class="text-sm text-yellow-600">আপনার আবেদনটি এডমিন রিভিউ করছেন। দয়া করে অপেক্ষা করুন।</p>
                      </div>
                </div>
            </div>`;
            formContainer.classList.add('hidden'); 
        } else if (status === 'verified') {
            const daysLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
            
            // ক্যাটাগরি অনুযায়ী প্রফেশনাল ডাটা সেট করা (রং, আইকন, ডেসক্রিপশন)
            const badgeDetails = {
                'public_figure': { name: 'পাবলিক ফিগার', icon: 'fa-user-shield', color: 'text-blue-600', bg: 'bg-blue-50', ring: 'rgba(37, 99, 235, 0.4)', desc: 'আপনি একজন স্বনামধন্য ব্যক্তিত্ব হিসেবে আমাদের প্ল্যাটফর্মে স্বীকৃত। আপনার পরিচিতি এখন সুরক্ষিত।' },
                'content_creator': { name: 'কন্টেন্ট ক্রিয়েটর', icon: 'fa-clapperboard', color: 'text-purple-600', bg: 'bg-purple-50', ring: 'rgba(147, 51, 234, 0.4)', desc: 'আপনার ক্রিয়েটিভ কন্টেন্টগুলো আমাদের কমিউনিটিকে সমৃদ্ধ করছে। কিপ ইট আপ!' },
                'journalist': { name: 'সাংবাদিক', icon: 'fa-newspaper', color: 'text-teal-600', bg: 'bg-teal-50', ring: 'rgba(13, 148, 136, 0.4)', desc: 'সত্য ও বস্তুনিষ্ঠ তথ্য প্রচারে আপনার ভূমিকা প্রশংসনীয়। আপনার প্রোফাইল এখন ভেরিফাইড।' },
                'business': { name: 'ভেরিফাইড ব্যবসা', icon: 'fa-store', color: 'text-orange-600', bg: 'bg-orange-50', ring: 'rgba(234, 88, 12, 0.4)', desc: 'আপনার ব্যবসা/ব্র্যান্ডের বিশ্বস্ততা নিশ্চিত করা হয়েছে। গ্রাহকরা এখন আপনাকে বিশ্বাস করতে পারে।' },
                'others': { name: 'ভেরিফাইড প্রোফাইল', icon: 'fa-circle-check', color: 'text-green-600', bg: 'bg-green-50', ring: 'rgba(22, 163, 74, 0.4)', desc: 'আপনার প্রোফাইলটি সফলভাবে ভেরিফাই করা হয়েছে এবং ব্লু ব্যাজ যুক্ত করা হয়েছে।' }
            };

            // যদি ইউজারের ক্যাটাগরি লিস্টে না থাকে, তবে ডিফল্ট হিসেবে 'others' দেখাবে
            const badge = badgeDetails[verifyCategory] || badgeDetails['others'];

            banner.classList.remove('hidden');
            banner.innerHTML = `
            <style>
                @keyframes floatBadge {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                @keyframes glowPulse {
                    0% { box-shadow: 0 0 0 0 ${badge.ring}; }
                    70% { box-shadow: 0 0 0 20px rgba(0,0,0,0); }
                    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
                }
                .badge-animated {
                    animation: floatBadge 3s ease-in-out infinite;
                }
                .badge-glow {
                    animation: glowPulse 2s infinite;
                    border-radius: 50%;
                }
            </style>
            
            <div class="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden mb-6 text-center">
                <!-- Top Decoration -->
                <div class="${badge.bg} h-24 w-full relative overflow-hidden">
                    <div class="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                </div>
                
                <!-- Animated Large Badge -->
                <div class="relative -mt-16 flex justify-center pb-2">
                    <div class="badge-animated badge-glow bg-white p-2 inline-block shadow-lg">
                        <div class="w-24 h-24 rounded-full ${badge.bg} flex flex-col items-center justify-center border-4 border-white shadow-inner">
                            <i class="fa-solid ${badge.icon} ${badge.color} text-4xl mb-1 drop-shadow-md"></i>
                            <i class="fa-solid fa-certificate ${badge.color} text-sm absolute bottom-2 right-2 drop-shadow"></i>
                        </div>
                    </div>
                </div>

                <!-- Text Content -->
                <div class="px-6 pb-8 pt-2">
                    <h3 class="font-extrabold text-2xl text-gray-800 mb-1 flex justify-center items-center gap-2">
                        ${badge.name} 
                    </h3>
                    <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Official Badge</p>
                    
                    <p class="text-gray-600 text-sm leading-relaxed mb-6">
                        ${badge.desc}
                    </p>

                    <!-- Expiry Info -->
                    <div class="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100 shadow-sm">
                        <i class="fa-regular fa-clock text-gray-400"></i>
                        <span class="text-sm font-semibold text-gray-700">মেয়াদ আছে: <span class="${badge.color}">${daysLeft > 0 ? daysLeft : 0} দিন</span></span>
                    </div>
                </div>
            </div>`;
            
            formContainer.classList.add('hidden');
        } else if (status === 'rejected') {
            banner.classList.remove('hidden');
            banner.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg mb-4">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-circle-xmark text-red-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-red-800">আবেদন বাতিল হয়েছে</h4>
                        <p class="text-sm text-red-600">আপনার আগের আবেদনটি বাতিল করা হয়েছে। দয়া করে সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।</p>
                    </div>
                </div>
            </div>`;
            formContainer.classList.remove('hidden'); 
            loadVerificationPlans(plansContainer);
        } else {
            banner.classList.add('hidden');
            formContainer.classList.remove('hidden');
            loadVerificationPlans(plansContainer);
        }
    });
}

function loadVerificationPlans(container) {
    const db = window.db;
    container.innerHTML = '<p class="text-center text-sm text-gray-400">প্ল্যান লোড হচ্ছে...</p>';
    get(ref(db, 'admin_settings/verification_plans')).then((snap) => {
        const plans = snap.val();
        if (plans) {
            container.innerHTML = Object.entries(plans).map(([key, plan]) => {
                return `<div onclick="selectPlan('${key}', '${plan.price}', '${plan.duration}')" id="plan-${key}" class="plan-card bg-white p-3 rounded-xl border flex justify-between items-center cursor-pointer hover:shadow-sm mb-2">
                <div>
                    <h4 class="font-bold text-gray-800">${plan.name}</h4>
                    <p class="text-xs text-gray-500">${plan.duration} দিনের জন্য</p>
                    ${plan.trial ? '<span class="text-[10px] bg-green-100 text-green-700 px-1 rounded font-bold">Free Trial Available</span>' : ''}
                </div>
                <span class="font-bold text-blue-600">৳ ${plan.price}</span>
            </div>`;
            }).join('');
        } else {
            const defaults = [
                { id: 'p1', name: 'Starter', price: 100, duration: 30 },
                { id: 'p2', name: 'Pro', price: 500, duration: 180 },
                { id: 'p3', name: 'Yearly', price: 900, duration: 365 }
            ];
            container.innerHTML = defaults.map(plan => `
            <div onclick="selectPlan('${plan.id}', '${plan.price}', '${plan.duration}')" id="plan-${plan.id}" class="plan-card bg-white p-3 rounded-xl border flex justify-between items-center cursor-pointer hover:shadow-sm mb-2">
                <div><h4 class="font-bold text-gray-800">${plan.name}</h4><p class="text-xs text-gray-500">${plan.duration} দিন</p></div>
                <span class="font-bold text-blue-600">৳ ${plan.price}</span>
            </div>`).join('');
        }
    });
}

window.selectCategory = (category) => {
    // আগের সিলেক্ট করা কার্ডের ডিজাইন মুছে ফেলা
    document.querySelectorAll('.category-card').forEach(el => el.classList.remove('selected'));
    
    // যেটিতে ক্লিক করেছে সেটিতে সিলেক্টেড ডিজাইন যুক্ত করা
    document.getElementById(`cat-${category}`).classList.add('selected');
    
    // হিডেন ইনপুটে ভ্যালু সেট করা
    document.getElementById('selected-category').value = category;
    
    // পরবর্তী স্টেপ (প্যাকেজ নির্বাচন) শো করানো
    document.getElementById('verification-plans-section').classList.remove('hidden');
    
    // একটু স্মুথলি স্ক্রোল করে প্যাকেজ সেকশনে নিয়ে যাওয়া
    setTimeout(() => {
        document.getElementById('verification-plans-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
}

window.selectPlan = (id, price, duration) => {
    document.querySelectorAll('.plan-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`plan-${id}`).classList.add('selected');
    document.getElementById('selected-plan-id').value = id;
    document.getElementById('verification-payment-section').classList.remove('hidden');
    document.getElementById('verification-category-section').classList.remove('hidden');
    document.getElementById('verification-docs-section').classList.remove('hidden');
    document.getElementById('btn-verify-submit').classList.remove('hidden');
    document.getElementById('btn-verify-submit').disabled = false;

    document.getElementById('verification-payment-section').scrollIntoView({ behavior: 'smooth' });
}

window.selectPaymentMethod = (method) => {
    const db = window.db;
    document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById(`pay-${method.toLowerCase()}`);
    if (el) el.classList.add('selected');

    document.getElementById('selected-payment-method').value = method;
    document.getElementById('admin-number').innerText = "লোডিং...";

    get(ref(db, `admin_settings/payment_numbers/${method.toLowerCase()}`)).then((snap) => {
        const num = snap.val();
        if (num) {
            document.getElementById('admin-number').innerText = num;
            document.getElementById('admin-number').classList.remove('text-gray-900');
            document.getElementById('admin-number').classList.add('text-black', 'font-bold');
        } else {
            document.getElementById('admin-number').innerText = "নাম্বার সেট করা নেই";
        }
    }).catch((e) => {
        console.error(e);
        document.getElementById('admin-number').innerText = "নেটওয়ার্ক এরর";
    });
}

window.submitVerification = async () => {
    const db = window.db;
    const planId = document.getElementById('selected-plan-id').value;
    const method = document.getElementById('selected-payment-method').value;
    const paymentNumber = document.getElementById('verify-payment-number').value;
    const trxId = document.getElementById('verify-trx-id').value;
    const category = document.getElementById('selected-category').value;
    const nid = document.getElementById('verify-nid').value.trim();
    const docFile = document.getElementById('verify-doc-img').files[0];
    const userFile = document.getElementById('verify-user-img').files[0];

    if (!planId) return window.showToast("প্ল্যান সিলেক্ট করুন", "error");
    if (!method || !paymentNumber || !trxId) return window.showToast("পেমেন্ট তথ্য দিন", "error");
    if (!category) return window.showToast("ভেরিফিকেশন ক্যাটাগরি সিলেক্ট করুন", "error");
    if (!nid || !docFile || !userFile) return window.showToast("ডকুমেন্টস ও ছবি দিন", "error");

    const btn = document.getElementById('btn-verify-submit');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> প্রসেসিং...';
    btn.disabled = true;

    try {
        const [docRes, userRes] = await Promise.all([window.uploadMediaToCloudinary(docFile), window.uploadMediaToCloudinary(userFile)]);

        const reqData = {
            uid: window.currentUser.uid,
            name: window.userDetails.name,
            planId,
            paymentMethod: method,
            paymentNumber,
            trxId,
            category,
            nid,
            docImage: docRes.url,
            userImage: userRes.url,
            timestamp: Date.now(),
            status: 'pending' 
        };

        await set(ref(db, 'verification_requests/' + window.currentUser.uid), reqData);
        await update(ref(db, 'users/' + window.currentUser.uid), { verificationStatus: 'pending' });

        window.showToast("আবেদন সফলভাবে জমা হয়েছে!");
        window.checkVerificationStatus();

    } catch (e) {
        console.error(e);
        window.showToast("ত্রুটি: " + e.message, 'error');
        btn.innerHTML = "সাবমিট করুন";
        btn.disabled = false;
    }
}