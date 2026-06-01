/* Pawlogue talk-back engine: HONEST human->cat cues.
   Sound buttons emit REAL cat audio (purr, trill, meow, recorded from our datasets) plus
   human attractor sounds you make (pspsps, the cat's name, your feeding word). Every press
   is varied a little (cats habituate to identical sounds). Physical/relationship actions
   (slow blink, scratch, play) are NOT buttons; they live in Tips. We never claim the cat
   understood words. Verb is always "played / tried". */
(function(global){
  'use strict';
  var AC = global.AudioContext || global.webkitAudioContext;
  var ctx=null;
  function ac(){ ctx=ctx||new AC(); if(ctx.state==='suspended')ctx.resume(); return ctx; }
  function rnd(a,b){ return a+(b-a)*Math.random(); }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---- sound/word cue palette (buttons). Real cat audio + human attractors. ----
  var CUES=[
    {id:'purr', label:'Purr (мррхрр)', icon:'😻', kind:'audio',
      clips:['purr1.mp3','purr2.mp3','purr3.mp3'],
      basis:'A real, calm cat purr. Cats relax to a content purr. A warm, friendly opener.'},
    {id:'trill', label:'Trill / chirp', icon:'🎵', kind:'audio',
      clips:['trill1.mp3','trill2.mp3','trill3.mp3'],
      basis:'A real cat trill, the friendly greeting and mother-to-kitten call.'},
    {id:'meow', label:'Meow', icon:'🐱', kind:'audio',
      clips:['meow1.mp3','meow2.mp3','meow3.mp3','meow4.mp3'],
      basis:'A real cat greeting meow. Often gets a cat to look or answer back.'},
    {id:'pspsps', label:'"Pspsps"', icon:'🤫', kind:'synth',
      basis:'High, prey-like attractor that you make. Played a little differently each time.'},
    {id:'name', label:'Their name', icon:'🗣', kind:'tts',
      basis:'Cats can learn to recognize their own name. Say it warm and high.'},
    {id:'feed', label:'Feeding call', icon:'🍽', kind:'tts',
      basis:'Your feeding word. Works through your own cat’s conditioning.'}
  ];

  // ---- Tips: how to bond with your cat (relationship + physical, NOT sound buttons) ----
  var TIPS=[
    {icon:'😌', title:'Slow blink', body:'Look at your cat, slowly close your eyes for about a second, then open them. It is a validated "I trust you" signal. Many cats slow-blink back, that is them answering you.'},
    {icon:'🤚', title:'Scratch the cheeks and between the ears', body:'Cats have scent glands on their cheeks and head. A gentle scratch there says "you are family", it is how cats mark the ones they bond with.'},
    {icon:'💬', title:'Use a warm, high voice', body:'Cats respond more to a soft, high, sing-song tone (the way we talk to babies) than to flat speech. Your real voice beats any synthetic one.'},
    {icon:'🪶', title:'Play like prey', body:'Drag a toy in quick, darting moves with pauses, the way real prey moves. Short bursts then a freeze. It speaks to your cat’s hunting instinct.'},
    {icon:'👃', title:'Offer a slow finger', body:'Hold out a relaxed finger at nose height and let your cat come to it. It mimics the polite nose-touch greeting cats do with each other.'},
    {icon:'🧘', title:'Let the cat choose', body:'The strongest bond signal is patience. Sit near, stay calm, and let your cat approach on its own terms. Forcing contact breaks trust.'}
  ];

  // ---- synthesis (pspsps), varied every press ----
  function noiseBurst(t0,dur,centerHz,gainPeak){
    var c=ac(),n=Math.floor(c.sampleRate*dur),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1);
    var src=c.createBufferSource();src.buffer=buf;
    var bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=centerHz;bp.Q.value=rnd(3,6);
    var g=c.createGain();g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(gainPeak,t0+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    src.connect(bp).connect(g).connect(c.destination);src.start(t0);src.stop(t0+dur+0.02);
  }
  function pspsps(){
    var c=ac(), t=c.currentTime, n=Math.floor(rnd(2,5)); // 2 to 4 bursts
    for(var i=0;i<n;i++){ var off=i*rnd(0.16,0.26); noiseBurst(t+off, rnd(0.12,0.2), rnd(8200,10800), rnd(0.26,0.36)); }
  }
  function speak(text,pitch,rate){
    try{var u=new SpeechSynthesisUtterance(text);u.pitch=pitch;u.rate=rate;u.volume=1;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(_){}
  }

  // play a cue. returns true (all current cues emit sound).
  function play(id, petName){
    var q=cue(id); if(!q) return false;
    if(q.kind==='audio'){
      try{ var a=new Audio('sounds/'+pick(q.clips)); a.playbackRate=rnd(0.95,1.08); a.volume=1; a.play(); }catch(_){}
      return true;
    }
    if(q.kind==='synth'){ pspsps(); return true; }
    if(q.kind==='tts'){
      if(id==='name'){ speak(petName||'kitty', rnd(1.5,1.9), rnd(0.85,1.0)); }
      else { var phrases=[(petName?petName+', ':'')+'dinner', 'here kitty kitty', (petName?petName+', ':'')+'food time', 'din din']; speak(pick(phrases), rnd(1.5,1.85), rnd(0.9,1.05)); }
      return true;
    }
    return false;
  }
  function cue(id){for(var i=0;i<CUES.length;i++)if(CUES[i].id===id)return CUES[i];return null;}

  // ---- "say it your way": decompose owner words into cues this cat may know ----
  var WORDMAP={
    'come':'name','here':'name','hey':'name','kitty':'name',
    'hi':'trill','hello':'trill','greetings':'trill',
    'eat':'feed','food':'feed','dinner':'feed','hungry':'feed','treat':'feed','breakfast':'feed','lunch':'feed','dindin':'feed',
    'meow':'meow','mew':'meow',
    'purr':'purr','content':'purr','happy':'purr','relax':'purr','calm':'purr'
  };
  function decompose(text, petName, taughtLabels){
    var words=(text||'').toLowerCase().replace(/[^a-z0-9'\s]/g,' ').split(/\s+/).filter(Boolean);
    var nameL=(petName||'').toLowerCase();
    var taught=(taughtLabels||[]).map(function(s){return (s||'').toLowerCase();});
    return words.map(function(w){
      if(nameL && w===nameL) return {word:w, cueId:'name', known:true, src:'cue'};
      if(WORDMAP[w]) return {word:w, cueId:WORDMAP[w], known:true, src:'cue'};
      for(var i=0;i<taught.length;i++){ if(taught[i] && (taught[i].indexOf(w)>=0 || w.indexOf(taught[i])>=0)) return {word:w, cueId:null, known:true, src:'taught'}; }
      return {word:w, cueId:null, known:false, src:null};
    });
  }

  global.PawTalk={CUES:CUES, TIPS:TIPS, play:play, cue:cue, decompose:decompose};
})(window);
