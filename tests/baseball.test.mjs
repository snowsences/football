import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {DEFAULT_FAVORITES,gameDay,readGame,rateBaseball,revealAllowed,advanceCutoff} from '../baseball-data.js';

const date='2025-09-06T23:05:00Z';
const event=(id='456',state='post',away='13',home='12')=>({id,date,season:{year:2025,type:2},competitions:[{date,status:{type:{state,completed:state==='post',name:state==='post'?'STATUS_FINAL':'STATUS_SCHEDULED',shortDetail:'Final/10'}},competitors:[
 {team:{id:home,name:home==='12'?'Mariners':'Other home',abbreviation:'SEA'},homeAway:'home',score:{displayValue:'7'},linescores:[{displayValue:'3'}],records:[{type:'total',summary:'91-71'}]},
 {team:{id:away,name:away==='13'?'Rangers':'Other away',abbreviation:'TEX'},homeAway:'away',score:'5',linescores:[{displayValue:'1'}]}
]}]});
const probabilities=ps=>({plays:ps.map((_,i)=>({id:String(i),period:{number:1+Math.floor(i/5)}})),winprobability:ps.map((p,i)=>({playId:String(i),homeWinPercentage:p}))});

test('a low-scoring nail-biter can outrank a blowout, without exposing outcome or guessing from incomplete data',()=>{
 const tight=rateBaseball(probabilities(Array(45).fill(.51)));
 const blowout=rateBaseball(probabilities([.51,...Array(44).fill(.98)]));
 assert(tight>blowout);
 assert.equal(tight,rateBaseball(probabilities(Array(45).fill(.49))));
 assert.equal(rateBaseball(probabilities(Array(5).fill(.5))),null);
 assert.equal(rateBaseball({}),null);
});
test('date reveal is inclusive, season-specific, forward only, and leaves spring training and unstarted games hidden',()=>{
 const g=readGame(event()),prefs={cutoffs:{2025:'2025-09-06'}};
 assert(revealAllowed(g,{},2026));
 assert(revealAllowed(g,{},2025,true));
 assert(!revealAllowed(g,{},2025,false));
 assert(!revealAllowed({...g,state:'upcoming'}, {},2026));
 assert.deepEqual(g.teams.map(t=>t.id),DEFAULT_FAVORITES);
 assert(revealAllowed(g,prefs,2025));
 assert(!revealAllowed({...g,season:2026},prefs,2025));
 assert(!revealAllowed({...g,stage:1},prefs,2025));
 assert(!revealAllowed({...g,day:'2025-09-07'},prefs,2025));
 assert(!revealAllowed({...g,state:'upcoming'},prefs,2025));
 assert.equal(gameDay('2025-09-07T02:00:00Z'),'2025-09-06');
 assert.equal(advanceCutoff('2025-09-06','2025-09-01',2025,'2025-09-07'),'2025-09-06');
 assert.equal(advanceCutoff('2025-09-06','2025-09-08',2025,'2025-09-07'),'2025-09-06');
 assert.equal(advanceCutoff('2025-09-06','2025-09-07',2025,'2025-09-07'),'2025-09-07');
});
test('MLB UI keeps scores and standings gated, pins Rangers and Mariners, and ranks a date window',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2025-09-07T12:00:00Z')});
 const {document,window}=parseHTML(await readFile(new URL('../baseball.html',import.meta.url),'utf8'));
 const proto=Object.getPrototypeOf(document.createElement('select'));
 Object.defineProperty(proto,'value',{get(){return [...this.querySelectorAll('option')].find(o=>o.hasAttribute('selected'))?.value||this.querySelector('option')?.value||'';},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===String(value));}});
 const storage=new Map(),requests=[];
 globalThis.document=document;globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 const savedInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
 const response=data=>({ok:true,json:async()=>data});
 const g=event(),other=event('457','post','18','19');
 const summary={header:g,...probabilities(Array(45).fill(.5)),boxscore:{players:[{team:{name:'Rangers'},statistics:[{type:'batting',labels:['R'],athletes:[{athlete:{displayName:'Spoiler Batter'},stats:['2']}]}]}]}};
 globalThis.fetch=async url=>{
  const u=new URL(url);requests.push(u);
  if(u.pathname.endsWith('/scoreboard'))return response({events:[other,g]});
  if(u.pathname.endsWith('/summary'))return response({...summary,header:u.searchParams.get('event')==='456'?g:other});
  if(u.pathname.endsWith('/schedule'))return response({requestedSeason:{year:2025},events:u.searchParams.get('seasontype')==='2'?[g]:[]});
  if(u.pathname.endsWith('/standings'))return response({season:{year:2025},children:[{children:[{name:'American League West',standings:{entries:[{team:{id:'12',displayName:'Seattle Mariners'},stats:[{name:'wins',displayValue:'91'}]}]}}]}]});
  throw Error('Unexpected request');
 };
 const $=id=>document.getElementById(id),click=el=>el.dispatchEvent(new window.Event('click',{bubbles:true})),settle=()=>new Promise(resolve=>setImmediate(resolve));
 $('mlbDialog').showModal=()=>{$('mlbDialog').open=true;};
 try{
  await import('../baseball.js');await settle();
  assert.deepEqual([...$('mlbTeam').querySelectorAll('option')].slice(0,2).map(o=>o.value),DEFAULT_FAVORITES);
  $('mlbDate').value='2025-09-06';await $('mlbDate').onchange();
  assert.equal($('mlbGameList').firstElementChild.dataset.mlbGame,'456');
  assert.equal($('mlbGameList').querySelector('.card-score'),null);
  assert.doesNotMatch($('mlbGameList').textContent,/91-71|Final\/10/);
  click($('mlbGameList').firstElementChild);await settle();
  assert.equal($('mlbBox').textContent,'');
  $('mlbReveal').onclick();await settle();
  assert.match($('mlbBox').textContent,/TEX 5 · SEA 7/);
  assert.match($('mlbBox').textContent,/Spoiler Batter/);
  $('mlbDialog').dispatchEvent(new window.Event('close'));
  $('mlbFavoritesOnly').checked=true;$('mlbFavoritesOnly').onchange();await settle();
  assert.equal($('mlbGameList').children.length,1);
  click(document.querySelector('[data-mlb-tab="Standings"]'));
  assert.equal($('mlbStandingsList').textContent,'');
  assert($('mlbRefresh').classList.contains('hidden'));
  assert(!requests.some(u=>u.pathname.endsWith('/standings')));
  $('mlbStandingsYear').value='2025';await $('mlbShowStandings').onclick();
  assert.equal($('mlbRefresh').getAttribute('aria-label'),'Refresh MLB standings');
  assert.match($('mlbStandingsList').textContent,/American League West.*Seattle Mariners.*91/);
  $('mlbSeason').value='2025';click(document.querySelector('[data-mlb-tab="Schedule"]'));await settle();
  assert.equal($('mlbScheduleList').children.length,1);
  click(document.querySelector('[data-mlb-tab="Best"]'));
  $('mlbBestDate').value='2025-09-06';await $('mlbRank').onclick();
  assert.equal($('mlbBestList').children.length,2);
  assert.match($('mlbBestStatus').textContent,/2 of 2/);
  assert(requests.some(u=>u.searchParams.get('dates')==='20250831'));
 }finally{globalThis.setInterval=savedInterval;}
});
