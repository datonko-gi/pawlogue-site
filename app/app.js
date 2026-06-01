/* Pawlogue PWA app logic. On-device. Personalization via prototype matching in IndexedDB. */
var App=(function(){
  'use strict';
  var pet=localStorage.getItem('paw_pet')||'';
  var species=localStorage.getItem('paw_species')||'cat';
  var pendingName='';
  var recording=false, last=null, db=null;
  var LABELS=['Hungry / food','Let me in / out','Wants attention','Greeting','Play','Distress','Other'];
  var BASE=[
    {snd:'Purr-like rumble',mean:'Content, calm, self-soothing'},
    {snd:'Hiss / spit',mean:'Back off, I feel threatened'},
    {snd:'Growl',mean:'Agitated, a warning'},
    {snd:'Yowl',mean:'Distress or disorientation'},
    {snd:'Trill / chirp',mean:'Friendly greeting'},
    {snd:'Meow / call',mean:'Aimed at you. The exact meaning is personal, you teach it'}
  ];
  var lastCue=null;
  // talk-back hit-rate, per pet, in localStorage
  function statsAll(){try{return JSON.parse(localStorage.getItem('paw_talk_stats')||'{}');}catch(_){return {};}}
  function statsPet(){var a=statsAll();return a[pet||'_']||{};}
  function statsBump(id,reacted){var a=statsAll();var k=pet||'_';a[k]=a[k]||{};a[k][id]=a[k][id]||{t:0,r:0};a[k][id].t++;if(reacted)a[k][id].r++;localStorage.setItem('paw_talk_stats',JSON.stringify(a));}

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
    if(!pet){ showWizard('species'); }
    else setPet(pet);
    buildChips(); renderDict(); renderLog(); renderBaseDict(); buildCues('talkCues'); buildCues('replyCues');
  }
  function setText(id,t){var e=$(id);if(e)e.textContent=t;}
  function showWizard(step){$('petModal').classList.remove('hidden');
    ['species','name','trial'].forEach(function(s){$('step-'+s).classList.toggle('hidden',s!==step);});}
  function pickSpecies(s){species=s;localStorage.setItem('paw_species',s);
    var w=s==='dog'?'dog':'cat';
    setText('nameTitle','What is your '+w+"'s name?");
    $('namePara').textContent='No two '+w+'s sound alike. Pawlogue builds a personal dictionary just for them.';
    showWizard('name'); setTimeout(function(){var i=$('petInput');if(i)i.focus();},60);}
  function savePet(){var v=$('petInput').value.trim();if(!v)return; pendingName=v; showWizard('trial');}
  function startTrial(){ var n=pendingName||pet||'Milo'; setPet(n);
    localStorage.setItem('paw_onboarded','1'); $('petModal').classList.add('hidden'); toast('Welcome, '+n+' 🐾'); }
  function setPet(n){pet=n;localStorage.setItem('paw_pet',n);localStorage.setItem('paw_species',species);
    $('petName').textContent=n;$('petName2').textContent=n;
    $('petEmoji').textContent=(species==='dog'?'🐶 ':'🐱 ');
    $('moodline').textContent='Tap to hear what '+n+' is saying';
    $('dictTitle').textContent=n+"'s vocabulary";
    setText('talkName',n);setText('replyName',n);setText('reactName',n);setText('taughtName',n);
    var rn=document.querySelectorAll('.rnm');for(var i=0;i<rn.length;i++)rn[i].textContent=n;
    buildCues('talkCues');buildCues('replyCues');}
  function editPet(){pendingName=pet;$('petInput').value=pet;showWizard('species');}

  function go(v){['listen','talk','dict','log'].forEach(function(x){$('view-'+x).classList.toggle('hidden',x!==v);$('nav-'+x).classList.toggle('active',x===v);});
    if(v==='dict'){renderDict();renderBaseDict();} if(v==='log')renderLog();
    if(v==='talk'){buildCues('talkCues');$('reactPrompt2').classList.add('hidden');}}

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

  // ---- base dictionary (day-0, cross-cat stable) ----
  function renderBaseDict(){var el=$('baseDict');if(!el)return;el.innerHTML='';
    BASE.forEach(function(b){var d=document.createElement('div');d.className='bdcard';
      d.innerHTML='<div><div class="dl"><span class="dot base"></span>'+b.snd+'</div><div class="dm">'+b.mean+'</div></div>';
      el.appendChild(d);});}

  // ---- talk back (human -> cat, honest cues) ----
  function buildCues(cid){var c=$(cid);if(!c)return;c.innerHTML='';var st=statsPet();
    PawTalk.CUES.forEach(function(q){var s=st[q.id];
      var hit=s&&s.t?('worked '+s.r+' of '+s.t):'not tried yet';
      var el=document.createElement('button');el.className='cue';
      el.innerHTML='<div class="cl">'+q.icon+' '+q.label+'</div><div class="cb">'+q.basis+'</div><div class="hit'+(s&&s.t?'':' none')+'">'+hit+'</div>';
      el.onclick=function(){playCue(q.id,el);};
      c.appendChild(el);});}
  function playCue(id,el){var q=PawTalk.cue(id);if(!q)return;
    PawTalk.play(id,pet); lastCue=id;
    if(el){el.classList.add('lit');setTimeout(function(){el.classList.remove('lit');},700);}
    if(id==='blink')toast('Look at '+(pet||'your cat')+', slowly close your eyes ~1s, then open');
    else if(id==='voice')toast('Talk to '+(pet||'your cat')+' now, warm and high');
    else toast('Played: '+q.label);
    var sheetUp=$('sheet').classList.contains('up');
    var rp=$(sheetUp?'reactPrompt':'reactPrompt2'); if(rp)rp.classList.remove('hidden');}
  function reacted(yes){ if(!lastCue){return;} statsBump(lastCue,yes); lastCue=null;
    $('reactPrompt').classList.add('hidden'); $('reactPrompt2').classList.add('hidden');
    buildCues('talkCues'); buildCues('replyCues');
    toast(yes?'Logged. Nice 🐾':'Logged, no response.');}
  function sayParse(){var t=$('sayInput').value||'';
    allProto().then(function(ps){
      var labels=ps.map(function(p){return p.label;});
      var toks=PawTalk.decompose(t,pet,labels), box=$('sayTokens'); box.innerHTML='';
      if(!toks.length){$('sayNote').textContent='';return;}
      var unknown=0,known=0;
      toks.forEach(function(tk){var s=document.createElement('span');
        var cls=tk.known?(tk.src==='taught'?'taught':'known'):'unknown';
        s.className='tok '+cls; s.textContent=tk.word; box.appendChild(s);
        if(tk.known)known++;else unknown++;});
      var n=pet||'your cat';
      $('sayNote').textContent = unknown
        ? (known? n+' works with the teal words. The orange ones '+n+' has not learned yet.' : n+' has not learned any of these yet. Try a cue above, or teach a meow first.')
        : 'All of these map to cues '+n+' can respond to. Play them from the cues above.';
    });}

  // ---- recent log (localStorage) ----
  function logResult(c){var l=JSON.parse(localStorage.getItem('paw_log')||'[]');l.unshift({t:Date.now(),s:c.soundType,a:affectShort(c.affect),e:c.emoji,c:c.confidence});l=l.slice(0,30);localStorage.setItem('paw_log',JSON.stringify(l));}
  function renderLog(){var l=JSON.parse(localStorage.getItem('paw_log')||'[]'),el=$('logList');
    if(!l.length){el.innerHTML='<div class="empty">Your recent listens will show here.</div>';return;}
    el.innerHTML='';l.forEach(function(x){var d=document.createElement('div');d.className='dcard';
      d.innerHTML='<div><div class="dl">'+x.e+' '+x.a+'</div><div class="dm">'+x.s+' · '+timeAgo(x.t)+'</div></div>';el.appendChild(d);});}
  function timeAgo(t){var s=(Date.now()-t)/1000;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}

  // ---- sheet + wave ----
  function openSheet(){buildCues('replyCues');$('reactPrompt').classList.add('hidden');lastCue=null;$('sheet').classList.add('up');}
  function closeSheet(){$('sheet').classList.remove('up');$('labelArea').classList.add('hidden');}
  function buildWave(){var w=$('wave');w.innerHTML='';for(var i=0;i<32;i++)w.appendChild(document.createElement('i'));}
  function drawWave(data){var bars=$('wave').children;if(!bars.length)buildWave();bars=$('wave').children;var step=Math.floor(data.length/bars.length)||1;
    for(var i=0;i<bars.length;i++){var v=data[i*step]/255;bars[i].style.height=(6+v*40)+'px';}}

  return {init:init,editPet:editPet,savePet:savePet,pickSpecies:pickSpecies,startTrial:startTrial,go:go,toggleRec:toggleRec,startTeach:startTeach,closeSheet:closeSheet,reacted:reacted,sayParse:sayParse};
})();
document.addEventListener('DOMContentLoaded',App.init);
