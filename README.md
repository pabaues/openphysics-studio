# OpenPhysics Studio

OpenPhysics Studio is a clean-room, open-source multiphysics workbench. It runs locally in the browser and provides a verifiable finite-element workflow from geometry to open scientific data. It contains no COMSOL code, assets, proprietary file formats, or branding.

**Current scope:** an educational and research prototype, not a full COMSOL replacement or a certified engineering tool. See the [functional comparison and explicit gap matrix](docs/comsol-comparison.md).

## Physics and studies

### Heat Transfer in Solids

- Stationary and transient 2D conduction with isotropic conductivity `k(x,y) = k₀ + gx x + gy y`.
- Density, heat capacity and uniform volumetric generation.
- Fixed-temperature and insulated named boundaries, plus overrides on arbitrary geometric edges.
- First-order implicit Euler, consistent P1 mass matrices and selectable time frames.
- Temperature, heat-flux and vector visualization.

### Electrostatics

- Stationary 2D potential with spatially linear relative permittivity.
- Uniform space-charge density, fixed potential and zero-charge/symmetry conditions.
- Named and arbitrary-edge conditions; potential, field magnitude and vector output.

### Linear Elasticity

- Small-strain isotropic plane stress and plane strain with spatially linear Young’s modulus.
- Body forces, free/fixed/roller/normal-displacement boundaries and consistent nonzero P1 edge tractions.
- Optional one-way stationary thermal–structural coupling using `εth = α(T − Tref)`.
- Two displacement DOF per node, scaled deformed shape, element strain/stress and von Mises output.
- Analytical traction and stress-free thermal-expansion benchmarks.

### Custom scalar PDE

```text
−∇ · (c∇u) + a u = f
```

- Positive constant diffusion, nonnegative reaction and constant source.
- Dirichlet and Neumann conditions on named or arbitrary geometric edges.
- Nodal field and element-gradient visualization and export.
- Available from the workbench and the public TypeScript API.

### Geometry and meshing

- Parametric rectangles or one simple 2D polygon, including concave boundaries.
- CSV coordinates and SVG polygon/polyline/linear-path import; M/L/H/V/Z commands.
- Geometry validation, Earcut triangulation and nested uniform red refinement.
- Error-guided local refinement for stationary scalar physics: area-weighted gradient recovery, largest-indicator marking and conforming longest-edge bisection without hanging nodes.
- Coarse node indices preserved during refinement.

### Automated studies and postprocessing

- Parametric sweeps of geometry, material and source parameters supported by each existing physics interface.
- Automatic ×2 mesh-convergence sequences with normalized successive-grid L2 differences and observed order.
- Optional exact nodal RMS/max error against scalar-sine and logarithmic-heat manufactured solutions.
- Adaptive reports with nodes, elements, marked fraction, recovery indicator and optional exact error.
- Exact P1 integration of primary scalar fields, extrema, area-centroid probes and derived CSV.
- CSV, legacy VTK, versioned JSON and standalone HTML reports.

## Solvers and execution

- Sparse assembly with conjugate gradients and Jacobi or zero-fill incomplete-Cholesky IC(0) preconditioning.
- Natural or reverse Cuthill–McKee ordering for iterative and direct solves.
- Sparse LDLᵀ factorization without pivoting for symmetric positive-definite systems.
- True relative residuals and convergence state; warm starts for transient steps.
- A synchronous WebAssembly dot-product kernel with JavaScript fallback. It is only a kernel, not a full WASM solver; no speedup is claimed without a workload-specific benchmark.
- Compute, convergence, adaptation and sweeps run sequentially in one persistent Web Worker. Edits logically invalidate stale responses but do not immediately cancel an active calculation.
- Schema v7 projects with additive migration from v1–v6 and stable model signatures.

All models and results stay on the local machine. No backend is required.

## Run

Requires Node.js 20 or later.

```bash
npm ci
npm run dev -- --port 7100
```

Open `http://localhost:7100`.

## Public TypeScript API

The numerical core has no React dependency. Build the ES module and declarations with:

```bash
npm run build:lib
```

The package entry point is `src/lib/openphysics.ts`; generated artifacts are written to `dist-lib/`.

```ts
import {
  defaultModel,
  rectangleGeometry,
  runAdaptiveStudy,
  runConvergenceStudy,
  solveModel,
  toCsv,
} from 'openphysics-studio'

const model = structuredClone(defaultModel)
model.activePhysics = 'custom'
model.geometry = rectangleGeometry(1, 1)
model.custom = {
  ...model.custom,
  diffusion: 2,
  reaction: 0.5,
}
model.study.manufacturedSolution = 'scalarSine'

const result = solveModel(model)
const convergence = runConvergenceStudy(model)
const adaptive = runAdaptiveStudy({ ...model, adaptive: { levels: 3, markFraction: 0.3 } })
console.log(result.minimum, result.maximum, convergence.entries, adaptive.entries)
console.log(toCsv(result))
```

`solveModel` also accepts an `.opmodel.json` string and validates the complete schema before solving. The API is public but still pre-1.0: breaking changes may occur between minor versions.

## Verify

```bash
npm test
npm run lint
npm run build
npm run build:lib
npm run test:ui
```

The UI check starts a temporary server on port 7101, drives Chrome or Edge through both solver families, Web Worker execution, stale-response invalidation, thermal/transient/electrostatic/structural/custom workflows, manufactured convergence, adaptation, IC(0), polygon import, sweeps and downloads. It saves screenshots outside the repository and stops the server. Set `CHROME_PATH` or `UI_TEST_PORT` when needed.

See [verification models, analytical benchmarks and tolerances](docs/verification.md) for the exact verification contract.

## Convergence and adaptation semantics

Successive-grid L2 differences are **not** exact-solution errors. When a manufactured reference is selected, the report separately computes nodal RMS (`exactL2`) and maximum absolute error (`exactMaximum`). The scalar-sine case imposes zero Dirichlet boundaries and manufactures the corresponding source. The logarithmic case requires stationary heat, zero source, zero conductivity gradient in Y and insulated top/bottom boundaries.

The adaptive recovery indicator guides refinement but is **not a guaranteed error bound**. Local adaptation currently supports stationary heat, electrostatics and custom scalar physics; elasticity and transient studies use uniform convergence sequences. Studies do not modify the base mesh stored in the project.

## Important limits

- One 2D domain per model, one isotropic material, P1 triangles and per-unit-depth physics.
- Spatial material variation is linear; field-dependent properties, anisotropy and nonlinear materials are absent.
- No holes, multiple subpaths, curves, CAD, Boolean geometry, axisymmetry or 3D.
- Thermal coupling is one-way and stationary; no strongly coupled block solve or multiphysics iteration.
- Custom PDE coefficients/source are constant except for the built-in manufactured-sine source; there is no expression parser or plug-in SDK.
- No higher-order elements, nonlinear/contact/dynamic mechanics, CFD, acoustics, eigenvalue or frequency-domain studies.
- IC(0) and RCM do not make the solver generally scalable or suitable for indefinite/nonsymmetric systems. LDLᵀ uses no pivoting.
- No multicore parallelism, cluster/GPU backend or immediate cancellation.

## Architecture

```text
src/lib/fem/scalar.ts          Shared scalar assembly and gradients
src/lib/fem/elasticity.ts      Vector elasticity, traction and thermal strain
src/lib/fem/custom.ts          Custom diffusion–reaction interface
src/lib/fem/adaptive.ts        Recovery indicator and conforming local refinement
src/lib/fem/manufactured.ts    Exact references and error metrics
src/lib/fem/solver.ts          CG, sparse LDLᵀ and ordering integration
src/lib/fem/preconditioner.ts  Jacobi and IC(0)
src/lib/fem/ordering.ts        Reverse Cuthill–McKee
src/lib/fem/wasm.ts            Synchronous WASM dot product with JS fallback
src/lib/fem/project.ts         Schema v7 and v1–v6 migration
src/lib/openphysics.ts         Public numerical API
src/workers/study.worker.ts    Background compute and study jobs
src/components/               Model tree, settings, plots and viewport
```

## License

MIT. See [LICENSE](LICENSE).
