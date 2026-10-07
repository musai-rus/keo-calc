/* Состояние → входные данные расчёта → результат → модель отчёта. Без DOM. */
const KEO = (function () {
  const f = Report.f, R = Engine;
  const round2 = x => Math.round(x * 100 + 1e-9) / 100;
  const ORIENTS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  const ORIENT_NAME = { 'С': 'север', 'СВ': 'северо-восток', 'В': 'восток', 'ЮВ': 'юго-восток', 'Ю': 'юг', 'ЮЗ': 'юго-запад', 'З': 'запад', 'СЗ': 'северо-запад' };
  const RT_TEXT = {
    center: 'в центре помещения',
    far1: 'на расстоянии 1 м от стены, наиболее удалённой от световых проёмов',
    'far1.2': 'на расстоянии 1,2 м от стены, наиболее удалённой от световых проёмов',
    manual: 'задано вручную'
  };
  const RT_REF = { center: 'п. 5.3 ж) СП 52.13330.2016', far1: 'п. 5.3 а), в), д) СП 52.13330.2016', 'far1.2': 'п. 5.3 г) СП 52.13330.2016', manual: '—' };
  const K_TITLES = { none: 'Нет', balcony: 'Балкон над/перед окном', loggia: 'Лоджия', canopy: 'Горизонтальный козырёк', screen: 'Вертикальный экран' };

  function defaultWindow(s) { return { hpd: 0.8, ho: 1.8, bo: 1.5, s: s || 0, t2o: null, tau0o: null, Ko: null }; }
  function defaultWall(orient) {
    return { orient: orient || 'Ю', dp: 6.0, bp: 6.0, H: 3.0, dst: 0.5, lt: 3.0, ds: 0, t1: 0, t1c: null, t2: 0, t4: 0, t5: 1, kType: 'none', kDepth: 1.5, windows: [defaultWindow(-1.4), defaultWindow(1.4)], buildings: [] };
  }
  function defaultType() { return { name: 'Фонарь 1', shape: 'round', av: 1.5, bv: 1.5, an: 1.5, bn: 1.5, dv: 1.5, dn: 1.5, hsf: 1.0, refl: 'diffuse', rhoW: 0.7, t1: 0.48, t2: 0.75, t3: 1, t4: 1, net: false, tilt: 0, lanterns: [{ x: 3, y: 3 }] }; }

  const B2_KINDS = [['rect', 'Прямоугольный (П-образный)'], ['trap', 'Трапециевидный'], ['A', 'А-образный'], ['shedV', 'Шед с вертикальным остеклением'], ['shedI', 'Шед с наклонным остеклением'], ['plane', 'Проём в плоскости покрытия']];
  const CN_ROWS = [['С-Ю', 'Прямоуг./трапец.: остекление на С и Ю'], ['СВ-ЮЗ', 'Прямоуг./трапец.: на СВ–ЮЗ или ЮВ–СЗ'], ['В-З', 'Прямоуг./трапец.: на В и З'], ['shed', 'Шед, остекление на С'], ['zenith', 'Горизонтальные (как зенитные)']];
  const cnRowDefault = kind => kind === 'plane' ? 'zenith' : (kind === 'shedV' || kind === 'shedI') ? 'shed' : 'С-Ю';
  function defaultB2Type() { return { name: 'Фонарь 1', kind: 'rect', b: 3, hst: 0.6, ho: 1.8, beta: 60, face: 'R', ystart: 0, ylen: null, pieces: 1, pitch: 0, t1: 0.8, t2: 0.9, t3: 1, t4: 1, net: false, CNrow: 'С-Ю', xs: [4] }; }

  function defaultState() {
    return {
      v: 1, mode: 'side',
      meta: { code: '', object: '', room: '', author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 },
      region: 'г. Москва', group: 1, groupManual: false,
      bType: 'Административные здания, здания государственных учреждений, проектные и научные организации', roomId: 'A1',
      lightSys: 'ЕО', normManual: null, hpManual: null, rtManual: null,
      env: 'normal', glassMult: 1, rho: 0.55,
      rhoCalc: { on: false, s: [[30, 0.3], [60, 0.7], [30, 0.8], [6, 0.2]] },
      side: { walls: [defaultWall('Ю')] },
      top: { sys: 'shaft', L: 8, B: 6, H: 4.2, spans: 1, l1: null, y0: null, nPts: 0, types: [defaultType()], b2: [defaultB2Type()] },
      comb: { wallSide: 'x0' }
    };
  }

  function room(st) { return DATA.rooms.find(r => r.id === st.roomId) || null; }
  function groupOf(st) { if (st.groupManual) return st.group; const r = DATA.regions.find(x => x.name === st.region); return r ? r.g : st.group; }
  function normOf(st) {
    const r = room(st); const isTop = st.mode !== 'side';
    const col = isTop ? (st.lightSys === 'ЕО' ? 'eTopN' : 'eTopC') : (st.lightSys === 'ЕО' ? 'eSideN' : 'eSideC');
    const v = st.normManual !== null && st.normManual !== '' && !isNaN(st.normManual) ? +st.normManual : (r ? r[col] : null);
    const colName = (isTop ? 'при верхнем или комбинированном' : 'при боковом') + ' ' + (st.lightSys === 'ЕО' ? 'естественном' : 'совмещённом') + ' освещении';
    return { v, manual: st.normManual !== null && st.normManual !== '', colName, room: r, src: r ? `СП 367.1325800.2025, табл. А.1, п. ${r.n} (= СП 52.13330.2016, табл. Л.1)` : '—' };
  }
  function hpOf(st) { const r = room(st); if (st.hpManual !== null && st.hpManual !== '' && !isNaN(st.hpManual)) return +st.hpManual; return r && r.h !== null ? r.h : 0.8; }
  function rtOf(st) {
    if (st.rtManual) return st.rtManual;
    if (st.mode === 'side' && st.side.walls.length > 1) return 'center';
    const r = room(st); return r ? r.rt : 'center';
  }
  function ltAuto(rule, dp) { return rule === 'far1' ? dp - 1 : rule === 'far1.2' ? dp - 1.2 : dp / 2; }
  function mfOf(st, angleIdx) { return R.MF(st.env, angleIdx, st.glassMult).v; }
  function tau1Wall(w) { return w.t1c !== null && w.t1c !== '' && !isNaN(w.t1c) ? +w.t1c : DATA.tau1[w.t1].v; }

  /* ---------- входные данные для движка ---------- */
  function sideInput(st, overrides) {
    const g = groupOf(st), hp = hpOf(st), rule = rtOf(st);
    const walls = st.side.walls.map(w => {
      const lt = rule === 'manual' ? +w.lt : ltAuto(rule, +w.dp);
      const t1 = tau1Wall(w), t2 = DATA.tau2[w.t2].v, t4 = DATA.tau4[w.t4].v;
      return {
        orient: w.orient, bp: +w.bp, dp: +w.dp, H: +w.H, lt, ds: +w.ds || 0, dst: +w.dst, kPos: rule === 'center' ? 'center' : 'wall1',
        MF: mfOf(st, 3),
        windows: w.windows.map(x => ({ hpd: +x.hpd, ho: +x.ho, bo: +x.bo, s: +x.s, t1, t2: x.t2o ? +x.t2o : t2, t4, t5: +w.t5 || 1, tau0: x.tau0o ? +x.tau0o : undefined, K: x.Ko ? +x.Ko : (w.kType === 'none' ? 1 : undefined), kType: w.kType, kDepth: +w.kDepth })),
        buildings: w.buildings.map(b => ({ l: +b.l, Hp: +b.Hp, a: +b.a, off: +b.off || 0, rhoF: +b.rhoF })),
        ...(overrides || {})
      };
    });
    return { group: g, rho: +st.rho, hp, MF: mfOf(st, 3), walls };
  }
  function topPoints(st) {
    const T = st.top, L = +T.L, B = +T.B, y0 = T.y0 !== null && T.y0 !== '' ? +T.y0 : B / 2;
    let N = +T.nPts || (L > 4 ? 5 : 3);
    const x1 = Math.min(1, L / 2), x2 = Math.max(L - 1, L / 2);
    return Array.from({ length: N }, (_, j) => ({ x: N === 1 ? L / 2 : x1 + (x2 - x1) * j / (N - 1), y: y0 }));
  }
  function topInput(st) {
    const T = st.top, g = groupOf(st);
    return {
      group: g, rho: +st.rho, H: +T.H, hurp: hpOf(st), spans: +T.spans || 1, l1: T.l1 ? +T.l1 : +T.B,
      points: topPoints(st),
      types: T.types.map(t => ({
        name: t.name, shape: t.shape, av: +t.av, bv: +t.bv, an: +t.an, bn: +t.bn, dv: +t.dv, dn: +t.dn, hsf: +t.hsf, refl: t.refl, rhoW: +t.rhoW,
        t1: +t.t1, t2: +t.t2, t3: +t.t3, t4: +t.t4, t5: t.net ? 0.9 : 1, MF: mfOf(st, +t.tilt || 0), Kc: t.KcManual ? +t.KcManual : undefined,
        lanterns: t.lanterns.map(l => ({ x: +l.x, y: +l.y }))
      }))
    };
  }

  function b2Input(st) {
    const T = st.top, g = groupOf(st), B = +T.B, L = +T.L, spans = +T.spans || 1;
    return {
      group: g, rho: +st.rho, L, W: B, Hk: +T.H, hurp: hpOf(st), spans, l1: T.l1 ? +T.l1 : L / spans,
      y0: T.y0 !== null && T.y0 !== '' ? +T.y0 : B / 2, points: topPoints(st),
      types: (T.b2 || []).map(t => {
        const tt = { name: t.name, kind: t.kind, b: +t.b, hst: +t.hst || 0, ho: t.kind === 'A' ? (+t.b / 2) * Math.tan(+t.beta * Math.PI / 180) : +t.ho, beta: +t.beta, face: t.face || 'R',
          ystart: +t.ystart || 0, ylen: t.ylen ? +t.ylen : B - (+t.ystart || 0), pieces: Math.max(1, Math.round(+t.pieces || 1)), pitch: +t.pitch || 0,
          t1: +t.t1, t2: +t.t2, t3: +t.t3 || 1, t4: +t.t4 || 1, t5: t.net ? 0.9 : 1, CNrow: t.CNrow || cnRowDefault(t.kind), xs: t.xs.map(Number) };
        tt.MF = mfOf(st, R.tiltIdx(tt)); return tt;
      })
    };
  }
  const isB2 = st => st.mode !== 'side' && st.top.sys === 'b2';

  /* ---------- проверки ---------- */
  function validate(st) {
    const err = [], warn = [];
    const pos = (v, n) => { if (!(+v > 0)) err.push(`${n}: нужно положительное число`); };
    if (st.mode !== 'top') {
      const walls = st.mode === 'comb' ? st.side.walls.slice(0, 1) : st.side.walls;
      walls.forEach((w, wi) => {
        const pre = walls.length > 1 ? `Стена ${wi + 1}. ` : '';
        if (st.mode === 'side') { pos(w.dp, pre + 'Глубина помещения dп'); pos(w.bp, pre + 'Ширина помещения bп'); }
        if (!(+w.dst >= 0)) err.push(pre + 'Толщина стены Δст должна быть ≥ 0');
        if (!w.windows.length) err.push(pre + 'Добавьте хотя бы один световой проём');
        w.windows.forEach((x, i) => { if (!(+x.ho > 0 && +x.bo > 0 && +x.hpd >= 0)) err.push(`${pre}Окно ${i + 1}: проверьте hпд, hо, bо`); });
        if (st.mode === 'side') {
          w.windows.forEach((x, i) => { if (Math.abs(+x.s) + x.bo / 2 > w.bp / 2 + 0.02) warn.push(`${pre}Окно ${i + 1} выходит за пределы ширины помещения bп — проверьте смещение s.`); });
          const rule = rtOf(st), lt = rule === 'manual' ? +w.lt : ltAuto(rule, +w.dp);
          if (!(lt > 0) || lt >= +w.dp + 1e-9) err.push(pre + 'Расчётная точка должна лежать внутри помещения: 0 < lт < dп');
        }
        w.buildings.forEach((b, i) => { if (!(+b.l > 0 && +b.Hp > 0 && +b.a > 0)) err.push(`${pre}Здание ${i + 1}: укажите l, Hр и a больше нуля`); });
      });
    }
    if (st.mode !== 'side') {
      const T = st.top; pos(T.L, 'Длина помещения L'); pos(T.B, 'Ширина помещения B'); pos(T.H, 'Высота помещения H');
      if (+T.H <= hpOf(st)) err.push('Высота помещения H должна быть больше высоты рабочей поверхности');
      if (T.sys === 'b2') {
        (T.b2 || []).forEach((t, i) => {
          const pre = `Фонарь «${t.name || i + 1}»: `;
          if (!t.xs.length) err.push(pre + 'укажите положение хотя бы одного фонаря на разрезе');
          pos(t.b, pre + 'ширина проёма b'); if (t.kind !== 'A') pos(t.ho, pre + 'высота остекления hо');
          if (['trap', 'A', 'shedI'].includes(t.kind) && !(+t.beta > 0 && +t.beta < 90)) err.push(pre + 'угол наклона остекления β должен быть от 0 до 90°');
          if (t.kind === 'trap' && +t.ho / Math.tan(+t.beta * Math.PI / 180) >= +t.b / 2) err.push(pre + 'при таком β и hо скаты трапеции сходятся — уменьшите hо или увеличьте β (или выберите А-образный)');
          if (t.kind === 'shedI' && +t.ho / Math.tan(+t.beta * Math.PI / 180) >= +t.b) err.push(pre + 'наклонное остекление шеда шире проёма — проверьте b, hо, β');
          t.xs.forEach((x, k) => { if (+x - t.b / 2 < -1e-6 || +x + t.b / 2 > +T.L + 1e-6) err.push(`${pre}фонарь ${k + 1} выходит за пределы помещения по разрезу`); });
          const ylen = t.ylen ? +t.ylen : +T.B - (+t.ystart || 0), n = Math.max(1, Math.round(+t.pieces || 1));
          if (!(ylen > 0)) err.push(pre + 'длина фонаря вдоль оси должна быть больше нуля');
          if ((+t.ystart || 0) + (n - 1) * (+t.pitch || 0) + ylen > +T.B + 1e-6) warn.push(pre + 'фонарь по длине выходит за пределы помещения B — проверьте начало, длину и шаг.');
          if (n > 1 && +t.pitch < ylen) err.push(pre + 'шаг штучных проёмов меньше их длины');
        });
        const all = []; (T.b2 || []).forEach(t => t.xs.forEach(x => all.push([+x - t.b / 2, +x + t.b / 2])));
        all.sort((a, b) => a[0] - b[0]); for (let i = 1; i < all.length; i++) if (all[i][0] < all[i - 1][1] - 1e-6) { err.push('Фонари перекрываются на разрезе — проверьте координаты осей'); break; }
      } else T.types.forEach((t, i) => {
        if (!t.lanterns.length) err.push(`Тип фонаря ${i + 1}: добавьте хотя бы один фонарь`);
        pos(t.hsf, `Тип ${i + 1}: высота шахты hс.ф`);
        if (t.shape === 'round') { pos(t.dv, `Тип ${i + 1}: диаметр верхнего отверстия`); pos(t.dn, `Тип ${i + 1}: диаметр нижнего отверстия`); }
        else { ['av', 'bv', 'an', 'bn'].forEach(k => pos(t[k], `Тип ${i + 1}: размеры отверстий`)); }
      });
      if (+T.L > 4 && T.nPts && +T.nPts < 5) warn.push('При размере помещения по характерному разрезу более 4 м число расчётных точек должно быть не менее пяти (п. 8.5.2 СП 367).');
    }
    return { err: [...new Set(err)], warn };
  }

  /* ---------- расчёт ---------- */
  function compute(st) {
    const v = validate(st); if (v.err.length) return { ok: false, ...v };
    const norm = normOf(st), g = groupOf(st), warn = [...v.warn];
    let res;
    if (st.mode === 'side') {
      res = R.side(sideInput(st));
      res.walls.forEach((w, i) => {
        const pre = res.walls.length > 1 ? `Стена ${i + 1}: ` : '';
        w.r0info.notes.forEach(n => warn.push(pre + 'r0 — ' + n));
        w.blds.forEach((b, j) => [...b.bfNotes, ...b.kzd0Notes].forEach(n => warn.push(`${pre}здание ${j + 1} — ${n}`)));
        const hu = st.side.walls[i]; const top = Math.max(...hu.windows.map(x => +x.hpd + +x.ho));
        if (+hu.dp / (top - (w.onFloor ? 0.8 : st.hpManual ?? hpOf(st))) > 8) warn.push(pre + 'Отношение глубины помещения к высоте верхней грани проёма над УРП больше 8 — боковое освещение не рекомендуется (п. 6.4 СП 367).');
        if (norm.room && norm.room.g === 'Жилые здания' && +hu.dp / top > 2.5) warn.push(pre + 'Для жилых помещений dп/h02 не должно превышать 2,5 (п. 9.1.1 СП 367).');
      });
      res.eFinal = res.eR;
    } else if (st.mode === 'top' && isB2(st)) {
      res = R.lanternsB2(b2Input(st));
      res.types.forEach(T => T.r2info.notes.forEach(n => warn.push(`«${T.t.name}»: r2 — ${n}`)));
      res.eFinal = res.eAvgR;
    } else if (st.mode === 'top') {
      res = R.top(topInput(st));
      res.types.forEach((T, i) => T.kc.notes.forEach(n => warn.push(`Тип ${i + 1}: Kс — ${n}`)));
      res.r2info.notes.forEach(n => warn.push('r2 — ' + n));
      res.eFinal = res.eAvgR;
    } else {
      const b2 = isB2(st), ti = b2 ? b2Input(st) : topInput(st); const T = st.top;
      const w0 = st.side.walls[0];
      const si = sideInput(st, { dp: +T.L, bp: +T.B });
      si.walls = si.walls.slice(0, 1);
      res = R.combined({ topKind: b2 ? 'b2' : 'shaft', top: ti, side: si, sideMap: { axis: 'x', wallAt: st.comb.wallSide === 'xL' ? +T.L : 0, axisCoord: ti.points[0].y } });
      if (!b2) res.top.types.forEach((Tt, i) => Tt.kc.notes.forEach(n => warn.push(`Тип ${i + 1}: Kс — ${n}`)));
      res.eFinal = res.eAvgR;
      void w0;
    }
    if (st.mode !== 'side' && !isB2(st)) {
      const T = st.top; const area = T.types.reduce((s, t) => s + t.lanterns.length * (t.shape === 'round' ? Math.PI * t.dv * t.dv / 4 : t.av * t.bv), 0);
      if (area / (T.L * T.B) > 0.2) warn.push(`Суммарная площадь фонарей ${f(100 * area / (T.L * T.B), 1)} % площади пола — больше 20 % (п. 9.4.3 СП 367).`);
    }
    const uniOk = st.mode === 'side' ? true : (res.uni >= 1 / 3 - 1e-9);
    const normOk = norm.v === null || norm.v === undefined ? null : res.eFinal >= norm.v - 1e-9;
    return { ok: true, res, norm, group: g, warn: [...new Set(warn)], uniOk, pass: normOk === null ? null : (normOk && uniOk), normOk };
  }

  /* ---------- модель отчёта ---------- */
  function buildModel(st, C) {
    const M = []; const r = C.res, n = C.norm, g = C.group;
    const modeName = { side: 'боковое естественное освещение', top: isB2(st) ? 'верхнее освещение (фонари-надстройки, проёмы в покрытии)' : 'верхнее освещение (зенитные / шахтные фонари)', comb: 'комбинированное освещение (верхнее + боковое)' }[st.mode];
    const roomTitle = [st.meta.room, n.room ? n.room.name : ''].filter(Boolean).join('. ');
    M.push({ type: 'h1', text: 'Расчёт коэффициента естественной освещённости', sub: [st.meta.object, roomTitle].filter(Boolean).join(' · ') });
    const eLbl = st.mode === 'side' ? 'e_{р}^{б}' : 'e_{ср}';
    M.push({ type: 'verdict', ok: !!C.pass, left: `${st.mode === 'side' ? 'Расчётный КЕО' : 'Среднее значение КЕО'} ${eLbl} = ${f(r.eFinal)} %;   нормируемый e_{н} = ${n.v === null ? '—' : f(n.v)} %`, left2: st.mode === 'side' ? `Условие: e_{р} ≥ e_{н} — ${C.normOk ? 'выполняется' : 'не выполняется'}` : `Равномерность e_{min} : e_{ср} = 1 : ${f(r.uniInv)} (норма не более 1 : 3) — ${C.uniOk ? 'выполняется' : 'не выполняется'}` });

    // 1. исходные
    M.push({ type: 'h2', text: '1. Нормативные требования' });
    const rt = rtOf(st);
    M.push({ type: 'kv', rows: [
      ['Место строительства', '', st.groupManual ? '—' : st.region, `Группа административного района N = ${g} (СП 52.13330.2016, прил. Е)`],
      ['Назначение помещения', '', n.room ? `п. ${n.room.n}` : '—', n.room ? `${n.room.name} (${n.room.g})` : 'задано вручную'],
      ['Система освещения', '', st.lightSys === 'ЕО' ? 'естественное' : 'совмещённое', modeName],
      ['Нормируемое значение КЕО', 'e_{н}', n.v === null ? 'не нормир.' : f(n.v) + ' %', n.manual ? 'задано вручную' : `${n.src}; графа «${n.colName}»`],
      ['Высота расчётной поверхности', 'hр', f(hpOf(st)) + ' м', st.hpManual !== null && st.hpManual !== '' ? 'задано вручную' : 'плоскость нормирования по табл. А.1'],
      ...(st.mode === 'side' ? [['Положение расчётной точки', '', '', `${RT_TEXT[rt]} (${RT_REF[rt]})`]] : [['Расчётные точки', 'N', String(r.e ? r.e.length : ''), 'на пересечении характерного разреза и УРП, первая и последняя — в 1 м от стен (п. 5.5 СП 52.13330.2016, п. 8.5.2 СП 367)']]),
      ['Средневзвешенный коэффициент отражения', 'ρ_{ср}', f(st.rho), st.rhoCalc.on ? 'по формуле (3.6) СП 367' : 'п. 5.10 СП 52.13330.2016 (для жилых и общественных — 0,55)']
    ] });

    if (st.mode === 'side') sideModel(M, st, C, r);
    else if (st.mode === 'top' && isB2(st)) b2Model(M, st, C, r);
    else if (st.mode === 'top') topModel(M, st, C, r);
    else combModel(M, st, C, r);

    // заключение
    M.push({ type: 'h2', text: 'Заключение' });
    const concl = st.mode === 'side'
      ? `Расчётное значение КЕО в расчётной точке eр = ${f(r.eFinal)} % ${C.normOk ? '≥' : '<'} нормируемого eн = ${n.v === null ? '—' : f(n.v)} %. Требования СП 52.13330.2016 и СП 367.1325800.2025 к естественному освещению помещения ${C.pass ? 'выполняются' : 'не выполняются'}.`
      : `Среднее значение КЕО eср = ${f(r.eFinal)} % ${C.normOk ? '≥' : '<'} нормируемого eн = ${n.v === null ? '—' : f(n.v)} %; равномерность 1 : ${f(r.uniInv)} ${C.uniOk ? '(не более 1 : 3)' : '(хуже 1 : 3)'}. Требования к ${st.mode === 'top' ? 'верхнему' : 'комбинированному'} естественному освещению ${C.pass ? 'выполняются' : 'не выполняются'}.`;
    M.push({ type: 'p', text: concl });
    if (C.warn.length) { M.push({ type: 'h3', text: 'Замечания' }); C.warn.forEach(w => M.push({ type: 'p', text: '• ' + w, small: true })); }
    M.push({ type: 'p', small: true, text: 'Нормативная база: СП 367.1325800.2025 «Здания жилые и общественные. Правила проектирования естественного и совмещённого освещения»; СП 52.13330.2016 «Естественное и искусственное освещение» (с изм. 1, 2). Расчёт выполнен без учёта мебели и оборудования, при 100 % использовании светопрозрачных заполнений (п. 5.9 СП 52.13330.2016). Значения КЕО округлены до сотых (п. Б.2.12 СП 367).' });
    return M;
  }

  function sideModel(M, st, C, r) {
    r.walls.forEach((w, wi) => {
      const W = st.side.walls[wi], inp = w.inp;
      const pre = r.walls.length > 1 ? `Стена ${wi + 1} (${ORIENT_NAME[w.orient]}). ` : '';
      M.push({ type: 'h2', text: `${2 + wi * 3}. ${pre}Исходные данные` });
      M.push({ type: 'kv', rows: [
        ['Глубина помещения', 'dп', f(inp.dp) + ' м', 'от внутренней грани стены со светопроёмами'],
        ['Ширина помещения', 'bп', f(inp.bp) + ' м', ''],
        ['Расстояние до расчётной точки', 'lт', f(inp.lt) + ' м', 'от внутренней поверхности наружной стены'],
        ['Смещение точки от оси помещения', 'Δs', f(inp.ds) + ' м', ''],
        ['Толщина наружной стены', 'Δ_{ст}', f(inp.dst) + ' м', ''],
        ['Ориентация светопроёмов', '', ORIENT_NAME[w.orient], ''],
        ['Суммарная ширина проёмов с простенками', 'b_{с.п}', f(w.bsp) + ' м', '']
      ] });
      M.push({ type: 'table', title: 'Параметры светопроёмов', cols: [{ h: '№', w: 7, a: 'center' }, { h: 'hпд, м', w: 13, a: 'center' }, { h: 'hо, м', w: 13, a: 'center' }, { h: 'bо, м', w: 13, a: 'center' }, { h: 's, м', w: 13, a: 'center' }, { h: 'τ1', w: 11, a: 'center' }, { h: 'τ2', w: 11, a: 'center' }, { h: 'τ4', w: 11, a: 'center' }, { h: 'τ5', w: 11, a: 'center' }, { h: 'τо', w: 13, a: 'center' }, { h: 'K', w: 12, a: 'center' }],
        rows: w.wins.map((x, i) => [i + 1, f(x.w.hpd), f(x.w.ho), f(x.w.bo), f(x.w.s), f(x.w.t1), f(x.w.t2), f(x.w.t4), f(x.w.t5 || 1), f(x.tau0, 4), f(x.K)]),
        note: 's — смещение оси проёма от оси помещения (вправо — плюс, если смотреть из помещения на окно); hпд — высота подоконника от пола; hо — высота проёма.' });
      if (wi === 0) M.push({ type: 'scheme', schemes: [Schemes.sideSection(inp, w), Schemes.sidePlan(inp, w)], caption: 'Схема расчётного помещения: разрез по характерной плоскости и план (жёлтым — видимый из точки А участок неба). Масштаб условный.' });

      M.push({ type: 'h2', text: `${3 + wi * 3}. ${pre}Коэффициенты` });
      const t0 = w.wins[0];
      const Ksrc = W.kType === 'none' ? 'нет затеняющих элементов фасада' : `${t0.Kinfo.title || K_TITLES[W.kType]}, глубина ${f(W.kDepth)} м; табл. ${t0.Kinfo.tab} СП 367 (интерполяция/экстраполяция по глубине помещения ${f(inp.dp)} м, точка — ${inp.kPos === 'center' ? 'в центре' : '1 м от стены'})`;
      M.push({ type: 'kv', rows: [
        ['Коэффициент светового климата', 'C_{N}', f(w.CN), `СП 52.13330.2016, табл. 5.1: группа ${C.group}, ориентация ${w.orient} (строка «${w.CNrow}»)`],
        ['Коэффициент эксплуатации', 'MF', f(w.MF), `СП 367, табл. 5.1: ${st.env === 'normal' ? 'нормальные условия среды' : 'пыльные, жаркие и сырые помещения'}, вертикальное остекление 76°–90°${st.glassMult !== 1 ? `, × ${f(st.glassMult)}` : ''}`],
        ['Светопропускание материала', 'τ_{1}', f(t0.w.t1), W.t1c ? 'по данным производителя' : `${DATA.tau1[W.t1].t} (${DATA.tau1[W.t1].r}); табл. Б.13/Б.14 — принято нижнее значение`],
        (W.windows.some(x => x.t2o) ? ['Потери в переплётах', 'τ_{2}', 'по проёмам', 'заданы для каждого проёма — см. таблицу параметров светопроёмов; табл. Б.15'] : ['Потери в переплётах', 'τ_{2}', f(DATA.tau2[W.t2].v), `${DATA.tau2[W.t2].t}; табл. Б.15`]),
        ['Потери в несущих конструкциях', 'τ_{3}', '1,00', 'при боковом освещении (п. Б.2.7)'],
        ['Потери в солнцезащитных устройствах', 'τ_{4}', f(DATA.tau4[W.t4].v), `${DATA.tau4[W.t4].t}; табл. Б.16`],
        ['Общий коэффициент пропускания', 'τ_{о}', w.wins.every(x => Math.abs(x.tau0 - t0.tau0) < 1e-9) ? f(t0.tau0, 4) : 'по проёмам', 'τо = τ1·τ2·τ3·τ4·τ5 (Б.8)'],
        ['Потери в элементах фасада', 'K', f(t0.K), Ksrc],
        ['Высота верха окна над УРП', 'h_{01}', f(w.h01) + ' м', w.onFloor ? 'h01 = hв.о − 0,8 (для точки на полу — от условной рабочей поверхности, заголовок табл. Б.7)' : 'h01 = hв.о − hр'],
        ['Отражённый свет помещения', 'r_{0}', f(w.r0, 4), `табл. ${w.r0info.table}: dп/h01 = ${f(w.dh)}; lт/dп = ${f(w.ld)}; bп/dп = ${f(w.bd)}; ρср = ${f(st.rho)}; линейная интерполяция${w.r0info.notes.length ? '. ' + w.r0info.notes.join('; ') : ''}`]
      ] });

      M.push({ type: 'h2', text: `${4 + wi * 3}. ${pre}Геометрический КЕО` });
      M.push({ type: 'p', text: 'Число лучей по графикам I и II А.М. Данилюка (рис. 8.8, 8.10 СП 367) определено аналитически — по формулам, по которым построены графики: n1 = 50·(cos θн − cos θв), где θн, θв — углы возвышения нижней и верхней границ видимого участка в разрезе; n2 = (100/π)·[ψ + ½·sin 2ψ] между границами участка в плане, где tg ψ = y / R, R — расстояние от точки до середины участка C. Число лучей округлено до десятых долей луча, как при подсчёте по графику. Угол γ — угловая высота середины участка неба. q(γ) — по формуле (3.2).', small: true });
      M.push({ type: 'formula', lines: ['ε_{б} = 0,01·n_{1}·n_{2}  (Б.11);    q(γ) = 0,429·[1 + 4·exp(−0,7 / sin γ)]  (3.2)'] });
      const rows = [];
      w.wins.forEach((x, i) => x.sectors.forEach((s, k) => {
        rows.push([`${i + 1}`, s.type === 'sky' ? `небо ${k + 1}` : `здание ${s.bld + 1}`, f(s.n1, 1), f(s.n2, 1), f(s.eps, 4), f(s.gamma) + '°', s.type === 'sky' ? f(s.q, 4) : '—', s.type === 'sky' ? f(s.eps * s.q, 4) : f(s.eps * w.blds[s.bld].bfv * w.blds[s.bld].kzd, 4)]);
      }));
      if (!rows.length) rows.push(['—', 'из точки А небо через проёмы не видно', '', '', '', '', '', '0']);
      M.push({ type: 'table', title: 'Участки неба и противостоящих зданий, видимые из расчётной точки', cols: [{ h: 'Проём', w: 10, a: 'center' }, { h: 'Участок', w: 18, a: 'center' }, { h: 'n1', w: 11, a: 'center' }, { h: 'n2', w: 11, a: 'center' }, { h: 'ε, %', w: 14, a: 'center' }, { h: 'γ', w: 13, a: 'center' }, { h: 'q(γ)', w: 13, a: 'center' }, { h: 'ε·q  или  εзд·bф·Kзд', w: 22, a: 'center' }], rows });
      if (w.blds.length) {
        M.push({ type: 'table', title: 'Противостоящие здания (схема № 1, рис. Б.4)', cols: [{ h: '№', w: 7, a: 'center' }, { h: 'l, м', w: 11, a: 'center' }, { h: 'Hр, м', w: 11, a: 'center' }, { h: 'a, м', w: 11, a: 'center' }, { h: 'ρф', w: 10, a: 'center' }, { h: 'l/a', w: 10, a: 'center' }, { h: 'a/Hр', w: 10, a: 'center' }, { h: 'bф', w: 10, a: 'center' }, { h: 'z1', w: 10, a: 'center' }, { h: 'z2', w: 10, a: 'center' }, { h: 'Kзд0', w: 11, a: 'center' }, { h: 'Kзд', w: 11, a: 'center' }],
          rows: w.blds.map((b, i) => [i + 1, f(b.l), f(b.Hp), f(b.a), f(b.rhoF), f(b.la), f(b.aH), f(b.bfv), f(b.z1), f(b.z2), f(b.kzd0v), f(b.kzd, 3)]),
          note: `bф — табл. Б.1; z1 = a·(lт + Δст) / ((l + lт + Δст)·bс.п), z2 = Hр·(lт + Δст) / ((l + lт + Δст)·(hо + hпд)) — рис. Б.4; Kзд0 — табл. Б.8 при (lт + Δст)/dп = ${f(w.ldOut)}; Kзд = 1 + (Kзд0 − 1)·Σεзд / (Σεб + Σεзд) (Б.7), Σεб = ${f(w.sumEb, 4)}, Σεзд = ${f(w.sumEzd, 4)}.` });
      }
      M.push({ type: 'h3', text: 'Расчётное значение КЕО — формула (Б.1)' });
      M.push({ type: 'formula', lines: ['e_{р}^{б} = C_{N}·[Σ ε_{б}·q(γ) + Σ ε_{зд}·b_{ф}·K_{зд}]·r_{0}·τ_{о}·K·MF'], src: 'СП 367.1325800.2025, прил. Б, формула (Б.1). Для проёмов с разными τо и K расчёт выполнен по каждому проёму, результаты суммированы.' });
      const lines = w.wins.map((x, i) => `проём ${i + 1}: ${f(w.CN)}·(${f(x.sumSky, 4)} + ${f(x.sumBld, 4)})·${f(w.r0, 4)}·${f(x.tau0, 4)}·${f(x.K)}·${f(w.MF)} = ${f(x.e, 4)} %`);
      lines.push(`e_{р}^{б} = ${w.wins.map(x => f(x.e, 4)).join(' + ')} = ${f(w.e, 4)} %`);
      M.push({ type: 'formula', lines });
    });
    if (r.walls.length > 1) M.push({ type: 'formula', lines: [`e_{р} = ${r.walls.map(w => f(w.e, 4)).join(' + ')} = ${f(r.e, 4)} ≈ ${f(r.eR)} %`], src: 'Световые проёмы различной ориентации: КЕО от каждой стены рассчитан отдельно и просуммирован (п. 8.4.1, примечание, СП 367).' });
    else M.push({ type: 'formula', lines: [`e_{р} = ${f(r.e, 4)} ≈ ${f(r.eR)} %`] });
  }

  function topTypesModel(M, st, r, num) {
    r.types.forEach((T, ti) => {
      const t = T.t, nm = r.types.length > 1 ? ` — тип ${ti + 1} «${t.name}»` : '';
      M.push({ type: 'h3', text: `Фонари${nm}` });
      M.push({ type: 'kv', rows: [
        ['Тип, форма в плане', '', t.shape === 'round' ? 'шахтный, круглый' : 'шахтный, прямоугольный', `${t.lanterns.length} шт.`],
        [t.shape === 'round' ? 'Диаметр верхнего / нижнего отверстия' : 'Верхнее отверстие aф.в × bф.в', '', t.shape === 'round' ? `${f(t.dv)} / ${f(t.dn)} м` : `${f(t.av)} × ${f(t.bv)} м`, ''],
        ...(t.shape === 'round' ? [] : [['Нижнее отверстие aф.н × bф.н', '', `${f(t.an)} × ${f(t.bn)} м`, '']]),
        ['Высота светопроводной шахты', 'h_{с.ф}', f(t.hsf) + ' м', ''],
        ['Площадь верхнего отверстия', 'A_{ф.в}', f(T.idx.Av, 3) + ' м²', ''],
        ['Индекс фонаря', 'i_{ф}', f(T.idx.i, 3), `${T.idx.formula} = ${T.idx.subst}; формула ${T.idx.eq} СП 367`],
        ['Коэффициент светопередачи', 'K_{с}', f(T.kc.v, 3), t.Kc !== undefined ? 'задан вручную' : `рис. ${T.kc.fig} СП 367 (${t.refl === 'diffuse' ? 'диффузное' : 'направленное'} отражение стенок, ρ = ${f(t.rhoW)})${T.kc.notes.length ? '. ' + T.kc.notes.join('; ') : ''}`],
        ['Показатель степени', 'm', f(T.m, 3), 'm = 2 + 2/Kс'],
        ['Общий коэффициент пропускания', 'τ_{о}', f(T.tau0, 4), `τо = τ1·τ2·τ3·τ4·τ5 = ${f(t.t1)}·${f(t.t2)}·${f(t.t3)}·${f(t.t4)}·${f(t.t5)} (Б.8)`],
        ['Коэффициент эксплуатации', 'MF', f(T.MF), `СП 367, табл. 5.1: ${st.env === 'normal' ? 'нормальные условия' : 'пыльные, жаркие, сырые'}, наклон остекления ${DATA.MF.angles[+st.top.types[ti].tilt || 0]}`]
      ] });
      const rows = [];
      T.pts.forEach((p, j) => p.rows.forEach((x, k) => rows.push({ cells: [k === 0 ? `РТ${j + 1}` : '', x.li + 1, f(x.lf), f(x.lfh), f(x.a), f(x.q, 3), f(x.cm, 4), f(x.qc, 4), k === 0 ? f(p.S, 4) : '', k === 0 ? f(p.eps) : '', k === 0 ? f(p.sPr) : '', k === 0 ? f(p.e) : ''], fill: j % 2 ? '#f7f8f9' : null })));
      M.push({ type: 'table', title: `Параметры и КЕО в расчётных точках${nm}`, size: 6.8, cols: [{ h: 'РТ', w: 9, a: 'center' }, { h: '№ ф.', w: 7, a: 'center' }, { h: 'lф, м', w: 10, a: 'center' }, { h: 'lф/hр', w: 10, a: 'center' }, { h: 'α, °', w: 10, a: 'center' }, { h: 'q(α)', w: 10, a: 'center' }, { h: 'cos^m α', w: 11, a: 'center' }, { h: 'q·cos^m α', w: 12, a: 'center' }, { h: 'Σ', w: 11, a: 'center' }, { h: 'ε, %', w: 10, a: 'center' }, { h: 'σпр, %', w: 11, a: 'center' }, { h: 'eв, %', w: 11, a: 'center' }], rows,
        note: `α = arctg(lф / hр); q(α) = q(γ = 90° − α) по (3.2); εj = 100·Aф.в·Σ q(α)·cos^m α / (π·hр²) (8.4) = ${f(T.coef, 3)}·Σ; εср = ${f(T.epsAvg, 3)} (8.5); σпр = εj·τо·MF·CN (8.6); σотр = εср·(r2 − 1)·τо·MF·CN = ${f(T.epsAvg, 3)}·(${f(r.r2, 3)} − 1)·${f(T.tau0, 4)}·${f(T.MF)}·${f(r.CN)} = ${f(T.sOtr, 3)} % (8.7); eв = σпр + σотр (8.8).` });
    });
  }

  function topModel(M, st, C, r) {
    const T = st.top, inp = topInput(st), pts = inp.points;
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Размеры помещения (по разрезу × поперёк)', 'L × B', `${f(T.L)} × ${f(T.B)} м`, 'расчётные точки — вдоль L'],
      ['Высота помещения в свету', 'H', f(T.H) + ' м', 'нижнее отверстие шахты — на уровне потолка (п. 9.4.2)'],
      ['Расчётная высота от УРП до нижнего отверстия', 'h_{р}', f(r.hr) + ' м', `hр = H − hурп = ${f(T.H)} − ${f(inp.hurp)}`],
      ['Число пролётов / ширина пролёта', 'l_{1}', `${inp.spans} / ${f(inp.l1)} м`, ''],
      ['Коэффициент светового климата', 'C_{N}', f(r.CN), `СП 52.13330.2016, табл. 5.1, «В зенитных фонарях», группа ${C.group}`],
      ['Отражённый свет помещения', 'r_{2}', f(r.r2, 3), `табл. Б.21: hр/l1 = ${f(r.hl)}, ρср = ${f(st.rho)}, пролётов ${inp.spans}${r.r2info.notes.length ? '. ' + r.r2info.notes.join('; ') : ''}`]
    ] });
    M.push({ type: 'scheme', h: 70, schemes: [Schemes.topPlan({ ...inp, L: +T.L, B: +T.B, y0: pts[0].y, types: inp.types }, pts), Schemes.topSection({ ...inp, L: +T.L, types: inp.types }, pts)], caption: 'Схема расположения фонарей и расчётных точек. Масштаб условный.' });
    M.push({ type: 'h2', text: '3. Расчёт КЕО в точках — формула (Б.3)' });
    M.push({ type: 'formula', lines: ['e_{р}^{в} = C_{N}·τ_{о}·MF·[100·A_{ф.в}·Σ q(α_{i})·cos^{(2+2/Kс)} α_{i} / (π·h_{р}^{2}) + ε_{ср}·(r_{2} − 1)]'], src: 'СП 367.1325800.2025, прил. Б, формула (Б.3); порядок расчёта — п. 8.5.1, формулы (8.4)–(8.8). При нескольких типах фонарей КЕО в точке — сумма от каждого типа.' });
    topTypesModel(M, st, r);
    avgModel(M, r, 'в');
  }
  function avgModel(M, r, sup) {
    M.push({ type: 'h2', text: 'Среднее значение КЕО и равномерность' });
    const N = r.e.length, mid = r.e.slice(1, -1).map(v => f(v)).join(' + ');
    M.push({ type: 'formula', lines: [
      'e_{ср} = 1/(N − 1)·[(e_{1} + e_{N})/2 + Σ e_{j}],  j = 2…N−1   (Б.10)',
      `e_{ср} = 1/(${N} − 1)·[(${f(r.e[0])} + ${f(r.e[N - 1])})/2${mid ? ' + ' + mid : ''}] = ${f(r.eAvg, 3)} ≈ ${f(r.eAvgR)} %`,
      `e_{min} : e_{ср} = ${f(r.eMin)} : ${f(r.eAvg)} = 1 : ${f(r.uniInv)}  (норма — не более 1 : 3, п. 5.13 СП 52.13330.2016)`
    ] });
    void sup;
  }
  function combModel(M, st, C, r) {
    if (isB2(st)) return combModelB2(M, st, C, r);
    const T = st.top, inp = topInput(st), pts = inp.points, W = st.side.walls[0];
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Размеры помещения', 'L × B', `${f(T.L)} × ${f(T.B)} м`, `окна — в стене ${st.comb.wallSide === 'xL' ? 'x = L' : 'x = 0'}, точки — вдоль L`],
      ['Высота помещения в свету', 'H', f(T.H) + ' м', ''],
      ['Расчётная высота до нижнего отверстия фонаря', 'h_{р}', f(r.top.hr) + ' м', ''],
      ['C_{N} (фонари / окна)', 'C_{N}', `${f(r.top.CN)} / ${f(r.side[0].walls[0].CN)}`, `табл. 5.1 СП 52, группа ${C.group}, окна — ${ORIENT_NAME[W.orient]}`],
      ['r_{2}', 'r_{2}', f(r.top.r2, 3), 'табл. Б.21']
    ] });
    M.push({ type: 'scheme', h: 70, schemes: [Schemes.topPlan({ ...inp, L: +T.L, B: +T.B, y0: pts[0].y, types: inp.types, sideWall: st.comb.wallSide }, pts), Schemes.topSection({ ...inp, L: +T.L, types: inp.types }, pts)], caption: 'Схема расположения фонарей, светопроёмов (стена выделена) и расчётных точек.' });
    M.push({ type: 'h2', text: '3. Верхнее освещение — формула (Б.3)' });
    topTypesModel(M, st, r.top);
    combSideModel(M, st, C, r, 4);
  }
  function combSideModel(M, st, C, r, num) {
    M.push({ type: 'h2', text: `${num}. Боковое освещение в тех же точках — формула (Б.1)` });
    M.push({ type: 'table', title: 'Боковой КЕО по точкам', cols: [{ h: 'РТ', w: 10, a: 'center' }, { h: 'lт, м', w: 12, a: 'center' }, { h: 'Σε·q', w: 14, a: 'center' }, { h: 'Σεзд·bф·Kзд', w: 16, a: 'center' }, { h: 'r0', w: 12, a: 'center' }, { h: 'τо', w: 12, a: 'center' }, { h: 'K', w: 10, a: 'center' }, { h: 'eб, %', w: 12, a: 'center' }],
      rows: r.side.map((s, j) => { const w = s.walls[0]; return [`РТ${j + 1}`, f(w.inp.lt), f(w.wins.reduce((a, x) => a + x.sumSky, 0), 4), f(w.wins.reduce((a, x) => a + x.sumBld, 0), 4), f(w.r0, 3), f(w.wins[0].tau0, 4), f(w.wins[0].K), f(w.e)]; }),
      note: `CN = ${f(r.side[0].walls[0].CN)}, MF = ${f(r.side[0].walls[0].MF)}; r0 — табл. ${r.side[0].walls[0].r0info.table} для каждой точки; n1, n2 — аналитически (графики Данилюка).` });
    M.push({ type: 'h2', text: `${num + 1}. Комбинированное освещение — формула (Б.4)` });
    M.push({ type: 'table', title: 'e_к = e_в + e_б', cols: [{ h: 'РТ', w: 12, a: 'center' }, { h: 'eв, %', w: 14, a: 'center' }, { h: 'eб, %', w: 14, a: 'center' }, { h: 'eк, %', w: 14, a: 'center' }], rows: r.e.map((v, j) => [`РТ${j + 1}`, f(r.top.e[j]), f(r.side[j].e), f(v)]) });
    avgModel(M, r, 'к');
  }

  /* ---------- отчёт: надстройки (Б.2) ---------- */
  const SIDE_NAME = { L: 'левое', R: 'правое', H: 'в покрытии' };
  function b2Kv(M, st, C, r, inp) {
    r.types.forEach((T, ti) => {
      const t = T.t, nm = r.types.length > 1 ? ` «${t.name}»` : '';
      const ys = T.ys.map(([a, b]) => `${f(a + inp.y0)}…${f(b + inp.y0)}`).join('; ');
      M.push({ type: 'h3', text: `Фонари${nm}: ${R.KIND_NAME[t.kind]}` });
      M.push({ type: 'kv', rows: [
        ['Оси фонарей на разрезе (от стены x = 0)', 'x', t.xs.map(x => f(x)).join('; ') + ' м', `${t.xs.length} шт.`],
        ['Ширина проёма в покрытии', 'b', f(t.b) + ' м', ''],
        ['Высота борта (низ остекления над проёмом)', 'h_{ст}', f(t.hst) + ' м', `низ остекления на отметке ${f(inp.Hk + t.hst)} м от пола`],
        ...(t.kind === 'plane' ? [] : [['Высота остекления (по вертикали)', 'h_{о}', f(t.ho) + ' м', t.kind === 'A' ? 'для А-образного hо = (b/2)·tg β' : '']]),
        ...(['trap', 'A', 'shedI'].includes(t.kind) ? [['Наклон остекления к горизонту', 'β', f(t.beta, 0) + '°', '']] : []),
        ['Протяжённость вдоль оси (от торцевой стены)', 'y', ys + ' м', t.pieces > 1 ? `${t.pieces} проёма с шагом ${f(t.pitch)} м` : 'сплошной (ленточный)'],
        ['Коэффициент типа фонаря', 'k_{ф}', f(T.kf), 'табл. Б.22 СП 367'],
        ['Коэффициент светового климата', 'C_{N}', f(T.CN), `СП 52.13330.2016, табл. 5.1: ${CN_ROWS.find(x => x[0] === t.CNrow)[1]}, группа ${C.group}`],
        ['Общий коэффициент пропускания', 'τ_{о}', f(T.tau0, 4), `τо = τ1·τ2·τ3·τ4·τ5 = ${f(t.t1)}·${f(t.t2)}·${f(t.t3)}·${f(t.t4)}·${f(t.t5)} (Б.8); τ3 — фермы, τ5 = 0,9 — сетка (табл. Б.16, п. Б.2.7)`],
        ['Коэффициент эксплуатации', 'MF', f(T.MF), `табл. 5.1 СП 367: ${st.env === 'normal' ? 'нормальные условия' : 'пыльные, жаркие, сырые'}, наклон остекления ${DATA.MF.angles[R.tiltIdx(t)]}${st.glassMult !== 1 ? `, × ${f(st.glassMult)}` : ''}`],
        ['Высота низа остекления над УРП', 'h_{ф}', f(T.hf) + ' м', ''],
        ['Отражённый свет помещения', 'r_{2}', f(T.r2, 3), `табл. Б.21: hф/l1 = ${f(T.hl)}, ρср = ${f(st.rho)}, пролётов ${inp.spans}, l1 = ${f(inp.l1)} м${T.r2info.notes.length ? '. ' + T.r2info.notes.join('; ') : ''}`]
      ] });
    });
  }
  function b2Sectors(M, r) {
    M.push({ type: 'p', small: true, text: 'Число лучей по графикам I и II А.М. Данилюка определено аналитически: в поперечном разрезе построены лучи из расчётной точки через каждое остекление с учётом борта, покрытия фонаря и соседних фонарей (луч, упирающийся после остекления в другой фонарь, не учитывается); φ — углы видимого участка от горизонта (справа), n1 = 50·|cos φн − cos φв|. C — середина видимого участка остекления, R — расстояние до неё; n2 = (100/π)·[ψ + ½·sin 2ψ] между торцами фонаря, tg ψ = y / R (график II, горизонталь № R). γ — угол возвышения точки C. Число лучей округлено до десятых.' });
    M.push({ type: 'formula', lines: ['ε_{вi} = 0,01·n_{1}·n_{2}  (Б.13);    q(γ) = 0,429·[1 + 4·exp(−0,7 / sin γ)]  (3.2)'] });
    r.types.forEach((T, ti) => {
      const rows = [];
      T.pts.forEach((p, j) => {
        if (!p.sectors.length) rows.push({ cells: [`РТ${j + 1}`, '—', 'небо через фонари не видно', '', '', '', '', '', '', '', '0'], fill: j % 2 ? '#f7f8f9' : null });
        p.sectors.forEach((x, k) => rows.push({ cells: [k === 0 ? `РТ${j + 1}` : '', x.inst + 1, SIDE_NAME[x.side], `${f(x.phiA, 1)}…${f(x.phiB, 1)}`, f(x.n1, 1), f(x.n2, 1), f(x.gamma, 1), f(x.q, 3), f(x.eps, 4), f(x.eq, 4), k === 0 ? f(p.S, 4) : ''], fill: j % 2 ? '#f7f8f9' : null }));
      });
      M.push({ type: 'table', title: `Участки неба, видимые через фонари${r.types.length > 1 ? ` «${T.t.name}»` : ''}`, size: 6.8, cols: [{ h: 'РТ', w: 9, a: 'center' }, { h: '№ ф.', w: 7, a: 'center' }, { h: 'Остекл.', w: 12, a: 'center' }, { h: 'φ, °', w: 15, a: 'center' }, { h: 'n1', w: 9, a: 'center' }, { h: 'n2', w: 9, a: 'center' }, { h: 'γ, °', w: 9, a: 'center' }, { h: 'q(γ)', w: 10, a: 'center' }, { h: 'εв, %', w: 11, a: 'center' }, { h: 'εв·q', w: 11, a: 'center' }, { h: 'Σ εв·q', w: 12, a: 'center' }], rows });
    });
  }
  function b2Points(M, st, r) {
    M.push({ type: 'formula', lines: ['e_{р}^{в} = C_{N}·[Σ ε_{вi}·q(γ_{i}) + ε_{ср}·(r_{2}·k_{ф} − 1)]·τ_{о}·MF   (Б.2)'], src: 'СП 367.1325800.2025, прил. Б, формула (Б.2); порядок — п. 8.5.1. εср — среднее по расчётным точкам значений εв = 0,01·Σ(n1·q(γ)·n2) (п. 8.5.1 г), е); формула (Б.9)). При нескольких типах фонарей КЕО в точке — сумма по типам.' });
    r.types.forEach(T => {
      const N = T.pts.length;
      M.push({ type: 'formula', lines: [
        `${r.types.length > 1 ? '«' + T.t.name + '»: ' : ''}ε_{ср} = (${T.pts.map(p => f(p.S, 3)).join(' + ')}) / ${N} = ${f(T.epsAvg, 4)}`,
        `отражённая составляющая: C_{N}·ε_{ср}·(r_{2}·k_{ф} − 1)·τ_{о}·MF = ${f(T.CN)}·${f(T.epsAvg, 4)}·(${f(T.r2, 3)}·${f(T.kf)} − 1)·${f(T.tau0, 4)}·${f(T.MF)} = ${f(T.sOtr, 3)} %`
      ] });
    });
    const rows = r.e.map((v, j) => [`РТ${j + 1}`, f(r.inp.points[j].x), ...r.types.map(T => f(T.pts[j].S, 4)), f(r.types.reduce((s, T) => s + T.pts[j].sPr, 0), 3), f(r.types.reduce((s, T) => s + T.sOtr, 0), 3), f(v)]);
    M.push({ type: 'table', title: 'КЕО в расчётных точках при верхнем освещении', cols: [{ h: 'РТ', w: 10, a: 'center' }, { h: 'x, м', w: 11, a: 'center' }, ...r.types.map(T => ({ h: r.types.length > 1 ? `Σεq «${T.t.name}»` : 'Σ εв·q', w: 14, a: 'center' })), { h: 'прямая, %', w: 14, a: 'center' }, { h: 'отражённая, %', w: 15, a: 'center' }, { h: 'eв, %', w: 12, a: 'center' }], rows,
      note: 'прямая = CN·Σεв·q·τо·MF; отражённая = CN·εср·(r2·kф − 1)·τо·MF; eв = прямая + отражённая.' });
  }
  function b2SchemeBlock(M, st, r, inp, sideWall) {
    const pts = inp.points, mid = Math.floor(pts.length / 2);
    M.push({ type: 'scheme', h: 72, weights: [2.2, 1], schemes: [Schemes.b2Sect(inp, r, mid, sideWall), Schemes.b2Plan(inp, sideWall)], caption: `Поперечный разрез (видимые участки неба показаны из РТ${mid + 1}) и план с фонарями и линией расчётных точек. Масштаб условный.` });
  }
  function b2Model(M, st, C, r) {
    const T = st.top, inp = r.inp;
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Длина помещения по разрезу (поперёк фонарей)', 'L', f(T.L) + ' м', 'расчётные точки — вдоль L'],
      ['Длина помещения вдоль фонарей', 'B', f(T.B) + ' м', `линия разреза на y = ${f(inp.y0)} м`],
      ['Высота до низа проёмов в покрытии', 'H', f(T.H) + ' м', 'от пола'],
      ['Высота УРП', 'h_{урп}', f(inp.hurp) + ' м', ''],
      ['Число пролётов / ширина пролёта', 'l_{1}', `${inp.spans} / ${f(inp.l1)} м`, 'для табл. Б.21']
    ] });
    b2SchemeBlock(M, st, r, inp);
    b2Kv(M, st, C, r, inp);
    M.push({ type: 'h2', text: '3. Геометрический КЕО в расчётных точках' });
    b2Sectors(M, r);
    M.push({ type: 'h2', text: '4. КЕО в точках — формула (Б.2)' });
    b2Points(M, st, r);
    avgModel(M, r, 'в');
  }
  function combModelB2(M, st, C, r) {
    const T = st.top, inp = r.top.inp, W = st.side.walls[0];
    M.push({ type: 'h2', text: '2. Исходные данные' });
    M.push({ type: 'kv', rows: [
      ['Длина по разрезу × вдоль фонарей', 'L × B', `${f(T.L)} × ${f(T.B)} м`, `окна — в стене ${st.comb.wallSide === 'xL' ? 'x = L' : 'x = 0'}, точки — вдоль L`],
      ['Высота до низа проёмов в покрытии', 'H', f(T.H) + ' м', ''],
      ['C_{N} окон', 'C_{N}', f(r.side[0].walls[0].CN), `табл. 5.1 СП 52, группа ${C.group}, ${ORIENT_NAME[W.orient]}`]
    ] });
    b2SchemeBlock(M, st, r.top, inp, st.comb.wallSide);
    b2Kv(M, st, C, r.top, inp);
    M.push({ type: 'h2', text: '3. Верхнее освещение — формула (Б.2)' });
    b2Sectors(M, r.top);
    b2Points(M, st, r.top);
    combSideModel(M, st, C, r, 4);
  }

  return { B2_KINDS, CN_ROWS, cnRowDefault, defaultB2Type, b2Input, isB2, defaultState, defaultWall, defaultWindow, defaultType, compute, buildModel, normOf, hpOf, rtOf, ltAuto, groupOf, room, topPoints, sideInput, topInput, ORIENTS, ORIENT_NAME, RT_TEXT, RT_REF, K_TITLES, mfOf, tau1Wall, round2 };
})();
if (typeof module !== 'undefined') module.exports = KEO;
