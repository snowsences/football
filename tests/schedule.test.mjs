import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleEvents,normalizeFavorites,orderedTeams,nextScheduledGame,timelineRows} from '../schedule.js';
const event=(id,year,type,team,state)=>({id,season:{year},seasonType:{type},competitions:[{status:{type:{state}},competitors:[{team:{id:team}},{team:{id:'6'}}]}]});
test('team schedules keep future and finished games, filter team/year/stage, and reject wrong seasons',()=>{
 const events=[event('1',2026,2,'25','pre'),event('2',2026,2,'25','post'),event('3',2026,1,'25','post'),event('4',2025,2,'25','post'),event('5',2026,2,'1','post')];
 assert.deepEqual(scheduleEvents({requestedSeason:{year:2026},events},2026,'25',2).map(e=>e.id),['1','2']);
 assert.deepEqual(scheduleEvents({events},2026,'25',1).map(e=>e.id),['3']);
 assert.throws(()=>scheduleEvents({season:{year:2025},events:[]},2026,'25',2),/different season/);
 assert.throws(()=>scheduleEvents({},2026,'25',2),/unavailable/);
});

test('favorites default to SF, remain editable, validate IDs and pin in order',()=>{assert.deepEqual(normalizeFavorites(undefined),['25']);assert.deepEqual(normalizeFavorites([]),[]);assert.deepEqual(normalizeFavorites(['25','6','6','bad']),['25','6']);assert.deepEqual(orderedTeams(['25','6']).slice(0,2).map(t=>t[0]),['25','6']);assert.equal(orderedTeams(['25','6']).length,32);});
test('timeline inserts only declared bye weeks and next game chooses live or future games',()=>{const games=[{id:'a',week:1,seasonType:2,state:'post',date:'2026-09-01'},{id:'b',week:3,seasonType:2,state:'pre',date:'2026-09-20'}];assert.deepEqual(timelineRows(games,2).map(r=>r.bye?'bye':r.game.id),['a','bye','b']);assert.equal(timelineRows(games,3).length,2);assert.equal(timelineRows(games,null).length,2);assert.equal(nextScheduledGame(games,Date.parse('2026-09-10')).id,'b');assert.equal(nextScheduledGame(games,Date.parse('2026-10-01')),undefined);assert.equal(nextScheduledGame([{...games[0],state:'in'},games[1]],Date.parse('2026-09-10')).id,'a');});
