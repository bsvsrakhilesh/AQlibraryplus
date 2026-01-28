import { JSDOM, VirtualConsole } from "jsdom";

// JSDOM parses <style> blocks with a strict CSS parser.
// Many sites embed SCSS / invalid CSS (e.g., @include, $vars, nested rules) inside <style>,
// which triggers noisy "Could not parse CSS stylesheet" errors and can disrupt parsing.

const STYLE_BLOCK_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;

function shouldDropStyleBlock(styleBlock: string) {
  const lower = styleBlock.toLowerCase();

  // Common SCSS/LESS tokens that are invalid in raw CSS.
  if (lower.includes("@include") || lower.includes("@mixin") || lower.includes("$")) return true;

  // Nested rules are common in preprocessors and often break the CSS parser.
  // Example: `.x { ... iframe { ... @media(...) { ... } } }`
  if (/\biframe\s*\{/.test(styleBlock) && /@media\s*\(/i.test(styleBlock)) return true;

  return false;
}

export function createDom(html: string, url: string): JSDOM {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (err) => {
    const msg = String((err as any)?.message || err);
    if (msg.includes("Could not parse CSS stylesheet")) return;
    console.error(err); // keep other jsdom errors visible
  });

  const cleanedHtml = html.replace(STYLE_BLOCK_RE, (block) =>
    shouldDropStyleBlock(block) ? "" : block
  );

  return new JSDOM(cleanedHtml, { url, virtualConsole });
}
