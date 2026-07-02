import { ref, get, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- VERIFICATION LOGIC ---
window.checkVerificationStatus = () => {
    const db = window.db;
    const uid = window.currentUser.uid;
    get(ref(db, `users/${uid}`)).then(snap => {
        const user = snap.val();
        const status = user.verificationStatus || 'none';
        const expiry = user.verificationExpiry || 0;
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
            banner.classList.remove('hidden');
            banner.innerHTML = `
            <div class="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-circle-check text-green-600 text-xl"></i>
                    <div>
                        <h4 class="font-bold text-green-800">ভেরিফাইড প্রোফাইল</h4>
                        <p class="text-sm text-green-600">আপনার প্রোফাইল ভেরিফাইড। মেয়াদ আছে: <b>${daysLeft > 0 ? daysLeft : 0} দিন</b></p>
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

window.selectPlan = (id, price, duration) => {
    document.querySelectorAll('.plan-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`plan-${id}`).classList.add('selected');
    document.getElementById('selected-plan-id').value = id;
    document.getElementById('verification-payment-section').classList.remove('hidden');
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
    const nid = document.getElementById('verify-nid').value.trim();
    const docFile = document.getElementById('verify-doc-img').files[0];
    const userFile = document.getElementById('verify-user-img').files[0];

    if (!planId) return window.showToast("প্ল্যান সিলেক্ট করুন", "error");
    if (!method || !paymentNumber || !trxId) return window.showToast("পেমেন্ট তথ্য দিন", "error");
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