'use strict';
/**
 * Oracle Tuner 서비스워커.
 *
 * 목적은 두 가지뿐이다:
 *  1) Chrome 의 PWA 설치 프롬프트 조건(활성 SW) 충족.
 *  2) 폐쇄망에서도 정적 자산이 한 번 뜨면 오프라인에서 재사용되는 최소한의 이득.
 *
 * ⚠ 이 앱은 개발·패치가 잦다. HTML/JS/CSS 를 cache-first 로 하면 패치 후에도 낡은 화면이
 * 나와 디버깅 지옥이 된다. 그래서 항상 network-first(네트워크 우선, 실패 시에만 캐시 폴백)만 쓴다.
 * /api/* 는 DB 상태를 담고 있으므로 절대 캐시하지 않는다.
 */

const SW_VERSION = 'v1';
const CACHE_NAME = `oracle-tuner-${SW_VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/DELETE 등은 그대로 네트워크로

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // API 응답은 절대 캐시하지 않는다

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw e;
    }
  })());
});
