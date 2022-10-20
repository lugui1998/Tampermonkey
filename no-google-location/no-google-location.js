// ==UserScript==
// @name         No Google Location
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Removes Google search footer with your location
// @author       Lugui
// @match        https://www.google.com/search?q=minecraft&oq=minecraft&aqs=chrome.0.69i59l5j69i61j69i60j69i61.1408j0j1&sourceid=chrome&ie=UTF-8
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    window.addEventListener('load', function() {
        // get the fbar by id
        var fbar = document.getElementById('fbar');

        // get the second div on it
        var div = fbar.children[1];

        // remove it
        fbar.removeChild(div);
    });
})();