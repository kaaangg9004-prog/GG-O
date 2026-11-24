export function highlightHashtags(value: string, editingOffset: number | null) {
  return Array.from(value.matchAll(/[^\s,]+|[\s,]+/g), match => {
    const start = match.index;
    const end = start + match[0].length;
    const delimiter = /^[\s,]/.test(match[0]);
    const editing = editingOffset !== null && editingOffset >= start && editingOffset <= end;
    return {
      text: match[0],
      complete: !delimiter && /[^#]/.test(match[0]) && end < value.length && !editing,
    };
  });
}
