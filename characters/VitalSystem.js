/**
 * VitalSystem.js
 * Manages player health and stamina states cleanly and independently.
 */

const VitalSystem = (() => {
  // ---- Config ----
  const MAX_HEALTH = 100;
  const MAX_STAMINA = 100;

  const STAMINA_REGEN_STAND = 15;  // Stamina regen/sec when standing still
  const STAMINA_REGEN_WALK = 8;    // Stamina regen/sec when walking
  const STAMINA_DRAIN_RUN = 22;    // Stamina drain/sec when sprinting
  const STAMINA_JUMP_COST = 18;    // One-time cost when jumping

  const HEALTH_REGEN_RATE = 2;     // Health regen/sec when resting

  // ---- State ----
  let health = MAX_HEALTH;
  let stamina = MAX_STAMINA;
  let isExhausted = false;         // If stamina hits 0, player is exhausted and cannot run until it recovers

  function init() {
    health = MAX_HEALTH;
    stamina = MAX_STAMINA;
    isExhausted = false;
    
    // Initial UI Sync
    updateUI();
  }

  function update(delta, playerState) {
    // 1. Stamina logic
    if (playerState === 'run') {
      stamina = Math.max(0, stamina - STAMINA_DRAIN_RUN * delta);
      if (stamina <= 0) {
        isExhausted = true;
      }
    } else if (playerState === 'walk') {
      stamina = Math.min(MAX_STAMINA, stamina + STAMINA_REGEN_WALK * delta);
    } else if (playerState === 'jump') {
      // Jump cost is applied instantly when starting a jump via consumeJumpStamina()
    } else {
      // idle or other states
      stamina = Math.min(MAX_STAMINA, stamina + STAMINA_REGEN_STAND * delta);
    }

    // Recover from exhaustion when stamina is above 20%
    if (isExhausted && stamina >= 20) {
      isExhausted = false;
    }

    // 2. Health regen (if damaged)
    if (health < MAX_HEALTH) {
      health = Math.min(MAX_HEALTH, health + HEALTH_REGEN_RATE * delta);
    }

    updateUI();
  }

  function consumeJumpStamina() {
    stamina = Math.max(0, stamina - STAMINA_JUMP_COST);
    if (stamina <= 0) {
      isExhausted = true;
    }
    updateUI();
  }

  function damage(amount) {
    health = Math.max(0, health - amount);
    if (typeof HUD !== 'undefined' && typeof HUD.showDamage === 'function') {
      HUD.showDamage();
    }
    updateUI();
  }

  function updateUI() {
    if (typeof HUD !== 'undefined') {
      if (typeof HUD.setHealth === 'function') HUD.setHealth(health);
      if (typeof HUD.setStamina === 'function') HUD.setStamina(stamina);
    }
  }

  function getHealth() { return health; }
  function getStamina() { return stamina; }
  function getIsExhausted() { return isExhausted; }

  return {
    init,
    update,
    consumeJumpStamina,
    damage,
    getHealth,
    getStamina,
    getIsExhausted
  };
})();
