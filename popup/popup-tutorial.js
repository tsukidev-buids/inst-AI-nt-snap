document.addEventListener('DOMContentLoaded', () => {
  showTutorial('popup', [
    {
      icon: '📸',
      title: 'snap pages instantly',
      body: 'hit the big button to capture any page — text, images, metadata. it all goes into your <strong>film roll</strong> locally.'
    },
    {
      icon: '✂️',
      title: 'or just grab a selection',
      body: 'highlight text on the page first, then click <strong>snap selection</strong> to save just that bit. great for quotes.'
    },
    {
      icon: '🎞️',
      title: 'the darkroom awaits',
      body: 'click <strong>darkroom</strong> below to open the full dashboard — search, organize, build AI prompts, and export research.'
    }
  ]);
});
