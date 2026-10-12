import test from 'node:test';import assert from 'node:assert/strict';
import {scheduleEvents} from '../schedule.js';
const event=(id,year,type,team,state)=>({id,season:{year},seasonType:{type},competitions:[{status:{type:{state}},competitors:[{team:{id:team}},{team:{id:'6'}}]}]});
test('team schedules keep future and finished games, filter team/year/stage, and reject wrong seasons',()=>{
 const events=[event('1',2026,2,'25','pre'),event('2',2026,2,'25','post'),event('3',2026,1,'25','post'),event('4',2025,2,'25','post'),event('5',2026,2,'1','post')];
 assert.deepEqual(scheduleEvents({requestedSeason:{year:2026},events},2026,'25',2).map(e=>e.id),['1','2']);
 assert.deepEqual(scheduleEvents({events},2026,'25',1).map(e=>e.id),['3']);
 assert.throws(()=>scheduleEvents({season:{year:2025},events:[]},2026,'25',2),/different season/);
 assert.throws(()=>scheduleEvents({},2026,'25',2),/unavailable/);
});
