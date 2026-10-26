# OpenPhysics Studio

OpenPhysics Studio is a clean-room, open-source multiphysics workbench. It runs locally in the browser and provides a verifiable finite-element workflow from parametric geometry to open scientific data. It does not contain COMSOL code, assets, file formats, or branding.

**Current scope:** an educational and research prototype, not a full COMSOL replacement or a certified engineering tool. See the [functional comparison and explicit gap matrix](docs/comsol-comparison.md).

## Physics and studies

### Heat Transfer in Solids

- Stationary and transient 2D conduction with constant isotropic properties
- Density, heat capacity, thermal conductivity and uniform volumetric generation
- Fixed-temperature and insulated boundaries
- First-order implicit Euler with consistent P1 mass matrices
- Selectable time frames, temperature and heat-flux visualization

### Electrostatics

- Stationary 2D electric potential with relative permittivity
- Uniform space-charge density
- Fixed-potential and zero-charge/symmetry boundaries
- Electric potential and electric-field visualization

### Linear Elasticity

- Small-strain isotropic plane stress and plane strain
- Young’s modulus, Poisson’s ratio and uniform body forces
- Free, fixed, roller and prescribed normal-displacement boundaries
- Two displacement DOF per node with P1 triangular elements
- Automatically scaled deformed shape and displacement magnitude
- Elementwise strain, stress and 2D/3D-aware von Mises stress
- Independent analytical patch benchmarks for displacement and stress

### Geometry and unstructured meshing

- Parametric rectangles or one simple 2D polygon, including concave boundaries
- CSV coordinate import (`x,y` rows) and SVG polygon/polyline/linear-path import
- SVG paths support M/L/H/V/Z; curves, holes and multiple subpaths must be preprocessed externally
- Coordinate normalization to a `(0,0)` minimum and conversion of SVG screen-down Y to Cartesian Y
- Boundary validation for finite coordinates, self-intersections, duplicate/collinear vertices and dimensions
- Earcut triangulation with nested one-to-four red refinement (R0–R4 in the interface)
- Coarse node indices preserved during refinement for direct successive-mesh comparisons
- Polygon area, bounding-box dimensions, geometry/mesh views and an L-shaped electrostatic preset

### Automated studies and postprocessing

- Parametric sweeps of width, height, conductivity, permittivity, Young’s modulus, heat source and charge density
- Between 2 and 12 independently validated cases per sweep; bounding-box sweeps are rectangle-only
- Sweep table, average-value plot and selectable result fields
- Automatic ×2 element-size refinement sequences with 2–4 levels on mapped and unstructured meshes
- Normalized L2 differences between successive grids and observed order
- Explicit detection of the solver/round-off floor
- Exact P1 domain integration for primary scalar fields, area-weighted averages and extrema locations
- Area-centroid probe and open CSV exports for derived values and sweep tables
- Standalone local HTML simulation reports

### Shared numerical workflow

- Rectangular and simple-polygon 2D geometry with linear (P1) triangular finite elements
- Mapped or unstructured meshes shared by heat, electrostatics and linear elasticity
- Sparse assembly and Jacobi-preconditioned conjugate gradients
- Warm starts for transient time steps
- Explicit convergence and relative-residual reporting
- Versioned JSON projects (schema v5) with additive migration from schemas v1–v4
- Stable model signatures independent of object-key insertion order
- CSV, legacy VTK, JSON and HTML output; structural VTK includes displacement vectors and elementwise von Mises stress

All models and results stay on the local machine. No backend is required.

## Run

Requires Node.js 20 or later.

```bash
npm ci
npm run dev -- --port 7100
```

Open `http://localhost:7100`.

## Verify

```bash
npm test
npm run lint
npm run build
npm run test:ui
```

The UI check starts a temporary local server and drives Chrome or Edge through stationary thermal, transient thermal, electrostatic, linear-elastic, polygon-import, unstructured-mesh, convergence and parametric-sweep workflows. It checks SVG import, polygon refinement, time-frame selection, case selection, von Mises visualization and CSV/VTK/HTML downloads, saves screenshots outside the repository, and stops the server. Set `CHROME_PATH` if the browser is not installed in a standard Windows location.

See [verification models, analytical benchmarks and tolerances](docs/verification.md) for the exact verification contract.

## Numerical models

The stationary scalar finite-element kernel solves

```text
∇ · (−c∇u) = Q
```

with Dirichlet elimination and a natural zero-normal-flux condition.

For heat transfer, `u = T`, `c = k`, and `Q` is volumetric heat generation:

```text
∇ · (−k∇T) = Q
q = −k∇T
```

For transient heat transfer, with constant density ρ and heat capacity Cp:

```text
ρCp ∂T/∂t + ∇ · (−k∇T) = Q
(M/Δt + K)Tⁿ⁺¹ = (M/Δt)Tⁿ + F
```

The implementation uses implicit Euler (first order), fixed time steps and a consistent P1 mass matrix. The initial frame stores the uniform initial condition; Dirichlet values are imposed by the first solved step.

For electrostatics, `u = V`, `c = εᵣε₀`, and `Q = ρ`:

```text
∇ · (−ε∇V) = ρ
E = −∇V
```

For linear elasticity, the vector kernel assembles two displacement components per node:

```text
∇ · σ + b = 0
ε = (∇u + ∇uᵀ) / 2
σ = D : ε
Kₑ = Aₑ Bᵀ D B
```

Plane stress and plane strain use their respective isotropic constitutive matrices. Structural stress and strain are elementwise quantities; von Mises includes `σzz` for plane strain. The deformed shape is scaled automatically for display only.

These are 2D per-unit-depth models. Coefficients and source density are constant within the single domain.

## Derived values and convergence semantics

For each triangular element, primary scalar fields are integrated exactly using their area and the mean of their three nodal values. Domain averages are `∫u dA / ∫dA`; they are distinct from the field average displayed in the solver metrics. Extrema include coordinates, and the area-centroid probe uses P1 barycentric interpolation. Structural derived values interpolate the nodal displacement magnitude; this is not exact integration of the nonlinear magnitude inside each element.

A mesh-convergence study starts from the current base mesh and halves the maximum element size at every level. Rectangles double `nx` and `ny`; polygons use nested red refinement and preserve coarse node indices. For each pair of successive grids, the finer solution is sampled at the coarse nodes and compared using

```text
‖u_fine − u_coarse‖₂ / ‖u_fine‖₂
```

The observed order is estimated from three consecutive grid levels. These are **successive-grid self-convergence metrics**, not errors against an exact solution. Differences at or below `10 × solver relative tolerance` are marked as the solver/round-off floor, and no observed order is reported there.

For a transient model, mesh convergence and sweep tables use the final time frame. The finest rectangular grid is limited to 128 divisions per direction. Polygon studies are limited to R5 and 100,000 triangles; the interactive base-mesh control provides R0–R4. Studies do not modify the base mesh stored in the project.

Named left/right/top/bottom conditions apply at bounding-box extrema. All other polygon edges retain their natural condition. This is intentionally narrower than arbitrary edge selection or per-edge boundary assignment.

## Architecture

```text
src/lib/fem/geometry.ts       Polygon validation and SVG/CSV import
src/lib/fem/mesh.ts           Mapped, Earcut and red-refined triangular meshes
src/lib/fem/scalar.ts         Shared PDE/mass assembly and gradient recovery
src/lib/fem/solver.ts         Preconditioned conjugate gradients
src/lib/fem/heat.ts           Stationary/transient thermal interfaces
src/lib/fem/electrostatics.ts Electrostatic interface
src/lib/fem/elasticity.ts     2D vector elasticity and stress recovery
src/lib/fem/convergence.ts    Automated successive-grid studies
src/lib/fem/sweep.ts          Independent parametric cases
src/lib/fem/derived.ts        P1 integration, extrema and point evaluation
src/lib/fem/project.ts        Schema v5, v1–v4 migration and signatures
src/lib/fem/exporters.ts      CSV, VTK and standalone HTML reports
src/components/               Model tree, settings, plots and viewport
src/App.tsx                   Workflow orchestration
```

The numerical core has no React dependency. A future native or WASM solver can implement the same model/result boundary without changing the model-builder interface.

## Roadmap

1. Web Workers/WASM and a direct solver for larger models
2. One-way thermal–structural coupling and nonzero traction boundaries
3. General spatially varying coefficients and arbitrary boundary selections
4. Error-guided adaptive refinement and broader manufactured-solution verification
5. Community physics plug-ins and fully coupled studies

A full COMSOL replacement is a long-term community program, not a claim made by this prototype.

## License

MIT. See [LICENSE](LICENSE).
