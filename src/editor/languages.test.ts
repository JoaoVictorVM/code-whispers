import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguageId, languageExtension } from './languages'

describe('language registry', () => {
  it('test_registry_has_exactly_eight_languages', () => {
    expect(LANGUAGES.map((language) => language.id).sort()).toEqual(
      ['c', 'cpp', 'csharp', 'go', 'java', 'javascript', 'python', 'typescript'],
    )
  })

  it('test_display_order_matches_spec', () => {
    expect(LANGUAGES.map((language) => language.label)).toEqual([
      'C',
      'C++',
      'C#',
      'JavaScript',
      'TypeScript',
      'Python',
      'Java',
      'Go',
    ])
  })

  it('test_each_language_resolves_to_an_extension', () => {
    for (const { id } of LANGUAGES) {
      expect(() => languageExtension(id)).not.toThrow()
      expect(languageExtension(id)).toBeDefined()
    }
  })

  it('defaults to javascript and recognizes only known ids', () => {
    expect(DEFAULT_LANGUAGE).toBe('javascript')
    expect(isLanguageId('go')).toBe(true)
    expect(isLanguageId('rust')).toBe(false)
  })
})
