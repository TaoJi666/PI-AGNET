export const VECTOR_DIM = 384

export function embed(text: string): number[] {
  const vector = new Array<number>(VECTOR_DIM).fill(0)
  const tokens = tokenize(text.toLowerCase())
  for (const token of tokens) {
    const hashed = hash(token)
    vector[hashed % VECTOR_DIM] += hashed & 1 ? 1 : -1
  }
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  return vector.map((value) => value / norm)
}

function tokenize(text: string): string[] {
  const parts = text.match(/[a-z0-9_]+|[\u4e00-\u9fff]/g) ?? []
  const tokens: string[] = []
  for (let index = 0; index < parts.length; index += 1) {
    tokens.push(parts[index])
    if (index + 1 < parts.length) tokens.push(parts[index] + parts[index + 1])
  }
  return tokens
}

function hash(value: string): number {
  let hashed = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hashed ^= value.charCodeAt(index)
    hashed = Math.imul(hashed, 16777619)
  }
  return hashed >>> 0
}
