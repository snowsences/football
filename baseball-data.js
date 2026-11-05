import {completedSeason} from './reveal-policy.js?v=23';
export const DEFAULT_FAVORITES=['13','12'];
export const CLUBS=[
 ['29','Diamondbacks'],['11','Athletics'],['15','Braves'],['1','Orioles'],['2','Red Sox'],['16','Cubs'],['4','White Sox'],['17','Reds'],['5','Guardians'],['27','Rockies'],['6','Tigers'],['18','Astros'],['7','Royals'],['3','Angels'],['19','Dodgers'],['28','Marlins'],['8','Brewers'],['9','Twins'],['21','Mets'],['10','Yankees'],['22','Phillies'],['23','Pirates'],['25','Padres'],['26','Giants'],['12','Mariners'],['24','Cardinals'],['30','Rays'],['13','Rangers'],['14','Blue Jays'],['20','Nationals']
];
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export function gameDay(date=new Date()){
 const d=new Date(date);if(!Number.isFinite(+d))return '';
 const p=Object.fromEntries(dayFormatter.formatToParts(d).map(({type,value})=>[type,value]));return [p.year,p.month,p.day].join('-');
}
export function shiftDay(day,n){
 const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
export function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
export function team(t){
 const id=String(t?.id??'');if(!/^\d+$/.test(id))return null;
 const abbr=String(t.abbreviation||'');
 const logo=[t.logo,...(Array.isArray(t.logos)?t.logos.map(l=>l.href):[])].find(url=>typeof url==='string'&&/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/mlb\//.test(url));
 return {id,name:t.shortDisplayName||t.name||t.displayName||CLUBS.find(c=>c[0]===id)?.[1]||abbr,abbr,logo};
}
const display=x=>typeof x==='object'&&x!==null?x.displayValue??x.value:x;
export function readGame(event){
 const c=event?.competitions?.[0],id=String(event?.id??c?.id??''),date=c?.date||event?.date,day=gameDay(date||'invalid');
 if(!c||!day||!/^\d+$/.test(id))return null;
 const teams=(c.competitors||[]).map(t=>{
  const club=team(t.team);if(!club)return null;
  const record=[...(t.records||[]),...(Array.isArray(t.record)?t.record:[])].find(r=>r.type==='total');
  return {...club,side:t.homeAway,score:display(t.score),hits:t.hits,errors:t.errors,record:record?.summary??record?.displayValue,innings:(t.linescores||[]).map(display)};
 }).filter(Boolean).sort((a,b)=>Number(a.side==='home')-Number(b.side==='home'));
 if(teams.length!==2||teams[0].side!=='away'||teams[1].side!=='home')return null;
 const status=c.status?.type||event.status?.type||{};
 const state=status.completed&&status.state==='post'&&!/cancel|postpon|suspend/i.test(status.name||'')?'final':status.state==='in'?'live':/cancel|postpon|suspend|delay/i.test(status.name||'')?'unavailable':'upcoming';
 return {id,date,day,teams,state,season:Number(event.season?.year??day.slice(0,4)),stage:Number(event.seasonType?.type??event.season?.type??0),detail:status.shortDetail||status.description||''};
}
export function revealAllowed(game,prefs,activeYear=Number(gameDay().slice(0,4)),activeComplete=false){
 if(game.state!=='final'&&game.state!=='live')return false;
 const cutoff=prefs.cutoffs?.[game.season];
 return !!((game.state==='final'&&completedSeason(game.season,activeYear,activeComplete))||prefs.revealed?.[game.id]||prefs.watched?.[game.id]||(game.stage!==1&&validDay(cutoff)&&game.day<=cutoff));
}
export function advanceCutoff(previous,next,year,today){
 return validDay(next)&&next.startsWith(year+'-')&&next<=today&&(!validDay(previous)||next>=previous)?next:previous;
}
const clamp=x=>Math.max(0,Math.min(1,x));
export function rateBaseball(summary){
 const plays=new Map((summary.plays||[]).map(p=>[String(p.id),Number(p.period?.number)]));
 const points=(summary.winprobability||[]).filter(p=>p.homeWinPercentage!=null).map(p=>({p:Number(p.homeWinPercentage),inning:plays.get(String(p.playId))})).filter(x=>x.p>=0&&x.p<=1&&Number.isInteger(x.inning)&&x.inning>0);
 if(points.length<15||points.at(-1).inning<5)return null;
 let tension=0,weight=0,swings=0;
 for(let i=1;i<points.length;i++){
  const prev=points[i-1],next=points[i],w=next.inning>=7?2.5:1;
  tension+=w*(4*prev.p*(1-prev.p))**2;weight+=w;
  swings+=w*Math.max(0,Math.abs(next.p-prev.p)-.06);
 }
 return Math.round((1+9*(.75*tension/weight+.25*clamp(swings/3.6)))*10)/10;
}
export async function eachLimit(items,limit,fn,signal){
 let i=0;
 await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{
  while(!signal?.aborted&&i<items.length)await fn(items[i++]);
 }));
}
