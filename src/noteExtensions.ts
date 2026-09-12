import { Node, mergeAttributes } from "@tiptap/core";

export const PaperAnchorNode = Node.create({
  name: "paperAnchor",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      paperId: { default: "" },
      page: { default: 1 },
      sectionId: { default: "" },
      paragraphId: { default: "" },
      quote: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-paper-anchor]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const section = HTMLAttributes.sectionId
      ? ` · §${HTMLAttributes.sectionId}`
      : "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-paper-anchor": "true",
        class: "paper-anchor",
      }),
      `📎 P${HTMLAttributes.page}${section}`,
    ];
  },
});
