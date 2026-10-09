# Intro Skip

A Chrome-compatible extension for **Brave** (and Chrome, Edge, or any Chromium browser) that automatically clicks **Skip Intro** on Netflix, Prime Video, Disney+ and Crave. Turn it on or off from the toolbar popup — you do not need to disable or uninstall the extension.

## Features

- Clicks Skip Intro as soon as the streaming service shows it
- Keeps working when the video is in Picture-in-Picture and you are in another tab or window
- Only skips intros — recap, credits and next-episode buttons are left alone
- Toolbar toggle to enable or disable auto-skip instantly, saved across restarts
- Toolbar badge shows **ON** or **OFF**
- Runs only on the supported sites and does not collect any data

The extension only clicks a Skip Intro button the service already shows. If a title has no Skip Intro button, there is nothing to click.

## Supported services

| Service | How the button is found |
| --- | --- |
| Netflix | `data-uia="player-skip-intro"` |
| Prime Video | `.atvwebplayersdk-skipelement-button` whose label mentions the intro |
| Disney+ | Text match inside the player's `<skip-overlay>` shadow DOM (older player: `.skip__button`) |
| Crave | Best effort: `.skipbreaks-click-area`, then any visible button labelled "Skip Intro" |

Prime Video works on `primevideo.com` and on video pages of `amazon.com`, `amazon.ca`, `amazon.co.uk`, `amazon.de` and `amazon.in`. To add another Amazon store, copy its three lines in `manifest.json` and change the domain.

## Install

The extension isn't on the Chrome Web Store. You install it from a folder on your computer, which takes a couple of minutes.

### 1. Get the code

Pick one of these. Either way, keep the folder somewhere permanent such as `~/Documents`: the browser loads the extension from that folder every time it starts, so deleting or moving it removes the extension.

**Option A — Download ZIP (no tools needed)**

1. On this page on GitHub, click the green **Code** button, then **Download ZIP**.
2. Double-click the downloaded file to unzip it.
3. Move the unzipped `Intro-Skip-main` folder into `~/Documents`.

**Option B — Clone with git (makes updating easier)**

Open **Terminal** and run:

```bash
cd ~/Documents
git clone https://github.com/YOUR-GITHUB-USERNAME/Intro-Skip.git
```

On a Mac without developer tools, the first `git` command asks to install the **Command Line Tools**. Click **Install**, wait for it to finish, then run the command again.

### 2. Load it in your browser

Works in Chrome, Brave, Edge, Arc and other Chromium browsers.

1. Open the extensions page by typing its address into the address bar:
   - Chrome or Arc: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
2. Turn on **Developer mode** (top right in Chrome and Brave, left sidebar in Edge).
3. Click **Load unpacked**.
4. Select the project folder: the one that contains `manifest.json`.
5. Click the puzzle-piece icon in the toolbar and pin **Intro Skip** so the on/off toggle is one click away.

Open a show on any supported service and the intro is skipped once its Skip Intro button appears. The toolbar badge shows **ON** or **OFF**.

### Updating

1. Get the new code:
   - If you cloned it, run `cd ~/Documents/Intro-Skip && git pull`.
   - If you downloaded the ZIP, download it again and replace the old folder's contents with the new ones, keeping the same folder location.
2. On the extensions page, click the reload icon on the **Intro Skip** card.
3. Refresh any streaming tabs that were already open.

### Removing

Click **Remove** on the extension's card, then delete the folder.

## How it works

`content.js` runs on the supported sites. While a player is open it:

- watches the page for changes and checks for the Skip Intro button, at most about three times a second
- also checks once a second, so a button that appears without any page change is still caught
- checks rapidly for a few seconds when you return to the tab or enter or leave Picture-in-Picture

While the video is paused it stops watching the page and doesn't look for the button; pressing play resumes checking immediately. Outside the player, or while paused, it only does one cheap check per second to notice when playback starts. With the toggle off it does nothing.

A click is tied to the button and the video position. If the video jumps forward, the skip worked and the button is left alone even if the site keeps it on the page. If nothing happened, it retries up to three times. If you rewind into the intro, it skips again.

## If auto-skip stops working

Streaming sites change their player markup from time to time. Inspect the Skip Intro button in DevTools and update that site's `findButton` in `content.js`.

## License

[MIT](LICENSE). Not affiliated with or endorsed by Netflix, Amazon, Disney or Bell Media.
