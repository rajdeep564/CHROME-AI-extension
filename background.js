const AI_SITES = ["chatgpt.com", "claude.ai", "gemini.google.com", "bard.google.com"];
let currentTabId = null;
let trackingStart = null;
let trackingData = {};

// Load stored tracking data and ensure daily reset
chrome.storage.local.get("aiTrackerData", (data) => {
    trackingData = data.aiTrackerData || {};
    resetDailyData();
});

// Ensure daily reset
function resetDailyData() {
    let today = new Date().toISOString().split("T")[0];
    if (trackingData.date !== today) {
        console.log("🔄 Resetting daily tracking data.");
        trackingData = { 
            date: today, 
            totalTime: 0, 
            aiTime: 0, 
            aiUsage: {}, 
            lastAIUsed: { website: null, timestamp: null }, // Ensure it's always present
            tabsOpened: 0, 
            tabsClosed: 0 
        };
        chrome.storage.local.set({ aiTrackerData: trackingData });
    }
}


// Converts milliseconds to hh:mm:ss format
function formatTime(ms) {
    let seconds = Math.floor(ms / 1000);
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    seconds = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Update tracking data in storage safely
function updateTrackingData(updateObj) {
    const today = new Date().toISOString().split("T")[0];

    chrome.storage.local.get(["aiTrackerData"], (result) => {
        let data = result.aiTrackerData || { 
            date: today, 
            totalTime: 0, 
            aiTime: 0, 
            aiUsage: {}, 
            lastAIUsed: { website: null, timestamp: null }, 
            tabsOpened: 0, 
            tabsClosed: 0 
        };

        // Ensure daily reset
        if (data.date !== today) {
            console.log("🔄 Daily reset triggered in updateTrackingData.");
            resetDailyData();
            return;
        }

        // Merge updates properly
        Object.keys(updateObj).forEach((key) => {
            if (typeof updateObj[key] === "number") {
                data[key] = (data[key] || 0) + updateObj[key]; // ✅ Accumulate values
            } else if (typeof updateObj[key] === "object") {
                Object.keys(updateObj[key]).forEach((subKey) => {
                    data[key][subKey] = (data[key][subKey] || 0) + updateObj[key][subKey]; // ✅ Accumulate AI usage time
                });
            } else {
                data[key] = updateObj[key]; // Direct assignment for non-numeric fields
            }
        });

        chrome.storage.local.set({ aiTrackerData: data }, () => {
            console.log("✅ Updated Tracking Data:", data);
        });
    });
}


// Starts tracking AI site usage
function startTracking(tabId, url) {
    if (currentTabId !== tabId) {
        stopTracking(); // Stop previous tracking session if any
        currentTabId = tabId;
        trackingStart = Date.now();
        console.log(`▶ Started tracking: ${url} at ${new Date().toLocaleTimeString()}`);

        if (!trackingData.aiUsage[url]) trackingData.aiUsage[url] = 0;

        updateTrackingData({ lastAIUsed: { website: url.replace(/^0/, ""), timestamp: Date.now() } }); // ✅ Fix "0" prefix issue
    }
}


// Stops tracking and logs usage
function stopTracking() {
    if (currentTabId && trackingStart) {
        let elapsed = Date.now() - trackingStart;
        console.log(`⏸ Stopping tracking. Time spent: ${formatTime(elapsed)}`);

        let currentUrl = trackingData.lastAIUsed?.website ? trackingData.lastAIUsed.website : "unknown"; // Ensure safe access

        updateTrackingData({
            totalTime: elapsed,
            aiTime: AI_SITES.some((site) => currentUrl.includes(site)) ? elapsed : 0,
            aiUsage: { [currentUrl]: elapsed }
        });

        trackingStart = null;
        currentTabId = null;
    }
}


// Track when a tab is updated (URL change)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
        if (!tab.url) {
            console.error("⛔ Error: Tab URL is undefined!");
            return;
        }

        let isAI = AI_SITES.some((site) => tab.url.includes(site));
        if (isAI) {
            console.log(`🌍 AI Site detected: ${tab.url}, starting tracking.`);
            startTracking(tabId, tab.url);
        } else if (currentTabId === tabId) {
            console.log(`🚫 Navigated away from AI site, pausing tracking.`);
            stopTracking();
        }
    }
});

// Track when a tab is activated (switched)
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError || !tab.url) {
            console.error("⛔ Error: Could not get tab info or URL is undefined.");
            return;
        }

        let isAI = AI_SITES.some((site) => tab.url.includes(site));
        if (isAI) {
            console.log(`🔄 Switched to AI site: ${tab.url}, resuming tracking.`);
            startTracking(activeInfo.tabId, tab.url);
        } else {
            console.log(`⏸ Switched to a non-AI site, pausing tracking.`);
            stopTracking();
        }
    });
});

// Track when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (currentTabId === tabId) {
        console.log("❌ Tracked AI tab closed, stopping tracking.");
        stopTracking();
        updateTrackingData({ tabsClosed: 1 });
    }
});

// Track when a new tab is opened
chrome.tabs.onCreated.addListener(() => {
    console.log("🆕 New tab opened.");
    updateTrackingData({ tabsOpened: 1 });
});

// Setup an alarm for daily reset
chrome.alarms.create("dailyReset", { periodInMinutes: 1440 }); // 1440 minutes = 24 hours
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "dailyReset") {
        resetDailyData();
    }
});
