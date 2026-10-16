// Lo poco de Node que usa vite.config.ts (el proyecto no instala @types/node).

declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function statSync(path: string): { isDirectory(): boolean };
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}
