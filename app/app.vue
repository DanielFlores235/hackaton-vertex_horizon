<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { DxfParser } from 'dxf-parser'

// Geolocation link & coordinates parsing helpers
const parseCoordinates = (query: string) => {
  const commaMatch = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (commaMatch) {
    return [parseFloat(commaMatch[1]), parseFloat(commaMatch[2])]
  }
  const spaceMatch = query.match(/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/)
  if (spaceMatch) {
    return [parseFloat(spaceMatch[1]), parseFloat(spaceMatch[2])]
  }
  return null
}

const extractCoordsFromGoogleMapsUrl = (url: string) => {
  let match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]

  match = url.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]

  match = url.match(/query=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]

  match = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]

  return null
}

const resolveGoogleMapsUrl = async (query: string): Promise<[number, number] | null> => {
  const directCoords = parseCoordinates(query)
  if (directCoords) return directCoords as [number, number]

  if (query.includes('google.com/maps') || query.includes('google.com.mx/maps') || query.includes('maps.google')) {
    const coords = extractCoordsFromGoogleMapsUrl(query)
    if (coords) return coords as [number, number]
  }

  if (query.includes('maps.app.goo.gl') || query.includes('goo.gl/maps')) {
    try {
      let res;
      try {
        res = await $fetch<any>('/api/resolve-redirect', {
          method: 'POST',
          body: { url: query }
        })
      } catch (proxyErr: any) {
        console.warn("Fallo al resolver link corto a través del proxy local de Nuxt, intentando resolución directa:", proxyErr.message)
        const response = await fetch(query, { method: 'HEAD', redirect: 'manual' })
        const location = response.headers.get('location')
        if (location) {
          res = { success: true, redirectUrl: location }
        } else {
          throw new Error('No location header returned')
        }
      }
      if (res && res.success && res.redirectUrl) {
        const coords = extractCoordsFromGoogleMapsUrl(res.redirectUrl)
        if (coords) return coords as [number, number]
      }
    } catch (err) {
      console.warn("Fallo al resolver link corto a través del resolvedor de redirecciones:", err)
    }
  }
  return null
}

// State Orchestration
const hasSelectedLocation = ref(false)
const agentProgressMessage = ref('Llamando a n8n y OpenAI...')
const mapCenter = ref<[number, number]>([23.6, -102.5]) // Geographic Center of Mexico
const activeTileStyle = ref('satellite')
const searchQuery = ref('')
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
  // Empty initial mount, wait for user search or map click
})

// Geocoding Búsqueda (Nominatim)
const searchLocation = async () => {
  if (!searchQuery.value.trim()) return
  isSearching.value = true

  try {
    // 1. Attempt to parse as coordinates or Google Maps link
    const resolvedCoords = await resolveGoogleMapsUrl(searchQuery.value)
    
    if (resolvedCoords) {
      const [lat, lng] = resolvedCoords
      mapCenter.value = [lat, lng]
      hasSelectedLocation.value = true

      if (topoMapRef.value) {
        topoMapRef.value.flyTo(mapCenter.value, 15)
      }

      // Automatically trigger the map click logic to load elevations, slopes, weather and run AI analysis
      await handleMapClick(lat, lng)

      toast.add({
        severity: 'success',
        summary: 'Ubicación Encontrada',
        detail: `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        life: 3000
      })
      return
    }

    // 2. Default Nominatim address geocoding search (prioritizing Mexico for local regulations)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(searchQuery.value)}`)
    const data = await res.json()
    if (data && data[0]) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      mapCenter.value = [lat, lng]
      hasSelectedLocation.value = true

      if (topoMapRef.value) {
        topoMapRef.value.flyTo(mapCenter.value, 15)
      }

      // Automatically trigger the map click logic to load elevations, slopes, weather, and run AI analysis
      await handleMapClick(lat, lng)

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
        detail: 'No se encontró la ubicación ni coordenadas válidas.',
        life: 3000
      })
    }
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Error al procesar la búsqueda o conectar con el servidor de mapas.',
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

  if (!hasSelectedLocation.value) {
    hasSelectedLocation.value = true
    mapCenter.value = [lat, lng]
    if (topoMapRef.value) {
      topoMapRef.value.flyTo(mapCenter.value, 14)
    }
  }

  fetchWeather(lat, lng)

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
  
  if (metrics.center) {
    const [lat, lng] = metrics.center
    lastClickedCoords.value = [lat, lng]
    mapCenter.value = [lat, lng]
    
    // Update active elevation and slope to the averages computed inside the delimited terrain
    if (metrics.avgElevation !== null) {
      currentElevation.value = metrics.avgElevation
    }
    if (metrics.avgSlope !== null) {
      currentSlope.value = metrics.avgSlope
    }
    
    fetchWeather(lat, lng)
    fetchAQI(lat, lng)
  }

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

const generateLocalFallbackAnalysis = (
  lat: number,
  lng: number,
  slope: number,
  elevation: number,
  soilName: string,
  soilFactor: number,
  temp: number,
  rain: number,
  hasCad: boolean
) => {
  const slopeVal = slope || 0
  const elevVal = elevation || 1500
  const tempVal = temp || 20
  const rainVal = rain || 30
  
  const baseFS = 2.5
  const slopeImpact = slopeVal * 0.035
  const soilImpact = (soilFactor - 0.3) * 0.8
  const calculatedFS = Math.max(0.8, Math.min(3.0, parseFloat((baseFS - slopeImpact - soilImpact).toFixed(2))))
  
  let baseCapacity = 300
  if (soilName.toLowerCase().includes('arenoso')) baseCapacity = 180
  else if (soilName.toLowerCase().includes('limoso')) baseCapacity = 220
  else if (soilName.toLowerCase().includes('arcilloso')) baseCapacity = 120
  else if (soilName.toLowerCase().includes('rocoso')) baseCapacity = 450
  const capacityVal = Math.round(baseCapacity + (2500 - elevVal) * 0.02)

  let veredicto = "Aprobado"
  if (calculatedFS < 1.3) veredicto = "Rechazado (Inestable)"
  else if (calculatedFS < 1.5) veredicto = "Acondicionado (Estabilidad Marginal)"

  let hydroVuln = "Baja"
  if (rainVal > 70 || (soilName.toLowerCase().includes('arcilloso') && rainVal > 40)) {
    hydroVuln = "Alta - Alto riesgo de saturación y encharcamiento"
  } else if (rainVal > 40 || soilName.toLowerCase().includes('arcilloso') || soilName.toLowerCase().includes('limoso')) {
    hydroVuln = "Media - Moderado riesgo de escorrentía superficial"
  }

  const limitantes = []
  if (slopeVal > 20) limitantes.push("Pendiente pronunciada (>20%) que requiere nivelación y muros de contención.")
  if (soilName.toLowerCase().includes('arcilloso')) limitantes.push("Suelo arcilloso expansivo con baja tasa de filtración de agua.")
  if (rainVal > 60) limitantes.push("Precipitación pluvial severa que incrementa el empuje hidrostático en cimientos.")
  if (limitantes.length === 0) limitantes.push("Ninguna limitante crítica identificada. Pendientes moderadas.")

  const mitigaciones = [
    "Instalación de drenes franceses perimetrales para desviar aguas pluviales.",
    "Compactación dinámica del terreno en capas de 20cm antes del colado."
  ]
  if (slopeVal > 15) mitigaciones.push("Construcción de terrazas escalonadas y muros de mampostería reforzada.")
  if (soilName.toLowerCase().includes('arcilloso')) mitigaciones.push("Sustitución de subrasante por material inerte no expansivo.")

  const disenoTermico = [
    "Orientar las ventanas principales para aprovechar la iluminación solar pasiva.",
    "Uso de aislante térmico XPS de 2 pulgadas en muros perimetrales expuestos."
  ]
  if (tempVal > 30) {
    disenoTermico.push("Instalación de aleros y celosías para sombreado en fachada sur.")
  } else {
    disenoTermico.push("Maximizar ganancias térmicas directas con acristalamiento doble (duo-vent).")
  }

  return {
    conclusion_para_agente_principal: `Análisis local (Fallback): El terreno presenta una viabilidad estructural clasificada como ${veredicto.toLowerCase()}. Se recomienda ${slopeVal > 15 ? 'atención prioritaria a la estabilidad del talud' : 'cimentación estándar corrida'} en combinación con drenajes adecuados debido al suelo tipo ${soilName}.`,
    analisis_topografico: {
      pendientes_y_curvas: `El relieve registra una elevación promedio de ${elevVal} metros sobre el nivel del mar con una pendiente promedio calculada de ${slopeVal}%. El modelado local sugiere que las curvas de nivel corren paralelas al eje principal del predio, facilitando el escurrimiento pluvial hacia las zonas bajas.`,
      limitantes_fisicas: limitantes
    },
    riesgos_ambientales: {
      vulnerabilidad_hidrologica: hydroVuln,
      medidas_mitigacion: mitigaciones
    },
    viabilidad_normativa: {
      restricciones_linderos: "Respetar servidumbre de paso frontal de 3.0 metros y restricción de colindancia lateral de 1.5 metros para áreas de ventilación.",
      cumplimiento_reglamentos: slopeVal > 25 ? "Revisión Especial (Requiere Dictamen Geotécnico Completo)" : "Aprobado (Cumple coeficientes COS y CUS)"
    },
    analisis_termico_clima: {
      comportamiento_temperatura_estaciones: `Con una temperatura promedio actual de ${tempVal}°C, el área experimenta un microclima de rango templado-cálido. Las variaciones estacionales proyectan máximas de ${Math.round(tempVal + 8)}°C en verano y mínimas de ${Math.round(tempVal - 10)}°C en invierno.`,
      necesidades_calefaccion_refrigeracion: tempVal > 28 ? "Demanda alta de refrigeración activa durante las horas pico de radiación." : "Requerimientos moderados de climatización mixta estacional.",
      recomendaciones_diseno_termico: disenoTermico
    },
    cotejo_cad_matematico: {
      analisis_apoyos_columnas: hasCad 
        ? "El plano cargado muestra la distribución de columnas. La cimentación propuesta coincide adecuadamente con el plano, aunque las columnas en las zonas de mayor pendiente requieren zapatas aisladas reforzadas."
        : "No se proporcionó plano CAD. El cálculo estructural asume una configuración típica residencial unifamiliar con apoyos distribuidos uniformemente.",
      calculos_ingenieria: `[Cálculo Estructural Local]\nCapacidad de carga admisible (Terzaghi): ${capacityVal} kPa\nFactor de seguridad de estabilidad de taludes: FS = ${calculatedFS}\nSaturación crítica del suelo: ${(soilFactor * 100).toFixed(0)}%\nCoeficiente de fricción interna (estimado): 28°`,
      veredicto_estructural: veredicto
    }
  }
}

const runAgentAnalysis = async () => {
  if (!lastClickedCoords.value && !drawnZoneMetrics.value) return
  loadingAgent.value = true
  agentResponse.value = null
  agentProgressMessage.value = 'Iniciando conexión con el Agente IA...'

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

  let attempt = 1
  const maxAttempts = 2
  let success = false
  let errorMsg = ''

  while (attempt <= maxAttempts && !success) {
    try {
      agentProgressMessage.value = `Conectando con agente IA... (Intento ${attempt}/${maxAttempts})`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90000)

      let response;
      try {
        response = await $fetch<any>('/api/topo-agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            sessionId: `session-${Date.now()}`,
            coordenadas: coordsStr,
            descripcion_terreno: descStr,
            planos_2d: planosDescription
          },
          signal: controller.signal
        })
      } catch (proxyErr: any) {
        console.warn(`[Proxy Fallback] El proxy local falló, intentando llamar a n8n directamente:`, proxyErr.message)
        
        // Sequentially try test and production webhooks directly from client side
        const directUrls = [
          'https://mr3miliano.app.n8n.cloud/webhook-test/topo-agent',
          'https://mr3miliano.app.n8n.cloud/webhook/topo-agent'
        ]
        
        let directSuccess = false
        for (const url of directUrls) {
          try {
            console.log(`[Direct Fallback] Intentando llamar directamente a: ${url}`)
            const directRes = await $fetch<any>(url, {
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
              },
              signal: controller.signal
            })
            
            // Lenient extraction for direct calls
            let directExtracted = null
            if (directRes) {
              if (directRes.agent_response) directExtracted = directRes.agent_response
              else if (directRes.conclusion_para_agente_principal) directExtracted = directRes
              else if (directRes.success && directRes.data && directRes.data.conclusion_para_agente_principal) directExtracted = directRes.data
            }
            
            if (directExtracted && directExtracted.conclusion_para_agente_principal) {
              response = { success: true, agent_response: directExtracted }
              directSuccess = true
              break
            } else {
              throw new Error('Respuesta inválida de n8n directo')
            }
          } catch (directErr: any) {
            console.warn(`[Direct Fallback] Falló llamada a ${url}:`, directErr.message)
          }
        }
        
        if (!directSuccess) {
          throw new Error('Todos los webhooks directos y el proxy local fallaron.')
        }
      }
      
      clearTimeout(timeoutId)

      // Lenient validation for final response
      let extractedAgent = null
      if (response) {
        if (response.agent_response) {
          extractedAgent = response.agent_response
        } else if (response.conclusion_para_agente_principal) {
          extractedAgent = response
        } else if (response.success && response.data && response.data.conclusion_para_agente_principal) {
          extractedAgent = response.data
        }
      }

      if (extractedAgent && extractedAgent.conclusion_para_agente_principal) {
        agentResponse.value = extractedAgent
        success = true
        toast.add({
          severity: 'success',
          summary: 'Análisis IA Completo',
          detail: 'Topo-Agent generó las recomendaciones del terreno con éxito.',
          life: 3000
        })
      } else {
        throw new Error('Formato de respuesta de n8n inválido (falta conclusion_para_agente_principal)')
      }
    } catch (err: any) {
      console.warn(`Intento ${attempt} fallido:`, err)
      const isAbort = err.name === 'AbortError' || err.message?.toLowerCase().includes('abort') || err.message?.toLowerCase().includes('timeout')
      
      if (isAbort) {
        errorMsg = 'Timeout (90s superados)'
      } else if (err.message?.includes('404') || err.message?.includes('500') || err.message?.includes('Failed to fetch') || err.message?.includes('CORS')) {
        errorMsg = `Error de red / CORS / Webhook inactivo (${err.message})`
      } else {
        errorMsg = `Error al conectar (${err.message || err})`
      }

      attempt++
      if (attempt <= maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  if (!success) {
    toast.add({
      severity: 'warn',
      summary: 'Fallback Activo',
      detail: `n8n falló (${errorMsg}). Generando análisis local alternativo.`,
      life: 5000
    })

    const lat = lastClickedCoords.value ? lastClickedCoords.value[0] : 23.6
    const lng = lastClickedCoords.value ? lastClickedCoords.value[1] : -102.5
    const slope = drawnZoneMetrics.value ? drawnZoneMetrics.value.avgSlope : (currentSlope.value || 0)
    const elevation = drawnZoneMetrics.value ? drawnZoneMetrics.value.avgElevation : (currentElevation.value || 1500)
    const soilName = soilType.value.name
    const soilFactor = soilType.value.factor
    const temp = temperature.value
    const rain = rainfall.value
    const hasCad = hasCadOverlay.value

    agentResponse.value = generateLocalFallbackAnalysis(lat, lng, slope, elevation, soilName, soilFactor, temp, rain, hasCad)
    loadingAgent.value = false
  } else {
    loadingAgent.value = false
  }
}

const handleDwgFile = async (file: File) => {
  try {
    toast.add({
      severity: 'info',
      summary: 'Procesando DWG',
      detail: 'Intentando convertir archivo DWG a DXF localmente...',
      life: 3000
    })

    const libredwgPkg = '@mlightcad/libredwg-web'
    const libredwgModule = await import(/* @vite-ignore */ libredwgPkg)
    
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    if (libredwgModule && libredwgModule.LibreDwg) {
      const LibreDwg = libredwgModule.LibreDwg
      const Dwg_File_Type = libredwgModule.Dwg_File_Type
      const libredwg = await LibreDwg.create()
      const dwg = libredwg.dwg_read_data(uint8Array, Dwg_File_Type.DWG)
      
      let dxfText = ''
      if (typeof libredwg.toDxf === 'function') {
        dxfText = libredwg.toDxf(dwg)
      } else if (typeof libredwg.convert === 'function') {
        const converted = libredwg.convert(dwg)
        if (typeof converted === 'string') {
          dxfText = converted
        } else {
          throw new Error('Formato convertido no soportado directamente')
        }
      } else {
        throw new Error('Método de exportación DXF no encontrado en la librería LibreDwg')
      }

      if (typeof libredwg.dwg_free === 'function') {
        libredwg.dwg_free(dwg)
      }

      if (dxfText) {
        handleDxfTextParsed(dxfText)
        return
      }
    }
    
    throw new Error('Librería LibreDwg no inicializada o incompatible')
  } catch (err: any) {
    console.error('Error al procesar DWG localmente:', err)
    toast.add({
      severity: 'warn',
      summary: 'DWG Experimental',
      detail: 'El soporte DWG en navegador es experimental. Se recomienda convertir a DXF en AutoCAD. Cargando planos Mock como fallback.',
      life: 6000
    })
    loadMockCadBlueprint()
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

  // Automatically trigger agent analysis to run the CAD matching evaluation
  if (lastClickedCoords.value || drawnZoneMetrics.value) {
    runAgentAnalysis()
  }
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

    // Automatically trigger agent analysis to run the CAD matching evaluation
    if (lastClickedCoords.value || drawnZoneMetrics.value) {
      runAgentAnalysis()
    }
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

  // Automatically trigger agent analysis to clear the CAD matching evaluation
  if (lastClickedCoords.value || drawnZoneMetrics.value) {
    runAgentAnalysis()
  }
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
        <img src="./components/assets/vertex-horizon.svg" alt="Vertex Horizon" class="logo-image" />
        <div class="logo-group">
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
        <div class="weather-widget" v-if="weatherInfo && hasSelectedLocation">
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
          :zoom="hasSelectedLocation ? 14 : 5"
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
          :hasSelectedLocation="hasSelectedLocation"
          @mapClick="handleMapClick"
          @drawnPolygon="handleDrawnPolygon"
        />
        
        <!-- Tile Switcher controls -->
        <div v-if="hasSelectedLocation" class="map-style-floating glass-panel">
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
            :class="{ active: activeTileStyle === 'topografica' }" 
            @click="activeTileStyle = 'topografica'"
            title="Topográfica"
          >
            <i class="pi pi-map"></i>
            <span>Topográfica</span>
          </button>
        </div>
      </div>

      <!-- Welcome Overlay -->
      <div v-if="!hasSelectedLocation" class="welcome-overlay glass-panel">
        <div class="welcome-content">
          <img src="./components/assets/vertex-horizon.svg" alt="Vertex Horizon" class="welcome-logo-image" />
          <p>Busca una ubicación en la barra superior o haz clic en el mapa para comenzar el análisis.</p>
          <div class="welcome-arrow">
            <i class="pi pi-arrow-up"></i>
          </div>
        </div>
      </div>

      <!-- LEFT FLOATING PANEL: Simulation Settings -->
      <div v-if="hasSelectedLocation" class="floating-panel-container left-panel-container">
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
      <div v-if="hasSelectedLocation" class="floating-panel-container right-panel-container">
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
          :agentProgressMessage="agentProgressMessage"
          v-model:activeTab="activeMainTab"
          @dxfParsedText="handleDxfTextParsed"
          @dwgFileSelected="handleDwgFile"
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
  color: #f8fafc;
  background-color: #0f172a;
}

.topo-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background-color: #0f172a;
}

.glass-panel {
  backdrop-filter: blur(20px) saturate(190%);
  background: rgba(15, 23, 42, 0.45) !important; /* increased opacity to 45% for readability */
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
}

.glass-panel:hover {
  box-shadow: 0 8px 36px 0 rgba(139, 92, 246, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

/* Light mode overrides */
.light-mode .glass-panel {
  background: var(--panel-bg-light);
  border-color: var(--panel-border-light);
  box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.07), inset 0 0 0 1px rgba(255, 255, 255, 0.2);
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
  font-size: 1.25rem;
  font-weight: 950;
  letter-spacing: -0.5px;
  line-height: 1.2;
  background: linear-gradient(135deg, #f5f3ff 0%, #c084fc 40%, #60a5fa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 20px rgba(139, 92, 246, 0.12);
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
  width: 345px;
  z-index: 999;
  border-radius: 20px;
  padding: 0; /* padding moved to inner body for flex overflow layout */
  overflow: hidden; /* prevent double scrollbars */
  backdrop-filter: blur(20px) saturate(190%);
  background: rgba(15, 23, 42, 0.45) !important; /* increased opacity to 45% */
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  transition: background 0.3s, border-color 0.3s, box-shadow 0.3s, width 0.3s;
  color: #f8fafc;
  display: flex;
  flex-direction: column;
}

/* Reposition Leaflet Controls and Wind Rose outside sidebars on desktop */
@media (min-width: 769px) {
  .leaflet-top.leaflet-left {
    left: 375px !important;
    top: 1.5rem !important;
  }

  .leaflet-bottom.leaflet-left {
    left: 375px !important;
    bottom: 1.5rem !important;
  }

  .leaflet-bottom.leaflet-right {
    right: 375px !important;
    bottom: 1.5rem !important;
  }

  .wind-rose-container {
    left: 375px !important;
    bottom: 3.5rem !important;
  }
}

.floating-panel-container::-webkit-scrollbar {
  width: 5px;
}
.floating-panel-container::-webkit-scrollbar-track {
  background: transparent;
}
.floating-panel-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.floating-panel-container::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.4);
}

.light-mode .floating-panel-container {
  background: var(--panel-bg-light);
  border-color: var(--panel-border-light);
  box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.07), inset 0 0 0 1px rgba(255, 255, 255, 0.2);
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

/* Custom Sliders UIUX Pro Max */
.custom-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12) !important;
  outline: none;
  border: none;
  margin: 0.5rem 0;
}

.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffffff !important;
  border: 2px solid var(--color-primary);
  box-shadow: 0 0 10px var(--color-primary);
  cursor: pointer;
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s;
}

.custom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.35);
  background-color: var(--color-primary-hover);
}

/* UI/UX Pro Max layout, spacing and text overlays */
.control-group {
  margin-bottom: 0.75rem;
}

.control-title-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #c084fc !important;
  margin-bottom: 0.5rem;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #e2e8f0;
}

.slider-helper {
  display: block;
  font-size: 0.65rem;
  color: #94a3b8 !important;
  margin-top: 0.35rem;
  line-height: 1.35;
}

.section-desc {
  font-size: 0.7rem;
  color: #94a3b8 !important;
  margin-bottom: 0.75rem;
  line-height: 1.4;
}

/* Clicked Info Box */
.clicked-info-box {
  background: rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  border-radius: 10px !important;
  padding: 0.75rem !important;
  margin-top: 0.5rem !important;
  color: #f8fafc !important;
}

.coord-tag {
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.6rem;
  color: #ffffff;
}

.metric-row {
  display: flex;
  gap: 0.75rem;
}

.metric-col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.metric-col .lbl {
  font-size: 0.62rem;
  text-transform: uppercase;
  color: #94a3b8 !important;
  margin-bottom: 0.2rem;
}

.metric-col .val {
  font-size: 0.85rem;
  font-weight: 800;
  color: #ffffff !important;
}

/* CAD Import buttons styling */
.button-grid {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.button-grid button,
.button-grid .p-button {
  flex: 1;
  background: rgba(139, 92, 246, 0.15) !important;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  color: #c084fc !important;
  padding: 0.5rem 0.25rem !important;
  border-radius: 8px !important;
  font-size: 0.7rem !important;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  transition: all 0.2s ease;
}

.button-grid button:hover,
.button-grid .p-button:hover {
  background: rgba(139, 92, 246, 0.25) !important;
  border-color: rgba(139, 92, 246, 0.5) !important;
  transform: translateY(-1px);
}

/* AQI Panel */
.aqi-section {
  background: rgba(0, 0, 0, 0.25) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  border-radius: 10px;
  padding: 0.75rem;
  margin-top: 1rem;
}

.aqi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 0.5rem;
}

.aqi-badge {
  color: #0f172a !important;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}

.aqi-advice {
  font-size: 0.68rem;
  color: #94a3b8 !important;
  margin: 0;
  line-height: 1.35;
}

/* PrimeVue Select override */
.p-select {
  width: 100% !important;
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
  height: 38px;
}

.p-select .p-select-label {
  color: #ffffff !important;
  font-size: 0.8rem !important;
  padding: 0.45rem 0.75rem !important;
}

.p-select-overlay {
  background: #0f172a !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.p-select-option {
  color: #e2e8f0 !important;
  font-size: 0.75rem !important;
}

.p-select-option.p-select-option-selected {
  background: rgba(139, 92, 246, 0.2) !important;
  color: #c084fc !important;
}

/* Heatmap and style Floating switch active state */
.map-style-floating button {
  color: #cbd5e1 !important;
}

.map-style-floating button.active {
  background: var(--color-primary) !important;
  color: #ffffff !important;
}

/* Floating Wind Rose lowered opacity to 30% and tactical look */
.wind-rose-container {
  background: rgba(15, 23, 42, 0.3) !important; /* forced 30% opacity */
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.rose-point {
  color: rgba(255, 255, 255, 0.9) !important;
}

/* Executive conclusions text readability */
.executive-conclusion-box {
  background: rgba(139, 92, 246, 0.06) !important;
  border-left-color: #c084fc !important;
}

.conclusion-desc {
  color: #ffffff !important;
}

.pane-desc {
  color: #e2e8f0 !important;
}

.pane-list-item {
  background: rgba(0, 0, 0, 0.15) !important;
  border-color: rgba(255, 255, 255, 0.02) !important;
  color: #e2e8f0 !important;
}

.welcome-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1001;
  padding: 2.5rem;
  border-radius: 20px;
  max-width: 450px;
  width: 90%;
  text-align: center;
  pointer-events: auto;
}

.welcome-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.welcome-logo-icon {
  font-size: 3.5rem;
  background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.welcome-content h2 {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0;
  background: linear-gradient(135deg, #f5f3ff 0%, #c084fc 40%, #60a5fa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.welcome-content p {
  font-size: 0.95rem;
  color: var(--text-muted-dark);
  line-height: 1.5;
  margin: 0;
}

.welcome-arrow {
  margin-top: 0.5rem;
  font-size: 1.5rem;
  color: #c084fc;
  animation: bounce-up-down 1.5s infinite ease-in-out;
}

@keyframes bounce-up-down {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.logo-image {
  width: 48px;
  height: 48px;
  object-fit: contain;
  margin-right: 0.25rem;
}

.welcome-logo-image {
  width: 180px;
  height: 180px;
  object-fit: contain;
  margin-bottom: 0.5rem;
}
</style>
