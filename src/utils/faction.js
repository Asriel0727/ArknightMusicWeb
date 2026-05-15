/**
 * 幹員陣營 ID（與 handbook_team_table 鍵一致）
 * 優先順序與遊戲內顯示一致：小隊 > 組織 > 國家/地區
 */
export function resolveFactionId(char) {
  if (!char) return null;
  const main = char.mainPower;
  if (main) {
    return main.teamId || main.groupId || main.nationId || null;
  }
  return char.teamId || char.groupId || char.nationId || null;
}
