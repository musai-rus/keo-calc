import re, json
E=json.load(open('a1_entries.json'))
def toks(l): return re.split(r'\s{2,}',l.strip())
def ind(l): return len(l)-len(l.lstrip())
out=[]
num=lambda x: None if x in('-','') else float(x.replace(',','.'))
for e in E:
    raw=e['raw']
    # split into items
    items=[]; parent=[]; cur=None
    for k,l in enumerate(raw):
        if k==0:
            l2=re.sub(r'^\s*\d{1,3} ','  ',l,count=1)
            cur={'name':[],'data':[]}; items.append(cur)
            l=' '+l2.strip() if True else l
            first=True
        if k>0 and re.match(r'^\s{0,3}[а-я]\) ',l):
            cur={'name':[],'data':[],'sub':True}; items.append(cur)
        tk=toks(l)
        if ind(l)<=3 or k==0:
            nm=tk[0]; rest=tk[1:]
        else:
            nm=None; rest=tk
        if nm: cur['name'].append(nm)
        if len(rest)>=11: cur['data'].append(rest)
    parent_title=' '.join(items[0]['name']) if items[0]['data']==[] and len(items)>1 else None
    for it in items:
        if not it['data']: continue
        name=' '.join(it['name'])
        name=re.sub(r'- (?=[а-я])','-',name) if False else name
        if it.get('sub') and parent_title: name=parent_title.rstrip(':')+' — '+name
        # choose data line with KEO
        best=None
        for d in it['data']:
            k=[num(x) if re.match(r'^\d+,\d+$|^-$',x) else None for x in d[-4:]]
            if best is None or (any(v is not None for v in k) and not any(v is not None for v in best[1])): best=(d,k)
        d,k=best
        plane=d[0]
        m=re.match(r'([ГВ])\s*-?\s*(\d,\d)?',plane)
        out.append({'n':e['n'],'group':e['group'],'sub':e['sub'],'name':name,'plane':plane,
                    'orient':m.group(1) if m else '?','h':num(m.group(2)) if m and m.group(2) else (0.0 if plane.startswith('Г') else None),
                    'keo':k})
json.dump(out,open('a1_items.json','w'),ensure_ascii=False,indent=0)
for o in out:
    if any(v is not None for v in o['keo']): print(o['n'],o['name'][:80],'|',o['plane'],o['orient'],o['h'],o['keo'])
