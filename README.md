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

### Automated studies and postprocessing

- Parametric sweeps of width, height, conductivity, permittivity, heat source and charge density
- Between 2 and 12 independently validated cases per sweep
- Sweep table, average-value plot and selectable result fields
- Automatic ×2 mesh-refinement sequences with 2–4 levels
- Normalized L2 differences between successive grids and observed order
- Explicit detection of the solver/round-off floor
- Exact P1 domain integration, area-weighted averages and extrema locations
- Center probe and open CSV exports for derived values and sweep tables
- Standalone local HTML simulation reports

### Shared numerical workflow

- Parametric rectangular geometry
- Mapped triangular meshes with linear (P1) finite elements
- Sparse assembly and Jacobi-preconditioned conjugate gradients
- Warm starts for transient time steps
- Explicit convergence and relative-residual reporting
- Versioned JSON projects with additive migration from schemas v1 and v2
- Stable model signatures independent of object-key insertion order
- CSV, legacy VTK, JSON and HTML output

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

The UI check starts a temporary local server and drives Chrome or Edge through stationary thermal, transient thermal, electrostatic, mesh-convergence and parametric-sweep workflows. It checks time-frame selection, case selection and CSV/VTK/HTML downloads, saves screenshots outside the repository, and stops the server. Set `CHROME_PATH` if the browser is not installed in a standard Windows location.

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

These are 2D per-unit-depth models. Coefficients and source density are constant within the single domain.

## Derived values and convergence semantics

For each triangular element, the linear field is integrated exactly using its area and the mean of its three nodal values. Domain averages are `∫u dA / ∫dA`; they are distinct from the nodal average displayed in the solver metrics. Extrema include coordinates, and the center probe uses P1 barycentric interpolation.

A mesh-convergence study starts from the current base mesh and doubles both divisions at every level. For each pair of successive grids, the finer solution is sampled at the coarse nodes and compared using

```text
‖u_fine − u_coarse‖₂ / ‖u_fine‖₂
```

The observed order is estimated from three consecutive grid levels. These are **successive-grid self-convergence metrics**, not errors against an exact solution. Differences at or below `10 × solver relative tolerance` are marked as the solver/round-off floor, and no observed order is reported there.

For a transient model, mesh convergence and sweep tables use the final time frame. The finest grid is limited to 128 divisions per direction to bound interactive cost. Studies do not modify the base mesh stored in the project.

## Architecture

```text
src/lib/fem/scalar.ts          Shared PDE/mass assembly and gradient recovery
src/lib/fem/solver.ts          Preconditioned conjugate gradients
src/lib/fem/heat.ts            Stationary/transient thermal interfaces
src/lib/fem/electrostatics.ts  Electrostatic interface
src/lib/fem/convergence.ts     Automated successive-grid studies
src/lib/fem/sweep.ts           Independent parametric cases
src/lib/fem/derived.ts         P1 integration, extrema and point evaluation
src/lib/fem/project.ts         Schema v3, v1/v2 migration and signatures
src/lib/fem/exporters.ts       CSV, VTK and standalone HTML reports
src/components/                Model tree, settings, plots and viewport
src/App.tsx                    Workflow orchestration
```

The numerical core has no React dependency. A future native or WASM solver can implement the same model/result boundary without changing the model-builder interface.

## Roadmap

1. Linear elasticity and independent benchmark verification
2. General spatially varying coefficients and unstructured mesh import
3. One-way thermal–structural coupling
4. Adaptive refinement and manufactured-solution verification
5. Web Workers, Rust/C++ solver backends and parallel execution
6. Community physics plug-ins and fully coupled studies

A full COMSOL replacement is a long-term community program, not a claim made by this prototype.

## License

MIT. See [LICENSE](LICENSE).
