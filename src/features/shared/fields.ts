/**
 * Field descriptors.
 *
 * The seven entities differ only in which fields they have, so the form is built
 * from a list of these rather than written seven times. That is not only less
 * code: it means a label, a hint and a control for "start date" are defined once,
 * so the label cannot be right in six forms and wrong in the seventh.
 *
 * Every field is a plain value in a plain object. There is no path syntax and no
 * nested binding, because none of these records nest.
 */

/**
 * Properties every control shares.
 *
 * `required` lives here rather than on the `text` variant alone: which controls
 * may be required is a question about the field, not about the widget, and
 * putting it on one variant means the form has to remember which variants happen
 * to support it.
 */
interface FieldCommon {
  name: string
  label: string
  /** Shown under the control, and announced to assistive technology. */
  hint?: string
  required?: boolean
}

export type Field =
  | (FieldCommon & { kind: 'text'; placeholder?: string })
  | (FieldCommon & { kind: 'textarea'; rows?: number })
  | (FieldCommon & { kind: 'date' })
  | (FieldCommon & { kind: 'year' })
  | (FieldCommon & { kind: 'checkbox' })
  | (FieldCommon & { kind: 'select'; options: SelectOption[] })

export interface SelectOption {
  value: string
  label: string
}

export type FieldValues = Record<string, string | boolean>

/** The empty record for a "new" form: every field at its default. */
export function emptyValues(fields: readonly Field[]): FieldValues {
  const values: FieldValues = {}
  for (const field of fields) {
    values[field.name] = field.kind === 'checkbox' ? false : ''
  }
  return values
}

/** An existing record reduced to the form's values, so unknown fields are not lost. */
export function valuesFromRecord(
  record: Record<string, unknown>,
  fields: readonly Field[],
): FieldValues {
  const values: FieldValues = {}
  for (const field of fields) {
    const raw = record[field.name]
    if (field.kind === 'checkbox') {
      values[field.name] = raw === true
    } else if (typeof raw === 'number') {
      values[field.name] = String(raw)
    } else if (typeof raw === 'string') {
      values[field.name] = raw
    } else {
      // A null (an absent end date) becomes an empty control, which is exactly
      // what an empty `type="date"` means to the user.
      values[field.name] = ''
    }
  }
  return values
}

/**
 * The one place a form decides something is required.
 *
 * Kept separate from the fields so the rules are visible in one file: the only
 * genuinely required things are the ones a record cannot be found without, and
 * anything else is better left to the user than blocked at the door.
 */
export function validate(fields: readonly Field[], values: FieldValues): string[] {
  const problems: string[] = []
  for (const field of fields) {
    if (field.kind === 'checkbox') continue
    const value = values[field.name]
    if (field.required === true && (value === undefined || value === '')) {
      problems.push(`${field.label} is required.`)
    }
    if (
      field.kind === 'date' &&
      typeof value === 'string' &&
      value !== '' &&
      !isIsoDate(value)
    ) {
      problems.push(`${field.label} must be a real date.`)
    }
    if (
      field.kind === 'year' &&
      value !== undefined &&
      value !== '' &&
      typeof value === 'string'
    ) {
      const year = Number(value)
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        problems.push(`${field.label} must be a year between 1900 and 2200.`)
      }
    }
  }
  return problems
}

/** `YYYY-MM-DD` that is also a real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}
