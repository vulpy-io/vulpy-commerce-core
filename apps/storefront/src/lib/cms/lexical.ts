export function lexicalFromParagraphs(paragraphs: string[]) {
  const children = paragraphs
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      type: "paragraph" as const,
      format: "",
      indent: 0,
      version: 1 as const,
      children: [
        {
          type: "text" as const,
          format: 0,
          detail: 0,
          mode: "normal" as const,
          style: "",
          text,
          version: 1 as const,
        },
      ],
      direction: "ltr" as const,
    }));

  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      children,
      direction: "ltr",
    },
  };
}
