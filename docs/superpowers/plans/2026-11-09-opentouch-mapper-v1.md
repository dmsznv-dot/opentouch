# OpenTouch Mapper v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron-приложение для macOS: вывод на проектор настраиваемых поверхностей (quad + grid warp + маски) с видео, вне поверхностей — RGB 0.

**Architecture:** Один renderer-процесс владеет моделью, источниками и двумя `Renderer` (превью редактора + окно проектора, открытое через same-origin `window.open`). Чистое ядро `src/core` (модель, команды, warp-математика) без DOM; `src/renderer` — WebGL, источники, выходы, React UI; `src/main` — дисплеи, файлы, автозапуск, сторож.

**Tech Stack:** Electron (точная версия, текущий stable 45.x), electron-vite, TypeScript (strict), React 18, WebGL2, earcut (триангуляция масок), Vitest, Playwright (Chromium для рендер-тестов, `_electron` для e2e).

**Spec:** `docs/superpowers/specs/2026-11-09-opentouch-mapper-v1-design.md`

## Global Constraints

- Платформа продукта — macOS; все версии зависимостей закреплены точно (без `^`/`~`).
- Координаты вывода и поверхностей нормализованы 0..1, начало — **левый верхний** угол проектора; UV источника 0..1, начало — левый верхний угол кадра. Перевод в clip space только в шейдере: `x*2-1`, `1-y*2`.
- Вне поверхностей пиксели вывода ровно `0,0,0`. Канвас вывода — `alpha:false`.
- Окно вывода: `backgroundColor: '#000000'`, `show:false` до `ready-to-show`, `cursor:none`, без рамки.
- Медиа отдаются через собственный протокол `otmedia://` (не `file://`).
- Плотность меша — 32 подразделения на ячейку сетки; точность < 0.5 px при 1920×1080.
- Видео: H.264 гарантированно; HEVC — по результату Task 0b. Звук по умолчанию выключен (`muted: true`).
- Undo-история — максимум 200 шагов; drag = один шаг.
- Автосохранение — каждые 30 с при изменениях, 5 копий `<file>.otproj.autosave.<1..5>`.
- Прилипание точек — радиус 8 px экрана редактора; стрелки — 1 px вывода, Shift — 10 px.
- `src/core/**` не импортирует DOM, WebGL, Electron, React.
- Окружение разработки агента — Linux-контейнер без доступа к бинарникам Electron (GitHub releases закрыт прокси). Всё, что можно, тестируется в Node (Vitest) и Playwright Chromium; тесты `_electron` и Task 0b запускаются на Mac пользователя. Каждый такой шаг помечен **[Mac]**.

## Review Focus

1. **Вырожденный quad** (три угла на одной прямой, «бантик» при перетаскивании угла через противоположный) — программа не падает, нет NaN в буферах; поверхность не рисуется, в редакторе контур красный. → тесты в Task 3 и Task 5.
2. **Незамкнутая маска / маска < 3 точек** (в процессе рисования) — не затемняет поверхность целиком, игнорируется. → тест в Task 9.
3. **Пути с кириллицей и пробелами** (`/Users/дима/Видео/my clip.mp4`) — видео открывается, путь переживает сохранение. → тест в Task 11.
4. **inputRect нулевого размера** (рамку свели в линию) — зажимается до минимума 0.01, рендер без деления на ноль. → тест в Task 6.
5. **Undo после перетаскивания** — один `⌘Z` отменяет весь drag, а не последний пиксель. → тест в Task 6.

---

## File Structure

```
package.json, electron.vite.config.ts, tsconfig.json, tsconfig.node.json, tsconfig.web.json
vitest.config.ts, playwright.config.ts
scripts/make-fixtures.sh                 # ffmpeg → tests/fixtures/*.webm|mp4
src/shared/ipc.ts                        # имена IPC-каналов и типы payload
src/shared/media-url.ts                  # path <-> otmedia:// URL
src/core/types.ts                        # типы модели из spec §4 + PointRef
src/core/ids.ts                          # newId
src/core/project.ts                      # create/serialize/deserialize
src/core/ops.ts                          # чистые операции над Project
src/core/store.ts                        # ProjectStore: state + undo/redo + dirty
src/core/warp/homography.ts
src/core/warp/grid.ts
src/core/warp/mesh.ts
src/core/geometry/hit.ts                 # hit-test, point-in-polygon, позиции ручек
src/core/geometry/snap.ts
src/main/index.ts                        # bootstrap, окно редактора, протокол otmedia
src/main/displays.ts                     # DisplayManager + chooseDisplay
src/main/output-window.ts                # опции окна вывода, setWindowOpenHandler
src/main/project-io.ts                   # чтение/запись, относительные пути, поиск медиа
src/main/autosave.ts
src/main/settings.ts                     # userData/settings.json
src/main/lifecycle.ts                    # автозапуск, сторож, восстановление
src/preload/index.ts                     # contextBridge: window.opentouch
src/renderer/index.html, output.html, main.tsx
src/renderer/sources/types.ts, registry.ts, video.ts, testpattern.ts
src/renderer/outputs/types.ts, projector.ts
src/renderer/gl/context.ts, shaders.ts, renderer.ts, mask.ts, overlay.ts
src/renderer/engine.ts
src/renderer/ui/App.tsx, TopBar.tsx, SurfaceList.tsx, SourceList.tsx, Inspector.tsx
src/renderer/ui/Viewport.tsx, InputViewport.tsx, useStore.ts, shortcuts.ts
src/renderer/ui/interaction/output-tool.ts   # чистый state machine мыши для Output
src/renderer/ui/interaction/input-tool.ts
tests/unit/**.test.ts                    # Vitest (core, main-хелперы, interaction)
tests/render/harness.html, harness.ts, *.spec.ts   # Playwright Chromium + vite
tests/e2e/*.spec.ts                      # Playwright _electron [Mac]
docs/manual-test-checklist.md
spikes/                                  # одноразовый код спайков, не импортируется
```

---

### Task 0a: Спайк — общий WebGL/видео между окнами через `window.open`

Ответ, а не код. Всё в `spikes/window-open/` — выбрасывается.

**Files:**
- Create: `spikes/window-open/index.html`, `spikes/window-open/output.html`, `spikes/window-open/check.spec.ts`

- [ ] **Step 1:** `index.html` создаёт `<video>` (fixture VP9 webm, loop, muted) в своём документе, вызывает `window.open('output.html')`, после `load` дочернего окна создаёт `<canvas>` в **дочернем** документе, получает на нём `webgl2`, в rAF дочернего окна делает `texImage2D(video)` и рисует full-screen quad. Параллельно второй WebGL2-контекст на canvas в родительском окне рисует то же видео.
- [ ] **Step 2:** Playwright Chromium (`check.spec.ts`): открыть страницу через vite/static server, дождаться popup, через 1 с прочитать пиксель центра обоих canvas (`readPixels` внутри rAF). Ожидается: оба не чёрные, ошибок в консоли нет.
- [ ] **Step 3:** Run: `npx playwright test spikes/window-open/check.spec.ts`. Ожидается PASS.
- [ ] **Step 4 [Mac]:** то же в Electron: минимальный `main.js` с `setWindowOpenHandler` → `{action:'allow'}`; визуально оба окна показывают видео.
- [ ] **Step 5:** Записать результат в spec §9 п.2 (факт + версия Chromium/Electron). Если FAIL — остановиться, вернуться к выбору архитектуры с пользователем.
- [ ] **Step 6:** Commit `docs: record window.open spike result`.

### Task 0b [Mac]: Спайк — HEVC в Electron на macOS

- [ ] **Step 1:** `scripts/make-fixtures.sh` генерирует `tests/fixtures/bars-h264.mp4` и `bars-hevc.mp4` (1920×1080, 5 с, `ffmpeg -f lavfi -i testsrc2`; HEVC с `-tag:v hvc1`), плюс `bars.webm` (VP9 64×64, 2 с) для Chromium-тестов.
- [ ] **Step 2:** В спайке Task 0a подставить HEVC-файл, запустить в Electron на Mac. Проверить: видео играет; `video.getVideoPlaybackQuality().droppedVideoFrames` за 10 с < 5.
- [ ] **Step 3:** Записать результат в spec §9 п.1 и в Global Constraints этого плана. Commit.

### Task 1: Каркас проекта

**Files:** `package.json`, конфиги из File Structure, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/ui/App.tsx`, `tests/unit/smoke.test.ts`, `tests/e2e/launch.spec.ts`

**Interfaces:**
- Produces: скрипты `npm run dev | build | test:unit | test:render | test:e2e | typecheck`.

- [ ] **Step 1:** Инициализировать electron-vite + React + TS (strict). Зависимости закрепить точно. Окно редактора 1440×900, `backgroundColor:'#111111'`, `contextIsolation:true`, `nodeIntegration:false`, sandbox по умолчанию (если Task 0a Step 4 показал, что sandbox блокирует доступ к DOM popup, — `sandbox:false` с комментарием-ссылкой на результат спайка).
- [ ] **Step 2:** `tests/unit/smoke.test.ts`: `expect(1+1).toBe(2)`; Run `npm run test:unit` → PASS.
- [ ] **Step 3:** `npm run typecheck` и `npm run build` → без ошибок.
- [ ] **Step 4 [Mac]:** `tests/e2e/launch.spec.ts`: `_electron.launch` → первое окно, `title === 'OpenTouch'`. Run `npm run test:e2e` → PASS.
- [ ] **Step 5:** `.gitignore` (node_modules, out, dist, test-results). Commit `chore: scaffold electron-vite app`.

### Task 2: Типы модели и (де)сериализация

**Files:** Create `src/core/types.ts`, `src/core/ids.ts`, `src/core/project.ts`; Test `tests/unit/project.test.ts`

**Interfaces:**
- Produces:
  - все типы spec §4 (`Vec2, Project, SourceDef, VideoParams, TestPatternParams, Surface, GridWarp, Mask`), плюс
    `type Quad = [Vec2, Vec2, Vec2, Vec2]` (TL, TR, BR, BL),
    `type PointRef = { surfaceId: string; kind: 'corner'|'grid'|'handle'|'mask'; index: number; maskId?: string }`
  - `newId(prefix: string): string` — `${prefix}_${8 hex}`
  - `CURRENT_VERSION = 1`
  - `createProject(width = 1920, height = 1080): Project` — пустые sources/surfaces, `output.type = 'projector'`
  - `createSurface(id: string, name: string): Surface` — corners `(0.25,0.25) (0.75,0.25) (0.75,0.75) (0.25,0.75)`, inputRect `{0,0,1,1}`, `visible:true`, `opacity:1`, `sourceId:null`, `grid:null`, `masks:[]`
  - `serializeProject(p: Project): string` — `JSON.stringify(p, null, 2)`
  - `deserializeProject(json: string): Project` — бросает `ProjectFormatError` (`code: 'invalid' | 'too-new'`)

- [ ] **Step 1: тесты**
  - `roundtrip`: `deserializeProject(serializeProject(p))` глубоко равен `p` (с одной поверхностью и источником).
  - `rejects newer version`: `{version: 2, ...}` → `ProjectFormatError` с `code === 'too-new'`.
  - `rejects garbage`: `'{'` и `'{"version":1}'` (нет `surfaces`) → `code === 'invalid'`.
  - `createSurface defaults`: значения как выше.
- [ ] **Step 2:** Run `npx vitest run tests/unit/project.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать. Валидация — ручная проверка формы верхнего уровня и массивов (без zod).
- [ ] **Step 4:** Run → PASS. Commit `feat(core): project model and serialization`.

### Task 3: Гомография

**Files:** Create `src/core/warp/homography.ts`; Test `tests/unit/homography.test.ts`

**Interfaces:**
- Produces:
  - `type Mat3 = Float64Array` (9, row-major)
  - `computeHomography(src: Quad, dst: Quad): Mat3 | null` — `null`, если любые 3 точки `src` или `dst` коллинеарны (|cross| < 1e-9) или система вырождена
  - `unitSquareToQuad(q: Quad): Mat3 | null` — src = `(0,0)(1,0)(1,1)(0,1)`
  - `invertMat3(m: Mat3): Mat3 | null`
  - `applyHomography(h: Mat3, p: Vec2): Vec2 | null` — `null`, если `|w| < 1e-9`
  - `homographyW(h: Mat3, p: Vec2): number`

- [ ] **Step 1: тесты**
  - углы единичного квадрата переходят в углы quad `(0.1,0.2)(0.8,0.1)(0.9,0.9)(0.2,0.7)` с точностью 1e-9;
  - центр `(0.5,0.5)` переходит в пересечение диагоналей того же quad (свойство перспективы);
  - `applyHomography(invertMat3(H), applyHomography(H, p))` ≈ `p` для 20 случайных точек;
  - **Review Focus 1:** `unitSquareToQuad` с тремя коллинеарными углами `(0,0)(0.5,0)(1,0)(0,1)` → `null`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать DLT: 8×8 линейная система, Гаусс с частичным выбором ведущего элемента, `h33 = 1`.
- [ ] **Step 4:** Run → PASS. Commit `feat(core): homography`.

### Task 4: Интерполяция сетки

**Files:** Create `src/core/warp/grid.ts`; Test `tests/unit/grid.test.ts`

**Interfaces:**
- Consumes: `GridWarp`, `Vec2`.
- Produces:
  - `gridIndex(g: GridWarp, i: number, j: number): number` — `j*(cols+1)+i`
  - `createGrid(cols: number, rows: number, mode?: GridWarp['mode']): GridWarp` — нулевые offsets, mode по умолчанию `'smooth'`
  - `defaultHandles(cols: number, rows: number): Vec2[]` — 4 на точку, порядок `[+u, -u, +v, -v]`, значения `(±1/(3·cols), 0)` и `(0, ±1/(3·rows))`
  - `withGridMode(g: GridWarp, mode): GridWarp` — при переходе в `'bezier'` без handles ставит `defaultHandles`
  - `evaluateGridOffset(g: GridWarp, u: number, v: number): Vec2` (u,v ∈ [0,1])
  - `resampleGrid(g: GridWarp, cols: number, rows: number): GridWarp` — offsets = `evaluateGridOffset` в новых узлах; handles для bezier = `defaultHandles`

- [ ] **Step 1: тесты**
  - нулевые offsets → `(0,0)` везде для всех трёх режимов;
  - в узлах сетки все режимы возвращают ровно offset узла (1e-12);
  - `linear`: в середине ячейки — среднее 4 углов;
  - `smooth` и `bezier` с `defaultHandles` при **линейном** поле offsets (`offset = (0.1u, 0)`) дают то же линейное поле внутри ячеек (1e-9) — проверка, что сплайны не «гуляют»;
  - `resampleGrid(g, 4, 4)` из 2×2: значения в общих узлах (u,v ∈ {0, 0.5, 1}) совпадают с исходными.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать:
  - `linear` — билинейно по 4 узлам ячейки;
  - `smooth` — бикубический Catmull-Rom по 4×4 узлам, индексы за краем зажимаются (clamp) **с линейной экстраполяцией** `P[-1] = 2P[0] - P[1]` (иначе линейное поле на краях искривляется);
  - `bezier` — бикубический патч Безье ячейки (i,j), контрольная сетка 4×4 в пространстве offsets. Пусть `L(s,t)` — билинейная интерполяция offsets 4 узлов ячейки, `d(k,dir) = h[k][dir] - defaultHandle[dir]` — отклонение ручки узла `k` от базовой:
    ```
    P[a][b] = L(a/3, b/3)                          базовая сетка (линейное поле → линейный патч)
    углы    P[0][0], P[3][0], P[0][3], P[3][3]     = offsets узлов (добавок нет)
    рёбра   P[1][0] += d(i,j,+u);   P[2][0] += d(i+1,j,-u)
            P[0][1] += d(i,j,+v);   P[0][2] += d(i,j+1,-v)   (аналогично для остальных рёбер)
    внутр.  P[1][1] += d(i,j,+u) + d(i,j,+v)       (каждая внутренняя — сумма двух ручек ближайшего угла)
    ```
    Значение — тензорное произведение кубических Бернштейнов по локальным (s,t) ячейки. С `defaultHandles` все `d = 0` → патч совпадает с билинейным.
- [ ] **Step 4:** Run → PASS. Commit `feat(core): grid warp interpolation`.

### Task 5: Меш поверхности

**Files:** Create `src/core/warp/mesh.ts`; Test `tests/unit/mesh.test.ts`

**Interfaces:**
- Consumes: `unitSquareToQuad`, `applyHomography`, `homographyW` (Task 3); `evaluateGridOffset` (Task 4).
- Produces:
  - `interface SurfaceMesh { positions: Float32Array; uvs: Float32Array; indices: Uint32Array; outline: Vec2[]; valid: boolean }` — positions в координатах вывода 0..1; uvs в UV источника; `outline` — граница меша по часовой стрелке (для hit-test и красного контура)
  - `buildSurfaceMesh(s: Pick<Surface,'corners'|'grid'|'inputRect'>, subdiv = 32): SurfaceMesh`

- [ ] **Step 1: тесты**
  - без сетки, quad = весь экран → 4 угла позиций = `(0,0)(1,0)(1,1)(0,1)`; `(33·33)` вершин; uvs углов = углы `inputRect`;
  - `inputRect {0.5,0,0.5,1}` → uv левого верхнего угла `(0.5,0)`;
  - **точность**: quad с сильной перспективой `(0.1,0.1)(0.9,0.3)(0.9,0.7)(0.1,0.9)`; для каждого треугольника центроид позиций сравнить с `H(центроид (u,v))`; max отклонение × 1920 < 0.5;
  - **Review Focus 1:** коллинеарные углы → `valid === false`, все буферы пустые; «бантик» (TR и BR поменяны местами) → `valid === false` (смена знака `w` или самопересечение outline), нет `NaN`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать: сэмплы `(cols·subdiv+1) × (rows·subdiv+1)`, `local = (u,v) + evaluateGridOffset`, `pos = H(local)`; `valid=false`, если `H == null`, любая `w` ≤ 0 или outline самопересекается.
- [ ] **Step 4:** Run → PASS. Commit `feat(core): surface mesh builder`.

### Task 6: Операции и ProjectStore (undo/redo)

**Files:** Create `src/core/ops.ts`, `src/core/store.ts`; Test `tests/unit/ops.test.ts`, `tests/unit/store.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces (`ops.ts`, все возвращают новый `Project`, вход не мутируют):
  - `addSurface(p, s: Surface): Project`
  - `duplicateSurface(p, id: string, newSurfaceId: string): Project` — вставка сразу над оригиналом, сдвиг corners на `(+0.02,+0.02)`, новые id у масок (`newId('mask')`), имя `"<имя> copy"`
  - `removeSurface(p, id)`, `reorderSurface(p, id, toIndex: number)`
  - `updateSurface(p, id, patch: Partial<Omit<Surface,'id'>>)`
  - `setInputRect(p, id, r)` — зажимает в [0,1], `w,h ≥ 0.01`
  - `movePoints(p, refs: PointRef[], delta: Vec2)` — delta в координатах вывода; для `corner`/`mask` — прямое сложение; для `grid`/`handle` — `local' = H⁻¹(H(local) + delta)`, сохраняется разница с базовой позицией узла
  - `setGridSize(p, id, cols, rows)` (через `resampleGrid`; `cols=rows=0` → `grid=null`), `setGridMode(p, id, mode)` (через `withGridMode`)
  - `addMask(p, surfaceId, m: Mask)`, `updateMask(p, surfaceId, maskId, patch)`, `removeMask(p, surfaceId, maskId)`
  - `addSource(p, d: SourceDef)`, `removeSource(p, id)` — у поверхностей `sourceId → null`, `updateSourceParams(p, id, patch)`
  - `setOutputSize(p, width, height)`
- Produces (`store.ts`):
  ```ts
  class ProjectStore {
    constructor(initial: Project)
    get(): Project
    subscribe(fn: () => void): () => void
    dispatch(label: string, fn: (p: Project) => Project): void
    begin(label: string): void   // транзакция: dispatch внутри не пишет в историю
    end(): void                  // один шаг истории = состояние до begin
    cancel(): void               // откат к состоянию до begin
    undo(): void; redo(): void; canUndo(): boolean; canRedo(): boolean
    replace(p: Project): void    // загрузка проекта, очищает историю, dirty=false
    isDirty(): boolean; markSaved(): void
  }
  ```
  История — снапшоты (модель иммутабельна), лимит 200.

- [ ] **Step 1: тесты ops**
  - `duplicateSurface`: новый id, тот же `sourceId`, corners сдвинуты на 0.02, индекс = оригинал+1, id масок отличаются;
  - `removeSource`: поверхности с этим источником получают `sourceId === null`;
  - `movePoints` corner: corner 0 сдвинут на delta;
  - `movePoints` grid: после сдвига узла на `(0.01,0)` в выводе `buildSurfaceMesh` даёт позицию этого узла, смещённую на `(0.01,0)` (1e-9);
  - **Review Focus 4:** `setInputRect(p, id, {x:0.5,y:0.5,w:0,h:0})` → `w === 0.01 && h === 0.01`; `{x:0.995, w:0.5}` → `x + w <= 1`.
- [ ] **Step 2: тесты store**
  - dispatch → undo → состояние исходное; redo → снова изменённое;
  - **Review Focus 5:** `begin('drag')`, 50 × `dispatch(movePoints …)`, `end()` → один `undo()` возвращает исходное состояние;
  - `cancel()` возвращает состояние до `begin`, история не растёт;
  - 250 dispatch → `undo` возможен ровно 200 раз;
  - `isDirty` после dispatch `true`, после `markSaved` `false`, после `replace` `false`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Реализовать. **Step 5:** Run → PASS. Commit `feat(core): ops and undoable store`.

### Task 7: Геометрия редактора — hit-test и прилипание

**Files:** Create `src/core/geometry/hit.ts`, `src/core/geometry/snap.ts`; Test `tests/unit/geometry.test.ts`

**Interfaces:**
- Consumes: `buildSurfaceMesh` (Task 5), `unitSquareToQuad`.
- Produces:
  - `type Handle = { ref: PointRef; pos: Vec2 }`
  - `collectHandles(p: Project, surfaceId: string, level: 'corners' | 'grid'): Handle[]` — `corners` → 4 угла + точки масок; `grid` → узлы сетки (+ ручки, если bezier); позиции в координатах вывода
  - `hitHandle(handles: Handle[], at: Vec2, radius: Vec2): Handle | null` — ближайшая в эллипсе радиуса
  - `pointInPolygon(pt: Vec2, poly: Vec2[]): boolean` (even-odd)
  - `hitSurface(p: Project, at: Vec2): string | null` — верхняя видимая поверхность, чей `outline` содержит точку
  - `handlesInRect(handles: Handle[], r: {x,y,w,h}): Handle[]`
  - `snapPoint(pt: Vec2, candidates: Vec2[], radius: Vec2): Vec2`
  - `snapCandidates(p: Project, excludeSurfaceId: string): Vec2[]` — углы и узлы сетки остальных видимых поверхностей

- [ ] **Step 1: тесты** — `hitSurface` выбирает верхнюю из двух перекрывающихся; скрытая игнорируется; `snapPoint` притягивает в радиусе и не трогает вне; `collectHandles(…,'grid')` для сетки 2×2 возвращает 9 узлов; `handlesInRect` выбирает только внутри.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(core): hit testing and snapping`.

### Task 8: WebGL-рендерер (без масок) + рендер-тест «чёрного»

**Files:** Create `src/renderer/gl/context.ts`, `shaders.ts`, `renderer.ts`, `src/renderer/sources/types.ts`, `src/renderer/sources/testpattern.ts`; `tests/render/harness.html`, `tests/render/harness.ts`, `tests/render/black.spec.ts`, `playwright.config.ts` (проект `render`: Chromium, vite dev server на `tests/render`)

**Interfaces:**
- Consumes: `buildSurfaceMesh`, типы.
- Produces:
  - `sources/types.ts`:
    ```ts
    type SourceStatus = 'loading' | 'ready' | 'error' | 'missing';
    interface Source { readonly id: string; readonly width: number; readonly height: number;
      readonly status: SourceStatus; readonly error?: string;
      update(gl: WebGL2RenderingContext, tex: WebGLTexture, timeSec: number): boolean;
      dispose(): void; }
    interface SourceContext { mediaUrl(path: string): string; document: Document }
    interface SourceFactory<P> { type: string; defaults(): P; create(id: string, params: P, ctx: SourceContext): Source }
    ```
  - `testPatternFactory: SourceFactory<TestPatternParams>` — 2D canvas 1024×1024: `grid` (белые линии каждые 64 px на тёмно-сером + цифры), `checker`, `corners` (красный TL, зелёный TR, синий BR, жёлтый BL); `update` загружает один раз
  - `createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext` — `{alpha:false, antialias:true, premultipliedAlpha:true, preserveDrawingBuffer:false}`; бросает `Error('WebGL2 unavailable')`
  - ```ts
    interface RenderFrame {
      project: Project; sources: ReadonlyMap<string, Source>; timeSec: number;
      size: { width: number; height: number };              // пиксели drawing buffer
      overlay: OverlayState | null;                         // null в Show / в выводе Show
      testPattern: 'none' | 'selected' | 'all'; selectedSurfaceId: string | null;
    }
    class Renderer { constructor(gl: WebGL2RenderingContext); render(f: RenderFrame): void; dispose(): void }
    ```
    `OverlayState` объявляется здесь (используется в Task 10): `{ selectedSurfaceId: string|null; selectedPoints: PointRef[]; level: 'corners'|'grid'; draftMask: Vec2[] | null; marquee: {x,y,w,h} | null }`
  - Renderer держит текстуру на источник (своя на каждый контекст), кэш мешей по ключу `JSON(corners,grid,inputRect)`; невалидный меш не рисуется; источник не `ready` → поверхность рисуется чёрной (не пропускается).
  - `tests/render/harness.ts` экспортирует в `window`: `renderToPixels(projectJson: string, w: number, h: number, opts?): Promise<Uint8Array>` — RGBA, строки сверху вниз; использует testpattern-источники.

- [ ] **Step 1: тесты (`black.spec.ts`)**
  - **главный:** 2 поверхности с testpattern `checker` (без масок), 320×180: каждый пиксель, центр которого вне `outline` обеих поверхностей с запасом 1.5 px, равен `0,0,0`; хотя бы 90 % пикселей внутри с запасом 1.5 px ненулевые;
  - поверхность `visible:false` → весь кадр `0,0,0`;
  - `opacity: 0` → весь кадр `0,0,0`;
  - невалидный quad (коллинеарные углы) → весь кадр `0,0,0`, без ошибок консоли;
  - `corners` паттерн на полноэкранной поверхности: пиксель (5,5) красный, (w-5,5) зелёный — проверка ориентации осей.
- [ ] **Step 2:** Run `npm run test:render` → FAIL.
- [ ] **Step 3:** Реализовать. Шейдер: `vec2 uv = clamp(vUv, rect.xy + halfTexel, rect.xy + rect.zw - halfTexel); out = texture(src, uv) * mask * opacity;` blend `ONE, ONE_MINUS_SRC_ALPHA`. Маска пока — белая 1×1.
- [ ] **Step 4:** Run → PASS. Commit `feat(gl): renderer with black-outside guarantee`.

### Task 9: Маски

**Files:** Create `src/renderer/gl/mask.ts`; Modify `src/renderer/gl/renderer.ts`; Test `tests/render/mask.spec.ts`

**Interfaces:**
- Produces: `class MaskCache { constructor(gl); get(surface: Surface, size: {width,height}): WebGLTexture; dispose() }` — возвращает R8-текстуру размера вывода; без пригодных масок — общая белая 1×1. Ключ кэша = `JSON(masks) + size`.
- Алгоритм: для каждой маски с ≥ 3 точками — триангуляция `earcut`, отрисовка в временный R8 FBO (1.0), сепарабельный gaussian blur с σ = `feather/2` px (если `feather > 0`). Комбинирование в итоговый FBO: `inc = max(include_i)` (если include нет — 1.0), `exc = max(exclude_i)`, `mask = inc * (1 - exc)`.

- [ ] **Step 1: тесты**
  - include-прямоугольник в центре полноэкранной поверхности → пиксели вне прямоугольника `0,0,0`, внутри ненулевые;
  - exclude-круг (32 точки) внутри include → центр круга `0,0,0`;
  - `feather: 10` → на границе include есть пиксели со значением строго между 0 и максимумом;
  - **Review Focus 2:** маска из 2 точек → кадр идентичен кадру без масок.
- [ ] **Step 2–4:** FAIL → реализация (добавить `earcut` точной версией) → PASS. Commit `feat(gl): include/exclude masks with feather`.

### Task 10: Оверлей редактирования

**Files:** Create `src/renderer/gl/overlay.ts`; Modify `renderer.ts`; Test `tests/render/overlay.spec.ts`

**Interfaces:**
- Consumes: `OverlayState` (Task 8), `collectHandles` (Task 7).
- Produces: `drawOverlay(gl, project: Project, meshes: Map<string, SurfaceMesh>, o: OverlayState, size)` — для всех видимых поверхностей тонкий контур `outline` (серый; невалидный меш — красный контур по `corners`); для выбранной — линии сетки (голубой), ручки 8×8 px (белые, выделенные — оранжевые), контуры масок (жёлтый), `draftMask` (пунктир), `marquee`.

- [ ] **Step 1: тесты** — `overlay: null` → черный вне поверхностей (как Task 8); с overlay → пиксель у угла выбранной поверхности не чёрный; невалидная поверхность → есть красные пиксели.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(gl): edit overlay`.

### Task 11: Видео-источник, реестр, протокол otmedia

**Files:** Create `src/renderer/sources/video.ts`, `src/renderer/sources/registry.ts`, `src/shared/media-url.ts`; Modify `src/main/index.ts` (протокол); Test `tests/unit/media-url.test.ts`, `tests/render/video.spec.ts`

**Interfaces:**
- Produces:
  - `mediaUrlFromPath(absPath: string): string` → `otmedia://file/` + сегменты пути через `encodeURIComponent`; `pathFromMediaUrl(url: string): string`
  - main: `protocol.registerSchemesAsPrivileged([{scheme:'otmedia', privileges:{standard:true, secure:true, stream:true, supportFetchAPI:true}}])` и `protocol.handle('otmedia', req => net.fetch(pathToFileURL(pathFromMediaUrl(req.url))))`
  - `videoFactory: SourceFactory<VideoParams>` — `<video>` в `ctx.document`, `muted`, `loop`, `playbackRate`, `playsInline`, `preload='auto'`; `update` загружает кадр только если с прошлого вызова сработал `requestVideoFrameCallback`; статусы: `loading` → `ready` (`loadeddata`), `error` (`error`, `error` = «Кодек не поддерживается — перекодируйте в H.264», если `MEDIA_ERR_SRC_NOT_SUPPORTED`), `missing` (выставляется извне, Task 15). По `ended` без loop — держит последний кадр. Методы `play()`, `pause()`, `restart()` на `VideoSource`.
  - `registry.ts`: `registerSource(f: SourceFactory<any>)`, `getFactory(type: string): SourceFactory<any>`; по умолчанию зарегистрированы `video`, `testpattern`.

- [ ] **Step 1: тесты**
  - **Review Focus 3:** `pathFromMediaUrl(mediaUrlFromPath('/Users/дима/Видео/my clip #1.mp4'))` === исходный путь; URL не содержит пробелов и `#`;
  - render: video-источник с `tests/fixtures/bars.webm` на полноэкранной поверхности → через 1 с центр не чёрный; несуществующий файл → `status === 'error'` за 3 с, кадр `0,0,0`.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(sources): video source and otmedia protocol`.

### Task 12: Output, ProjectorOutput и Engine

**Files:** Create `src/renderer/outputs/types.ts`, `src/renderer/outputs/projector.ts`, `src/renderer/output.html`, `src/renderer/engine.ts`; Test `tests/render/engine.spec.ts`

**Interfaces:**
- Consumes: `Renderer`, `ProjectStore`, registry.
- Produces:
  - `Output` — ровно как в spec §3.
  - `class ProjectorOutput implements Output` (+ `onClosed(cb: () => void): () => void`); `openProjectorOutput(): Promise<ProjectorOutput | null>` — `window.open('output.html', 'opentouch-output')`, ждёт `load`, создаёт `<canvas>` на весь экран (размер буфера = `innerWidth·devicePixelRatio × innerHeight·devicePixelRatio`, обновляется на `resize`), `onFrame` — rAF дочернего окна; событие `closed` (polling `win.closed` раз в 500 мс) → `onClosed(cb)`.
  - `output.html`: `<html style="background:#000"><body style="margin:0;background:#000;cursor:none;overflow:hidden">`.
  - ```ts
    type Mode = 'edit' | 'show';
    class Engine {
      constructor(store: ProjectStore, ctx: SourceContext)
      attachEditorCanvas(c: HTMLCanvasElement): void   // превью, ≤ 30 fps
      setOutput(o: Output | null): void                 // главный такт — o.onFrame; без выхода — rAF редактора
      setMode(m: Mode): void; getMode(): Mode
      setOverlay(o: OverlayState): void                 // в Show оверлей только в превью
      setTestPattern(t: RenderFrame['testPattern']): void
      play(): void; pause(): void; restart(): void
      getSource(id: string): Source | undefined
      subscribeStatus(fn: () => void): () => void       // статусы источников для UI
    }
    ```
    Engine синхронизирует `project.sources` с живыми `Source` (создаёт/удаляет через registry при изменении store), источники создаются в `document` редактора.

- [ ] **Step 1: тесты (Chromium)** — `engine.spec.ts`: страница-харнесс создаёт Engine с testpattern-поверхностью, `openProjectorOutput()`; в popup canvas через 500 мс пиксель внутри поверхности ненулевой, вне — `0,0,0`; `setMode('show')` → в выводе нет пикселей цвета оверлея, в превью есть; закрытие popup → `onClosed` вызван, Engine продолжает рендер превью без ошибок.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat: engine and projector output`.

### Task 13: Дисплеи и окно вывода (main)

**Files:** Create `src/main/displays.ts`, `src/main/output-window.ts`, `src/shared/ipc.ts`; Modify `src/main/index.ts`, `src/preload/index.ts`; Test `tests/unit/displays.test.ts`, `tests/e2e/output-window.spec.ts` [Mac]

**Interfaces:**
- Produces:
  - `type DisplayInfo = { id: number; label: string; bounds: {x,y,width,height}; scaleFactor: number; primary: boolean }`
  - `chooseDisplay(all: DisplayInfo[], hint: Project['output']['displayHint'], fake: boolean): DisplayInfo | null` — порядок: совпадение id+размер → совпадение id → первый не основной → `fake ? primary : null`
  - `class DisplayManager extends EventEmitter` — `list()`, `current(): DisplayInfo|null`, `select(id: number|null)`; событие `'changed'` на `display-added/removed/metrics-changed`
  - `outputWindowOptions(d: DisplayInfo): BrowserWindowConstructorOptions` — `backgroundColor:'#000000'`, `show:false`, `frame:false`, `x,y,width,height = d.bounds`, `hasShadow:false`, `enableLargerThanScreen:true`; после `ready-to-show` → `setSimpleFullscreen(true)` (на не-macOS — `setFullScreen(true)`), затем `show()`
  - `setWindowOpenHandler` окна редактора: URL `output.html` → `{action:'allow', overrideBrowserWindowOptions: outputWindowOptions(current)}`; без дисплея → `{action:'deny'}`
  - `OPENTOUCH_FAKE_DISPLAY=1` — использовать основной дисплей обычным окном 960×540 (для разработки без проектора)
  - IPC (`shared/ipc.ts`, через `window.opentouch` в preload): `displays.list(): Promise<DisplayInfo[]>`, `displays.select(id: number|null)`, `displays.onChanged(cb: (s: {current: DisplayInfo|null, all: DisplayInfo[]}) => void)`
  - Renderer-логика (в `App` или `engine` glue): при `current` → `null` закрыть вывод; при появлении — `openProjectorOutput()` и восстановить режим.

- [ ] **Step 1: unit-тесты** `chooseDisplay` — все 4 ветки; `outputWindowOptions` — `backgroundColor === '#000000'`, `show === false`, bounds из дисплея.
- [ ] **Step 2–4:** FAIL → реализация → PASS.
- [ ] **Step 5 [Mac]:** e2e с `OPENTOUCH_FAKE_DISPLAY=1`: после «Open output» существует второе окно, `getBackgroundColor() === '#000000'`, в его document `body` computed `cursor === 'none'`.
- [ ] **Step 6:** Commit `feat(main): display management and output window`.

### Task 14: Каркас UI — панели, списки, верхняя панель

**Files:** Create `src/renderer/ui/useStore.ts`, `TopBar.tsx`, `SurfaceList.tsx`, `SourceList.tsx`; Modify `App.tsx`; Test `tests/e2e/ui-basics.spec.ts` [Mac], `tests/render/ui-basics.spec.ts` (React-часть в Chromium с моком `window.opentouch`)

**Interfaces:**
- Consumes: `ProjectStore`, `Engine`, ops, IPC.
- Produces:
  - `useProject<T>(store, selector: (p: Project) => T): T` — `useSyncExternalStore`
  - `type EditorState` и `useEditorState(): [EditorState, (patch: Partial<EditorState>) => void]` — локальное UI-состояние: `selectedSurfaceId`, `selectedPoints`, `level`, `tab: 'output'|'input'`, `snap: boolean`, `testPattern`
  - Раскладка spec §6: TopBar (выбор дисплея, Edit/Show, тест-сетка, play/pause, имя проекта + `•` при dirty), слева SurfaceList (добавить / дублировать / удалить / глаз / drag для z-order) и SourceList (добавить видео — `opentouch.media.pick()` IPC, диалог фильтр `mp4,mov,m4v,webm`; добавить тестовый паттерн; статус источника иконкой), центр — заглушка вьюпорта, справа — заглушка инспектора.
  - Drag-n-drop видеофайла в окно → `addSource` + привязать к выбранной поверхности, если у неё `sourceId === null`.

- [ ] **Step 1: тесты (Chromium с моком IPC)** — клик «+ Surface» → в store 1 поверхность и она выделена; «Duplicate» → 2; глаз → `visible:false`; добавление тестового паттерна → в списке источников.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(ui): editor shell and lists`.

### Task 15: Вьюпорт Output — взаимодействие

**Files:** Create `src/renderer/ui/interaction/output-tool.ts`, `src/renderer/ui/Viewport.tsx`; Test `tests/unit/output-tool.test.ts`

**Interfaces:**
- Consumes: `collectHandles`, `hitHandle`, `hitSurface`, `handlesInRect`, `snapPoint`, `snapCandidates` (Task 7); ops; `ProjectStore.begin/end/cancel`.
- Produces — чистый state machine без DOM:
  ```ts
  type ToolState = { mode: 'idle'|'dragPoints'|'dragSurface'|'marquee'|'drawMask'; ... };
  interface ToolEnv { store: ProjectStore; editor: EditorState; pxToNorm: Vec2 /* размер 1 px экрана в норм. координатах */; outputPx: Vec2 /* 1 px вывода */ }
  function pointerDown(s: ToolState, env: ToolEnv, at: Vec2, mods: {shift: boolean}): ToolState
  function pointerMove(s: ToolState, env: ToolEnv, at: Vec2, mods): ToolState
  function pointerUp(s: ToolState, env: ToolEnv, at: Vec2): ToolState
  function nudge(env: ToolEnv, dir: Vec2, big: boolean): void   // 1 px / 10 px вывода
  function startMask(s, env): ToolState; function cancelMask(s, env): ToolState
  ```
  Правила: down на ручке → выделить (Shift — добавить) и `begin('Move points')`; down внутри поверхности не на ручке → выделить поверхность, `begin('Move surface')` (двигаются все corners + точки масок); down в пустоте → marquee; при `snap` — к позиции перетаскиваемой ручки применяется `snapPoint` с радиусом `8 · pxToNorm`; up → `end()`; Esc во время drag → `cancel()`. `drawMask`: клики добавляют точки в `draftMask`; клик в радиусе 8 px от первой точки при ≥ 3 точках → `addMask(include, feather 0)`.
  `Viewport.tsx`: canvas превью через `engine.attachEditorCanvas`, pointer-события → tool, `overlay` → `engine.setOverlay`, letterbox по аспекту вывода, сохраняющий пропорции.

- [ ] **Step 1: тесты** — drag угла на (10,0) px экрана перемещает corner на `10·pxToNorm.x`; snap притягивает угол к углу соседней поверхности в 5 px и не притягивает в 12 px; drag поверхности = один шаг undo; marquee выделяет 2 из 4 углов; рисование маски из 4 кликов + клик в первую точку → 1 маска с 4 точками; Esc в drag → состояние как до drag; `nudge` вправо → `+1/outputWidth`.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(ui): output viewport interaction`.

### Task 16: Вьюпорт Input и инспектор

**Files:** Create `src/renderer/ui/interaction/input-tool.ts`, `src/renderer/ui/InputViewport.tsx`, `src/renderer/ui/Inspector.tsx`; Test `tests/unit/input-tool.test.ts`

**Interfaces:**
- Produces:
  - input-tool: drag внутри рамки — перемещение `inputRect`, drag за 8 ручек — изменение размера; всё через `setInputRect` и `begin/end`.
  - `InputViewport`: кадр источника выбранной поверхности (2D canvas, `drawImage(video)` ≤ 30 fps) + рамка.
  - `Inspector`: для поверхности — имя, источник (select), opacity (0–100), сетка (Off / cols×rows 1–32), режим сетки (linear/smooth/bezier), список масок (mode, feather 0–200 px, удалить); для источника — loop, rate (0.1–4), звук. Изменения слайдеров — одна транзакция на жест (`begin` на pointerdown, `end` на pointerup).

- [ ] **Step 1: тесты** — drag рамки за правую ручку меняет только `w`; перемещение рамки упирается в край (x+w ≤ 1).
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(ui): input viewport and inspector`.

### Task 17: Горячие клавиши

**Files:** Create `src/renderer/ui/shortcuts.ts`; Modify `App.tsx`; Test `tests/unit/shortcuts.test.ts`

**Interfaces:**
- Produces: `resolveShortcut(e: {key: string; metaKey: boolean; shiftKey: boolean; targetIsInput: boolean}): Action | null`, где `Action` — `'duplicate'|'delete'|'undo'|'redo'|'save'|'toggleMode'|'toggleTest'|'playPause'|'toggleLevel'|'drawMask'|'toggleSnap'|'cancel'|{nudge: Vec2, big: boolean}`. Таблица — spec §6. В текстовых полях (`targetIsInput`) срабатывают только `⌘`-сочетания.

- [ ] **Step 1: тесты** — каждая строка таблицы spec §6 → ожидаемый Action; `Backspace` в input → `null`; `⌘Z` в input → `'undo'`.
- [ ] **Step 2–4:** FAIL → реализация + подключение в `App` → PASS. Commit `feat(ui): keyboard shortcuts`.

### Task 18: Файлы проекта, перепривязка медиа, автосохранение

**Files:** Create `src/main/project-io.ts`, `src/main/autosave.ts`, `src/main/settings.ts`; Modify preload, `ipc.ts`, `App.tsx`; Test `tests/unit/project-io.test.ts`, `tests/unit/autosave.test.ts` (Node, временные каталоги)

**Interfaces:**
- Produces:
  - `toProjectRelative(p: Project, projectFile: string): Project` — абсолютные `params.path` → относительные (POSIX-разделители)
  - `resolveMediaPath(stored: string, projectFile: string): Promise<string | null>` — абсолютный существует → относительный от папки проекта → поиск по имени файла в папке проекта (глубина 3) → `null`
  - `autosaveName(projectFile: string, n: number): string` — `${projectFile}.autosave.${n}`
  - `writeAutosave(projectFile: string, json: string, keep = 5): Promise<void>` — сдвиг 1→2…, 5 удаляется, запись в 1
  - `latestAutosave(projectFile: string): Promise<string | null>`
  - Безымянный проект → `userData/untitled.otproj`
  - `settings.ts`: `{ lastProject: string|null; autostart: boolean; lastMode: 'edit'|'show' }`, `getSettings()`, `updateSettings(patch)`
  - IPC: `project.open(): Promise<{path, json} | null>`, `project.save(json, path?): Promise<string>` (без path — диалог Save As), `project.autosave(json, path|null)`, `project.resolveMedia(stored, projectFile): Promise<string|null>`, `media.relink(): Promise<string|null>`
  - Renderer: при открытии — `deserializeProject`, для каждого видео `resolveMedia` → найден: подставить абсолютный путь в рантайме; нет: источник `missing` + кнопка «Relink» в SourceList. `ProjectFormatError` → диалог с текстом «Файл создан более новой версией OpenTouch» / «Файл проекта повреждён»; файл не трогается. Таймер 30 с: `if (store.isDirty()) autosave`. `⌘S` → save → `markSaved()`.

- [ ] **Step 1: тесты** — относительный путь резолвится; перемещённый файл находится по имени в подпапке; отсутствующий → `null`; 7 вызовов `writeAutosave` → ровно 5 файлов, `.1` — последний; путь с кириллицей и пробелами сохраняется и резолвится.
- [ ] **Step 2–4:** FAIL → реализация → PASS. Commit `feat(main): project files, media relink, autosave`.

### Task 19: Надёжность — context lost, сторож, автозапуск

**Files:** Create `src/main/lifecycle.ts`; Modify `src/main/index.ts`, `src/renderer/gl/renderer.ts`, `src/renderer/engine.ts`; Test `tests/render/context-lost.spec.ts`, `tests/unit/lifecycle.test.ts`

**Interfaces:**
- Produces:
  - Renderer: на `webglcontextlost` — `preventDefault()`, остановка рисования; на `webglcontextrestored` — пересоздание программ, буферов, текстур, кэшей.
  - `decideStartup(s: Settings, autosaveExists: boolean, crashed: boolean): { open: string | null; mode: 'edit'|'show' }` — автозапуск + `lastProject` → открыть его в `show`; после краха → последнее автосохранение и `lastMode`; иначе пустой проект в `edit`.
  - Сторож: `webContents.on('render-process-gone')` → закрыть окно вывода, `reload()` редактора, renderer запрашивает `app.restoreState()` → `decideStartup(…, crashed=true)`; не более 3 перезапусков за 60 с (дальше — диалог).
  - Автозапуск: `app.setLoginItemSettings({ openAtLogin: settings.autostart })`; переключатель в TopBar → меню настроек.
  - Renderer сообщает `app.setMode(mode)` при смене режима (для `lastMode`).

- [ ] **Step 1: тесты** — `decideStartup`: все 3 ветки; render: `WEBGL_lose_context.loseContext()` → `restoreContext()` → через 500 мс кадр снова совпадает с эталоном Task 8 (пиксели вне — `0,0,0`, внутри — ненулевые).
- [ ] **Step 2–4:** FAIL → реализация → PASS.
- [ ] **Step 5 [Mac]:** e2e: `process.crash()` в renderer через `webContents.forcefullyCrashRenderer()` → через 3 с окно редактора снова живо, проект восстановлен из автосохранения.
- [ ] **Step 6:** Commit `feat: context-loss recovery, watchdog, autostart`.

### Task 20: Сквозной e2e и ручной чек-лист

**Files:** Create `tests/e2e/flow.spec.ts` [Mac], `docs/manual-test-checklist.md`; Modify `README.md`

- [ ] **Step 1 [Mac]:** `flow.spec.ts` с `OPENTOUCH_FAKE_DISPLAY=1`: новый проект → добавить поверхность → добавить тестовый паттерн и привязать → дублировать → сохранить в tmp → закрыть → открыть → 2 поверхности, тот же источник, координаты совпадают.
- [ ] **Step 2:** `docs/manual-test-checklist.md` — пункты: белой вспышки нет при открытии вывода / перезапуске / переподключении кабеля; Show без курсора и без оверлея; вне поверхностей в тёмной комнате нет «серого прямоугольника» от программы (только собственная засветка проектора); отключение/подключение HDMI в Show восстанавливает вывод; автозапуск после перезагрузки Mac приводит в Show; 1080p60 с 10 поверхностями и 2 видео — `droppedVideoFrames` и fps в DevTools; HEVC (если Task 0b PASS).
- [ ] **Step 3:** `README.md`: что это, `npm i`, `npm run dev`, `OPENTOUCH_FAKE_DISPLAY`, горячие клавиши (ссылка на spec §6), `scripts/make-fixtures.sh`.
- [ ] **Step 4:** Полный прогон: `npm run typecheck && npm run test:unit && npm run test:render` → PASS; [Mac] `npm run test:e2e` → PASS. Commit `test: end-to-end flow and manual checklist`.
