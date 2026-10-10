import test from 'node:test';
import assert from 'node:assert/strict';
import {extractStats,overviewHTML,teamStatsHTML,playerStatsHTML} from '../stats.js';
const teams=[{id:'27',abbr:'TB',name:'Tampa Bay',side:'away',color:'#D50A0A',stats:[],periods:[]},{id:'6',abbr:'DAL',name:'Dallas',side:'home',color:'#003594',stats:[],periods:[]}];
const data=()=>({teams:structuredClone(teams),scoring:[],players:[]});
const highlighted=html=>[...html.matchAll(/class="stat-winner"[^>]*>(.*?)<span class="sr-only">/g)].map(m=>m[1]);
test('team rows compare numbers, clocks, rates and lower-is-better categories, without marking ties',()=>{
 const d=data();const rows=[['totalYards','Total Yards','419','366','419'],['turnovers','Turnovers','3','1','1'],['interceptions','Interceptions Thrown','2','0','0'],['sacksYardsLost','Sacks-Yards Lost','3-10','2-15','2-15'],['totalPenaltiesYards','Penalties','5-25','4-40','4-40'],['fumblesLost','Fumbles Lost','1','0','0'],['fumLost','FUM/LOST','1-1','2-0','2-0'],['possessionTime','Possession','29:59','30:01','30:01'],['thirdDownEff','Third Down','4-8','5-12','4-8'],['firstDowns','First Downs','20','20',null],['missing','Unavailable','—','50',null]];
 d.teams.forEach((t,i)=>t.stats=rows.map(([key,label,a,b])=>({key,label,value:i?b:a})));
 const html=teamStatsHTML(d);assert.deepEqual(highlighted(html),rows.map(r=>r[4]).filter(v=>v!==null));assert.match(html,/background-color:#D50A0A">419/);assert.match(html,/background-color:#003594">1/);
 assert.deepEqual(highlighted(overviewHTML(d)),['419','1','30:01']);
});
test('scoring rows use scoring team logos and current leader, omitting abbreviations on ties',()=>{
 const d=data();d.scoring=[{teamId:'6',period:1,clock:'10:00',away:'0',home:'7',description:'Touchdown'},{teamId:'27',period:2,clock:'5:00',away:'7',home:'7',description:'Touchdown'},{teamId:'6',period:3,clock:'2:00',away:'24',home:'16',description:'Field goal'}];
 const html=overviewHTML(d);assert.match(html,/src="logos\/6.png" alt="DAL"/);assert.match(html,/src="logos\/27.png" alt="TB"/);assert.deepEqual([...html.matchAll(/class="scoring-score">(.*?)<\/span>/g)].map(m=>m[1]),['0–7 DAL','7–7','24–16 TB']);
});
test('player columns compare all athletes, with totals separate and offensive INT/SACKS lower',()=>{
 const d=data(),columns=[{key:'passingYards',label:'YDS'},{key:'interceptions',label:'INT'},{key:'sacks-sackYardsLost',label:'SACKS'},{key:'completions/passingAttempts',label:'C/ATT'},{key:'passingTouchdowns',label:'TD'}];
 d.players=d.teams.map((t,i)=>({teamId:t.id,groups:[{key:'passing',name:'Passing',columns,rows:[{name:t.abbr+' QB',values:i?['366','0','1-7','20/25','2']:['419','2','2-5','22/30','2']}],totals:i?['366','0','1-7','20/25','2']:['419','2','2-5','22/30','2']}]}));
 assert.deepEqual(highlighted(playerStatsHTML(d,'passing')),['419','419','0','1-7','20/25','0','1-7','20/25']);
 d.players.forEach((p,i)=>p.groups=[{key:'interceptions',name:'Interceptions',columns:[{key:'interceptions',label:'INT'}],rows:[{name:'Defender',values:[i?'2':'1']}],totals:[]}]);assert.deepEqual(highlighted(playerStatsHTML(d,'interceptions')),['2']);
});
test('stats extraction keeps sanitized colors and stat identities, rejecting style injection',()=>{
 const d=extractStats({header:{competitions:[{competitors:teams.map((t,i)=>({homeAway:t.side,team:{id:t.id,abbreviation:t.abbr,color:i?'red;position:fixed':'D50A0A'},score:'7'}))}]},boxscore:{players:[{team:{id:'27'},statistics:[{name:'passing',keys:['interceptions'],labels:['INT'],athletes:[{athlete:{displayName:'QB'},stats:['0']}]}]}]}});
 assert.equal(d.teams[0].color,'#D50A0A');assert.equal(d.teams[1].color,'#335357');assert.equal(d.players[0].groups[0].columns[0].key,'interceptions');
});
