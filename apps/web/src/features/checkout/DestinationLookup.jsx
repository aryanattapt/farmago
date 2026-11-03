import { useEffect, useState } from 'react'
import { api } from '../../shared/api/client.js'

export function DestinationLookup({ value, onChange, className = '', label = 'Kelurahan, kecamatan, atau kode pos' }) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setQuery(value?.label ?? '')
  }, [value?.id, value?.label])

  useEffect(() => {
    const search = query.trim()
    if (search.length < 3 || (value?.label && search === value.label)) {
      setItems([])
      setLoading(false)
      setError('')
      return
    }
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      api('/shipping/destinations?search=' + encodeURIComponent(search))
        .then((result) => { if (active) setItems(result.items ?? []) })
        .catch((cause) => { if (active) { setItems([]); setError(cause.message) } })
        .finally(() => { if (active) setLoading(false) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [query, value?.id, value?.label])

  const choose = (item) => {
    onChange(item)
    setQuery(item.label)
    setItems([])
    setError('')
  }

  return <div className={'destination-lookup ' + className}>
    <label>{label}
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        aria-controls="shipping-destination-results"
        autoComplete="off"
        value={query}
        onChange={(event) => { setQuery(event.target.value); onChange(null) }}
        placeholder="Contoh: Kebayoran Baru"
      />
    </label>
    {loading && <small className="field-hint">Mencari area...</small>}
    {error && <small className="form-error">{error}</small>}
    {!loading && query.trim().length >= 3 && !error && !items.length && !value && <small className="field-hint">Tidak ada area yang cocok. Coba nama kecamatan atau kode pos.</small>}
    {items.length > 0 && <ul id="shipping-destination-results" className="destination-results" role="listbox">
      {items.map((item) => <li key={item.id} role="presentation">
        <button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
          <strong>{item.label}</strong>
          <small>{[item.subdistrictName, item.districtName, item.cityName, item.zipCode].filter(Boolean).join(' · ')}</small>
        </button>
      </li>)}
    </ul>}
  </div>
}
