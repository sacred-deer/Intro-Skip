const DEFAULT_ENABLED = true;

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#E50914" : "#6B7280",
  });
  chrome.action.setTitle({
    title: enabled ? "Intro Skip — enabled" : "Intro Skip — disabled",
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
    setBadge(result.enabled);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
    setBadge(result.enabled);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    setBadge(Boolean(changes.enabled.newValue));
  }
});

chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
  setBadge(result.enabled);
});
