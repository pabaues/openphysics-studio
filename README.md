# OpenPhysics Studio

OpenPhysics Studio is a clean-room, open-source multiphysics workbench prototype. It does not contain COMSOL code, assets, file formats, or branding.

## What works in this milestone

- Parametric 2D rectangular geometry
- Isotropic thermal conductivity and volumetric heat generation
- Fixed-temperature and insulated boundaries
- Mapped triangular meshes with linear (P1) finite elements
- Sparse assembly and Jacobi-preconditioned conjugate gradients
- Explicit convergence and relative-residual reporting
- Temperature and element heat-flux visualization
- JSON model persistence plus CSV and legacy VTK export
- Analytical regression tests for linear conduction, internal generation, and uniform temperature

The application is fully local. No model or result is sent to a server.

## Run

Requires Node.js 20 or later.

```bash
npm install
npm run dev -- --port 7100
```

## Verify

```bash
npm test
npm run build
npm run lint
npm run test:ui
```

The UI check starts a temporary local server, drives Chrome or Edge through editing, computation, presets, and CSV download, saves screenshots outside the repository, and stops the server. Set `CHROME_PATH` if the browser is not installed in a standard Windows location.

## Numerical model

The stationary heat equation is

```text
∇ · (−k∇T) = Q
```

on a rectangular domain. Fixed temperatures are imposed by Dirichlet elimination. Insulation is the natural zero-normal-flux boundary condition. Each rectangular cell is split into two linear triangular elements. The resulting symmetric positive-definite free-node system is solved with Jacobi-preconditioned conjugate gradients.

This is a 2D per-unit-depth model. Temperature is shown in °C; the equation uses temperature differences, so no absolute-temperature conversion is required for the present linear conduction model.

## Architecture

```text
src/lib/fem/       Numerical core, project schema, and open-format exporters
src/components/    Model tree, settings, and scientific viewport
src/App.tsx        Workflow orchestration and local persistence actions
```

The numerical core has no React dependency. A future native solver can implement the same model/result boundary without changing the model-builder interface.

## Roadmap

1. Verification suite, manufactured solutions, and adaptive mesh refinement
2. Electrostatics and general scalar-coefficient PDE interfaces
3. Time integration and parametric sweeps
4. Linear elasticity and one-way thermal–structural coupling
5. Rust or C++ solver workers, larger sparse matrices, and parallel execution
6. Unstructured geometry/mesh import and community physics plug-ins

A full COMSOL replacement is a long-term community program, not a claim made by this prototype.

## License

MIT. See [LICENSE](LICENSE).
