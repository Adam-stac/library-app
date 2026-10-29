import { type Dispatch, type FocusEvent, type FormEvent, type SetStateAction, useRef, useState } from 'react'

type Errors = Record<string, string>

/** Whether an error key belongs to the field with this ID: "volumes", "work.titleAr" (titleAr), "birth.hijri" (birth-hijri) */
function belongsTo(key: string, id: string): boolean {
  return key === id || key.endsWith(`.${id}`) || key.replace(/\./g, '-') === id
}

/**
 * For a library form: whether anything has been typed or chosen yet (`dirty`, for the unsaved-changes guard), and
 * each field checked as soon as the reader leaves it, using the same rules as saving (`problems`). A field the
 * reader has changed shows its problem on leaving; a problem that has been put right goes at once. Fields only
 * passed through are left alone until saving, so tabbing past an empty field doesn't scold.
 *
 * Spread `formProps(problems)` onto the <form>; changes and leaving bubble up to it from every field.
 */
export function useFormChecks(setErrors: Dispatch<SetStateAction<Errors>>) {
  const changed = useRef(new Set<string>())
  const [dirty, setDirty] = useState(false)

  const formProps = (problems: () => Errors) => ({
    onChange: (event: FormEvent<HTMLFormElement>) => {
      const { id } = event.target as HTMLElement
      if (id) changed.current.add(id)
      setDirty(true)
    },
    onBlur: (event: FocusEvent<HTMLFormElement>) => {
      const { id } = event.target as HTMLElement
      if (!id) return
      const found = problems()
      setErrors((errors) => {
        const next = { ...errors }
        for (const key of Object.keys(next)) if (belongsTo(key, id) && !found[key]) delete next[key]
        if (changed.current.has(id)) {
          for (const [key, code] of Object.entries(found)) if (belongsTo(key, id)) next[key] = code
        }
        return next
      })
    },
  })
  return { dirty, formProps }
}
