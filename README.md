# OpenPhysics Studio

OpenPhysics Studio is a clean-room, open-source multiphysics workbench. It runs locally in the browser and provides a verifiable finite-element workflow from parametric geometry to open scientific data. It does not contain COMSOL code, assets, file formats, or branding.

## Available physics and studies

### Heat Transfer in Solids

- Stationary 2D conduction with isotropic thermal conductivity
- Uniform volumetric heat generation
- Fixed-temperature and insulated boundaries
- Temperature and heat-flux visualization

### Electrostatics

- Stationary 2D electric potential with relative permittivity
- Uniform space-charge density
- Fixed-potential and zero-charge/symmetry boundaries
- Electric potential and electric-field visualization

### Shared numerical workflow

- Parametric rectangular geometry
- Mapped triangular meshes with linear (P1) finite elements
- Sparse assembly and Jacobi-preconditioned conjugate gradients
- Explicit convergence and relative-residual reporting
- Automatic ×2 mesh-refinement sequences with 2–4 levels
- Normalized L2 differences between successive grids and observed order
- Explicit detection of the solver/round-off floor
- JSON project persistence, including migration from thermal-only schema v1
- CSV and legacy VTK export

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

The UI check starts a temporary local server, drives Chrome or Edge through thermal and electrostatic workflows, downloads, and mesh convergence, saves screenshots outside the repository, and stops the server. Set `CHROME_PATH` if the browser is not installed in a standard Windows location.

## Numerical models

The shared scalar finite-element kernel solves

```text
∇ · (−c∇u) = Q
```

with Dirichlet elimination and a natural zero-normal-flux condition.

For heat transfer, `u = T`, `c = k`, and `Q` is volumetric heat generation:

```text
∇ · (−k∇T) = Q
q = −k∇T
```

For electrostatics, `u = V`, `c = εᵣε₀`, and `Q = ρ`:

```text
∇ · (−ε∇V) = ρ
E = −∇V
```

These are 2D per-unit-depth models. The current implementation assumes constant coefficients and source density within the domain.

## Mesh convergence semantics

A convergence study starts from the current base mesh and doubles both divisions at every level. For each pair of successive grids, the finer solution is sampled at the coarse nodes and compared using

```text
‖u_fine − u_coarse‖₂ / ‖u_fine‖₂
```

The observed order is estimated from three consecutive grid levels. These are **successive-grid self-convergence metrics**, not errors against an exact solution. Differences at or below `10 × solver relative tolerance` are marked as the solver/round-off floor, and no observed order is reported there.

The finest grid is limited to 128 divisions per direction to bound interactive cost. The study does not modify the base mesh stored in the project.

## Architecture

```text
src/lib/fem/scalar.ts          Shared scalar PDE assembly and gradient recovery
src/lib/fem/solver.ts          Preconditioned conjugate gradients
src/lib/fem/heat.ts            Thermal interface
src/lib/fem/electrostatics.ts  Electrostatic interface
src/lib/fem/convergence.ts     Automated successive-grid studies
src/lib/fem/project.ts         Versioned project schema and v1 migration
src/lib/fem/exporters.ts       CSV and VTK scientific data
src/components/                Model tree, settings, plots, and viewport
src/App.tsx                    Workflow orchestration
```

The numerical core has no React dependency. A future native solver can implement the same model/result boundary without changing the model-builder interface.

## Roadmap

1. Time integration and parametric sweeps
2. General spatially varying coefficients and unstructured mesh import
3. Linear elasticity and one-way thermal–structural coupling
4. Adaptive refinement and manufactured-solution verification
5. Rust or C++ solver workers and parallel execution
6. Community physics plug-ins and fully coupled studies

A full COMSOL replacement is a long-term community program, not a claim made by this prototype.

## License

MIT. See [LICENSE](LICENSE).
