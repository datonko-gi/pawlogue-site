/* Pawlogue talk-back engine: HONEST human->cat cues only.
   We never "translate words into cat". We play stimuli the behavioral science says
   cats demonstrably respond to, then the owner reports whether the cat reacted.
   Verb is always "played / tried", never "said". */
(function(global){
  'use strict';
  var AC = global.AudioContext || global.webkitAudioContext;
  var ctx=null;
  function ac(){ ctx=ctx||new AC(); if(ctx.state==='suspended')ctx.resume(); return ctx; }

  // ---- honest cue palette (each has a real basis) ----
  var CUES=[
    {id:'trill', label:'Trill / chirp', icon:'🎵', kind:'play',
      basis:'A friendly greeting sound cats use with each other and with people.'},
    {id:'pspsps', label:'"Pspsps"', icon:'🤫', kind:'play',
      basis:'High, prey-like hiss. A strong attention attractor for most cats.'},
    {id:'name', label:'Their name', icon:'🗣', kind:'say',
      basis:'Cats can learn to recognize their own name (study-backed).'},
    {id:'feed', label:'Feeding call', icon:'🍽', kind:'say',
      basis:'Your usual feeding word. Works through conditioning, your cat learned it.'},
    {id:'blink', label:'Slow blink', icon:'😌', kind:'action',
      basis:'A validated affiliative signal. Look, slowly close your eyes ~1s, open. The most honest cue of all, no sound.'},
    {id:'voice', label:'Your own voice', icon:'💬', kind:'action',
      basis:'Talk to your cat as yourself, high and warm. No synthesis, just you.'},
    {id:'play', label:'Play invite', icon:'🪶', kind:'play',
      basis:'Quick rising chirps that mimic an excited, playful invitation.'}
  ];

  // ---- synthesis ----
  function tone(freqStart,freqEnd,dur,t0,type,gainPeak){
    var c=ac(),o=c.createOscillator(),g=c.createGain();
    o.type=type||'triangle';
    o.frequency.setValueAtTime(freqStart,t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1,freqEnd),t0+dur);
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(gainPeak||0.25,t0+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0+dur+0.02);
  }
  function noiseBurst(t0,dur,centerHz,gainPeak){
    var c=ac(),n=Math.floor(c.sampleRate*dur),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1);
    var src=c.createBufferSource();src.buffer=buf;
    var bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=centerHz||9000;bp.Q.value=4;
    var g=c.createGain();g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(gainPeak||0.3,t0+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    src.connect(bp).connect(g).connect(c.destination);src.start(t0);src.stop(t0+dur+0.01);
  }
  function speak(text,pitch,rate){
    try{var u=new SpeechSynthesisUtterance(text);u.pitch=pitch||1.7;u.rate=rate||0.95;u.volume=1;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(_){}
  }

  // play a cue. returns true if it emits sound (so UI can show "playing"), false for silent actions.
  function play(id, petName){
    var c=ac(), t=c.currentTime;
    switch(id){
      case 'trill': // 3 short rising chirps
        tone(700,1050,0.18,t,'triangle',0.3); tone(720,1100,0.16,t+0.22,'triangle',0.28); tone(700,1150,0.2,t+0.42,'triangle',0.3); return true;
      case 'pspsps':
        noiseBurst(t,0.16,9500,0.32); noiseBurst(t+0.22,0.16,9000,0.3); noiseBurst(t+0.44,0.18,9500,0.32); return true;
      case 'play': // fast excited up-chirps
        for(var i=0;i<5;i++) tone(800+i*30,1200+i*40,0.1,t+i*0.13,'sawtooth',0.22); return true;
      case 'name':
        speak(petName||'kitty',1.8,0.9); return true;
      case 'feed':
        speak((petName?petName+', ':'')+'dinner, here kitty kitty',1.7,0.95); return true;
      case 'blink': return false;   // coached physical action
      case 'voice': return false;   // owner speaks themselves
    }
    return false;
  }
  function cue(id){for(var i=0;i<CUES.length;i++)if(CUES[i].id===id)return CUES[i];return null;}

  // ---- "say it your way": decompose owner words into cues this cat may know ----
  // Map common human intents to a cue id. Honest: a word maps only if there is a real cue for it.
  var WORDMAP={
    'come':'name','here':'name','hey':'name','hi':'trill','hello':'trill',
    'eat':'feed','food':'feed','dinner':'feed','hungry':'feed','treat':'feed','breakfast':'feed','lunch':'feed',
    'play':'play','toy':'play','fun':'play','chase':'play',
    'love':'blink','calm':'blink','relax':'blink','easy':'blink','ok':'blink','okay':'blink',
    'good':'voice','sweet':'voice','baby':'voice','cutie':'voice'
  };
  // decompose(text, petName, taughtLabels) -> tokens [{word, cueId|null, known:bool, src:'cue'|'taught'|null}]
  function decompose(text, petName, taughtLabels){
    var words=(text||'').toLowerCase().replace(/[^a-z0-9'\s]/g,' ').split(/\s+/).filter(Boolean);
    var nameL=(petName||'').toLowerCase();
    var taught=(taughtLabels||[]).map(function(s){return (s||'').toLowerCase();});
    return words.map(function(w){
      if(nameL && w===nameL) return {word:w, cueId:'name', known:true, src:'cue'};
      if(WORDMAP[w]) return {word:w, cueId:WORDMAP[w], known:true, src:'cue'};
      // matches something the owner taught this cat (a learned meow label keyword)?
      for(var i=0;i<taught.length;i++){ if(taught[i] && (taught[i].indexOf(w)>=0 || w.indexOf(taught[i])>=0)) return {word:w, cueId:null, known:true, src:'taught'}; }
      return {word:w, cueId:null, known:false, src:null};
    });
  }

  global.PawTalk={CUES:CUES, play:play, cue:cue, decompose:decompose};
})(window);
