import { el, nextId } from '../../../shared/dom';
import { icon } from '../../../shared/icons';
import { label } from '../../../shared/messages';
import { createSelectField, createTextField } from '../../../shared/ui/field';
import { issueText } from '../domain/master-data';
import { moneyText, parseMoney } from '../domain/master-fields';
import type { FieldDef, MasterConfig, MasterIssue, MasterValues } from '../domain/master-types';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface FieldHandle {
  readonly def: FieldDef;
  readonly root: HTMLElement;
  readonly control: Control;
  readonly hint: HTMLElement | undefined;
  setError(text: string | undefined): void;
}

export interface MasterForm {
  readonly element: HTMLFormElement;
  values(): MasterValues;
  fill(values: MasterValues): void;
  /** Mengatur apakah formulir dapat diisi; kolom terkunci tetap nonaktif dan menampilkan petunjuknya. */
  setEditable(editable: boolean, locked: ReadonlySet<string>): void;
  showIssues(issues: readonly MasterIssue[]): void;
  clearIssues(): void;
  focusField(key: string): void;
}

const INPUT_MODES: Readonly<Partial<Record<FieldDef['type'], string>>> = {
  tel: 'tel',
  money: 'numeric',
  integer: 'numeric',
  decimal: 'decimal',
};

/** Pesan galat untuk kolom tanpa dukungan galat bawaan (area teks dan pilihan). */
function attachError(root: HTMLElement, control: Control): FieldHandle['setError'] {
  const errorId = nextId('master-error');
  let node: HTMLElement | undefined;
  return (text) => {
    node?.remove();
    node = undefined;
    if (text === undefined) {
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
      return;
    }
    node = el(
      'p',
      { className: 'field__error', attrs: { id: errorId } },
      icon('circle-x'),
      el('span', { text }),
    );
    root.append(node);
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', errorId);
  };
}

function markRequired(root: HTMLElement, def: FieldDef, control: Control): void {
  if (def.required !== true) {
    return;
  }
  control.setAttribute('aria-required', 'true');
  root
    .querySelector('.field__label')
    ?.append(
      el('span', { className: 'bo-master__req', text: ' *', attrs: { 'aria-hidden': 'true' } }),
    );
}

function buildField(def: FieldDef): FieldHandle {
  const labelText = label(def.label);
  let root: HTMLElement;
  let control: Control;
  let setError: FieldHandle['setError'];
  if (def.type === 'select') {
    const built = createSelectField({
      labelText,
      options: (def.options ?? []).map((option) => ({
        value: option.value,
        text: label(option.label),
      })),
    });
    root = built.root;
    control = built.select;
    setError = attachError(root, control);
  } else if (def.type === 'textarea') {
    const id = nextId('master-area');
    control = el('textarea', {
      className: 'input bo-master__area',
      attrs: {
        id,
        rows: '2',
        maxlength: def.maxLength === undefined ? undefined : String(def.maxLength),
      },
    });
    root = el(
      'div',
      { className: 'field' },
      el('label', { className: 'field__label', text: labelText, attrs: { for: id } }),
      control,
    );
    setError = attachError(root, control);
  } else {
    const built = createTextField({ labelText });
    root = built.root;
    control = built.input;
    setError = (text) => {
      built.setError(text);
    };
    const mode = INPUT_MODES[def.type];
    if (mode !== undefined) {
      built.input.setAttribute('inputmode', mode);
    }
    if (def.maxLength !== undefined) {
      built.input.maxLength = def.maxLength;
    }
    built.input.autocomplete = 'off';
    if (def.type === 'money') {
      built.input.addEventListener('blur', () => {
        const parsed = parseMoney(built.input.value);
        if (parsed !== undefined) {
          built.input.value = moneyText(parsed);
        }
      });
    }
  }
  markRequired(root, def, control);
  root.classList.add('bo-master__field', `bo-master__span-${String(def.span)}`);
  let hint: HTMLElement | undefined;
  if (def.hint !== undefined) {
    hint = el('p', { className: 'bo-master__hint', text: label(def.hint), attrs: { hidden: '' } });
    root.append(hint);
  }
  return { def, root, control, hint, setError };
}

export function createMasterForm(config: MasterConfig, onSubmit: () => void): MasterForm {
  const handles = config.fields.map(buildField);
  const element = el(
    'form',
    { className: 'bo-master__form', attrs: { novalidate: '', autocomplete: 'off' } },
    ...handles.map((handle) => handle.root),
  );
  element.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit();
  });
  const byKey = new Map(handles.map((handle) => [handle.def.key, handle]));

  const clearIssues = (): void => {
    for (const handle of handles) {
      handle.setError(undefined);
    }
  };

  return {
    element,
    values: () =>
      Object.fromEntries(handles.map((handle) => [handle.def.key, handle.control.value])),
    fill: (values) => {
      for (const handle of handles) {
        handle.control.value = values[handle.def.key] ?? '';
      }
      clearIssues();
    },
    setEditable: (editable, locked) => {
      for (const handle of handles) {
        const isLocked = locked.has(handle.def.key);
        handle.control.disabled = !editable || isLocked;
        if (handle.hint !== undefined) {
          handle.hint.hidden = !(editable && isLocked);
        }
      }
    },
    showIssues: (issues) => {
      clearIssues();
      let first: FieldHandle | undefined;
      for (const issue of issues) {
        const handle = byKey.get(issue.field);
        if (handle !== undefined) {
          handle.setError(issueText(issue));
          first ??= handle;
        }
      }
      first?.control.focus();
    },
    clearIssues,
    focusField: (key) => {
      byKey.get(key)?.control.focus();
    },
  };
}
