import { useState, useEffect } from 'react';

/**
 * Trì hoãn cập nhật giá trị cho đến khi người dùng ngừng gõ phím sau `delayMs` mili-giây.
 * Đảm bảo Editor duy trì tốc độ 60FPS mà không spam request lên Edge Route.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}