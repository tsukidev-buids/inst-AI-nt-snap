/**
 * Inst-AI-nt Snap — Custom Select Dropdown
 * Replaces native <select> elements with themed dropdowns.
 * Call initSnapSelects() after DOM is ready.
 */

function initSnapSelects() {
  document.querySelectorAll('select:not([data-snap-init])').forEach(nativeSelect => {
    nativeSelect.setAttribute('data-snap-init', 'true');
    nativeSelect.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'snap-select';

    const trigger = document.createElement('div');
    trigger.className = 'snap-select-trigger';

    const selectedOption = nativeSelect.options[nativeSelect.selectedIndex];
    trigger.innerHTML = `<span class="snap-select-label">${selectedOption ? selectedOption.textContent : ''}</span><span class="arrow">\u25BC</span>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'snap-select-dropdown';

    function buildOptions() {
      dropdown.innerHTML = '';
      Array.from(nativeSelect.options).forEach((opt, i) => {
        const optEl = document.createElement('div');
        optEl.className = 'snap-select-option' + (i === nativeSelect.selectedIndex ? ' active' : '');
        optEl.textContent = opt.textContent;
        optEl.dataset.value = opt.value;

        optEl.addEventListener('click', (e) => {
          e.stopPropagation();
          nativeSelect.value = opt.value;
          nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          trigger.querySelector('.snap-select-label').textContent = opt.textContent;
          dropdown.querySelectorAll('.snap-select-option').forEach(o => o.classList.remove('active'));
          optEl.classList.add('active');
          wrapper.classList.remove('open');
        });

        dropdown.appendChild(optEl);
      });
    }

    buildOptions();

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open selects
      document.querySelectorAll('.snap-select.open').forEach(s => {
        if (s !== wrapper) s.classList.remove('open');
      });
      wrapper.classList.toggle('open');
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);

    // Sync if native select changes programmatically
    const observer = new MutationObserver(() => {
      const current = nativeSelect.options[nativeSelect.selectedIndex];
      if (current) {
        trigger.querySelector('.snap-select-label').textContent = current.textContent;
        buildOptions();
      }
    });
    observer.observe(nativeSelect, { childList: true, attributes: true });
  });

  // Close on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.snap-select.open').forEach(s => s.classList.remove('open'));
  });
}
