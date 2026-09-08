import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiArrowUpRight, FiSearch } from 'react-icons/fi'
import { Input } from '../../components/common'
import { appRoutes } from '../../routes/config'

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

export default function HeaderSearch() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLFormElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const terms = normalizeSearch(query.trim()).split(/\s+/).filter(Boolean)
  const matches = terms.length ? appRoutes.filter(({ title, description }) => {
    const text = normalizeSearch(`${title} ${description}`)
    return terms.every((term) => text.includes(term))
  }) : []
  const results = matches.slice(0, 6)
  const showResults = open && terms.length > 0

  useEffect(() => {
    if (!showResults) return
    function handleOutside(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [showResults])

  return (
    <form ref={containerRef} role="search" className="header-search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          containerRef.current?.querySelector('input')?.focus()
          setOpen(false)
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (results[0]) {
          setOpen(false)
          navigate(results[0].path)
        }
      }}>
      <FiSearch className="header-search__icon" aria-hidden="true" />
      <Input type="search" aria-label="Tìm tính năng" placeholder="Tìm kiếm tính năng…"
        autoComplete="off" value={query} className="header-search__input"
        aria-describedby={showResults ? 'header-search-status' : undefined}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && showResults && results.length > 0) {
            event.preventDefault()
            containerRef.current?.querySelector<HTMLAnchorElement>('.header-search__result')?.focus()
          }
        }} />
      {showResults && (
        <div className="header-search__panel">
          <p id="header-search-status" className="header-search__status" role="status">
            {matches.length ? `${matches.length} tính năng phù hợp${matches.length > 6 ? ' · Hiển thị 6 kết quả đầu' : ''}` : 'Không tìm thấy tính năng'}
          </p>
          {results.length > 0 ? (
            <ul className="header-search__results" aria-label="Kết quả tìm kiếm">
              {results.map(({ id, path, title, description, icon: Icon }) => (
                <li key={id}>
                  <Link to={path} className="header-search__result" onClick={() => setOpen(false)}>
                    <Icon aria-hidden="true" />
                    <span><strong>{title}</strong><small>{description}</small></span>
                    <FiArrowUpRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="header-search__empty">Thử tìm “tin nhắn”, “nhóm” hoặc “tài khoản”.</p>}
        </div>
      )}
    </form>
  )
}
