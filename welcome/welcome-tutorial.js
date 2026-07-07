/**
 * Inst-AI-nt Snap — Extension Basics Tutorial
 * Teaches first-time users what a browser extension is and how to use it.
 * Auto-triggered on first load. Button re-triggers for refresher.
 */

const WELCOME_STEPS = [
  {
    icon: '🧩',
    title: 'what even is an extension?',
    body: 'extensions are mini-apps that live inside your browser. they add features to pages you visit — no separate app needed. you just installed one.'
  },
  {
    icon: '📍',
    title: 'find the icon',
    body: 'look at the top-right of your browser — there\'s a puzzle piece icon (🧩). click that, and you\'ll see <strong>inst-ai-nt snap</strong> in the list.'
  },
  {
    icon: '📌',
    title: 'pin it for quick access',
    body: 'click the pin icon next to inst-ai-nt snap so it stays visible in your toolbar. no more digging through menus every time.'
  },
  {
    icon: '📸',
    title: 'click to snap, right-click for more',
    body: 'left-click the 📷 icon to open the popup and snap a page. right-click it for extra options like <strong>snap selection</strong> or opening the darkroom.'
  }
];

function startWelcomeTutorial() {
  showTutorial('welcome', WELCOME_STEPS);
}

function forceWelcomeTutorial() {
  // Clear the seen flag so tutorial shows again, then trigger it
  chrome.storage.local.remove('tutorial_seen_welcome', () => {
    showTutorial('welcome', WELCOME_STEPS);
  });
}
