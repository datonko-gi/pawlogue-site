/* Pawlogue video engine: film your cat, bake the honest dialogue overlay + Pawlogue
   watermark into the recording, then share. Everything on-device.
   The cat's line comes from the REAL model (PawEngine) on a rolling mic buffer.
   You answer with a cue (PawTalk). Both captions are drawn onto the canvas, so they
   are baked into the exported clip. */
(function(global){
  'use strict';
  var W=720, H=1280;                 // 9:16 portrait, TikTok/IG friendly
  var video, canvas, cctx, raf, stream, rec, chunks, mime, lastBlob=null;
  var ac, ring, ringLen, ringPos=0, srcNode, proc, zero;
  var caps=[];                        // captions: {who,text,born}
  var recording=false, recStart=0;
  // playful-but-truthful caption voice (a mood gloss of the REAL detected class, not a fake quote)
  var VIBE={Content:'totally chill 😌', Angry:'absolutely FURIOUS 😾', Defense:'on guard, backing off',
    Fighting:'throwing paws 🥊', Warning:'final warning, human 😼', Mating:'yowling for a mate 🌙',
    MotherCall:'calling the kittens 🐈', Hunting:'locked on prey 🪶'};

  function pickMime(){
    var c=['video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    for(var i=0;i<c.length;i++){ if(window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; }
    return '';
  }

  function start(canvasEl){
    canvas=canvasEl; canvas.width=W; canvas.height=H; cctx=canvas.getContext('2d');
    return navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'environment', width:{ideal:1280}, height:{ideal:720} },
      audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false }
    }).then(function(st){
      stream=st;
      video=document.createElement('video'); video.muted=true; video.playsInline=true; video.setAttribute('playsinline','');
      video.srcObject=st; return video.play().then(function(){
        // rolling PCM buffer for "cat said?"
        try{
          ac=new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==='suspended')ac.resume();
          ringLen=Math.floor(ac.sampleRate*2.5); ring=new Float32Array(ringLen);
          srcNode=ac.createMediaStreamSource(st);
          proc=ac.createScriptProcessor(4096,1,1);
          proc.onaudioprocess=function(e){ var d=e.inputBuffer.getChannelData(0); for(var i=0;i<d.length;i++){ ring[ringPos]=d[i]; ringPos=(ringPos+1)%ringLen; } };
          zero=ac.createGain(); zero.gain.value=0; srcNode.connect(proc); proc.connect(zero); zero.connect(ac.destination);
        }catch(_){}
        drawLoop();
        return true;
      });
    });
  }

  function coverDraw(){
    var vw=video.videoWidth||1280, vh=video.videoHeight||720;
    var scale=Math.max(W/vw, H/vh), dw=vw*scale, dh=vh*scale;
    cctx.drawImage(video,(W-dw)/2,(H-dh)/2,dw,dh);
  }
  function roundRect(x,y,w,h,r){ cctx.beginPath(); cctx.moveTo(x+r,y); cctx.arcTo(x+w,y,x+w,y+h,r); cctx.arcTo(x+w,y+h,x,y+h,r); cctx.arcTo(x,y+h,x,y,r); cctx.arcTo(x,y,x+w,y,r); cctx.closePath(); }
  function watermark(){
    cctx.save(); cctx.globalAlpha=0.92;
    var bx=W-188, by=H-70;
    // mini wave bars
    var hs=[10,24,16,20], cols=['#E8A657','#f0c389','#2D8B7A','#E8A657'];
    for(var i=0;i<4;i++){ cctx.fillStyle=cols[i]; roundRect(bx+i*7, by+24-hs[i], 4, hs[i], 2); cctx.fill(); }
    cctx.fillStyle='#F2E8D5'; cctx.font='700 28px system-ui,sans-serif'; cctx.textBaseline='alphabetic';
    cctx.fillText('Pawlogue', bx+36, by+24);
    cctx.restore();
  }
  function drawCaps(){
    var now=performance.now(), y=H-170;
    caps=caps.filter(function(c){ return now-c.born < 5500; });
    var show=caps.slice(-3);
    for(var i=0;i<show.length;i++){
      var c=show[i], you=c.who==='you';
      var pad=26; cctx.font='700 42px system-ui,sans-serif';
      var tw=Math.min(cctx.measureText(c.text).width+pad*2, W-44);
      var bw=tw, bh=84, bx=you?(W-bw-22):22, by=y;
      cctx.save(); cctx.globalAlpha=0.9; cctx.fillStyle=you?'rgba(20,52,46,.94)':'rgba(40,28,16,.94)';
      roundRect(bx,by,bw,bh,20); cctx.fill();
      cctx.globalAlpha=1; cctx.fillStyle=you?'#7fd1c0':'#f0c389'; cctx.font='800 22px system-ui,sans-serif';
      cctx.fillText(you?'YOU':'CAT', bx+pad, by+30);
      cctx.fillStyle='#F2E8D5'; cctx.font='700 40px system-ui,sans-serif';
      var t=c.text; while(cctx.measureText(t).width>bw-pad*2 && t.length>4){ t=t.slice(0,-2); } if(t!==c.text)t+='…';
      cctx.fillText(t, bx+pad, by+68);
      cctx.restore();
      y-=bh+12;
    }
  }
  function recDot(){
    if(!recording)return; cctx.save();
    cctx.fillStyle='#e0584a'; cctx.beginPath(); cctx.arc(40,54,11,0,7); cctx.fill();
    cctx.fillStyle='#F2E8D5'; cctx.font='700 26px system-ui,sans-serif';
    var s=Math.floor((performance.now()-recStart)/1000), mm=String(Math.floor(s/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
    cctx.fillText('REC '+mm+':'+ss, 62, 63); cctx.restore();
  }
  function drawLoop(){ if(!cctx)return; try{ coverDraw(); }catch(_){ cctx.fillStyle='#12100E'; cctx.fillRect(0,0,W,H); } watermark(); drawCaps(); recDot(); raf=requestAnimationFrame(drawLoop); }

  function caption(who,text){ caps.push({who:who,text:text,born:performance.now()}); }

  function startRec(){
    if(recording)return; mime=pickMime();
    var cs=canvas.captureStream(30); var at=stream.getAudioTracks()[0];
    var mixed=new MediaStream(at?[cs.getVideoTracks()[0],at]:[cs.getVideoTracks()[0]]);
    chunks=[]; rec=new MediaRecorder(mixed, mime?{mimeType:mime}:undefined);
    rec.ondataavailable=function(e){ if(e.data&&e.data.size)chunks.push(e.data); };
    rec.start(); recording=true; recStart=performance.now();
  }
  function stopRec(){
    return new Promise(function(res){
      if(!rec||!recording){ res(null); return; }
      var dur=Math.round((performance.now()-recStart)/1000);
      var thumb=''; try{ thumb=canvas.toDataURL('image/jpeg',0.55); }catch(_){}
      rec.onstop=function(){ lastBlob=new Blob(chunks,{type:(chunks[0]&&chunks[0].type)||mime||'video/webm'}); recording=false; res({blob:lastBlob,thumb:thumb,dur:dur}); };
      rec.stop();
    });
  }

  function readBuffer(){
    // linearize ring starting at oldest sample
    var out=new Float32Array(ringLen);
    for(var i=0;i<ringLen;i++){ out[i]=ring[(ringPos+i)%ringLen]; }
    return out;
  }
  function readCat(petName){
    if(typeof PawEngine==='undefined'||!PawEngine._ready||!ac){ caption('cat','(model not ready)'); return Promise.resolve(null); }
    var buf=readBuffer();
    return PawEngine.analyze(buf, ac.sampleRate).then(function(r){
      if(!r.isCat){ caption('cat','(no clear cat sound)'); return r; }
      var top=r.soundClasses[0];
      caption('cat', VIBE[top.id] || top.label);
      return r;
    }).catch(function(){ caption('cat','(could not read)'); return null; });
  }
  function playCue(id, petName){
    if(typeof PawTalk!=='undefined'){ PawTalk.play(id, petName); var q=PawTalk.cue(id); caption('you', (q?q.label:id)); }
  }

  function share(blob){ blob=blob||lastBlob; if(!blob)return Promise.resolve(false);
    var ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
    var file=new File([blob],'pawlogue-'+Date.now()+'.'+ext,{type:blob.type});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      return navigator.share({files:[file], title:'Pawlogue', text:'What my cat is really saying, via Pawlogue'}).then(function(){return true;}).catch(function(){return false;});
    }
    return Promise.resolve(false);
  }
  function save(blob){ blob=blob||lastBlob; if(!blob)return; var ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='pawlogue-'+Date.now()+'.'+ext; a.click();
  }
  function canNativeShare(){ try{ return !!(navigator.canShare && navigator.canShare({files:[new File([new Blob(['x'])],'x.webm',{type:'video/webm'})]})); }catch(_){ return false; } }
  function stopCamera(){
    if(raf)cancelAnimationFrame(raf); raf=null;
    try{ if(rec&&recording)rec.stop(); }catch(_){} recording=false;
    if(stream)stream.getTracks().forEach(function(t){t.stop();}); stream=null;
    try{ if(proc)proc.disconnect(); if(srcNode)srcNode.disconnect(); if(zero)zero.disconnect(); }catch(_){}
    cctx=null; caps=[];
  }

  global.PawVideo={ start:start, startRec:startRec, stopRec:stopRec, readCat:readCat, playCue:playCue,
    caption:caption, share:share, save:save, canNativeShare:canNativeShare, stopCamera:stopCamera,
    isRecording:function(){return recording;}, hasClip:function(){return !!lastBlob;}, lastBlob:function(){return lastBlob;} };
})(window);
