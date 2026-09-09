/** Ambient declarations for omnimux-apps */

declare module '*.css' {
  const content: string;
  export default content;
}

declare module 'node:fs';
declare module 'node:path';
declare module 'node:os';

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;

declare module 'lucide-react' {
  import type { FC } from 'react';
  export interface IconProps {
    size?: number | string;
    color?: string;
    className?: string;
    style?: any;
    fill?: string;
    strokeWidth?: number;
  }
  export const Sparkles: FC<IconProps>;
  export const ChevronDown: FC<IconProps>;
  export const ChevronRight: FC<IconProps>;
  export const Upload: FC<IconProps>;
  export const Check: FC<IconProps>;
  export const AlertCircle: FC<IconProps>;
  export const Film: FC<IconProps>;
  export const Image: FC<IconProps>;
  export const Volume2: FC<IconProps>;
  export const Clock: FC<IconProps>;
  export const Play: FC<IconProps>;
  export const Video: FC<IconProps>;
  export const Music: FC<IconProps>;
  export const ArrowRight: FC<IconProps>;
  export const ArrowLeft: FC<IconProps>;
  export const Layers: FC<IconProps>;
  export const Sliders: FC<IconProps>;
  export const Share2: FC<IconProps>;
  export const X: FC<IconProps>;
  export const Plus: FC<IconProps>;
  export const RotateCcw: FC<IconProps>;
  export const RefreshCw: FC<IconProps>;
  export const Copy: FC<IconProps>;
  export const ArrowUpRight: FC<IconProps>;
  export const Eye: FC<IconProps>;
}

declare module 'react' {
  export type ReactNode = any;
  export type ReactElement = any;
  export type ChangeEvent<T = any> = { target: T; currentTarget: T };
  export type FormEvent<T = any> = { preventDefault: () => void; stopPropagation: () => void };
  export function memo<T>(component: T): T;
  export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prevState: T) => T)) => void];
  export function useEffect(effect: () => any, deps?: readonly any[]): void;
  export function useCallback<T extends Function>(callback: T, deps: readonly any[]): T;
  export function useMemo<T>(factory: () => T, deps: readonly any[] | undefined): T;
  export function useRef<T>(initialValue: T): { current: T };
  export type FC<P = {}> = (props: P) => any;
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  type Element = any;
}
