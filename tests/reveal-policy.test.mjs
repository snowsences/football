import test from 'node:test';import assert from 'node:assert/strict';import {revealWeek,coveredByRevealWeek} from '../reveal-policy.js';
const game={season:2026,seasonType:2,week:4,state:'post'},setting={season:2026,week:4};
test('reveal cutoff applies to started regular-season games through the chosen week only',()=>{
 assert.equal(coveredByRevealWeek(game,setting,2026),true);assert.equal(coveredByRevealWeek({...game,state:'in'},setting,2026),true);
 for(const change of [{week:5},{week:0},{state:'pre'},{season:2025},{seasonType:1},{seasonType:3}])assert.equal(coveredByRevealWeek({...game,...change},setting,2026),false);
 assert.equal(coveredByRevealWeek(game,{season:2026,week:3},2026),false);assert.equal(coveredByRevealWeek(game,{season:2026,week:5},2026),true);assert.equal(coveredByRevealWeek(undefined,setting,2026),false);
});
test('new seasons start unset and malformed cutoff settings never reveal games',()=>{
 assert.equal(revealWeek(setting,2027),0);assert.equal(coveredByRevealWeek({...game,season:2027},setting,2027),false);
 for(const week of [0,19,-1,1.5,'4',null])assert.equal(revealWeek({season:2026,week},2026),0);assert.equal(revealWeek(undefined,2026),0);assert.equal(revealWeek(setting,2026),4);
});
