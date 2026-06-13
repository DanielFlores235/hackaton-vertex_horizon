<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  lastClickedCoords: [number, number] | null
  currentElevation: number | null
  currentSlope: number | null
  loadingElevation: boolean
  aqiValue: number
  aqiStatus: { label: string; color: string; class: string }
  loadedDxfEntitiesCount: number
  hasCadOverlay: boolean
  loadingAgent: boolean
  agentResponse: any | null
  drawnZoneMetrics: any | null
  activeTab: 'terreno' | 'agente'
}>()

const emit = defineEmits<{
  (e: 'dxfParsedText', text: string): void
  (e: 'mockCadClick'): void
  (e: 'clearCadClick'): void
  (e: 'runAgentAnalysis'): void
  (e: 'update:activeTab', tab: 'terreno' | 'agente'): void
}>()

const dxfInputRef = ref<HTMLInputElement | null>(null)
const activeAgentSection = ref<'topo' | 'riesgos' | 'normativa' | 'termico' | 'cotejo'>('topo')

// Main layout tabs: 'terreno' (CAD & Measurements) vs 'agente' (IA analysis report)
const activeMainTab = computed({
  get: () => props.activeTab,
  set: (val) => emit('update:activeTab', val)
})

const triggerFileInput = () => {
  if (dxfInputRef.value) {
    dxfInputRef.value.click()
  }
}

const handleFileChange = (event: any) => {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e: any) => {
    emit('dxfParsedText', e.target.result)
  }
  reader.readAsText(file)
}

// Compute dynamic badge class for regulatory status
const regulatoryClass = computed(() => {
  if (!props.agentResponse?.viabilidad_normativa?.cumplimiento_reglamentos) return 'badge-cond'
  const rule = props.agentResponse.viabilidad_normativa.cumplimiento_reglamentos.toLowerCase()
  if (rule.includes('aprobado') || rule.includes('aprobada')) return 'badge-ok'
  if (rule.includes('rechazado') || rule.includes('rechazada') || rule.includes('no viable')) return 'badge-danger'
  return 'badge-cond'
})

// Compute dynamic risk level style
const riskLevelClass = computed(() => {
  if (!props.agentResponse?.riesgos_ambientales?.vulnerabilidad_hidrologica) return 'risk-low'
  const risk = props.agentResponse.riesgos_ambientales.vulnerabilidad_hidrologica.toLowerCase()
  if (risk.includes('alto') || risk.includes('alta') || risk.includes('severo')) return 'risk-high'
  if (risk.includes('moderado') || risk.includes('moderada') || risk.includes('medio')) return 'risk-medium'
  return 'risk-low'
})

// 1. Displayed slope clamping negative values to 0 %
const displayedSlope = computed(() => {
  if (props.currentSlope === null) return '---'
  const val = props.currentSlope < 0 ? 0 : props.currentSlope
  return `${val} %`
})

// 2. Parse Factor of Safety (FS) from calculos_ingenieria
const parsedFS = computed(() => {
  if (!props.agentResponse?.cotejo_cad_matematico?.calculos_ingenieria) return null
  const text = props.agentResponse.cotejo_cad_matematico.calculos_ingenieria
  const match = text.match(/FS\s*[=:]\s*([0-9.]+)/i)
  if (match) {
    const val = parseFloat(match[1])
    return isNaN(val) ? null : val
  }
  return null
})

// 3. Parse Terzaghi capacity from calculos_ingenieria
const parsedTerzaghi = computed(() => {
  if (!props.agentResponse?.cotejo_cad_matematico?.calculos_ingenieria) return null
  const text = props.agentResponse.cotejo_cad_matematico.calculos_ingenieria
  const match = text.match(/([0-9.]+)\s*kPa/i)
  if (match) {
    const val = parseFloat(match[1])
    return isNaN(val) ? null : val
  }
  return null
})

// 4. Compute Viabilidad de Obra classes and label
const viabilidadObraClass = computed(() => {
  if (!props.agentResponse?.conclusion_para_agente_principal) return ''
  const conclusion = props.agentResponse.conclusion_para_agente_principal.toLowerCase()
  if (conclusion.includes('totalmente viable') || conclusion.includes('proyecto viable') || (conclusion.includes('viable') && !conclusion.includes('no viable') && !conclusion.includes('condicionado') && !conclusion.includes('condicionada'))) {
    return 'viable-ok'
  }
  if (conclusion.includes('condicionado') || conclusion.includes('condicionada')) {
    return 'viable-cond'
  }
  if (conclusion.includes('no viable') || conclusion.includes('rechazado') || conclusion.includes('rechazada') || conclusion.includes('peligro extremo')) {
    return 'viable-danger'
  }
  return 'viable-cond' // fallback
})

const viabilidadObraLabel = computed(() => {
  const cls = viabilidadObraClass.value
  if (cls === 'viable-ok') return 'Viable'
  if (cls === 'viable-cond') return 'Condicionado'
  if (cls === 'viable-danger') return 'No Viable'
  return ''
})

// 5. FS progress bar status classes and tooltips
const fsStatusLabel = computed(() => {
  const val = parsedFS.value
  if (val === null) return ''
  if (val < 1.0) return 'Inestable'
  if (val < 1.5) return 'Marginal'
  return 'Estable'
})

const fsStatusClass = computed(() => {
  const val = parsedFS.value
  if (val === null) return ''
  if (val < 1.0) return 'text-red-400'
  if (val < 1.5) return 'text-yellow-400'
  return 'text-green-400'
})

const fsBarClass = computed(() => {
  const val = parsedFS.value
  if (val === null) return ''
  if (val < 1.0) return 'bg-red-500'
  if (val < 1.5) return 'bg-yellow-500'
  return 'bg-green-500'
})

const fsTooltipText = computed(() => {
  const val = parsedFS.value
  if (val === null) return ''
  if (val < 1.0) return 'Inestable (Alto riesgo de colapso).'
  if (val < 1.5) return 'Marginalmente estable (Requiere precauciones).'
  return 'Estable (Estructura segura).'
})

// 6. Terzaghi capacity status classes and tooltips
const terzaghiStatusLabel = computed(() => {
  const val = parsedTerzaghi.value
  if (val === null) return ''
  if (val < 100) return 'Bajo'
  if (val < 250) return 'Medio'
  return 'Alto'
})

const terzaghiStatusClass = computed(() => {
  const val = parsedTerzaghi.value
  if (val === null) return ''
  if (val < 100) return 'text-red-400'
  if (val < 250) return 'text-yellow-400'
  return 'text-green-400'
})

const terzaghiBarClass = computed(() => {
  const val = parsedTerzaghi.value
  if (val === null) return ''
  if (val < 100) return 'bg-red-500'
  if (val < 250) return 'bg-yellow-500'
  return 'bg-green-500'
})

const terzaghiTooltipText = computed(() => {
  const val = parsedTerzaghi.value
  if (val === null) return ''
  if (val < 100) return 'Capacidad baja (Suelo blando o inestable).'
  if (val < 250) return 'Capacidad media (Suelo estándar para cimentación).'
  return 'Capacidad alta (Suelo firme o rocoso).'
})
</script>

<template>
  <aside class="floating-panel right-panel" style="display: flex; flex-direction: column;">
    <div class="panel-header">
      <i class="pi pi-compass header-icon text-blue"></i>
      <h2>Topografía & CAD</h2>
    </div>

    <!-- Main Navigation Tabs for right panel -->
    <div class="main-panel-tabs">
      <button 
        :class="{ active: activeMainTab === 'terreno' }" 
        @click="activeMainTab = 'terreno'"
      >
        <i class="pi pi-map"></i> Terreno
      </button>
      <button 
        :class="{ active: activeMainTab === 'agente' }" 
        @click="activeMainTab = 'agente'"
      >
        <i class="pi pi-sparkles"></i> Agente IA
        <span v-if="loadingAgent" class="tab-spinner-indicator pi pi-spin pi-spinner"></span>
        <span v-else-if="agentResponse" class="tab-notification-dot"></span>
      </button>
    </div>

    <div class="panel-body" style="overflow-y: auto; overflow-x: hidden;">
      
      <!-- TAB 1: TERRENO (Relieve, Mediciones, CAD, Aire) -->
      <div v-if="activeMainTab === 'terreno'" class="tab-pane-container animate-fade-in">
        
        <!-- Real-time Elevation and Slope details (calculated on Map Click) -->
        <div class="relief-section">
          <h3>Georreferencia & Relieve</h3>
          
          <div class="clicked-info-box" v-if="lastClickedCoords">
            <div class="coord-tag animate-fade-in">
              <i class="pi pi-map-marker text-red-500"></i>
              <span>Lat: {{ lastClickedCoords[0].toFixed(5) }}, Lng: {{ lastClickedCoords[1].toFixed(5) }}</span>
            </div>

            <div class="metric-row">
              <div class="metric-col">
                <span class="lbl">Altitud Real</span>
                <div class="val-wrapper">
                  <span v-if="loadingElevation" class="pi pi-spin pi-spinner val-loader"></span>
                  <span v-else class="val animate-scale-up">{{ currentElevation !== null ? currentElevation + ' m' : '---' }}</span>
                </div>
                <span class="src-info">Lectura Satelital</span>
              </div>

              <div class="metric-col">
                <span class="lbl">Pendiente</span>
                <div class="val-wrapper">
                  <span v-if="loadingElevation" class="pi pi-spin pi-spinner val-loader"></span>
                  <span v-else class="val animate-scale-up">{{ displayedSlope }}</span>
                </div>
                <span class="src-info">Estimación Geométrica</span>
              </div>
            </div>
          </div>
          
          <div class="no-click-info" v-else>
            <i class="pi pi-info-circle"></i>
            <span>Haz clic en el mapa para altitud/pendiente, o dibuja un polígono para mediciones detalladas.</span>
          </div>
        </div>

        <!-- Drawn Zone Topographic Measurements -->
        <div class="relief-section drawn-metrics-section animate-fade-in" v-if="drawnZoneMetrics" style="background: rgba(139, 92, 246, 0.05); border: 1px solid rgba(139, 92, 246, 0.15); border-radius: 12px; padding: 0.85rem; margin-bottom: 1.25rem;">
          <h3 style="color: #c084fc; margin-bottom: 0.5rem;"><i class="pi pi-chart-bar" style="color: #c084fc; margin-right: 0.3rem;"></i>Mediciones de Área</h3>
          <div class="clicked-info-box" style="display: flex; flex-direction: column; gap: 0.5rem; background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 0.65rem;">
            <div class="metric-row" style="display: flex; justify-content: space-between; gap: 0.5rem;">
              <div class="metric-col" style="flex: 1; display: flex; flex-direction: column;">
                <span class="lbl" style="font-size: 0.65rem; color: var(--text-muted-dark); text-transform: uppercase;">Área</span>
                <span class="val" style="font-size: 0.85rem; font-weight: 800; color: var(--text-main-dark);">{{ Math.round(drawnZoneMetrics.area).toLocaleString() }} m²</span>
              </div>
              <div class="metric-col" style="flex: 1; display: flex; flex-direction: column;">
                <span class="lbl" style="font-size: 0.65rem; color: var(--text-muted-dark); text-transform: uppercase;">Perímetro</span>
                <span class="val" style="font-size: 0.85rem; font-weight: 800; color: var(--text-main-dark);">{{ Math.round(drawnZoneMetrics.perimeter).toLocaleString() }} m</span>
              </div>
            </div>
            <div class="metric-row" style="display: flex; justify-content: space-between; gap: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 0.4rem;">
              <div class="metric-col" style="flex: 1; display: flex; flex-direction: column;">
                <span class="lbl" style="font-size: 0.65rem; color: var(--text-muted-dark); text-transform: uppercase;">Altitud Media</span>
                <span class="val" style="font-size: 0.85rem; font-weight: 800; color: var(--text-main-dark);">{{ drawnZoneMetrics.avgElevation !== null ? drawnZoneMetrics.avgElevation.toLocaleString() + ' m' : '---' }}</span>
              </div>
              <div class="metric-col" style="flex: 1; display: flex; flex-direction: column;">
                <span class="lbl" style="font-size: 0.65rem; color: var(--text-muted-dark); text-transform: uppercase;">Pendiente Máx</span>
                <span class="val" style="font-size: 0.85rem; font-weight: 800; color: var(--text-main-dark);">{{ drawnZoneMetrics.maxSlope !== null ? drawnZoneMetrics.maxSlope + ' %' : '---' }}</span>
              </div>
            </div>
            <div class="metric-row" style="display: flex; justify-content: space-between; gap: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 0.4rem;">
              <div class="metric-col" style="flex: 1; display: flex; flex-direction: column;">
                <span class="lbl" style="font-size: 0.65rem; color: var(--text-muted-dark); text-transform: uppercase;">Rango Elevación</span>
                <span class="val" style="font-size: 0.72rem; font-weight: 700; color: var(--text-main-dark);">{{ drawnZoneMetrics.minElevation }}m - {{ drawnZoneMetrics.maxElevation }}m</span>
              </div>
              <div class="metric-col" style="flex: 1; display: flex; flex-direction: column;">
                <span class="lbl" style="font-size: 0.65rem; color: var(--text-muted-dark); text-transform: uppercase;">Pendiente Med</span>
                <span class="val" style="font-size: 0.85rem; font-weight: 800; color: var(--text-main-dark);">{{ drawnZoneMetrics.avgSlope !== null ? drawnZoneMetrics.avgSlope + ' %' : '---' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- DXF Uploader & CAD loader -->
        <div class="cad-section">
          <h3>Planos CAD (DWG / DXF)</h3>
          <p class="section-desc">Opcional. Carga planos para evaluar si la obra es viable. Si no cargas ninguno, la IA estimará una estructura residencial estándar.</p>
          
          <input 
            type="file" 
            ref="dxfInputRef" 
            @change="handleFileChange" 
            accept=".dxf" 
            style="display: none;"
          />
          
          <div class="button-grid">
            <Button 
              label="Importar DXF" 
              icon="pi pi-file-import" 
              class="p-button-outlined p-button-sm flex-1"
              @click="triggerFileInput"
            />
            <Button 
              label="Planos Mock" 
              icon="pi pi-eye" 
              class="p-button-outlined p-button-sm flex-1"
              @click="emit('mockCadClick')"
            />
          </div>

          <!-- CAD Status badge -->
          <div class="cad-status" v-if="hasCadOverlay">
            <span class="status-indicator animate-pulse"></span>
            <span class="status-info">
              {{ loadedDxfEntitiesCount > 0 ? `Cargado: ${loadedDxfEntitiesCount} líneas` : 'Simulación CAD activa' }}
            </span>
            <button class="clear-cad-btn" @click="emit('clearCadClick')" title="Remover Capas">
              <i class="pi pi-trash"></i>
            </button>
          </div>
        </div>

        <!-- Air Quality Panel (AQICN) -->
        <div class="aqi-section">
          <div class="aqi-header">
            <span>Calidad del Aire (AQICN)</span>
            <span class="aqi-badge" :style="{ backgroundColor: aqiStatus.color }">{{ aqiValue }} AQI</span>
          </div>
          <div class="aqi-body">
            <div class="aqi-level-text">Estado: <strong :style="{ color: aqiStatus.color }">{{ aqiStatus.label }}</strong></div>
            <p class="aqi-advice" v-if="aqiValue <= 50">Seguridad laboral óptima. Condiciones perfectas para trabajos de campo.</p>
            <p class="aqi-advice" v-else-if="aqiValue <= 100">Condiciones normales. Cuidado con partículas finas si hay viento fuerte.</p>
            <p class="aqi-advice" v-else>Alerta de partículas en suspensión. Se recomienda el uso de mascarillas en obras exteriores.</p>
          </div>
        </div>

      </div>

      <!-- TAB 2: AGENTE IA (Topo-Agent trigger and output report) -->
      <div v-if="activeMainTab === 'agente'" class="tab-pane-container animate-fade-in">
        
        <div class="agent-section agent-active-glow">
          <div class="agent-title-row">
            <div class="agent-pulse-sparkle">
              <i class="pi pi-sparkles agent-icon"></i>
            </div>
            <h3>Topo-Agent (IA)</h3>
            <span v-if="agentResponse" class="ai-online-badge">Online</span>
          </div>
          <p class="section-desc">Análisis geotécnico, prevención de riesgos y recomendaciones de confort térmico / HVAC.</p>
          
          <div v-if="!lastClickedCoords && !drawnZoneMetrics" class="agent-empty-state">
            <i class="pi pi-bolt text-purple-400 text-lg"></i>
            <span>Selecciona o dibuja un terreno en el mapa para iniciar el análisis del agente.</span>
          </div>

          <div v-else class="agent-interactive-box">
            <Button 
              v-if="!agentResponse && !loadingAgent"
              label="Iniciar Análisis de Terreno" 
              icon="pi pi-bolt" 
              class="p-button-primary w-full agent-run-btn"
              @click="emit('runAgentAnalysis')"
            />

            <!-- Loading state -->
            <div v-if="loadingAgent" class="agent-loading-box">
              <div class="loader-visual-container">
                <i class="pi pi-spin pi-cog loading-cog-icon"></i>
                <div class="glowing-ring"></div>
              </div>
              <span class="loading-text">Llamando a n8n y OpenAI...</span>
              <div class="loading-progress-bar">
                <div class="progress-bar-fill"></div>
              </div>
              <span class="loading-subtext">Procesando curvas de nivel, hidrología y confort térmico</span>
            </div>

            <!-- Response display -->
            <div v-if="agentResponse && !loadingAgent" class="agent-results-box animate-slide-up">
              
              <!-- Executive conclusion -->
              <div class="executive-conclusion-box">
                <div class="conclusion-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                  <span class="conclusion-title"><i class="pi pi-info-circle text-purple-400"></i> Recomendación Principal:</span>
                  <span v-if="agentResponse?.conclusion_para_agente_principal" class="viabilidad-obra-badge" :class="viabilidadObraClass">
                    <i class="pi" :class="viabilidadObraClass === 'viable-ok' ? 'pi-check-circle' : viabilidadObraClass === 'viable-cond' ? 'pi-exclamation-circle' : 'pi-times-circle'"></i>
                    <span>{{ viabilidadObraLabel }}</span>
                  </span>
                </div>
                <p class="conclusion-desc">{{ agentResponse?.conclusion_para_agente_principal }}</p>
              </div>

              <!-- Tabs selector -->
              <div class="agent-tabs">
                <button 
                  :class="{ active: activeAgentSection === 'topo' }" 
                  @click="activeAgentSection = 'topo'"
                  title="Topografía"
                >
                  Topografía
                </button>
                <button 
                  :class="{ active: activeAgentSection === 'riesgos' }" 
                  @click="activeAgentSection = 'riesgos'"
                  title="Riesgos"
                >
                  Riesgos
                </button>
                <button 
                  :class="{ active: activeAgentSection === 'normativa' }" 
                  @click="activeAgentSection = 'normativa'"
                  title="Norma"
                >
                  Normas
                </button>
                <button 
                  :class="{ active: activeAgentSection === 'termico' }" 
                  @click="activeAgentSection = 'termico'"
                  title="Térmico"
                >
                  Térmico
                </button>
                <button 
                  :class="{ active: activeAgentSection === 'cotejo' }" 
                  @click="activeAgentSection = 'cotejo'"
                  :title="hasCadOverlay ? 'Cotejo CAD' : 'Estimación Obra'"
                >
                  {{ hasCadOverlay ? 'Cotejo CAD' : 'Estimación Obra' }}
                </button>
              </div>

              <!-- Tab Contents -->
              <div class="tab-content-panel">
                <!-- TOPOGRAPHY TAB -->
                <div v-if="activeAgentSection === 'topo'" class="agent-tab-pane animate-fade-in">
                  <span class="pane-title"><i class="pi pi-compass pane-icon"></i> Pendientes y Relieve</span>
                  <p class="pane-desc">{{ agentResponse?.analisis_topografico?.pendientes_y_curvas }}</p>
                  
                  <span class="pane-title"><i class="pi pi-ban pane-icon text-amber-500"></i> Limitantes Físicas</span>
                  <ul class="pane-list">
                    <li v-for="(limit, idx) in (agentResponse?.analisis_topografico?.limitantes_fisicas || [])" :key="idx" class="pane-list-item">
                      <i class="pi pi-exclamation-triangle text-amber-500 list-icon"></i>
                      <span>{{ limit }}</span>
                    </li>
                  </ul>
                </div>

                <!-- RISKS TAB -->
                <div v-if="activeAgentSection === 'riesgos'" class="agent-tab-pane animate-fade-in">
                  <span class="pane-title"><i class="pi pi-cloud-rain pane-icon"></i> Vulnerabilidad Hidrológica</span>
                  <div class="risk-indicator-badge" :class="riskLevelClass">
                    <i class="pi pi-info-circle"></i>
                    <span>{{ agentResponse?.riesgos_ambientales?.vulnerabilidad_hidrologica }}</span>
                  </div>
                  
                  <span class="pane-title"><i class="pi pi-shield pane-icon text-emerald-400"></i> Medidas de Mitigación</span>
                  <ul class="pane-list">
                    <li v-for="(mitig, idx) in (agentResponse?.riesgos_ambientales?.medidas_mitigacion || [])" :key="idx" class="pane-list-item">
                      <i class="pi pi-check-circle text-emerald-400 list-icon"></i>
                      <span>{{ mitig }}</span>
                    </li>
                  </ul>
                </div>

                <!-- NORMATIVE TAB -->
                <div v-if="activeAgentSection === 'normativa'" class="agent-tab-pane animate-fade-in">
                  <span class="pane-title"><i class="pi pi-folder-open pane-icon"></i> Linderos y Servidumbres</span>
                  <p class="pane-desc">{{ agentResponse?.viabilidad_normativa?.restricciones_linderos }}</p>
                  
                  <span class="pane-title"><i class="pi pi-file-edit pane-icon"></i> Reglamentos Municipales</span>
                  <div class="regulatory-badge" :class="regulatoryClass">
                    <i class="pi" :class="regulatoryClass === 'badge-ok' ? 'pi-check-circle' : regulatoryClass === 'badge-danger' ? 'pi-times-circle' : 'pi-exclamation-circle'"></i>
                    <span>{{ agentResponse?.viabilidad_normativa?.cumplimiento_reglamentos }}</span>
                  </div>
                </div>

                <!-- HVAC/CLIMATE TAB -->
                <div v-if="activeAgentSection === 'termico'" class="agent-tab-pane animate-fade-in">
                  <div class="thermal-card">
                    <span class="pane-title"><i class="pi pi-sun pane-icon text-orange-400"></i> Clima & Estaciones</span>
                    <p class="pane-desc font-semibold">{{ agentResponse?.analisis_termico_clima?.comportamiento_temperatura_estaciones }}</p>
                  </div>
                  
                  <div class="thermal-card hvac-integration">
                    <span class="pane-title"><i class="pi pi-cog pane-icon text-sky-400"></i> Integración HVAC</span>
                    <p class="pane-desc">{{ agentResponse?.analisis_termico_clima?.necesidades_calefaccion_refrigeracion }}</p>
                  </div>
                  
                  <span class="pane-title"><i class="pi pi-sliders-v pane-icon text-orange-300"></i> Estrategias Pasivas</span>
                  <ul class="pane-list">
                    <li v-for="(rec, idx) in (agentResponse?.analisis_termico_clima?.recomendaciones_diseno_termico || [])" :key="idx" class="pane-list-item">
                      <i class="pi pi-info-circle text-orange-400 list-icon"></i>
                      <span>{{ rec }}</span>
                    </li>
                  </ul>
                </div>

                <!-- COTEJO CAD TAB -->
                <div v-if="activeAgentSection === 'cotejo'" class="agent-tab-pane animate-fade-in">
                  <span class="pane-title"><i class="pi pi-shield pane-icon"></i> {{ hasCadOverlay ? 'Cotejo & Apoyos CAD' : 'Estimación de Estructura' }}</span>
                  <p class="pane-desc">{{ agentResponse?.cotejo_cad_matematico?.analisis_apoyos_columnas }}</p>
                  
                  <span class="pane-title"><i class="pi pi-calculator pane-icon"></i> Cálculos de Ingeniería</span>
                  <p class="pane-desc font-mono" style="font-size: 0.68rem; background: rgba(0,0,0,0.35); padding: 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); white-space: pre-wrap; line-height: 1.35; color: #38bdf8;">{{ agentResponse?.cotejo_cad_matematico?.calculos_ingenieria }}</p>
                  
                  <!-- FS Progress Bar -->
                  <div v-if="parsedFS !== null" class="engineering-scale-wrapper">
                    <div class="scale-header">
                      <span class="scale-title">Factor de Seguridad (FS): <strong>{{ parsedFS }}</strong></span>
                      <span class="scale-status" :class="fsStatusClass">{{ fsStatusLabel }}</span>
                    </div>
                    <div class="progress-track">
                      <div 
                        class="fs-progress-bar" 
                        :class="fsBarClass" 
                        :style="{ width: `${Math.min(100, (parsedFS / 3.0) * 100)}%` }"
                        :title="`Factor de Seguridad: ${parsedFS}. ${fsTooltipText}`"
                      ></div>
                    </div>
                  </div>

                  <!-- Terzaghi Progress Bar -->
                  <div v-if="parsedTerzaghi !== null" class="engineering-scale-wrapper">
                    <div class="scale-header">
                      <span class="scale-title">Capacidad Terzaghi: <strong>{{ parsedTerzaghi }} kPa</strong></span>
                      <span class="scale-status" :class="terzaghiStatusClass">{{ terzaghiStatusLabel }}</span>
                    </div>
                    <div class="progress-track">
                      <div 
                        class="terzaghi-progress-bar" 
                        :class="terzaghiBarClass" 
                        :style="{ width: `${Math.min(100, (parsedTerzaghi / 500.0) * 100)}%` }"
                        :title="`Capacidad Terzaghi: ${parsedTerzaghi} kPa. ${terzaghiTooltipText}`"
                      ></div>
                    </div>
                  </div>

                  <span class="pane-title"><i class="pi pi-verified pane-icon"></i> Veredicto Estructural</span>
                  <div v-if="agentResponse?.cotejo_cad_matematico?.veredicto_estructural" class="regulatory-badge" :class="agentResponse.cotejo_cad_matematico.veredicto_estructural.toLowerCase().includes('aprobado') ? 'badge-ok' : 'badge-danger'">
                    <i class="pi" :class="agentResponse.cotejo_cad_matematico.veredicto_estructural.toLowerCase().includes('aprobado') ? 'pi-check-circle' : 'pi-times-circle'"></i>
                    <span>{{ agentResponse.cotejo_cad_matematico.veredicto_estructural }}</span>
                  </div>
                </div>
              </div>

              <!-- Re-run button -->
              <button class="agent-re-run-btn" @click="emit('runAgentAnalysis')">
                <i class="pi pi-refresh"></i> Re-analizar Terreno
              </button>

            </div>
          </div>
        </div>

      </div>

    </div>
  </aside>
</template>

<style scoped>
.floating-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
}

.panel-header {
  padding: 1.25rem 1.25rem 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-header h2 {
  font-size: 0.95rem;
  font-weight: 800;
  margin: 0;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 0.75px;
}

.panel-body {
  flex-grow: 1;
  overflow-y: auto;
  overflow-x: hidden; /* Fix horizontal overflow tests */
  padding: 0.75rem 1.25rem;
}

/* Semáforo Viabilidad de Obra */
.viabilidad-obra-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.62rem;
  font-weight: 850;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  border: 1px solid transparent;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}
.viabilidad-obra-badge.viable-ok {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.25);
}
.viabilidad-obra-badge.viable-cond {
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
  border-color: rgba(234, 179, 8, 0.25);
}
.viabilidad-obra-badge.viable-danger {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.25);
}

/* Escalas de Ingeniería / Progress Bars */
.engineering-scale-wrapper {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 0.55rem;
}
.scale-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
  font-size: 0.7rem;
}
.scale-title {
  color: var(--text-muted-dark);
}
.scale-title strong {
  color: var(--text-main-dark);
}
.scale-status {
  font-weight: 800;
  font-size: 0.68rem;
  text-transform: uppercase;
}
.progress-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}
.fs-progress-bar, .terzaghi-progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Utility color classes */
.bg-red-500 { background-color: #ef4444 !important; }
.bg-yellow-500 { background-color: #eab308 !important; }
.bg-green-500 { background-color: #10b981 !important; }
.text-red-400 { color: #f87171 !important; }
.text-yellow-400 { color: #facc15 !important; }
.text-green-400 { color: #34d399 !important; }

.panel-body::-webkit-scrollbar {
  width: 4px;
}
.panel-body::-webkit-scrollbar-track {
  background: transparent;
}
.panel-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.panel-body::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.4);
}

/* Tab Navigation Headers */
.main-panel-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px;
  gap: 4px;
}

.main-panel-tabs button {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-muted-dark);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 750;
  padding: 0.5rem 0;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  transition: all 0.2s ease;
}

.main-panel-tabs button:hover {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-main-dark);
}

.main-panel-tabs button.active {
  background: rgba(139, 92, 246, 0.2);
  color: #c084fc;
}

.tab-spinner-indicator {
  font-size: 0.65rem;
}

.tab-notification-dot {
  width: 6px;
  height: 6px;
  background: #c084fc;
  border-radius: 50%;
  box-shadow: 0 0 6px #c084fc;
}

/* Agent Section Styles with Glowing Border */
.agent-section {
  background: rgba(139, 92, 246, 0.03);
  border: 1px solid rgba(139, 92, 246, 0.15);
  border-radius: 14px;
  padding: 1rem;
  margin-bottom: 1.25rem;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.agent-active-glow {
  background: rgba(139, 92, 246, 0.06);
  border-color: rgba(139, 92, 246, 0.4);
  box-shadow: 0 0 15px rgba(139, 92, 246, 0.12);
}

.agent-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.35rem;
}

.agent-pulse-sparkle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: rgba(139, 92, 246, 0.15);
  border-radius: 50%;
  position: relative;
}

.agent-pulse-sparkle::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(139, 92, 246, 0.4);
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.9); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}

.agent-icon {
  color: #c084fc;
  font-size: 0.95rem;
}

.agent-section h3 {
  font-size: 0.85rem;
  font-weight: 800;
  color: #c084fc;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.75px;
}

.ai-online-badge {
  font-size: 0.6rem;
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 1px 6px;
  border-radius: 20px;
  font-weight: 750;
  letter-spacing: 0.25px;
  margin-left: auto;
}

.agent-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  background: rgba(0, 0, 0, 0.15);
  border: 1px dashed rgba(139, 92, 246, 0.25);
  border-radius: 10px;
  font-size: 0.75rem;
  color: var(--text-muted-dark);
}

.agent-run-btn {
  margin-top: 0.5rem;
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%) !important;
  border: none !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
  transition: all 0.2s ease !important;
}

.agent-run-btn:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 6px 18px rgba(139, 92, 246, 0.45);
}

/* Premium Loading Elements */
.agent-loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 0.5rem;
}

.loader-visual-container {
  position: relative;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.loading-cog-icon {
  font-size: 2.2rem;
  color: #c084fc;
  z-index: 2;
}

.glowing-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #8b5cf6;
  border-bottom-color: #3b82f6;
  animation: spin 1.5s linear infinite;
  z-index: 1;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 0.82rem;
  font-weight: 750;
  color: var(--text-main-dark);
}

.loading-progress-bar {
  width: 80%;
  height: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  margin: 0.75rem 0;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #3b82f6);
  width: 100%;
  animation: progress-slide 2s infinite ease-in-out;
  transform-origin: left;
}

@keyframes progress-slide {
  0% { transform: scaleX(0) translateX(0); }
  50% { transform: scaleX(0.5) translateX(50%); }
  100% { transform: scaleX(0) translateX(200%); }
}

.loading-subtext {
  font-size: 0.65rem;
  color: var(--text-muted-dark);
  opacity: 0.8;
}

/* Beautiful Output Presentation */
.executive-conclusion-box {
  background: rgba(139, 92, 246, 0.08);
  border-left: 3.5px solid #a78bfa;
  padding: 0.65rem;
  border-radius: 6px;
  margin-bottom: 0.85rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
}

.conclusion-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  font-weight: 800;
  color: #c084fc;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}

.conclusion-desc {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--text-main-dark);
  margin: 0.35rem 0 0 0;
}

.agent-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
  margin-bottom: 0.85rem;
}

.agent-tabs button {
  flex: 1;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--text-muted-dark);
  padding: 0.4rem 0;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-tabs button:hover {
  color: var(--text-main-dark);
  background: rgba(255, 255, 255, 0.02);
}

.agent-tabs button.active {
  background: rgba(139, 92, 246, 0.18);
  color: #c084fc;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
}

.tab-content-panel {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255,255,255,0.03);
  border-radius: 10px;
  padding: 0.85rem;
  min-height: 140px;
}

.agent-tab-pane {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.pane-title {
  font-size: 0.68rem;
  font-weight: 850;
  color: #c084fc;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.pane-icon {
  font-size: 0.72rem;
}

.pane-desc {
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-muted-dark);
  margin: 0;
}

.pane-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.pane-list-item {
  display: flex;
  gap: 0.45rem;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-muted-dark);
  background: rgba(255, 255, 255, 0.01);
  padding: 0.4rem;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.02);
}

.list-icon {
  margin-top: 0.1rem;
  font-size: 0.75rem;
  flex-shrink: 0;
}

/* Badge Layouts */
.regulatory-badge, .risk-indicator-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 750;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  line-height: 1.4;
}

.regulatory-badge {
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.2);
  color: #facc15;
}

.regulatory-badge.badge-ok {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.regulatory-badge.badge-danger {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.risk-indicator-badge.risk-low {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.risk-indicator-badge.risk-medium {
  background: rgba(234, 179, 8, 0.08);
  border-color: rgba(234, 179, 8, 0.2);
  color: #facc15;
}

.risk-indicator-badge.risk-high {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

/* Thermal/HVAC Cards */
.thermal-card {
  background: rgba(251, 146, 60, 0.03);
  border: 1px solid rgba(251, 146, 60, 0.1);
  padding: 0.55rem;
  border-radius: 8px;
}

.hvac-integration {
  background: rgba(56, 189, 248, 0.03);
  border-color: rgba(56, 189, 248, 0.1);
}

.agent-re-run-btn {
  width: 100%;
  background: transparent;
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: 8px;
  color: #c084fc;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.5rem;
  margin-top: 0.85rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  transition: all 0.2s ease;
}

.agent-re-run-btn:hover {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.4);
  transform: translateY(-0.5px);
}

/* Custom Micro-Animations */
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

.animate-scale-up {
  animation: scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.animate-slide-up {
  animation: slideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
