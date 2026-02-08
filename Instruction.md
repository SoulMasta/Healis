В useWorkspace.js уже есть idKey, sameId, normalizeElementId, upsertById. В WorkspacePage они объявлены ещё раз — можно удалить и импортировать из useWorkspace (и при необходимости реэкспортировать их из useWorkspace для других модулей).
useEvent — типичный хук «стабильного колбэка», имеет смысл вынести в hooks/useEvent.js.
getFitMeasurerEl — используется в ElementRenderer; логично держать в boardRenderUtils или рядом с рендером заметок/текста, а не в странице.
distToSegmentSquared, nodeToAttrs, iconToCursorValue — геометрия и курсор, можно вынести в utils/geometry.js и utils/cursorUtils.js (или один utils/canvasUtils.js).
TOOLS, BRUSH_COLORS, QUICK_REACTIONS, AI_PROMPT_SUGGESTIONS — вынести в constants/workspace.js.
IconBtn — мелкий UI-компонент, вынести в components/ui/IconBtn.jsx (или в общие компоненты).