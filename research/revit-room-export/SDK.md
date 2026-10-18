# Read-only SDK capture и сверка с Viewer — source 0.1

**Исходник подготовлен, не скомпилирован и не запущен в Revit.** На Mac нет `dotnet`, `csc`, `mcs`, Windows Revit и официальных SDK assemblies. Python/Node tests ниже не тестируют C# execution. Никакие DLL/SDK не скачивались, add-in не установлен. Модель, настройки, текущий калькулятор и опубликованный сайт не изменены.

## Поддержанный исходный target

[sdk/CaptureCommand.cs](sdk/CaptureCommand.cs), [project](sdk/Keo.RoomEvidence.csproj): C# / `net8.0-windows`, Revit **2026**, API assembly **26.x**, **точный** `Application.VersionBuild` из запроса. Это заявленный source target, не подтверждённая совместимость бинарника. Нельзя объявлять все обновления 2026 совместимыми: Autodesk отдельно описал переход 2025/2026 с .NET 8 на .NET 10. Текущий исходник отклоняет runtime major != 8; для .NET 10 или иного Revit необходимы отдельные target, сборка и реальный тест. Revit 2024 (.NET Framework), 2025 и 2027 этим проектом не поддерживаются.

На уже имеющемся Windows build host с официальным Revit 2026 и .NET 8 SDK:

```powershell
dotnet build research/revit-room-export/sdk/Keo.RoomEvidence.csproj --configuration Release -p:RevitInstallDir="C:\Program Files\Autodesk\Revit 2026"
```

Команда здесь **не выполнялась**. Проект ссылается только на локальные `RevitAPI.dll`/`RevitAPIUI.dll`, `Private=false`; NuGet packages, download/install scripts и готового `.addin` нет. Сборка без установленного target pack может пытаться восстановить стандартные Microsoft framework assets — это отдельное действие оператора, здесь оно не запускалось. После сборки требуется авторизованный существующий add-in host/регистрация команды `Keo.RoomEvidence.CaptureCommand`; подготовка исходника не разрешает её установку.

## Ограниченный capture

Команда имеет `[Transaction(TransactionMode.ReadOnly)]`, читает JSON-запрос через стандартный file picker и создаёт **новый** `.json` по `OutputPath` (`FileMode.CreateNew`). Она не сохраняет RVT, не открывает/не обновляет другую модель, не вызывает транзакции, regeneration, sync, настройки проекта, сеть или расчёт КЕО. Ошибки возвращают `Result.Failed`; частичный результат не объявляется успешным. ReadResult сохраняет API error/unsupported, такие данные профиль может отвергнуть.

Первый target намеренно ограничен **уже открытым, сохранённым, неизменённым standalone local root RVT**, Main Model, одной явной фазой, 1–256 выбранными Room UniqueId. Cloud/workshared/linked documents и relevant design options отвергаются; исходные данные не переключаются. Links шире описаны в codec, но **этот SDK target их не реализует**. Unplaced/неполные ограничения могут прервать capture; это диагностический отказ, не пропуск комнаты из scope. Не обещана поддержка всех категорий boundary generators: неизвестные Level/lifecycle/Room Bounding остаются препятствием.

Запрос (все значения-примеры заменить фактическими; не использовать номер комнаты вместо UniqueId):

```json
{
  "PhaseUniqueId": "EXACT_PHASE_UNIQUE_ID",
  "RoomUniqueIds": ["EXACT_ROOM_UNIQUE_ID"],
  "ExpectedSourceSha256": "64_LOWERCASE_HEX_FROM_EXACT_SAVED_SOURCE_RVT",
  "ExpectedRevitBuild": "EXACT_APPLICATION_VERSION_BUILD",
  "SourceCommit": "EXACT_COMMIT_OF_REVIEWED_ADAPTER",
  "OutputPath": "C:\\private-evidence\\room-capture-new.json"
}
```

Файл удерживается открытым только для чтения без разрешения writers. Если Revit/file system не допускает такой handle — явный blocker; автоматического ослабления share mode нет. До/после сравниваются SHA-256, `Document.GetDocumentVersion(doc)` (GUID **и** save count), `BasicFileInfo.GetDocumentVersion` файла, `IsModified`; отслеживаются `DocumentChanged` активного doc и generation. Это наблюдение состояния и файла, не цифровая подпись или оценка точности экспортёра. Пути и имя RVT в результат не включаются.

Phase комнаты читается через `get_Parameter(BuiltInParameter.ROOM_PHASE_ID)` **со StorageType.ElementId** и разрешением в Phase. Не используется несуществующее документированное `Room.Phase`, строка названия или подстановка CreatedPhaseId. Для не-Room пространственных записей `phase` — явный контекст чтения; Created/Demolished Phase читаются отдельно. `Element.HasPhases()` сохраняется как exact boolean capability: только Room/room-separator при false могут иметь оба lifecycle RR not-applicable; их spatial phase/category/context по-прежнему проверяются. Для wall/window/door/link/other false не даёт обхода lifecycle. Если separator не имеет нативного LevelId, текущий source target отказывает без геометрического угадывания уровня. Level высота — `ProjectElevation` (с явной API semantics), computation height — `LEVEL_ROOM_COMPUTATION_HEIGHT`. Фактический Z плановых кривых сохраняется отдельно; он не объявляется срезом 1,2 м.

Все loops/сегменты `GetBoundarySegments(Finish, StoreFreeBoundaryFaces=true)` сохраняются в API-порядке. Только bounded native `Line` получает start/end. Arc/Ellipse/NURBS и прочие типы сохраняют native type + unsupported, **не** превращаются в хорды, tessellation или Lines. Свободный/linked/unresolved generator не получает выдуманный Ref. Line Z и концы не округляются/не сплющиваются/не соединяются. SDK не проверяет замыкание вместо codec.

Окна/двери перечисляются через весь `FilteredElementCollector(FamilyInstance)`, затем отбираются по выбранным boundary hosts либо фактическому From/To выбранной Room в явной Phase. Ошибка enumeration/phase relation прерывает capture; она не становится пустым inventory. `Host`, `get_FromRoom(phase)`, `get_ToRoom(phase)`, `GetTransform`, type/location и lifecycle сохраняются; null не значит exterior. Curtain panels/rooflights/glazing этим перечислением не покрыты.

## Raw capture → codec

C# выдаёт raw JSON без integrity: канонизация Python отличается от `System.Text.Json`. Не добавлять придуманную совместимую подпись. На реальном raw capture сначала выполнить существующий codec:

```sh
python3 -B research/revit-room-export/protocol.py capture.json --serialize capture-sealed-new.json --report capture-validation-new.json
```

Код 2, неподдержанная кривая, открытый loop, неизвестный Room Bounding/phase, stale source или иной отказ **запрещают** следующий шаг приёмки. `--allow-invalid` предназначен лишь для диагностического сохранения с кодом 2. Даже при valid=true все флаги geometry/seed/normative/Revit/source-accuracy/Viewer verification остаются false.

## Binding evidence

[viewer_binding.py](viewer_binding.py) сравнивает sealed export, **независимую запись фактической загрузки/конвертации** и snapshot текущего Viewer. CLI:

```sh
python3 -B research/revit-room-export/viewer_binding.py capture-sealed.json conversion-manifest.json current-viewer.json --current-session CURRENT_SNAPSHOT_SESSION --report binding-report-new.json
```

Выход 0 означает только `bindingConsistent=true`: предоставленные документы согласованы по ограниченным условиям. Все admission/verification flags остаются false. Выход 2 — объяснимый отказ. Unsigned JSON и строка evidenceReference не аутентифицируют источник. Нельзя заполнить отсутствующие поля предположениями ради прохождения проверки. Session должен быть получен от текущего capture, а `assertCurrent()` проверен непосредственно перед использованием; offline session string сам по себе не доказывает свежесть браузера.

Обязательные поля manifest/snapshot: `schema="keo-viewer-binding/0.1"`; `kind="conversion-manifest"` / `"current-viewer-snapshot"`; точные `rootUrn`, **immutable** `derivativeVersion`, `viewGuid`; `phase` Ref и `option` из реально проверенного контекста; `units={source:"ft",viewer:"m",metresPerFoot:0.3048,matrixConvention:"row-major-4x4-column-vector"}`; `transformDirection="root-internal-feet-to-viewer-metres"`; `sourceToViewer` row-major 4×4. Масштаб ровно feet→metres, rigid/mirror часть без shear/подгонки; одинаковая матрица в обоих источниках. Manifest дополнительно содержит `source`, равный SDK `sourceSnapshot` (SHA256 + versionGuid + save count + ProjectInformation UniqueId), и `evidenceReference` настоящей conversion записи. Snapshot дополнительно содержит `session`, stable=true, loadedModelCount=1, is2d=false.

`controlPoints`: 4–32 независимо идентифицированных, неплоских точек, в каждом объекте `sourceUniqueId`, `sourceFt:[x,y,z]`, `viewerM:[x,y,z]`, `method="independent-native-point"`. Точки Viewer нельзя вычислять той же матрицей вместо измерения/чтения независимого соответствия. Одинаковый перечень в manifest/snapshot проверяется без least-squares fit. Сейчас допустимый остаток **ровно 0 над сохранёнными binary64**: ненулевой округлительный остаток также даёт отказ, пока не согласована численная модель конкретного exporter. Это консервативная граница прототипа, не требование к точности Revit/Viewer и не оценка source accuracy.

Пример полной вымышленной структуры создаёт `test_viewer_binding.fixture()`; успешные tests не заменяют эти входы. Root-only ограничение относится и к binding этой версии.

[viewer_snapshot.js](viewer_snapshot.js) — изолированный **read-only диагностический collector**, использует существующий `BimViewerBinding.capture/assert` и переданное окружение. `RoomEvidenceViewerSnapshot.capture(bindingApi, window)` возвращает snapshot и `assertCurrent()`. Он читает только уже загруженный 3D Viewer, копирует raw unitScale/globalOffset/matrices, отказывает при смене Viewer/матриц. Ничего не скачивает, не запускает KEO, не меняет globals/модель/настройки. **Не внедрён и не выполнялся на живой модели в этом этапе.** Public Viewer не гарантирует immutable derivative version, native Phase/Option UniqueId и независимые control points: collector оставляет их null с причинами, а `sourceToViewer` не угадывает из globalOffset. Такой snapshot **будет отклонён** binding validator. Заполнение возможно лишь дополнительным проверенным источником фактического derivative context; ручная догадка по названию фазы не подходит.

## Конкретные входы для реального следующего теста

1. Уже доступный Windows host с официальным Revit **точного build 2026 / API26 / runtime8** и SDK, .NET8 build tools; разрешённый add-in host. Нужны build log и API assembly versions. Установку здесь не проводили.
2. **Точный сохранённый source RVT**, из которого получен открытый derivative: доступный local standalone файл, SHA-256, DocumentVersion GUID+save count, ProjectInformation UniqueId. Другой local/central/cloud copy не объявляется тем же файлом.
3. Явные Phase UniqueId и Room UniqueId для первой контрольной выборки; подтверждённый Main Model. Номера и названия — только удобные подписи.
4. Реальный raw capture + before/after + read-only run log; после codec — sealed JSON и полный report. Неподдержанный native generator/curve/context должен дать отказ с причиной.
5. Запись **фактического upload/conversion**, связывающая SHA256/DocumentVersion из п.2 с точными rootURN, immutable derivative revision и viewGUID, фазой/вариантом и transform. **Сейчас этой записи нет**; filename или существующий URN не заменяют её.
6. Свежий read-only snapshot того же открытого Viewer и проверка `assertCurrent`, реальный source→Viewer transform и минимум 4 независимых неплоских соответствия точек с их provenance. **Сейчас эти обязательные binding inputs не получены.**

До появления этих входов реальный export↔Viewer binding и Revit execution — **NOT TESTED**, geometry/seed/normative acceptance — 0. Подготовку source этапа можно завершить; это конкретный набор входов для запуска, а не основание бесконечно усложнять калькулятор.

## Доступные проверки

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B research/revit-room-export/test_protocol.py
PYTHONDONTWRITEBYTECODE=1 python3 -B research/revit-room-export/test_viewer_binding.py
node research/revit-room-export/test-viewer-snapshot.js
```

На локальном checkpoint: 51/51 protocol, 9/9 binding, 26 JS-наборов (включая snapshot); оба build прошли, четыре численные сверки byte-identical baseline. Восемь CLI-примеров: согласованное вымышленное evidence — только bindingConsistent=true/verified=false; другая модель/revision/phase/units/transform/stale/unknown derivative — exit2. Независимый read-only review не выявил новых source blockers, 664 malformed-подстановки без crash. Это offline codec/binding tests и mocked Viewer state/lifecycle, **не C# compile/test и не live SDK QA**. Кроме них выполнять стандартные сборки, JS regression и численные сверки из AGENTS.md. Source review также не подтверждает бинарную совместимость.

## Официальные API-источники, проверены 18.10.2026

- [TransactionMode.ReadOnly](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/84254a1f-7bba-885a-ce65-e68fc238fddb.htm).
- [Room API 26.4: Location, boundaries, limits, Area/Perimeter/Volume](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/75c9d2c7-a402-ea8b-9e7c-f8bc3510bbd5.htm), [BuiltInParameter: ROOM_PHASE_ID / LEVEL_ROOM_COMPUTATION_HEIGHT / WALL_ATTR_ROOM_BOUNDING](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/fb011c91-be7e-f737-28c7-3f1e1917a0e0.htm), [Level.ProjectElevation](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/895ef506-bfea-cc4e-31f8-aad2af6672e4.htm).
- [Element.HasPhases](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/5d850f8a-4a50-406b-6c59-b85d49dcbb2e.htm). Отсутствие lifecycle — отдельная возможность, не неизвестная фаза.
- [GetDocumentVersion](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/177e0f88-29a7-7e66-5db8-9f8ae03ae086.htm), [DocumentVersion](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/3574fa56-016e-b146-1499-b3b1c9129705.htm), [BasicFileInfo.GetDocumentVersion](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/117de15c-6642-4216-cd85-8c31eb42cbca.htm).
- [BoundarySegment native element/link provenance](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/9a8fc43c-7a89-b6b4-e8ad-3e1e331ac153.htm), [FromRoom(Phase)](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/c4a37990-0603-50e0-ca97-1cd5449940dd.htm), [ToRoom(Phase)](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/94e34f74-b6d1-2e4b-df44-b93aac5543c6.htm).
- [Autodesk: Revit 2025/2026 .NET8→.NET10 migration preview](https://aps.autodesk.com/blog/call-preview-testing-revit-20262025-migration-net-10). Нельзя молча переносить target на новое runtime.
