import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const readClient = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')
const h = (type, props, ...children) => ({ type, props, children })
const SearchField = Symbol('SearchField')
const PlazaTopSearch = runInNewContext(
  `${readClient('plaza-shell.js')}\nPlazaTopSearch`, { h, SearchField },
)

test('plaza search placeholders are translated in both languages', () => {
  for (const [lang, labels] of [
    ['zh', ['搜索插件', '搜索技能', '搜索专家', '搜索连接器']],
    ['en', ['Search plugins', 'Search skills', 'Search experts', 'Search connectors']],
  ]) {
    const lookup = runInNewContext(`${readClient('i18n.js')}\nlookup`, {
      React: { createContext: () => ({}) },
      document: { documentElement: { lang } },
    })
    for (const [index, suffix] of ['Plugins', 'Skills', 'Experts', 'Connectors'].entries()) {
      assert.equal(lookup(`plaza.search${suffix}`), labels[index])
    }
  }
})

test('plaza search updates immediately and submits through a form', () => {
  let query = ''
  let submitted = ''
  let prevented = false
  const onQuery = (value) => { query = value }
  const onClear = () => { query = ''; submitted = '' }
  const form = PlazaTopSearch({
    query: 'initial', placeholder: 'Search skills', onQuery, onClear,
    onSubmit: () => { submitted = query },
  })
  assert.equal(form.type, 'form')
  assert.equal(form.props.className, 'sh-plaza-search')
  const field = form.children[0]
  assert.equal(field.type, SearchField)
  assert.equal(field.props.value, 'initial')
  assert.equal(field.props.placeholder, 'Search skills')
  assert.equal(field.props.debounceMs, 0)
  assert.equal(field.props.stretch, true)
  assert.equal(field.props.onValueChange, onQuery)
  assert.equal(field.props.onClear, onClear)
  assert.equal(field.props.onChange, undefined)
  assert.equal(field.props.onSubmit, undefined)
  field.props.onValueChange('PDF')
  assert.equal(query, 'PDF')
  assert.equal(submitted, '')
  form.props.onSubmit({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(submitted, 'PDF')
  field.props.onClear()
  assert.equal(query, '')
  assert.equal(submitted, '')
})

test('plaza search supports fallback clearing and an optional submit callback', () => {
  let query = 'PDF'
  const form = PlazaTopSearch({ query, onQuery: (value) => { query = value } })
  form.children[0].props.onClear()
  assert.equal(query, '')
  let prevented = false
  form.props.onSubmit({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
})

test('skill picker forwards value changes using the SearchField contract', () => {
  const source = readClient('skill-picker.js')
  const searchProps = source.match(/h\(SearchField, (\{[\s\S]*?\})\),/)
  assert.ok(searchProps, 'picker must render a SearchField')
  let query = 'initial'
  const setQuery = (value) => { query = value }
  const props = runInNewContext(`(${searchProps[1]})`, {
    query, setQuery, tr: (key) => key,
  })
  assert.equal(props.onValueChange, setQuery)
  assert.equal(props.onChange, undefined)
  props.onValueChange('PDF')
  assert.equal(query, 'PDF')
  props.onClear()
  assert.equal(query, '')
})
