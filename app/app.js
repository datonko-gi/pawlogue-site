/* Pawlogue PWA app logic. On-device. Personalization via prototype matching in IndexedDB. */
var App=(function(){
  'use strict';
  var pet=localStorage.getItem('paw_pet')||'';
  var recording=false, last=null, db=null;
  var LABELS=['Hungry / food','Let me in / out','Wants attention','Greeting','Play','Distress','Other'];

  // ---- IndexedDB ----
  function openDB(){return new Promise(function(res){var r=indexedDB.open('pawlogue',1);
    r.onupgradeneeded=function(e){var d=e.target.result;if(!d.objectStoreNames.contains('proto'))d.createObjectStore('proto',{keyPath:'id',autoIncrement:true});};
    r.onsuccess=function(e){db=e.target.result;res(db);};r.onerror=function(){res(null);};});}
  function addProto(o){return new Promise(function(res){if(!db)return res();var t=db.transaction('proto','readwrite');t.objectStore('proto').add(o);t.oncomplete=function(){res();};});}
  function allProto(){return new Promise(function(res){if(!db)return res([]);var t=db.transaction('proto','readonly'),rq=t.objectStore('proto').getAll();rq.onsuccess=function(){res(rq.result||[]);};rq.onerror=function(){res([]);};});}

  function $(id){return document.getElementById(id);}
  function toast(m){var t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2200);}

  function init(){
    openDB();
    if(!pet){ $('petModal').classList.remove('hidden'); }
    else setPet(pet);
    buildChips(); renderDict(); renderLog();
  }
  function setPet(n){pet=n;localStorage.setItem('paw_pet',n);$('petName').textContent=n;$('petName2').textContent=n;
    $('moodline').textContent='Tap to hear what '+n+' is saying';
    $('dictTitle').textContent=n+"'s vocabulary";}
  function editPet(){$('petInput').value=pet;$('petModal').classList.remove('hidden');}
  function savePet(){var v=$('petInput').value.trim();if(!v)return;setPet(v);$('petModal').classList.add('hidden');toast('Hi '+v+' 🐾');}

  function go(v){['listen','dict','log'].forEach(function(x){$('view-'+x).classList.toggle('hidden',x!==v);$('nav-'+x).classList.toggle('active',x===v);});
    if(v==='dict')renderDict(); if(v==='log')renderLog();}

  // ---- recording ----
  function toggleRec(){ recording?stop():start(); }
  function start(){
    recording=true; var btn=$('recbtn'); btn.textContent='Stop'; btn.classList.add('live'); $('ring').classList.add('pulse');
    $('hint').textContent='Listening... tap stop when '+(pet||'your pet')+' finishes.';
    buildWave();
    PawAudio.startRec(function(data,level){ drawWave(data); }).catch(function(){
      recording=false;btn.textContent='Listen';btn.classList.remove('live');$('ring').classList.remove('pulse');
      $('hint').textContent='Microphone access is needed. Enable it in your browser settings.';
    });
  }
  function stop(){
    recording=false; var btn=$('recbtn'); btn.textContent='Listen'; btn.classList.remove('live'); $('ring').classList.remove('pulse');
    $('hint').textContent='Analyzing...';
    PawAudio.stopRec().then(function(r){
      $('hint').textContent='On-device and honest. We read mood, never fake words.';
      if(!r||!r.classify){ showUnclear(); return; }
      last=r; showResult(r);
    });
  }

  function showUnclear(){
    $('rtype').textContent='HMM'; $('rmain').textContent='🐾 Not sure that time';
    $('rsub').textContent='The clip was too short or quiet. Try again, a bit closer.';
    setBars(1,'Hard to tell'); $('tier2').classList.add('hidden'); $('labelArea').classList.add('hidden');
    $('rnote').textContent=''; openSheet();
  }

  function showResult(r){
    var c=r.classify;
    $('rtype').textContent='SOUND · '+c.soundType.toUpperCase();
    $('rmain').textContent=c.emoji+'  '+affectShort(c.affect);
    $('rsub').textContent=c.affect;
    setBars(c.confidence, confWord(c.confidence));
    // personalization
    allProto().then(function(ps){
      var t2=$('tier2');
      if(ps.length && r.vector){
        var best=null,bd=9;
        ps.forEach(function(p){var d=PawAudio.dist(p.vector,r.vector);if(d<bd){bd=d;best=p;}});
        if(best && bd<0.62){
          var n=pet||'your pet';
          $('t2q').textContent='“'+best.label+'” — '+n+' has made this sound before.';
          $('t2src').textContent='Matched to what you taught ('+countLabel(ps,best.label)+' example'+(countLabel(ps,best.label)>1?'s':'')+'). Closeness '+Math.round((1-bd)*100)+'%.';
          t2.classList.remove('hidden');
        } else t2.classList.add('hidden');
      } else t2.classList.add('hidden');
    });
    $('labelArea').classList.add('hidden');
    $('rnote').textContent='Affect, not words. If a sound is new or you hear it a lot and seems off, a vet check is worth it. Pawlogue is not veterinary advice.';
    logResult(c);
    openSheet();
  }
  function affectShort(a){return a.split(' (')[0];}
  function confWord(n){return ['','Hard to tell','Possibly','Most likely','Clear'][n]||'';}
  function setBars(n,word){var b=$('bars');b.innerHTML='';for(var i=0;i<4;i++){var x=document.createElement('b');if(i<n)x.className='on';b.appendChild(x);}$('conftxt').textContent=word;}

  // ---- teach / dictionary ----
  function startTeach(){ if(!last){toast('Record a sound first');return;} $('labelArea').classList.remove('hidden'); }
  function buildChips(){var c=$('chips');if(!c)return;c.innerHTML='';LABELS.forEach(function(l){var b=document.createElement('div');b.className='chip';b.textContent=l;b.onclick=function(){teach(l);};c.appendChild(b);});}
  function teach(label){
    if(!last||!last.vector){toast('No clip to save');return;}
    addProto({label:label,vector:last.vector,blob:last.blob,ts:Date.now()}).then(function(){
      toast((pet||'Your pet')+"'s dictionary grew 🎉");
      $('labelArea').classList.add('hidden'); closeSheet(); renderDict();
    });
  }
  function countLabel(ps,l){var n=0;ps.forEach(function(p){if(p.label===l)n++;});return n;}
  function renderDict(){
    allProto().then(function(ps){
      var byL={};ps.forEach(function(p){(byL[p.label]=byL[p.label]||[]).push(p);});
      var keys=Object.keys(byL), el=$('dictList');
      if(!keys.length){el.innerHTML='<div class="empty">No sounds taught yet.<br>Record '+(pet||'your pet')+', tap <b>Teach this</b>, and name what they wanted. After a few, Pawlogue starts recognizing them.</div>';return;}
      el.innerHTML='';
      keys.forEach(function(k){var items=byL[k];var d=document.createElement('div');d.className='dcard';
        d.innerHTML='<div><div class="dl"><span class="dot"></span>'+k+'</div><div class="dm">'+items.length+' example'+(items.length>1?'s':'')+' · learned</div></div>';
        var play=document.createElement('button');play.className='play';play.textContent='▶';play.onclick=function(){playBlob(items[items.length-1].blob);};
        d.appendChild(play); el.appendChild(d);});
    });
  }
  function playBlob(b){if(!b)return;var a=new Audio(URL.createObjectURL(b));a.play();}

  // ---- recent log (localStorage) ----
  function logResult(c){var l=JSON.parse(localStorage.getItem('paw_log')||'[]');l.unshift({t:Date.now(),s:c.soundType,a:affectShort(c.affect),e:c.emoji,c:c.confidence});l=l.slice(0,30);localStorage.setItem('paw_log',JSON.stringify(l));}
  function renderLog(){var l=JSON.parse(localStorage.getItem('paw_log')||'[]'),el=$('logList');
    if(!l.length){el.innerHTML='<div class="empty">Your recent listens will show here.</div>';return;}
    el.innerHTML='';l.forEach(function(x){var d=document.createElement('div');d.className='dcard';
      d.innerHTML='<div><div class="dl">'+x.e+' '+x.a+'</div><div class="dm">'+x.s+' · '+timeAgo(x.t)+'</div></div>';el.appendChild(d);});}
  function timeAgo(t){var s=(Date.now()-t)/1000;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}

  // ---- sheet + wave ----
  function openSheet(){$('sheet').classList.add('up');}
  function closeSheet(){$('sheet').classList.remove('up');$('labelArea').classList.add('hidden');}
  function buildWave(){var w=$('wave');w.innerHTML='';for(var i=0;i<32;i++)w.appendChild(document.createElement('i'));}
  function drawWave(data){var bars=$('wave').children;if(!bars.length)buildWave();bars=$('wave').children;var step=Math.floor(data.length/bars.length)||1;
    for(var i=0;i<bars.length;i++){var v=data[i*step]/255;bars[i].style.height=(6+v*40)+'px';}}

  return {init:init,editPet:editPet,savePet:savePet,go:go,toggleRec:toggleRec,startTeach:startTeach,closeSheet:closeSheet};
})();
document.addEventListener('DOMContentLoaded',App.init);
