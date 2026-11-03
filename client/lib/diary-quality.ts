// 粘贴识别:判断一段文字像不像用户本人写的记述。只是启发式,用来提醒,不替用户决定。
// 目的(v4.3):转载的文章、规章、网页、清单不该变成「这个人认为…」的人格素材;
// 命中时编辑器弹出选择「仅保存,不用于化身 / 仍用于化身」。

const FIRST_PERSON = /我|咱|俺|\bI\b|\bI['’]m\b|\bme\b|\bmy\b|私|僕|自分|나는|내가|나의|저는|제가/g;
const URL_RE = /https?:\/\/|www\./gi;
const LIST_LINE = /^\s*([-*•·▪]|\d+[.、)]|第[一二三四五六七八九十百\d]+[条款章节项]|[一二三四五六七八九十]+[、.])/;
const LEGAL_RE = /第[一二三四五六七八九十百\d]+[条款章]/g;
const WEB_NOISE =
  /(版权所有|保留所有权利|All rights reserved|Copyright|©|点击查看|阅读原文|转载自|来源:|來源:|免责声明|Terms of Service|Privacy Policy)/i;

export type PasteReason = 'links' | 'web' | 'list' | 'legal' | 'impersonal';

/** 像粘贴内容就返回原因,否则 null。短文本(不到 120 字)一律放行:即兴的短记录不该被打扰。 */
export function looksPasted(text: string): PasteReason | null {
  const t = text.trim();
  if (t.length < 120) return null;
  if ((t.match(URL_RE) ?? []).length >= 2) return 'links';
  if (WEB_NOISE.test(t)) return 'web';
  const lines = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 4 && lines.filter((l) => LIST_LINE.test(l)).length / lines.length >= 0.6) return 'list';
  if ((t.match(LEGAL_RE) ?? []).length >= 3) return 'legal';
  // 第一人称密度:日记几乎必然频繁出现「我」;一篇长文里几乎没有,多半是转述
  const firstPerson = (t.match(FIRST_PERSON) ?? []).length;
  if (t.length >= 300 && (firstPerson / t.length) * 100 < 0.25) return 'impersonal';
  return null;
}
