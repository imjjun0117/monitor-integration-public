// Shadcn 컴포넌트의 조건부 클래스와 Tailwind 충돌 정리
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
