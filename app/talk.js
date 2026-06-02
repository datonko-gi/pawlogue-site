/* Pawlogue talk-back engine: HONEST human->cat cues, many variants each.
   Real cat audio (purr/trill/meow, multiple recordings) + human attractor sounds you make
   (pspsps, kiss, tongue-click, the cat's name, feeding word, "here kitty"). Every cue has
   several VARIANTS and we cycle through them (variant 1, 2, 3 ...) so you can find the one
   YOUR cat reacts to. We never claim the cat understood words: verb is "played / tried". */
(function(global){
  'use strict';
  var AC = global.AudioContext || global.webkitAudioContext;
  var ctx=null;
  function ac(){ ctx=ctx||new AC(); if(ctx.state==='suspended')ctx.resume(); return ctx; }
  function rnd(a,b){ return a+(b-a)*Math.random(); }
  var vIdx={};  // per-cue variant cursor (cycles)

  var CUES=[
    {id:'purr', label:'Purr (mrrrr)', icon:'😻', kind:'audio',
      clips:['purr1.mp3','purr2.mp3','purr3.mp3','purr4.mp3','purr5.mp3','purr6.mp3'],
      basis:'Real, calm cat purrs. A warm, friendly opener your cat relaxes to.'},
    {id:'trill', label:'Trill / chirp', icon:'🎵', kind:'audio',
      clips:['trill1.mp3','trill2.mp3','trill3.mp3','trill4.mp3','trill5.mp3'],
      basis:'Real cat trills, the friendly greeting and mother-to-kitten call.'},
    {id:'meow', label:'Meow', icon:'🐱', kind:'audio',
      clips:['meow1.mp3','meow2.mp3','meow3.mp3','meow4.mp3','meow5.mp3','meow6.mp3','meow7.mp3','meow8.mp3','meow9.mp3','meow10.mp3'],
      basis:'Real cat greeting meows. Often gets a cat to look or answer back.'},
    {id:'pspsps', label:'"Pspsps"', icon:'🤫', kind:'synth', variants:6,
      basis:'High, prey-like attractor that you make. A different rhythm each press.'},
    {id:'kiss', label:'Kiss squeak', icon:'😙', kind:'synth', variants:5,
      basis:'A high kissy squeak. A classic come-here attractor cats turn toward.'},
    {id:'click', label:'Tongue click', icon:'👅', kind:'synth', variants:5,
      basis:'A "tch-tch" click. Sharp and prey-like, easy for a cat to locate.'}
  ];
  // Note: the cat's name, feeding words and "here kitty" are things YOU say in your
  // own voice, so Pawlogue does not robot-voice them. Use your own voice for those.

  var TIPS=[
    {icon:'😌', title:'Slow blink', body:'Look at your cat, slowly close your eyes for about a second, then open them. It is a validated "I trust you" signal. Many cats slow-blink back, that is them answering you.'},
    {icon:'🤚', title:'Scratch the cheeks and between the ears', body:'Cats have scent glands on their cheeks and head. A gentle scratch there says "you are family", it is how cats mark the ones they bond with.'},
    {icon:'💬', title:'Use a warm, high voice', body:'Cats respond more to a soft, high, sing-song tone (the way we talk to babies) than to flat speech.'},
    {icon:'🪶', title:'Play like prey', body:'Drag a toy in quick, darting moves with pauses, the way real prey moves. Short bursts then a freeze.'},
    {icon:'👃', title:'Offer a slow finger', body:'Hold out a relaxed finger at nose height and let your cat come to it. It mimics the polite nose-touch greeting cats do with each other.'},
    {icon:'🧘', title:'Let the cat choose', body:'The strongest bond signal is patience. Sit near, stay calm, and let your cat approach on its own terms.'},
    {icon:'👀', title:'Never hard-stare', body:'A long, unblinking stare reads as a threat. Soften your gaze and look away now and then.'},
    {icon:'🐈', title:'Read the tail', body:'Tail straight up is a happy hello. A quiver at the tip is excitement to see you. Puffed or thrashing means give space.'},
    {icon:'👂', title:'Watch the ears', body:'Ears forward means curious. Ears flat or back means stop, they are scared or annoyed.'},
    {icon:'🍽', title:'Name before good things', body:'Say your cat’s name right before food, treats, or play, every time. They learn it means good things are coming.'},
    {icon:'🙇', title:'Get down to their level', body:'Crouch or sit on the floor instead of looming over them. Being at their height invites them in.'},
    {icon:'🛐', title:'Let them sniff first', body:'Before petting, offer your hand and let your cat sniff it. Scent is their handshake.'},
    {icon:'🫳', title:'Pet where they like it', body:'Cheeks, chin, and the base of the ears are almost always welcome. Watch for the lean-in versus the flinch.'},
    {icon:'🏔', title:'Give them a high perch', body:'Cats feel safest surveying the room from up high. It lowers stress and builds confidence.'},
    {icon:'🕰', title:'Keep a routine', body:'Feed, play, and greet at the same times each day. Predictability is comfort for a cat.'},
    {icon:'🎯', title:'End play with a catch', body:'Let your cat actually catch the toy at the end, then feed a little. A successful hunt leaves them satisfied.'},
    {icon:'🚫', title:'Redirect, never punish', body:'Cats do not learn from scolding. Redirect to a post or toy and reward what you want.'},
    {icon:'🐾', title:'The elevator butt', body:'If your cat raises its hips when you scratch near the tail base, that is "yes, right there".'},
    {icon:'😺', title:'Blink back', body:'When your cat slow-blinks at you, slow-blink back. You are returning an "I love you".'},
    {icon:'🧶', title:'Rotate the toys', body:'Put some toys away and swap them weekly. A "new" old toy reawakens curiosity.'},
    {icon:'🌙', title:'Respect the rest', body:'A cat in a loaf or deep asleep feels secure. Let them be. Honoring rest builds trust.'},
    {icon:'🍗', title:'Hand-feed a treat', body:'Offer a favorite treat from your open palm. Taking food from your hand is a real trust step.'},
    {icon:'🗣', title:'Answer their meow', body:'When your cat meows at you, reply out loud, then pause. Answering turns it into a back-and-forth.'}
  ];

  function pick(arr,i){ return arr[((i%arr.length)+arr.length)%arr.length]; }
  function tone(f0,f1,dur,t0,type,g){ var c=ac(),o=c.createOscillator(),gn=c.createGain();
    o.type=type||'triangle'; o.frequency.setValueAtTime(f0,t0); o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t0+dur);
    gn.gain.setValueAtTime(0.0001,t0); gn.gain.exponentialRampToValueAtTime(g||0.25,t0+0.02); gn.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(gn).connect(c.destination); o.start(t0); o.stop(t0+dur+0.02); }
  function noiseBurst(t0,dur,centerHz,g,q){ var c=ac(),n=Math.floor(c.sampleRate*dur),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
    for(var i=0;i<n;i++)d[i]=(Math.random()*2-1);
    var src=c.createBufferSource();src.buffer=buf; var bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=centerHz;bp.Q.value=q||4;
    var gn=c.createGain();gn.gain.setValueAtTime(0.0001,t0);gn.gain.exponentialRampToValueAtTime(g,t0+0.008);gn.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    src.connect(bp).connect(gn).connect(c.destination);src.start(t0);src.stop(t0+dur+0.02); }
  function speak(text,pitch,rate){ try{var u=new SpeechSynthesisUtterance(text);u.pitch=pitch;u.rate=rate;u.volume=1;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(_){}}

  // synth variant presets
  function pspsps(v){ var c=ac(),t=c.currentTime; var n=[3,2,4,3,5,2][v%6], cf=[9500,8600,10200,9000,10800,8800][v%6], gap=[0.2,0.26,0.16,0.22,0.14,0.28][v%6];
    for(var i=0;i<n;i++) noiseBurst(t+i*gap, 0.16, cf+rnd(-300,300), 0.32, 5); }
  function kiss(v){ var c=ac(),t=c.currentTime; var f0=[700,820,650,900,760][v%5], f1=[1700,1900,1500,2100,1800][v%5];
    tone(f0,f1,0.2,t,'sine',0.2); noiseBurst(t,0.1,5500,0.06,2); }
  function click(v){ var c=ac(),t=c.currentTime; var n=[3,2,4,3,2][v%5], cf=[3800,4500,3200,4000,5000][v%5];
    for(var i=0;i<n;i++) noiseBurst(t+i*0.13, 0.04, cf, 0.3, 1.5); }

  function play(id, petName){
    var q=cue(id); if(!q) return null;
    var v=(vIdx[id]||0); vIdx[id]=v+1;
    var total=1;
    if(q.kind==='audio'){ total=q.clips.length; try{ var a=new Audio('sounds/'+pick(q.clips,v)); a.playbackRate=rnd(0.97,1.05); a.volume=1; a.play(); }catch(_){}}
    else if(q.kind==='synth'){ total=q.variants; if(id==='pspsps')pspsps(v); else if(id==='kiss')kiss(v); else if(id==='click')click(v); }
    return { variant:(v%total)+1, total:total };
  }
  function cue(id){for(var i=0;i<CUES.length;i++)if(CUES[i].id===id)return CUES[i];return null;}

  var WORDMAP={ 'psspss':'pspsps','pspsps':'pspsps',
    'hi':'trill','hello':'trill','greetings':'trill','chirp':'trill','trill':'trill',
    'meow':'meow','mew':'meow', 'purr':'purr','content':'purr','happy':'purr','relax':'purr','calm':'purr',
    'kiss':'kiss','click':'click' };
  function decompose(text, petName, taughtLabels){
    var words=(text||'').toLowerCase().replace(/[^a-z0-9'\s]/g,' ').split(/\s+/).filter(Boolean);
    var taught=(taughtLabels||[]).map(function(s){return (s||'').toLowerCase();});
    return words.map(function(w){
      if(WORDMAP[w]) return {word:w, cueId:WORDMAP[w], known:true, src:'cue'};
      for(var i=0;i<taught.length;i++){ if(taught[i] && (taught[i].indexOf(w)>=0 || w.indexOf(taught[i])>=0)) return {word:w, cueId:null, known:true, src:'taught'}; }
      return {word:w, cueId:null, known:false, src:null};
    });
  }

  global.PawTalk={CUES:CUES, TIPS:TIPS, play:play, cue:cue, decompose:decompose};
})(window);
