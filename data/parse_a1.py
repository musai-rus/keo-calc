import re, json
L=open('a1_raw.txt').read().split('\n')
headers_idx={}
known=['Банковские','Зрелищные','Санаторно','Объекты физкультурного','Предприятия общественного','Предприятия розничной','Организации санитарно','Гостиницы','Медицинские организации','Приемные и палатные','Лечебные отделения','Отделения консультативного','Лаборатории медицинских','Стерилизационные','Патологоанатомическое','Помещения пищеблоков','Аптеки','Центры гигиены','Объекты ветеринарной','Станции скорой','Молочные кухни','Вокзалы','Жилые здания','Вспомогательные здания','Прочие помещения общественных','Дошкольные образовательные','Общеобразовательные организации','Административные здания']
group='';sub=''
entries=[]; cur=None
def is_header(l):
    s=l.strip()
    return any(s.startswith(k) for k in known) and (len(l)-len(l.lstrip())>=2) and not re.match(r'^\d',s)
def toks(l): return re.split(r'\s{2,}',l.strip())
skip=False
for n,l in enumerate(L):
    s=l.strip()
    if n<2: continue
    if n==3: continue
    if is_header(l):
        if s.startswith('Медицинские организации'): group='Медицинские организации'; sub=''
        elif s.startswith(('Приемные','Лечебные','Отделения конс','Лаборатории мед','Стерилизац','Патологоанат','Помещения пищеблоков')) and group.startswith('Медицин'): sub=s
        elif s.startswith('Административные'): group='Административные здания, здания государственных учреждений, проектные и научные организации'; sub=''
        else: group=s; sub=''
        continue
    m=re.match(r'^\s{0,3}(\d{1,3}) (.+)$',l)
    tk=toks(l)
    if m:
        cur={'n':int(m.group(1)),'group':group,'sub':sub,'name':tk[0].split(' ',1)[1],'data':[],'raw':[l]}
        entries.append(cur)
        if len(tk)>=12: cur['data'].append(tk[1:])
        else: cur['plane_extra']=tk[1:]
        continue
    if cur is None: continue
    cur['raw'].append(l)
    ind=len(l)-len(l.lstrip())
    if len(tk)>=12:
        # sub data line; first token might be name continuation or plane
        if ind<=3:
            cur['data'].append(['@'+tk[0]]+tk[1:])
        else:
            cur['data'].append(tk)
    elif ind<=3:
        cur['name']+=' '+tk[0]
    # else plane continuation – ignore
json.dump(entries,open('a1_entries.json','w'),ensure_ascii=False,indent=0)
print(len(entries))
for e in entries:
    print(e['n'],'|',e['group'][:25],'|',e['sub'][:15],'|',e['name'][:60],'|',[d[-4:] for d in e['data']],[d[0] for d in e['data']])
