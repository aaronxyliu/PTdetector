var head = document.getElementsByTagName('head')[0];
var detectScript = document.createElement('script');
detectScript.src = chrome.runtime.getURL('content_scripts/detect.js');
head.appendChild(detectScript);

var detectResultMeta = document.createElement('meta');
detectResultMeta.setAttribute("id", "lib-detect-result");
head.appendChild(detectResultMeta);

var detectTimeMeta = document.createElement('meta');
detectTimeMeta.setAttribute("id", "lib-detect-time");
head.appendChild(detectTimeMeta);


const url1 = chrome.runtime.getURL('data/blacklist.json');
const url2 = chrome.runtime.getURL('data/pts.json');
const url3 = chrome.runtime.getURL('data/DetectFile.json');


/**
 * Listen for messages from the background script.
 * Call "insertBeast()" or "removeExistingBeasts()".
 */
chrome.runtime.onMessage.addListener((message) => {
    if (message.command === "detect") {
        window.postMessage({type: 'detect', urls: [url1, url2, url3]}, "*")
        console.log('send message <detect>.')
    }
    else {
        console.log(`Receive command ${message.command}.`)
    }
});

window.addEventListener("message", function (event) {
    if (event.data.type == 'response') {
        console.log("Response received.")
        chrome.runtime.sendMessage({command: "showresult", data: event.data.detected_libs});
    }
})


// Only used for Selenium automation
setTimeout(() => {
    window.postMessage({type: 'detect', urls: [url1, url2, url3]}, "*")
    console.log('auto send message <detect>.')
}, 10 *1000);





  