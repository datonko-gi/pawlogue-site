/* Pawlogue service worker: offline app shell. Bump CACHE to invalidate. */
var CACHE='pawlogue-v3';
var ASSETS=['./','index.html','app.js','audio.js','talk.js','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){});}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){if(k!==CACHE)return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  e.respondWith(
    caches.match(e.request).then(function(r){
      return r || fetch(e.request).then(function(resp){
        var copy=resp.clone();
        if(resp.ok && e.request.url.indexOf('http')===0){caches.open(CACHE).then(function(c){c.put(e.request,copy).catch(function(){});});}
        return resp;
      }).catch(function(){return r;});
    })
  );
});
