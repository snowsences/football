// Only these aggregated fields leave the rating engine. No scores, events, or probabilities.
export const RATING_VERSION = 1;
const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v));
const tenth = v => Math.round(clamp(v, 1, 10)*10)/10;
function elapsed(p) {
  const q=Number(p.period?.number), parts=String(p.clock?.displayValue||'').split(':').map(Number);
  if (!q || parts.length!==2 || parts.some(x=>!Number.isFinite(x))) return null;
  return q>4 ? 3600 : clamp((q-1)*900+900-(parts[0]*60+parts[1]),0,3600);
}
export function collectPlays(summary) {
  const drives=[...(summary.drives?.previous||[])];
  if(summary.drives?.current) drives.push(summary.drives.current);
  const seen=new Map();
  for(const d of drives) for(const p of d.plays||[]) if(p.id) seen.set(String(p.id),p);
  return [...seen.values()].sort((a,b)=>Number(a.sequenceNumber||0)-Number(b.sequenceNumber||0));
}
export function rateGame(summary) {
  const plays=collectPlays(summary), complete=summary.header?.competitions?.[0]?.status?.type?.completed===true;
  const gamePlays=plays.filter(p=>elapsed(p)!==null);
  const lastElapsed=Math.max(0,...gamePlays.map(elapsed));
  // An incomplete or missing timeline is not enough evidence to invent a rating.
  if(gamePlays.length<20 || (!complete && lastElapsed<600)) return null;
  if(complete && lastElapsed<3300) return null;
  let competitive=0, lateClose=0, duration=0, lateDuration=0;
  let prevTime=0, prevMargin=0;
  for(const p of gamePlays){
    const time=elapsed(p); if(time===null||time<prevTime) continue;
    const dt=time-prevTime;
    const closeness=clamp(1-Math.max(0,prevMargin-3)/18);
    competitive+=closeness*dt; duration+=dt;
    const lateDt=Math.max(0,time-Math.max(prevTime,2700));
    lateClose+=closeness*lateDt; lateDuration+=lateDt;
    if(Number.isFinite(Number(p.homeScore))&&Number.isFinite(Number(p.awayScore))) prevMargin=Math.abs(Number(p.homeScore)-Number(p.awayScore));
    prevTime=time;
  }
  const timeById=new Map(gamePlays.map(p=>[String(p.id),elapsed(p)]));
  const probabilities=(summary.winprobability||[]).map(p=>({p:Number(p.homeWinPercentage),time:timeById.get(String(p.playId))})).filter(x=>Number.isFinite(x.p)&&x.p>=0&&x.p<=1&&x.time!==undefined).sort((a,b)=>a.time-b.time);
  let suspense=0, suspenseDuration=0, lateSuspense=0, lateSuspenseDuration=0, swings=0, prev=probabilities[0];
  for(const point of probabilities.slice(1)){
    const dt=point.time-prev.time;
    const tension=4*prev.p*(1-prev.p);
    suspense+=tension*dt; suspenseDuration+=dt;
    const lateDt=Math.max(0,point.time-Math.max(prev.time,2700)); lateSuspense+=tension*lateDt; lateSuspenseDuration+=lateDt;
    if(point.time<3600) swings+=Math.max(0,Math.abs(point.p-prev.p)-0.04);
    prev=point;
  }
  const enoughProb=probabilities.length>=20 && suspenseDuration>=duration*.65;
  const closeness=duration?competitive/duration:0;
  const late=lateDuration?lateClose/lateDuration:closeness;
  const tension=enoughProb?suspense/Math.max(1,suspenseDuration):closeness;
  const lateTension=enoughProb&&lateSuspenseDuration?lateSuspense/lateSuspenseDuration:late;
  const volatility=enoughProb?clamp(swings/(Math.max(lastElapsed/3600,.25)*1.35)):closeness;
  const drama=tenth(1+9*(.30*closeness+.25*tension+.25*lateTension+.20*volatility));
  const snaps=gamePlays.filter(p=>Number(p.start?.down)>0 && !/timeout|end of|two.minute|kneel|spike/i.test(p.type?.text||'') && !p.isPenalty);
  if(snaps.length<12) return null;
  const explosive=snaps.filter(p=>Number(p.statYardage)>=20).length/snaps.length;
  const productive=snaps.filter(p=>Number(p.statYardage)>=8).length/snaps.length;
  const scoringDrives=(summary.drives?.previous||[]).filter(d=>/^(TD|FG)$|touchdown|field goal/i.test(d.result||''));
  const drives=(summary.drives?.previous||[]).filter(d=>(d.plays||[]).some(p=>Number(p.start?.down)>0));
  const scoringRate=drives.length?scoringDrives.length/drives.length:0;
  const action=tenth(1+9*(.45*clamp(explosive/.10)+.30*clamp(productive/.36)+.25*clamp(scoringRate/.65)));
  return {overall:tenth(.75*drama+.25*action),drama,action,provisional:!complete,confidence:enoughProb?'full':'basic',version:RATING_VERSION};
}
