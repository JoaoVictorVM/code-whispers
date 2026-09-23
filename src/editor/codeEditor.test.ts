import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { createEditor, type CodeEditor, type CreateEditorOptions } from './codeEditor'

let parent: HTMLElement
let editor: CodeEditor | null = null

function create(options: Partial<CreateEditorOptions> = {}): CodeEditor {
  editor = createEditor({ parent, ...options })
  return editor
}

function viewOf(root: HTMLElement): EditorView {
  return EditorView.findFromDOM(root.querySelector<HTMLElement>('.cm-editor')!)!
}

function select(): HTMLSelectElement {
  return parent.querySelector<HTMLSelectElement>('[data-role="language-select"]')!
}

describe('createEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="parent"></div>'
    parent = document.querySelector<HTMLElement>('#parent')!
  })

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('test_default_language_is_javascript', () => {
    const instance = create()
    expect(instance.getLanguage()).toBe('javascript')
    expect(select().value).toBe('javascript')
  })

  it('test_initial_code_is_applied', () => {
    expect(create({ initialCode: 'const x = 1;' }).getCode()).toBe('const x = 1;')
  })

  it('test_setLanguage_reconfigures_without_losing_content', () => {
    const onChange = vi.fn()
    const instance = create({ initialCode: 'x = 1\ny = 2', onChange })
    const view = viewOf(parent)
    view.dispatch({ selection: { anchor: 4 } })
    const editorNode = parent.querySelector('.cm-editor')
    instance.setLanguage('python')
    expect(instance.getLanguage()).toBe('python')
    expect(instance.getCode()).toBe('x = 1\ny = 2')
    expect(view.state.selection.main.head).toBe(4)
    expect(parent.querySelector('.cm-editor')).toBe(editorNode)
    expect(select().value).toBe('python')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'python' }))
  })

  it('changing the select switches the language', () => {
    const instance = create({ initialCode: 'package main' })
    select().value = 'go'
    select().dispatchEvent(new Event('change'))
    expect(instance.getLanguage()).toBe('go')
    expect(instance.getCode()).toBe('package main')
  })

  it('test_onChange_fires_on_edit', () => {
    const onChange = vi.fn()
    create({ onChange })
    viewOf(parent).dispatch({ changes: { from: 0, insert: 'a\nb' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      language: 'javascript',
      code: 'a\nb',
      lineCount: 2,
      charCount: 3,
    })
  })

  it('test_getLineCount_and_getCharCount_are_accurate', () => {
    const instance = create({ initialCode: 'linha 1\nlinha 2\n\nfim ção' })
    expect(instance.getLineCount()).toBe(4)
    expect(instance.getCharCount()).toBe(24)
    expect(create({ initialCode: '' }).getLineCount()).toBe(1)
  })

  it('test_readOnly_instance_rejects_edits', () => {
    const onChange = vi.fn()
    const instance = create({ readOnly: true, initialCode: 'print(1)', initialLanguage: 'python', onChange })
    const view = viewOf(parent)
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    view.dispatch(view.state.replaceSelection('pasted'))
    expect(instance.getCode()).toBe('print(1)')
    expect(onChange).not.toHaveBeenCalled()
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false')
  })

  it('test_readOnly_instance_hides_language_select', () => {
    create({ readOnly: true })
    expect(select().disabled).toBe(true)
    expect(parent.querySelector('[data-role="read-only-caption"]')?.textContent).toBe('Somente leitura')
  })

  it('editable instance has an enabled select labeled Linguagem and no caption', () => {
    create()
    expect(select().disabled).toBe(false)
    expect(select().closest('label')?.textContent).toContain('Linguagem')
    expect(parent.querySelector('[data-role="read-only-caption"]')?.textContent).toBe('')
  })

  it('test_destroy_removes_dom_and_listeners', () => {
    const onChange = vi.fn()
    const instance = create({ onChange })
    const view = viewOf(parent)
    instance.destroy()
    expect(parent.querySelector('[data-component="code-editor"]')).toBeNull()
    view.dispatch({ changes: { from: 0, insert: 'late' } })
    instance.setLanguage('go')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('test_tab_key_inserts_two_spaces', () => {
    const instance = create({ initialCode: 'ab' })
    const view = viewOf(parent)
    view.dispatch({ selection: { anchor: 1 } })
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }))
    expect(instance.getCode()).toBe('a  b')
  })

  it('preserves indentation of pasted multi-line code', () => {
    const snippet = Array.from({ length: 30 }, (_, i) => `${'  '.repeat(i % 4)}line ${i}`).join('\n')
    const instance = create()
    viewOf(parent).dispatch(viewOf(parent).state.replaceSelection(snippet), { userEvent: 'input.paste' })
    expect(instance.getCode()).toBe(snippet)
    expect(instance.getLineCount()).toBe(30)
  })

  it('never executes the code it displays', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    create({ initialCode: 'alert(1)' })
    create({ initialCode: '<img src=x onerror="alert(2)">', readOnly: true })
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('test_editable_instance_snapshot_shape_matches_code_screen_contract', () => {
    const instance = create({ initialLanguage: 'typescript' })
    viewOf(parent).dispatch({ changes: { from: 0, insert: 'let n: number = 1' } })
    const snapshot = instance.getSnapshot()
    expect(Object.keys(snapshot).sort()).toEqual(['charCount', 'code', 'language', 'lineCount'])
    expect(snapshot).toEqual({ language: 'typescript', code: 'let n: number = 1', lineCount: 1, charCount: 17 })
  })

  it('test_readOnly_instance_renders_opponent_snippet_with_its_original_language', () => {
    const instance = create({ readOnly: true, initialLanguage: 'csharp', initialCode: 'class A {}' })
    expect(instance.getLanguage()).toBe('csharp')
    expect(instance.getCode()).toBe('class A {}')
    expect(select().value).toBe('csharp')
  })

  it('test_readOnly_instance_renders_own_snippet_for_review', () => {
    const code = 'int main() {\n  return 0;\n}'
    const instance = create({ readOnly: true, initialLanguage: 'c', initialCode: code })
    expect(instance.getSnapshot()).toEqual({ language: 'c', code, lineCount: 3, charCount: code.length })
  })
})
