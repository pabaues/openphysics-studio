# Comparativa funcional: OpenPhysics Studio 0.3 y COMSOL Multiphysics

Fecha de revisión: 26 de octubre de 2026.

## Alcance y lectura honesta

OpenPhysics Studio es un prototipo comunitario 2D desarrollado mediante ingeniería limpia. **No es un sustituto completo de COMSOL ni afirma paridad funcional o validación equivalente.** La tabla separa lo que está implementado y probado de lo que permanece como brecha. “Parcial” significa que existe un flujo útil pero con un alcance mucho menor; no implica compatibilidad de archivos ni equivalencia numérica certificada.

## Matriz de diferencias

| Área | COMSOL Multiphysics | OpenPhysics Studio 0.3 | Brecha pendiente |
|---|---|---|---|
| Flujo Model Builder | Geometría, selecciones, materiales, física, malla, estudios y resultados integrados | Árbol integrado con estados obsoletos, presets y validación de esquema | Selecciones generales, variables, funciones, unidades y secuencias de nodos |
| Dimensión y geometría | 1D, 2D, axisimetría y 3D; operaciones paramétricas y booleanas | Un rectángulo paramétrico 2D | Primitivas, booleanas, axisimetría, 3D y geometrías multi-dominio |
| CAD e importación | Importación, reparación y simplificación CAD/ECAD mediante productos correspondientes | Sin importación CAD | STEP, IGES, STL, ECAD, reparación y virtualización |
| Materiales | Bibliotecas, propiedades variables, anisotropía y no linealidad | Un material homogéneo isotrópico: k, ρ, Cp y εr | Biblioteca, mezclas, anisotropía y propiedades dependientes de campo |
| Transferencia de calor | Múltiples mecanismos, condiciones y acoplamientos | Conducción estacionaria y transitoria con fuente uniforme, Dirichlet y aislamiento | Convección, radiación, fase, contacto térmico y coeficientes variables |
| Electrostática | Interfaces amplias de AC/DC y acoplamientos | Potencial estacionario, carga uniforme, potencial fijo y carga nula | Dieléctricos múltiples, corrientes, magnetismo, frecuencia y terminales |
| Otras físicas | Estructural, CFD, acústica, química, electromagnetismo y más | Ninguna | Elasticidad, fluidos, ondas, reacciones y demás interfaces |
| Acoplamientos | Acoplamientos predefinidos y personalizados, fuertes y débiles | Las dos interfaces se resuelven por separado | Acoplamiento real, iteración multifísica y matrices de bloques |
| Ecuaciones personalizadas | Interfaces de ecuaciones, variables y expresiones | Núcleo escalar fijo y tipado | PDE/ODE generales, expresiones y API pública de plugins |
| Elementos y malla | Malla libre, mapeada y por capas; distintos órdenes y tipos de elemento | Triángulos P1 estructurados en rectángulo | No estructurada, cuadriláteros, orden superior, capas y curvado |
| Adaptación | Refinamiento y estrategias adaptativas según estudio/física | Secuencia manual ×2 y estudio automático de autoconvergencia | Estimadores de error y adaptación h/p orientada por solución |
| Estudios | Estacionario, transitorio, autovalores, frecuencia, barridos, optimización y más | Estacionario; transitorio térmico; barrido de seis parámetros; convergencia de malla | Autovalores, armónicos, optimización, UQ y estudios multipaso |
| Integración temporal | Métodos y control temporal según el problema | Euler implícito de primer orden, paso fijo, salida seleccionable | BDF, orden superior, paso adaptativo, eventos y parada por criterios |
| Solvers | Directos e iterativos, precondicionadores, segregados, no lineales y multigrid | CG disperso con precondicionamiento Jacobi para sistemas SPD | Directos, AMG, no lineales, bloques y control avanzado |
| HPC | Paralelismo, clúster y opciones GPU | Ejecución local en el hilo del navegador | Web Workers, WASM nativo, memoria compartida, MPI/GPU |
| Postproceso | Conjuntos de datos, cortes, gráficas, sondas, integrales y animaciones | Campo y vectores; mínimos/máximos; integral y media de dominio; sonda central; tiempo y gráfica de barrido | Cortes arbitrarios, líneas de corriente, animación exportable y operadores |
| Exportación e informes | Múltiples formatos, informes y presentaciones | JSON, CSV, VTK legacy, CSV de barridos/integrales e informe HTML | VTU/HDF5, series completas, imágenes por lotes e informes configurables |
| Aplicaciones y gestión | Application Builder, Model Manager, despliegue y colaboración | Presets y archivos locales de proyecto | Editor de apps, servidor, versiones, permisos y colaboración |
| Automatización | Métodos, API y herramientas de producto | Núcleo TypeScript sin React y scripts de validación | API estable, CLI batch, Python y servidor de estudios |
| Verificación | Amplia experiencia industrial y recursos de verificación | Pruebas analíticas acotadas, convergencia y recorridos de navegador | Manufactured solutions, benchmarks independientes, regresión numérica y certificación por dominio |

## Funciones cerradas en esta iteración

- Barridos paramétricos de geometría, conductividad, permitividad, fuente térmica y densidad de carga, con 2–12 casos validados.
- Transitorio térmico con densidad, capacidad calorífica, condición inicial, duración, pasos y cuadros de salida.
- Integración exacta del campo P1 por elemento, media ponderada por área, integral, extremos con coordenadas y sonda central.
- Selector temporal, tabla y gráfica de barrido, selección del campo de cada caso.
- Exportación de valores derivados y barridos en CSV e informe HTML local.
- Migración aditiva de proyectos v1/v2 al esquema v3 y firma de estado independiente del orden de claves.

## Límites numéricos que el usuario debe conocer

- Los modelos son 2D por unidad de profundidad, con coeficientes y fuentes uniformes.
- El transitorio usa `(M/Δt + K)Tⁿ⁺¹ = M/Δt Tⁿ + F`, matriz de masa consistente y Euler implícito de primer orden.
- La convergencia de malla compara mallas sucesivas; no mide por sí sola el error frente a una solución exacta.
- Los extremos nodales son exactos para campos P1, pero no sustituyen una evaluación de cantidades derivadas discontinuas de mayor complejidad.
- La validación automatizada no equivale a certificación para diseño industrial o seguridad.

## Prioridad recomendada

1. Elasticidad lineal 2D y benchmarks independientes.
2. Malla no estructurada e importación de geometría.
3. Web Workers/WASM y solver directo para modelos mayores.
4. Acoplamiento térmico–estructural en una dirección.
5. API pública de física y estudios, seguida de ecuaciones personalizadas.

## Fuentes oficiales consultadas

- [COMSOL Multiphysics — Model Builder](https://www.comsol.com/comsol-multiphysics/model-builder)
- [COMSOL Multiphysics — plataforma](https://www.comsol.com/comsol-multiphysics)
- [COMSOL 6.4 — Release Highlights](https://www.comsol.com/release/6.4)
- [COMSOL — Introduction training: physics, sweeps, geometry, mesh, studies, apps y Model Manager](https://www.comsol.com/events/training-course/introduction-to-comsol-multiphysics-129371)
