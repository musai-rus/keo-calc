"""Generate the href from one audited loader source, retaining public URLs."""
from pathlib import Path
import html
import re

root = Path(__file__).resolve().parent.parent
source = (root / 'bim/bookmarklet.js').read_text()
source = re.sub(r'/\*.*?\*/', '', source, flags=re.S).strip()
source = ' '.join(line.strip() for line in source.splitlines())
page = root / 'docs/bim.html'
text = page.read_text()
text, count = re.subn(r'(?<=class="bm" href=")[^"]*', lambda _: html.escape('javascript:' + source, quote=True), text)
if count != 1:
    raise RuntimeError('Expected exactly one public installation button')
page.write_text(text)
