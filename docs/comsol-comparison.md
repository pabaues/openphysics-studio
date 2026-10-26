# Comparativa funcional: OpenPhysics Studio 0.5 y COMSOL Multiphysics

Fecha de revisión: 26 de octubre de 2026.

## Alcance y lectura honesta

OpenPhysics Studio es un prototipo comunitario 2D desarrollado mediante ingeniería limpia. **No es un sustituto completo de COMSOL ni afirma paridad funcional o validación equivalente.** La tabla separa lo que está implementado y probado de lo que permanece como brecha. “Parcial” significa que existe un flujo útil pero con un alcance mucho menor; no implica compatibilidad de archivos ni equivalencia numérica certificada.

## Matriz de diferencias

| Área | COMSOL Multiphysics | OpenPhysics Studio 0.5 | Brecha pendiente |
|---|---|---|---|
| Flujo Model Builder | Geometría, selecciones, materiales, física, malla, estudios y resultados integrados | Árbol integrado con estados obsoletos, presets y validación de esquema | Selecciones generales, variables, funciones, unidades y secuencias de nodos |
| Dimensión y geometría | 1D, 2D, axisimetría y 3D; operaciones paramétricas y booleanas | Rectángulo paramétrico o un polígono simple 2D, también cóncavo | Primitivas, agujeros, booleanas, axisimetría, 3D y geometrías multi-dominio |
| CAD e importación | Importación, reparación y simplificación CAD/ECAD mediante productos correspondientes | CSV de coordenadas y SVG polygon/polyline/path lineal; sin CAD | Curvas, STEP, IGES, STL, ECAD, reparación y virtualización |
| Materiales | Bibliotecas, propiedades variables, anisotropía y no linealidad | Un material homogéneo isotrópico: k, ρ, Cp, εr, E y ν | Biblioteca, mezclas, anisotropía y propiedades dependientes de campo |
| Transferencia de calor | Múltiples mecanismos, condiciones y acoplamientos | Conducción estacionaria y transitoria con fuente uniforme, Dirichlet y aislamiento | Convección, radiación, fase, contacto térmico y coeficientes variables |
| Electrostática | Interfaces amplias de AC/DC y acoplamientos | Potencial estacionario, carga uniforme, potencial fijo y carga nula | Dieléctricos múltiples, corrientes, magnetismo, frecuencia y terminales |
| Mecánica estructural | Sólidos, vigas, placas, no linealidad, contacto, dinámica y más | Elasticidad lineal 2D, tensión/deformación plana, fuerzas de cuerpo, apoyos y desplazamiento normal prescrito | Tracciones no nulas, grandes deformaciones, plasticidad, contacto, dinámica, elementos estructurales y 3D |
| Otras físicas | CFD, acústica, química, electromagnetismo y más | Ninguna | Fluidos, ondas, reacciones y demás interfaces |
| Acoplamientos | Acoplamientos predefinidos y personalizados, fuertes y débiles | Las tres interfaces se resuelven por separado | Acoplamiento real, iteración multifísica y matrices de bloques |
| Ecuaciones personalizadas | Interfaces de ecuaciones, variables y expresiones | Núcleos escalar y vectorial fijos y tipados | PDE/ODE generales, expresiones y API pública de plugins |
| Elementos y malla | Malla libre, mapeada y por capas; distintos órdenes y tipos de elemento | Triángulos P1 mapeados o no estructurados; refinamiento rojo anidado 1→4 | Cuadriláteros, orden superior, capas, curvado y control general de tamaño/calidad |
| Adaptación | Refinamiento y estrategias adaptativas según estudio/física | Refinamiento uniforme ×2 en h y estudio automático de autoconvergencia en ambos tipos de malla | Estimadores de error y adaptación h/p orientada por solución |
| Estudios | Estacionario, transitorio, autovalores, frecuencia, barridos, optimización y más | Estacionario; transitorio térmico; barrido de siete parámetros; convergencia de malla | Autovalores, armónicos, optimización, UQ y estudios multipaso |
| Integración temporal | Métodos y control temporal según el problema | Euler implícito de primer orden, paso fijo, salida seleccionable | BDF, orden superior, paso adaptativo, eventos y parada por criterios |
| Solvers | Directos e iterativos, precondicionadores, segregados, no lineales y multigrid | CG disperso con precondicionamiento Jacobi para sistemas SPD | Directos, AMG, no lineales, bloques y control avanzado |
| HPC | Paralelismo, clúster y opciones GPU | Ejecución local en el hilo del navegador | Web Workers, WASM nativo, memoria compartida, MPI/GPU |
| Postproceso | Conjuntos de datos, cortes, gráficas, sondas, integrales y animaciones | Campos y vectores; deformada y von Mises; integrales, sondas, tiempo y barridos | Cortes arbitrarios, líneas de corriente, animación exportable y operadores |
| Exportación e informes | Múltiples formatos, informes y presentaciones | JSON, CSV, VTK con desplazamiento/von Mises, CSV derivados e informe HTML | VTU/HDF5, series completas, imágenes por lotes e informes configurables |
| Aplicaciones y gestión | Application Builder, Model Manager, despliegue y colaboración | Presets y archivos locales de proyecto | Editor de apps, servidor, versiones, permisos y colaboración |
| Automatización | Métodos, API y herramientas de producto | Núcleo TypeScript sin React y scripts de validación | API estable, CLI batch, Python y servidor de estudios |
| Verificación | Amplia experiencia industrial y recursos de verificación | Benchmarks analíticos estructurales, pruebas escalares, convergencia y navegador | Manufactured solutions adicionales, regresión numérica amplia y certificación por dominio |

## Funciones cerradas en esta iteración

- Polígonos simples 2D, incluidos cóncavos, con validación geométrica y normalización de coordenadas.
- Importación CSV y SVG polygon/polyline/path lineal, más un preset electrostático en L.
- Triangulación Earcut y refinamiento rojo uniforme 1→4 con índices groseros preservados.
- Calor, electrostática, elasticidad, valores derivados y exportación CSV/VTK sobre mallas no estructuradas.
- Convergencia anidada en polígonos, sonda en el centroide de área y proyecto esquema v5 con migración v1–v4.
- Pruebas geométricas, de área, refinamiento, campos afines y navegador documentadas en [verificación numérica](verification.md).

## Límites numéricos que el usuario debe conocer

- Los modelos son 2D por unidad de profundidad, con coeficientes y fuentes uniformes.
- No se admiten agujeros, curvas SVG, múltiples subpaths, CAD ni operaciones booleanas.
- Las condiciones nombradas se aplican en los extremos del bounding box; las demás aristas poligonales usan su condición natural. No existe selección arbitraria de aristas.
- Los barridos de anchura/altura no escalan polígonos: están restringidos a rectángulos; los parámetros de material y física sí pueden barrerse.
- El transitorio usa `(M/Δt + K)Tⁿ⁺¹ = M/Δt Tⁿ + F`, matriz de masa consistente y Euler implícito de primer orden.
- La convergencia de malla compara mallas sucesivas; no mide por sí sola el error frente a una solución exacta. El refinamiento poligonal es uniforme, no adaptativo.
- Los extremos nodales son exactos para campos P1, pero no sustituyen una evaluación de cantidades derivadas discontinuas de mayor complejidad.
- En elasticidad, la integral derivada interpola la magnitud nodal del desplazamiento; no integra exactamente su raíz cuadrada dentro del elemento.
- La validación automatizada no equivale a certificación para diseño industrial o seguridad.

## Prioridad recomendada

1. Web Workers/WASM y solver directo para modelos mayores.
2. Acoplamiento térmico–estructural en una dirección y tracciones de contorno no nulas.
3. Selecciones arbitrarias de aristas y coeficientes espacialmente variables.
4. Adaptación guiada por error y más soluciones manufacturadas.
5. API pública de física y estudios, seguida de ecuaciones personalizadas.

## Fuentes oficiales consultadas

- [COMSOL Multiphysics — Model Builder](https://www.comsol.com/comsol-multiphysics/model-builder)
- [COMSOL Multiphysics — plataforma](https://www.comsol.com/comsol-multiphysics)
- [COMSOL 6.4 — Release Highlights](https://www.comsol.com/release/6.4)
- [COMSOL — Introduction training: physics, sweeps, geometry, mesh, studies, apps y Model Manager](https://www.comsol.com/events/training-course/introduction-to-comsol-multiphysics-129371)
