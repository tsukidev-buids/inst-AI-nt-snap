/**
 * Inst-AI-nt Snap — Welcome Page Interactivity
 * Accordion cards + CTA handlers + auto-start tutorial
 */

document.addEventListener('DOMContentLoaded', () => {
  bindAccordion();
  bindCTA();
  autoStartTutorial();
});

function bindAccordion() {
  const steps = document.querySelectorAll('.step');

  // Set initial aria state
  steps.forEach(step => {
    step.setAttribute('role', 'button');
    step.setAttribute('aria-expanded', 'false');
    step.setAttribute('tabindex', '0');
  });

  steps.forEach(step => {
    const toggle = () => {
      const wasExpanded = step.classList.contains('expanded');

      // Collapse all siblings (mutual exclusivity)
      steps.forEach(s => {
        s.classList.remove('expanded');
        s.setAttribute('aria-expanded', 'false');
      });

      // Toggle clicked card
      if (!wasExpanded) {
        step.classList.add('expanded');
        step.setAttribute('aria-expanded', 'true');
      }
    };

    step.addEventListener('click', toggle);
    step.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

function autoStartTutorial() {
  // Auto-launch the welcome tutorial on first load (no click needed)
  if (typeof startWelcomeTutorial === 'function') {
    startWelcomeTutorial();
  }
}

function bindCTA() {
  const showBtn = document.getElementById('btn-show-tutorial');
  const skipBtn = document.getElementById('btn-skip-to-dashboard');
  const fallback = document.getElementById('fallback-msg');

  // Primary CTA — replay welcome tutorial (force, even if already seen)
  showBtn.addEventListener('click', () => {
    if (typeof forceWelcomeTutorial === 'function') {
      forceWelcomeTutorial();
    }

    // Fallback: if tutorial overlay doesn't appear within 3s, show text instructions
    const fallbackTimeout = setTimeout(() => {
      if (!document.querySelector('.tutorial-overlay')) {
        fallback.classList.add('visible');
      }
    }, 3000);

    // Cancel fallback if tutorial appears
    const observer = new MutationObserver((mutations, obs) => {
      if (document.querySelector('.tutorial-overlay')) {
        clearTimeout(fallbackTimeout);
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Secondary link — skip to dashboard
  skipBtn.addEventListener('click', () => {
    const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
    window.location.href = dashboardUrl;
  });
}
