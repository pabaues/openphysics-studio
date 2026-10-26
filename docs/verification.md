# Verificación numérica

OpenPhysics Studio es un prototipo de investigación y enseñanza. Estas pruebas verifican casos concretos; no constituyen certificación industrial ni demuestran paridad con COMSOL.

## Elasticidad lineal 2D

El núcleo resuelve elasticidad isotrópica de pequeñas deformaciones con triángulos P1 y dos grados de libertad por nodo:

```text
∇ · σ + b = 0
ε = (∇u + ∇uᵀ) / 2
σ = D : ε
Kₑ = Aₑ Bᵀ D B
```

Se ensambla un sistema disperso simétrico definido positivo cuando las condiciones de contorno eliminan los modos de cuerpo rígido. Las condiciones esenciales se aplican por eliminación. El usuario puede seleccionar gradientes conjugados precondicionados por Jacobi o factorización directa LDLᵀ dispersa sin pivotaje para sistemas SPD. El residuo relativo mostrado se recalcula sobre el sistema algebraico original; no es una cota del error físico.

Están disponibles tensión plana y deformación plana. En deformación plana, la tensión de von Mises incluye `σzz = ν(σxx + σyy)`; en tensión plana, `σzz = 0`. Las deformaciones y tensiones son constantes por elemento. La deformada del visor usa una escala automática exclusivamente gráfica y no modifica los resultados.

### Casos analíticos independientes

Los tests están en `src/lib/fem/elasticity.benchmark.test.ts` y no comparan OpenPhysics consigo mismo ni con resultados generados por otro solver.

1. **Tracción uniaxial en tensión plana.** Rectángulo de `0,2 × 0,1 m`, `E = 70 GPa`, `ν = 0,25`, desplazamiento normal derecho `uₓ = 20 μm`, rodillo izquierdo e inferior y borde superior libre. Con `ε₀ = 10⁻⁴`, se comprueba en todos los nodos:

   ```text
   uₓ = ε₀ x
   uᵧ = −ν ε₀ y
   σxx = E ε₀
   σyy = σxy = 0
   ```

   El desplazamiento debe coincidir con error absoluto menor que `10⁻¹¹ m`; las tensiones, con error relativo menor que `10⁻⁸`.

2. **Solución uniaxial en deformación plana.** Las mismas condiciones exigen:

   ```text
   uₓ = ε₀ x
   uᵧ = −ν/(1 − ν) ε₀ y
   σxx = E ε₀/(1 − ν²)
   σyy = 0
   σzz = ν σxx
   ```

   Se aplican los mismos umbrales de desplazamiento y tensión.

3. **Traslación de cuerpo rígido.** Una traslación prescrita de `(3, −2) mm` debe reproducirse en todos los nodos. Las deformaciones deben ser menores que `10⁻¹²` y la tensión de von Mises menor que `10⁻³ Pa`.

4. **Refinamiento sucesivo.** Tres mallas duplican las divisiones en cada dirección. Como la solución analítica afín pertenece exactamente al espacio P1, la diferencia entre mallas debe alcanzar el suelo declarado del solver. Este caso no pretende medir un orden de convergencia para soluciones generales.

## Geometría poligonal y malla no estructurada

Los tests de `src/lib/fem/geometry.test.ts` comprueban:

1. Importación y normalización de CSV, SVG polygon y path SVG lineal; el dominio de prueba en L conserva un área exacta de `3 m²`.
2. Rechazo de auto-intersecciones y de curvas SVG no aplanadas.
3. Refinamiento rojo 1→4: cuatro triángulos iniciales producen dieciséis, los índices de los nodos groseros se conservan y el tamaño máximo de arista se divide por dos.
4. Reproducción de campos afines térmicos y eléctricos en una malla no estructurada con tolerancia absoluta de `10⁻⁸`; las condiciones del caso analítico son compatibles con todos los bordes naturales.
5. Estudio anidado R0→R1→R2 en un polígono cóncavo, sin conversiones a una malla estructurada.

El ensayo de navegador importa un SVG en L, cambia de R1 a R2, comprueba 64 triángulos, resuelve, descarga VTK y ejecuta tres niveles de convergencia poligonal.

## Otros modelos y regresión

La suite también comprueba conducción estacionaria y transitoria, electrostática, elasticidad, integración y sondas, migraciones de proyectos v1–v5, barridos, exportadores y estudios de convergencia. `solver.test.ts` verifica sistemas SPD, relleno de la factorización y rechazo de matrices no SPD. `direct.integration.test.ts` contrasta LDLᵀ con CG en las tres físicas y en un transitorio implícito breve, comparando campos y residuos. El script de navegador comprueba que los estudios crean un Web Worker, ejecuta cálculo y convergencia con LDLᵀ, verifica que una edición invalida una respuesta obsoleta y recorre presets, cantidades de resultado y descargas CSV, VTK y HTML.

## Semántica de convergencia y valores derivados

La convergencia automática compara mallas sucesivas mediante una diferencia L2 relativa; no sustituye al error frente a una solución exacta. En rectángulos se duplican `nx` y `ny`; en polígonos se aplica refinamiento rojo anidado y se comparan directamente los índices groseros preservados. En ambos casos `h` es la arista máxima de la malla. El orden observado solo se calcula cuando hay tres niveles y las diferencias están por encima del suelo del solver.

Para calor y potencial eléctrico, la integración P1 por elemento es exacta. La sonda se evalúa en el centroide de área del dominio, incluido un polígono cóncavo. Para elasticidad se interpola la magnitud nodal del desplazamiento como un campo P1: su integral no es la integral exacta de `√(uₓ² + uᵧ²)` dentro del elemento. Las tensiones y deformaciones se exportan por elemento, no como campos nodales continuos.

## Límites actuales

- Un único dominio 2D rectangular o poligonal simple, con un material homogéneo y triángulos P1.
- Sin agujeros, múltiples subpaths, curvas SVG, CAD, booleanas, multi-dominio, axisimetría ni 3D.
- Las condiciones nombradas izquierda/derecha/superior/inferior se aplican en los extremos del bounding box; las demás aristas poligonales quedan con su condición natural.
- Los barridos de anchura y altura solo están disponibles para rectángulos; no deforman vértices poligonales.
- Sin grandes deformaciones, plasticidad, contacto, dinámica estructural, cargas de tracción no nulas ni acoplamiento multifísico.
- Sin elementos de orden superior ni adaptación automática guiada por error. El refinamiento rojo es uniforme, no adaptativo.
- El directo LDLᵀ no usa pivotaje ni reordenamiento y solo admite sistemas SPD; no es un solver general no simétrico o indefinido.
- Los estudios usan un Web Worker, sin paralelismo multinúcleo ni WASM. Editar el modelo invalida lógicamente respuestas antiguas, pero no interrumpe de inmediato el cálculo ya iniciado.

Ejecuta toda la verificación con:

```bash
npm test
npm run lint
npm run build
npm run test:ui
```
