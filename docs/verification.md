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

Se ensambla un sistema disperso simétrico definido positivo cuando las condiciones de contorno eliminan los modos de cuerpo rígido. Las condiciones esenciales se aplican por eliminación y el sistema se resuelve con gradientes conjugados precondicionados por Jacobi. El residuo relativo mostrado pertenece al sistema algebraico; no es una cota del error físico.

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

## Otros modelos y regresión

La suite también comprueba conducción estacionaria y transitoria, electrostática, integración y sondas, migraciones de proyectos, barridos, exportadores y estudios de convergencia. El script de navegador recorre presets, cambia cantidades de resultado, ejecuta estudios y verifica descargas CSV, VTK y HTML.

## Semántica de convergencia y valores derivados

La convergencia automática compara mallas sucesivas mediante una diferencia L2 relativa; no sustituye al error frente a una solución exacta. El orden observado solo se calcula cuando hay tres niveles y las diferencias están por encima del suelo del solver.

Para calor y potencial eléctrico, la integración P1 por elemento es exacta. Para elasticidad se interpola la magnitud nodal del desplazamiento como un campo P1: su integral no es la integral exacta de `√(uₓ² + uᵧ²)` dentro del elemento. Las tensiones y deformaciones se exportan por elemento, no como campos nodales continuos.

## Límites actuales

- Un rectángulo 2D, un material homogéneo y malla estructurada de triángulos P1.
- Sin grandes deformaciones, plasticidad, contacto, dinámica estructural, cargas de tracción no nulas ni acoplamiento multifísico.
- Sin axisimetría, 3D, elementos de orden superior ni adaptación automática.
- La ejecución interactiva se realiza en el hilo principal del navegador.

Ejecuta toda la verificación con:

```bash
npm test
npm run lint
npm run build
npm run test:ui
```
