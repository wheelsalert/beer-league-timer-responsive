const APP_VERSION='v1.0.0';
const DEFAULT_SECONDS=90;
const DEFAULT_REPS=1;
const DEFAULT_HORN_MS=550;
const GAP_MS=700;

let running=false;
let timerId=null;
let totalSeconds=DEFAULT_SECONDS;
let remainingSeconds=DEFAULT_SECONDS;
let totalReps=DEFAULT_REPS;
let currentRep=1;
let customHornUrl=null;
let customHornDurationMs=1000;
let audioCtx=null;
let completionInProgress=false;
let customAudioEl=null;

function byId(id){return document.getElementById(id);}
function getAudioContext(){if(!audioCtx){const Ctx=window.AudioContext||window.webkitAudioContext;if(Ctx)audioCtx=new Ctx();}return audioCtx;}
async function unlockAudio(){
  const ctx=getAudioContext();
  if(ctx&&ctx.state==='suspended'){try{await ctx.resume();}catch(e){}}
  if(customAudioEl && customHornUrl){
    try{
      customAudioEl.muted=true;
      customAudioEl.currentTime=0;
      const p=customAudioEl.play();
      if(p&&typeof p.then==='function'){await p.catch(()=>{});}
      customAudioEl.pause();
      customAudioEl.currentTime=0;
      customAudioEl.muted=false;
    }catch(e){}
  }
}
function clampPositiveInt(value,fallback){const num=Number(value);if(!Number.isFinite(num))return fallback;const whole=Math.floor(num);return whole>0?whole:fallback;}
function sanitizeNumberField(el,fallback){if(el.value==='')return;el.value=String(clampPositiveInt(el.value,fallback));}
function sanitizeInputs(){const cleanSeconds=clampPositiveInt(byId('secondsInput').value,DEFAULT_SECONDS);const cleanReps=clampPositiveInt(byId('repsInput').value,DEFAULT_REPS);byId('secondsInput').value=String(cleanSeconds);byId('repsInput').value=String(cleanReps);return {cleanSeconds,cleanReps};}
function updateDisplay(){byId('clock').textContent=String(Math.max(0,remainingSeconds));byId('repDisplay').textContent=`Repetition ${currentRep} of ${totalReps}`;}
function setSoundStatus(){byId('soundStatus').textContent=customHornUrl?'Using selected custom horn':'Using built-in buzzer';}
function loadValuesFromInputs(){const vals=sanitizeInputs();totalSeconds=vals.cleanSeconds;totalReps=vals.cleanReps;remainingSeconds=totalSeconds;currentRep=1;updateDisplay();}
function waitMs(ms){return new Promise(resolve=>window.setTimeout(resolve,ms));}
function updateResponsiveLayout(){const wrap=byId('appWrap');if(window.innerWidth>=900){wrap.classList.add('landscape-layout');}else{wrap.classList.remove('landscape-layout');}}

function playDefaultHornOnce(durationMs=DEFAULT_HORN_MS){
  const ctx=getAudioContext();
  if(!ctx)return Promise.resolve();
  return new Promise(resolve=>{
    const now=ctx.currentTime;
    const gain=ctx.createGain();
    const osc1=ctx.createOscillator();
    const osc2=ctx.createOscillator();
    osc1.type='sawtooth'; osc2.type='square';
    osc1.frequency.setValueAtTime(410,now); osc2.frequency.setValueAtTime(205,now);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.22,now+.02);
    gain.gain.exponentialRampToValueAtTime(.14,now+durationMs/1000*.6);
    gain.gain.exponentialRampToValueAtTime(.0001,now+durationMs/1000);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc1.start(now); osc2.start(now); osc1.stop(now+durationMs/1000); osc2.stop(now+durationMs/1000);
    window.setTimeout(resolve,durationMs+50);
  });
}

function playCustomHornOnce(){
  return new Promise(resolve=>{
    if(!customAudioEl || !customHornUrl){resolve(false);return;}
    try{
      let settled=false;
      const cleanup=()=>{customAudioEl.onended=null; customAudioEl.onerror=null;};
      const finish=(played)=>{if(settled)return; settled=true; cleanup(); resolve(played);};
      customAudioEl.pause();
      customAudioEl.currentTime=0;
      customAudioEl.onended=()=>finish(true);
      customAudioEl.onerror=()=>finish(false);
      const p=customAudioEl.play();
      if(p && typeof p.then==='function'){
        p.then(()=>{window.setTimeout(()=>finish(true),Math.max(200,customHornDurationMs)+50);}).catch(()=>finish(false));
      } else {
        window.setTimeout(()=>finish(true),Math.max(200,customHornDurationMs)+50);
      }
    }catch(e){
      resolve(false);
    }
  });
}

async function playHornSequence(times){
  for(let i=0;i<times;i++){
    const ok=await playCustomHornOnce();
    if(!ok){await playDefaultHornOnce(DEFAULT_HORN_MS);}
    if(i<times-1){await waitMs(GAP_MS);}
  }
}

function pauseIntervalOnly(){if(timerId!==null){window.clearInterval(timerId);timerId=null;}running=false;}
function isFreshStart(){return currentRep===1&&remainingSeconds===totalSeconds;}

async function startTimer(){
  if(running||completionInProgress)return;
  await unlockAudio();
  if(isFreshStart()){loadValuesFromInputs();}else{sanitizeInputs();}
  running=true;
  await playHornSequence(1);
  if(!completionInProgress){timerId=window.setInterval(tickTimer,1000);}
}

function tickTimer(){
  remainingSeconds-=1;
  if(remainingSeconds<0)remainingSeconds=0;
  updateDisplay();
  if(remainingSeconds===0){
    if(currentRep>=totalReps){finishTimer();return;}
    advanceToNextRep();
  }
}

async function advanceToNextRep(){
  pauseIntervalOnly();
  currentRep+=1;
  remainingSeconds=totalSeconds;
  updateDisplay();
  await playHornSequence(1);
  if(!completionInProgress){running=true;timerId=window.setInterval(tickTimer,1000);}
}

function pauseTimer(){if(completionInProgress)return;pauseIntervalOnly();}

function resetToDefaultsUI(){
  byId('secondsInput').value=String(DEFAULT_SECONDS);
  byId('repsInput').value=String(DEFAULT_REPS);
  byId('hornInput').value='';
  if(customHornUrl){URL.revokeObjectURL(customHornUrl);customHornUrl=null;}
  if(customAudioEl){
    customAudioEl.pause();
    customAudioEl.removeAttribute('src');
    try{customAudioEl.load();}catch(e){}
  }
  customHornDurationMs=1000;
  totalSeconds=DEFAULT_SECONDS;
  remainingSeconds=DEFAULT_SECONDS;
  totalReps=DEFAULT_REPS;
  currentRep=1;
  completionInProgress=false;
  setSoundStatus();
  updateDisplay();
}

function resetTimer(){completionInProgress=false;pauseIntervalOnly();resetToDefaultsUI();}

async function finishTimer(){
  if(completionInProgress)return;
  completionInProgress=true;
  pauseIntervalOnly();
  await playHornSequence(3);
  resetToDefaultsUI();
}

function loadCustomHorn(event){
  const file=event&&event.target&&event.target.files?event.target.files[0]:null;
  if(customHornUrl){URL.revokeObjectURL(customHornUrl);customHornUrl=null;}
  customAudioEl=byId('customHornPlayer');
  if(customAudioEl){
    customAudioEl.pause();
    customAudioEl.removeAttribute('src');
    try{customAudioEl.load();}catch(e){}
  }
  if(file){
    customHornUrl=URL.createObjectURL(file);
    customHornDurationMs=1000;
    customAudioEl.src=customHornUrl;
    customAudioEl.preload='auto';
    customAudioEl.onloadedmetadata=function(){
      if(Number.isFinite(customAudioEl.duration)&&customAudioEl.duration>0){
        customHornDurationMs=Math.ceil(customAudioEl.duration*1000);
      }
    };
    try{customAudioEl.load();}catch(e){}
  } else {
    customHornDurationMs=1000;
  }
  setSoundStatus();
}

function showQR(){
  const url=window.location.href;
  byId('qrUrl').textContent=url;
  byId('qrImage').src='https://api.qrserver.com/v1/create-qr-code/?size=256x256&data='+encodeURIComponent(url);
  byId('qrOverlay').style.display='flex';
}
function closeQR(){byId('qrOverlay').style.display='none';}
async function copyLink(){try{await navigator.clipboard.writeText(window.location.href);}catch(e){}}

window.addEventListener('resize', updateResponsiveLayout);
window.addEventListener('orientationchange', updateResponsiveLayout);

customAudioEl=byId('customHornPlayer');
updateDisplay();
sanitizeInputs();
setSoundStatus();
updateResponsiveLayout();
