<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { DxfParser } from 'dxf-parser'

// State Orchestration
const mapCenter = ref<[number, number]>([19.4326, -99.1332]) // Mexico City
const activeTileStyle = ref('satellite')
const searchQuery = ref('Ciudad de México')
const isSearching = ref(false)

// Weather & Simulation
const rainfall = ref(35)
const temperature = ref(24)
const soilType = ref({ name: 'Limoso (Medio)', code: 'LOAM', factor: 0.6 })
const isDarkMode = ref(true)
const simulationRunning = ref(false)
let simulationInterval: any = null

// Atmospheric Cloud & Wind Simulation
const cloudsVisible = ref(true)
const cloudCoverage = ref(55)
const windSpeed = ref(30)
const windDirection = ref(225)

const soilOptions = ref([
  { name: 'Arenoso (Alta absorción)', code: 'SAND', factor: 0.3 },
  { name: 'Limoso (Medio)', code: 'LOAM', factor: 0.6 },
  { name: 'Arcilloso (Baja absorción)', code: 'CLAY', factor: 0.8 },
  { name: 'Rocoso (Nula absorción)', code: 'ROCK', factor: 1.0 }
])

// API & Calculations
const weatherInfo = ref<{ temp: number; wind: string; desc: string } | null>(null)
const currentElevation = ref<number | null>(null)
const currentSlope = ref<number | null>(null)
const loadingElevation = ref(false)
const lastClickedCoords = ref<[number, number] | null>(null)
const aqiValue = ref(42)

const loadedDxfEntitiesCount = ref(0)
const hasCadOverlay = ref(false)
const cadData = ref<any[]>([])

const topoMapRef = ref<any>(null)
const toast = useToast()

// Topo-Agent Integration State
const loadingAgent = ref(false)
const agentResponse = ref<any | null>(null)
const drawnZoneMetrics = ref<any | null>(null)
const activeMainTab = ref<'terreno' | 'agente'>('terreno')

const aqiStatus = computed(() => {
  if (aqiValue.value <= 50) return { label: 'Excelente', color: '#10b981', class: 'aqi-good' }
  if (aqiValue.value <= 100) return { label: 'Moderado', color: '#eab308', class: 'aqi-moderate' }
  return { label: 'Riesgoso', color: '#ef4444', class: 'aqi-bad' }
})

onMounted(() => {
  fetchWeather(mapCenter.value[0], mapCenter.value[1])
  fetchAQI(mapCenter.value[0], mapCenter.value[1])
})

// Geocoding Búsqueda (Nominatim)
const searchLocation = async () => {
  if (!searchQuery.value.trim()) return
  isSearching.value = true

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchQuery.value)}`)
    const data = await res.json()
    if (data && data[0]) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      mapCenter.value = [lat, lng]

      if (topoMapRef.value) {
        topoMapRef.value.flyTo(mapCenter.value, 14)
      }

      fetchWeather(lat, lng)
      fetchAQI(lat, lng)

      toast.add({
        severity: 'success',
        summary: 'Ubicación Encontrada',
        detail: data[0].display_name,
        life: 3000
      })
    } else {
      toast.add({
        severity: 'warn',
        summary: 'Sin Resultados',
        detail: 'No se encontró la ubicación.',
        life: 3000
      })
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Error al conectar con el servidor de mapas.',
      life: 3000
    })
  } finally {
    isSearching.value = false
  }
}

// Fetch Weather (Open-Meteo)
const fetchWeather = async (lat: number, lng: number) => {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
    const data = await res.json()
    if (data.current_weather) {
      weatherInfo.value = {
        temp: Math.round(data.current_weather.temperature),
        wind: `${data.current_weather.windspeed} km/h`,
        desc: data.current_weather.weathercode === 0 ? 'Despejado' : 'Nublado / Lluvia'
      }
      temperature.value = Math.round(data.current_weather.temperature)
    }
  } catch (err) {
    weatherInfo.value = {
      temp: 22,
      wind: '10 km/h',
      desc: 'Despejado'
    }
  }
}

// Fetch AQI
const fetchAQI = (lat: number, lng: number) => {
  const noise = Math.sin(lat * 100) * Math.cos(lng * 100)
  aqiValue.value = Math.max(10, Math.min(Math.round(50 + noise * 40 + Math.random() * 8), 180))
}

// Elevation helper
const calculateMockElevation = (lat: number, lng: number) => {
  const base = 2240
  const x = lat * 350
  const y = lng * 350
  return Math.round(base + Math.sin(x) * 150 + Math.cos(y) * 90)
}

const handleMapClick = async (lat: number, lng: number) => {
  lastClickedCoords.value = [lat, lng]
  loadingElevation.value = true
  currentElevation.value = null
  currentSlope.value = null
  agentResponse.value = null
  drawnZoneMetrics.value = null
  activeMainTab.value = 'terreno'

  try {
    const res = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${lat},${lng}`)
    const data = await res.json()
    if (data.results && data.results[0] && data.results[0].elevation !== null) {
      currentElevation.value = Math.round(data.results[0].elevation)
    } else {
      currentElevation.value = calculateMockElevation(lat, lng)
    }
  } catch (err) {
    currentElevation.value = calculateMockElevation(lat, lng)
  } finally {
    loadingElevation.value = false
  }

  // Slope calculation
  const offset = 0.0006
  const h1 = calculateMockElevation(lat + offset, lng)
  const h2 = calculateMockElevation(lat - offset, lng)
  const distance = 133
  const diff = Math.abs(h1 - h2)
  currentSlope.value = Math.min(Math.round((diff / distance) * 100), 48)

  fetchAQI(lat, lng)

  // Auto-switch to Agent tab and trigger analysis automatically
  activeMainTab.value = 'agente'
  runAgentAnalysis()
}

const handleDrawnPolygon = (metrics: any) => {
  drawnZoneMetrics.value = metrics
  activeMainTab.value = 'agente' // Auto-switch to Agent tab on polygon draw
  toast.add({
    severity: 'info',
    summary: 'Zona Mapeada',
    detail: `Área: ${Math.round(metrics.area).toLocaleString()} m² | Altitud Media: ${metrics.avgElevation || '---'}m. ¡Generando análisis automático!`,
    life: 4000
  })
  
  // Trigger agent analysis automatically
  runAgentAnalysis()
}

const runAgentAnalysis = async () => {
  if (!lastClickedCoords.value && !drawnZoneMetrics.value) return
  loadingAgent.value = true
  agentResponse.value = null

  const hasPolygon = drawnZoneMetrics.value !== null
  const coordsStr = hasPolygon
    ? "Polígono de área seleccionada y medida"
    : (lastClickedCoords.value ? `${lastClickedCoords.value[0].toFixed(5)}° N, ${lastClickedCoords.value[1].toFixed(5)}° W` : "Ubicación genérica")
    
  const descStr = hasPolygon
    ? `Terreno medido de área ${Math.round(drawnZoneMetrics.value.area).toLocaleString()} m² con perímetro de ${Math.round(drawnZoneMetrics.value.perimeter).toLocaleString()} metros. Su altitud promedio es de ${drawnZoneMetrics.value.avgElevation} metros (Rango: ${drawnZoneMetrics.value.minElevation}m - ${drawnZoneMetrics.value.maxElevation}m). Tiene una pendiente máxima registrada del ${drawnZoneMetrics.value.maxSlope}% y pendiente promedio del ${drawnZoneMetrics.value.avgSlope}%. Suelo clasificado como: ${soilType.value.name}, temperatura: ${temperature.value}°C.`
    : `Altitud real de ${currentElevation.value || 'desconocida'} metros, pendiente aproximada de ${currentSlope.value || 0}%, temperatura de suelo ${temperature.value}°C con tipo de suelo ${soilType.value.name}.`

  // Format AutoCAD DXF/planos_2d details to include specific columns coordinates and counts
  let planosDescription = 'No se ha proporcionado plano de AutoCAD (es opcional). Por lo tanto, realiza la estimación estructural y cálculos de cimentación (capacidad de carga Terzaghi, estabilidad de taludes FS) para una residencia estándar unifamiliar típica de 2 niveles (~150 m²) construida sobre este terreno.'
  if (hasPolygon) {
    planosDescription = `No se ha proporcionado plano de AutoCAD (es opcional). Realizar la estimación y cálculos estructurales (capacidad de carga Terzaghi, estabilidad de taludes FS) para una residencia estándar unifamiliar típica de 2 niveles (~150 m²) adaptada a este terreno de ${Math.round(drawnZoneMetrics.value.area).toLocaleString()} m².`
  }
  if (hasCadOverlay.value && cadData.value) {
    const linesCount = cadData.value.filter(e => e.type === 'line').length
    const polylinesCount = cadData.value.filter(e => e.type === 'polyline').length
    const circlesCount = cadData.value.filter(e => e.type === 'circle').length
    
    planosDescription = `Planos de cimentación AutoCAD cargados con ${cadData.value.length} elementos vectoriales. Contiene: ${linesCount} líneas estructurales de muros, ${polylinesCount} polígonos de delimitación y curvas de nivel, y ${circlesCount} círculos de cimentación/columnas de carga.`
    
    const columnCoords = cadData.value
      .filter(e => e.type === 'circle')
      .map((c, i) => `Columna C-${i+1} en coord: [${c.coords[0].toFixed(5)}, ${c.coords[1].toFixed(5)}]`)
      .join(', ')
    if (columnCoords) {
      planosDescription += ` Las coordenadas de las columnas de soporte son: ${columnCoords}.`
    }
    planosDescription += ' Utiliza estos planos de AutoCAD como referencia directa para evaluar detalladamente si es viable construir la cimentación indicada (con sus respectivas columnas y linderos) en este terreno y sus pendientes específicas.'
  }

  try {
    const response = await $fetch<any>('https://mr3miliano.app.n8n.cloud/webhook/topo-agent', {
      method: 'POST',
      headers: {
        'X-API-KEY': 'topo-secret-api-key-2026-vbc',
        'Content-Type': 'application/json'
      },
      body: {
        sessionId: `session-${Date.now()}`,
        coordenadas: coordsStr,
        descripcion_terreno: descStr,
        planos_2d: planosDescription
      }
    })

    if (response && response.success && response.agent_response) {
      agentResponse.value = response.agent_response
      toast.add({
        severity: 'success',
        summary: 'Análisis IA Completo',
        detail: 'Topo-Agent generó las recomendaciones del terreno con éxito.',
        life: 3000
      })
    } else {
      throw new Error('Formato de respuesta inválido')
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Error del Agente',
      detail: 'No se pudo obtener el análisis. Revisa la conexión con n8n.',
      life: 4000
    })
  } finally {
    loadingAgent.value = false
  }
}

// Dynamic simulation triggers
const toggleSimulation = () => {
  if (simulationRunning.value) {
    clearInterval(simulationInterval)
    simulationRunning.value = false
    toast.add({
      severity: 'info',
      summary: 'Simulación Pausada',
      detail: 'Se detuvo el flujo dinámico de agua.',
      life: 2000
    })
  } else {
    simulationRunning.value = true
    toast.add({
      severity: 'success',
      summary: 'Simulación Activa',
      detail: 'Simulando acumulación de agua progresiva...',
      life: 2500
    })

    simulationInterval = setInterval(() => {
      if (rainfall.value < 100) rainfall.value += 2
      if (temperature.value > 15) temperature.value -= 0.5
      
      // Wind and cloud fluctuations
      if (cloudsVisible.value) {
        windSpeed.value = Math.max(10, Math.min(120, windSpeed.value + Math.round((Math.random() - 0.5) * 6)))
        windDirection.value = (windDirection.value + Math.round((Math.random() - 0.5) * 12) + 360) % 360
        cloudCoverage.value = Math.max(30, Math.min(100, cloudCoverage.value + Math.round((Math.random() - 0.5) * 8)))
      }
    }, 1500)
  }
}

// Mock CAD blueprints
const loadMockCadBlueprint = () => {
  const center = mapCenter.value
  hasCadOverlay.value = true
  loadedDxfEntitiesCount.value = 0

  const scale = 0.0006
  const data: any[] = []

  // CAD structure boundary
  data.push({
    type: 'polyline',
    coords: [
      [center[0] - scale, center[1] - scale * 1.5],
      [center[0] - scale, center[1] + scale * 1.5],
      [center[0] + scale, center[1] + scale * 1.5],
      [center[0] + scale, center[1] - scale * 1.5],
      [center[0] - scale, center[1] - scale * 1.5]
    ],
    color: '#38bdf8',
    weight: 3
  })

  // Dividers
  data.push({
    type: 'line',
    coords: [[center[0] - scale, center[1]], [center[0] + scale, center[1]]],
    color: '#0ea5e9',
    weight: 1.5
  })
  data.push({
    type: 'line',
    coords: [[center[0], center[1] - scale * 1.5], [center[0], center[1] + scale * 1.5]],
    color: '#0ea5e9',
    weight: 1.5
  })

  // Columns/Pillars
  const pillars = [
    [center[0] - scale, center[1] - scale * 1.5],
    [center[0] - scale, center[1] + scale * 1.5],
    [center[0] + scale, center[1] - scale * 1.5],
    [center[0] + scale, center[1] + scale * 1.5],
    [center[0], center[1]]
  ]
  pillars.forEach((p, idx) => {
    data.push({
      type: 'circle',
      coords: p,
      radius: 12,
      color: '#f43f5e',
      fillColor: '#ef4444',
      tooltip: `Columna CAD C-${idx + 1}`
    })
  })

  // Contour curves
  for (let r = 1; r <= 4; r++) {
    const radDist = r * 0.0005
    const contourPoints: any[] = []
    
    for (let angle = 0; angle <= 360; angle += 15) {
      const radians = (angle * Math.PI) / 180
      const noise = 1 + Math.sin(radians * 3) * 0.15 + Math.cos(radians * 5) * 0.08
      const cLat = center[0] + radDist * Math.sin(radians) * noise
      const cLng = center[1] + radDist * Math.cos(radians) * noise * 1.3
      contourPoints.push([cLat, cLng])
    }
    contourPoints.push(contourPoints[0])

    data.push({
      type: 'polyline',
      coords: contourPoints,
      color: '#c084fc',
      weight: 1.5,
      tooltip: `Cota CAD: ${2240 + r * 15}m`
    })
  }

  cadData.value = data

  if (topoMapRef.value) {
    topoMapRef.value.flyTo(center, 16)
  }

  toast.add({
    severity: 'success',
    summary: 'Planos CAD Mock',
    detail: 'Estructuras de cimentación y cotas de terreno cargadas con éxito.',
    life: 3000
  })
}

// Parse real DXF file contents
const handleDxfTextParsed = (dxfText: string) => {
  try {
    const parser = new DxfParser()
    const dxf = parser.parseSync(dxfText)

    if (!dxf || !dxf.entities) {
      throw new Error('Formato DXF no compatible.')
    }

    const center = mapCenter.value
    const scaling = 0.000008
    const data: any[] = []
    let count = 0

    dxf.entities.forEach((entity: any) => {
      if (entity.type === 'LINE' && entity.vertices && entity.vertices.length >= 2) {
        data.push({
          type: 'line',
          coords: [
            [center[0] + entity.vertices[0].y * scaling, center[1] + entity.vertices[0].x * scaling],
            [center[0] + entity.vertices[1].y * scaling, center[1] + entity.vertices[1].x * scaling]
          ],
          color: '#38bdf8',
          weight: 2
        })
        count++
      } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices && entity.vertices.length > 1) {
        const coords = entity.vertices.map((v: any) => [
          center[0] + v.y * scaling,
          center[1] + v.x * scaling
        ])
        data.push({
          type: 'polyline',
          coords,
          color: '#c084fc',
          weight: 2
        })
        count++
      } else if (entity.type === 'CIRCLE') {
        data.push({
          type: 'circle',
          coords: [center[0] + entity.center.y * scaling, center[1] + entity.center.x * scaling],
          radius: entity.radius * 0.8,
          color: '#f43f5e',
          fillColor: '#ef4444'
        })
        count++
      }
    })

    cadData.value = data
    loadedDxfEntitiesCount.value = count
    hasCadOverlay.value = true

    if (topoMapRef.value) {
      topoMapRef.value.flyTo(center, 17)
    }

    toast.add({
      severity: 'success',
      summary: 'Archivo DXF Parseado',
      detail: `Se cargaron ${count} vectores del archivo CAD directamente.`,
      life: 4000
    })

  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Error al Leer DXF',
      detail: 'El archivo contiene errores. Cargando simulación mock...',
      life: 4000
    })
    loadMockCadBlueprint()
  }
}

const clearCadOverlay = () => {
  cadData.value = []
  hasCadOverlay.value = false
  loadedDxfEntitiesCount.value = 0
  toast.add({
    severity: 'info',
    summary: 'Planos CAD Limpios',
    detail: 'Se quitaron todas las sobrecapas vectoriales.',
    life: 2000
  })
}

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark-mode')
  } else {
    document.documentElement.classList.remove('dark-mode')
  }
}
</script>

<template>
  <div class="topo-app">
    <Toast />

    <!-- Navbar Header -->
    <header class="topo-header glass-panel">
      <div class="header-left">
        <i class="pi pi-globe logo-icon"></i>
        <div class="logo-group">
          <h1>Vertex Horizon</h1>
          <span class="sub">Visor Topográfico 2D & Simulador</span>
        </div>
      </div>

      <!-- Search Box (Nominatim) -->
      <div class="header-search">
        <div class="search-input-wrapper">
          <i class="pi pi-search search-icon"></i>
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="Buscar ciudad o terreno..." 
            @keyup.enter="searchLocation"
          />
        </div>
        <Button 
          label="Buscar" 
          :loading="isSearching" 
          @click="searchLocation" 
          class="search-btn"
        />
      </div>

      <div class="header-right">
        <!-- Weather widget (Open-Meteo) -->
        <div class="weather-widget" v-if="weatherInfo">
          <i class="pi pi-cloud weather-icon"></i>
          <div class="weather-details">
            <span class="temp">{{ weatherInfo.temp }}°C</span>
            <span class="desc">{{ weatherInfo.desc }} | Viento: {{ weatherInfo.wind }}</span>
          </div>
        </div>

        <button class="theme-toggle" @click="toggleDarkMode">
          <i :class="isDarkMode ? 'pi pi-sun' : 'pi pi-moon'"></i>
        </button>
      </div>
    </header>

    <!-- Main Container -->
    <div class="main-layout">
      
      <!-- Leaflet Map Container -->
      <div class="map-container">
        <TopoMap 
          ref="topoMapRef"
          :center="mapCenter"
          :tileStyle="activeTileStyle"
          :rainfall="rainfall"
          :temperature="temperature"
          :soilFactor="soilType.factor"
          :cadVisible="hasCadOverlay"
          :cadData="cadData"
          :cloudsVisible="cloudsVisible"
          :cloudCoverage="cloudCoverage"
          :windSpeed="windSpeed"
          :windDirection="windDirection"
          :activeElevation="currentElevation !== null ? currentElevation : (drawnZoneMetrics ? drawnZoneMetrics.avgElevation : null)"
          @mapClick="handleMapClick"
          @drawnPolygon="handleDrawnPolygon"
        />
        
        <!-- Tile Switcher controls -->
        <div class="map-style-floating glass-panel">
          <button 
            :class="{ active: activeTileStyle === 'satellite' }" 
            @click="activeTileStyle = 'satellite'"
            title="Satelital"
          >
            <i class="pi pi-image"></i>
            <span>Satélite</span>
          </button>
          <button 
            :class="{ active: activeTileStyle === 'standard' }" 
            @click="activeTileStyle = 'standard'"
            title="Standard"
          >
            <i class="pi pi-map"></i>
            <span>Plano</span>
          </button>
          <button 
            :class="{ active: activeTileStyle === 'dark' }" 
            @click="activeTileStyle = 'dark'"
            title="Híbrido Oscuro"
          >
            <i class="pi pi-moon"></i>
            <span>Oscuro</span>
          </button>
        </div>
      </div>

      <!-- LEFT FLOATING PANEL: Simulation Settings -->
      <div class="floating-panel-container left-panel-container">
        <ControlPanel 
          v-model:rainfall="rainfall"
          v-model:temperature="temperature"
          v-model:soilType="soilType"
          v-model:cloudsVisible="cloudsVisible"
          v-model:cloudCoverage="cloudCoverage"
          v-model:windSpeed="windSpeed"
          v-model:windDirection="windDirection"
          :soilOptions="soilOptions"
          :simulationRunning="simulationRunning"
          @toggleSimulation="toggleSimulation"
        />
      </div>

      <!-- RIGHT FLOATING PANEL: Topography & CAD -->
      <div class="floating-panel-container right-panel-container">
        <TopographyPanel 
          :lastClickedCoords="lastClickedCoords"
          :currentElevation="currentElevation"
          :currentSlope="currentSlope"
          :loadingElevation="loadingElevation"
          :aqiValue="aqiValue"
          :aqiStatus="aqiStatus"
          :loadedDxfEntitiesCount="loadedDxfEntitiesCount"
          :hasCadOverlay="hasCadOverlay"
          :loadingAgent="loadingAgent"
          :agentResponse="agentResponse"
          :drawnZoneMetrics="drawnZoneMetrics"
          v-model:activeTab="activeMainTab"
          @dxfParsedText="handleDxfTextParsed"
          @mockCadClick="loadMockCadBlueprint"
          @clearCadClick="clearCadOverlay"
          @runAgentAnalysis="runAgentAnalysis"
        />
      </div>

    </div>
  </div>
</template>

<style>
/* CSS layout and typography settings for the main dashboard orchestrator */
:root {
  --nav-height: 70px;
  --font-family: 'Plus Jakarta Sans', sans-serif;
  
  --panel-bg-light: rgba(255, 255, 255, 0.3);
  --panel-bg-dark: rgba(15, 23, 42, 0.3);
  
  --panel-border-light: rgba(226, 232, 240, 0.9);
  --panel-border-dark: rgba(255, 255, 255, 0.08);
  
  --color-primary: #8b5cf6;
  --color-primary-hover: #7c3aed;
  
  --text-main-light: #0f172a;
  --text-main-dark: #f8fafc;
  
  --text-muted-light: #475569;
  --text-muted-dark: #cbd5e1;
}

body, html {
  font-family: var(--font-family);
  margin: 0;
  padding: 0;
  overflow: hidden;
  height: 100vh;
}

.topo-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: #0f172a;
}

/* Glassmorphism panel styling */
.glass-panel {
  backdrop-filter: blur(16px) saturate(180%);
  background: var(--panel-bg-dark);
  border: 1px solid var(--panel-border-dark);
  box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.3);
  transition: background 0.3s, border-color 0.3s;
}

/* Light mode overrides */
.light-mode .glass-panel {
  background: var(--panel-bg-light);
  border-color: var(--panel-border-light);
  box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.07);
}

.light-mode {
  --text-main-dark: var(--text-main-light);
  --text-muted-dark: var(--text-muted-light);
}

/* Header Navbar */
.topo-header {
  height: var(--nav-height);
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 1.5rem;
  z-index: 1000;
  border-radius: 0 0 16px 16px;
  border-top: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-main-dark);
}

.logo-icon {
  font-size: 1.75rem;
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo-group h1 {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.2;
}

.logo-group .sub {
  font-size: 0.75rem;
  color: var(--text-muted-dark);
  font-weight: 500;
}

/* Search bar styling */
.header-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 420px;
  width: 100%;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 0 0.75rem;
  height: 38px;
  flex-grow: 1;
}

.light-mode .search-input-wrapper {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
}

.search-icon {
  color: var(--text-muted-dark);
  font-size: 0.9rem;
}

.search-input-wrapper input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-main-dark);
  font-family: var(--font-family);
  font-size: 0.85rem;
  margin-left: 0.5rem;
  width: 100%;
}

.search-btn {
  height: 38px !important;
  font-size: 0.85rem !important;
  border-radius: 10px !important;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

/* Weather Widget */
.weather-widget {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  padding: 0.4rem 0.75rem;
  border-radius: 30px;
  color: #c084fc;
}

.weather-icon {
  font-size: 1.1rem;
}

.weather-details {
  display: flex;
  flex-direction: column;
}

.weather-details .temp {
  font-weight: 800;
  font-size: 0.85rem;
  line-height: 1.1;
}

.weather-details .desc {
  font-size: 0.65rem;
  opacity: 0.8;
}

.theme-toggle {
  background: transparent;
  border: none;
  color: var(--text-main-dark);
  font-size: 1.15rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  transition: background 0.2s;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* Layout framework grid */
.main-layout {
  flex-grow: 1;
  position: relative;
  display: flex;
  overflow: hidden;
}

.map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

/* Map style floating picker */
.map-style-floating {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 999;
  display: flex;
  gap: 0.5rem;
  padding: 0.4rem;
  border-radius: 30px;
}

.map-style-floating button {
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--font-family);
  font-weight: 700;
  font-size: 0.75rem;
  color: var(--text-muted-dark);
  padding: 0.5rem 1rem;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  transition: background-color 0.2s, color 0.2s;
}

.map-style-floating button:hover {
  color: var(--text-main-dark);
  background: rgba(255, 255, 255, 0.05);
}

.light-mode .map-style-floating button:hover {
  background: rgba(0, 0, 0, 0.04);
}

.map-style-floating button.active {
  background: var(--color-primary);
  color: white !important;
}

/* Sidebars Panel Containers */
.floating-panel-container {
  position: absolute;
  top: 1.5rem;
  bottom: 1.5rem;
  width: 320px;
  z-index: 999;
  border-radius: 20px;
  padding: 1.25rem;
  overflow-y: auto;
  backdrop-filter: blur(16px) saturate(180%);
  background: var(--panel-bg-dark);
  border: 1px solid var(--panel-border-dark);
  box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.3);
  transition: background 0.3s, border-color 0.3s;
}

.light-mode .floating-panel-container {
  background: var(--panel-bg-light);
  border-color: var(--panel-border-light);
  box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.07);
}

.left-panel-container {
  left: 1.5rem;
}

.right-panel-container {
  right: 1.5rem;
}

/* Custom leaflet popups styles */
.map-popup {
  font-family: var(--font-family);
  min-width: 140px;
}

.map-popup h3 {
  font-size: 0.85rem;
  font-weight: 800;
  color: #8b5cf6;
  margin-bottom: 0.35rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  padding-bottom: 0.25rem;
}

.map-popup p {
  font-size: 0.75rem;
  line-height: 1.4;
  margin: 0;
  color: #334155;
}

.leaflet-popup-content-wrapper {
  border-radius: 12px !important;
  box-shadow: 0 4px 15px rgba(0,0,0,0.15) !important;
}

/* PrimeVue Select style adjustments to fit modern UI */
.p-select {
  border-radius: 10px !important;
  font-family: var(--font-family) !important;
}

.p-button {
  border-radius: 10px !important;
  font-family: var(--font-family) !important;
  font-weight: 600 !important;
}

/* Responsive configurations */
@media (max-width: 768px) {
  .floating-panel-container {
    position: relative;
    width: 100%;
    top: auto;
    bottom: auto;
    left: auto;
    right: auto;
    border-radius: 0;
    border-left: none;
    border-right: none;
    box-shadow: none;
    max-height: 380px;
  }
  
  .main-layout {
    flex-direction: column;
    overflow-y: auto;
  }
  
  .map-container {
    position: relative;
    height: 45vh;
    width: 100%;
  }
  
  .topo-header {
    flex-direction: column;
    height: auto;
    padding: 1rem;
    gap: 0.75rem;
  }
  
  .header-search {
    max-width: 100%;
  }
}
</style>
