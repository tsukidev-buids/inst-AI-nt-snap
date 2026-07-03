document.addEventListener('DOMContentLoaded', () => {
  showTutorial('settings', [
    {
      icon: '⚙️',
      title: 'your settings darkroom',
      body: 'configure how snaps work — image limits, deep capture, AI summarization, and export behavior. changes save when you hit the button at the bottom.'
    },
    {
      icon: '🔑',
      title: 'license & limits',
      body: 'free gets you <strong>5 snaps/day</strong> and basic exports. pro unlocks unlimited everything — auto-shutter, session burst, AI summaries, full research exports.'
    },
    {
      icon: '💾',
      title: 'your data, your call',
      body: 'everything lives in your browser. export a backup anytime, or wipe the roll clean if you want a fresh start. we don\'t touch your data.'
    }
  ]);
});
