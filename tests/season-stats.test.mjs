import test from 'node:test';import assert from 'node:assert/strict';
import {aggregateSeason,seasonEvents,seasonTableHTML} from '../season-stats.js';
import {playerSectionHTML} from '../stats.js';
const columns=[{key:'completions/passingAttempts',label:'C/ATT'},{key:'passingYards',label:'YDS'},{key:'passingTouchdowns',label:'TD'},{key:'interceptions',label:'INT'}];
const game=(week,values,options={})=>({week,id:String(week),data:{players:[{teamId:'25',groups:[{key:'passing',columns,rows:[{id:'qb',name:'QB <safe>',values}]},{key:'rushing',columns:[{key:'rushingAttempts'},{key:'rushingYards'},{key:'longRushing'},{key:'rushingTouchdowns'}],rows:[{id:'rb',name:'Runner',values:options.rush||['10','80','30','1']}]}]},{teamId:'6',groups:[{key:'passing',columns,rows:[{id:'opponent',name:'Other QB',values:['40/50','600','8','0']}]}]}]}});
test('season totals use raw counts, weighted rates and maximum long plays; athlete identity stays separate',()=>{
 const model=aggregateSeason([game(2,['30/50','350','2','1'],{rush:['2','4','3','0']}),game(1,['10/10','100','1','0'])],'25');assert.equal(model.groups.passing.length,1);assert.deepEqual(model.groups.passing[0].totals['completions/passingAttempts'],[40,60]);assert.equal(model.groups.passing[0].totals.passingYards[0],450);assert.equal(model.groups.rushing[0].totals.longRushing[0],30);assert.deepEqual(model.groups.passing[0].weeks.map(w=>w.week),[1,2]);
 const passing=seasonTableHTML(model,'passing');assert.match(passing,/40\/60/);assert.match(passing,/66.7%/);assert.match(passing,/225/);assert.match(passing,/QB &lt;safe&gt;/);assert.doesNotMatch(passing,/Other QB/);
 assert.match(seasonTableHTML(model,'rushing'),/>7<\/td>/); // 84 yards / 12 carries, not average of game averages.
});
test('schedule selection excludes preseason, live/future games, other teams, wrong years and later weeks',()=>{
 const event=(id,week,state='post',type=2,year=2026,team='25')=>({id:String(id),week:{number:week},season:{year},seasonType:{type},competitions:[{status:{type:{state}},competitors:[{team:{id:team}}]}]});
 const schedule={requestedSeason:{year:2026},events:[event(1,1),event(2,2),event(3,3),event(4,2,'in'),event(5,1,'post',1),event(6,1,'post',2,2025),event(7,1,'post',2,2026,'6')]};assert.deepEqual(seasonEvents(schedule,2026,'25',2).map(e=>e.id),['1','2']);assert.throws(()=>seasonEvents(schedule,2025,'25',18),/different season/);
});
test('unavailable metrics remain missing rather than invented as zero',()=>{
 const model=aggregateSeason([game(1,['—','--','0','0'])],'25');assert.equal(model.groups.passing[0].totals.passingYards,undefined);assert.match(seasonTableHTML(model,'passing'),/—/);
});
test('modal player sections include only requested groups',()=>{
 const keys=['passing','rushing','receiving','fumbles','defensive','interceptions','kicking','punting','kickReturns','puntReturns'];const data={teams:[{id:'25',name:'49ers',abbr:'SF',color:'#aa0000'}],players:[{teamId:'25',groups:keys.map(key=>({key,name:key,columns:[{key:'someStat',label:'STAT',title:'Stat'}],rows:[{name:key,values:['1']}],totals:[]}))}]};
 const offense=playerSectionHTML(data,'offense');assert.match(offense,/Passing/);assert.match(offense,/Rushing/);assert.match(offense,/Receiving/);assert.match(offense,/Fumbles/);assert.doesNotMatch(offense,/interceptions|kicking/);
 const defense=playerSectionHTML(data,'defense');assert.match(defense,/defensive/);assert.doesNotMatch(defense,/interceptions|passing/);
 const special=playerSectionHTML(data,'special');for(const name of ['Kicking','Punting','Kick returns','Punt returns'])assert(special.includes(name));assert.doesNotMatch(special,/passing|fumbles/);
});
