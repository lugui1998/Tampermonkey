// ==UserScript==
// @name         YouTube Auto Original Audio Track
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Automatically selects the original audio track on YouTube.
// @author       Lugui
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            waitForVideoAndApplyFix();
        }
    }).observe(document, { childList: true, subtree: true });

    waitForVideoAndApplyFix();

    function waitForVideoAndApplyFix() {
        const interval = setInterval(() => {
            const settingsButton = document.querySelector('.ytp-settings-button');
            if (settingsButton) {
                clearInterval(interval);
                setTimeout(() => {
                    settingsButton.click();

                    setTimeout(() => {
                        const audioItem = [...document.querySelectorAll('.ytp-menuitem')]
                            .find(el => el.textContent.includes('Audio track') || el.textContent.includes('Faixa de áudio'));

                        if (!audioItem) {
                            console.log('no audio item');
                            closeSettingsMenu();
                            return;
                        }

                        const currentLabel = audioItem.querySelector('.ytp-menuitem-content')?.textContent?.toLowerCase() || '';
                        if (currentLabel.includes('original')) {
                            closeSettingsMenu();
                            return;
                        }

                        audioItem.click();

                        setTimeout(() => {
                            const options = [...document.querySelectorAll('.ytp-menuitem')];
                            const originalOption = options.find(el =>
                                el.textContent.toLowerCase().includes('original')
                            );

                            if (originalOption) {
                                originalOption.click();

                                setTimeout(() => {
                                    closeSettingsMenu();
                                }, 100);
                            } else {
                                closeSettingsMenu();
                            }
                        }, 100);
                    }, 100);
                }, 100);
            }
        }, 100);
    }

    function closeSettingsMenu() {
        const videoArea = document.querySelector('.html5-video-player');
        if (videoArea) {
            videoArea.click();
        }
    }
})();