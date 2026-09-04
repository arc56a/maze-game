/**
 * Minimap.js
 * Disabled — minimap removed from UI per design decision.
 * Canvas element no longer exists in DOM.
 * All methods are no-ops to prevent crashes.
 */

const Minimap = (() => {
  function build()        { /* minimap disabled */ }
  function updatePlayer() { /* minimap disabled */ }
  return { build, updatePlayer };
})();
