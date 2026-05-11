let counter = 0

export function genId(prefix = 'id') {
  counter++
  return `${prefix}_${Date.now()}_${counter}`
}
