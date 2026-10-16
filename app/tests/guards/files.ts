// The sources the guards read: everything under app/src, as relative paths and texts.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const APP = resolve(__dirname, "../..");
export const SRC = join(APP, "src");

export type Source = Readonly<{ path: string; text: string }>;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

export function sources(extensions: readonly string[]): Source[] {
  return walk(SRC)
    .filter((file) => extensions.some((ext) => file.endsWith(ext)))
    .sort()
    .map((file) => ({ path: relative(APP, file).split("\\").join("/"), text: readFileSync(file, "utf8") }));
}
