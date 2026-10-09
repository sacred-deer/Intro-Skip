const DEFAULT_ENABLED = true;

const toggle = document.getElementById("enabled-toggle");
const statusLabel = document.getElementById("status-label");
const statusHint = document.getElementById("status-hint");

function render(enabled) {
  toggle.checked = enabled;
  statusLabel.textContent = enabled ? "Enabled" : "Disabled";
  statusHint.textContent = enabled
    ? "Intros skip automatically"
    : "You will click Skip Intro yourself";
}

if (chrome?.storage?.sync) {
  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
    render(Boolean(result.enabled));
  });
} else {
  render(DEFAULT_ENABLED);
}

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  render(enabled);
  if (chrome?.storage?.sync) {
    chrome.storage.sync.set({ enabled });
  }
});
