/* dark-mode.js */

// পেজ লোড হওয়ার সাথে সাথে চেক করবে আগে ডার্ক মোড অন করা ছিল কিনা
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    const darkModeToggle = document.getElementById('setting-dark-mode-toggle');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = true;
    }

    // অবজার্ভার: যদি সেটিংস পেজ পরে লোড হয়, তখন টগল বাটন আপডেট করার জন্য
    const observer = new MutationObserver(() => {
        const toggle = document.getElementById('setting-dark-mode-toggle');
        if (toggle && savedTheme === 'dark') {
            toggle.checked = true;
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
});

// ডার্ক মোড অন/অফ করার মেইন ফাংশন
window.toggleDarkMode = function(isChecked) {
    if (isChecked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        if (window.showToast) window.showToast("ডার্ক মোড চালু হয়েছে");
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        if (window.showToast) window.showToast("লাইট মোড চালু হয়েছে");
    }
};
