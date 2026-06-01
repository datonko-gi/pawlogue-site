/* Pawlogue audio engine: on-device capture + feature extraction + honest universal read.
   No network, no fake words. Mood + sound-type from real DSP. Personalization lives in app.js. */
(function(global){
  'use strict';
  var AC = global.AudioContext || global.webkitAudioContext;

  // ---- tiny radix-2 FFT (magnitudes) ----
  function fftMag(re){
    var n=re.length, im=new Float32Array(n);
    for(var i=1,j=0;i<n;i++){var bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){var t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
    for(var len=2;len<=n;len<<=1){var ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);
      for(var s=0;s<n;s+=len){var cr=1,ci=0;
        for(var k=0;k<len/2;k++){var ur=re[s+k],ui=im[s+k],vr=re[s+k+len/2]*cr-im[s+k+len/2]*ci,vi=re[s+k+len/2]*ci+im[s+k+len/2]*cr;
          re[s+k]=ur+vr;im[s+k]=ui+vi;re[s+k+len/2]=ur-vr;im[s+k+len/2]=ui-vi;
          var ncr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=ncr;}}}
    var m=new Float32Array(n/2);for(var x=0;x<n/2;x++)m[x]=Math.sqrt(re[x]*re[x]+im[x]*im[x]);return m;
  }
  function nextPow2(v){var p=1;while(p<v)p<<=1;return p;}

  // autocorrelation pitch on a frame
  function pitch(buf,sr){
    var n=buf.length, best=-1,bestlag=-1, rms=0;
    for(var i=0;i<n;i++)rms+=buf[i]*buf[i]; rms=Math.sqrt(rms/n);
    if(rms<0.008) return 0;
    var minLag=Math.floor(sr/1100), maxLag=Math.floor(sr/60);
    for(var lag=minLag;lag<=maxLag;lag++){var s=0;for(var k=0;k<n-lag;k++)s+=buf[k]*buf[k+lag];
      if(s>best){best=s;bestlag=lag;}}
    if(bestlag<=0) return 0; var f=sr/bestlag; return (f>60&&f<1100)?f:0;
  }

  // analyze an AudioBuffer -> features
  function analyze(audioBuf){
    var sr=audioBuf.sampleRate, ch=audioBuf.getChannelData(0);
    // energy gate: find voiced region
    var win=Math.floor(sr*0.02), maxE=1e-9, energies=[];
    for(var i=0;i<ch.length;i+=win){var e=0,c=0;for(var k=i;k<i+win&&k<ch.length;k++){e+=ch[k]*ch[k];c++;}e=Math.sqrt(e/(c||1));energies.push(e);if(e>maxE)maxE=e;}
    var thr=maxE*0.18, s=-1,en=-1;
    for(var w=0;w<energies.length;w++){if(energies[w]>thr){if(s<0)s=w;en=w;}}
    if(s<0){s=0;en=energies.length-1;}
    var start=s*win, end=Math.min((en+1)*win,ch.length), seg=ch.subarray(start,end);
    var dur=(end-start)/sr;
    if(seg.length<256) return null;

    // RMS + ZCR
    var rms=0,zc=0;for(var a=0;a<seg.length;a++){rms+=seg[a]*seg[a];if(a>0&&((seg[a-1]<0&&seg[a]>=0)||(seg[a-1]>=0&&seg[a]<0)))zc++;}
    rms=Math.sqrt(rms/seg.length); var zcr=zc/seg.length*sr; // crossings/sec

    // framewise pitch (median) + voicing ratio
    var fl=Math.floor(sr*0.04), pitches=[],voiced=0,frames=0;
    for(var p=0;p+fl<=seg.length;p+=fl){frames++;var fr=seg.subarray(p,p+fl),pf=pitch(fr,sr);if(pf>0){pitches.push(pf);voiced++;}}
    pitches.sort(function(a,b){return a-b;});
    var medPitch=pitches.length?pitches[Math.floor(pitches.length/2)]:0;
    var pitchVar=0;if(pitches.length>1){var mp=pitches.reduce(function(x,y){return x+y;},0)/pitches.length;for(var q=0;q<pitches.length;q++)pitchVar+=Math.pow(pitches[q]-mp,2);pitchVar=Math.sqrt(pitchVar/pitches.length);}
    var voicing=frames?voiced/frames:0;

    // spectrum on a hann-windowed chunk from the loudest frame
    var N=nextPow2(Math.min(4096,seg.length)),mid=Math.max(0,Math.floor(seg.length/2-N/2)),re=new Float32Array(N);
    for(var b=0;b<N;b++){var s2=seg[mid+b]||0;re[b]=s2*(0.5-0.5*Math.cos(2*Math.PI*b/(N-1)));}
    var mag=fftMag(re), binHz=sr/N, sumM=0,cen=0,geo=0,arith=0,nz=0;
    for(var f2=1;f2<mag.length;f2++){var hz=f2*binHz;if(hz>12000)break;var m2=mag[f2]+1e-9;sumM+=m2;cen+=hz*m2;arith+=m2;geo+=Math.log(m2);nz++;}
    var centroid=sumM>0?cen/sumM:0;
    var flatness=nz>0?Math.exp(geo/nz)/(arith/nz):0; // 0 tonal .. 1 noisy
    // rolloff 85%
    var roll=0,acc=0,tgt=sumM*0.85;for(var r=1;r<mag.length;r++){acc+=mag[r]+1e-9;if(acc>=tgt){roll=r*binHz;break;}}

    return {dur:dur,rms:rms,zcr:zcr,pitch:medPitch,pitchVar:pitchVar,voicing:voicing,
            centroid:centroid,flatness:flatness,rolloff:roll};
  }

  // normalized vector for prototype matching (owner personalization)
  function vector(f){
    return [
      clamp(f.pitch/700,0,2), clamp(f.pitchVar/200,0,2), clamp(f.zcr/4000,0,2),
      clamp(f.centroid/4000,0,2), clamp(f.flatness*2,0,2), clamp(f.rolloff/6000,0,2),
      clamp(f.dur/3,0,2), clamp(f.voicing*1.5,0,2), clamp(f.rms*6,0,2)
    ];
  }
  function clamp(v,a,b){return v<a?a:v>b?b:v;}

  // honest universal read (sound-type + affect + qualitative confidence 1..4)
  function classify(f){
    if(!f) return null;
    var st,affect,arousal,conf=2,emoji,color;
    var noisy=f.flatness>0.35, lowPitch=f.pitch>0&&f.pitch<260, voiced=f.voicing>0.35;

    if(noisy && f.zcr>2600 && f.voicing<0.4){ st="Hiss"; affect="Threatened or scared"; arousal="high"; conf=3; color="alert"; emoji="😾"; }
    else if(lowPitch && voiced && f.pitchVar<70 && f.flatness<0.3 && f.dur>0.4){ st="Purr-like rumble"; affect="Content and calm"; arousal="low"; conf=3; color="calm"; emoji="😌"; }
    else if(lowPitch && (noisy||f.flatness>0.25) && voiced){ st="Growl"; affect="Agitated, warning"; arousal="high"; conf=2; color="alert"; emoji="😼"; }
    else if(voiced && f.pitch>=260){
      st="Meow / call";
      var intensity=(f.pitch>520?1:0)+(f.dur>0.9?1:0)+(f.rms>0.12?1:0)+(f.pitchVar>120?1:0);
      if(intensity>=3){ affect="Distressed or urgent"; arousal="high"; color="alert"; emoji="🙀"; conf=2; }
      else if(intensity>=1){ affect="Seeking something (food, attention, a door)"; arousal="medium"; color="amber"; emoji="😺"; conf=2; }
      else { affect="Calm greeting"; arousal="low"; color="play"; emoji="😻"; conf=2; }
    }
    else { st="Unclear"; affect="Hard to tell this time"; arousal="?"; conf=1; color="amber"; emoji="🐾"; }

    // honesty: short / quiet clips lower confidence
    if(f.dur<0.25 || f.rms<0.02) conf=Math.min(conf,1);
    return {soundType:st,affect:affect,arousal:arousal,confidence:conf,emoji:emoji,color:color};
  }

  // ---- recording ----
  var ctx,stream,analyser,mediaRec,chunks,rafCb,srcNode;
  function startRec(onLevel){
    return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}).then(function(st){
      stream=st; ctx=ctx||new AC(); if(ctx.state==='suspended')ctx.resume();
      srcNode=ctx.createMediaStreamSource(st); analyser=ctx.createAnalyser(); analyser.fftSize=512; srcNode.connect(analyser);
      var data=new Uint8Array(analyser.frequencyBinCount);
      (function loop(){ if(!analyser)return; analyser.getByteFrequencyData(data); var s=0;for(var i=0;i<data.length;i++)s+=data[i]; onLevel(data,s/data.length/255); rafCb=requestAnimationFrame(loop);})();
      chunks=[]; var mime=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':(MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':'');
      mediaRec=new MediaRecorder(st, mime?{mimeType:mime}:undefined);
      mediaRec.ondataavailable=function(e){if(e.data.size)chunks.push(e.data);};
      mediaRec.start();
    });
  }
  function stopRec(){
    return new Promise(function(res){
      if(rafCb)cancelAnimationFrame(rafCb);
      if(!mediaRec){res(null);return;}
      mediaRec.onstop=function(){
        var blob=new Blob(chunks,{type:chunks[0]?chunks[0].type:'audio/webm'});
        if(stream)stream.getTracks().forEach(function(t){t.stop();});
        if(analyser){analyser.disconnect();analyser=null;}
        blob.arrayBuffer().then(function(ab){return ctx.decodeAudioData(ab.slice(0));}).then(function(audioBuf){
          var f=analyze(audioBuf); res({blob:blob,features:f,classify:classify(f),vector:f?vector(f):null});
        }).catch(function(){res({blob:blob,features:null,classify:null,vector:null});});
      };
      mediaRec.stop();
    });
  }
  function dist(a,b){if(!a||!b)return 9;var s=0;for(var i=0;i<a.length;i++)s+=Math.pow(a[i]-b[i],2);return Math.sqrt(s);}

  global.PawAudio={startRec:startRec,stopRec:stopRec,classify:classify,dist:dist};
})(window);
