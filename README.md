# OpenTouch

Лёгкая программа проекционного маппинга для macOS: поверхности (quad + сетка + маски) с видео на проекторе, вне поверхностей — чистый чёрный. База для будущих генеративных источников (шейдеры, скетчи) и нодового UI.

- Дизайн: [`docs/superpowers/specs/2026-11-09-opentouch-mapper-v1-design.md`](docs/superpowers/specs/2026-11-09-opentouch-mapper-v1-design.md)
- План реализации: [`docs/superpowers/plans/2026-11-09-opentouch-mapper-v1.md`](docs/superpowers/plans/2026-11-09-opentouch-mapper-v1.md)
- Ручной чек-лист: [`docs/manual-test-checklist.md`](docs/manual-test-checklist.md)
- **Скачать и установить на Mac (.dmg): [`docs/RUN-ON-MAC.md`](docs/RUN-ON-MAC.md)**

## Запуск

```bash
npm install
```

```bash
npm run dev
```

Без проектора окно вывода можно открыть обычным окном на основном экране:

```bash
OPENTOUCH_FAKE_DISPLAY=1 npm run dev
```

## Горячие клавиши

| Действие | Клавиши |
|---|---|
| Edit / Show | `Tab` |
| Тест-сетка (нет → выбранная → все) | `T` |
| Play / Pause | `Space` |
| Углы ↔ сетка | `G` |
| Рисовать маску (клик по первой точке замыкает) | `M` |
| Прилипание вкл/выкл | `S` |
| Сдвиг на 1 / 10 px | стрелки / `Shift`+стрелки |
| Дублировать / удалить | `⌘D` / `⌫` |
| Undo / Redo | `⌘Z` / `⇧⌘Z` |
| Открыть / сохранить | `⌘O` / `⌘S` |
| Отменить жест / маску | `Esc` |

## Тесты

```bash
npm test
```

`npm test` = typecheck + юнит-тесты (Vitest) + рендер/UI-тесты (Playwright, Chromium). Тесты самого Electron-приложения:

```bash
npm run test:e2e
```

Видеофикстуры (H.264/HEVC 1080p) генерируются, нужен ffmpeg:

```bash
./scripts/make-fixtures.sh
```
