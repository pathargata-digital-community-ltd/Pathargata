/*
 * Loads the static UI fragments while the HTML parser is paused.
 * This keeps the existing inline/module script order intact while allowing
 * auth, app pages, and modal containers to be maintained independently.
 */
(function loadUIComponents() {
    function loadFragment(path) {
        const request = new XMLHttpRequest();
        request.open('GET', path, false);
        request.send(null);
        if (request.status >= 200 && request.status < 300) return request.responseText;
        throw new Error('Unable to load UI component: ' + path + ' (' + request.status + ')');
    }

    try {
        const authUI = loadFragment('auth-ui.html');
        const runtimeShell = loadFragment('components/runtime-shell.html');
        const appShell = loadFragment('components/app-shell.html')
            .replace('<!-- SERVICE_DASHBOARD_SLOT -->', loadFragment('service-dashboard.html'));
        const modalContainers = loadFragment('components/modal-containers.html');
        document.write([authUI, runtimeShell, appShell, modalContainers].join('\n'));
    } catch (error) {
        console.error(error);
        document.write('<div style="padding:1rem;color:#b91c1c;font-family:sans-serif">অ্যাপের UI লোড করা যায়নি। পেজটি আবার লোড করুন।</div>');
    }
})();
