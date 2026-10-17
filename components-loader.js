/*
 * Loads the static UI fragments while the HTML parser is paused.
 * This keeps the existing inline/module script order intact while allowing
 * auth, app pages, and modal containers to be maintained independently.
 */
(function loadUIComponents() {
    const fragments = [
        'auth-ui.html',
        'components/runtime-shell.html',
        'components/app-shell.html',
        'components/modal-containers.html'
    ];

    function loadFragment(path) {
        const request = new XMLHttpRequest();
        request.open('GET', path, false);
        request.send(null);
        if (request.status >= 200 && request.status < 300) return request.responseText;
        throw new Error('Unable to load UI component: ' + path + ' (' + request.status + ')');
    }

    try {
        document.write(fragments.map(loadFragment).join('\n'));
    } catch (error) {
        console.error(error);
        document.write('<div style="padding:1rem;color:#b91c1c;font-family:sans-serif">অ্যাপের UI লোড করা যায়নি। পেজটি আবার লোড করুন।</div>');
    }
})();
