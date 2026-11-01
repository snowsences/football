import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {parseStandings,standingsHTML,playoffPosition,playoffPlaces,initStandings} from '../standings.js';
import {standingsFixture} from './fixtures/standings.mjs';
test('standings retain feed tiebreak seeds, division membership, records and exact clinch descriptions',()=>{
 const model=parseStandings(standingsFixture(),2026);assert.equal(model.complete,true);assert.equal(model.conferences.length,2);assert(model.conferences.every(c=>c.divisions.length===4&&c.seeded));
 const nfc=model.conferences.find(c=>c.name==='NFC'),west=nfc.divisions.find(d=>d.name==='NFC West');assert.deepEqual(west.teams.map(t=>t.seed),[4,6,12,16]);const sf=west.teams.find(t=>t.id==='25');assert.equal(sf.stats.conference,'6-6');assert.equal(sf.stats.home,'4-4-1');assert.equal(sf.clinch.label,'Clinched Playoff Berth');assert.equal(playoffPosition(sf,2026).label,'Wild card');assert.equal(playoffPosition(west.teams.at(-1),2026).label,'Eliminated');
});
test('division and wildcard tables show all 16 conference teams, ranks and the correct cutoff',()=>{
 const model=parseStandings(standingsFixture(),2026);let {document}=parseHTML(standingsHTML(model,'NFC','divisions'));assert.equal(document.querySelectorAll('.standings-section').length,4);assert.equal(document.querySelectorAll('tbody tr').length,16);assert.equal(document.querySelectorAll('.standings-favorite').length,1);
 ({document}=parseHTML(standingsHTML(model,'NFC','wildcard')));const sections=document.querySelectorAll('.standings-section');assert.deepEqual([...sections].map(s=>s.querySelectorAll('tbody tr').length),[4,3,9]);assert.equal(document.querySelectorAll('.playoff-cut-line').length,1);assert.match(document.querySelector('.standings-legend').textContent,/Clinched Playoff Berth/);
 assert.equal(playoffPlaces(2019),6);assert.equal(playoffPlaces(2020),7);model.year=2019;({document}=parseHTML(standingsHTML(model,'AFC','wildcard')));assert.deepEqual([...document.querySelectorAll('.standings-section')].map(s=>s.querySelectorAll('tbody tr').length),[4,2,10]);
});
test('wrong-season or missing standings fail; unavailable stats and ambiguous seeds stay unknown',()=>{
 assert.throws(()=>parseStandings(standingsFixture(2025),2026),/different season/);assert.throws(()=>parseStandings({season:{year:2026}},2026),/unavailable/);
 const fixture=standingsFixture();fixture.children[0].children[0].standings.entries[0].stats=[];let model=parseStandings(fixture,2026),team=model.conferences[0].divisions.flatMap(d=>d.teams).find(t=>t.id==='2');assert.equal(team.seed,null);assert.equal(team.stats.wins,'—');assert.equal(playoffPosition(team,2026).label,'Seed unavailable');assert.match(standingsHTML(model,'AFC','wildcard'),/Some conference seeds are unavailable/);
 const duplicate=standingsFixture();duplicate.children[0].children[0].standings.entries[0].stats[0].value=1;model=parseStandings(duplicate,2026);assert.equal(model.conferences[0].seeded,false);assert(model.conferences[0].divisions.flatMap(d=>d.teams).every(t=>t.seed===null));
});

test('standings ignore old responses after the selected season changes',async()=>{
 const {document}=parseHTML('<div><button id="scheduleRefresh"></button><p id="standingsStatus"></p><p id="standingsNotice"></p><div id="standingsContent"></div></div>');globalThis.document=document;
 const requests=[];let year=2025;const cache={},dashboard=initStandings({fetchJSON:path=>new Promise(resolve=>requests.push({path,resolve})),getSeason:()=>year,cache,onCache:()=>{}});
 const old=dashboard.activate();year=2026;const latest=dashboard.activate();requests[1].resolve(standingsFixture(2026));await latest;assert.match(document.getElementById('standingsStatus').textContent,/2026/);requests[0].resolve(standingsFixture(2025));await old;assert.match(document.getElementById('standingsStatus').textContent,/2026/);assert.equal(cache.standings[2025],undefined);dashboard.cancel();
});
