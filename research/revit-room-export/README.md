# Автономный codec Room evidence

`protocol.py` реализует сериализатор и валидатор **ограниченного профиля** `horizontal-line-plan/0.1` согласованного [контракта](CONTRACT.md). Это не Revit SDK exporter: модуль не подключается к Revit, Viewer, сети или исходной модели и не меняет их. Нужен только Python 3.9+ со стандартной библиотекой. Отдельно подготовлен [source-only SDK adapter и binding checker](SDK.md); C# не скомпилирован, реальный Revit/Viewer запуск не выполнен.

## Использование

Из корня репозитория:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B research/revit-room-export/test_protocol.py
python3 -B research/revit-room-export/fixtures.py /tmp/keo-room-examples-new
python3 -B research/revit-room-export/protocol.py /tmp/keo-room-examples-new/hole.json --report /tmp/hole-report-new.json
```

Генератор создаёт синтетические JSON и отдельные `.report.json`, включая отвергнутые gap/bow-tie. Все числа/ID вымышлены; константы категорий общие. Фиксированные UUID в fixtures нужны для воспроизводимости теста, не являются ID реального запуска. Каталог/имена вывода выбирайте новыми: файлы открываются с `x`, существующие файлы **не перезаписываются**.

Сериализация in-memory снимка в исходном формате профиля (без integrity):

```sh
python3 -B research/revit-room-export/protocol.py snapshot.json --serialize snapshot-sealed-new.json --report validation-new.json
```

По умолчанию невалидный снимок не записывается, команда возвращает **2** и объясняет отказ через `code/path/message/severity`. Для диагностического сохранения невалидных исходных полей есть явный `--allow-invalid`: новый файл сохраняется без исправления полей, код возврата остаётся 2. Противоречащий исходному содержимому старый integrity не перехешируется даже этим режимом. Ошибочный/непредставимый JSON не сериализуется. Оригинальный файл остаётся на месте.

Программный API:

```python
text = serialize(snapshot)                  # validated input → JSON envelope
data = deserialize(text)                    # strict parser, not an admission check
report = validate(data)                      # requires integrity by default
report = validate(snapshot, require_integrity=False)  # in-memory capture/fixture only
match = find_rooms(data, "A-01")             # unique / ambiguous / not-found / invalid
```

`find_rooms` никогда не выбирает первую комнату или ближайшую площадь. Два непересекающихся Room могут иметь одинаковый номер: файл допустим, поиск возвращает обе identity/path и ambiguous. Наложение разных Room в одном проверенном горизонтальном контексте — ошибка `ambiguous-room-overlap`. Контакт границ разных комнат разрешён, но **не объявляется подтверждённой смежностью**.

## Машинное представление профиля

Полный небольшой пример создаёт `fixtures.sample()`. Обязательные группы:

- `schema`, `profile`, UUID `exportId`, UTC `createdUtc`; строки `producer.id/version/sourceCommit`; `execution.readOnly=true`, противоположные boolean `synthetic`/`executedInRevit`, строка `method`. Декларация запуска сама по себе не проверена.
- `units`: ровно `frame=revit-internal-feet`, `length=ft`, `area=ft2`, `volume=ft3`, `metresPerFoot=0.3048`, `matrixConvention=row-major-4x4-column-vector`. Числа не конвертируются и не выводятся из размера модели.
- `documents[]`: key, identity `{kind,value}`, ProjectInformation UniqueId, строки Revit product/version/build/apiVersion, равные before/after `{versionGuid,numberOfSaves,isModified,generation}`, DocumentChanged count=0. Несохранённый, но стабильный снимок допускается только для автономного исследования с предупреждением. Версия Viewer из этого не выводится.
- `elements[]`: точная Ref `{documentKey,uniqueId,elementId}` и VersionGuid, kind. ElementId — положительная int64 **строка**, не JS number. Phase имеет уникальный внутри документа `order`; Level — `elevationFt`; DesignOption — `setRef`. Пространственные элементы имеют phase, level, option, createdPhase/demolishedPhase результаты. Native `lifecycleCapability={status:"ok",source:"Element.HasPhases",value:false}` разрешает **только room/room-separator** оба lifecycle RR not-applicable; exact boolean/source обязательны, Room.phase/category/path проверяются отдельно. Legacy записи без capability сохраняют строгий created-phase контракт. Категория хранит id/BuiltInCategory/source; known kind должен соответствовать обоим ID. `other` не маскирует известную категорию. Boundary generator дополнительно требует Room Bounding=true с источником. Для link lifecycle не требуется отсутствующий у RevitLinkInstance Level.
- `scope`: rootDocumentKey/rootPhase/rootOption/complete, явная identity rootTransform и **точный список** rooms `[{ref,path}]`. Полнота относится к этому выбранному списку, не ко всем помещениям здания. Неизвестный/повторный/пропущенный target не отбрасывается молча.
- Link-instance: typeRef, childDocumentKey, loaded, Room Bounding, childOption; transform result с `source=RevitLinkInstance.GetTransform` и value `{fromDocumentKey,toDocumentKey,matrix}` (child→parent feet); native `RevitLinkType.GetPhaseMap` со всеми host phases. Проверяются lifecycle каждого перехода, фазовый порядок/полнота/одинаковая карта одного type и циклы. Room и generating element сохраняют отдельный путь экземпляров.
- `rooms[]`: ref/path/number/name/placement, properties areaFt2/perimeterFt/volumeFt3 с source Room.Area/Perimeter/Volume; limits lower/upper Level и offsets/computationHeightFt; LocationPoint, исходный XYZ и отдельный IsPointInRoom **для того же** XYZ/Room/phase. Нулевая/невычисленная Volume допустима в этом 2D-профиле с явным статусом; положительные Area/Perimeter необходимы. Zero-area/unplaced/unenclosed сохраняются в диагностическом режиме и отклоняются для проверки плана.
- `boundaries`: результат `Room.GetBoundarySegments` с boundary location, StoreFreeBoundaryFaces, complete, фактической planeZFt и всеми loops. Каждый segment имеет последовательный index, Line start/end XYZ и generator result `{ref,path}` с source `BoundarySegment.ElementId/LinkElementId`. Координаты кривой относятся к документу Room, identity generator — к своему instance path.
- `openings`: result, value `{complete,scope:"selected-room-hosts-and-phase-relations",items}`. Каждый window/door — ref/path/typeUniqueId/locationFt, host result `FamilyInstance.Host`, instanceTransform `FamilyInstance.GetTransform`; fromRoom/toRoom с `source=FamilyInstance.get_FromRoom(Phase)`/`get_ToRoom(Phase)` и **внешним phase даже при null/ошибке**. При ok value дополнительно содержит phase и target `{ref,path}`. В этом профиле Host и From/To принадлежат тому же документу/path, что FamilyInstance; linked-face host требует отдельного будущего профиля. Null — статус/причина, не exterior. Перечень проверяет известные окна/двери с учётом повторных instance paths; не доказывает полноту перечисления нативного API. Для нескольких фаз/вариантов одного документа профиль консервативен и может потребовать отдельные снимки.
- `section` сохраняется как явный unsupported/not-applicable результат с причиной. Значение ok отвергается: проверка Room solid section на 1,2 м здесь не реализована. `GetBoundarySegments` не подменяется таким срезом.

`ReadResult = {status,source,value}` при ok, иначе `{status,source,reason}` без value. Отсутствие объекта результата — ошибка. Конкретные значения проверяются внутри каждого блока. Неизвестные дополнительные JSON-поля сохраняются без изменения; они не получают статуса проверенной возможности. Флаги допуска `geometryAccepted`, `seedAccepted`, `normativeAccepted`, `revitExecutionVerified`, `adjacencyAccepted` в любом месте исходных данных должны отсутствовать либо быть **exact false**.

## Что проверяется математически

Для горизонтальных **Line** loops в сохранённых координатах:

- точное совпадение концов без snap, нулевые сегменты, самопересечения/обратный ход, касания/пересечения между loops;
- вложенность всех loops независимо от порядка/обхода, отверстия, острова и отдельные компоненты;
- строгое попадание XY LocationPoint в заполненную область (не на границу/в отверстие); 3D IsPointInRoom остаётся декларацией источника;
- наложение разных Room, включая совпадающие/частично выровненные границы, отверстия, зеркальные/повёрнутые/повторные и вложенные links;
- площадь/периметр с **показанным** отличием от свойств Room, без подгонки или принятия Room по площади.

2D predicates, составление матриц, vertical bounds и сравнения используют `Fraction` над сохранёнными binary64 числами. Это точность арифметики представленного JSON, **не точность Revit/экспортёра/модели**. Длины/отображаемые метрики округляются Python float. Жёсткость матрицы проверяется с фиксированным арифметическим порогом 1e-12 для orthonormal consistency, а не строительным/геометрическим допуском. Масштаб, shear, perspective, неправильное направление/единицы отвергаются; отражение разрешено.

## Целостность и пределы

`integrity` содержит SHA-256 канонического payload без самого integrity: Python JSON, sorted keys, compact separators, UTF-8, allow_nan=false. Это собственный формат `python-json-sorted-utf8-v1`, **не RFC 8785 и не подпись**. Он обнаруживает изменение payload после формирования файла и не удостоверяет Revit, read-only исполнение, истинность API source, scope или metadata. Duplicate JSON keys, NaN/Infinity, не-JSON значения и неподдержанные типы не исправляются молча. Известные API-source поля сверяются с поддержанным словарём; для параметров/классификации остаются декларации источника.

Ограничения ресурсов профиля: JSON ≤5 MiB, глубина ≤64, Rooms ≤256, elements ≤20000, path ≤16 переходов, ≤512 Line segments на Room и ≤8192 в выбранном наборе. Превышение — объяснимый отказ, не усечение. Файл предназначен для небольшого выбранного набора, а не полного здания.

В отчёте `valid=true` означает только прохождение этих автономных проверок профиля. `localLineChecksPassed` относится к локальной проверке записи, не к глобальной совместимости/достоверности Room. `geometryAccepted/seedAccepted/normativeAccepted/revitExecutionVerified/sourceAccuracyVerified/viewerBindingVerified` всегда false. Проверка SDK exporter, Arc/NURBS, Room solid/среза, реальной смежности, glazing/aperture, Viewer version binding и нормативных исходных данных остаётся отдельной работой. Реальные данные CHER/1226 сюда не загружались.
