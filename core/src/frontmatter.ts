export function serializeFrontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("Missing frontmatter block");
  }

  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(": ");
    if (separator === -1) continue;
    fields[line.slice(0, separator)] = line.slice(separator + 2);
  }

  return fields;
}
