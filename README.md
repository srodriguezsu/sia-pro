![Logo SIA UNAL Pro](https://raw.githubusercontent.com/srodriguezsu/sia-pro/refs/heads/master/public/icon.png)

# SIA UNAL Pro - Extensión de Navegador

Enlace oficial [Chrome Webstore](https://chromewebstore.google.com/detail/ebcehhmonbffeaomdbjkodgkffpfllhi?utm_source=item-share-cb)

## Objetivo del Proyecto

SIA UNAL Pro mejora la experiencia del SIA para los estudiantes de la Universidad Nacional de Colombia (UNAL): calcula el promedio de cada asignatura mientras navegas tus calificaciones, proyecta tu PAPA, reorganiza la historia académica, muestra tu avance de carrera y te ayuda a armar un horario sin cruces.

## Características Principales

### Calculadora de promedio
- Calcula la nota de cada asignatura con las calificaciones y porcentajes de sus actividades.
- Permite simular notas de actividades pendientes y fijar una **nota objetivo** para saber qué necesitas.
- Muestra el **PAPA proyectado** si terminas el semestre con esas notas.
- **Notas nuevas**: detecta las calificaciones que aparecieron o cambiaron desde tu última visita y las marca en la calculadora y en el botón flotante.

### Historia académica
- Semestres plegables con PAPA y créditos por semestre, y resumen general.
- Búsqueda y filtros por estado, tipología y **rango de nota**, con orden por nota, nombre o créditos.
- **Avisos de situación académica**: si tu PAPA (real o proyectado) se acerca o baja de 3.0, muestra una meta concreta para recuperarlo y explica la regla de reingreso (desde 2.7) según el Estatuto Estudiantil (Acuerdo 008 de 2008).

### Mi carrera
- Avance de créditos con proyección de semestres restantes.
- Créditos por tipología (fundamentación, disciplinar, libre elección, trabajo de grado, nivelación), incluyendo los planeados en el horario.

### Horario
- Agrega asignaturas desde "Asignaturas disponibles para cursar" con el botón "Agregar al Horario".
- Elige grupos, ve los prerrequisitos (cumplidos o no) y los cruces de horario en un calendario semanal por tipología.
- Guarda el calendario en PDF.
- **Generador de horarios**: crea combinaciones sin cruces según tus preferencias (horas, días libres, profesores a evitar, grupos especiales a excluir, solo grupos con cupos) y, si lo permites, deja asignaturas por fuera respetando una **carga mínima** de créditos. Los resultados se agrupan cuando dan el mismo horario, se pueden ordenar y se navegan por páginas.

### Exportar
- Descarga historia académica, calificaciones y horario en CSV (Excel o Google Sheets), con diccionario de datos.

### Carga de datos desde cada sección
- Cuando falta información, cada sección muestra un botón que abre la página correcta del SIA usando su menú: la historia académica se guarda sola, y en Mis calificaciones la extensión abre cada asignatura del periodo y guarda sus notas automáticamente.

### Datos locales y seguridad
- Los datos guardados quedan asociados a la cuenta del SIA (el usuario que el SIA muestra en la barra superior). Si inicia sesión otra cuenta en el mismo navegador, los datos de la cuenta anterior se borran de inmediato.
- Todo se guarda en el almacenamiento local de tu navegador (`localStorage`); nada se envía a servidores externos. Ver [privacy.html](privacy.html).

## Cómo Funciona

1. **Lectura automática**: la extensión detecta la página del SIA en la que estás (Mis calificaciones, Historia académica o inscripción) y lee la información visible.
2. **Datos guardados**: lo leído se guarda localmente para usarlo desde cualquier página del SIA.
3. **Planeación**: en la inscripción agrega asignaturas al horario y usa el generador para encontrar combinaciones sin cruces.
4. **Exportación**: en "Exportar" descarga tus CSV.

## Estructura del Proyecto

```
/
├── dist/                        # Código compilado listo para cargar en Chrome
├── public/
│   ├── css/                     # Estilos (tipologías, calculadora, historia, créditos, avance, horario, exportar)
│   ├── icon.png                 # Logotipo
│   └── manifest.json            # Manifiesto de la extensión (MV3)
├── src/
│   ├── content/index.js         # Script de contenido (punto de entrada)
│   ├── domain/
│   │   ├── academicStanding.js  # Umbrales del PAPA y metas de recuperación
│   │   ├── gpaCalculator.js     # Promedios y notas requeridas
│   │   ├── historiaAcademica.js # Avance y proyección de semestres
│   │   ├── historyData.js       # Historia y créditos: de la página o guardados
│   │   ├── historyManager.js    # Almacenamiento local y notas nuevas
│   │   ├── identity.js          # Cuenta dueña de los datos guardados
│   │   ├── historySummary.js    # Resumen por semestre y PAPA proyectado
│   │   ├── scheduleGenerator.js # Generador de horarios sin cruces
│   │   └── scheduleManager.js   # Asignaturas del horario y cruces
│   ├── scraper/domScraper.js    # Extracción del DOM del SIA
│   ├── ui/
│   │   ├── historia_academica/  # Historia, Mi carrera, créditos y avance
│   │   ├── exportUI.js          # Exportar CSV
│   │   ├── gpaUI.js             # Calculadora de promedio
│   │   ├── horarioUI.js         # Horario y calendario semanal
│   │   ├── newGradesBadge.js    # Contador de notas nuevas
│   │   ├── originalUiInjector.js# Botones inyectados en el SIA
│   │   ├── scheduleGeneratorUI.js # Interfaz del generador de horarios
│   │   └── standingAlert.js     # Avisos de situación académica
│   └── utils/
│       ├── selectors.js         # Selectores CSS del SIA
│       ├── gradesAutoLoader.js  # Carga automática de las notas de cada asignatura
│       ├── siaNavigation.js     # Navegación por el menú del SIA
│       └── tipologias.js        # Colores y orden de tipologías
├── privacy.html                 # Política de privacidad
├── vite.config.js
└── package.json
```

## Requisitos

- Navegador compatible con extensiones (Chrome, Brave, Edge, Opera, etc.)
- Acceso al SIA de la Universidad Nacional de Colombia (UNAL)

## Instalación

1. Clona o descarga este repositorio.
2. Instala las dependencias y compila el proyecto:
   ```bash
   npm install
   npm run build
   ```
3. Abre el gestor de extensiones de tu navegador (`chrome://extensions/`).
4. Activa el **"Modo de desarrollador"** (Developer mode) en la esquina superior derecha.
5. Haz clic en **"Cargar descomprimida"** (Load unpacked) y selecciona la carpeta `dist` generada.

### Empaquetar para producción

```bash
cd dist && zip -r ../sia-pro.zip . * && cd ..
```

## Uso

1. Inicia sesión en el portal del SIA UNAL.
2. La extensión inyectará un botón flotante (widget) en la esquina inferior derecha.
3. Haz clic en el widget para abrir el panel con pestañas:
   - **Calculadora Promedio**: notas por asignatura, simulación, nota objetivo y PAPA proyectado.
   - **Historia**: semestres, filtros y avisos de situación académica.
   - **Mi carrera**: avance de créditos, proyección y créditos por tipología.
   - **Horario**: planeador, calendario semanal y generador de horarios.
   - **Exportar**: CSV y diccionario de datos.

## Licencia

Este proyecto es de uso libre para la comunidad estudiantil de la Universidad Nacional de Colombia.



