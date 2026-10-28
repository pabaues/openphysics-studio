# Comparativa funcional: OpenPhysics Studio 0.10 y COMSOL Multiphysics

Fecha de revisión: 28 de octubre de 2026.

## Alcance y lectura honesta

OpenPhysics Studio es un prototipo comunitario 2D desarrollado mediante ingeniería limpia. **No es un sustituto completo de COMSOL ni afirma paridad funcional o validación equivalente.** “Parcial” significa que existe un flujo útil pero con un alcance mucho menor; no implica compatibilidad de archivos ni equivalencia numérica certificada.

## Matriz de diferencias

| Área | COMSOL Multiphysics | OpenPhysics Studio 0.10 | Brecha pendiente |
|---|---|---|---|
| Flujo Model Builder | Geometría, selecciones, materiales, física, malla, estudios y resultados integrados | Árbol integrado, presets, estados obsoletos y validación de esquema | Variables, funciones, unidades y secuencias generales de nodos |
| Distribución de escritorio | Aplicaciones de escritorio instalables y licencias según producto | Ejecutable portable Windows x64 sin Node.js, publicado y probado por CI en cada push a `main` | Instaladores macOS/Linux, firma de código y actualizador automático |
| Dimensión y geometría | 1D, 2D, axisimetría y 3D; operaciones paramétricas y booleanas | Rectángulos, polígonos simples y hasta 16 dominios poligonales 2D conectados o disjuntos | Primitivas, agujeros, booleanas, curvas, axisimetría, 3D y particionado automático |
| CAD e importación | CAD/ECAD, reparación y simplificación según productos | CSV y SVG polygon/polyline/path lineal para un polígono | Curvas, STEP, IGES, STL, ECAD, importación multidominio y reparación |
| Materiales | Bibliotecas, anisotropía, no linealidad y propiedades variables | Un material isotrópico por dominio con gradientes espaciales lineales de k, εr y E | Biblioteca, mezclas, anisotropía y dependencia de campo |
| Transferencia de calor | Mecanismos, condiciones y acoplamientos amplios | Conducción estacionaria/transitoria multidominio, k(x,y), fuente uniforme y selecciones de aristas | Convección, radiación, fase, contacto térmico y fuentes generales |
| Electrostática | Interfaces amplias de AC/DC y acoplamientos | Potencial estacionario multidominio, εr(x,y), carga uniforme y selecciones de aristas | Corrientes, magnetismo, frecuencia y terminales |
| Fotónica integrada | Ondas electromagnéticas, óptica y acoplamientos con semiconductores según módulos | Plantillas PIN/PN editables de orden reducido para potencial y campo electrostático | Modos, índice efectivo, desfase, responsividad, deriva–difusión y acoplamiento óptico |
| Mecánica estructural | No linealidad, contacto, dinámica, vigas, placas y 3D | Elasticidad lineal 2D multidominio, tracciones P1 y desplazamiento normal | Grandes deformaciones, plasticidad, contacto, dinámica y 3D |
| Acoplamientos | Predefinidos/personalizados, fuertes y débiles | Dilatación térmica–estructural unidireccional estacionaria con propiedades por dominio | Acoplamiento fuerte, iteración multifísica y matrices de bloques |
| Otras físicas | CFD, acústica, química, electromagnetismo y más | Ecuación escalar de difusión–reacción adicional | Fluidos, ondas, reacciones y demás interfaces |
| Ecuaciones personalizadas | Variables, expresiones y ecuaciones generales | `−∇·(c∇u)+au=f` con coeficientes constantes y API tipada | Parser de expresiones, PDE/ODE generales y SDK de plugins |
| Selecciones | Dominios, aristas, puntos y selecciones derivadas | Materiales por dominio y overrides `dominio:arista` para las cuatro interfaces | Selecciones por caja/bola, grupos, puntos y operaciones lógicas |
| Elementos y malla | Tipos, órdenes, capas, curvado y controles avanzados | Triángulos P1, mallas multidominio conformes y refinamiento rojo/local con etiquetas | Cuadriláteros, orden superior, capas, curvado y métricas generales |
| Adaptación | Estrategias adaptativas según estudio/física | Recuperación de gradiente, marcado y bisección conforme para escalar estacionario | Estimadores garantizados, objetivos, h/p, elasticidad y transitorios |
| Estudios | Estacionario, transitorio, autovalores, frecuencia, optimización y más | Estacionario, transitorio térmico, barridos, convergencia y adaptación | Autovalores, armónicos, optimización, UQ y multipaso |
| Verificación | Experiencia industrial y recursos de validación | Benchmarks analíticos mono/multidominio, soluciones manufacturadas y errores exactos | Regresión amplia, más referencias y certificación por dominio |
| Integración temporal | Métodos y control según el problema | Euler implícito de primer orden y paso fijo | BDF, orden superior, paso adaptativo y eventos |
| Solvers | Directos, iterativos, segregados, no lineales y multigrid | CG–Jacobi/IC(0), LDLᵀ SPD y orden natural/RCM | Pivotaje, AMG, no lineales, bloques y sistemas generales |
| HPC | Paralelismo, clúster y GPU | Un Worker; kernel WASM de producto escalar con fallback JS | Solver WASM completo, memoria compartida, MPI/GPU y cancelación inmediata |
| Postproceso | Cortes, gráficas, sondas, integrales y animaciones | Campos/vectores, deformada, von Mises, integrales globales/por dominio y sondas | Cortes arbitrarios, líneas de corriente, animación exportable y operadores |
| Exportación e informes | Múltiples formatos e informes configurables | JSON, CSV, VTK con `domain_id` e informe HTML | VTU/HDF5, series completas e informes configurables |
| Aplicaciones y gestión | Application Builder, Model Manager y colaboración | Presets y archivos locales | Editor de apps, servidor, permisos y colaboración |
| Automatización | Métodos, API y herramientas de producto | API pública TypeScript, ES module y declaraciones | Estabilidad 1.0, CLI batch, Python y servidor de estudios |

## Prioridades cerradas en iteraciones anteriores

1. **Acoplamiento y cargas.** Tracciones consistentes no nulas y dilatación térmica–estructural unidireccional, con benchmarks analíticos.
2. **Selecciones y coeficientes.** Overrides por arista geométrica y gradientes lineales de propiedades, incluida verificación logarítmica y validación de positividad.
3. **Adaptación y verificación.** Recuperación de gradiente, marcado, bisección conforme y errores frente a soluciones manufacturadas.
4. **Kernels y solvers.** Producto escalar WASM reproducible, RCM e IC(0), contrastados con variantes de referencia.
5. **API y ecuación propia.** Entrada pública `src/lib/openphysics.ts`, build ES/declaraciones y física escalar `−∇·(c∇u)+au=f`.

## Mejora incorporada en 0.10

**Plantillas fotónicas editables y geometría nanométrica.** Se añaden secciones PIN y PN de silicio con tres dominios conformes, materiales por región, potenciales terminales, malla, convergencia, adaptación, barridos y exportación. Bounding box y área activa son editables en cualquier geometría; los helpers también están en la API pública. Las tolerancias numéricas geométricas se escalan con el modelo y la convergencia multidominio compara coordenadas anidadas. Estas plantillas resuelven únicamente electrostática reducida: no proporcionan modos ópticos, responsividad, deriva–difusión, índice efectivo ni desfase óptico. Consulta `docs/photonics.md`.

## Mejora incorporada en 0.9

**Aplicación portable de Windows y release continua.** Electron empaqueta el workbench completo para ejecutarlo localmente sin Node.js ni servidor. Cada push a `main` que supera la verificación genera y prueba el binario Windows x64, calcula su SHA-256 y reemplaza los mismos assets en la release `latest`. El paquete no está firmado y no se actualiza automáticamente; macOS y Linux siguen usando el flujo web o de desarrollo.

## Mejora incorporada en 0.8

**Geometría multidominio y materiales por dominio.** El formato v8 admite hasta 16 polígonos independientes, interfaces conformes con nodos compartidos, dominios disjuntos y condiciones identificadas por `dominio:arista`. Conductividad, densidad, capacidad calorífica, permitividad, módulo de Young, Poisson y dilatación térmica se evalúan con el material de cada elemento en estudios estacionarios, transitorios y acoplados. La adaptación conserva etiquetas, VTK exporta `domain_id` y los valores derivados incluyen integrales por dominio.

Estas mejoras no eliminan las brechas de la matriz. En particular, el WASM no es un solver completo, IC(0) no equivale a multigrid, la adaptación no es h/p y la ecuación personalizada no es un lenguaje de expresiones.

## Límites numéricos que el usuario debe conocer

- Modelos 2D por unidad de profundidad, hasta 16 dominios poligonales y un material isotrópico por dominio; elementos P1.
- Las interfaces deben compartir aristas completas coincidentes. No se admiten solapamientos, contactos parciales, uniones en T, agujeros ni particionado automático.
- Las propiedades variables son afines en x/y; las fuentes ordinarias y los coeficientes de la PDE personalizada son constantes.
- Las condiciones por arista usan índices `dominio:arista` y reglas deterministas en esquinas; no hay selecciones generales por puntos ni operaciones lógicas.
- Las soluciones manufacturadas se limitan a un dominio. La adaptación escalar no ofrece una cota de error garantizada; elasticidad y transitorios usan refinamiento uniforme.
- La convergencia entre mallas se reporta por separado del error exacto. El orden observado no se interpreta en el suelo del solver.
- LDLᵀ no usa pivotaje y solo admite SPD; CG requiere una formulación SPD y un precondicionador estable.
- La validación automatizada no equivale a certificación para diseño industrial o seguridad.

## Siguiente prioridad recomendada

La siguiente brecha geométrica es un **editor multidominio interactivo con particionado de polígonos, agujeros y operaciones booleanas**, manteniendo interfaces conformes y selecciones persistentes. Después conviene ampliar las condiciones de interfaz con resistencia de contacto y acoplamientos no conformes.

## Fuentes oficiales consultadas

- [COMSOL Multiphysics — Model Builder](https://www.comsol.com/comsol-multiphysics/model-builder)
- [COMSOL Multiphysics — plataforma](https://www.comsol.com/comsol-multiphysics)
- [COMSOL 6.4 — Release Highlights](https://www.comsol.com/release/6.4)
- [COMSOL — Introduction training](https://www.comsol.com/events/training-course/introduction-to-comsol-multiphysics-129371)
