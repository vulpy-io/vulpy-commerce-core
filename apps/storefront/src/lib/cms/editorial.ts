interface LexicalNode {
    type?: string;
    children?: LexicalNode[];
    text?: string 
}

export function isHomeEditorialBlock(context?: string, index?: number): boolean {
  return context === "home" && index === 3;
}

export function lexicalParagraphs(content: unknown): string[] {
  const root = (content as { root?: LexicalNode })?.root;
  return (root?.children ?? [])
    .filter((node) => node.type === "paragraph")
    .map((node) => (node.children ?? []).map((child) => child.text ?? "").join("").trim())
    .filter(Boolean);
}

export function splitEditorialContent(content: unknown): { heading: string; body: string[] } {
  const [heading = "", ...body] = lexicalParagraphs(content);
  return { heading, body };
}

export function dropFirstParagraph(content: unknown): unknown {
  const doc = content as { root?: { children?: LexicalNode[]; [key: string]: unknown } };
  const children = doc?.root?.children;
  if (!Array.isArray(children) || children[0]?.type !== "paragraph") { return content; }
  return { ...doc, root: { ...doc.root, children: children.slice(1) } };
}
