// Generated from dot.wat; synchronous instantiation with a JavaScript fallback.
const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,8,1,96,3,127,127,127,1,124,3,2,1,0,5,3,1,0,1,7,16,2,6,109,101,109,111,114,121,2,0,3,100,111,116,0,0,10,60,1,58,2,1,127,1,124,2,64,3,64,32,3,32,2,79,13,1,32,4,32,0,32,3,65,8,108,106,43,3,0,32,1,32,3,65,8,108,106,43,3,0,162,160,33,4,32,3,65,1,106,33,3,12,0,11,11,32,4,11])

type DotExports = { memory: WebAssembly.Memory; dot: (a: number, b: number, n: number) => number }
let exports: DotExports | undefined
try { exports = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports as DotExports } catch { exports = undefined }

function javascriptDot(a: number[], b: number[]): number {
  let result = 0
  for (let index = 0; index < a.length; index += 1) result += a[index]! * b[index]!
  return result
}

export const wasmDotAvailable = exports !== undefined

/** WASM is used only when the vector is large enough to offset memory-copy overhead. */
export function dotProduct(a: number[], b: number[]): number {
  if (!exports || a.length < 64) return javascriptDot(a, b)
  const byteLength = a.length * 16
  const required = Math.ceil(byteLength / 65536)
  if (exports.memory.buffer.byteLength < byteLength) exports.memory.grow(required - exports.memory.buffer.byteLength / 65536)
  const bOffset = a.length * 8
  const view = new Float64Array(exports.memory.buffer)
  view.set(a, 0)
  view.set(b, bOffset / 8)
  return exports.dot(0, bOffset, a.length)
}
