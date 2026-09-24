export function vietnamesePhones(text: string): string[] {
  const matches = text.match(/(?<![\d\p{L}])(?:\+84|84|0)(?:[ .-]*\d){9}(?![\d\p{L}])/gu) ?? []
  return [...new Set(matches
    .map(value => value.replace(/[ .-]/g, '').replace(/^\+?84/, '0'))
    .filter(value => /^0[35789]\d{8}$/.test(value)))]
}
