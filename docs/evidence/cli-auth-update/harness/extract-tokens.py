#!/usr/bin/env python3
"""
Extracts the official DSH light/dark design tokens for the #3178 harness.

The tokens live in the installed app's theme package as a CSS string:
  @deepseek-ai/dsh-client-ui-theme/lib/client.js

Two DIFFERENT `body{}` rules are needed per theme, and merging them is the whole
point of this script:

  1. the static palette (`--dsw-static-*`, from design-platform.css)
  2. the alias layer   (`--dsw-alias-*`, values are `var(--dsw-static-*)`)

Taking only the alias rule leaves every `var()` dangling, so tokens such as
`--dsw-alias-bg-layer-2` resolve to the empty string and the component renders
with no backgrounds. The dark theme is the same pair under
`body[data-ds-dark-theme]`.

Rules whose selector text is polluted by the surrounding JS (e.g.
`... = "body`) are normalized by keeping the text after the last quote.

Usage: python3 extract-tokens.py [path/to/theme/client.js]
"""
import os
import re
import sys

DEFAULT_SRC = (
    "/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/"
    "@deepseek-ai/dsh-client-ui-theme/lib/client.js"
)

LIGHT = "body"
DARK = "body[data-ds-dark-theme]"

# The bundled primitives ship a reset that sets a large block of `--dsw-*`
# tokens to `unset` on body and on `.rt-reset` elements. For a custom property
# `unset` means inherit, so every consumer ends up reading the value that is
# live on <html>. The light theme is therefore emitted on `:root, body` and not
# on `body` alone, otherwise tokens such as `--dsw-alias-bg-base` resolve to the
# empty string and dark-on-dark text appears (invisible active tab label).
LIGHT_SELECTOR = ":root, body"

# A declaration is a definition (`--x:`) rather than a reference (`var(--x)`).
DEF_RE = re.compile(r"--dsw-(static|alias)-[a-z0-9-]+\s*:")


def defs(body: str, kind: str) -> int:
    return len(re.findall(rf"--dsw-{kind}-[a-z0-9-]+\s*:", body))


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(here, "tokens.css")

    css = open(src, encoding="utf-8").read()

    # theme -> kind -> largest body found
    found: dict[str, dict[str, str]] = {
        LIGHT: {"static": "", "alias": ""},
        DARK: {"static": "", "alias": ""},
    }

    for m in re.finditer(r"([^{}]{1,120})\{([^{}]*)\}", css):
        # Normalize selectors polluted by the surrounding JS source.
        selector = m.group(1).split('"')[-1].strip()
        if selector not in found:
            continue
        body = m.group(2)
        for kind in ("static", "alias"):
            if defs(body, kind) > defs(found[selector][kind], kind):
                found[selector][kind] = body

    blocks = []
    for theme in (LIGHT, DARK):
        static_body, alias_body = found[theme]["static"], found[theme]["alias"]
        if not static_body or not alias_body:
            raise SystemExit(
                f"incomplete token set for {theme!r}: "
                f"static={defs(static_body, 'static')} alias={defs(alias_body, 'alias')}"
            )
        print(
            f"{theme}: static={defs(static_body, 'static'):3d} defs, "
            f"alias={defs(alias_body, 'alias'):3d} defs"
        )
        selector = LIGHT_SELECTOR if theme == LIGHT else theme
        blocks.append(f"{selector} {{{static_body}{alias_body}}}")

    header = (
        "/* Official DSH design tokens, extracted verbatim from\n"
        "   @deepseek-ai/dsh-client-ui-theme/lib/client.js (installed app).\n"
        "   The static palette rule and the alias rule are merged per theme: the\n"
        "   alias values are var(--dsw-static-*), so both layers are required.\n"
        "   Harness-only copy: gives the real component its real design tokens.\n"
        "   Regenerate with: python3 extract-tokens.py */\n"
    )
    out = header + "\n".join(blocks) + "\n"
    open(out_path, "w", encoding="utf-8").write(out)
    print(f"wrote {out_path} ({len(out)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
