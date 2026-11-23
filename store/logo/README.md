# drip's logo

The drop and "drip" in a row, with "YouTube without the feed" centered under them, all in ink. The drop is the only blue. Jesse picked it on 2026-11-23 from two rounds of mockups (variant G).

| File | Use |
| --- | --- |
| `drip-logo.svg` | The logo, ink letters, for light backgrounds. |
| `drip-logo-light.svg` | The same with light letters, for dark backgrounds. |
| `drip-wordmark.svg` | The drop and "drip" without the line, for small sizes. |
| `drip-wordmark-light.svg` | The same with light letters. |

The letters are outlines of Inter (800 for the name, 700 for the line), so the files need no font. Inter is under the SIL Open Font License.

## Where it shows

- The store's small promo tile, `store/images-v5/tile.png`: the logo on pale blue (`#e5f1fc`) over the water strip.
- The five store screenshots: the wordmark above each headline, 34px high.
- The welcome page: the page's own drop icon beside `src/welcome/wordmark.svg`, a mask of the letters that takes the text color in both themes.

## Rebuild

`store/art/build-logo.py` writes all five files. It needs Inter's variable font and three Python packages.

```sh
python3 -m venv /tmp/logo-venv
/tmp/logo-venv/bin/pip install fonttools brotli uharfbuzz
/tmp/logo-venv/bin/python store/art/build-logo.py path/to/Inter-variable.woff2
```

The sizes are constants at the top of the script, in em of the wordmark. `src/welcome/welcome.css` repeats three of them (the gap, the drop's height, and the letters' box), so change both together. The script prints the letters' box.
