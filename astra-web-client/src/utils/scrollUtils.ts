// Утилиты для управления скроллами и предотвращения конфликтов

let scrollTimeout: NodeJS.Timeout | null = null;
let isScrolling = false;

/**
 * Безопасный скролл с защитой от конфликтов
 */
export function safeScrollIntoView(
  element: HTMLElement | null,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' },
  delay: number = 100
): void {
  if (!element) return;
  
  // Отменяем предыдущий скролл если он еще выполняется
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  // Устанавливаем флаг что скролл в процессе
  isScrolling = true;
  
  scrollTimeout = setTimeout(() => {
    if (element && isScrolling) {
      element.scrollIntoView(options);
      
      // Сбрасываем флаг после завершения скролла
      setTimeout(() => {
        isScrolling = false;
      }, 500); // Даем время на завершение smooth скролла
    }
  }, delay);
}

/**
 * Проверяет, выполняется ли сейчас скролл
 */
export function isScrollInProgress(): boolean {
  return isScrolling;
}

/**
 * Отменяет все ожидающие скроллы
 */
export function cancelPendingScrolls(): void {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
    scrollTimeout = null;
  }
  isScrolling = false;
}

/**
 * Скролл к концу чата с защитой от конфликтов
 */
export function safeScrollToBottom(
  element: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth',
  delay: number = 50
): void {
  if (!element) return;
  
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  scrollTimeout = setTimeout(() => {
    if (element) {
      element.scrollIntoView({ behavior });
    }
  }, delay);
}


