# Исследовательский геометрический контракт

17.10.2026 UTC. `facade-contract.js` — чистый валидатор, **не подключённый к сборке, Viewer или расчётному gate**. Failclosed `8a9e6e6` не ослаблен. Этап сохранён перед приоритетным тестированием новой модели.

## Доказанный класс

`BimFacadeContract.validate(input)` проверяет точную рациональную геометрию в одном объявленном scope. Группа — связная planar source-face component с общей native identity `(model/revision/document/instance/view/frame/room-boundary revision, ownerId, faceId, roomId)`. Помимо ID проверяются плоскость, ориентированная нормаль, native boundary reference, связность через ребро положительной длины, отсутствие перекрытий и полное покрытие окон фрагментами.

Несколько окон сохраняются разными окнами одной группы. Дробление и перестановка не меняют каноническую геометрию/площадь. Разные parallel/adjacent/opposite faces не сливаются; нормативная классификация не выводится. Между разными native identities объединение не угадывается.

Поддержаны вертикальные плоскости и rectilinear domains как объединения неперекрывающихся прямоугольных tiles в planar frame. Отверстия представлены отсутствующими tiles: bbox не заполняет их. Касание support точкой недостаточно. Проверка покрытия точная по исходным endpoints, без произвольного шага растра. BigInt rational coordinates, известные m/mm/ft и точный orientation-preserving rigid transform; приблизительные/nonzero-error данные, произвольные loops, кривые, shear/scale/reflection пока отвергаются.

`state:'confirmed'` означает **только внутреннюю геометрическую согласованность supplied-exact-contract-only**. Всегда сохраняются `sourceTruthVerified:false`, `normativeConfirmed:false` и `physicalFacadeClassification:'not-inferred-between-native-identities'`. Истинность native association, полнота и точность экспорта — исходные предпосылки, не удостоверенные этим кодом. Input не сверяется с внешним inventory всех граней здания. Выход не разрешает снятие live-блокировки.

## Минимальный экспортный контракт

- `schema:'keo.facade-contract/v1'`; scope model/revision/document/link-instance/view/frame IDs и revision room boundaries. Конфликтующий/повреждённый per-record scope отвергается; output identity квалифицирован scope.
- Источник: producer/evidence, совпадающий scope, native-planar-export/source-model reference, координатная и transform precision, полнота выбранного набора. Флаги сами не превращают Viewer bbox в доверенный экспорт; источник должен подтверждаться отдельно. Первая реализация принимает лишь exact-rational contracts.
- Известные единицы и полный source→common-frame transform с точностью. Runtime coefficients и decoder arithmetic не равны точности source-model.
- Native rooms/boundaries: room/host/face references, room-facing side, inward normal, source reference. Растровые `space/reg` не заменяют эти данные.
- Faces: record/owner/face/room IDs, согласованная association, planar frame, полный attachment-support domain с fragment/part provenance. Это область привязки окон с сохранёнными настоящими voids, не convex hull стекла и не неподписанный opaque mesh.
- Openings: отдельные opening/element IDs, полный glazing domain и geometry/source каждого fragment/part. Union должен точно покрывать domain, без пропусков, перекрытий и заполнения отверстий. Повторное использование source fragment/part запрещено.

Для более общего экспорта нужны outer/hole loops или B-rep/triangle topology, связи host/opening/room и проверяемые error bounds/constraint relations. Они не реализованы в этом ограниченном валидаторе. Native association и exporter precision нельзя вывести из одних координат mesh.

## Что доступно в текущем extraction

До группировки имеются `dbId`, fragment ID, triangle indices, vertices, world matrix и `getUnitScale()`. Но `geom.openings()` собирает прозрачные точки элемента в bbox и оставляет `c/t/n/w/d/z0/z1`, теряя fragment/triangle/vertex/matrix provenance. `n` — нормаль XY-габарита, не проверенной поверхности. Convex hull теряет отверстия и разрывы. Native host/room bindings не извлекаются.

`geom.assign()` определяет `space/reg/nin` обходом растра с шагом 0,02 м; `calcLevel0` раздаёт проёмы по этим областям. Это не native association. Openings не включает `positionReader(...,withPrecision)`; сохранённая точность срезов относится к decoded/runtime arithmetic, а source-model reconstruction остаётся unknown.

Read-only `test-facade-extraction.js` запускает настоящий `G.openings()` на синтетических треугольниках: кольцо площадью 8 даёт bbox 9, две несвязные части площадью 2 дают bbox 4. Это воспроизведение потери информации, не оценка пользовательской модели.

Интеграция требует: сначала сохранить доступные source IDs/triangles/vertices/decoder/matrix до bbox; затем получить проверенный native host/room/topology/precision export. Первый шаг не доказывает второй. Collector/API/permissions в live не включались; доступность дополнительных native API для конкретного проекта ещё не установлена.

## Проверки

19 targeted групп: несколько окон, дробление, перестановки, local-frame offset, parallel/adjacent/opposite faces, комнаты/documents, holes, incomplete/excess/overlap coverage, disconnected/point-contact support, reused source IDs, normal/plane/scope conflicts, unknown precision/units/transforms, malformed data, отсутствие production bypass.

Независимый read-only review: дополнительно 587 assertions — 192 комбинации дробления, четыре рациональных поворота, переносы до ±1e9, перестановки, эквивалентные m/mm, frozen input и повреждённые данные. False positive/блокеров изолированного validator не выявлено. Scope/units/reflection defensive правки перепроверены. Это не проверка реальной модели или нормативного расчёта.
