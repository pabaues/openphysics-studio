# OpenPhysics Studio

OpenPhysics Studio is a clean-room, open-source multiphysics workbench. It runs locally in the browser and provides a verifiable finite-element workflow from geometry to open scientific data. It contains no COMSOL code, assets, proprietary file formats, or branding.

**Current scope:** an educational and research prototype, not a full COMSOL replacement or a certified engineering tool. See the [functional comparison and explicit gap matrix](docs/comsol-comparison.md).

## Physics and studies

### Heat Transfer in Solids

- Stationary and transient conduction in 2D and prismatic 3D with P1 triangles/tetrahedra.
- Isotropic conductivity `k(x,y) = k₀ + gx x + gy y`, evaluated per 2D element or 3D tetrahedron centroid; uniform volumetric generation.
- Fixed-temperature and insulated named boundaries, plus overrides on arbitrary geometric edges. Prismatic 3D models add front/back conditions and share nodes at conforming domain interfaces.
- First-order implicit Euler, consistent P1 mass matrices, warm starts and selectable time frames for 2D and 3D transient studies.
- Temperature and XYZ heat-flux visualization, including an interactive 3D surface view.

### Electrostatics

- Stationary 2D and prismatic 3D potential with spatially linear relative permittivity.
- Uniform space-charge density, fixed potential and zero-charge/symmetry conditions on named boundaries, including front/back in 3D.
- Arbitrary-edge conditions in the 2D section; potential, XYZ field magnitude and vector output.
- Per-domain permittivity with continuous potential and normal electric displacement at conforming material interfaces.

### Integrated photonics templates

- Editable **Si PIN photodetector** and **high-density Si PN modulator** cross-sections with three conforming silicon domains.
- Parametric global bounding box, active-domain area, domain names, per-domain materials, terminal potentials and mesh controls.
- Ready-to-run bias sweeps, mesh convergence, adaptive studies and open-format exports; also available through `createExampleModel` in the TypeScript API.
- These are reduced-order electrostatic templates: they solve `V` and `E`, but do not compute optical modes, responsivity, drift–diffusion current, effective index or optical phase shift. See [dimensions, editing workflow and physical limits](docs/photonics.md).

### Linear Elasticity

- Small-strain isotropic plane stress/plane strain in 2D and full three-component elasticity in prismatic 3D, with spatially linear Young’s modulus.
- XYZ body forces, free/fixed/roller/normal-displacement boundaries and consistent nonzero P1 edge tractions in 2D or face tractions in 3D.
- Optional one-way stationary thermal–structural coupling using `εth = α(T − Tref)` in 2D and 3D.
- Two displacement DOF per node in 2D or three in 3D, scaled 2D deformed shape, element strain/stress and von Mises output.
- Analytical traction, lateral-contraction, multidomain and stress-free thermal-expansion benchmarks.

### Custom scalar PDE

```text
−∇ · (c∇u) + a u = f
```

- Positive constant diffusion, nonnegative reaction and constant source.
- Dirichlet and Neumann conditions on named or arbitrary geometric edges.
- Nodal field and element-gradient visualization and export.
- Available from the workbench and the public TypeScript API.

### Geometry, domains and meshing

- Parametric rectangles, simple 2D polygons and up to 16 independent polygon domains, including concave boundaries and dimensions down to 1 nm.
- Interactive prismatic 3D modeling: extrude each section with independent depth and Z position, orbit/pan/zoom, select solids, and use isometric/front/top/fit or wireframe views. The editable **3D layered block** preset demonstrates three domains.
- Real tetrahedral meshing for prismatic 3D models: each triangular prism adds a centre node and eight positive-volume P1 tetrahedra. Global-node-based face diagonals preserve conforming interfaces; Z divisions are editable and connected domains must share depth and center Z.
- Editable global bounding box and active-domain area for every geometry; whole-model scaling preserves domain/material assignments and conforming interfaces.
- Conforming multidomain meshes: matching full edges become continuous interfaces with shared nodes; disconnected regions and vertex-only contacts are supported.
- Per-domain isotropic materials for heat, electrostatics, transient studies, elasticity and one-way thermal coupling.
- CSV coordinates and SVG polygon/polyline/linear-path import; M/L/H/V/Z commands. Import currently creates one polygon.
- Geometry validation rejects overlaps, partial-edge contacts and T-junctions. Earcut triangulation and nested uniform red refinement preserve domain tags.
- Error-guided local refinement for stationary 2D scalar physics: area-weighted gradient recovery, largest-indicator marking and conforming longest-edge bisection without hanging nodes.
- Coarse node indices and per-element domain assignments preserved during refinement.

### Automated studies and postprocessing

- Parametric sweeps of geometry, material and source parameters supported by each existing physics interface.
- Automatic ×2 mesh-convergence sequences with normalized successive-grid L2 differences and observed order; 3D sequences refine X, Y and Z together.
- Optional exact nodal RMS/max error against scalar-sine and logarithmic-heat manufactured solutions on single-domain 2D models.
- Adaptive reports with nodes, elements, marked fraction, recovery indicator and optional exact error for supported 2D scalar studies.
- Exact P1 integration globally and per domain, extrema, area/volume-centroid probes and derived CSV.
- CSV with Z coordinates for 3D, legacy VTK triangles/tetrahedra with `domain_id`, versioned JSON and standalone HTML reports with domain materials.

## Solvers and execution

- Sparse assembly with conjugate gradients and Jacobi or zero-fill incomplete-Cholesky IC(0) preconditioning.
- Natural or reverse Cuthill–McKee ordering for iterative and direct solves.
- Sparse LDLᵀ factorization without pivoting for symmetric positive-definite systems.
- True relative residuals and convergence state; warm starts for transient steps.
- A synchronous WebAssembly dot-product kernel with JavaScript fallback. It is only a kernel, not a full WASM solver; no speedup is claimed without a workload-specific benchmark.
- Compute, convergence, adaptation and sweeps run sequentially in one persistent Web Worker. Edits logically invalidate stale responses but do not immediately cancel an active calculation.
- Schema v11 projects with additive migration from v1–v10, persistent per-domain 3D extrusion settings, Z divisions, electric/structural front/back conditions, body force Z and stable model signatures.

All models and results stay on the local machine. No backend is required.

## Interactive workbench

- Workflow tabs for Home, Geometry, Materials, Physics, Mesh, Study and Results expose only commands implemented by the current workbench.
- A collapsible Model Builder, shared domain selection and a COMSOL-style Model Builder → Settings → Graphics layout keep the active context visible.
- Click a domain in Geometry to edit its dimensions and material assignments; click a named boundary in Graphics to open its current physics settings.
- Accessible keyboard selection, functional zoom in/out/fit controls, responsive panels and live status messages support mouse and keyboard workflows.

## Run

Requires Node.js 20 or later.

```bash
npm ci
npm run dev -- --port 7100
```

Open `http://localhost:7100`.

## Windows desktop — no installation

Download the latest `OpenPhysics-Studio-Windows-x64.exe` from the [rolling Windows release](https://github.com/pabaues/openphysics-studio/releases/tag/latest) and double-click it. The portable application includes Electron and the complete local workbench: Node.js, a server and an internet connection are not required after download.

Every successful push to `main` runs the verification suite, builds and tests the Windows application, then replaces the `.exe` and its SHA-256 checksum in that same `latest` release. Download the asset again to obtain a newer build; the application does not update itself in the background.

This is currently an **unsigned community build**, so Windows SmartScreen may request confirmation. It is distributed as a prerelease and should be used with the same research-prototype limitations described in this repository.

For desktop development on Windows:

```bash
npm run desktop          # Build and open the unpacked application
npm run test:desktop     # Launch it and run a real computation
npm run build:desktop    # Generate release/latest/OpenPhysics-Studio-Windows-x64.exe
```

The packaging step reuses the Electron distribution installed by `npm ci`. `DESKTOP_OUTPUT` can select another output directory, and `DESKTOP_EXECUTABLE` lets `test:desktop` validate a packaged binary.

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
npm run test:desktop  # Windows; validates startup and a real computation
```

The UI check starts a temporary server on port 7101, drives Chrome or Edge through both solver families, Web Worker execution, stale-response invalidation, thermal/transient/electrostatic/structural/custom workflows, manufactured convergence, adaptation, IC(0), polygon import, connected/disconnected multidomain editing, per-domain materials, both editable photonic templates, convergence, bias sweeps and downloads. For 3D it checks geometry/camera controls, stationary and transient heat, electrostatics, elasticity, front/back editing, surface fields, XYZ convergence, CSV/VTK/derived exports and JSON v11 round-trip. It saves screenshots outside the repository and stops the server. Set `CHROME_PATH` or `UI_TEST_PORT` when needed.

See [verification models, analytical benchmarks and tolerances](docs/verification.md) for the exact verification contract.

## Convergence and adaptation semantics

Successive-grid L2 differences are **not** exact-solution errors. When a manufactured reference is selected, the report separately computes nodal RMS (`exactL2`) and maximum absolute error (`exactMaximum`). The scalar-sine case imposes zero Dirichlet boundaries and manufactures the corresponding source. The logarithmic case requires stationary heat, zero source, zero conductivity gradient in Y and insulated top/bottom boundaries. Manufactured references currently require a single-domain 2D model.

The adaptive recovery indicator guides refinement but is **not a guaranteed error bound**. Local adaptation currently supports stationary 2D heat, electrostatics and custom scalar physics; 3D, elasticity and transient studies use uniform convergence sequences. Centre-based 3D refinement compares all shared physical nodes and excludes non-nested prism centres. Studies do not modify the base mesh stored in the project.

## Important limits

- Up to 16 simple polygon domains with one isotropic material each, P1 triangles in 2D and P1 tetrahedra in prismatic 3D.
- Interfaces require complete matching edges; there is no automatic geometry partitioning, multidomain file import or general nonconforming-interface coupling. Connected 3D domains must share depth and center Z.
- Spatial material variation is linear in X/Y and evaluated at element centroids; Z-dependent, field-dependent, anisotropic and nonlinear materials are absent.
- 3D FEM supports stationary/transient heat, stationary electrostatics and stationary linear elasticity. Custom PDE and local adaptation remain 2D only.
- No general CAD 3D, holes, multiple subpaths, curves, Boolean geometry or axisymmetry.
- Thermal coupling is one-way and stationary; no strongly coupled block solve or multiphysics iteration.
- Custom PDE coefficients/source are constant except for the built-in manufactured-sine source; there is no expression parser or plug-in SDK.
- No higher-order elements, nonlinear/contact/dynamic mechanics, CFD, acoustics, eigenvalue or frequency-domain studies.
- IC(0) and RCM do not make the solver generally scalable or suitable for indefinite/nonsymmetric systems. LDLᵀ uses no pivoting.
- No multicore parallelism, cluster/GPU backend or immediate cancellation.

## Architecture

```text
src/lib/fem/scalar.ts          Shared 2D scalar assembly and gradients
src/lib/fem/scalar3d.ts        Shared 3D scalar stiffness, mass and gradients
src/lib/fem/geometry.ts        Polygon validation and multidomain construction
src/lib/fem/mesh.ts            Conforming 2D meshes and domain-tagged refinement
src/lib/fem/mesh3d.ts          Centre-based conforming prismatic tetrahedralization
src/lib/fem/heat3d.ts          Stationary/transient tetrahedral heat and flux
src/lib/fem/electrostatics3d.ts Tetrahedral potential, field and displacement
src/lib/fem/elasticity.ts      2D vector elasticity, traction and thermal strain
src/lib/fem/elasticity3d.ts    3D elasticity, face traction and von Mises stress
src/lib/fem/properties.ts      Per-domain spatial material evaluation
src/lib/fem/custom.ts          Custom diffusion–reaction interface
src/lib/fem/adaptive.ts        Recovery indicator and conforming local refinement
src/lib/fem/manufactured.ts    Exact references and error metrics
src/lib/fem/solver.ts          CG, sparse LDLᵀ and ordering integration
src/lib/fem/preconditioner.ts  Jacobi and IC(0)
src/lib/fem/ordering.ts        Reverse Cuthill–McKee
src/lib/fem/wasm.ts            Synchronous WASM dot product with JS fallback
src/lib/fem/project.ts         Schema v11 and v1–v10 migration
src/lib/openphysics.ts         Public numerical API
src/workers/study.worker.ts    Background compute and study jobs
src/components/               Model tree, settings, plots and 2D/3D viewports
```

## License

MIT. See [LICENSE](LICENSE).
