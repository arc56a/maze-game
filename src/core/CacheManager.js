/**
 * CacheManager.js
 * Handles local caching of assets using IndexedDB to save bandwidth
 */

const CacheManager = (() => {
  const DB_NAME = 'MazeGameCache';
  const DB_VERSION = 1;
  const STORE_NAME = 'assets';
  let db = null;

  async function init() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAsset(url) {
    await init();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function saveAsset(url, data) {
    await init();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, url);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }

  async function clearCache(type = 'all') {
    await init();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      if (type === 'all') {
        const request = store.clear();
        request.onsuccess = () => {
          console.log('[CacheManager] All cache cleared.');
          resolve(true);
        };
      } else {
        // Clear specific assets (e.g., website or levels)
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const url = cursor.key;
            const isLevel = url.includes('/levels/') || url.includes('Level');
            const isWebsite = !isLevel;

            if ((type === 'levels' && isLevel) || (type === 'website' && isWebsite)) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            console.log(`[CacheManager] ${type} cache cleared.`);
            resolve(true);
          }
        };
      }
    });
  }

  return { getAsset, saveAsset, clearCache };
})();
