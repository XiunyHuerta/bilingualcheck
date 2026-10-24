// Languages with standard display names; a recognized BCP-47 tag can also be entered.
export const UI_LANGUAGE_CODES = ["aa","ab","ae","af","ak","am","an","ar","as","av","ay","az","ba","be","bg","bh","bi","bm","bn","bo","br","bs","ca","ce","ch","co","cr","cs","cu","cv","cy","da","de","dv","dz","ee","el","en","eo","es","et","eu","fa","ff","fi","fil","fj","fo","fr","fy","ga","gd","gl","gn","gu","gv","ha","he","hi","ho","hr","ht","hu","hy","hz","ia","id","ie","ig","ii","ik","io","is","it","iu","ja","jv","ka","kg","ki","kj","kk","kl","km","kn","ko","kr","ks","ku","kv","kw","ky","la","lb","lg","li","ln","lo","lt","lu","lv","mg","mh","mi","mk","ml","mn","mr","ms","mt","my","na","nb","nd","ne","ng","nl","nn","no","nr","nv","ny","oc","oj","om","or","os","pa","pi","pl","ps","pt","qu","rm","rn","ro","ru","rw","sa","sc","sd","se","sg","si","sk","sl","sm","sn","so","sq","sr","sr-Latn","ss","st","su","sv","sw","ta","te","tg","th","ti","tk","tn","to","tr","ts","tt","tw","ty","ug","uk","ur","uz","ve","vi","vo","wa","wo","xh","yi","yo","za","zh","zu"] as const;
export const UI_TRANSLATION_VERSION = "2026-10-24-jury-flow-4";
export function recognizedUILanguage(input: string): string | null {
  if (input.length > 35 || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/.test(input)) return null;
  try {
    const tag = Intl.getCanonicalLocales(input)[0];
    if (!tag || !new Intl.DisplayNames(["en"], { type: "language", fallback: "none" }).of(tag)) return null;
    return tag;
  } catch { return null; }
}
export function isRTLUILanguage(tag: string) {
  return /^(ar|he|fa|ur|ps|sd|ug|yi|dv)(-|$)/i.test(tag) || /-(Arab|Hebr)(-|$)/i.test(tag);
}
