/** 通用小工具 */

export function createSorter(keyExtractor) {
  return (a, b) => {
    const ka = keyExtractor(a);
    const kb = keyExtractor(b);
    if (ka === kb) return 0;
    return ka < kb ? -1 : 1;
  };
}
