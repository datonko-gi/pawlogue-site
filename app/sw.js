/* Pawlogue service worker: offline app shell. Bump CACHE to invalidate. */
var CACHE='pawlogue-v22';
var ASSETS=['./','index.html','model.html','app.js','audio.js','talk.js','video.js','manifest.json','icon-192.png','icon-512.png',
  'model_samples/Content.mp3','model_samples/Angry.mp3','model_samples/Defensive.mp3','model_samples/Fighting.mp3',
  'model_samples/Warning.mp3','model_samples/Mating.mp3','model_samples/MotherCall.mp3','model_samples/Hunting.mp3',
  'sounds/purr1.mp3','sounds/purr2.mp3','sounds/purr3.mp3','sounds/purr4.mp3','sounds/purr5.mp3','sounds/purr6.mp3',
  'sounds/trill1.mp3','sounds/trill2.mp3','sounds/trill3.mp3','sounds/trill4.mp3','sounds/trill5.mp3',
  'sounds/meow1.mp3','sounds/meow2.mp3','sounds/meow3.mp3','sounds/meow4.mp3','sounds/meow5.mp3','sounds/meow6.mp3',
  'sounds/meow7.mp3','sounds/meow8.mp3','sounds/meow9.mp3','sounds/meow10.mp3',
  'engine/pawengine.js','engine/cat_detector.onnx','engine/cat_dictionary.onnx','engine/cat_affect.onnx',
  'engine/dictionary_classes.json','engine/frontend_params.json',
  'engine/dsp/logmel_filterbank.json','engine/dsp/mfcc_dct.json','engine/dsp/cat_dictionary_weights.json'];
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
