/* Pawlogue PWA app logic. On-device. Personalization via prototype matching in IndexedDB. */
var App=(function(){
  'use strict';
  var pet=localStorage.getItem('paw_pet')||'';
  var species=localStorage.getItem('paw_species')||'cat';
  var pendingName='';
  var consent=(function(){try{return JSON.parse(localStorage.getItem('paw_consent')||'{}');}catch(_){return {};}})();
  var cuePlays=[];
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
  function openDB(){return new Promise(function(res){var r=indexedDB.open('pawlogue',2);
    r.onupgradeneeded=function(e){var d=e.target.result;
      if(!d.objectStoreNames.contains('proto'))d.createObjectStore('proto',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('videos'))d.createObjectStore('videos',{keyPath:'id',autoIncrement:true});};
    r.onsuccess=function(e){db=e.target.result;res(db);};r.onerror=function(){res(null);};});}
  function addProto(o){return new Promise(function(res){if(!db)return res();var t=db.transaction('proto','readwrite');t.objectStore('proto').add(o);t.oncomplete=function(){res();};});}
  function allProto(){return new Promise(function(res){if(!db)return res([]);var t=db.transaction('proto','readonly'),rq=t.objectStore('proto').getAll();rq.onsuccess=function(){res(rq.result||[]);};rq.onerror=function(){res([]);};});}
  function addVideo(o){return new Promise(function(res){if(!db)return res();var t=db.transaction('videos','readwrite');t.objectStore('videos').add(o);t.oncomplete=function(){res();};});}
  function allVideos(){return new Promise(function(res){if(!db)return res([]);var t=db.transaction('videos','readonly'),rq=t.objectStore('videos').getAll();rq.onsuccess=function(){res(rq.result||[]);};rq.onerror=function(){res([]);};});}
  function delVideo(id){return new Promise(function(res){if(!db)return res();var t=db.transaction('videos','readwrite');t.objectStore('videos').delete(id);t.oncomplete=function(){res();};});}

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
  function openSettings(){ setText('setPetName', pet||'your cat'); var l=$('sctog-learn'),c=$('sctog-clips'); if(l)l.classList.toggle('on',!!consent.learn); if(c)c.classList.toggle('on',!!consent.clips); $('settingsModal').classList.remove('hidden'); }
  function closeSettings(){ $('settingsModal').classList.add('hidden'); }
  function toggleConsent2(k){ if(k==='learn'){consent.learn=!consent.learn; if(!consent.learn)consent.clips=false;} else {consent.clips=!consent.clips; if(consent.clips)consent.learn=true;}
    consent.ts=Date.now(); localStorage.setItem('paw_consent',JSON.stringify(consent));
    var l=$('sctog-learn'),c=$('sctog-clips'); if(l)l.classList.toggle('on',!!consent.learn); if(c)c.classList.toggle('on',!!consent.clips); renderConsentUI(); }
  function deleteAllData(){ if(!confirm('Delete everything Pawlogue stored on this device? Your pet, taught sounds, clips and settings will be erased.'))return;
    try{localStorage.clear();}catch(_){} try{indexedDB.deleteDatabase('pawlogue');}catch(_){} setTimeout(function(){location.reload();},150); }
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
    if(v==='talk'){buildCues('talkCues');renderOwnVoice();$('reactPrompt2').classList.add('hidden');renderTips(true);}
    if(v==='video'){ resetVideoPanels(); renderClips(); }}
  function resetVideoPanels(){ vidCameraOn=false; var s=$('vidStart'),l=$('vidLive'),r=$('vidResult'); if(s)s.classList.remove('hidden'); if(l)l.classList.add('hidden'); if(r)r.classList.add('hidden'); var b=$('vidRecBtn'); if(b){b.textContent='● Record';b.classList.remove('rec');} }
  var vidCurrentBlob=null, vidCameraOn=false;
  var SOCIALS=[{id:'TikTok',ic:'🎵',url:'https://www.tiktok.com/upload'},{id:'Instagram',ic:'📸',url:'https://www.instagram.com/'},{id:'YouTube',ic:'▶️',url:'https://www.youtube.com/upload'},{id:'Facebook',ic:'📘',url:'https://www.facebook.com/'},{id:'Share',ic:'⬆️',url:''}];
  function buildVidCues(){var c=$('vidCues');if(!c||typeof PawTalk==='undefined')return;c.innerHTML='';
    PawTalk.CUES.forEach(function(q){var b=document.createElement('button');b.className='vidcue';b.textContent=q.icon+' '+q.label;b.onclick=function(){PawVideo.playCue(q.id,pet);};c.appendChild(b);});}
  function buildVidSocial(){var c=$('vidSocial');if(!c)return;c.innerHTML='';
    SOCIALS.forEach(function(s){var b=document.createElement('button');b.className='socialbtn';
      b.innerHTML='<span class="si">'+s.ic+'</span><span class="sn">'+s.id+'</span>';
      b.onclick=function(){ vidShareTo(s); }; c.appendChild(b);});}
  function vidShareTo(s){
    if(PawVideo.canNativeShare()){ PawVideo.share(vidCurrentBlob).then(function(ok){ if(!ok) vidDesktopShare(s); }); }
    else { vidDesktopShare(s); } }
  function vidDesktopShare(s){ PawVideo.save(vidCurrentBlob); if(s.url){ try{window.open(s.url,'_blank');}catch(_){} toast('Clip saved. Now pick it in '+s.id+'.'); } else { toast('Clip saved to your device.'); } }
  function vidStart(){ if(typeof PawVideo==='undefined'){toast('Video not supported here');return;}
    PawVideo.start($('vidcanvas')).then(function(){ vidCameraOn=true; $('vidStart').classList.add('hidden'); $('vidLive').classList.remove('hidden'); $('vidResult').classList.add('hidden'); buildVidCues(); })
      .catch(function(){ toast('Camera and mic permission needed'); }); }
  function vidToggleCues(){ var c=$('vidCues'); if(c) c.classList.toggle('hidden'); }
  function vidToggleRec(){ var btn=$('vidRecBtn');
    if(PawVideo.isRecording()){
      PawVideo.stopRec().then(function(r){ btn.textContent='● Record'; btn.classList.remove('rec');
        if(r&&r.blob){ vidCurrentBlob=r.blob; $('vidPlayback').src=URL.createObjectURL(r.blob);
          $('vidLive').classList.add('hidden'); $('vidResult').classList.remove('hidden'); buildVidSocial();
          addVideo({blob:r.blob,thumb:r.thumb,dur:r.dur,t:Date.now()}).then(renderClips); } });
    } else { PawVideo.startRec(); btn.textContent='■ Stop recording'; btn.classList.add('rec'); } }
  function vidReadCat(){ PawVideo.readCat(pet); }
  function vidSave(){ PawVideo.save(vidCurrentBlob); toast('Saved to your device'); }
  function vidNewClip(){ $('vidResult').classList.add('hidden'); if(vidCameraOn){ $('vidLive').classList.remove('hidden'); } else { $('vidStart').classList.remove('hidden'); } }
  function fmtDur(s){ s=s||0; var m=Math.floor(s/60),ss=s%60; return m+':'+(ss<10?'0':'')+ss; }
  function fmtDate(t){ try{var d=new Date(t);return (d.getMonth()+1)+'/'+d.getDate();}catch(_){return '';} }
  function renderClips(){ var el=$('vidGallery'); if(!el)return;
    allVideos().then(function(vs){ if(!vs.length){ el.innerHTML=''; return; }
      vs.sort(function(a,b){return b.t-a.t;});
      var h='<div class="seclabel" style="margin-top:24px">Your clips</div><div class="clipgrid">';
      vs.forEach(function(v){ h+='<div class="clipcard" data-id="'+v.id+'"><div class="dur">'+fmtDur(v.dur)+'</div>'+(v.thumb?'<img src="'+v.thumb+'" alt="clip"/>':'<div style="aspect-ratio:9/16"></div>')+'<div class="meta">'+fmtDate(v.t)+'</div></div>'; });
      h+='</div><p class="sub" style="margin-top:8px">Tap a clip to open. Press and hold to delete.</p>'; el.innerHTML=h;
      [].forEach.call(el.querySelectorAll('.clipcard'),function(card){ var id=parseInt(card.getAttribute('data-id'),10); var pressT,longed=false;
        card.addEventListener('pointerdown',function(){ longed=false; pressT=setTimeout(function(){ longed=true; if(confirm('Delete this clip?')){ delVideo(id).then(renderClips); } },600); });
        ['pointerup','pointerleave','pointercancel'].forEach(function(ev){ card.addEventListener(ev,function(){ clearTimeout(pressT); }); });
        card.onclick=function(){ if(!longed) playClip(id); };
      });
    }); }
  function playClip(id){ allVideos().then(function(vs){ var v=null; vs.forEach(function(x){if(x.id===id)v=x;}); if(!v)return;
    vidCurrentBlob=v.blob; $('vidPlayback').src=URL.createObjectURL(v.blob); $('vidStart').classList.add('hidden'); $('vidLive').classList.add('hidden'); $('vidResult').classList.remove('hidden'); buildVidSocial(); }); }

  // ---- recording ----
  function toggleRec(){ recording?stop():start(); }
  function start(){
    recording=true; var btn=$('recbtn'); btn.textContent='■ Stop'; btn.classList.add('live'); $('ring').classList.add('pulse');
    $('moodline').textContent='🔴 Listening to '+(pet||'your cat')+'...';
    $('hint').textContent='Tap the circle to stop when '+(pet||'your cat')+' finishes.';
    buildWave();
    PawAudio.startRec(function(data,level){ drawWave(data); }).catch(function(){
      recording=false;btn.textContent='Listen';btn.classList.remove('live');$('ring').classList.remove('pulse');
      $('moodline').textContent='Tap to hear what '+(pet||'your cat')+' is saying';
      $('hint').textContent='Microphone access is needed. Enable it in your browser settings.';
    });
  }
  function stop(){
    recording=false; var btn=$('recbtn'); btn.textContent='Listen'; btn.classList.remove('live'); $('ring').classList.remove('pulse');
    $('moodline').textContent='Analyzing '+(pet||'your cat')+'...';
    $('hint').textContent='Reading the model...';
    PawAudio.stopRec().then(function(r){
      $('moodline').textContent='Tap to hear what '+(pet||'your cat')+' is saying';
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
    if(last)last.detLabel=top.label;
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
    if(last)last.detLabel=c.soundType;
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
    addProto({label:label,vector:last.vector,blob:last.blob,ts:Date.now(),src:'teach'}).then(function(){
      toast((pet||'Your pet')+"'s dictionary grew 🎉");
      $('labelArea').classList.add('hidden'); closeSheet(); renderDict(); renderOwnVoice();
    });
  }
  // one-tap: keep this real recording in the cat's own-voice bank (auto-named by the model)
  function saveVoice(){
    if(!last||!last.vector||!last.blob){toast('Listen to '+(pet||'your cat')+' first');return;}
    addProto({label:(last.detLabel||'Sound'),vector:last.vector,blob:last.blob,ts:Date.now(),src:'voice'}).then(function(){
      toast('Saved to '+(pet||'your cat')+"'s own voice 🎙");
      renderOwnVoice(); renderDict();
    });
  }
  // ---- talk back in the cat's OWN voice (real recordings, replayed honestly) ----
  var ownIdx={};
  function renderOwnVoice(){
    var box=$('ownVoiceCues'); if(!box)return;
    allProto().then(function(ps){
      var lab=$('ownVoiceLabel'), sub=$('ownVoiceSub'); box.innerHTML='';
      var withAudio=ps.filter(function(p){return p&&p.blob;});
      if(!withAudio.length){ if(lab)lab.style.display='none'; if(sub)sub.style.display='none'; return; }
      if(lab)lab.style.display=''; if(sub)sub.style.display='';
      [].forEach.call(document.querySelectorAll('.ownNm'),function(e){e.textContent=pet||'your cat';});
      var byL={}; withAudio.forEach(function(p){(byL[p.label]=byL[p.label]||[]).push(p);});
      Object.keys(byL).forEach(function(k){var items=byL[k];
        var el=document.createElement('button'); el.className='cue';
        el.innerHTML='<div class="cl">🐱 '+k+' <span style="font-weight:600;color:var(--amber)">· their voice</span></div>'+
          '<div class="cb">'+items.length+' real recording'+(items.length>1?'s':'')+' of '+(pet||'your cat')+', replayed as-is.</div>'+
          '<div class="hit none">tap to play '+(items.length>1?'(cycles through them)':'')+'</div>';
        el.onclick=function(){playOwn(k,items,el);};
        box.appendChild(el);});
    });
  }
  function playOwn(label,items,el){
    var i=(ownIdx[label]||0); ownIdx[label]=i+1; var it=items[i%items.length];
    playBlob(it.blob);
    if(el){el.classList.add('lit');setTimeout(function(){el.classList.remove('lit');},700);}
    toast('Played '+(pet||'your cat')+"'s own voice (clip "+((i%items.length)+1)+' of '+items.length+')');
    lastCue='own:'+label;
    var rp=$('reactPrompt2'); if(rp){rp.classList.remove('hidden'); var rq=rp.querySelector('.rq'); if(rq)rq.textContent='Did '+(pet||'your cat')+' react to their own voice?';}
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
    var list=PawTalk.CUES.map(function(q){var s=st[q.id]||{t:0,r:0}; return {q:q,s:s,score:s.t?(s.r/s.t):-1};});
    list.sort(function(a,b){return b.score-a.score;});
    var best=(list[0]&&list[0].score>0)?list[0].q.id:null;
    list.forEach(function(it){var q=it.q,s=it.s;
      var hit=s.t?('worked '+s.r+' of '+s.t):'not tried yet';
      var star=(q.id===best&&s.r>0)?' ⭐':'';
      var el=document.createElement('button');el.className='cue';
      el.innerHTML='<div class="cl">'+q.icon+' '+q.label+star+'</div><div class="cb">'+q.basis+'</div><div class="hit'+(s.t?'':' none')+'">'+hit+'</div>';
      el.onclick=function(){playCue(q.id,el);};
      c.appendChild(el);});}
  function playCue(id,el){var q=PawTalk.cue(id);if(!q)return;
    var now=Date.now(); cuePlays.push(now); cuePlays=cuePlays.filter(function(t){return now-t<60000;});
    if(cuePlays.length>8){ toast('Give '+(pet||'your cat')+' a break. Too many sounds in a row can stress a cat.'); }
    var info=PawTalk.play(id,pet); lastCue=id;
    if(el){el.classList.add('lit');setTimeout(function(){el.classList.remove('lit');},700);}
    toast('Played: '+q.label+(info?(' (variant '+info.variant+' of '+info.total+')'):''));
    var sheetUp=$('sheet').classList.contains('up');
    var rp=$(sheetUp?'reactPrompt':'reactPrompt2');
    if(rp){ rp.classList.remove('hidden'); var rq=rp.querySelector('.rq'); if(rq)rq.textContent='Did '+(pet||'your cat')+' react to '+q.label+'?'; }}
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
      var seq=toks.filter(function(tk){return tk.cueId;}).map(function(tk){return tk.cueId;});
      if(seq.length){
        playSequence(seq);
        $('sayNote').textContent = unknown
          ? 'Playing the teal words to '+n+' as a little phrase. The orange ones '+n+' has not learned yet.'
          : 'Playing it to '+n+' as a phrase: '+seq.length+' sound'+(seq.length>1?'s':'')+' in a row. Watch for a reaction.';
      } else {
        $('sayNote').textContent = n+' has not learned any of these yet. Try a cue above, or teach a meow first.';
      }
    });}
  var _seqT=[];
  function playSequence(ids){ _seqT.forEach(clearTimeout); _seqT=[];
    ids.forEach(function(id,i){ _seqT.push(setTimeout(function(){ PawTalk.play(id, pet); },i*1150)); }); }

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

  return {init:init,editPet:editPet,savePet:savePet,pickSpecies:pickSpecies,toggleConsent:toggleConsent,saveConsent:saveConsent,startTrial:startTrial,demoListen:demoListen,shareCard:shareCard,openSettings:openSettings,closeSettings:closeSettings,toggleConsent2:toggleConsent2,deleteAllData:deleteAllData,go:go,toggleRec:toggleRec,startTeach:startTeach,closeSheet:closeSheet,reacted:reacted,sayParse:sayParse,saveVoice:saveVoice,
    vidStart:vidStart,vidToggleRec:vidToggleRec,vidReadCat:vidReadCat,vidToggleCues:vidToggleCues,vidSave:vidSave,vidNewClip:vidNewClip};
})();
document.addEventListener('DOMContentLoaded',App.init);
