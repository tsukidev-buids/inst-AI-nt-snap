document.addEventListener('DOMContentLoaded', () => {
  showTutorial('dashboard', [
    {
      icon: '🎞️',
      title: 'welcome to the darkroom',
      body: 'this is your headquarters. everything you snap ends up here in the <strong>film roll</strong> — searchable, taggable, exportable.'
    },
    {
      icon: '🔍',
      title: 'search negatives',
      body: 'full-text search across all your captures. find that one paragraph from three weeks ago.'
    },
    {
      icon: '🤖',
      title: 'prompt lab',
      body: 'select multiple clips, pick an instruction (compare, summarize, etc), and we\'ll build an AI-ready markdown file you can upload to any chatbot.'
    },
    {
      icon: '⚡',
      title: 'session burst & auto-shutter',
      body: 'capture all open tabs at once, or set rules to auto-snap pages you linger on. <strong>pro features</strong> — worth it for heavy research.'
    },
    {
      icon: '📖',
      title: 'research desk',
      body: 'organize clips into projects, tag quotes, auto-generate citations (APA, MLA, Harvard, Chicago), and export full bibliographies.'
    }
  ]);
});
