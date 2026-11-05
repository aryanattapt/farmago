import { describe, expect, test } from 'bun:test'
import { classifyWebNavigation, webOrigin } from './navigation-policy'

describe('mobile WebView navigation policy', () => {
  const appOrigin = webOrigin('https://Farmago.example/app')

  test('normalizes the configured web origin and removes path and query', () => {
    expect(appOrigin).toBe('https://farmago.example')
    expect(webOrigin('http://10.0.2.2:5173/')).toBe('http://10.0.2.2:5173')
    expect(webOrigin('file:///app/index.html')).toBe('')
    expect(webOrigin('not-a-url')).toBe('')
  })

  test('keeps same-origin pages inside the app', () => {
    expect(classifyWebNavigation('https://farmago.example/orders/123', appOrigin)).toBe('allow')
    expect(classifyWebNavigation('about:blank', appOrigin)).toBe('allow')
  })

  test('opens other web origins, mail links, and phone links externally', () => {
    expect(classifyWebNavigation('https://support.example/help', appOrigin)).toBe('open-external')
    expect(classifyWebNavigation('mailto:help@farmago.example', appOrigin)).toBe('open-external')
    expect(classifyWebNavigation('tel:+6221123456', appOrigin)).toBe('open-external')
  })

  test('blocks executable, file, and malformed navigation targets', () => {
    expect(classifyWebNavigation('javascript:alert(1)', appOrigin)).toBe('block')
    expect(classifyWebNavigation('data:text/html,hello', appOrigin)).toBe('block')
    expect(classifyWebNavigation('file:///etc/passwd', appOrigin)).toBe('block')
    expect(classifyWebNavigation('not-a-url', appOrigin)).toBe('block')
  })
})
