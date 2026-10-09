// Keep only ordinary box-score fields, never articles, videos, odds, or advanced metrics.
const text=v=>String(v??'—').slice(0,300);
const val=v=>text(v&&typeof v==='object'?(v.displayValue??v.value??'—'):v);
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function teamRecord(competitor){
 const records=competitor.record||competitor.records||[];
 const total=records.find(r=>r.type==='total'||r.type==='overall'||r.name==='overall');
 const value=String(total?.summary??total?.displayValue??'').trim();
 return /^\d{1,2}-\d{1,2}(?:-\d{1,2})?$/.test(value)?value:'';
}
export function recordHTML(record){return record?` <span class="team-record">(${esc(record)})</span>`:'';}
export const PLAYER_GROUPS={passing:'Passing',rushing:'Rushing',receiving:'Receiving',defensive:'Defense',interceptions:'Interceptions',fumbles:'Fumbles',kicking:'Kicking',punting:'Punting',kickReturns:'Kick returns',puntReturns:'Punt returns'};
export function extractStats(summary){
 const competition=summary.header?.competitions?.[0];
 if(!competition||!Array.isArray(competition.competitors)||competition.competitors.length!==2)return null;
 const teamRows=(summary.boxscore?.teams||[]);
 const teams=competition.competitors.map(c=>{
  const t=c.team||{},stats=teamRows.find(r=>String(r.team?.id)===String(t.id))?.statistics||[];
  const unique=new Map();for(const s of stats)if(s.name)unique.set(s.name,{key:text(s.name),label:text(s.label||s.name),value:val(s.displayValue??s.value)});
  return {id:text(t.id),name:text(t.displayName||t.name),abbr:text(t.abbreviation),side:c.homeAway,record:teamRecord(c),score:val(c.score),periods:(c.linescores||[]).map(val),stats:[...unique.values()]};
 }).sort((a,b)=>(a.side==='away'?0:1)-(b.side==='away'?0:1));
 const players=(summary.boxscore?.players||[]).map(r=>({teamId:text(r.team?.id),teamName:text(r.team?.displayName||r.team?.name),groups:(r.statistics||[]).filter(s=>PLAYER_GROUPS[s.name]).map(s=>{
  const columns=(s.labels||[]).map((label,i)=>({label:text(label),title:text(s.descriptions?.[i]||label),i,key:s.keys?.[i]})).filter(c=>c.key!=='adjQBR'&&c.label!=='QBR');
  return {key:s.name,name:PLAYER_GROUPS[s.name],columns:columns.map(({label,title})=>({label,title})),rows:(s.athletes||[]).map(a=>({name:text(a.athlete?.displayName||a.athlete?.shortName),values:columns.map(c=>val(a.stats?.[c.i]))})),totals:Array.isArray(s.totals)?columns.map(c=>val(s.totals[c.i])):[]};
 })}));
 const scoring=(summary.scoringPlays||[]).map(p=>({teamId:text(p.team?.id),abbr:text(p.team?.abbreviation),period:Number(p.period?.number)||0,clock:text(p.clock?.displayValue||''),description:text(p.text||p.type?.text),away:val(p.awayScore),home:val(p.homeScore)}));
 const status=competition.status?.type;
 return {teams,players,scoring,status:text(status?.detail||status?.description||'Status unavailable'),state:status?.state||'pre',venue:text(summary.gameInfo?.venue?.fullName||summary.gameInfo?.venue?.name||''),updatedAt:Date.now()};
}
function table(head,rows,caption){return `<div class="stats-table-scroll" tabindex="0" aria-label="${esc(caption)}"><table class="stats-table"><caption class="sr-only">${esc(caption)}</caption><thead><tr>${head.map((h,i)=>`<th scope="col"${i?'':' class="stat-name"'}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>i?`<td>${c}</td>`:`<th scope="row" class="stat-name">${c}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
export function scoreHTML(data){return `<div class="scoreboard-status">${esc(data.status)}</div><div class="revealed-scoreboard">${data.teams.map(t=>`<div class="score-team"><span>${esc(t.name)}${recordHTML(t.record)}</span><strong>${esc(t.score)}</strong></div>`).join('')}</div>`;}
export function overviewHTML(data){
 const periods=Math.max(4,...data.teams.map(t=>t.periods.length));
 const quarters=table(['Team',...Array.from({length:periods},(_,i)=>i<4?String(i+1):i===4?'OT':`${i-3}OT`),'Total'],data.teams.map(t=>[esc(t.abbr),...Array.from({length:periods},(_,i)=>esc(t.periods[i]??'—')),esc(t.score)]),'Score by quarter');
 const keys=['totalYards','netPassingYards','rushingYards','turnovers','possessionTime'];
 const overview=keys.map(key=>{const stat=data.teams.flatMap(t=>t.stats).find(s=>s.key===key);return stat?[esc(stat.label),...data.teams.map(t=>esc(t.stats.find(s=>s.key===key)?.value??'—'))]:null}).filter(Boolean);
 const summary=overview.length?`<h3>At a glance</h3>${table(['Stat',...data.teams.map(t=>esc(t.abbr))],overview,'Key game statistics')}`:'';
 const scoring=data.scoring.length?`<h3>Scoring summary</h3><div class="scoring-list">${data.scoring.map(p=>`<div class="scoring-event"><div class="scoring-meta"><span>${p.period<=4?'Q'+p.period:'OT'} · ${esc(p.clock)} · ${esc(p.abbr)}</span><span>${esc(p.away)}–${esc(p.home)}</span></div><p>${esc(p.description)}</p></div>`).join('')}</div>`:'<p class="small">No scoring summary available yet.</p>';
 return `<h3>Score by quarter</h3>${quarters}${summary}${scoring}`;
}
export function teamStatsHTML(data){
 const keys=new Map();for(const t of data.teams)for(const s of t.stats)keys.set(s.key,s.label);
 if(!keys.size)return '<p class="small">Team stats are not available yet.</p>';
 return table(['Stat',...data.teams.map(t=>esc(t.abbr))],[...keys].map(([key,label])=>[esc(label),...data.teams.map(t=>esc(t.stats.find(s=>s.key===key)?.value??'—'))]),'Team statistics');
}
export function availableGroups(data){return Object.keys(PLAYER_GROUPS).filter(key=>data.players.some(p=>p.groups.some(g=>g.key===key&&g.rows.length)));}
export function playerStatsHTML(data,category){
 return data.teams.map(team=>{const p=data.players.find(p=>p.teamId===team.id),group=p?.groups.find(g=>g.key===category);if(!group?.rows.length)return `<section class="player-team-section"><h3>${esc(team.name)}${recordHTML(team.record)}</h3><p class="small">No ${esc(PLAYER_GROUPS[category]||'player')} stats available.</p></section>`;
 const headers=['Player',...group.columns.map(c=>`<abbr title="${esc(c.title)}">${esc(c.label)}</abbr>`)];
 const rows=group.rows.map(r=>[esc(r.name),...r.values.map(esc)]);if(group.totals.length)rows.push(['Team total',...group.totals.map(esc)]);
 return `<section class="player-team-section"><h3>${esc(team.name)}${recordHTML(team.record)}</h3>${table(headers,rows,team.name+' '+group.name)}</section>`;
 }).join('');
}

