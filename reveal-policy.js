export function revealWeek(setting,season){
 return setting&&Number(setting.season)===Number(season)&&Number.isInteger(setting.week)&&setting.week>=1&&setting.week<=18?setting.week:0;
}
export function coveredByRevealWeek(game,setting,season){
 const through=revealWeek(setting,season);
 return !!(through&&game&&Number(game.season)===Number(season)&&Number(game.seasonType)===2&&Number.isInteger(game.week)&&game.week>=1&&game.week<=through&&['in','post'].includes(game.state));
}
