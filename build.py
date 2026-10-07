import re,os
H=open('app.html').read()
js=''.join(f'<script>\n{open(f).read()}\n</script>\n' for f in ['data.js','fonts.js','engine.js','pdfwriter.js','schemes.js','report.js','model.js','app.js'])
art=H+js
os.makedirs('dist',exist_ok=True)
open('dist/keo.html','w').write(art)
title=re.search(r'<title>.*?</title>',H).group(0)
body=H.replace(title,'')
sa=('<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+title+
    '<style>html{color-scheme:light}body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>\n'+body+js+'</body></html>\n')
open('dist/keo-standalone.html','w').write(sa)
print(len(art), len(sa))

os.makedirs('docs',exist_ok=True)
open('docs/index.html','w').write(sa)
