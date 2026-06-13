<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as turf from '@turf/turf'

const props = defineProps<{
  center: [number, number]
  tileStyle: string
  rainfall: number
  temperature: number
  soilFactor: number
  cadVisible: boolean
  cadData: any[] | null
  // Cloud & Wind Simulation props
  cloudsVisible: boolean
  cloudCoverage: number
  windSpeed: number
  windDirection: number
  activeElevation: number | null
}>()

const emit = defineEmits<{
  (e: 'mapClick', lat: number, lng: number): void
  (e: 'drawnPolygon', data: { 
    area: number
    perimeter: number
    minElevation: number | null
    maxElevation: number | null
    avgElevation: number | null
    maxSlope: number | null
    avgSlope: number | null
  }): void
  (e: 'drawnPolyline', data: { length: number }): void
}>()

let L: any = null
const mapElement = ref<HTMLElement | null>(null)
const cloudsCanvas = ref<HTMLCanvasElement | null>(null)

let mapInstance: any = null
let tileLayer: any = null
let heatmapLayer: any = null
let waterLayer: any = null
let dxfLayerGroup: any = null
let animationFrameId: number | null = null
let clouds: any[] = []

// Wind Rose state
const mapHeading = ref(0)

// Computed vertical altitude position percentage (range 2000m to 2500m)
const elevationPercentage = ref(0)
watch(() => props.activeElevation, (val) => {
  if (val === null) {
    elevationPercentage.value = 0
  } else {
    const bound = Math.max(2000, Math.min(2500, val))
    elevationPercentage.value = ((bound - 2000) / 500) * 100
  }
}, { immediate: true })

// Helper elevation logic for terrain simulation
const getElevationValue = (lat: number, lng: number) => {
  const x = lat * 350
  const y = lng * 350
  return 2240 + Math.sin(x) * 150 + Math.cos(y) * 90
}

onMounted(async () => {
  if (process.client) {
    try {
      // Dynamic imports for Leaflet to prevent SSR errors
      L = await import('leaflet')
      ;(window as any).L = L
      await import('leaflet.heat')
      await import('@geoman-io/leaflet-geoman-free')

      // Fix default Leaflet marker icons issues
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
      })

      initMap()
      updateOverlays()
      
      if (props.cloudsVisible) {
        generateClouds()
        startAnimation()
      }
    } catch (err) {
      console.error('Error in map component initialization:', err)
    }
  }
})

onUnmounted(() => {
  stopAnimation()
})

const initMap = () => {
  if (!L || !mapElement.value) return

  mapInstance = L.map(mapElement.value, {
    zoomControl: false,
    attributionControl: false
  }).setView(props.center, 14)

  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(mapInstance)
  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance)

  updateTileStyle()

  // Initialize Geoman
  mapInstance.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawCircleMarker: false,
    drawPolyline: true,
    drawRectangle: true,
    drawPolygon: true,
    drawCircle: true,
    editMode: true,
    dragMode: true,
    cutPolygon: true,
    removalMode: true
  })

  // Compass / Wind Rose orientation wiggling on map move
  let lastCenter = { lat: props.center[0], lng: props.center[1] }
  
  mapInstance.on('move', () => {
    const center = mapInstance.getCenter()
    const dLat = center.lat - lastCenter.lat
    const dLng = center.lng - lastCenter.lng
    
    if (Math.abs(dLat) > 0.00001 || Math.abs(dLng) > 0.00001) {
      const angle = Math.atan2(dLng, dLat) * (180 / Math.PI)
      mapHeading.value = (angle + 360) % 360
    }
    lastCenter = { lat: center.lat, lng: center.lng }
  })
  
  mapInstance.on('moveend', () => {
    let interval = setInterval(() => {
      if (Math.abs(mapHeading.value) < 1 || mapHeading.value > 359) {
        mapHeading.value = 0
        clearInterval(interval)
      } else {
        if (mapHeading.value > 180) {
          mapHeading.value += (360 - mapHeading.value) * 0.15
        } else {
          mapHeading.value -= mapHeading.value * 0.15
        }
      }
    }, 30)
  })

  // Listener for drawn shapes
  mapInstance.on('pm:create', (e: any) => {
    const layer = e.layer

    if (e.shape === 'Polygon' || e.shape === 'Rectangle') {
      const latlngs = layer.getLatLngs()[0]
      const turfCoords = latlngs.map((ll: any) => [ll.lng, ll.lat])
      turfCoords.push(turfCoords[0]) // close polygon loop

      const polygon = turf.polygon([turfCoords])
      const area = turf.area(polygon)
      const perimeter = turf.length(polygon, { units: 'meters' })

      // Grid sampling within the drawn shape bounding box to do topographic measurements
      const bbox = turf.bbox(polygon)
      const minLng = bbox[0]
      const minLat = bbox[1]
      const maxLng = bbox[2]
      const maxLat = bbox[3]

      const heights: number[] = []
      const slopes: number[] = []
      const steps = 8

      for (let i = 0; i <= steps; i++) {
        for (let j = 0; j <= steps; j++) {
          const sampleLat = minLat + (maxLat - minLat) * (i / steps)
          const sampleLng = minLng + (maxLng - minLng) * (j / steps)
          const pt = turf.point([sampleLng, sampleLat])
          
          if (turf.booleanPointInPolygon(pt, polygon)) {
            const h = getElevationValue(sampleLat, sampleLng)
            heights.push(h)

            // Dynamic slope calculations at sample points
            const offset = 0.0006
            const h1 = getElevationValue(sampleLat + offset, sampleLng)
            const h2 = getElevationValue(sampleLat - offset, sampleLng)
            const distance = 133
            const diff = Math.abs(h1 - h2)
            slopes.push(Math.min(Math.round((diff / distance) * 100), 48))
          }
        }
      }

      const avgElevation = heights.length > 0 ? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length) : null
      const minElevation = heights.length > 0 ? Math.round(Math.min(...heights)) : null
      const maxElevation = heights.length > 0 ? Math.round(Math.max(...heights)) : null
      const maxSlope = slopes.length > 0 ? Math.round(Math.max(...slopes)) : null
      const avgSlope = slopes.length > 0 ? Math.round(slopes.reduce((a, b) => a + b, 0) / slopes.length) : null

      layer.bindPopup(`
        <div class="map-popup">
          <h3><i class="pi pi-map"></i> Terreno Seleccionado</h3>
          <p><strong>Área:</strong> ${Math.round(area).toLocaleString()} m²</p>
          <p><strong>Perímetro:</strong> ${Math.round(perimeter).toLocaleString()} m</p>
          <p><strong>Altitud Promedio:</strong> ${avgElevation || '---'} m</p>
          <p><strong>Pendiente Máxima:</strong> ${maxSlope || '---'} %</p>
          <p style="font-size: 0.65rem; color: #8b5cf6; margin-top: 5px;">Muestreo topográfico vía Turf.js</p>
        </div>
      `).openPopup()

      emit('drawnPolygon', { 
        area, 
        perimeter, 
        minElevation, 
        maxElevation, 
        avgElevation, 
        maxSlope, 
        avgSlope 
      })
    } else if (e.shape === 'Polyline') {
      const latlngs = layer.getLatLngs()
      const turfCoords = latlngs.map((ll: any) => [ll.lng, ll.lat])
      const line = turf.lineString(turfCoords)
      const length = turf.length(line, { units: 'meters' })

      layer.bindPopup(`
        <div class="map-popup">
          <h3><i class="pi pi-share-alt"></i> Sendero / Vector</h3>
          <p><strong>Longitud:</strong> ${Math.round(length).toLocaleString()} m</p>
        </div>
      `).openPopup()

      emit('drawnPolyline', { length })
    }
  })

  mapInstance.on('click', (e: any) => {
    if (mapInstance.pm.globalDrawModeEnabled()) return
    emit('mapClick', e.latlng.lat, e.latlng.lng)
  })

  dxfLayerGroup = L.layerGroup().addTo(mapInstance)
}

const updateTileStyle = () => {
  if (!mapInstance || !L) return

  if (tileLayer) {
    mapInstance.removeLayer(tileLayer)
  }

  let url = ''
  let attr = ''

  if (props.tileStyle === 'standard') {
    url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    attr = '© OpenStreetMap'
  } else if (props.tileStyle === 'dark') {
    url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    attr = '© OpenStreetMap, © CartoDB'
  } else if (props.tileStyle === 'satellite') {
    url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    attr = '© ESRI Satellite, USGS'
  }

  tileLayer = L.tileLayer(url, {
    attribution: attr,
    maxZoom: 19
  }).addTo(mapInstance)
}

const updateOverlays = () => {
  if (!mapInstance || !L) return

  const center = props.center

  // 1. Temperature Heatmap
  if (heatmapLayer) {
    mapInstance.removeLayer(heatmapLayer)
  }

  const heatIntensity = (props.temperature + 10) / 60
  const heatPoints: any[] = []

  for (let i = -6; i <= 6; i++) {
    for (let j = -6; j <= 6; j++) {
      const lat = center[0] + i * 0.0015
      const lng = center[1] + j * 0.0015
      const height = getElevationValue(lat, lng)
      const heightFactor = 1 - (height - 2000) / 500
      const intensity = heatIntensity * (0.5 + heightFactor * 0.5)
      heatPoints.push([lat, lng, intensity])
    }
  }

  heatmapLayer = L.heatLayer(heatPoints, {
    radius: 35,
    blur: 25,
    maxZoom: 17,
    gradient: {
      0.1: 'rgba(59, 130, 246, 0.4)',
      0.4: 'rgba(16, 185, 129, 0.6)',
      0.7: 'rgba(234, 179, 8, 0.7)',
      1.0: 'rgba(239, 68, 68, 0.9)'
    }
  }).addTo(mapInstance)

  // 2. Rainfall pooling (Water Layer)
  if (waterLayer) {
    mapInstance.removeLayer(waterLayer)
  }

  const radius = props.rainfall * props.soilFactor * 0.015
  if (radius > 0.05) {
    const centerLngLat = [center[1], center[0]]
    const circle = turf.circle(centerLngLat, radius, { steps: 32, units: 'kilometers' })

    const deformedCoords = circle.geometry.coordinates[0].map((coord, index, arr) => {
      if (index === arr.length - 1) {
        return null
      }
      const angle = (index / 32) * 360
      const latOffset = coord[1] - center[0]
      const lngOffset = coord[0] - center[1]
      const height = getElevationValue(center[0] + latOffset, center[1] + lngOffset)
      const heightOffset = (2400 - height) / 400

      const noiseRadius = radius * (0.85 + Math.sin(index * 3) * 0.12 + heightOffset * 0.15)
      const destPoint = turf.destination(centerLngLat, noiseRadius, angle, { units: 'kilometers' })
      return destPoint.geometry.coordinates
    })
    // Ensure the last coordinate exactly matches the first one to close the polygon
    deformedCoords[deformedCoords.length - 1] = [...(deformedCoords[0] as number[])]

    const waterPolygon = turf.polygon([deformedCoords as number[][]])
    const leafletCoords = waterPolygon.geometry.coordinates[0].map(c => [c[1], c[0]])

    waterLayer = L.polygon(leafletCoords, {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.45,
      weight: 2,
      dashArray: '4, 4'
    }).addTo(mapInstance)
      .bindPopup(`
        <div class="map-popup">
          <h3><i class="pi pi-info"></i> Inundación Estimada</h3>
          <p><strong>Caudal Lluvia:</strong> ${props.rainfall} mm</p>
          <p><strong>Radio de escurrimiento:</strong> ${Math.round(radius * 1000)} metros</p>
        </div>
      `)
  }

  // 3. CAD blueprints
  if (dxfLayerGroup) {
    dxfLayerGroup.clearLayers()
    if (props.cadVisible && props.cadData) {
      props.cadData.forEach(entity => {
        if (entity.type === 'line') {
          L.polyline(entity.coords, { color: entity.color, weight: entity.weight }).addTo(dxfLayerGroup)
        } else if (entity.type === 'polyline') {
          L.polyline(entity.coords, { color: entity.color, weight: entity.weight }).addTo(dxfLayerGroup)
        } else if (entity.type === 'circle') {
          L.circleMarker(entity.coords, {
            radius: entity.radius,
            color: entity.color,
            fillColor: entity.fillColor,
            fillOpacity: 0.8
          }).addTo(dxfLayerGroup).bindTooltip(entity.tooltip || '')
        }
      })
    }
  }
}

// Particle system loop for clouds and wind
const generateClouds = () => {
  clouds = []
  const count = props.cloudCoverage / 2
  for (let i = 0; i < count; i++) {
    clouds.push({
      x: Math.random() * 800,
      y: Math.random() * 600,
      size: 60 + Math.random() * 120,
      opacity: 0.15 + Math.random() * 0.35,
      speedFactor: 0.4 + Math.random() * 0.8
    })
  }
}

const drawClouds = () => {
  if (!cloudsCanvas.value) return
  const canvas = cloudsCanvas.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Sync canvas size
  if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const angleRad = (props.windDirection * Math.PI) / 180
  const speed = props.windSpeed * 0.05

  const dx = Math.sin(angleRad) * speed
  const dy = -Math.cos(angleRad) * speed // flip y for canvas coordinate direction

  clouds.forEach(cloud => {
    // Move particle
    cloud.x += dx * cloud.speedFactor
    cloud.y += dy * cloud.speedFactor

    // Wrap around coordinates
    if (cloud.x < -200) cloud.x = canvas.width + 200
    if (cloud.x > canvas.width + 200) cloud.x = -200
    if (cloud.y < -200) cloud.y = canvas.height + 200
    if (cloud.y > canvas.height + 200) cloud.y = -200

    // Render cloud puff
    const grad = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.size)
    grad.addColorStop(0, `rgba(255, 255, 255, ${cloud.opacity})`)
    grad.addColorStop(0.7, `rgba(240, 245, 255, ${cloud.opacity * 0.45})`)
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2)
    ctx.fill()
  })
}

const startAnimation = () => {
  stopAnimation()
  const tick = () => {
    drawClouds()
    animationFrameId = requestAnimationFrame(tick)
  }
  tick()
}

const stopAnimation = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// Watchers
watch(() => props.center, (newCenter) => {
  if (mapInstance) {
    mapInstance.setView(newCenter, 14)
    updateOverlays()
  }
})

watch(() => props.tileStyle, () => {
  updateTileStyle()
})

watch([() => props.rainfall, () => props.temperature, () => props.soilFactor, () => props.cadVisible, () => props.cadData], () => {
  updateOverlays()
})

watch(() => props.cloudsVisible, (visible) => {
  if (visible) {
    generateClouds()
    setTimeout(() => {
      startAnimation()
    }, 60)
  } else {
    stopAnimation()
    // Clear canvas when disabled
    if (cloudsCanvas.value) {
      const ctx = cloudsCanvas.value.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, cloudsCanvas.value.width, cloudsCanvas.value.height)
    }
  }
}, { immediate: true })

defineExpose({
  flyTo: (coords: [number, number], zoom = 14) => {
    if (mapInstance) {
      mapInstance.flyTo(coords, zoom, { duration: 1.5 })
    }
  }
})
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapElement" class="topo-map"></div>
    <canvas 
      v-if="cloudsVisible" 
      ref="cloudsCanvas" 
      class="clouds-canvas"
    ></canvas>

    <!-- Floating Wind Rose / Compass -->
    <div class="wind-rose-container" title="Rosa de los Vientos (Orientación & Dirección del Viento)">
      <div class="wind-rose-dial" :style="{ transform: `rotate(${-mapHeading}deg)` }">
        <span class="rose-point north">N</span>
        <span class="rose-point east">E</span>
        <span class="rose-point south">S</span>
        <span class="rose-point west">O</span>
        <div class="rose-cross"></div>
      </div>
      <!-- Compass arrow pointing in the direction of the wind -->
      <div class="wind-needle" :style="{ transform: `rotate(${windDirection}deg)` }">
        <i class="pi pi-arrow-up needle-arrow"></i>
      </div>
    </div>

    <!-- Altitude Indicator Bar -->
    <div class="altitude-bar-container" v-if="activeElevation !== null" title="Barra de Altitud">
      <span class="alt-bar-label alt-max">2500m</span>
      <div class="alt-bar-gradient">
        <div class="alt-bar-pointer" :style="{ bottom: `${elevationPercentage}%` }">
          <span class="pointer-value">{{ activeElevation }} m</span>
        </div>
      </div>
      <span class="alt-bar-label alt-min">2000m</span>
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.topo-map {
  width: 100%;
  height: 100%;
  background-color: #0d1117;
}

/* Altitude Bar Styles */
.altitude-bar-container {
  position: absolute;
  top: 50%;
  left: 2.5rem;
  transform: translateY(-50%);
  width: 45px;
  height: 220px;
  background: rgba(15, 23, 42, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.25rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.alt-bar-label {
  font-size: 0.55rem;
  font-weight: 800;
  color: var(--text-muted-dark);
}

.alt-bar-label.alt-max {
  color: #c084fc;
}

.alt-bar-label.alt-min {
  color: #34d399;
}

.alt-bar-gradient {
  position: relative;
  width: 6px;
  height: 140px;
  background: linear-gradient(to top, #10b981 0%, #eab308 50%, #8b5cf6 100%);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.alt-bar-pointer {
  position: absolute;
  left: 50%;
  transform: translate(-50%, 50%);
  width: 14px;
  height: 14px;
  background: #ffffff;
  border: 2px solid #8b5cf6;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.8);
  transition: bottom 0.3s cubic-bezier(0.19, 1, 0.22, 1);
  display: flex;
  align-items: center;
}

.pointer-value {
  position: absolute;
  left: 18px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
}

.topo-map {
  width: 100%;
  height: 100%;
  background-color: #0d1117;
}

.clouds-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 450;
  pointer-events: none;
}

/* Wind Rose Styles */
.wind-rose-container {
  position: absolute;
  bottom: 2rem;
  left: 2rem;
  width: 90px;
  height: 90px;
  background: rgba(15, 23, 42, 0.3); /* lowered opacity to 30% */
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.wind-rose-dial {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transition: transform 0.1s ease-out;
}

.rose-point {
  position: absolute;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.8);
}

.rose-point.north { top: 4px; left: 50%; transform: translateX(-50%); color: #ef4444; }
.rose-point.east { right: 6px; top: 50%; transform: translateY(-50%); }
.rose-point.south { bottom: 4px; left: 50%; transform: translateX(-50%); }
.rose-point.west { left: 6px; top: 50%; transform: translateY(-50%); }

.rose-cross {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60px;
  height: 60px;
  transform: translate(-50%, -50%);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 50%;
}

.wind-needle {
  position: absolute;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.needle-arrow {
  font-size: 1.15rem;
  color: #38bdf8;
  filter: drop-shadow(0 0 5px rgba(56, 189, 248, 0.6));
}
</style>
