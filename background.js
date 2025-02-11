const AI_SITES = {
    "chatgpt.com": "ChatGPT",
    "claude.ai": "Claude",
    "gemini.google.com": "Gemini",
    "bard.google.com": "Bard"
};

let currentTabId = null;
let trackingStart = null;

// Extract clean domain name from URL
function getCleanDomain(url) {
    try {
        const urlObj = new URL(url);
        return Object.keys(AI_SITES).find(domain => urlObj.hostname.includes(domain)) || "unknown";
    } catch {
        return "unknown";
    }
}

// Initialize or reset daily data
function initializeDailyData() {
    const today = new Date().toISOString().split("T")[0];
    const defaultData = {
        totalTime: 0,
        aiTime: 0,
        aiUsage: {},
        lastAIUsed: {
            website: null,
            timestamp: null
        },
        tabsOpened: 0,
        tabsClosed: 0
    };

    chrome.storage.local.set({ [today]: defaultData });
    return defaultData;
}

// Get today's data
async function getTodayData() {
    const today = new Date().toISOString().split("T")[0];
    return new Promise((resolve) => {
        chrome.storage.local.get([today], (result) => {
            resolve(result[today] || initializeDailyData());
        });
    });
}

// Update storage with new data
// Update storage with new data and cumulative tab count
// Update storage with new data
async function updateStorage(updates) {
    const today = new Date().toISOString().split("T")[0];
    const currentData = await getTodayData();

    // Deep merge updates
    const newData = {
        ...currentData,
        ...updates,
        aiUsage: {
            ...currentData.aiUsage,
            ...(updates.aiUsage || {})
        },
        tabsOpened: currentData.tabsOpened + (updates.tabsOpened || 0),
        tabsClosed: currentData.tabsClosed + (updates.tabsClosed || 0)
    };

    chrome.storage.local.set({ [today]: newData });
}

// Track total tabs opened
chrome.tabs.onCreated.addListener(() => {
    updateStorage({ tabsOpened: 1 });
});

// Track total tabs closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (currentTabId === tabId) {
        stopTracking();
    }
    updateStorage({ tabsClosed: 1 });
});


// // Track total tabs opened
// chrome.tabs.onCreated.addListener(() => {
//     updateStorage({ tabsOpened: 1 });
// });

// // Track total tabs closed
// chrome.tabs.onRemoved.addListener((tabId) => {
//     if (currentTabId === tabId) {
//         stopTracking();
//     }
//     updateStorage({ tabsClosed: 1 });
// });

function startTracking(tabId, url) {
    if (currentTabId !== tabId) {
        stopTracking();
        currentTabId = tabId;
        trackingStart = Date.now();
        
        const domain = getCleanDomain(url);
        const siteName = AI_SITES[domain] || domain;
        
        updateStorage({
            lastAIUsed: {
                website: siteName,
                timestamp: Date.now()
            }
        });
    }
}

async function stopTracking() {
    if (currentTabId && trackingStart) {
        const elapsed = Date.now() - trackingStart;
        const data = await getTodayData();
        const currentSite = data.lastAIUsed?.website;
        
        if (currentSite && currentSite !== 'unknown') {
            const updates = {
                totalTime: data.totalTime + elapsed,
                aiTime: data.aiTime + elapsed,
                aiUsage: {
                    [currentSite]: (data.aiUsage[currentSite] || 0) + elapsed
                }
            };
            await updateStorage(updates);
        }

        trackingStart = null;
        currentTabId = null;
    }
}

// Event Listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
        if (!tab.url) return;
        
        const domain = getCleanDomain(tab.url);
        if (domain in AI_SITES) {
            startTracking(tabId, tab.url);
        } else if (currentTabId === tabId) {
            stopTracking();
        }
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        const domain = getCleanDomain(tab.url);
        
        if (domain in AI_SITES) {
            startTracking(activeInfo.tabId, tab.url);
        } else {
            stopTracking();
        }
    } catch (error) {
        console.error("Error in tab activation:", error);
    }
});

// chrome.tabs.onRemoved.addListener((tabId) => {
//     if (currentTabId === tabId) {
//         stopTracking();
//         updateStorage({ tabsClosed: 1 });
//     }
// });

// chrome.tabs.onCreated.addListener(() => {
//     updateStorage({ tabsOpened: 1 });
// });

// Set up daily reset
chrome.alarms.create('dailyReset', { 
    when: getNextMidnight(),
    periodInMinutes: 1440 // 24 hours
});

function getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailyReset') {
        initializeDailyData();
    }
});

// Initialize on extension load
initializeDailyData();