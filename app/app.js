/* Pawlogue PWA app logic. On-device. Personalization via prototype matching in IndexedDB. */
var App=(function(){
  'use strict';
  var pet=localStorage.getItem('paw_pet')||'';
  var species=localStorage.getItem('paw_species')||'cat';
  var pendingName='';
  var consent=(function(){try{return JSON.parse(localStorage.getItem('paw_consent')||'{}');}catch(_){return {};}})();
  var recording=false, last=null, db=null;
  var engineReady=false, DICT_CLASSES=[];
  var DICT_EMOJI={Content:'😌',Angry:'😾',Defense:'🙀',Fighting:'😼',Warning:'😼',Mating:'🌙',MotherCall:'🐈',Hunting:'🪶'};
  function dictMeaning(id){for(var i=0;i<DICT_CLASSES.length;i++)if(DICT_CLASSES[i].id===id)return DICT_CLASSES[i].meaning;return '';}
  function initEngine(){
    if(typeof PawEngine==='undefined'||typeof ort==='undefined'){return;}
    try{ ort.env.wasm.wasmPaths='https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'; }catch(_){}
    fetch('engine/dictionary_classes.json').then(function(r){return r.json();}).then(function(d){DICT_CLASSES=d.classes||[];renderBaseDict();}).catch(function(){});
    PawEngine.init('engine/').then(function(){engineReady=true;
      var h=$('hint'); if(h)h.textContent='Real on-device model loaded. Tap to listen.';
    }).catch(function(){engineReady=false;});
  }
  function demoListen(){
    if(!engineReady){ toast('Model still loading, one sec'); return; }
    $('hint').textContent='Demo: reading a real sample meow...';
    fetch('sounds/meow2.mp3').then(function(r){return r.arrayBuffer();}).then(function(ab){
      var AC=window.AudioContext||window.webkitAudioContext, ac=new AC(); return ac.decodeAudioData(ab.slice(0));
    }).then(function(buf){
      last={pcm:buf.getChannelData(0).slice(),sampleRate:buf.sampleRate,vector:null};
      return PawEngine.analyze(last.pcm,last.sampleRate);
    }).then(function(eng){ $('hint').textContent='On-device and honest. We read mood, never fake words.'; showResultReal(eng,last); })
      .catch(function(){ $('hint').textContent='Demo unavailable. Use the Listen button.'; });
  }
  // shareable photo card of the current result (DECISIONS: photo share = branded result card)
  function _mark(x,bx,by,s){var hs=[8,20,13,17],cols=['#E8A657','#f0c389','#2D8B7A','#E8A657'];
    for(var i=0;i<4;i++){x.fillStyle=cols[i];x.fillRect(bx+i*8*s,by-hs[i]*s,5*s,hs[i]*s);}
    x.fillStyle='#F2E8D5';x.font='800 '+Math.round(34*s)+'px system-ui,sans-serif';x.fillText('Pawlogue',bx+40*s,by);}
  function _wrap(x,t,bx,by,maxw,lh){var w=(t||'').split(' '),line='',yy=by;
    for(var i=0;i<w.length;i++){var tt=line+w[i]+' ';if(x.measureText(tt).width>maxw&&line){x.fillText(line.trim(),bx,yy);line=w[i]+' ';yy+=lh;}else line=tt;}
    x.fillText(line.trim(),bx,yy);return yy;}
  function shareCard(){
    var rmain=$('rmain').textContent.trim(), rsub=$('rsub').textContent.trim();
    var c=document.createElement('canvas');c.width=1080;c.height=1080;var x=c.getContext('2d');
    x.fillStyle='#12100E';x.fillRect(0,0,1080,1080);
    var g=x.createRadialGradient(840,170,30,840,170,640);g.addColorStop(0,'rgba(232,166,87,.22)');g.addColorStop(1,'rgba(232,166,87,0)');x.fillStyle=g;x.fillRect(0,0,1080,1080);
    var g2=x.createRadialGradient(180,960,30,180,960,600);g2.addColorStop(0,'rgba(45,139,122,.18)');g2.addColorStop(1,'rgba(45,139,122,0)');x.fillStyle=g2;x.fillRect(0,0,1080,1080);
    _mark(x,90,150,2.2);
    x.fillStyle='#5bb3a2';x.font='700 32px system-ui,sans-serif';x.fillText((pet||'Your cat').toUpperCase()+' SAYS',92,430);
    x.fillStyle='#F2E8D5';x.font='800 92px Georgia,serif';var yy=_wrap(x,rmain,90,550,910,104);
    x.fillStyle='#cdbfa8';x.font='400 36px system-ui,sans-serif';_wrap(x,rsub,90,yy+74,910,48);
    x.fillStyle='#8a8070';x.font='600 30px system-ui,sans-serif';x.fillText('pawlogue.pet  ·  the honest cat translator',90,1010);
    c.toBlob(function(b){ if(!b){toast('Could not make card');return;}
      var f=new File([b],'pawlogue-'+(pet||'cat')+'.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[f]})){ navigator.share({files:[f],title:'Pawlogue',text:(pet||'My cat')+' on Pawlogue, the honest cat translator'}).catch(function(){}); }
      else { var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=f.name;a.click(); toast('Card saved'); }
    },'image/png');
  }
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
    var si=$('sayInput'); if(si) si.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); sayParse(); } });
    initEngine();
  }
  function renderTips(advance){var el=$('tipsList');if(!el||typeof PawTalk==='undefined')return;
    var tips=PawTalk.TIPS, n=tips.length; if(!n)return;
    var idx=parseInt(localStorage.getItem('paw_tip_idx')||'0',10); if(isNaN(idx))idx=0; idx=((idx%n)+n)%n;
    var t=tips[idx];
    el.innerHTML='<div class="tip"><div class="ti">'+t.icon+'</div><div><div class="tt">'+t.title+'</div><div class="tb">'+t.body+'</div></div></div>';
    if(advance){ localStorage.setItem('paw_tip_idx', String((idx+1)%n)); }}
  function setText(id,t){var e=$(id);if(e)e.textContent=t;}
  function showWizard(step){$('petModal').classList.remove('hidden');
    ['species','name','consent','trial'].forEach(function(s){$('step-'+s).classList.toggle('hidden',s!==step);});
    if(step==='consent')renderConsentUI();}
  function renderConsentUI(){var l=$('ctog-learn'),c=$('ctog-clips');if(l)l.classList.toggle('on',!!consent.learn);if(c)c.classList.toggle('on',!!consent.clips);}
  function toggleConsent(k){
    if(k==='learn'){consent.learn=!consent.learn; if(!consent.learn)consent.clips=false;}
    else {consent.clips=!consent.clips; if(consent.clips)consent.learn=true;}
    renderConsentUI();}
  function saveConsent(){consent.ts=Date.now(); localStorage.setItem('paw_consent',JSON.stringify(consent));
    var n=pendingName||pet||'Milo'; setPet(n); localStorage.setItem('paw_onboarded','1'); $('petModal').classList.add('hidden'); toast('Welcome, '+n+' 🐾'); go('listen');}
  function pickSpecies(s){species=s;localStorage.setItem('paw_species',s);
    var w=s==='dog'?'dog':'cat';
    setText('nameTitle','What is your '+w+"'s name?");
    $('namePara').textContent='No two '+w+'s sound alike. Pawlogue builds a personal dictionary just for them.';
    showWizard('name'); setTimeout(function(){var i=$('petInput');if(i)i.focus();},60);}
  function savePet(){var v=$('petInput').value.trim();if(!v)return; pendingName=v; showWizard('consent');}
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

  function go(v){
    if(v!=='video' && typeof PawVideo!=='undefined'){ try{PawVideo.stopCamera();}catch(_){} resetVideoPanels(); }
    ['listen','talk','video','dict','log'].forEach(function(x){$('view-'+x).classList.toggle('hidden',x!==v);$('nav-'+x).classList.toggle('active',x===v);});
    if(v==='dict'){renderDict();renderBaseDict();} if(v==='log')renderLog();
    if(v==='talk'){buildCues('talkCues');$('reactPrompt2').classList.add('hidden');renderTips(true);}
    if(v==='video'){ resetVideoPanels(); }}
  function resetVideoPanels(){ var s=$('vidStart'),l=$('vidLive'),r=$('vidResult'); if(s)s.classList.remove('hidden'); if(l)l.classList.add('hidden'); if(r)r.classList.add('hidden'); var b=$('vidRecBtn'); if(b){b.textContent='● Record';b.classList.remove('rec');} }
  function buildVidCues(){var c=$('vidCues');if(!c||typeof PawTalk==='undefined')return;c.innerHTML='';
    PawTalk.CUES.forEach(function(q){var b=document.createElement('button');b.className='vidcue';b.textContent=q.icon+' '+q.label;b.onclick=function(){PawVideo.playCue(q.id,pet);};c.appendChild(b);});}
  function vidStart(){ if(typeof PawVideo==='undefined'){toast('Video not supported here');return;}
    PawVideo.start($('vidcanvas')).then(function(){ $('vidStart').classList.add('hidden'); $('vidLive').classList.remove('hidden'); $('vidResult').classList.add('hidden'); buildVidCues(); })
      .catch(function(){ toast('Camera and mic permission needed'); }); }
  function vidToggleRec(){ var btn=$('vidRecBtn');
    if(PawVideo.isRecording()){ PawVideo.stopRec().then(function(blob){ if(blob){ $('vidPlayback').src=URL.createObjectURL(blob); $('vidLive').classList.add('hidden'); $('vidResult').classList.remove('hidden'); } btn.textContent='● Record'; btn.classList.remove('rec'); }); }
    else { PawVideo.startRec(); btn.textContent='■ Stop'; btn.classList.add('rec'); } }
  function vidReadCat(){ PawVideo.readCat(pet); }
  function vidShare(){ PawVideo.share().then(function(ok){ if(!ok)toast('Saved to your device'); }); }
  function vidSave(){ PawVideo.save(); toast('Saved'); }
  function vidRetake(){ resetVideoPanels(); $('vidStart').classList.add('hidden'); $('vidLive').classList.remove('hidden'); }

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
      if(!r){ showUnclear(); return; }
      last=r;
      if(engineReady && r.pcm && r.pcm.length){
        PawEngine.analyze(r.pcm, r.sampleRate).then(function(eng){ showResultReal(eng,r); })
          .catch(function(){ if(r.classify) showResult(r); else showUnclear(); });
      } else if(r.classify){ showResult(r); } else { showUnclear(); }
    });
  }

  function showUnclear(){
    $('rtype').textContent='HMM'; $('rmain').textContent='🐾 Not sure that time';
    $('rsub').textContent='The clip was too short or quiet. Try again, a bit closer.';
    setBars(1,'Hard to tell'); $('tier2').classList.add('hidden'); $('labelArea').classList.add('hidden');
    $('rnote').textContent=''; openSheet();
  }

  // Tier-2 personal match (owner-taught prototypes), shared by both result paths
  function showTier2(r){
    allProto().then(function(ps){
      var t2=$('tier2');
      if(ps.length && r.vector){
        var best=null,bd=9;
        ps.forEach(function(p){var d=PawAudio.dist(p.vector,r.vector);if(d<bd){bd=d;best=p;}});
        if(best && bd<0.62){
          var n=pet||'your pet';
          $('t2q').textContent='"'+best.label+'": '+n+' has made this sound before.';
          $('t2src').textContent='Matched to what you taught ('+countLabel(ps,best.label)+' example'+(countLabel(ps,best.label)>1?'s':'')+'). Closeness '+Math.round((1-bd)*100)+'%.';
          t2.classList.remove('hidden');
        } else t2.classList.add('hidden');
      } else t2.classList.add('hidden');
    });
  }

  // REAL on-device model result (PawEngine)
  function showResultReal(eng,r){
    if(!eng){ if(r&&r.classify) return showResult(r); return showUnclear(); }
    if(!eng.isCat){
      $('rtype').textContent='HMM';
      $('rmain').textContent='🐾 No clear cat sound';
      $('rsub').textContent='Try again a bit closer, when '+(pet||'your cat')+' actually vocalizes.';
      setBars(1,'Hard to tell'); $('tier2').classList.add('hidden'); $('labelArea').classList.add('hidden');
      $('rnote').textContent='Real on-device model. It says "not sure" instead of guessing.';
      openSheet(); return;
    }
    var top=eng.soundClasses[0], emoji=DICT_EMOJI[top.id]||'🐱';
    var alt=eng.soundClasses.slice(1,3).filter(function(x){return x.prob>0.12;}).map(function(x){return x.label.toLowerCase();});
    $('rtype').textContent='CAT SOUND · ON-DEVICE MODEL';
    $('rmain').textContent=emoji+'  '+top.label;
    $('rsub').textContent=dictMeaning(top.id)+(alt.length?(' Maybe also '+alt.join(' or ')+'.'):'');
    setBars(eng.confidence, confWord(eng.confidence));
    showTier2(r);
    $('labelArea').classList.add('hidden');
    $('rnote').textContent='Real on-device model read, not a guess. This is mood and sound, not words. New or persistent odd sounds: see a vet. Not veterinary advice.';
    logResult({soundType:top.label,affect:eng.affect,emoji:emoji,confidence:eng.confidence});
    openSheet();
  }

  function showResult(r){
    var c=r.classify;
    $('rtype').textContent='SOUND · '+c.soundType.toUpperCase();
    $('rmain').textContent=c.emoji+'  '+affectShort(c.affect);
    $('rsub').textContent=c.affect;
    setBars(c.confidence, confWord(c.confidence));
    showTier2(r);
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
    var list=(DICT_CLASSES&&DICT_CLASSES.length)
      ? DICT_CLASSES.map(function(c){return {snd:c.label,mean:c.meaning};})
      : BASE;
    list.forEach(function(b){var d=document.createElement('div');d.className='bdcard';
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
  function sayParse(){var t=($('sayInput').value||'').trim();
    if(!t){$('sayTokens').innerHTML='';$('sayNote').textContent='Type a few words first, like "come here" or "dinner time".';return;}
    allProto().then(function(ps){
      var labels=ps.map(function(p){return p.label;});
      var toks=PawTalk.decompose(t,pet,labels), box=$('sayTokens'); box.innerHTML='';
      if(!toks.length){$('sayNote').textContent='Type a few words first.';return;}
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

  return {init:init,editPet:editPet,savePet:savePet,pickSpecies:pickSpecies,toggleConsent:toggleConsent,saveConsent:saveConsent,startTrial:startTrial,demoListen:demoListen,shareCard:shareCard,go:go,toggleRec:toggleRec,startTeach:startTeach,closeSheet:closeSheet,reacted:reacted,sayParse:sayParse,
    vidStart:vidStart,vidToggleRec:vidToggleRec,vidReadCat:vidReadCat,vidShare:vidShare,vidSave:vidSave,vidRetake:vidRetake};
})();
document.addEventListener('DOMContentLoaded',App.init);
