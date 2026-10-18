# Read-only контракт Room evidence, проект 0.1

Статус: проект контракта, автономный Python codec/валидатор ограниченного horizontal-line-plan профиля и синтетические проверки (см. [README](README.md)). Revit SDK exporter не реализован и не запускался в Revit. Контракт не подключён к калькулятору и сам по себе не подтверждает нормативный расчёт.

## Задача и границы

Получить идентичность Room, исходную точку размещения и все границы непосредственно из Revit, сохранив фазу, вариант, уровень, документ и систему координат. Отдельно передать связи окон/дверей с host и Room. Не восстанавливать Room по площади, номеру, габаритам, PDF-заливке или положению текста.

Исполнение — существующий разрешённый Revit API host, в UI-потоке, внешний command с `TransactionMode.ReadOnly`. Не создавать Transaction, не вызывать Save/SaveAs/Synchronize/Regenerate, не менять вид, фазу, активный вариант, Room, модель, координаты или настройки. Только чтение и запись отдельного JSON в выбранный локальный файл. Если API требует изменение документа — вернуть ошибку соответствующей возможности. Автоматическая установка, облачные и платные API не нужны. Запуск такого адаптера здесь не проверен.

## Общие правила представления

JSON UTF-8, `schema = "keo-room-evidence/0.1"`. Все координаты и длины — **исходные internal feet**, площади — ft², объёмы — ft³; `metresPerFoot = 0.3048`. Не читать локализованные числовые строки. Исходные значения сохраняются, отображение в метрах вычисляется отдельно.

`Ref = {documentKey, uniqueId, elementId}`: `elementId` — десятичная **строка**, включая 64-битные ID; `uniqueId` — API UniqueId; documentKey — ключ документа в этой выгрузке. Номер/имя — подписи, не ключи. Один элемент связанного документа в двух экземплярах различается путём link-instance Ref. Viewer dbId и raw PDF ID не являются Revit ElementId.

Для каждого результата чтения: `{status: "ok"|"unavailable"|"unsupported"|"error"|"not-applicable", source, value?, reason?}`. При `ok` value обязателен. Иначе reason обязателен; пропуск поля не равен пустому массиву. В частности, отсутствие FromRoom не означает наружное пространство, отсутствие loops — прямоугольник, а отсутствие окон — доказанное отсутствие света.

## Необходимые поля

| Объект | Необходимые поля / смысл |
|---|---|
| Заголовок | schema; exportId (новый UUID); UTC; exporter id/version/source commit; Revit product/version/build и RevitAPI assembly version; `executedInRevit`, `synthetic`; `readOnly` с методом исполнения. Синтетический файл всегда `executedInRevit=false`, `synthetic=true`. |
| Документы | documentKey; устойчивая идентичность с явно названным источником (локальная/central/cloud, без полного пути и учётных данных); `Document.GetDocumentVersion`: **VersionGUID и NumberOfSaves**, IsModified до/после; ProjectInformation.UniqueId; снимок element VersionGuid; доступность связей. Не считать один VersionGUID доказательством неизменности всех правок. |
| Согласованность | один непрерывный проход без редактирования/вложенных UI-событий; DocumentChanged счётчик, поколения захвата и хеш выходного payload; состояние до/после. Изменение любого документа, события или неопределённый scope отменяет цельный снимок. Несохранённые изменения отмечать явно; не выдавать их за версию файла Viewer. |
| Координаты | `frame="revit-internal-feet"`; `metresPerFoot`; convention `row-major-4x4-column-vector`; transform каждого пути экземпляров из doc-internal feet в root-internal feet; matrix direction, source API и состояние. Root — явная identity. Отдельно ProjectLocation/true-north данные с направлением, **без повторного применения** к internal координатам. |
| Scope | root documentKey; набор Room Ref или явный фильтр; полная таблица фаз, уровней и вариантов с Ref; выбранная фаза каждого чтения; выбранные option-set/option Ref; Main Model — явный `kind="main-model"`. Не переключать активный вариант. Неподдержанный контекст вернуть как unsupported. |
| Связанные документы | каждый link-instance path и type Ref; loaded status; Room Bounding каждого link instance/type по фактическому источнику; transform/path direction; **native `RevitLinkType.GetPhaseMap()` hostPhaseRef → linkedPhaseRef** и статус. Перечень фаз и одинаковые имена не заменяют phase map. Unloaded/invalid map, неизвестный Room Bounding или контекст варианта блокируют cross-link acceptance; вложенные пути проверяются на каждом переходе. |
| Room | Ref; VersionGuid; number/name; API Phase Ref, Created/Demolished Phase Ref/status; DesignOption (Main/Ref); Level Ref; lower/upper constraints, offsets и computation-height контекст; Area/Perimeter/Volume как независимые свойства с единицами и источником; placement/enclosure status. Не терять unplaced, unenclosed, redundant, zero-area и ошибочные записи. |
| RoomLocation | тип Location; для LocationPoint — точный XYZ, source `Room.Location/LocationPoint.Point`; отдельно IsPointInRoom для **реально проверенного XYZ** и фазы/Room контекста. Не переносить Z и не подменять точку центроидом без новой проверки. Точка Room не является нормативной расчётной точкой освещения. |
| Boundary loops | результат `Room.GetBoundarySegments(SpatialElementBoundaryOptions)`; explicit boundary location (например Finish), StoreFreeBoundaryFaces; **все** массивы/сегменты API в исходном порядке; фактическая плоскость/XYZ кривых и computation-height контекст; при неизвестной высоте — unknown, не 1,2 м. Нельзя считать первый массив наружным, остальные отверстиями. |
| Сегмент | index; native curve type; параметрический диапазон; точная Line/Arc и прочие параметры без утраты направления; `BoundarySegment.ElementId`, `LinkElementId`, resolved Ref/path или явная причина отсутствия; category ID/BuiltInCategory; Room Bounding; phase/option; wall/room-separator/other classification и её источник. Не замыкать разрывы продлением или snap. |
| Форма кривых | Line — XYZ двух концов; Arc — center, normal, local axes, radius, start/end parameters, units, orientation; Ellipse/NURBS/Hermite — полные нативные данные либо unsupported с сохранённым типом. Tessellation опциональна и требует метода/погрешности; `Curve.Tessellate()` без гарантии не становится точным контуром. |
| Host windows/doors | scope и полнота перечисления; Ref/VersionGuid/category/type; **Host Ref**, либо unresolved/null с причиной; link/transform path; phase/option/level; `get_FromRoom(phase)` и `get_ToRoom(phase)` с той же явной фазой, Ref и null-причиной; координаты и transform экземпляра. Связь с host или From/To сама по себе не доказывает видимое остекление. Curtain panels/rooflights/прочие типы перечислять отдельными возможностями, не объявлять покрытыми API окон. |
| Ошибки | per-document/per-Room/per-capability warnings; тип исключения и безопасное описание; partial/completeness с точным scope. Не превращать исключение в успешный пустой массив. |

### Отдельная возможность: срез строго на 1,2 м

`GetBoundarySegments` не принимается автоматически за горизонтальное сечение на запрошенной высоте. Для такой проверки необходимо отдельное поле `section`: requested plane в root-internal feet; что именно считается floor и его source; фактическая плоскость; исходный Room solid от SpatialElementGeometryCalculator, его boundary options и состояние; метод пересечения всех оболочек/граней; все loops, отверстия, отдельные компоненты, native provenance и численная точность. Ошибка/неполная геометрия → section unsupported/error. Совпадение площади с Room.Area не разрешает подменить section плановой API-границей. Комнатные разделители сохраняются как **семантические**, светопрозрачные границы; их нельзя объявлять физическими стенами.

## Опциональные данные и обязательность по возможностям

- Для первичной привязки Room достаточно идентичности/контекста, RoomLocation и проверенных API boundary loops. При отсутствии одного из этих блоков файл всё равно сохраняет диагностику; автоматическое принятие Room запрещено.
- Для сопоставления с Viewer обязательно отдельное `viewerBinding`: rootURN/derivative version/view GUID, Units/globalOffset/model/placement transforms с направлением, точная связь Revit snapshot ↔ derivative и несколько независимо идентифицированных конструктивных точек. Если версии не доказанно одинаковы — только сравнение, без автоматического принятия. Контрольные остатки не являются оценкой точности экспорта.
- Для расчёта КЕО необходимы дополнительные проверенные aperture/glazing surfaces, реальные проёмы host, рамы/откосы/затенение, ориентация, геометрия видимости и подтверждённое назначение/нормативная методика. Размеры family/type и bbox не заменяют остекление. Этот минимальный контракт не заявляет такую полноту.
- Tags/leader/text, PDF view/sheet/viewport, display units, материалы, помещения соседей и shared coordinates — опциональны для прямой Room-привязки. Для утверждения происхождения PDF-заливки нужны exporter/view/style/phase/option/clip/transform и связь **конкретного графического примитива** с исходной геометрией, а не только элементом. Если этого нет — `graphicMeaning=unknown`.
- Подтверждённая смежность — отдельные Room Ref по обе стороны конкретной границы в том же контексте. Отсутствие соседнего Room не означает exterior; room separator не означает физический проход, Host — фасад, From/To — направление света.

## Приёмка без подгонки

Локальная выполненная проверка: `node research/revit-room-export/test-raster-limit.js`. Она строит **открытую** исходную рамку с зазором 1 мм; на фиксированных сетках 50/25/12,5 мм инструмент даёт ограниченную цифровую область. Это контрпример выводу «растр замкнулся → исходный контур замкнут». Тест не означает, что такой зазор найден в реальной модели; Revit API в тесте не вызывается. Отсутствие цифровых отверстий также не доказывает отсутствие отверстий меньше клетки или утраченных при экспорте.

1. Проверить схему/единицы/матрицы, полноту scope и ссылок, неподдержанные curve types, снимок до/после. Не принимать неизвестную или устаревшую версию.
2. Пересчитать метрики независимо по нативным кривым: замыкание, самопересечения, пересечения loops, вложенность/отверстия/компоненты, направление, площадь, периметр и принадлежность точки. Допуски записываются **до** реального теста из численной модели, без подбора по Room.Area. Неизвестная source accuracy остаётся неизвестной.
3. Сравнить Area/Perimeter свойств, API loops и отдельного 1,2-м среза с учётом различий boundary-location/computation-height. Несовпадения сохранять; не менять геометрию/коэффициенты и не назначать Room по совпадающей площади.
4. Проверить Host/FromRoom/ToRoom в явной фазе, Main Model/option-set, link paths и реальные соседние Room; отдельно показать разделители, двери, наружные границы и неопределённость.
5. Синтетические случаи: прямоугольник; вогнутость; отверстие; несколько внешних компонент; дуга; открытый gap; самопересечение; касание; unplaced/zero-area; две одинаковые площади; другие фазы/варианты; повтор link с поворотом/зеркалом/переносом; 64-битный ID; неизвестная единица; неизвестная/двойная матрица; смена snapshot.
6. Реальный read-only запуск отдельно подтвердить логом Revit, before/after и отсутствием транзакций; затем проверить 2106 и контрольное 1695, ещё несколько типов без hardcode ID. До такого запуска `Revit execution = NOT TESTED`. Ни валидный JSON, ни успешные синтетические тесты не дают geometryAccepted/normativeAccepted.

## Первичные API-источники (проверены 18.10.2026)

- [Room: Location, Level, Phase и свойства](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/75c9d2c7-a402-ea8b-9e7c-f8bc3510bbd5.htm).
- [GetBoundarySegments: несколько массивов сегментов](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/8e0919af-6172-9d16-26d2-268e42f7e936.htm), [BoundarySegment: generating element/link](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/9a8fc43c-7a89-b6b4-e8ad-3e1e331ac153.htm), [Boundary options](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/ee293124-138d-142d-9ced-9695bc8b8c2e.htm).
- [SpatialElementGeometryCalculator: ограничения получения 3D](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/6dbe1057-76ed-c8e4-1d05-95cf65aa18e7.htm).
- [FromRoom(Phase)](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/c4a37990-0603-50e0-ca97-1cd5449940dd.htm), [ToRoom(Phase)](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/94e34f74-b6d1-2e4b-df44-b93aac5543c6.htm). Не использовать last-phase overload молча.
- [DocumentVersion: GUID и число сохранений; ограничения](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/3574fa56-016e-b146-1499-b3b1c9129705.htm), [GetDocumentVersion и IsModified](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/177e0f88-29a7-7e66-5db8-9f8ae03ae086.htm).
- [Instance.GetTotalTransform: контекст true north](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/8c8aff2b-5ff9-e43a-3b5c-308cd0174f1f.htm). Направление каждой матрицы должно быть явно проверено, не угадано по названию.
- [RevitLinkType.GetPhaseMap: host → link, ошибки unloaded/invalid map](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/4d322c11-c2b3-a096-4f10-3b23c9112308.htm). Карта нужна для вычисления Room geometry с room-bounding links.
