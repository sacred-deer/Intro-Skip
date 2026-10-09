(() => {
  const DEFAULT_ENABLED = true;
  const TICK_MS = 1000;
  const MUTATION_THROTTLE_MS = 300;
  const BURST_INTERVAL_MS = 250;
  const BURST_DURATION_MS = 4000;
  const RETRY_AFTER_MS = 3000;
  const MAX_ATTEMPTS = 3;
  const DEEP_REFRESH_MS = 2000;
  const MAX_LABEL_LENGTH = 60;

  const SKIP_WORDS =
    /skip|passer|ignorer|omitir|saltar|pular|überspringen|salta|スキップ|건너뛰기|跳过|跳過|略過/i;
  const INTRO_WORDS =
    /intro|générique|generique|opening|vorspann|オープニング|イントロ|오프닝|인트로|片头|片頭|介绍|介紹/i;
  const NOT_INTRO_WORDS =
    /recap|récap|resumen|résumé|riepilogo|zusammenfassung|credits|crédits|générique de fin|next|suivant/i;

  const SITES = [
    {
      id: "netflix",
      host: /(^|\.)netflix\.com$/,
      isPlayerPage: () => location.pathname.includes("/watch"),
      findButton() {
        return (
          firstMatch(document.querySelectorAll('[data-uia="player-skip-intro"]')) ||
          firstMatch(
            document.querySelectorAll(".watch-video--skip-content-button"),
            isIntroLabel
          )
        );
      },
    },
    {
      id: "prime",
      host: /(^|\.)(primevideo|amazon)\.[a-z.]+$/,
      isPlayerPage: () => Boolean(document.querySelector("video")),
      findButton() {
        const skipElements = ".atvwebplayersdk-skipelement-button";
        const player = document.querySelector(
          "#dv-web-player, .webPlayerSDKContainer, .webPlayerUIContainer"
        );
        if (!player) {
          return firstMatch(document.querySelectorAll(skipElements), isIntroLabel);
        }
        return (
          firstMatch(player.querySelectorAll(skipElements), isIntroLabel) ||
          scanForSkipIntro(player)
        );
      },
    },
    {
      id: "disney",
      host: /(^|\.)disneyplus\.com$/,
      searchShadowDom: true,
      needsPointerEvents: true,
      isPlayerPage: () =>
        /\/(video|play)\//.test(location.pathname) ||
        Boolean(document.querySelector("disney-web-player")),
      findButton() {
        const legacy = firstMatch(
          document.querySelectorAll("button.skip__button"),
          isIntroLabel
        );
        if (legacy) return legacy;

        // The current player renders the button inside nested open shadow
        // roots under <skip-overlay>, with no class or test id to target.
        for (const overlay of cachedDeepQuery("skip-overlay")) {
          if (!overlay.shadowRoot) continue;
          const button = firstMatch(
            deepQueryAll(overlay.shadowRoot, "button, [role='button'], [tabindex='0']"),
            isSkipIntroLabel
          );
          if (button) return button;
        }
        return null;
      },
    },
    {
      id: "crave",
      host: /(^|\.)crave\.ca$/,
      isPlayerPage: () => Boolean(document.querySelector("video")),
      findButton() {
        return (
          firstMatch(
            document.querySelectorAll(".skipbreaks-click-area, #bm-view-skipbreaks2"),
            isIntroLabel
          ) || scanForSkipIntro(document)
        );
      },
    },
  ];

  const site = SITES.find((candidate) => candidate.host.test(location.hostname));
  if (!site) return;

  let enabled = DEFAULT_ENABLED;
  let tickTimer = null;
  let observer = null;
  let trailingTimer = null;
  let burstTimer = null;
  let burstUntil = 0;
  let lastCheckAt = 0;
  let lastClick = null;
  const deepCache = new Map();
  const listenedVideos = new WeakSet();

  function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function labelOf(el) {
    return normalize(`${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`);
  }

  function isIntroLabel(label) {
    return INTRO_WORDS.test(label) && !NOT_INTRO_WORDS.test(label);
  }

  function isSkipIntroLabel(label) {
    return label.length <= MAX_LABEL_LENGTH && SKIP_WORDS.test(label) && isIntroLabel(label);
  }

  // Opacity is deliberately ignored: skip buttons fade in, and CSS transitions
  // don't advance while the tab is hidden (e.g. the video is in PiP).
  function isRendered(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    return window.getComputedStyle(el).visibility !== "hidden";
  }

  function firstMatch(elements, labelTest) {
    for (const el of elements) {
      const target = el.closest("button, [role='button']") || el;
      if (!isRendered(target)) continue;
      if (labelTest && !labelTest(labelOf(target))) continue;
      return target;
    }
    return null;
  }

  function scanForSkipIntro(root) {
    return firstMatch(root.querySelectorAll("button, [role='button']"), isSkipIntroLabel);
  }

  function deepQueryAll(root, selector) {
    const found = [];
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      for (const el of current.querySelectorAll("*")) {
        if (el.matches(selector)) found.push(el);
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    return found;
  }

  function cachedDeepQuery(selector) {
    let entry = deepCache.get(selector);
    if (!entry) {
      entry = { elements: [], refreshedAt: 0 };
      deepCache.set(selector, entry);
    }
    entry.elements = entry.elements.filter((el) => el.isConnected);
    if (!entry.elements.length && Date.now() - entry.refreshedAt >= DEEP_REFRESH_MS) {
      entry.elements = deepQueryAll(document, selector);
      entry.refreshedAt = Date.now();
    }
    return entry.elements;
  }

  function findVideo() {
    let videos = Array.from(document.querySelectorAll("video"));
    if (!videos.length && site.searchShadowDom) videos = cachedDeepQuery("video");

    let best = null;
    for (const video of videos) {
      if (!listenedVideos.has(video)) {
        listenedVideos.add(video);
        video.addEventListener("play", onPlaybackChange);
        video.addEventListener("pause", onPlaybackChange);
      }
      if (!(video.duration > 0)) continue;
      if (
        !best ||
        (!video.paused && best.paused) ||
        (video.paused === best.paused && video.duration > best.duration)
      ) {
        best = video;
      }
    }
    return best;
  }

  // Returns "new" for a fresh button, "retry" when an earlier click on the
  // same button didn't take effect, or null when it should be left alone.
  // Some players leave the button in the DOM after skipping; clicking it
  // again would seek back to the end of the intro.
  function decideClick(button, label, video) {
    const src = video ? video.currentSrc : "";
    if (
      !lastClick ||
      lastClick.button !== button ||
      lastClick.label !== label ||
      lastClick.src !== src
    ) {
      return "new";
    }

    const elapsedMs = Date.now() - lastClick.at;
    if (video && lastClick.mediaTime != null) {
      const moved = video.currentTime - lastClick.mediaTime;
      if (moved < -2) return "new";
      if (moved > elapsedMs / 1000 + 2) return null;
    }

    return elapsedMs >= RETRY_AFTER_MS && lastClick.attempts < MAX_ATTEMPTS ? "retry" : null;
  }

  function press(button) {
    if (site.needsPointerEvents) {
      const rect = button.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      const pointer = { pointerId: 1, isPrimary: true, pointerType: "mouse" };
      button.dispatchEvent(new PointerEvent("pointerdown", { ...init, ...pointer, buttons: 1 }));
      button.dispatchEvent(new MouseEvent("mousedown", { ...init, buttons: 1 }));
      button.dispatchEvent(new PointerEvent("pointerup", { ...init, ...pointer }));
      button.dispatchEvent(new MouseEvent("mouseup", init));
    }
    button.click();
  }

  function setObserving(on) {
    if (on && !observer) {
      observer = new MutationObserver(onMutations);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } else if (!on && observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function check() {
    lastCheckAt = Date.now();
    if (!enabled || !site.isPlayerPage()) {
      setObserving(false);
      return;
    }

    // With no video found we can't tell, so keep looking for the button.
    const video = findVideo();
    if (video && video.paused) {
      setObserving(false);
      return;
    }
    setObserving(true);

    const button = site.findButton();
    if (!button) return;

    const label = labelOf(button);
    const decision = decideClick(button, label, video);
    if (!decision) return;

    lastClick = {
      button,
      label,
      src: video ? video.currentSrc : "",
      mediaTime: video ? video.currentTime : null,
      at: Date.now(),
      attempts: decision === "retry" ? lastClick.attempts + 1 : 1,
    };
    press(button);
  }

  function safeCheck() {
    try {
      check();
    } catch (error) {
      console.debug("[Intro Skip]", error);
    }
  }

  // Runs inside the MutationObserver callback (a microtask), which background
  // tab timer throttling doesn't delay.
  function onMutations() {
    const wait = MUTATION_THROTTLE_MS - (Date.now() - lastCheckAt);
    if (wait <= 0) {
      safeCheck();
      return;
    }
    if (trailingTimer == null) {
      trailingTimer = window.setTimeout(() => {
        trailingTimer = null;
        safeCheck();
      }, wait);
    }
  }

  function onPlaybackChange() {
    if (enabled) safeCheck();
  }

  function burst() {
    if (!enabled) return;
    burstUntil = Date.now() + BURST_DURATION_MS;
    if (burstTimer != null) return;
    const run = () => {
      safeCheck();
      burstTimer =
        enabled && Date.now() < burstUntil ? window.setTimeout(run, BURST_INTERVAL_MS) : null;
    };
    run();
  }

  function start() {
    if (tickTimer == null) tickTimer = window.setInterval(safeCheck, TICK_MS);
    safeCheck();
  }

  function stop() {
    if (tickTimer != null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (trailingTimer != null) {
      window.clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    if (burstTimer != null) {
      window.clearTimeout(burstTimer);
      burstTimer = null;
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) start();
    else stop();
  }

  document.addEventListener("visibilitychange", burst);
  document.addEventListener("enterpictureinpicture", burst, true);
  document.addEventListener("leavepictureinpicture", burst, true);
  window.addEventListener("focus", burst);

  chrome.storage.sync.get({ enabled: DEFAULT_ENABLED }, (result) => {
    setEnabled(result.enabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) {
      setEnabled(changes.enabled.newValue);
    }
  });
})();
