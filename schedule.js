import {NFL_TEAMS} from './season-stats.js?v=16';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function scheduleEvents(response,year,team,type){
 const returned=Number(response.requestedSeason?.year||response.season?.year||year);
 if(returned!==year)throw Error('The feed returned a different season.');
 if(!Array.isArray(response.events))throw Error('The schedule is unavailable.');
 return response.events.filter(e=>Number(e.season?.year||returned)===year&&Number(e.seasonType?.type||e.seasonType?.id||type)===type&&e.competitions?.[0]?.competitors?.some(c=>String(c.team?.id||c.id)===team));
}
export function normalizeFavorites(value){return [...new Set((Array.isArray(value)?value:['25']).filter(id=>NFL_TEAMS.some(([team])=>team===id)))];}
export function orderedTeams(favorites){const ids=normalizeFavorites(favorites);return [...ids.map(id=>NFL_TEAMS.find(([team])=>team===id)),...NFL_TEAMS.filter(([id])=>!ids.includes(id))];}
export function nextScheduledGame(games,now=Date.now()){return [...games].sort((a,b)=>new Date(a.date)-new Date(b.date)).find(g=>g.state==='in'||(g.state==='pre'&&new Date(g.date).getTime()>=now));}
export function timelineRows(games,byeWeek){const rows=games.map(game=>({game,type:game.seasonType,week:game.week}));if(Number.isInteger(byeWeek)&&byeWeek>=1&&byeWeek<=18&&!games.some(g=>g.seasonType===2&&g.week===byeWeek))rows.push({bye:true,type:2,week:byeWeek});return rows.sort((a,b)=>a.type-b.type||a.week-b.week||new Date(a.game?.date||0)-new Date(b.game?.date||0));}
export function initSchedule({fetchJSON,year,selection,onSelection,parseGame,gameCard,stageLabel,cache,onCache,getFavorites,onFavoriteToggle}){
 const valid=selection||{};let team=NFL_TEAMS.some(([id])=>id===valid.team)?valid.team:'25',season=Number.isInteger(valid.year)&&valid.year>=2002&&valid.year<=year?valid.year:year,preseason=valid.preseason===true;
 let games=[],byeWeek=null,nextId=null,controller=null,generation=0,active=false;
 if(cache.teamScheduleVersion!==2){cache.teamSchedules={};cache.teamScheduleVersion=2;}cache.teamSchedules=cache.teamSchedules||{};
 $('scheduleSeason').innerHTML=Array.from({length:year-2001},(_,i)=>`<option value="${year-i}">${year-i}</option>`).join('');$('scheduleSeason').value=String(season);$('schedulePreseason').checked=preseason;
 function renderTeams(){const currentFocus=document.activeElement?.dataset?.scheduleTeam;$('scheduleTeams').innerHTML=orderedTeams(getFavorites()).map(([id,name])=>`<button type="button" role="tab" data-schedule-team="${id}" aria-label="${esc(name)}" aria-controls="scheduleList" aria-selected="${id===team}" tabindex="${id===team?0:-1}"><img src="logos/${id}.png" width="26" height="26" alt=""><span>${esc(name.split(' ').at(-1))}</span>${getFavorites().includes(id)?'<span class="team-favorite-star" aria-hidden="true">★</span>':''}</button>`).join('');if(currentFocus)$('scheduleTeams').querySelector(`[data-schedule-team="${currentFocus}"]`)?.focus();}
 const persist=()=>onSelection({team,year:season,preseason});
 function updateTeams(){const favorite=getFavorites().includes(team);$('scheduleFavorite').setAttribute('aria-pressed',String(favorite));$('scheduleFavorite').textContent=(favorite?'★':'☆')+' Favorite';const name=NFL_TEAMS.find(([id])=>id===team)[1];$('scheduleHeading').textContent=name+' schedule';$('scheduleList').setAttribute('aria-label',name+' season schedule');for(const b of $('scheduleTeams').querySelectorAll('[data-schedule-team]')){const selected=b.dataset.scheduleTeam===team;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}}
 function render(){
  const filtered=games.filter(g=>preseason||g.seasonType!==1),next=nextScheduledGame(filtered);nextId=next?.id||null;
  $('scheduleJump').disabled=!nextId;$('scheduleJump').textContent=nextId?'Jump to next game':'No upcoming games';
  const rows=timelineRows(filtered,byeWeek);
  $('scheduleList').innerHTML=rows.length?rows.map(row=>{if(row.bye)return `<div class="schedule-bye"><p class="schedule-week">Week ${row.week}</p><div class="bye-card"><strong>Bye week</strong><span>No game this week</span></div></div>`;const g=row.game,location=g.teams.find(t=>t.id===team)?.side==='home'?'Home':'Away';return `<div class="schedule-game${g.id===nextId?' schedule-next':''}" data-schedule-game="${esc(g.id)}"><div class="schedule-stop-heading"><p class="schedule-week">${esc(g.stageText||stageLabel(g))}</p><span class="schedule-location ${location.toLowerCase()}">${location}</span>${g.id===nextId?'<span class="schedule-next-label">Next game</span>':''}</div>${gameCard(g)}</div>`;}).join(''):'<div class="empty"><h3>No games available</h3><p>This team’s schedule has not been published for the selected season.</p></div>';
  $('scheduleCount').textContent=`${filtered.length} game${filtered.length===1?'':'s'} · ${season}`;
 }
 $('scheduleJump').onclick=()=>{const card=$('scheduleList').querySelector(`[data-schedule-game="${nextId}"] [data-game]`);if(!card)return;card.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});card.focus({preventScroll:true});};
 $('scheduleFavorite').onclick=()=>{onFavoriteToggle(team);renderTeams();updateTeams();};
 function cancel(){active=false;controller?.abort();generation++;$('scheduleRefresh').disabled=false;}
 async function load({force=false}={}){
  controller?.abort();const token=++generation,requestController=new AbortController();controller=requestController;const signal=requestController.signal,key=`${team}-${season}`,types=preseason?[1,2,3]:[2,3],selectedTeam=team,selectedSeason=season;
  updateTeams();$('scheduleRefresh').disabled=true;$('scheduleNotice').classList.add('hidden');
  games=types.flatMap(type=>cache.teamSchedules[`${key}-${type}`]?.games||[]);byeWeek=cache.teamSchedules[`${key}-2`]?.byeWeek||null;render();$('scheduleStatus').textContent=games.length?'Updating schedule…':'Loading schedule…';
  let failures=0;const ttl=season===year?60000:86400000;
  const results=await Promise.allSettled(types.map(async type=>{
   const saved=cache.teamSchedules[`${key}-${type}`];if(!force&&saved&&Date.now()-saved.time<ttl)return saved.games;
   const response=await fetchJSON(`teams/${selectedTeam}/schedule?season=${selectedSeason}&seasontype=${type}`,AbortSignal.any([signal,AbortSignal.timeout(20000)]));
   const events=scheduleEvents(response,selectedSeason,selectedTeam,type);if(token!==generation||signal.aborted)return [];
   const parsed=events.map(e=>{const g=parseGame(e,{season:selectedSeason,type,week:Number(e.week?.number)||1});return g?{...g,stageText:typeof e.week?.text==='string'?e.week.text.slice(0,80):''}:null;}).filter(Boolean);
   cache.teamSchedules[`${key}-${type}`]={games:parsed,byeWeek:type===2&&Number.isInteger(response.byeWeek)?response.byeWeek:null,time:Date.now()};return parsed;
  }));
  if(token!==generation||signal.aborted)return;
  const all=new Map();results.forEach((r,i)=>{if(r.status==='rejected')failures++;const list=r.status==='fulfilled'?r.value:cache.teamSchedules[`${key}-${types[i]}`]?.games||[];for(const g of list)all.set(g.id,g);});games=[...all.values()];byeWeek=cache.teamSchedules[`${key}-2`]?.byeWeek||null;render();onCache();
  $('scheduleStatus').textContent=failures?'Schedule could not be fully updated.':'Schedule updated';if(failures){$('scheduleNotice').textContent=games.length?'Showing available or saved games. Refresh to retry missing season stages.':'Could not load this schedule. Check your connection and refresh.';$('scheduleNotice').classList.remove('hidden');}$('scheduleRefresh').disabled=false;
 }
 async function choose(id){team=id;persist();updateTeams();if(active)await load();}
 $('scheduleTeams').addEventListener('click',e=>{const b=e.target.closest('[data-schedule-team]');if(b)choose(b.dataset.scheduleTeam);});
 $('scheduleTeams').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const teams=orderedTeams(getFavorites()),index=teams.findIndex(([id])=>id===team),next=e.key==='Home'?0:e.key==='End'?31:(index+(e.key==='ArrowRight'?1:31))%32;e.preventDefault();choose(teams[next][0]);$('scheduleTeams').querySelector(`[data-schedule-team="${team}"]`).focus();});
 $('scheduleSeason').onchange=()=>{season=Number($('scheduleSeason').value);persist();if(active)return load();};$('schedulePreseason').onchange=()=>{preseason=$('schedulePreseason').checked;persist();if(active)return load();};$('scheduleRefresh').onclick=()=>load({force:true});
 renderTeams();updateTeams();
 return {refreshFavorites(){renderTeams();updateTeams();},activate(){active=true;const selected=$('scheduleTeams').querySelector(`[data-schedule-team="${team}"]`);selected?.scrollIntoView?.({block:'nearest',inline:'center'});return load();},cancel,render,getGame:id=>games.find(g=>g.id===id)};
}
