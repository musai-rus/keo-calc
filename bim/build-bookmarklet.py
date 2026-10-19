"""Generate the href from one audited loader source, retaining public URLs."""
from pathlib import Path
import html
import re
import json
import subprocess

root = Path(__file__).resolve().parent.parent
source = (root / 'bim/bookmarklet.js').read_text(encoding='utf-8')
source = re.sub(r'/\*.*?\*/', '', source, flags=re.S).strip()
source = ' '.join(line.strip() for line in source.splitlines())
page = root / 'docs/bim.html'
text = page.read_text(encoding='utf-8')
text, count = re.subn(r'(?<=class="bm" href=")[^"]*', lambda _: html.escape('javascript:' + source + '({});', quote=True), text)
if count != 1:
    raise RuntimeError('Expected exactly one public installation button')
regions = json.loads(subprocess.check_output(
    ['node', '-p', "JSON.stringify(require('./data.js').regions)"], cwd=root, encoding='utf-8'))
options = '\n'.join('<option value="{}">{} — группа {}</option>'.format(
    html.escape(r['name'], quote=True), html.escape(r['name']), r['g']) for r in regions)
setup = (root / 'bim/bookmarklet-setup.js').read_text(encoding='utf-8')
setup = setup.replace('/* KEO_LOADER */ null', json.dumps(source, ensure_ascii=False).replace('<', '\\u003c'))
for name, value in [('REGION_OPTIONS', options), ('BOOKMARKLET_SETUP', '<script>\n' + setup + '\n</script>')]:
    pattern = r'(<!-- KEO_' + name + r' -->).*?(<!-- /KEO_' + name + r' -->)'
    text, count = re.subn(pattern, lambda m: m[1] + '\n' + value + '\n' + m[2], text, flags=re.S)
    if count != 1:
        raise RuntimeError('Expected one ' + name + ' block')
page.write_text(text, encoding='utf-8')
