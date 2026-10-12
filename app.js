import {initSchedule} from './schedule.js?v=12';
import {initSeasonStats} from './season-stats.js?v=7';
import {rateGame,RATING_VERSION} from './rating.js';
import {recordHTML,extractStats,scoreHTML,overviewHTML,teamStatsHTML,playerSectionHTML} from './stats.js?v=7';
const $=id=>document.getElementById(id), API='https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
const STORAGE='football-user-v1', CACHE='football-feed-v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}};
let user=read(STORAGE,{preferences:{showBreakdown:false,autoRefresh:true,theme:'dark'},watched:{},tab:'games'});
user.preferences={showBreakdown:false,autoRefresh:true,theme:'dark',...user.preferences};user.watched=user.watched||{};
user.revealed=Object.fromEntries(Object.entries(user.revealed||{}).filter(([id,value])=>/^\d+$/.test(id)&&value===true));
for(const id of Object.keys(user.watched))user.revealed[id]=true;
let cache=read(CACHE,{weeks:{},ratings:{}});cache.weeks=cache.weeks||{};cache.ratings=cache.ratings||{};cache.seasons=cache.seasons||{};cache.cardStats=cache.cardStats||{};
let seasonDashboard=null,scheduleDashboard=null;
let games=[],scope=0,busy=false,controller=null,selectedGame=null,current=null,installPrompt=null;
let bestController=null,bestGeneration=0,bestBusy=false,bestRunningYear=null;
function eligibleBest(g){return Number(g.seasonType)===2||Number(g.seasonType)===3;}
function seasonGames(){return (cache.seasons[Number($('bestSeason').value||$('season').value)]?.games||[]).filter(eligibleBest);}
function stageLabel(g){if(g.seasonType===3)return ['Wild Card','Divisional','Conference','Pro Bowl week','Super Bowl'][g.week-1]||'Playoffs';return `${g.seasonType===1?'Preseason · ':''}Week ${g.week}`;}
function renderBest(){
 const all=seasonGames(),complete=all.filter(g=>g.state==='post'&&eligibleBest(g));
 const ranked=complete.filter(g=>ratingFor(g)&&!ratingFor(g).provisional).sort((a,b)=>ratingFor(b).overall-ratingFor(a).overall||new Date(a.date)-new Date(b.date));
 $('bestList').innerHTML=ranked.length?ranked.map((g,i)=>`<div class="ranked-card"><div class="rank-line"><span class="rank-number">#${i+1}</span><span>${escape(stageLabel(g))}</span></div>${gameCard(g)}</div>`).join(''):`<div class="empty"><h3>${bestBusy?'Finding the best games…':'No rated games yet'}</h3><p>${bestBusy?'Ratings will appear as the season is analyzed.':'Refresh to analyze this season. Games need enough play-by-play data to be rated.'}</p></div>`;
}
function bestNotice(message){$('bestNotice').textContent=message;$('bestNotice').classList.toggle('hidden',!message);}
async function loadBest({forceSchedule=false}={}){
 const year=Number($('bestSeason').value||$('season').value);if(!Number.isInteger(year)||year<2002||year>seasonYear())return;
 if(bestBusy&&bestRunningYear===year)return;
 bestController?.abort();const generation=++bestGeneration;const requestController=new AbortController();bestController=requestController;const signal=requestController.signal;
 bestBusy=true;bestRunningYear=year;$('bestRefresh').disabled=true;$('bestPause').textContent='Pause';$('bestPause').classList.remove('hidden');$('bestProgress').classList.remove('hidden');bestNotice('');renderBest();
 const ttl=year===current?.season?300000:86400000;
 try{
  const old=cache.seasons[year];let all=(old?.games||[]).filter(eligibleBest);let missingWeeks=0;
  if(forceSchedule||!old?.scheduleComplete||old?.scheduleVersion!==2||Date.now()-old.time>ttl){
   const map=new Map(all.map(g=>[g.id,g]));
   const requests=[...Array.from({length:18},(_,i)=>({season:year,type:2,week:i+1})),...Array.from({length:5},(_,i)=>({season:year,type:3,week:i+1}))];
   let done=0;$('bestProgress').max=requests.length;$('bestProgress').value=0;
   async function scheduleWorker(){while(requests.length){if(signal.aborted)throw new Error('Paused');const s=requests.shift();try{
    const key=keyFor(s),saved=cache.weeks[key];let items;
    if(!forceSchedule&&saved&&Date.now()-saved.time<ttl)items=saved.games;
    else{const response=await fetchJSON(`scoreboard?dates=${year}&seasontype=${s.type}&week=${s.week}`,AbortSignal.any([signal,AbortSignal.timeout(15000)]));if(!Array.isArray(response.events))throw new Error('Missing schedule');items=response.events.map(e=>safeEvent(e,s)).filter(g=>g&&g.season===year);if(signal.aborted||generation!==bestGeneration)return;cache.weeks[key]={games:items,time:Date.now()};}
    for(const g of items)if(g.season===year&&eligibleBest({...g,seasonType:g.seasonType||s.type}))map.set(g.id,{...g,seasonType:g.seasonType||s.type,week:g.week||s.week});
   }catch(e){if(signal.aborted)throw e;missingWeeks++;}finally{done++;if(generation===bestGeneration){$('bestStatus').textContent=`Loading ${year} season · ${done} of 23 weeks`;$('bestProgress').value=done;}}}}
   await Promise.all([scheduleWorker(),scheduleWorker(),scheduleWorker()]);if(signal.aborted||generation!==bestGeneration)return;
   all=[...map.values()];cache.seasons[year]={games:all,time:Date.now(),scheduleComplete:missingWeeks===0,scheduleVersion:2};saveCache();renderBest();
  }
  const finished=all.filter(g=>g.state==='post'&&eligibleBest(g));
  const queue=finished.filter(g=>{const record=cache.ratings[g.id];return (isRevealed(g.id)&&!cardData(g.id))||!record||record.rating?.version!==RATING_VERSION||record.rating?.provisional||(!record.rating&&Date.now()-record.time>900000);});
  const total=finished.length;let attempted=total-queue.length,failures=0,sinceSave=0;
  $('bestProgress').max=Math.max(1,total);$('bestProgress').value=attempted;
  const progress=()=>{$('bestStatus').textContent=`Analyzing ${year} season · ${attempted} of ${total} completed games`;$('bestProgress').value=attempted;};progress();
  async function ratingWorker(){while(queue.length){if(signal.aborted)throw new Error('Paused');const g=queue.shift();try{const summary=await fetchJSON(`summary?event=${g.id}`,AbortSignal.any([signal,AbortSignal.timeout(15000)]));if(signal.aborted||generation!==bestGeneration)return;const rating=rateGame(summary);if(isRevealed(g.id))cacheStats(g.id,summary);cache.ratings[g.id]={rating,time:Date.now()};if(!rating)failures++;}catch(e){if(signal.aborted)throw e;failures++;}finally{if(generation===bestGeneration){attempted++;progress();renderBest();if(++sinceSave>=10){saveCache();sinceSave=0;}}}}}
  await Promise.all([ratingWorker(),ratingWorker(),ratingWorker()]);if(signal.aborted||generation!==bestGeneration)return;
  saveCache();const rated=finished.filter(g=>ratingFor(g)&&!ratingFor(g).provisional).length;
  $('bestStatus').textContent=`${year} season · ${rated} of ${total} completed games rated`;$('bestProgress').classList.add('hidden');$('bestPause').classList.add('hidden');
  if(missingWeeks)bestNotice('Some weeks could not be loaded. This ranking is incomplete; refresh to retry.');
  else if(rated<total)bestNotice('Games with unavailable ratings are left out. Refresh to retry missing data.');
 }catch(e){if(generation!==bestGeneration)return;saveCache();$('bestStatus').textContent=signal.aborted?'Analysis paused. Your progress is saved.':'Could not finish this season. Your progress is saved.';$('bestPause').textContent='Continue';$('bestPause').classList.remove('hidden');if(!signal.aborted)bestNotice('Check your connection and continue to retry.');}
 finally{if(generation===bestGeneration){bestBusy=false;$('bestRefresh').disabled=false;renderBest();}}
}
$('bestSeason').onchange=()=>{bestController?.abort();bestGeneration++;bestBusy=false;const year=Number($('bestSeason').value);$('season').value=String(year);user.selection=selection();saveUser();games=cache.weeks[keyFor(selection())]?.games||[];render();loadBest();};
$('bestRefresh').onclick=()=>{for(const g of seasonGames())if(!ratingFor(g))delete cache.ratings[g.id];loadBest({forceSchedule:true});};
$('bestPause').onclick=()=>{if(bestBusy)bestController?.abort();else loadBest();};

let statsController=null,statsGeneration=0,statsTab='overview',statsCategory='offense';
const statsCache=new Map();
function isRevealed(id){return user.revealed[id]===true||!!user.watched[id];}
function cacheCardStats(id,data){if(!data)return;cache.cardStats[id]={teams:data.teams.map(({id,abbr,side,score,record})=>({id,abbr,side,score,record})),state:data.state,updatedAt:data.updatedAt};}
function cardData(id){return cache.cardStats[id]||statsCache.get(id);}
function cacheStats(id,summary){const data=extractStats(summary);if(data){statsCache.set(id,data);cacheCardStats(id,data);}return data;}
function teamRecordHTML(g,t){return isRevealed(g.id)?recordHTML(cardData(g.id)?.teams.find(team=>team.id===t.id)?.record):'';}
function updateDialogMatchup(){if(!selectedGame)return;const g=selectedGame,a=g.teams.find(t=>t.side==='away')||g.teams[0],h=g.teams.find(t=>t.side==='home')||g.teams[1];$('dialogMatchup').innerHTML=escape(a.name)+teamRecordHTML(g,a)+' at '+escape(h.name)+teamRecordHTML(g,h);}
function cardScoreHTML(g){
 if(!isRevealed(g.id))return '';const data=cardData(g.id),away=data?.teams.find(t=>t.side==='away')||data?.teams[0],home=data?.teams.find(t=>t.side==='home')||data?.teams[1];
 const state=data?.state||g.state,status=state==='post'?'Final':state==='in'?'In progress':'Not started';
 const score=state!=='pre'&&away&&home&&/^\d+$/.test(away.score)&&/^\d+$/.test(home.score)?`${escape(away.abbr)} ${escape(away.score)} · ${escape(home.abbr)} ${escape(home.score)}`:state==='pre'?'Not started':'Score unavailable';
 return `<span class="card-result"><span class="card-score">${score}</span><small class="card-status">${status}</small></span>`;
}
function leadingTeam(g){if(!isRevealed(g.id))return null;const data=cardData(g.id);if(!data||!['in','post'].includes(data.state)||data.teams.length!==2)return null;const [a,b]=data.teams;if(!/^\d+$/.test(a.score)||!/^\d+$/.test(b.score)||Number(a.score)===Number(b.score))return null;return Number(a.score)>Number(b.score)?a.id:b.id;}
function renderStats(){
 if(!selectedGame)return;updateDialogMatchup();const revealed=isRevealed(selectedGame.id);
 $('revealStats').classList.toggle('hidden',revealed);$('revealStats').setAttribute('aria-expanded',String(revealed));
 $('spoilerNote').classList.toggle('hidden',revealed);$('statsPanel').classList.toggle('hidden',!revealed);$('gameDialog').classList.toggle('stats-open',revealed);
 if(!revealed){$('statsScoreboard').innerHTML='';$('statsContent').innerHTML='';$('statsMessage').textContent='';$('statsTabs').classList.add('hidden');$('playerCategoryRow').classList.add('hidden');$('statsUpdated').textContent='';return;}
 const data=statsCache.get(selectedGame.id);if(!data){$('statsScoreboard').innerHTML='';$('statsContent').innerHTML='';$('statsTabs').classList.add('hidden');$('playerCategoryRow').classList.add('hidden');return;}
 $('statsScoreboard').innerHTML=scoreHTML(data);$('statsTabs').classList.remove('hidden');
 for(const b of document.querySelectorAll('[data-stats-tab]')){const active=b.dataset.statsTab===statsTab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 for(const b of document.querySelectorAll('[data-player-category]')){const active=b.dataset.playerCategory===statsCategory;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 $('playerCategoryRow').classList.toggle('hidden',statsTab!=='players');
 $('statsContent').innerHTML=statsTab==='teams'?teamStatsHTML(data):statsTab==='players'?playerSectionHTML(data,statsCategory):overviewHTML(data);
 $('statsUpdated').textContent='Updated '+timeFormat.format(new Date(data.updatedAt));
}
async function loadStats({force=false}={}){
 if(!selectedGame||!$('gameDialog').open||!isRevealed(selectedGame.id))return;
 const g=selectedGame,cached=statsCache.get(g.id);statsController?.abort();const generation=++statsGeneration;
 if(cached&&!force&&(cached.state==='post'||Date.now()-cached.updatedAt<30000)){$('statsMessage').textContent='';renderStats();return;}
 const requestController=new AbortController();statsController=requestController;$('statsMessage').textContent=cached?'Updating stats…':'Loading stats…';renderStats();
 try{const summary=await fetchJSON(`summary?event=${g.id}`,AbortSignal.any([requestController.signal,AbortSignal.timeout(15000)]));if(generation!==statsGeneration||selectedGame?.id!==g.id||!isRevealed(g.id)||!$('gameDialog').open)return;
  const data=cacheStats(g.id,summary);if(!data)throw new Error('Stats unavailable');saveCache();$('statsMessage').textContent='';renderStats();render();
 }catch(e){if(requestController.signal.aborted||generation!==statsGeneration||selectedGame?.id!==g.id||!isRevealed(g.id))return;$('statsMessage').textContent=cached?'Could not update stats. Showing the last loaded data.':'Stats are unavailable right now. Try Refresh Stats.';renderStats();}
}
function revealStats(){if(!selectedGame||isRevealed(selectedGame.id))return;user.revealed[selectedGame.id]=true;saveUser();statsController?.abort();statsGeneration++;renderStats();render();loadStats();}
$('revealStats').onclick=revealStats;
$('refreshStats').onclick=()=>loadStats({force:true});
document.addEventListener('click',e=>{const b=e.target.closest('[data-player-category]');if(b&&['offense','defense','special'].includes(b.dataset.playerCategory)){statsCategory=b.dataset.playerCategory;renderStats();}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-stats-tab]');if(b&&['overview','players','teams'].includes(b.dataset.statsTab)){statsTab=b.dataset.statsTab;renderStats();}});
let dialogScrollY=0;
function lockGameScroll(){dialogScrollY=window.scrollY;document.body.classList.add('game-modal-open');document.body.style.top=-dialogScrollY+'px';}
function unlockGameScroll(){document.body.classList.remove('game-modal-open');document.body.style.top='';window.scrollTo(0,dialogScrollY);}
$('gameDialog').addEventListener('close',()=>{unlockGameScroll();statsController?.abort();statsGeneration++;$('statsScoreboard').innerHTML='';$('statsContent').innerHTML='';});
setInterval(()=>{if(!document.hidden&&user.preferences.autoRefresh&&selectedGame&&$('gameDialog').open&&isRevealed(selectedGame.id)&&statsCache.get(selectedGame.id)?.state!=='post')loadStats({force:true});},30000);

const saveUser=()=>{try{localStorage.setItem(STORAGE,JSON.stringify(user))}catch{$('backupNotice').textContent='This browser could not save your changes. Export a backup to keep them.'}};
function saveCache(){try{const entries=Object.entries(cache.weeks).sort((a,b)=>b[1].time-a[1].time);cache.weeks=Object.fromEntries(entries.slice(0,96));const ratings=Object.entries(cache.ratings).sort((a,b)=>b[1].time-a[1].time);cache.ratings=Object.fromEntries(ratings.slice(0,1800));cache.seasons=Object.fromEntries(Object.entries(cache.seasons).sort((a,b)=>b[1].time-a[1].time).slice(0,3));cache.cardStats=Object.fromEntries(Object.entries(cache.cardStats).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,1800));cache.teamSchedules=Object.fromEntries(Object.entries(cache.teamSchedules||{}).sort((a,b)=>b[1].time-a[1].time).slice(0,48));localStorage.setItem(CACHE,JSON.stringify(cache))}catch{}}
function escape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const seasonYear=()=>{const d=new Date();return d.getMonth()<2?d.getFullYear()-1:d.getFullYear()};
const dateFormat=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',weekday:'short'});
const timeFormat=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
function dateLabel(date){const d=new Date(date);return Number.isNaN(d.getTime())?'Date unavailable':dateFormat.format(d)+' · '+timeFormat.format(d)}
function safeEvent(e,meta={}){
 const c=e.competitions?.[0];if(!c||!/^\d+$/.test(e.id))return null;
 const teams=(c.competitors||[]).map(t=>({id:String(t.team?.id||''),name:String(t.team?.name||t.team?.displayName||'Team'),city:String(t.team?.location||''),abbr:String(t.team?.abbreviation||''),side:t.homeAway}));
 if(teams.length!==2)return null;
 cacheCardStats(e.id,extractStats({header:{competitions:[c]}}));
 return {id:e.id,date:e.date,teams,state:c.status?.type?.state||e.status?.type?.state||'pre',season:Number(e.season?.year||meta.season||$('season').value),seasonType:Number(e.seasonType?.type||e.seasonType?.id||e.season?.type||meta.type||2),week:Number(e.week?.number||meta.week||1)};
}
async function fetchJSON(path,signal){const r=await fetch(API+path,{signal,cache:'no-store',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('Feed unavailable');return r.json()}
function ratingFor(g){return cache.ratings[g.id]?.rating||null}
function breakdown(r){return `<div class="breakdown">${['drama','action'].map(k=>`<div><div class="breakdown-label"><span>${k==='drama'?'Drama':'Action'}</span><span>${r[k].toFixed(1)}</span></div><div class="meter"><span style="width:${r[k]*10}%"></span></div></div>`).join('')}</div>`}
function ratingHTML(g){const r=ratingFor(g),result=cardScoreHTML(g);
 const rating=r?`<span class="rating-value">${r.overall.toFixed(1)}<small>/10</small>${r.provisional?'<span class="rating-caption">Provisional</span>':''}</span>`:`<span class="unrated">${g.state==='pre'?'Not started':'Rating unavailable'}</span>`;
 return `<div class="rating-row${result?' has-score':''}">${result}${rating}</div>${r&&user.preferences.showBreakdown?breakdown(r):''}`;
}
function teamBadge(t){const id=String(t.id);return /^\d{1,2}$/.test(id)?`<span class="team-badge team-logo"><img src="logos/${id}.png" alt="" width="46" height="46" loading="lazy"><span class="logo-fallback">${escape(t.abbr)}</span></span>`:`<span class="team-badge">${escape(t.abbr)}</span>`;}
function gameCard(g){const away=g.teams.find(t=>t.side==='away')||g.teams[0],home=g.teams.find(t=>t.side==='home')||g.teams[1],leader=leadingTeam(g);return `<button class="game-card" data-game="${escape(g.id)}" aria-label="${escape(away.name+' at '+home.name+', '+dateLabel(g.date))}"><span class="game-date"><span>${escape(dateLabel(g.date))}</span>${user.watched[g.id]?'<span class="watched-chip">✓ Watched</span>':''}</span><span class="game-teams"><span class="team${leader===away.id?' team-leading':''}">${teamBadge(away)}<span class="team-name">${escape(away.name)}${teamRecordHTML(g,away)}<small>${escape(away.city)}</small></span></span><span class="small">at</span><span class="team${leader===home.id?' team-leading':''}">${teamBadge(home)}<span class="team-name">${escape(home.name)}${teamRecordHTML(g,home)}<small>${escape(home.city)}</small></span></span></span>${ratingHTML(g)}</button>`}
function render(){let ordered=[...games];if($('sort').value==='rating')ordered.sort((a,b)=>(ratingFor(b)?.overall??-1)-(ratingFor(a)?.overall??-1)||new Date(a.date)-new Date(b.date));else ordered.sort((a,b)=>new Date(a.date)-new Date(b.date));
 $('listCount').textContent=`${games.length} game${games.length===1?'':'s'}`;
 $('gameList').innerHTML=ordered.length?ordered.map(gameCard).join(''):'<div class="empty"><h3>No games found</h3><p>Try another week or season.</p></div>';
 scheduleDashboard?.render();
 renderBest();
 if(selectedGame&&$('gameDialog').open)$('dialogRating').innerHTML=`<div class="dialog-rating">${ratingHTML(selectedGame)}</div>`;
}
function notify(text){$('notice').textContent=text;$('notice').classList.toggle('hidden',!text)}
function buildWeeks(){const type=Number($('seasonType').value),max=type===2?18:type===3?5:5,old=$('week').value;const post=['Wild Card','Divisional','Conference','Pro Bowl week','Super Bowl'];$('week').innerHTML=Array.from({length:max},(_,i)=>`<option value="${i+1}">${type===3?post[i]:'Week '+(i+1)}</option>`).join('');$('week').value=Number(old)<=max&&old?old:'1';updateArrows()}
function updateArrows(){$('previousWeek').disabled=Number($('week').value)<=1;$('nextWeek').disabled=Number($('week').value)>=$('week').options.length}
function selection(){return {season:Number($('season').value),type:Number($('seasonType').value),week:Number($('week').value)}}
function keyFor(s){return `${s.season}-${s.type}-${s.week}`}
async function loadWeek({force=false,newScope=false}={}){
 if(busy&&!newScope)return;
 if(newScope){controller?.abort();scope++;}
 const token=scope,s=selection(),key=keyFor(s);controller=new AbortController();const signal=controller.signal;busy=true;$('refresh').disabled=true;notify('');
 user.selection=s;saveUser();updateArrows();
 if(newScope){games=cache.weeks[key]?.games||[];if(games.length)render();else{$('gameList').innerHTML='<div class="game-card loading-card" aria-hidden="true"></div><div class="game-card loading-card" aria-hidden="true"></div>';$('listCount').textContent='Loading games…';}}
 const requestController=controller;let timeout=setTimeout(()=>requestController.abort(),45000);
 try{
  const response=await fetchJSON(`scoreboard?dates=${s.season}&seasontype=${s.type}&week=${s.week}`,signal);if(token!==scope)return;
  games=(response.events||[]).map(e=>safeEvent(e,s)).filter(Boolean);cache.weeks[key]={games,time:Date.now()};render();saveCache();
  const queue=games.filter(g=>g.state!=='pre'&&(force||!cache.ratings[g.id]?.rating||cache.ratings[g.id]?.rating?.provisional||cache.ratings[g.id].rating?.version!==RATING_VERSION||g.state==='in'||Date.now()-cache.ratings[g.id].time>86400000));
  let missing=0;
  async function worker(){while(queue.length){const g=queue.shift();try{const data=await fetchJSON(`summary?event=${g.id}`,signal);if(token!==scope)return;const rating=rateGame(data);if(isRevealed(g.id))cacheStats(g.id,data);cache.ratings[g.id]={rating,time:Date.now()};if(!rating)missing++;render();}catch(e){if(signal.aborted)throw e;missing++;}}}
  await Promise.all([worker(),worker(),worker()]);if(token!==scope)return;
  saveCache();$('updated').textContent='Updated '+timeFormat.format(new Date());
  if(missing)notify('Some ratings are unavailable. You can try refreshing again.');
 }catch(e){if(token!==scope)return;const stored=cache.weeks[key];games=stored?.games||games;render();notify(stored?'Could not reach the feed. Showing saved data; ratings may be out of date.':'Could not reach the game feed. Check your connection and try Refresh.');$('updated').textContent=stored?'Saved '+dateLabel(new Date(stored.time).toISOString()):'Not connected';}
 finally{clearTimeout(timeout);if(token===scope){busy=false;$('refresh').disabled=false;}}
}
async function initialize(){
 const year=seasonYear();$('season').innerHTML=Array.from({length:year-2001},(_,i)=>`<option value="${year-i}">${year-i}</option>`).join('');
 try{const s=await fetchJSON('scoreboard',AbortSignal.timeout(15000));current={season:Number(s.season?.year||year),type:Number(s.season?.type||2),week:Number(s.week?.number||1)};}catch{current={season:year,type:2,week:1};}
 $('bestSeason').innerHTML=$('season').innerHTML;const sel=user.selection||current;$('season').value=String(sel.season);if(!$('season').value)$('season').value=String(year);$('seasonType').value=String(sel.type);if(!$('seasonType').value)$('seasonType').value='2';buildWeeks();$('week').value=String(sel.week);if(!$('week').value)$('week').value='1';
 $('bestSeason').value=$('season').value;scheduleDashboard=initSchedule({fetchJSON,year:current.season,selection:user.schedule,onSelection:value=>{user.schedule=value;saveUser();},parseGame:safeEvent,gameCard,stageLabel,cache,onCache:saveCache});if(user.tab==='schedule')scheduleDashboard.activate();seasonDashboard=initSeasonStats({fetchJSON,year:current.season,week:current.type===2?current.week:18,selection:user.seasonStats,onSelection:value=>{user.seasonStats=value;saveUser();}});if(user.tab==='stats')seasonDashboard.activate();else await loadWeek({newScope:true});if(user.tab==='best')loadBest();
}
function setTab(tab){if(tab==='watched')tab='schedule';if(!['games','best','schedule','stats','settings'].includes(tab))tab='games';user.tab=tab;saveUser();for(const name of ['games','best','schedule','stats','settings'])$(name+'View').classList.toggle('hidden',tab!==name);for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');}if(tab==='stats')seasonDashboard?.activate();else seasonDashboard?.cancel();if(tab==='schedule'&&current)scheduleDashboard?.activate();else scheduleDashboard?.cancel();if(tab==='best'&&current){$('bestSeason').value=$('season').value;renderBest();loadBest();}if(tab==='games'&&current)loadWeek({newScope:true});}
function applyPreferences(){document.documentElement.dataset.theme=user.preferences.theme==='light'?'light':'dark';$('theme').value=user.preferences.theme==='light'?'light':'dark';$('showBreakdown').checked=!!user.preferences.showBreakdown;$('autoRefresh').checked=user.preferences.autoRefresh!==false;$('autoLabel').textContent=user.preferences.autoRefresh?'Auto-refresh on':'Auto-refresh off';document.querySelector('meta[name=theme-color]').content=user.preferences.theme==='light'?'#eef5f3':'#0a1e20';render();}
function openGame(id){const g=(user.tab==='schedule'?scheduleDashboard?.getGame(id):null)||games.find(x=>x.id===id)||seasonGames().find(x=>x.id===id)||user.watched[id]?.game;if(!g)return;statsController?.abort();statsGeneration++;statsTab='overview';statsCategory='offense';selectedGame=g;$('dialogDate').textContent=dateLabel(g.date);const a=g.teams.find(t=>t.side==='away')||g.teams[0],h=g.teams.find(t=>t.side==='home')||g.teams[1];$('dialogMatchup').textContent=a.name+' at '+h.name;$('watchedToggle').checked=!!user.watched[id];$('dialogRating').innerHTML=`<div class="dialog-rating">${ratingHTML(g)}</div>`;if(!$('gameDialog').open)lockGameScroll();$('gameDialog').showModal();$('statsMessage').textContent='';renderStats();if(isRevealed(id))loadStats();}
document.addEventListener('click',e=>{const card=e.target.closest('[data-game]');if(card)openGame(card.dataset.game);const tab=e.target.closest('[data-tab]');if(tab)setTab(tab.dataset.tab);});
$('closeDialog').onclick=()=>$('gameDialog').close();$('gameDialog').addEventListener('click',e=>{if(e.target===$('gameDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('watchedToggle').onchange=()=>{if(!selectedGame)return;const id=selectedGame.id;if($('watchedToggle').checked){user.watched[id]={game:selectedGame,watchedAt:new Date().toISOString()};user.revealed[id]=true;}else delete user.watched[id];statsController?.abort();statsGeneration++;saveUser();render();renderStats();if(isRevealed(id))loadStats();};
$('season').onchange=()=>{bestController?.abort();bestGeneration++;bestBusy=false;$('bestSeason').value=$('season').value;renderBest();loadWeek({newScope:true});};$('seasonType').onchange=()=>{buildWeeks();loadWeek({newScope:true})};$('week').onchange=()=>loadWeek({newScope:true});
$('previousWeek').onclick=()=>{if(Number($('week').value)>1){$('week').value=String(Number($('week').value)-1);loadWeek({newScope:true})}};
$('nextWeek').onclick=()=>{if(Number($('week').value)<$('week').options.length){$('week').value=String(Number($('week').value)+1);loadWeek({newScope:true})}};
$('currentWeek').onclick=()=>{if(!current)return;bestController?.abort();bestGeneration++;bestBusy=false;$('season').value=String(current.season);$('seasonType').value=String(current.type);buildWeeks();$('week').value=String(current.week);$('bestSeason').value=$('season').value;renderBest();loadWeek({newScope:true})};
$('refresh').onclick=()=>loadWeek({force:true});$('sort').onchange=()=>{user.sort=$('sort').value;saveUser();render();};
$('showBreakdown').onchange=()=>{user.preferences.showBreakdown=$('showBreakdown').checked;saveUser();applyPreferences()};$('autoRefresh').onchange=()=>{user.preferences.autoRefresh=$('autoRefresh').checked;saveUser();applyPreferences()};$('theme').onchange=()=>{user.preferences.theme=$('theme').value;saveUser();applyPreferences()};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else $('installHelp').classList.remove('hidden')};
$('exportData').onclick=()=>{const blob=new Blob([JSON.stringify({app:'football',version:1,exportedAt:new Date().toISOString(),data:user},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='football-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('backupNotice').textContent='Backup exported.';};
$('importData').onclick=()=>$('importFile').click();
$('importFile').onchange=async()=>{const f=$('importFile').files[0];if(!f)return;try{if(f.size>5*1024*1024)throw Error('Backup is too large.');const b=JSON.parse(await f.text());if(b.app!=='football'||b.version!==1||!b.data||typeof b.data.watched!=='object'||Array.isArray(b.data.watched)||!b.data.watched)throw Error('Choose a valid Football backup.');const restored={};for(const [id,item] of Object.entries(b.data.watched)){const g=item?.game;if(!/^\d+$/.test(id)||g?.id!==id||!Array.isArray(g.teams)||g.teams.length!==2||Number.isNaN(new Date(g.date).getTime()))throw Error('This backup contains invalid games.');restored[id]={game:{id,date:g.date,season:Number(g.season)||seasonYear(),state:['pre','in','post'].includes(g.state)?g.state:'post',seasonType:[1,2,3].includes(Number(g.seasonType))?Number(g.seasonType):2,week:Number.isInteger(g.week)&&g.week>=1&&g.week<=18?g.week:1,teams:g.teams.map(t=>({id:String(t.id).slice(0,96),name:String(t.name).slice(0,80),city:String(t.city).slice(0,80),abbr:String(t.abbr).slice(0,8),side:t.side==='away'?'away':'home'}))},watchedAt:typeof item.watchedAt==='string'?item.watchedAt:new Date().toISOString()};}const revealed={};for(const [id,value] of Object.entries(b.data.revealed||{})){if(/^\d+$/.test(id)&&value===true)revealed[id]=true;}for(const id of Object.keys(restored))revealed[id]=true;user.revealed={...user.revealed,...revealed};const p=b.data.preferences||{};user.watched={...user.watched,...restored};user.preferences={showBreakdown:p.showBreakdown===true,autoRefresh:p.autoRefresh!==false,theme:p.theme==='light'?'light':'dark'};saveUser();applyPreferences();$('backupNotice').textContent='Backup imported. Watched games and revealed stats merged with this device.';}catch(e){$('backupNotice').textContent=e.message||'Could not import this backup.'}finally{$('importFile').value=''}};
setInterval(()=>{if(!document.hidden&&user.preferences.autoRefresh&&user.tab==='games'&&current)loadWeek();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user.preferences.autoRefresh&&current&&user.tab==='games')loadWeek()});
setInterval(()=>{if(!document.hidden&&user.preferences.autoRefresh&&user.tab==='schedule'&&!$('gameDialog').open)scheduleDashboard?.activate();},60000);
setInterval(()=>{if(!document.hidden&&user.preferences.autoRefresh&&user.tab==='stats')seasonDashboard?.activate();},300000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
document.addEventListener('error',e=>{if(e.target?.matches?.('.team-logo img'))e.target.parentElement.classList.add('image-failed');},true);
$('sort').value=user.sort==='rating'?'rating':'date';applyPreferences();setTab(user.tab);initialize();
// Expose only the same spoiler-free game fields as the visible interface.
if(document.modelContext?.registerTool){try{const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});Promise.resolve(document.modelContext.registerTool({name:'get_spoiler_free_games',title:'Get spoiler-free game ratings',description:'Read the selected week’s NFL matchups and watch recommendations, without scores or game events.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('No input fields expected.');return games.map(g=>({id:g.id,date:g.date,teams:g.teams.map(t=>t.name),rating:ratingFor(g)?.overall??null,provisional:ratingFor(g)?.provisional??null}));}},{signal:lifecycle.signal})).catch(()=>{});}catch{}}

