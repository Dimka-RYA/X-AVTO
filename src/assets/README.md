# Использование SVG иконок в навигации

## Добавление иконок

1. Поместите SVG файлы в папку `src/assets/icons/`
2. Создайте компонент для иконки:

```tsx
// src/assets/icons/index.ts
import { ReactComponent as HomeIcon } from './home.svg';
import { ReactComponent as RequestsIcon } from './requests.svg';
// Другие импорты иконок...

export { HomeIcon, RequestsIcon };
```

3. Используйте иконки в маршрутах:

```tsx
// src/routes.ts
import { HomeIcon, RequestsIcon } from './assets/icons';

export const routes: Route[] = [
  { path: '/', name: 'Главная', svgIcon: HomeIcon },
  { path: '/requests', name: 'Запросы', svgIcon: RequestsIcon },
  // Другие маршруты...
];
```

## Требования к SVG файлам

- Рекомендуемый размер: 24x24px
- Используйте `stroke="currentColor"` и `fill="none"` для правильного наследования цвета
- Убедитесь, что SVG имеет атрибуты width и height

## Пример SVG

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="..."></path>
</svg>
``` 