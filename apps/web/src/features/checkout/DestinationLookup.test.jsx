import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DestinationLookup } from './DestinationLookup.jsx'

describe('RajaOngkir destination lookup', () => {
  test('renders an accessible destination search with guidance for short queries', () => {
    const markup = renderToStaticMarkup(createElement(DestinationLookup, {
      value: null,
      onChange: () => {},
    }))
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-autocomplete="list"')
    expect(markup).toContain('Contoh: Kebayoran Baru')
  })

  test('shows the selected location label in the search field', () => {
    const markup = renderToStaticMarkup(createElement(DestinationLookup, {
      value: { id: 123, label: 'Kebayoran Baru, Jakarta Selatan' },
      onChange: () => {},
    }))
    expect(markup).toContain('value="Kebayoran Baru, Jakarta Selatan"')
  })
})
