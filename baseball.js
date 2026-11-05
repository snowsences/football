import {championshipFinished} from './reveal-policy.js?v=23';
import {CLUBS,DEFAULT_FAVORITES,esc,gameDay,shiftDay,validDay,team,readGame,revealAllowed,advanceCutoff,rateBaseball,eachLimit} from './baseball-data.js?v=23';

const $=id=>document.getElementById(id);
const SITE='https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/';
const TABLES='https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings';
function readStorage(key){try{return JSON.parse(localStorage.getItem(key))||{};}catch{return {};}}
function writeStorage(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const key='football-mlb-user-v1',ratingKey='football-mlb-ratings-v1';
const prefs={favorites:[...DEFAULT_FAVORITES],revealed:{},watched:{},cutoffs:{},scheduleTeam:'13',...readStorage(key)};
const nflPrefs=readStorage('football-user-v1').preferences||{};
document.documentElement.dataset.theme=nflPrefs.theme==='light'?'light':'dark';
const save=()=>writeStorage(key,prefs);
const ratings=new Map(Object.entries(readStorage(ratingKey))),liveRatings=new Map(),details=new Map();
const lists={Games:[],Best:[],Schedule:[]};
let tab='Games',viewRequest,boxRequest,selected=null,finishedYear,standingsRevealed=false;
const nowYear=()=>Number(gameDay().slice(0,4));
const revealed=g=>revealAllowed(g,prefs,nowYear(),finishedYear===nowYear());
const dateFormat=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',timeZone:'America/New_York'});
const timeFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
const numeric=(a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id);
async function fetchJSON(url,signal){
 const deadline=AbortSignal.timeout(15000);
 const r=await fetch(url,{signal:signal?AbortSignal.any([signal,deadline]):deadline,cache:'no-store'});
 if(!r.ok)throw Error('Feed unavailable');
 return r.json();
}
function observeSeason(feed){
 const year=nowYear();
 if(finishedYear===year||!championshipFinished(feed,'mlb',year))return;
 finishedYear=year;
 if(tab==='Settings')syncCutoff();
 if(lists[tab])renderList(tab);
 if(selected)showDetails();
}
function request(){
 viewRequest?.abort();viewRequest=new AbortController();return viewRequest.signal;
}
function error(el,msg){$(el).textContent=msg;}
function scoreNumber(x){return x!==null&&x!==undefined&&/^\d+$/.test(String(x));}
function favorite(g){return g.teams.some(t=>prefs.favorites.includes(t.id));}
function rating(g){return g.state==='final'?ratings.get(g.id):g.state==='live'?liveRatings.get(g.id):null;}
function latestDetails(g){const box=details.get(g.id)?.game;return box&&!(g.state==='final'&&box.state!=='final')?{...box,season:g.season,stage:g.stage}:g;}
function logo(t){return t.logo?`<span class="team-badge team-logo"><img src="${esc(t.logo)}" alt="" width="46" height="46" loading="lazy"></span>`:'';}
function card(game){
 const g=latestDetails(game),shown=revealed(g),r=rating(g),[away,home]=g.teams;
 const hasScore=shown&&g.teams.every(t=>scoreNumber(t.score));
 const status=g.state==='final'?'Final':g.state==='live'?'In progress':g.state==='unavailable'?'Delayed or unavailable':'Scheduled';
 return `<button class="game-card" data-mlb-game="${esc(g.id)}"><span class="game-date">${dateFormat.format(new Date(g.date))} · ${timeFormat.format(new Date(g.date))} · ${status}${prefs.watched[g.id]?' · Watched':''}</span><span class="game-teams">${[away,home].map((t,i)=>`${i?'<span class="small">at</span>':''}<span class="team">${logo(t)}<span class="team-name">${esc(t.name)}${shown&&t.record?` <small>(${esc(t.record)})</small>`:''}</span></span>`).join('')}</span><span class="rating-row${hasScore?' has-score':''}">${hasScore?`<span class="card-score">${esc(away.abbr)} ${esc(away.score)} · ${esc(home.abbr)} ${esc(home.score)}</span>`:''}${r!=null?`<span class="rating-value">${r.toFixed(1)}<span class="small"> /10${g.state==='live'?' · Live':''}</span></span>`:`<span class="small">${g.state==='live'||g.state==='final'?'Rating unavailable':''}</span>`}</span></button>`;
}
function renderList(which){
 let games=[...lists[which]];
 if(which==='Best')games=games.filter(g=>rating(g)!=null).sort((a,b)=>rating(b)-rating(a)||numeric(b,a));
 if(which==='Games')games.sort((a,b)=>Number(favorite(b))-Number(favorite(a))||numeric(a,b));
 if((which==='Games'&&prefs.favoritesOnly)||(which==='Best'&&$('mlbBestFavorites').checked))games=games.filter(favorite);
 $(which==='Games'?'mlbGameList':which==='Best'?'mlbBestList':'mlbScheduleList').innerHTML=games.map(card).join('');
 if(which==='Games')$('mlbCount').textContent=`${games.length} ${games.length===1?'game':'games'}`;
}
async function scoreboard(start,end=start,signal){
 const days=[];
 for(let day=start;day<=end;day=shiftDay(day,1))days.push(day);
 const games=new Map();
 // ESPN's MLB scoreboard accepts single dates; date ranges can return HTTP 400.
 await eachLimit(days,4,async day=>{
  const d=await fetchJSON(SITE+'scoreboard?dates='+day.replaceAll('-','')+'&limit=1000',signal);
  if(!Array.isArray(d.events))throw Error('Schedule unavailable');
  if(!signal?.aborted)observeSeason(d);
  for(const g of d.events.map(readGame))if(g&&g.day>=start&&g.day<=end)games.set(g.id,g);
 },signal);
 return [...games.values()];
}
async function rateList(games,signal,onProgress){
 const queue=games.filter(g=>g.state==='live'||(g.state==='final'&&!ratings.has(g.id)));
 let done=games.length-queue.length;
 onProgress(done,games.length);
 await eachLimit(queue,3,async g=>{
  try{
   const summary=await fetchJSON(SITE+'summary?event='+g.id,signal);
   if(signal.aborted)return;
   const observed=readGame(summary.header);
   if(observed?.id===g.id){
    // Keep stage/season from the schedule when a summary omits them.
    Object.assign(g,observed,{stage:g.stage||observed.stage,season:g.season});
    const r=rateBaseball(summary);
    if(g.state==='final'&&r!==null)ratings.set(g.id,r);
    else if(g.state==='live'){if(r===null)liveRatings.delete(g.id);else liveRatings.set(g.id,r);}
   }
  }catch{}
  if(!signal.aborted)onProgress(++done,games.length);
 },signal);
 if(!signal.aborted)writeStorage(ratingKey,Object.fromEntries([...ratings].slice(-4000)));
}
async function loadGames(day=$('mlbDate').value,{latest=false}={}){
 if(!validDay(day))return;
 const signal=request(),id='mlbGamesStatus';
 $('mlbGameList').setAttribute('aria-busy','true');error(id,latest?'Looking for recent games…':'Loading games…');
 if(latest||lists.Games.some(g=>g.day!==day)){lists.Games=[];renderList('Games');}
 try{
  let games=[];
  if(latest){
   for(let offset=0;offset<30&&!signal.aborted;offset+=5){
    games=await scoreboard(shiftDay(day,-offset-4),shiftDay(day,-offset),signal);
    if(games.some(g=>g.state==='final'||g.state==='live'))break;
   }
  }else games=await scoreboard(day,day,signal);
  if(signal.aborted)return;
  if(latest){
   day=games.filter(g=>g.state==='final'||g.state==='live').sort(numeric).at(-1)?.day;
   if(!day){error(id,'No played games found in the past 30 days. Try an earlier date.');return;}
   $('mlbDate').value=day;games=games.filter(g=>g.day===day);
  }
  for(const g of games)if(g.state==='live')details.delete(g.id);
  lists.Games=games;renderList('Games');
  const eligible=games.filter(g=>(g.state==='final'||g.state==='live')&&(!prefs.favoritesOnly||favorite(g)));
  if(!games.length){error(id,'No games on this date.');return;}
  await rateList(eligible,signal,(done,total)=>{
   renderList('Games');
   error(id,done<total?`Rating games · ${done} of ${total}`:prefs.favoritesOnly&&!games.some(favorite)?'No favorite teams play on this date.':'');
  });
 }catch{if(!signal.aborted)error(id,'Could not load games. Try refreshing.');}
 finally{if(!signal.aborted)$('mlbGameList').removeAttribute('aria-busy');}
}
async function loadBest(){
 const end=$('mlbBestDate').value,range=$('mlbBestRange').value==='30'?30:7;
 if(!validDay(end)||end>gameDay()){error('mlbBestStatus','Choose today or an earlier date.');return;}
 const signal=request(),id='mlbBestStatus';
 lists.Best=[];renderList('Best');error(id,'Loading games for this range…');
 try{
  const games=(await scoreboard(shiftDay(end,1-range),end,signal)).filter(g=>g.state==='final'&&[2,3].includes(g.stage));
  if(signal.aborted)return;
  lists.Best=games;
  if(!games.length){error(id,'No completed games in this range. Try an earlier ending date.');return;}
  await rateList(games,signal,(done,total)=>{
   renderList('Best');const count=games.filter(g=>rating(g)!=null).length;
   error(id,done<total?`Checking ratings · ${done} of ${total} games`:`${count} of ${total} games rated${count<total?' · Some games lacked rating data':''}.`);
  });
 }catch{if(!signal.aborted)error(id,'Could not load this range. Try again.');}
}
function renderTeams(){
 const ids=prefs.favorites;
 const ordered=[...CLUBS].sort((a,b)=>(ids.indexOf(a[0])+1||999)-(ids.indexOf(b[0])+1||999)||a[1].localeCompare(b[1]));
 $('mlbTeam').innerHTML=ordered.map(([id,name])=>`<option value="${id}">${ids.includes(id)?'★ ':''}${name}</option>`).join('');
 $('mlbTeam').value=prefs.scheduleTeam;
 $('mlbTeamFavorite').textContent=ids.includes(prefs.scheduleTeam)?'★ Remove favorite':'☆ Add favorite';
 $('mlbTeamFavorite').setAttribute('aria-pressed',String(ids.includes(prefs.scheduleTeam)));
 $('mlbFavoriteClubs').innerHTML=ordered.map(([id,name])=>`<label class="baseball-check"><input type="checkbox" data-mlb-favorite="${id}" ${ids.includes(id)?'checked':''}> ${name}</label>`).join('');
}
function setFavorite(id,on){
 if(!CLUBS.some(c=>c[0]===id))return;
 prefs.favorites=on?[...new Set([...prefs.favorites,id])]:prefs.favorites.filter(x=>x!==id);
 save();renderTeams();
}
async function loadSchedule(){
 const signal=request(),year=Number($('mlbSeason').value),id=prefs.scheduleTeam;
 lists.Schedule=[];renderList('Schedule');$('mlbJump').disabled=true;error('mlbScheduleStatus','Loading schedule…');
 try{
  const results=await Promise.allSettled([2,3].map(type=>fetchJSON(SITE+`teams/${id}/schedule?season=${year}&seasontype=${type}`,signal)));
  if(signal.aborted)return;
  const valid=results.filter(r=>r.status==='fulfilled'&&Array.isArray(r.value.events)&&(Number(r.value.requestedSeason?.year??r.value.season?.year)===year||(!r.value.requestedSeason&&!r.value.events.length)));
  if(!valid.length)throw Error('Schedule unavailable');
  lists.Schedule=[...new Map(valid.flatMap(r=>r.value.events.map(readGame)).filter(g=>g&&g.season===year&&[2,3].includes(g.stage)&&g.teams.some(t=>t.id===id)).map(g=>[g.id,g])).values()].sort(numeric);
  renderList('Schedule');$('mlbJump').disabled=!nextGame();
  error('mlbScheduleStatus',lists.Schedule.length?`${lists.Schedule.length} games${valid.length<2?' · Some schedule data was unavailable':''}`:'No games available for this team and season.');
 }catch{if(!signal.aborted)error('mlbScheduleStatus','Could not load this schedule. Try another season or team.');}
}
const nextGame=()=>lists.Schedule.find(g=>g.state==='live'||(g.state==='upcoming'&&new Date(g.date)>new Date()));
function table(headers,rows){
 return `<div class="stats-table-scroll" tabindex="0"><table class="stats-table"><thead><tr>${headers.map((x,i)=>`<th scope="col"${i?'':' class="stat-name"'}>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row" class="stat-name">${esc(row[0])}</th>${row.slice(1).map(v=>`<td>${esc(v??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
async function loadStandings(){
 standingsRevealed=true;syncRefresh();
 const signal=request(),year=Number($('mlbStandingsYear').value),el=$('mlbStandingsList');
 el.innerHTML='';error('mlbStandingsStatus','Loading standings…');
 try{
  const d=await fetchJSON(TABLES+`?season=${year}&type=0&level=3`,signal);
  if(signal.aborted)return;
  if(Number(d.season?.year)!==year)throw Error('Wrong season');
  const names=['wins','losses','winPercent','gamesBehind','Home','Road','Last Ten Games','streak','clincher'];
  const groups=(d.children||[]).flatMap(l=>l.children||[]).filter(g=>g.standings?.entries?.length);
  if(!groups.length)throw Error('Standings unavailable');
  el.innerHTML=groups.map(g=>{
   const rows=g.standings.entries.map(e=>{
    const stats=Object.fromEntries((e.stats||[]).map(s=>[s.name,s.displayValue]));
    return [`${prefs.favorites.includes(String(e.team?.id))?'★ ':''}${e.team?.displayName||e.team?.name||'Team'}`,...names.map(n=>stats[n]||'—')];
   });
   rows.sort((a,b)=>Number(b[3])-Number(a[3])||Number(b[1])-Number(a[1]));
   return `<section class="baseball-standings"><h3>${esc(g.name)}</h3>${table(['Team','W','L','PCT','GB','Home','Away','L10','Streak','Clinch'],rows)}</section>`;
  }).join('');
  error('mlbStandingsStatus','Current standings for the selected season. They may include games beyond your reveal date.');
 }catch{if(!signal.aborted)error('mlbStandingsStatus','Could not load standings. Try again.');}
}
function boxHTML(g,summary){
 if(!revealed(g))return '';
 const lines=Math.max(...g.teams.map(t=>t.innings.length));
 const inningTable=lines?table(['Team',...Array.from({length:lines},(_,i)=>i+1),'R','H','E'],g.teams.map(t=>[t.abbr,...Array.from({length:lines},(_,i)=>t.innings[i]),t.score,t.hits,t.errors])):'';
 const players=(summary?.boxscore?.players||[]).flatMap(t=>(t.statistics||[]).filter(s=>['batting','pitching'].includes(s.type)&&s.athletes?.length).map(s=>{
  const labels=s.labels||[];
  return `<h3>${esc(t.team?.shortDisplayName||t.team?.name||'Team')} · ${s.type==='batting'?'Batting':'Pitching'}</h3>${table(['Player',...labels],s.athletes.map(a=>[a.athlete?.displayName||'—',...labels.map((_,i)=>a.stats?.[i])]))}`;
 })).join('');
 return `<p class="card-score">${g.teams.map(t=>`${esc(t.abbr)} ${scoreNumber(t.score)?esc(t.score):'—'}`).join(' · ')}</p><p class="small">${esc(g.detail|| (g.state==='final'?'Final':'In progress'))}</p>${inningTable}${players}`;
}
function renderDialog(){
 const g=latestDetails(selected),started=g.state==='live'||g.state==='final',shown=revealed(g);
 $('mlbDialogTitle').textContent=g.teams.map(t=>t.name).join(' at ');
 $('mlbDialogActions').innerHTML=started?`${shown?'':'<button class="button primary" id="mlbReveal">Reveal score &amp; stats</button>'}${g.state==='final'?`<label class="baseball-check"><input id="mlbWatched" type="checkbox" ${prefs.watched[g.id]?'checked':''}> Watched</label>`:''}`:'';
 $('mlbBox').innerHTML=shown?boxHTML(g,details.get(g.id)?.summary):'';
 $('mlbDialogRating').textContent=rating(g)!=null?rating(g).toFixed(1)+' /10'+(g.state==='live'?' · Live':''):'';
 error('mlbDialogStatus',started?(shown?'':'Scores and stats are hidden.'):'Scores will be available once the game starts.');
 const reveal=$('mlbReveal');
 if(reveal)reveal.onclick=()=>{prefs.revealed[g.id]=true;save();renderList(tab);showDetails();};
 const watched=$('mlbWatched');
 if(watched)watched.onchange=()=>{prefs.watched[g.id]=watched.checked;if(watched.checked)prefs.revealed[g.id]=true;save();renderList(tab);showDetails();};
}
async function showDetails({force=false}={}){
 if(!selected)return;
 boxRequest?.abort();
 renderDialog();
 const game=latestDetails(selected),id=game.id,shown=revealed(game);
 if((!shown&&((game.state!=='final'&&game.state!=='live')||rating(game)!=null))||(!force&&game.state==='final'&&details.get(id)?.game.state==='final'))return;
 boxRequest=new AbortController();const {signal}=boxRequest;
 error('mlbDialogStatus',shown?'Loading box score…':'Checking spoiler-free rating…');
 try{
  const summary=await fetchJSON(SITE+'summary?event='+id,signal),g=readGame(summary.header);
  if(signal.aborted||selected?.id!==id)return;
  if(g?.id!==id)throw Error('Game details unavailable');
  details.delete(id);details.set(id,{game:g,summary});
  if(details.size>12)details.delete(details.keys().next().value);
  const r=rateBaseball(summary);
  if(r!==null&&g.state==='final'){ratings.set(id,r);writeStorage(ratingKey,Object.fromEntries([...ratings].slice(-4000)));}
  else if(r!==null&&g.state==='live')liveRatings.set(id,r);
  renderList(tab);renderDialog();
 }catch{if(!signal.aborted&&selected?.id===id)error('mlbDialogStatus',shown?'Box score unavailable. Close and reopen to retry.':'Scores and stats are hidden.');}
}
function syncCutoff(){
 const year=$('mlbCutoffYear').value,today=gameDay(),cutoff=prefs.cutoffs[year];
 $('mlbCutoff').min=cutoff||year+'-01-01';$('mlbCutoff').max=year===String(nowYear())?today:year+'-12-31';
 $('mlbCutoff').value=cutoff||'';
 error('mlbCutoffStatus',Number(year)<nowYear()||Number(year)===finishedYear?'Scores for this completed season are revealed.':cutoff?`Scores revealed through ${cutoff}.`:'No date selected for this season.');
}
function syncRefresh(){
 const button=$('mlbRefresh'),label='Refresh '+({Games:'MLB games',Best:'best games',Schedule:'MLB schedule',Standings:'MLB standings'}[tab]||'');
 button.classList.toggle('hidden',tab==='Settings'||(tab==='Standings'&&!standingsRevealed));
 button.setAttribute('aria-label',label);button.title=label;
}
function setTab(next){
 viewRequest?.abort();tab=next;
 for(const button of document.querySelectorAll('[data-mlb-tab]')){
  const active=button.dataset.mlbTab===next;button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  $('mlb'+button.dataset.mlbTab).classList.toggle('hidden',!active);
 }
 if(tab==='Games')loadGames();
 if(tab==='Schedule')loadSchedule();
 if(tab==='Standings'){standingsRevealed=false;$('mlbStandingsList').innerHTML='';error('mlbStandingsStatus','Standings include results beyond your reveal date.');}
 if(tab==='Settings')syncCutoff();
 syncRefresh();
}

const today=gameDay();
$('mlbDate').value=today;$('mlbBestDate').value=today;$('mlbBestDate').max=today;
for(const id of ['mlbSeason','mlbStandingsYear','mlbCutoffYear']){
 $(id).innerHTML=Array.from({length:nowYear()-2001},(_,i)=>`<option value="${nowYear()-i}">${nowYear()-i}</option>`).join('');
}
$('mlbFavoritesOnly').checked=!!prefs.favoritesOnly;
$('mlbFavoritesOnly').onchange=()=>{prefs.favoritesOnly=$('mlbFavoritesOnly').checked;save();loadGames();};
$('mlbDate').onchange=()=>loadGames();
$('mlbPrev').onclick=()=>{$('mlbDate').value=shiftDay($('mlbDate').value||gameDay(),-1);loadGames();};
$('mlbNext').onclick=()=>{$('mlbDate').value=shiftDay($('mlbDate').value||gameDay(),1);loadGames();};
$('mlbToday').onclick=()=>{$('mlbDate').value=gameDay();loadGames();};
$('mlbLatest').onclick=()=>loadGames(gameDay(),{latest:true});
$('mlbRefresh').onclick=()=>({Games:loadGames,Best:loadBest,Schedule:loadSchedule,Standings:standingsRevealed?loadStandings:null}[tab]?.());
$('mlbRank').onclick=()=>loadBest();
$('mlbBestFavorites').onchange=()=>renderList('Best');
$('mlbTeam').onchange=()=>{prefs.scheduleTeam=$('mlbTeam').value;save();renderTeams();loadSchedule();};
$('mlbTeamFavorite').onclick=()=>setFavorite(prefs.scheduleTeam,!prefs.favorites.includes(prefs.scheduleTeam));
$('mlbSeason').onchange=()=>loadSchedule();
$('mlbJump').onclick=()=>{const g=nextGame();if(g)document.querySelector(`#mlbScheduleList [data-mlb-game="${g.id}"]`)?.scrollIntoView({block:'center'});};
$('mlbShowStandings').onclick=()=>loadStandings();
$('mlbStandingsYear').onchange=()=>{standingsRevealed=false;syncRefresh();viewRequest?.abort();$('mlbStandingsList').innerHTML='';error('mlbStandingsStatus','Standings include results beyond your reveal date.');};
$('mlbCutoffYear').onchange=syncCutoff;
$('mlbSaveCutoff').onclick=()=>{
 const year=$('mlbCutoffYear').value,previous=prefs.cutoffs[year],day=$('mlbCutoff').value;
 const accepted=advanceCutoff(previous,day,year,gameDay());
 if(!accepted||accepted!==day){syncCutoff();error('mlbCutoffStatus','Choose a date in this season no earlier than your saved date and no later than today.');return;}
 prefs.cutoffs[year]=accepted;
 if(save())syncCutoff();else {prefs.cutoffs[year]=previous;error('mlbCutoffStatus','The browser could not save your reveal date.');}
};
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-mlb-tab]');if(nav){setTab(nav.dataset.mlbTab);return;}
 const button=e.target.closest('[data-mlb-game]');if(!button)return;
 selected=lists[tab]?.find(g=>g.id===button.dataset.mlbGame);
 if(selected){$('mlbDialog').showModal();showDetails();}
});
document.addEventListener('change',e=>{const id=e.target.dataset?.mlbFavorite;if(id)setFavorite(id,e.target.checked);});
$('mlbDialog').addEventListener('close',()=>{boxRequest?.abort();selected=null;$('mlbBox').innerHTML='';});
setInterval(()=>{
 if(document.hidden||nflPrefs.autoRefresh===false)return;
 if(selected){if(latestDetails(selected).state==='live')showDetails({force:true});}
 else if(tab==='Games'&&$('mlbDate').value===gameDay())loadGames();
},60000);
renderTeams();syncCutoff();loadGames();
fetchJSON(SITE+'scoreboard').then(observeSeason).catch(()=>{});
navigator.serviceWorker?.register('./sw.js').catch(()=>{});
