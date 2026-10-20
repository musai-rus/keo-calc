# Сохранённый код локальных опытов Viewer

Архив исследовательских скриптов на 20.10.2026. Сохранён в черновой ветке по просьбе автора, чтобы код панели и вспомогательные опыты можно было продолжить на другом компьютере. Это не самостоятельный установщик и не новая опубликованная кнопка. Формулы ручного калькулятора не менялись.

`keo-viewer-local-panel.js` — функция установки временной панели с планами, диагностикой проёмов и явным выбором τ₁/τ₂. Принимает `lib` с KEO, DATA, Report, Schemes, NativeSpaces, NativeSide, Optics и синтетические `fixtures`. Работает поверх глобальных снимков `KeoNativeSectionAudit`, `KeoNativeOpeningAudit`, `KeoNativeApertureAudit`, `KeoIfcRelationAudit` в существующей вкладке Autodesk Viewer. Версия с вкладкой «Проёмы» прошла только проверку синтаксиса; визуальный прогон остановлен потерей соединения с расширением. Удалены статические подписи тестовой модели/региона: это не меняет геометрический алгоритм. Фильтр кружковых — только интерфейс текущего опыта, не правило расчёта или восстановления помещений.

Браузерные сборщики используют `NOP_VIEWER` и THREE из текущего Viewer:

- `native-ifc-live-audit.js` требует `KeoNativeGeom` (BimGeom), `KeoNativeSpaces` (BimNativeSpaces) и `KeoIfcSpaceProperties` (BimIfcSpaceProperties). Строит диагностические сечения, не нормативные точки.
- `native-opening-live-audit.js` дополнительно требует `KeoNativeRays` (BimNativeRays) и `KeoOpeningEntityRows` — заранее прочитанный список `{id, IfcClass, GlobalId}` текущей PropertyDB. Отбирает Rooms и прозрачные фрагменты для диагностических лучей. Это ограниченный профиль экспорта, не общий классификатор физических материалов.
- `native-aperture-live-audit.js` требует результата предыдущего сборщика и `KeoNativeApertures` (BimNativeApertures); извлекает плоские контуры фрагментов.

Модули находятся в `bim/`; сборщики лишь связывают их с браузером. Исходники нужно исполнять через разрешённый доступ к выбранной вкладке. Обновление страницы теряет несохранённые глобальные снимки. Проверка текущего экземпляра/части преобразований в этих скриптах ещё не подтверждает ревизию и точность конвертации. Не считать этот архив доказательством корректной принадлежности проёмов или КЕО.

## Локальная обработка

Node.js, без установки зависимостей; команды из корня репозитория. Аргументы `SOURCE.ifc`, `PRIVATE/...` обозначают реальные приватные файлы пользователя, которые нужно предоставить отдельно. Папка вывода должна существовать. Выходные файлы создаются без перезаписи существующих.

```text
node research/viewer-local-preview/audit-ifc-relations.cjs SOURCE.ifc PRIVATE/relations.json
node research/viewer-local-preview/prepare-aperture-preview.cjs PRIVATE/relations.json PRIVATE/identities.json PRIVATE/preview.json
node research/viewer-local-preview/audit-aperture-projections.cjs PRIVATE/apertures.json PRIVATE/sections.json PRIVATE/projections.json
node research/viewer-local-preview/prepare-keo-panel-fixtures.cjs PRIVATE/fixtures.json
```

`identities.json`: `{model, entities:[{id, IfcClass, GlobalId}]}` из той же модели Viewer. `sections.json` — снимок `KeoNativeSectionAudit`; `apertures.json` — снимок `KeoNativeApertureAudit` (для проекционного опыта допустим сохранённый набор четырёх крупнейших участков с полным `patchCount`). `preview.json` устанавливается как `KeoIfcRelationAudit`. GUID-сопоставление не подтверждает ревизию. Приватные снимки и исходный IFC в архив не входят.

Синтетические fixtures генерируются существующим тестом `bim/test-native-side-input.js`, включая его проверки; они не являются данными реальной модели. Крупные JSON нельзя отправлять расширению одной строкой: предыдущая передача около 3 МБ оборвала транспорт. Повторное подключение и установка обновлённой панели ещё требуют проверки.

Подробные результаты и следующий алгоритмический шаг: [журнал исследования](../../bim/NATIVE-OPENINGS-RESEARCH.md). Порядок сохранения каждого этапа и Slack-тред закреплены в [AGENTS.md](../../AGENTS.md).

Проверка переноса 20.10.2026: синтаксис всех восьми скриптов проверен Node; четыре локальные утилиты выполнены заново. JSON отношений IFC, компактного превью, проекций и синтетических fixtures побайтово совпали с сохранёнными результатами прежних запусков. Нового браузерного прогона не было.
