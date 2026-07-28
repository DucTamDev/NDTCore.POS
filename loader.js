export async function resolve(specifier, context, nextResolve) {
  // For CSS files, return a special protocol
  if (specifier.endsWith('.css') || specifier.includes('.css?')) {
    return {
      shortCircuit: true,
      url: 'data:text/javascript,export default {}',
    }
  }
  return nextResolve(specifier)
}

export async function getFormat(url, context, nextGetFormat) {
  if (url.endsWith('.css')) {
    return { format: 'module' }
  }
  return nextGetFormat(url)
}

export async function getSource(url, context, nextGetSource) {
  if (url.endsWith('.css')) {
    return {
      source: 'export default {}',
      shortCircuit: true,
    }
  }
  return nextGetSource(url)
}
