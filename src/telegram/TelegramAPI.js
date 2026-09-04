/**
 * TelegramAPI.js — Safe version for compatibility with v6.0+
 */
const TelegramAPI = (() => {
  const tg = window.Telegram?.WebApp;

  function init() {
    if (!tg) return;
    tg.ready();
    tg.expand();

    // Version 6.2+ features
    if (tg.isVersionAtLeast('6.2')) {
      tg.disableVerticalSwipes?.();
    }

    // BackButton check
    if (tg.isVersionAtLeast('6.1') && tg.BackButton) {
      tg.BackButton.onClick(() => {
        const screen = UI.getCurrent();
        if (screen === 'menu') tg.close(); else UI.showScreen('menu');
      });
    }

    const user = tg.initDataUnsafe?.user;
    if (user) {
      const el = document.getElementById('telegram-username');
      if (el) el.textContent = `@${user.username || user.first_name}`;
    }
  }

  function haptic(type = 'light') {
    if (tg && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(type);
    }
  }

  return {
    init, haptic,
    submitScore: (s) => tg?.sendData(JSON.stringify({ action: 'score', score: s })),
    getUser: () => tg?.initDataUnsafe?.user || null,
    isInTG: () => !!tg
  };
})();
