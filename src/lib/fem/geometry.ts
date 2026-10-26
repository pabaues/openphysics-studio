import type { HeatModel, MeshNode } from './types'

export function rectangleGeometry(width: number, height: number): HeatModel['geometry'] {
  return {
    shape: 'rectangle', width, height,
    vertices: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
  }
}

function distance(a: MeshNode, b: MeshNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function signedPolygonArea(vertices: MeshNode[]): number {
  return vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]!
    return sum + vertex.x * next.y - next.x * vertex.y
  }, 0) / 2
}

function orientation(a: MeshNode, b: MeshNode, c: MeshNode): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function onSegment(a: MeshNode, b: MeshNode, point: MeshNode, tolerance: number): boolean {
  return point.x >= Math.min(a.x, b.x) - tolerance && point.x <= Math.max(a.x, b.x) + tolerance &&
    point.y >= Math.min(a.y, b.y) - tolerance && point.y <= Math.max(a.y, b.y) + tolerance
}

function segmentsIntersect(a: MeshNode, b: MeshNode, c: MeshNode, d: MeshNode, tolerance: number): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  if (((abC > tolerance && abD < -tolerance) || (abC < -tolerance && abD > tolerance)) &&
    ((cdA > tolerance && cdB < -tolerance) || (cdA < -tolerance && cdB > tolerance))) return true
  if (Math.abs(abC) <= tolerance && onSegment(a, b, c, tolerance)) return true
  if (Math.abs(abD) <= tolerance && onSegment(a, b, d, tolerance)) return true
  if (Math.abs(cdA) <= tolerance && onSegment(c, d, a, tolerance)) return true
  return Math.abs(cdB) <= tolerance && onSegment(c, d, b, tolerance)
}

function cleanVertices(input: MeshNode[]): MeshNode[] {
  if (input.length > 257) throw new Error('A polygon is limited to 256 vertices.')
  if (input.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Polygon coordinates must be finite numbers.')
  const vertices = input.map((point) => ({ ...point }))
  if (vertices.length > 1 && distance(vertices[0]!, vertices[vertices.length - 1]!) <= 1e-12) vertices.pop()
  const xs = vertices.map((point) => point.x)
  const ys = vertices.map((point) => point.y)
  const scale = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const tolerance = scale * 1e-10
  for (let index = vertices.length - 1; index >= 0; index -= 1) {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length]!
    const current = vertices[index]!
    const next = vertices[(index + 1) % vertices.length]!
    if (distance(previous, current) <= tolerance || (Math.abs(orientation(previous, current, next)) <= tolerance * scale &&
      (current.x - previous.x) * (current.x - next.x) + (current.y - previous.y) * (current.y - next.y) <= tolerance)) {
      vertices.splice(index, 1)
    }
  }
  if (vertices.length < 3) throw new Error('A polygon requires at least three distinct vertices.')
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      if (j === i || j === i + 1 || (i === 0 && j === vertices.length - 1)) continue
      if (segmentsIntersect(vertices[i]!, vertices[(i + 1) % vertices.length]!, vertices[j]!, vertices[(j + 1) % vertices.length]!, tolerance)) {
        throw new Error('The polygon boundary must not intersect itself.')
      }
    }
  }
  if (signedPolygonArea(vertices) < 0) vertices.reverse()
  return vertices
}

export function polygonGeometry(input: MeshNode[]): HeatModel['geometry'] {
  const cleaned = cleanVertices(input)
  const minX = Math.min(...cleaned.map((point) => point.x))
  const minY = Math.min(...cleaned.map((point) => point.y))
  const vertices = cleaned.map((point) => ({ x: point.x - minX, y: point.y - minY }))
  const width = Math.max(...vertices.map((point) => point.x))
  const height = Math.max(...vertices.map((point) => point.y))
  const area = signedPolygonArea(vertices)
  if (!(width > 0) || !(height > 0) || !(area > Math.max(width, height) ** 2 * 1e-16)) throw new Error('The polygon must enclose a nonzero area.')
  if (width > 1000 || height > 1000 || width < 0.000001 || height < 0.000001) throw new Error('Polygon dimensions must be between 1 μm and 1000 m.')
  return { shape: 'polygon', width, height, vertices }
}

function parseCsv(source: string): MeshNode[] {
  const points: MeshNode[] = []
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  lines.forEach((line, index) => {
    const parts = line.split(/[,;\t ]+/)
    const x = Number(parts[0])
    const y = Number(parts[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (index === 0 && /[a-zA-Z]/.test(line)) return
      throw new Error(`Invalid coordinate pair on CSV row ${index + 1}.`)
    }
    points.push({ x, y })
  })
  return points
}

function parseSvgPath(data: string): MeshNode[] {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []
  const points: MeshNode[] = []
  let index = 0
  let command = ''
  let current = { x: 0, y: 0 }
  let start = current
  let closed = false
  const readPair = (relative: boolean) => {
    const x = Number(tokens[index++])
    const y = Number(tokens[index++])
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid SVG path coordinates.')
    current = { x: relative ? current.x + x : x, y: relative ? current.y + y : y }
    points.push({ ...current })
  }
  while (index < tokens.length) {
    if (closed) throw new Error('Multiple SVG subpaths are not supported.')
    const token = tokens[index]!
    if (/^[a-zA-Z]$/.test(token)) {
      command = token
      index += 1
    }
    const upper = command.toUpperCase()
    const relative = command !== upper
    if (upper === 'Z') { closed = true; command = ''; continue }
    if (!['M', 'L', 'H', 'V'].includes(upper)) throw new Error('SVG paths support only M, L, H, V and Z commands; flatten curves first.')
    if (upper === 'M' && points.length > 0) throw new Error('Multiple SVG subpaths are not supported.')
    if (upper === 'M' || upper === 'L') {
      readPair(relative)
      if (points.length === 1) start = { ...current }
      if (upper === 'M') command = relative ? 'l' : 'L'
    } else {
      const value = Number(tokens[index++])
      if (!Number.isFinite(value)) throw new Error('Invalid SVG path coordinate.')
      current = upper === 'H'
        ? { x: relative ? current.x + value : value, y: current.y }
        : { x: current.x, y: relative ? current.y + value : value }
      points.push({ ...current })
    }
  }
  if (points.length > 2 && (points[0]!.x !== start.x || points[0]!.y !== start.y)) points[0] = start
  return points
}

function parseSvg(source: string): MeshNode[] {
  const shapes = [...source.matchAll(/<(?:polygon|polyline)\b[^>]*>/gi)]
  const paths = [...source.matchAll(/<path\b[^>]*>/gi)]
  if (shapes.length + paths.length !== 1) throw new Error('The SVG must contain exactly one polygon, polyline or path.')
  const tag = (shapes[0] ?? paths[0])![0]
  const attribute = shapes.length ? 'points' : 'd'
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'))
  if (!match) throw new Error(`The SVG element has no ${attribute} attribute.`)
  return shapes.length
    ? (match[1]!.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number).reduce<MeshNode[]>((points, value, index, values) => {
      if (index % 2 === 0) points.push({ x: value, y: values[index + 1]! })
      return points
    }, [])
    : parseSvgPath(match[1]!)
}

/** Parses a single simple polygon. SVG coordinates are converted from screen-down to Cartesian up. */
export function parseGeometryFile(filename: string, source: string): HeatModel['geometry'] {
  const extension = filename.toLowerCase().split('.').pop()
  if (extension !== 'csv' && extension !== 'svg') throw new Error('Choose an .svg or .csv geometry file.')
  const points = extension === 'csv' ? parseCsv(source) : parseSvg(source)
  if (extension === 'svg') points.forEach((point) => { point.y = -point.y })
  return polygonGeometry(points)
}
