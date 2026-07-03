/**
 * Inst-AI-nt Snap — First-Visit Tutorial System
 * Slides between steps without flashing the overlay.
 */

async function showTutorial(pageId, steps) {
  const storageKey = `tutorial_seen_${pageId}`;
  const data = await chrome.storage.local.get(storageKey);
  if (data[storageKey]) return;

  let currentStep = 0;

  // Create overlay once
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-overlay';

  const card = document.createElement('div');
  card.className = 'tutorial-card';
  overlay.appendChild(card);

  document.body.appendChild(overlay);

  function renderStep(direction) {
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    const btnText = isLast ? 'got it' : 'next';

    const dots = steps.map((_, i) => {
      let cls = 'tutorial-dot';
      if (i < currentStep) cls += ' done';
      if (i === currentStep) cls += ' active';
      return `<div class="${cls}"></div>`;
    }).join('');

    // Slide animation class
    if (direction) {
      card.classList.add('tutorial-slide-out');
      setTimeout(() => {
        updateCardContent(step, dots, btnText, isLast);
        card.classList.remove('tutorial-slide-out');
        card.classList.add('tutorial-slide-in');
        setTimeout(() => card.classList.remove('tutorial-slide-in'), 250);
      }, 150);
    } else {
      updateCardContent(step, dots, btnText, isLast);
    }
  }

  function updateCardContent(step, dots, btnText, isLast) {
    card.innerHTML = `
      <div class="tutorial-film-strip"></div>
      <div class="tutorial-step-indicator">${dots}</div>
      <span class="tutorial-icon">${step.icon}</span>
      <div class="tutorial-title">${step.title}</div>
      <div class="tutorial-body">${step.body}</div>
      <div class="tutorial-actions">
        <button class="tutorial-btn-skip">skip tour</button>
        <button class="tutorial-btn-next">${btnText}</button>
      </div>
    `;
    bindButtons(isLast);
  }

  function bindButtons(isLast) {
    card.querySelector('.tutorial-btn-next').addEventListener('click', () => {
      if (isLast) {
        dismiss();
      } else {
        currentStep++;
        renderStep('forward');
      }
    });

    card.querySelector('.tutorial-btn-skip').addEventListener('click', dismiss);
  }

  // Click outside card to dismiss
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Escape to dismiss
  function onKey(e) {
    if (e.key === 'Escape') {
      dismiss();
      document.removeEventListener('keydown', onKey);
    }
  }
  document.addEventListener('keydown', onKey);

  function dismiss() {
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 250);
    chrome.storage.local.set({ [storageKey]: true });
  }

  // Initial render (no slide animation)
  renderStep(null);
}
