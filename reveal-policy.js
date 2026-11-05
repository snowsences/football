export function revealWeek(setting,season){
 return setting&&Number(setting.season)===Number(season)&&Number.isInteger(setting.week)&&setting.week>=1&&setting.week<=18?setting.week:0;
}
export function coveredByRevealWeek(game,setting,season){
 const through=revealWeek(setting,season);
 return !!(through&&game&&Number(game.season)===Number(season)&&Number(game.seasonType)===2&&Number.isInteger(game.week)&&game.week>=1&&game.week<=through&&['in','post'].includes(game.state));
}

export function revealChoices(setting,current){
 const saved=revealWeek(setting,current?.season);
 const available=current?.type===3?18:current?.type===2?Math.min(18,Math.max(0,current.week)):0;
 return Array.from({length:Math.max(saved,available)-saved+1},(_,i)=>saved+i);
}

// A league's published season end or a completed championship can unlock the
// active season before the next season appears in the feed.
export function championshipFinished(feed,league,season,now=Date.now()){
 if(!Number.isInteger(season)||season<1900)return false;
 const official=feed.leagues?.[0]?.season;
 const end=Date.parse(official?.endDate);
 if(Number(official?.year)===season&&Number.isFinite(end)&&end<=now)return true;
 return (feed.events||[]).some(e=>{
  if(Number(e.season?.year??feed.season?.year)!==season||Number(e.season?.type??feed.season?.type)!==3)return false;
  const c=e.competitions?.[0],status=c?.status?.type??e.status?.type;
  if(status?.state!=='post'||status.completed!==true||/cancel|postpon|suspend/i.test(status.name||''))return false;
  const notes=(c?.notes||[]).map(n=>n.headline||'');
  if(league==='mlb')return c?.series?.completed===true&&notes.some(n=>/^World Series\b/i.test(n));
  return league==='nfl'&&notes.some(n=>/^Super Bowl\b/i.test(n));
 });
}
export function completedSeason(year,activeYear,activeComplete=false){
 return Number.isInteger(year)&&year>=1900&&Number.isInteger(activeYear)&&(year<activeYear||(year===activeYear&&activeComplete));
}
