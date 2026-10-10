// Keep only ordinary box-score fields, never articles, videos, odds, or advanced metrics.
const text=v=>String(v??'—').slice(0,300);
const val=v=>text(v&&typeof v==='object'?(v.displayValue??v.value??'—'):v);
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamColor=value=>/^[0-9a-f]{6}$/i.test(String(value||'').replace(/^#/,''))?'#'+String(value).replace(/^#/,''):'#335357';
function metric(value,stat,category=''){
 const raw=String(value??'').trim(),name=(stat.key+' '+stat.label+' '+(stat.title||'')).toLowerCase();
 if(!raw||raw==='—'||raw==='--')return null;
 const clock=raw.match(/^(\d+):(\d{2})$/);if(clock)return {values:[Number(clock[1])*60+Number(clock[2])],lower:false};
 const pair=raw.match(/^(-?\d+(?:\.\d+)?)\s*[-/]\s*(-?\d+(?:\.\d+)?)$/);
 const lower=/turnover|interceptions? thrown|sacks?|penalt|fumbles? lost|fum\s*\/\s*lost|fumbleslost/.test(name)||(/\bint\b|interceptions/.test(name)&&['passing','offense'].includes(category))||(category==='fumbles'&&['fumbles','fumblesLost'].includes(stat.key));
 if(pair){const a=Number(pair[1]),b=Number(pair[2]);
  if(/fumb|fum\s*\//.test(name))return {values:[b,a],lower:true};
  if(/sack|penalt/.test(name))return {values:[a,b],lower:true};
  if(/c\s*\/\s*att|comp|eff|third.?down|fourth.?down|red.?zone|fieldGoalsMade|extraPointsMade/i.test(name))return b?{values:[a/b],lower:false}:null;
  return {values:[a,b],lower};
 }
 if(!/^-?\d+(?:,\d{3})*(?:\.\d+)?%?$/.test(raw))return null;
 return {values:[Number(raw.replace(/[,％%]/g,''))],lower};
}
function compare(a,b){for(let i=0;i<Math.max(a.values.length,b.values.length);i++){const difference=(a.values[i]||0)-(b.values[i]||0);if(difference)return a.lower?-difference:difference;}return 0;}
function winners(values,stat,category=''){
 const parsed=values.map(value=>metric(value,stat,category)),valid=parsed.map((value,i)=>value?i:-1).filter(i=>i>=0);if(valid.length<2)return new Set();
 let best=valid[0];for(const i of valid)if(compare(parsed[i],parsed[best])>0)best=i;
 const leaders=valid.filter(i=>compare(parsed[i],parsed[best])===0);
 return new Set(leaders.length===1?leaders:[]);
}
function statHTML(value,team,winning){return winning?`<span class="stat-winner" style="background-color:${teamColor(team.color)}">${esc(value)}<span class="sr-only"> (${esc(team.abbr)} leads)</span></span>`:esc(value);}
function teamStatRow(data,key,label){const values=data.teams.map(t=>t.stats.find(s=>s.key===key)?.value??'—'),best=winners(values,{key,label},'offense');return [esc(label),...values.map((v,i)=>statHTML(v,data.teams[i],best.has(i)))];}
function scoringHTML(data,p){
 const team=data.teams.find(t=>t.id===p.teamId)||data.teams.find(t=>t.abbr===p.abbr),away=data.teams.find(t=>t.side==='away')||data.teams[0],home=data.teams.find(t=>t.side==='home')||data.teams[1];
 const a=Number(p.away),h=Number(p.home),leader=Number.isFinite(a)&&Number.isFinite(h)&&a!==h?(a>h?away:home):null;
 const id=team?.id||p.teamId,abbr=team?.abbr||p.abbr;
 const logo=/^\d{1,2}$/.test(id)?`<span class="team-logo scoring-logo"><img src="logos/${id}.png" alt="${esc(abbr)}" width="28" height="28" loading="lazy"><span class="logo-fallback">${esc(abbr)}</span></span>`:`<span class="scoring-logo">${esc(abbr)}</span>`;
 return `<div class="scoring-event">${logo}<div class="scoring-body"><div class="scoring-meta"><span>${p.period<=4?'Q'+p.period:'OT'} · ${esc(p.clock)}</span><span class="scoring-score">${esc(p.away)}–${esc(p.home)}${leader?' '+esc(leader.abbr):''}</span></div><p>${esc(p.description)}</p></div></div>`;
}
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
  return {id:text(t.id),name:text(t.displayName||t.name),abbr:text(t.abbreviation),side:c.homeAway,color:teamColor(t.color||teamRows.find(r=>String(r.team?.id)===String(t.id))?.team?.color),record:teamRecord(c),score:val(c.score),periods:(c.linescores||[]).map(val),stats:[...unique.values()]};
 }).sort((a,b)=>(a.side==='away'?0:1)-(b.side==='away'?0:1));
 const players=(summary.boxscore?.players||[]).map(r=>({teamId:text(r.team?.id),teamName:text(r.team?.displayName||r.team?.name),groups:(r.statistics||[]).filter(s=>PLAYER_GROUPS[s.name]).map(s=>{
  const columns=(s.labels||[]).map((label,i)=>({label:text(label),title:text(s.descriptions?.[i]||label),i,key:s.keys?.[i]})).filter(c=>c.key!=='adjQBR'&&c.label!=='QBR');
  return {key:s.name,name:PLAYER_GROUPS[s.name],columns:columns.map(({label,title,key})=>({label,title,key})),rows:(s.athletes||[]).map(a=>({name:text(a.athlete?.displayName||a.athlete?.shortName),values:columns.map(c=>val(a.stats?.[c.i]))})),totals:Array.isArray(s.totals)?columns.map(c=>val(s.totals[c.i])):[]};
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
 const overview=keys.map(key=>{const stat=data.teams.flatMap(t=>t.stats).find(s=>s.key===key);return stat?teamStatRow(data,key,stat.label):null}).filter(Boolean);
 const summary=overview.length?`<h3>At a glance</h3>${table(['Stat',...data.teams.map(t=>esc(t.abbr))],overview,'Key game statistics')}`:'';
 const scoring=data.scoring.length?`<h3>Scoring summary</h3><div class="scoring-list">${data.scoring.map(p=>scoringHTML(data,p)).join('')}</div>`:'<p class="small">No scoring summary available yet.</p>';
 return `<h3>Score by quarter</h3>${quarters}${summary}${scoring}`;
}
export function teamStatsHTML(data){
 const keys=new Map();for(const t of data.teams)for(const s of t.stats)keys.set(s.key,s.label);
 if(!keys.size)return '<p class="small">Team stats are not available yet.</p>';
 return table(['Stat',...data.teams.map(t=>esc(t.abbr))],[...keys].map(([key,label])=>teamStatRow(data,key,label)),'Team statistics');
}
export function availableGroups(data){return Object.keys(PLAYER_GROUPS).filter(key=>data.players.some(p=>p.groups.some(g=>g.key===key&&g.rows.length)));}
export function playerStatsHTML(data,category){
 const groups=data.teams.map(team=>data.players.find(p=>p.teamId===team.id)?.groups.find(g=>g.key===category));
 const entries=groups.flatMap((group,teamIndex)=>(group?.rows||[]).map(row=>({row,teamIndex,group})));
 const leaders=new Map(),totalLeaders=new Map();
 const columnId=c=>c.key||c.label;
 for(const group of groups.filter(Boolean))for(const column of group.columns){const id=columnId(column);if(leaders.has(id))continue;
  const matching=entries.filter(e=>e.group.columns.some(c=>columnId(c)===id));
  const values=matching.map(e=>e.row.values[e.group.columns.findIndex(c=>columnId(c)===id)]),best=winners(values,column,category);
  leaders.set(id,new Set([...best].map(i=>matching[i].row)));
  const totals=groups.map(g=>g?.totals[g.columns.findIndex(c=>columnId(c)===id)]??'—');totalLeaders.set(id,winners(totals,column,category));
 }
 return data.teams.map((team,teamIndex)=>{const group=groups[teamIndex];if(!group?.rows.length)return `<section class="player-team-section"><h3>${esc(team.name)}${recordHTML(team.record)}</h3><p class="small">No ${esc(PLAYER_GROUPS[category]||'player')} stats available.</p></section>`;
 const headers=['Player',...group.columns.map(c=>`<abbr title="${esc(c.title)}">${esc(c.label)}</abbr>`)];
 const rows=group.rows.map(r=>[esc(r.name),...r.values.map((v,i)=>statHTML(v,team,leaders.get(columnId(group.columns[i]))?.has(r)))]);
 if(group.totals.length)rows.push(['Team total',...group.totals.map((v,i)=>statHTML(v,team,totalLeaders.get(columnId(group.columns[i]))?.has(teamIndex)))]);
 return `<section class="player-team-section"><h3>${esc(team.name)}${recordHTML(team.record)}</h3>${table(headers,rows,team.name+' '+group.name)}</section>`;
 }).join('');
}
