# Цвета интерфейса

Значения цветов приложения определяются только в `src/index.css`, внутри `@theme`.
Компоненты используют классы `bg-pati-panel`, `text-pati-text-muted`,
`border-pati-border`, `hover:bg-pati-accent-hover`, `bg-pati-red/15`.

- Фоны: `pati-dark`, `pati-recessed`, `pati-sidebar`, `pati-panel`, `pati-surface`, `pati-surface-elevated`, `pati-surface-hover`.
- Рамки: `pati-border-subtle`, `pati-border`, `pati-border-strong`.
- Текст: `pati-text-primary`, `pati-text-secondary`, `pati-text-muted`, `pati-text-dim`, `pati-text-disabled`.
- Акцент: `pati-accent`, `pati-accent-hover`, `pati-accent-light`, `pati-accent-text`. Дополнительные `accent-panel`, `accent-panel-end`, `accent-border`, `accent-muted` используются в декоративных блоках.
- Состояния: `pati-green` (онлайн), `pati-red` (ошибка/выход), `pati-warning`, `pati-offline`. Варианты `light` и `text` — для иконок и подписей.
- Эффекты: `shadow-pati-speaking`, `shadow-pati-voice`, `bg-pati-room-glow`. Их оттенки вычисляются из основных переменных.

Белый и чёрный — стандартные нейтральные цвета Tailwind, также определённые через
CSS-переменные. Прозрачность задаётся суффиксом `/15`, `/30` и т. п.

Не добавляйте HEX/RGB прямо в JSX, inline styles или произвольные классы вроде
`bg-[#...]`. Если существующий токен не подходит по смыслу, добавьте новый в `@theme`.
Классы записывайте полностью, чтобы Tailwind находил их при сборке.

`npm run check:colors` проверяет исходники на цветовые литералы вне темы.
Проверка включена в `npm run build`.
