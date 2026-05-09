// sw.js - お風呂帖サービスワーカー
// オフラインでも動作するよう、初回読み込み時にアプリ本体をキャッシュ

const CACHE_NAME = 'ofurocho-v2';
const ASSETS = [
  './',
  './index.html',
  './manual.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

// インストール時：アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// アクティベーション時：古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// フェッチ時：キャッシュ優先、なければネットワーク（cache-first 戦略）
// お風呂帖は完全クライアントアプリなので、外部API依存なし
self.addEventListener('fetch', (event) => {
  // GET以外はキャッシュしない
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // ネットワークから取得し、必要に応じてキャッシュに追加
      return fetch(event.request)
        .then((response) => {
          // 同一オリジンの正常レスポンスのみキャッシュ
          if (
            response.status === 200 &&
            new URL(event.request.url).origin === location.origin
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // オフラインで未キャッシュリソース → indexにフォールバック
          return caches.match('./index.html');
        });
    })
  );
});
