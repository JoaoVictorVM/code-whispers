import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { csharp } from '@codemirror/legacy-modes/mode/clike'
import { go } from '@codemirror/legacy-modes/mode/go'
import type { LanguageId } from '../types/game'

export interface LanguageOption {
  id: LanguageId
  label: string
}

export const LANGUAGES: readonly LanguageOption[] = [
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
]

export const DEFAULT_LANGUAGE: LanguageId = 'javascript'

const extensionFactories: Record<LanguageId, () => Extension> = {
  c: () => cpp(),
  cpp: () => cpp(),
  csharp: () => StreamLanguage.define(csharp),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  python: () => python(),
  java: () => java(),
  go: () => StreamLanguage.define(go),
}

const extensionCache = new Map<LanguageId, Extension>()

export function languageExtension(id: LanguageId): Extension {
  let extension = extensionCache.get(id)
  if (!extension) {
    extension = extensionFactories[id]()
    extensionCache.set(id, extension)
  }
  return extension
}

export function isLanguageId(value: string): value is LanguageId {
  return LANGUAGES.some((language) => language.id === value)
}
