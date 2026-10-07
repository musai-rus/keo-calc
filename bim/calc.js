/* КЕО по модели: из геометрии помещения и его проёмов — исходные данные калькулятора (то же состояние, что вводится вручную),
   расчёт тем же ядром и моделью (KEO.compute). Методика расчёта не меняется: модель только «снимает размеры». */
const BimCalc = (function () {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const r2 = x => Math.round(x * 100) / 100;

  /* ---------- нормы: назначение помещения по табл. А.1 ---------- */
  const stem = w => w.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '').slice(0, 5);
  const STOP = new Set(['для', 'и', 'с', 'в', 'на', 'при', 'по', 'без', 'от', 'до', 'помещ', 'комна', 'залы', 'зал']);
  function words(s) { return String(s || '').split(/[\s,.;:()«»"/\-–—]+/).map(stem).filter(w => w.length >= 3 && !STOP.has(w)); }
  // типовые назначения ДОО и общественных зданий (проверяются первыми); null — помещение без нормы КЕО
  const RULES = [
    [/туалет|санузел|с\/у|душев|уборн|умываль|кладов|склад|инвентар|венткам|вентиляц|техническ|электрощит|щитов|насосн|загрузк|растарив|мусор|тамбур|шлюз|шахт|лифт|гардероб персонала|постирочн|гладиль|прачечн/i, null],
    [/групп|игров|занят|кружков|изостуд|логопед|дефектолог|психолог|сенсорн/i, 'A57'],
    [/спальн/i, 'A60'], [/раздевал/i, 'A56'], [/изолятор|заболевш/i, 'A61'],
    [/музыкал|физкульт|спортивн.*зал|спортзал/i, 'A58'],
    [/медицин|процедур|медсестр|прививоч/i, 'A62'],
    [/обеденн|столов/i, 'A59'],
    [/кабинет|методист|заведующ|канцеляр|приемн|бухгалтер|офис|переговор|тренерск/i, 'A1']
  ];
  const DOO = /Дошкольные/;
  function mapNorm(name, rows, group) {
    if (DOO.test(group || '')) for (const [re, id] of RULES) if (re.test(name || '')) return id ? rows.find(r => r.id === id) || null : null;
    const ws = words(name); if (!ws.length) return null;
    let best = null;
    rows.filter(r => !group || r.g === group || /Прочие помещения|Вспомогательные/.test(r.g)).forEach(r => {
      const rw = new Set(words(r.name)); let hit = 0; ws.forEach(w => { if (rw.has(w)) hit++; });
      if (!hit) return;
      const sc = hit / ws.length + (r.g === group ? 0.2 : 0) + 0.01 * hit;
      if (!best || sc > best.sc) best = { sc, r };
    });
    return best && best.sc >= 0.5 ? best.r : null;
  }
  // тип здания — группа табл. А.1, по которой назначения совпадают чаще всего
  function guessGroup(names, rows) {
    const n = re => names.filter(x => re.test(x || '')).length;
    if (n(/групп/i) >= 2 && n(/спальн|раздевал/i) >= 2) return rows.find(r => DOO.test(r.g)).g;
    const cnt = {};
    names.forEach(n => { const ws = words(n); rows.forEach(r => { const rw = new Set(words(r.name)); if (ws.some(w => rw.has(w))) cnt[r.g] = (cnt[r.g] || 0) + 1; }); });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
  }

  /* ---------- ориентация по сторонам света ---------- */
  const ORI = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  function azimuth(nout, T) {
    const X = T ? T[0] * nout[0] + T[3] * nout[1] : nout[0], Y = T ? T[1] * nout[0] + T[4] * nout[1] : nout[1];
    return (Math.atan2(X, Y) * 180 / Math.PI + 360) % 360;
  }
  const oriOf = az => ORI[Math.round(az / 45) % 8];

  /* ---------- проёмы помещения: объединение панелей в окна, окна — в плоскости стен ---------- */
  function clusters(ops) {
    const n = ops.length, par = [...Array(n).keys()], f = i => par[i] === i ? i : (par[i] = f(par[i]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = ops[i], b = ops[j];
      if (dot(a.nin, b.nin) < Math.cos(3 * Math.PI / 180)) continue;
      if (Math.abs(dot(sub(b.c, a.c), a.nin)) > 0.25) continue;
      const ta = dot(a.c, a.t), tb = dot(b.c, a.t);
      const gapT = Math.max(tb - b.w / 2 - (ta + a.w / 2), ta - a.w / 2 - (tb + b.w / 2));
      const gapZ = Math.max(b.z0 - a.z1, a.z0 - b.z1);
      if (gapT < 0.25 && gapZ < 0.35) par[f(j)] = f(i);
    }
    const g = new Map(); ops.forEach((o, i) => { const r = f(i); if (!g.has(r)) g.set(r, []); g.get(r).push(o); });
    return [...g.values()].map(list => {
      const o0 = list[0], t = [-o0.nin[1], o0.nin[0]];
      let t0 = 1e9, t1 = -1e9, z0 = 1e9, z1 = -1e9, sn = 0;
      list.forEach(o => { const tc = dot(o.c, t); t0 = Math.min(t0, tc - o.w / 2); t1 = Math.max(t1, tc + o.w / 2); z0 = Math.min(z0, o.z0); z1 = Math.max(z1, o.z1); sn += dot(o.c, o0.nin); });
      sn /= list.length;
      const c = [t[0] * (t0 + t1) / 2 + o0.nin[0] * sn, t[1] * (t0 + t1) / 2 + o0.nin[1] * sn];
      return { ids: list.map(o => o.id), cats: [...new Set(list.map(o => o.cat))], nin: o0.nin, t, c, bo: t1 - t0, z0, z1, dIn: Math.min(...list.map(o => o.dIn)), dOut: Math.max(...list.map(o => o.dOut)), dst: med(list.map(o => o.dst)) };
    });
  }
  function facets(cls) {
    const out = [];
    cls.slice().sort((a, b) => b.bo * (b.z1 - b.z0) - a.bo * (a.z1 - a.z0)).forEach(c => {
      const f = out.find(F => dot(F.nin, c.nin) > Math.cos(3 * Math.PI / 180) && Math.abs(dot(sub(c.c, F.c0), F.nin)) < 0.4);
      if (f) f.cls.push(c); else out.push({ nin: c.nin, c0: c.c, cls: [c] });
    });
    out.forEach(F => {
      const nin = F.nin, t = [-nin[1], nin[0]];
      const face = med(F.cls.map(c => dot(c.c, nin) + c.dIn)); // внутренняя грань стены
      const tc = F.cls.reduce((s, c) => s + dot(c.c, t), 0) / F.cls.length;
      F.t = t; F.O = [t[0] * tc + nin[0] * face, t[1] * tc + nin[1] * face];
      F.dst = Math.min(1.2, Math.max(0.1, med(F.cls.map(c => c.dst))));
      F.area = F.cls.reduce((s, c) => s + c.bo * (c.z1 - c.z0), 0);
    });
    return out.sort((a, b) => b.area - a.area);
  }

  /* ---------- одно помещение ---------- */
  // env: {KEO (модель калькулятора), DATA, settings, floor, pts (клетки помещения), skylineFn(F, cl)→{kDepth, samples}, T (поворот на север)}
  function room(rm, ops, env) {
    const S = env.settings, notes = [];
    const cls = clusters(ops), F = facets(cls);
    const row = env.normRow; const rule = row ? row.rt : 'center';
    const pts = env.pts; if (pts.length < 4) return { rm, err: 'контур слишком мал' };
    const frame = f => pts.map(p => { const d = sub(p, f.O); return [dot(d, f.nin), dot(d, f.t)]; });
    // точка: одна стена — по правилу п. 5.3 СП 52 на характерном разрезе; несколько стен — центр помещения (как в калькуляторе)
    let A, multi = F.length > 1;
    const walls = [];
    if (!multi) {
      const f = F[0], uv = frame(f); const vmin = Math.min(...uv.map(x => x[1])), vmax = Math.max(...uv.map(x => x[1])), vmid = (vmin + vmax) / 2;
      const line = uv.filter(x => Math.abs(x[1] - vmid) < 0.3); const dp = Math.max(...(line.length ? line : uv).map(x => x[0]));
      const lt = env.KEO.ltAuto(rule, dp);
      A = [f.O[0] + f.t[0] * vmid + f.nin[0] * lt, f.O[1] + f.t[1] * vmid + f.nin[1] * lt];
      walls.push({ f, dp, bp: vmax - vmin, vmid, lt, ds: 0 });
    } else {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      A = pts.reduce((b, p) => { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; return !b || d < b.d ? { p, d } : b; }, null).p; // ближайшая клетка помещения к центру тяжести
      F.forEach(f => {
        const uv = frame(f), a = [dot(sub(A, f.O), f.nin), dot(sub(A, f.O), f.t)];
        const vmin = Math.min(...uv.map(x => x[1])), vmax = Math.max(...uv.map(x => x[1])), vmid = (vmin + vmax) / 2;
        const line = uv.filter(x => Math.abs(x[1] - a[1]) < 0.3); const dp = Math.max(...(line.length ? line : uv).map(x => x[0]));
        if (a[0] < 0.3) { notes.push(`стена ${oriOf(azimuth([-f.nin[0], -f.nin[1]], env.T))}: расчётная точка за плоскостью или вплотную к остеклению — стена не учтена`); return; }
        walls.push({ f, dp: Math.max(dp, a[0] + 0.05), bp: vmax - vmin, vmid, lt: a[0], ds: a[1] - vmid });
      });
    }
    if (!walls.length) return { rm, err: 'нет проёмов, видимых из расчётной точки' };
    const st = env.KEO.defaultState();
    st.meta = { code: S.code || '', object: S.object || '', room: `${rm.num} ${rm.name}`, author: '', date: new Date().toLocaleDateString('ru-RU'), sheetStart: 1 };
    st.region = S.region; st.group = S.group; st.groupManual = true; st.bType = row ? row.g : (S.bGroup || st.bType); st.roomId = row ? row.id : '';
    st.rho = S.rho; st.env = 'normal'; st.rtManual = multi ? 'manual' : null;
    const geo = [];
    st.side.walls = walls.map(w => {
      const f = w.f, nout = [-f.nin[0], -f.nin[1]], az = azimuth(nout, env.T);
      const sh = env.shade(f, A, w); // затенение: козырёк и противостоящие здания
      const wins = f.cls.map(c => ({ hpd: r2(Math.max(0, c.z0 - env.floor)), ho: r2(c.z1 - c.z0), bo: r2(c.bo), s: r2(dot(sub(c.c, f.O), f.t) - w.vmid), t2o: null, tau0o: null, Ko: null }));
      geo.push({ f, A, az, wins, sh, cls: f.cls });
      return {
        orient: oriOf(az), dp: r2(w.dp), bp: r2(w.bp), H: r2((rm.h || 3000) / 1000), dst: r2(f.dst), lt: r2(w.lt), ds: r2(w.ds),
        t1: S.t1, t1c: null, t2: S.t2, t4: S.t4, t5: 1, kType: sh.kDepth >= 0.3 ? 'canopy' : 'none', kDepth: r2(sh.kDepth),
        windows: wins, buildings: sh.blds
      };
    });
    const C = env.KEO.compute(st);
    return { rm, row, st, C, A, walls, geo, notes, multi };
  }

  /* ---------- противостоящие здания из профиля затенения ---------- */
  // samples: [{ph (°), best:{el, d, h}}] от точки P0 на наружной грани; vP0 — координата P0 вдоль стены относительно оси точки
  function buildings(samples, floor, vP0, rhoF, d0) {
    const out = []; let cur = null;
    samples.forEach(s => {
      const b = s.best; const ok = b && b.el > 1 * Math.PI / 180 && b.d > d0;
      if (!ok) { cur = null; return; }
      const a = s.ph * Math.PI / 180, ln = b.d * Math.cos(a);
      if (ln < 0.5) { cur = null; return; }
      if (cur && Math.abs(ln - cur.lnLast) < Math.max(3, 0.25 * ln)) cur.s.push({ ...s, ln, a }); else { cur = { s: [{ ...s, ln, a }] }; out.push(cur); }
      cur.lnLast = ln;
    });
    return out.map(g => {
      const top = g.s.reduce((m, x) => x.best.el > m.best.el ? x : m);
      const l = top.ln, Hp = top.best.h - floor;
      const ys = g.s.map(x => vP0 + l * Math.tan(x.a)), step = 5 * Math.PI / 180;
      const y0 = Math.min(...ys) - l * Math.tan(step) / 2, y1 = Math.max(...ys) + l * Math.tan(step) / 2;
      return { l: r2(l), Hp: r2(Hp), a: r2(Math.max(0.5, y1 - y0)), off: r2((y0 + y1) / 2), rhoF };
    }).filter(b => b.Hp > 0.5 && b.l > 0);
  }

  return { mapNorm, guessGroup, clusters, facets, room, buildings, azimuth, oriOf, words };
})();
