# Plantillas editables de fotónica integrada

OpenPhysics Studio incluye dos ejemplos en **Example models → Integrated photonics · reduced-order electrostatics**:

- **Si PIN photodetector**: sección transversal PIN de silicio con polarización inversa.
- **High-density Si PN modulator**: sección transversal PN compacta con polarización directa parametrizable.

Son plantillas electrostáticas multidominio de orden reducido. Resuelven potencial y campo eléctrico en la sección 2D; **no son un simulador óptico ni de transporte semiconductor**. Las etiquetas p/i/n describen regiones geométricas y no añaden por sí mismas un modelo de dopado.

## Dimensiones y condiciones iniciales

Todas las dimensiones se almacenan en metros. Los tres dominios comparten aristas completas y nodos de interfaz.

| Plantilla | Dominio p | Dominio central | Dominio n | Altura | Potencial izquierdo | Potencial derecho |
|---|---:|---:|---:|---:|---:|---:|
| PIN | 250 nm | 1500 nm, región intrínseca | 250 nm | 220 nm | −2 V | 0 V |
| PN | 500 nm | 400 nm, núcleo PN | 500 nm | 220 nm | 0 V | 2 V |

La anchura global inicial es 2 µm para PIN y 1,4 µm para PN. Los bordes superior e inferior usan carga normal nula. La carga espacial inicial es cero y los tres dominios tienen silicio isotrópico con `εr = 11,7`; también se proporcionan propiedades térmicas y elásticas iniciales de silicio para poder cambiar de interfaz física.

La ecuación resuelta es:

```text
∇ · (−ε∇V) = ρ,    E = −∇V
```

Los resultados disponibles son potencial nodal, campo eléctrico por elemento, integrales y valores por dominio. El barrido inicial del PIN modifica el potencial izquierdo con `−0,5, −1, −2, −4 V`; el del PN modifica el derecho con `0, 1, 2, 4 V`.

## Qué se puede editar

1. **Geometría:** selecciona cualquiera de los tres dominios, cambia su nombre, la anchura/altura del *Global bounding box* o el *Active domain area*. Las ediciones de bounding box escalan todos los dominios en X/Y. Las de área aplican una escala uniforme a todo el modelo para conservar las interfaces conformes.
2. **Materiales:** asigna permitividad, conductividad y demás propiedades isotrópicas por dominio, incluidos sus gradientes espaciales lineales.
3. **Electrostática:** modifica carga espacial, potenciales terminales y condiciones de aristas concretas.
4. **Malla:** cambia el refinamiento poligonal. Las plantillas parten de R2.
5. **Estudios:** ejecuta convergencia de malla, adaptación escalar o barridos de geometría, permitividad, carga y cualquiera de los dos potenciales. Los estudios no alteran la malla base guardada.
6. **Resultados:** inspecciona potencial/campo, selecciona casos de barrido y exporta CSV, VTK, valores derivados, informe HTML o el modelo JSON editable.

El flujo completo permanece disponible después de cada cambio: una edición marca el resultado como obsoleto y **Compute** vuelve a resolver el modelo actualizado.

## Uso desde la API

```ts
import {
  createExampleModel,
  scaleGeometryToBoundingBox,
  scaleGeometryToDomainArea,
  solveModel,
  runConvergenceStudy,
  runParametricSweep,
} from 'openphysics-studio'

const model = createExampleModel('pinPhotodetector')
model.geometry = scaleGeometryToBoundingBox(model.geometry, 4e-6, 440e-9)
model.geometry = scaleGeometryToDomainArea(model.geometry, 1, 1.32e-12)
model.domainMaterials['domain-pin-core']!.relativePermittivity = 12

const result = solveModel(model)
const convergence = runConvergenceStudy(model)
const sweep = runParametricSweep(model)
```

`createExampleModel('pnModulator')` construye la segunda plantilla. Ambos identificadores y los helpers de escalado forman parte de la API pública TypeScript.

## Límites físicos explícitos

Estas plantillas **no calculan**:

- modos ópticos, propagación, índice efectivo ni desfase óptico;
- generación fotoeléctrica, responsividad, corriente oscura ni eficiencia cuántica;
- deriva–difusión, recombinación, concentración de portadores, dopado o capacidad de unión;
- dispersión de plasma libre, índice dependiente de portadores ni espectros;
- acoplamiento electromagnético–semiconductor o diseño completo de un detector/modulador.

Para esos estudios hacen falta interfaces físicas adicionales y su propia verificación. Los resultados eléctricos de estas plantillas sirven como ejemplos parametrizables del flujo FEM existente y como punto de partida para futuros acoplamientos, no como predicciones ópticas o eléctricas completas de un dispositivo.
