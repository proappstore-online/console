// One lean highlight.js core instance with just the languages we preview — used
// by both CodeView (file preview) and the Markdown renderer (code fences). Avoids
// rehype-highlight/lowlight, which statically bundles ~37 grammars.
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import ini from 'highlight.js/lib/languages/ini'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('ini', ini)

// File extension / fence-language alias → registered language id.
const ALIAS: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', typescript: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', javascript: 'javascript',
  json: 'json', css: 'css', scss: 'css', html: 'xml', xml: 'xml', svg: 'xml',
  md: 'markdown', markdown: 'markdown', py: 'python', python: 'python',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash',
  yml: 'yaml', yaml: 'yaml', sql: 'sql', toml: 'ini', ini: 'ini', env: 'ini',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
}

/** Highlight `code` for a given language/extension hint; falls back to escaped text. */
export function highlightCode(code: string, hint?: string): string {
  const lang = hint ? ALIAS[hint.toLowerCase()] : undefined
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang }).value } catch { /* fall through */ }
  }
  return escapeHtml(code)
}
