import test from 'node:test';
import assert from 'node:assert/strict';
import {playerMetric,playerSeries,leaguePlayers,leagueEvents,chartHTML,seriesColor} from '../advanced-stats.js';
const metrics=(yards,made,attempts)=>({'passingYards':[yards],'completions/passingAttempts':[made,attempts]});
test('weekly and cumulative rates use combined attempts, preserving absent appearances',()=>{
 const p={weeks:[{week:1,metrics:metrics(100,5,10)},{week:3,metrics:metrics(300,27,30)}]};
 assert.deepEqual(playerSeries(p,[1,2,3],'completionPct','weekly').map(x=>x.value),[50,null,90]);
 assert.deepEqual(playerSeries(p,[1,2,3],'completionPct','cumulative').map(x=>x.value),[50,50,80]);
 assert.deepEqual(playerSeries(p,[1,2,3],'passingYards','cumulative').map(x=>x.value),[100,100,400]);
 assert.equal(playerMetric({},'yardsPerCarry'),null);
 assert.equal(playerMetric({rushingYards:[0],rushingAttempts:[0]},'yardsPerCarry'),null);
 assert.equal(playerMetric({receptions:[6],receivingTargets:[8]},'catchRate'),75);
});
function game(id,week,teamId,position='QB',athlete='player'){
 return {id,week,data:{teams:[{id:teamId,abbr:teamId==='25'?'SF':'DAL'}],players:[{teamId,groups:[{key:'passing',columns:[{key:'passingYards'},{key:'completions/passingAttempts'}],rows:[{id:athlete,name:athlete,position,values:['100','5/10']}]}]}]}};
}
test('league players merge traded athletes by ID and keep position categories separate',()=>{
 const players=leaguePlayers([game('1',1,'25'),game('2',2,'6'),game('3',2,'25','WR','trick-pass')],'passing');
 assert.equal(players.length,1);assert.equal(players[0].games,2);assert.deepEqual(players[0].teams,['SF','DAL']);assert.deepEqual(players[0].totals.passingYards,[200]);assert.deepEqual(players[0].weeks.map(w=>w.teamId),['25','6']);
});
test('league events exclude preseason, later weeks, unfinished games and other seasons',()=>{
 const event=(id,year=2025,type=2,week=2,state='post')=>({id,season:{year,type},week:{number:week},competitions:[{status:{type:{state}}}]});
 assert.deepEqual(leagueEvents({events:[event('1'),event('2',2024),event('3',2025,1),event('4',2025,2,3),event('5',2025,2,2,'in'),event('6',2025,3)]},2025,2).map(e=>e.id),['1']);
});
test('32 comparison series have distinct colors, keyboard values, and honest gaps',()=>{
 const series=Array.from({length:32},(_,i)=>({id:String(i),name:'Player '+i,color:seriesColor(i),points:[{week:1,value:100+i},{week:2,value:null},{week:3,value:200+i}]}));
 assert.equal(new Set(series.map(s=>s.color)).size,32);
 const chart=chartHTML(series,'Yards','test');assert.equal((chart.match(/data-chart-series=/g)||[]).length,32);assert.equal((chart.match(/data-toggle-series=/g)||[]).length,32);assert.equal((chart.match(/data-chart-tip=/g)||[]).length,64);assert.match(chart,/M[\d.,]+ M/);assert.doesNotMatch(chart,/NaN|undefined/);
});
