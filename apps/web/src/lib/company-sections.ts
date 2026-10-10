/** Company documents use plain-text ATX level-two headings, outside fenced code. */
export function getCompanySections(content: string) {
  const sections: { id: string; title: string }[] = [];
  let fence: { marker: string; length: number } | null = null;

  content.split('\n').forEach((line, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { marker: marker[0]!, length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length) fence = null;
      return;
    }
    if (fence) return;
    const title = /^ {0,3}##[\t ]+(.+?)(?:[\t ]+#+[\t ]*)?$/.exec(line)?.[1]?.trim();
    if (title) sections.push({ id: `section-${index + 1}`, title });
  });
  return sections;
}
