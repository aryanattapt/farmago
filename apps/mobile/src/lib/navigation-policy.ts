export type NavigationDecision = 'allow' | 'open-external' | 'block'

export function webOrigin(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin.toLowerCase() : ''
  } catch {
    return ''
  }
}

export function classifyWebNavigation(value: string, appOrigin: string): NavigationDecision {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'block'
  }

  if (url.protocol === 'about:') return 'allow'
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return appOrigin && url.origin.toLowerCase() === appOrigin.toLowerCase()
      ? 'allow'
      : 'open-external'
  }
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return 'open-external'
  return 'block'
}
