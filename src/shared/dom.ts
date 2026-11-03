export type Child = Node | string | false | null | undefined;

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | false | undefined>>;
}

let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

export function append(parent: Element | DocumentFragment, children: readonly Child[]): void {
  for (const child of children) {
    if (child === false || child === null || child === undefined) {
      continue;
    }
    parent.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== false && value !== undefined) {
      node.setAttribute(name, value);
    }
  }
  append(node, children);
  return node;
}
