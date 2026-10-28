# Verificación numérica

OpenPhysics Studio es un prototipo de investigación y enseñanza. Estas pruebas verifican casos concretos; no constituyen certificación industrial ni demuestran paridad con COMSOL.

## Elasticidad, tracción y acoplamiento térmico

El núcleo resuelve elasticidad isotrópica de pequeñas deformaciones con triángulos P1 y dos grados de libertad por nodo. Las condiciones esenciales se imponen por eliminación; las tracciones se integran como cargas consistentes de arista P1. La dilatación térmica opcional evalúa una temperatura media por elemento y aplica `εth = α(T − Tref)` de forma unidireccional y estacionaria.

`src/lib/fem/elasticity.benchmark.test.ts` comprueba cuatro casos independientes:

1. **Tracción uniaxial en tensión plana.** Se verifican `uₓ = ε₀x`, `uᵧ = −νε₀y`, `σxx = Eε₀` y tensiones fuera de plano/corte según la formulación.
2. **Solución uniaxial en deformación plana.** Incluye `σzz = νσxx` en von Mises.
3. **Traslación de cuerpo rígido.** Exige deformaciones prácticamente nulas.
4. **Refinamiento sucesivo.** El campo afín pertenece al espacio P1 y debe alcanzar el suelo del solver.

`src/lib/fem/coupling.test.ts` añade:

- **Tracción de contorno no nula.** Una carga `tx = 1 MPa` reproduce el campo uniaxial analítico, sin imponer el desplazamiento derecho. Se comprueban desplazamientos nodales y tensiones.
- **Dilatación térmica libre.** Una placa uniforme a `100 °C`, referencia `20 °C` y `α = 12×10⁻⁶ K⁻¹` reproduce `u = αΔT(x,y)` y tensión prácticamente nula. Se usa LDLᵀ para que el umbral de tensión no quede dominado por el residual iterativo amplificado por `E`.

## Coeficientes espaciales y selecciones

`src/lib/fem/spatial.test.ts` verifica:

- Convergencia a `T = log(1 + 2x)/2` con `k = 1 + 2x`, fuente nula y bordes superior/inferior aislados. Los errores máximos deben caer por debajo de un factor `0,35` al duplicar las divisiones.
- Una condición de `77 °C` sobre una arista vertical interior de un polígono en L, incluidas las esquinas compartidas.
- Rechazo durante validación de cualquier coeficiente lineal que deje de ser positivo en un vértice.

Las propiedades disponibles son gradientes lineales de conductividad, permitividad relativa y módulo de Young. No hay dependencia de campo, anisotropía ni expresiones generales.

## Soluciones manufacturadas y convergencia

`src/lib/fem/advanced.test.ts` usa la solución

```text
u = sin(πx/Lx) sin(πy/Ly)
```

para `−∇·(c∇u) + au = f`, con contorno Dirichlet nulo y fuente fabricada `f = c(π²/Lx² + π²/Ly²)u + au`. En tres mallas sucesivas, el error RMS nodal debe disminuir por debajo de un factor `0,35` por nivel, coherente con convergencia de segundo orden lejos del suelo del solver.

Los informes separan:

- `relativeL2`: diferencia normalizada entre soluciones de mallas sucesivas.
- `exactL2`: RMS del error nodal frente a la referencia seleccionada.
- `exactMaximum`: máximo error absoluto nodal.
- `observedOrder`: estimación a partir de diferencias entre mallas, solo por encima de `10 × tolerancia del solver`.

Ninguna diferencia entre mallas se presenta como error exacto cuando no hay referencia manufacturada.

## Adaptación guiada por error

El estimador recupera un gradiente nodal mediante promedio por área y asigna a cada triángulo un indicador basado en la diferencia entre gradiente elemental y gradientes recuperados. Se marca la fracción seleccionada de indicadores mayores.

La bisección de arista larga comparte los puntos medios y propaga el refinamiento a triángulos vecinos hasta cerrar la conformidad. Las pruebas comprueban:

- Conservación de índices y coordenadas de nodos groseros.
- Aristas con una o dos incidencias, sin nodos colgantes, y conservación del número de aristas externas en el caso de referencia.
- Indicador nulo para un campo afín.
- Disminución del error exacto y aumento de nodos en un estudio adaptativo sinusoidal.

El indicador guía el refinamiento, pero no es una cota garantizada del error. La adaptación local se limita a física escalar estacionaria.

## Solvers y WASM

Las pruebas de `solver.test.ts`, `direct.integration.test.ts` y `advanced.test.ts` comprueban:

- Sistemas SPD, relleno de factorización y rechazo de matrices no SPD.
- Equivalencia de campos entre CG y LDLᵀ en calor, electrostática, elasticidad y transitorios breves.
- Consistencia de soluciones con orden natural/RCM y precondicionado Jacobi/IC(0).
- Reconstrucción algebraica del sistema tridiagonal mediante la factorización IC(0).
- Equivalencia del producto escalar WASM frente a JavaScript en vectores de 128 componentes.

El módulo WASM se genera de forma reproducible desde `dot.wat`, se instancia síncronamente y tiene fallback JavaScript. Solo acelera potencialmente un kernel; no se afirma una mejora global sin medición específica.

## Geometría multidominio y materiales

`src/lib/fem/multidomain.test.ts` verifica dos cuadrados de área unidad que comparten una arista completa, con nodos coincidentes en la interfaz y 32 triángulos etiquetados por dominio:

- **Resistencias térmica y eléctrica en serie.** Con conductividades/permitividades `1` y `2`, potencial o temperatura `0` y `30` en los extremos, se reproduce `u = 20x` en el primer dominio y `u = 10 + 10x` en el segundo. También se comprueba flujo constante, continuidad nodal, integrales y medias por dominio y la salida VTK `domain_id`.
- **Dilatación térmica por material.** Con `α₁ = 10⁻⁵ K⁻¹`, `α₂ = 2×10⁻⁵ K⁻¹` y `ΔT = 80 K`, el desplazamiento longitudinal reproduce la integral piecewise de `αΔT`. Los apoyos superior e inferior impiden la expansión transversal, por lo que se verifica por separado la tensión `σyy = −EαΔT` y la ausencia de `σxx` y cortante para `ν = 0`.
- **Validación geométrica.** Se rechazan solapamientos, contactos parciales de arista y uniones en T; se permiten regiones disjuntas y contactos por vértices.
- **Adaptación y persistencia.** La bisección local conserva etiquetas y áreas por dominio. El esquema v8 conserva asignaciones y materiales, y exige material para cada dominio.

## Plantillas fotónicas nanométricas

`src/lib/fem/presets.test.ts` verifica las secciones PIN y PN de silicio mediante ocho casos:

- Validación del esquema v8, tres dominios conformes y materiales asignados.
- Solución electrostática analítica afín: `V = Vₗ + (Vᵣ−Vₗ)x/L` y `Eₓ = −(Vᵣ−Vₗ)/L`, con comprobación nodal y elemental.
- Escalado independiente del bounding box y escalado uniforme desde el área activa, conservando identificadores, interfaces y materiales.
- Barridos de potencial sin mutación del modelo base y secuencias de convergencia R0→R1→R2. Como el campo afín ya pertenece a P1, se comprueba el suelo numérico y no se exige una reducción artificial del error.

Las tolerancias geométricas, de triangulación, unión de nodos y detección de frontera son relativas al tamaño del modelo para admitir dimensiones nanométricas. La comparación de mallas no estructuradas usa coordenadas físicas anidadas: los índices globales multidominio pueden cambiar al insertar nodos por dominio y no son una correspondencia válida por sí solos. Estas pruebas verifican electrostática, no propagación óptica ni transporte de portadores.

## Geometría, persistencia y navegador

La suite también comprueba importación/normalización SVG/CSV, rechazo de auto-intersecciones, refinamiento rojo, campos afines en mallas no estructuradas, integración P1, sondas, barridos y exportadores. `project.test.ts` recorre migraciones aditivas v1→v8, incluida v7→v8, firmas estables y validación geométrica.

El ensayo de navegador cubre Worker, invalidación de respuestas obsoletas, ambos solvers, IC(0), RCM/natural, ecuación personalizada, error exacto, adaptación, transitorios, polígonos, geometría multidominio conectada y disjunta, edición de materiales por dominio, elasticidad, barridos y descargas. También verifica las pestañas de flujo de trabajo, plegado y expansión del árbol, selección de dominios desde el SVG, apertura de fronteras desde Graphics y los controles reales de zoom/ajuste. En PIN y PN edita nombre de dominio, bounding box, área activa, permitividad y potencial; después recalcula, ejecuta convergencia y realiza un barrido de polarización. Las capturas se guardan fuera del repositorio y el servidor temporal se detiene.

## Aplicación de escritorio y release

`desktop/main.cjs` carga exclusivamente los archivos locales compilados, con Node Integration desactivado, aislamiento de contexto y sandbox. `scripts/validate-desktop.mjs` abre la aplicación mediante Electron, comprueba versión y modo empaquetado, ejecuta cálculos en el Worker, carga el preset multidominio y edita/recalcula la plantilla PIN. La prueba se ejecuta también contra el binario empaquetado antes de publicar cada release.

El workflow de GitHub Actions separa la verificación y el empaquetado Windows. Solo un push a `main` cuya verificación haya pasado puede actualizar la release continua `latest`; los pull requests no la modifican. La concurrencia cancela builds obsoletos de una misma rama para evitar que un push anterior sobrescriba otro más reciente. El nombre estable `OpenPhysics-Studio-Windows-x64.exe` permite reemplazar siempre el mismo asset, junto con su checksum SHA-256, sin acumular ejecutables antiguos en la release continua.

El paquete comunitario no está firmado digitalmente y no contiene actualizador automático. La release continua distribuye la última compilación, pero el usuario debe descargarla de nuevo para actualizar su copia.

## Límites actuales

- Hasta 16 dominios poligonales 2D, cada uno con un material isotrópico, y triángulos P1. Las interfaces deben compartir aristas completas coincidentes; no hay particionado automático de geometrías.
- Sin CAD, agujeros, curvas, axisimetría, 3D, elementos de orden superior ni h/p adaptativo.
- Acoplamiento térmico–estructural solo unidireccional y estacionario.
- Ecuación personalizada de coeficientes constantes; sin parser de expresiones ni plugins. Las referencias manufacturadas se limitan a un dominio.
- Sin no linealidad, contacto, dinámica estructural, autovalores, frecuencia, CFD o sistemas algebraicos generales.
- Un Web Worker secuencial; sin paralelismo multinúcleo ni cancelación inmediata.

Ejecuta toda la verificación con:

```bash
npm test
npm run lint
npm run build
npm run build:lib
npm run test:ui
npm run desktop       # En Windows; abre la aplicación de escritorio
npm run test:desktop  # En Windows; valida ese arranque y un cálculo
```
