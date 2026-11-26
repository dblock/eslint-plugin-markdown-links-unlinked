import { Parser } from "htmlparser2";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";

const FRONTMATTER = ["yaml", "toml"];

const parseOptions = {
  extensions: [gfm(), frontmatter(FRONTMATTER)],
  mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(FRONTMATTER)],
};

/**
 * Returns the destinations of links a reader can follow from a Markdown document: inline links,
 * link references that resolve to a definition, and HTML `<a href>` anchors. Images, image
 * references, and unused definitions are not links.
 * @param {string} text Markdown source.
 * @returns {string[]} Link destinations in document order.
 */
export function extractLinks(text) {
  const tree = fromMarkdown(text, parseOptions);
  const destinations = [];
  const definitions = new Map();
  const references = [];
  const html = [];

  const visit = (node) => {
    switch (node.type) {
      case "link":
        destinations.push(node.url);
        break;
      case "linkReference":
        references.push(node.identifier);
        break;
      case "definition":
        if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
        break;
      case "html":
        html.push(node.value);
        break;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);

  for (const identifier of references) destinations.push(definitions.get(identifier));
  for (const value of html) destinations.push(...extractAnchors(value));
  return destinations;
}

/**
 * Returns the `href` values of `<a>` elements in an HTML fragment.
 * @param {string} value HTML source.
 * @returns {string[]} Anchor destinations.
 */
function extractAnchors(value) {
  const hrefs = [];
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "a" && typeof attributes.href === "string") hrefs.push(attributes.href);
    },
  });
  parser.write(value);
  parser.end();
  return hrefs;
}
