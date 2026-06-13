<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  rainfall: number
  temperature: number
  soilType: { name: string; code: string; factor: number }
  soilOptions: { name: string; code: string; factor: number }[]
  simulationRunning: boolean
  // Clouds and Wind properties
  cloudsVisible: boolean
  cloudCoverage: number
  windSpeed: number
  windDirection: number
}>()

const emit = defineEmits<{
  (e: 'update:rainfall', val: number): void
  (e: 'update:temperature', val: number): void
  (e: 'update:soilType', val: { name: string; code: string; factor: number }): void
  (e: 'update:cloudsVisible', val: boolean): void
  (e: 'update:cloudCoverage', val: number): void
  (e: 'update:windSpeed', val: number): void
  (e: 'update:windDirection', val: number): void
  (e: 'toggleSimulation'): void
}>()

const updateRainfall = (e: Event) => {
  const target = e.target as HTMLInputElement
  emit('update:rainfall', parseFloat(target.value))
}

const updateTemperature = (e: Event) => {
  const target = e.target as HTMLInputElement
  emit('update:temperature', parseFloat(target.value))
}

const handleSoilChange = (val: any) => {
  emit('update:soilType', val)
}

// Weather/Climate presets definition
const weatherPresets = [
  {
    name: 'desert',
    label: 'Desierto',
    icon: 'pi pi-sun',
    description: 'Calor extremo, sin lluvia y cielo despejado',
    rainfall: 0,
    temperature: 42,
    cloudsVisible: false,
    cloudCoverage: 10,
    windSpeed: 12,
    windDirection: 90
  },
  {
    name: 'storm',
    label: 'Tormenta',
    icon: 'pi pi-cloud-download',
    description: 'Lluvia intensa con alta densidad de nubes y fuertes vientos',
    rainfall: 80,
    temperature: 14,
    cloudsVisible: true,
    cloudCoverage: 90,
    windSpeed: 75,
    windDirection: 220
  },
  {
    name: 'temperate',
    label: 'Templado',
    icon: 'pi pi-cloud',
    description: 'Clima primaveral moderado con nubes dispersas',
    rainfall: 15,
    temperature: 22,
    cloudsVisible: true,
    cloudCoverage: 30,
    windSpeed: 18,
    windDirection: 45
  },
  {
    name: 'glacial',
    label: 'Glacial',
    icon: 'pi pi-snowflake',
    description: 'Frío bajo cero, viento fuerte y nubosidad espesa',
    rainfall: 40,
    temperature: -5,
    cloudsVisible: true,
    cloudCoverage: 75,
    windSpeed: 40,
    windDirection: 315
  }
]

const selectPreset = (preset: any) => {
  emit('update:rainfall', preset.rainfall)
  emit('update:temperature', preset.temperature)
  emit('update:cloudsVisible', preset.cloudsVisible)
  if (preset.cloudsVisible) {
    emit('update:cloudCoverage', preset.cloudCoverage)
    emit('update:windSpeed', preset.windSpeed)
    emit('update:windDirection', preset.windDirection)
  }
}

// Active preset computation by checking values
const activePreset = computed(() => {
  const match = weatherPresets.find(p => 
    p.rainfall === props.rainfall && 
    p.temperature === props.temperature && 
    p.cloudsVisible === props.cloudsVisible &&
    (!p.cloudsVisible || (
      Math.abs(p.cloudCoverage - props.cloudCoverage) < 5 &&
      Math.abs(p.windSpeed - props.windSpeed) < 5 &&
      Math.abs(p.windDirection - props.windDirection) < 5
    ))
  )
  return match ? match.name : ''
})

const showTerrainSection = ref(true)
const showAtmosphereSection = ref(false)
</script>

<template>
  <aside class="floating-panel left-panel">
    <!-- Pinned Header -->
    <div class="panel-header">
      <i class="pi pi-sliders-h header-icon text-purple"></i>
      <h2>Simulación</h2>
    </div>

    <!-- Scrollable Body Content -->
    <div class="panel-body">
      
      <!-- ACCORDION SECTION 1: CLIMATE & TERRAIN -->
      <div class="accordion-item" :class="{ open: showTerrainSection }">
        <button class="accordion-header" @click="showTerrainSection = !showTerrainSection">
          <span class="accordion-title"><i class="pi pi-globe text-purple"></i> Clima & Suelo</span>
          <i class="pi" :class="showTerrainSection ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
        </button>
        
        <div class="accordion-content" v-show="showTerrainSection">
          <!-- Climate Presets Selector Grid -->
          <div class="control-group" style="margin-top: 0.5rem;">
            <label class="control-sub-label">Preajustes Climáticos</label>
            <div class="presets-grid">
              <button 
                v-for="preset in weatherPresets" 
                :key="preset.name"
                class="preset-btn"
                :class="{ active: activePreset === preset.name }"
                @click="selectPreset(preset)"
                :title="preset.description"
              >
                <i :class="preset.icon + ' preset-icon'"></i>
                <span>{{ preset.label }}</span>
              </button>
            </div>
          </div>

          <div class="control-section-divider"></div>

          <!-- Slider Lluvia (Rainfall) -->
          <div class="control-group">
            <div class="control-label">
              <span>🌧️ Lluvia (Acumulación)</span>
              <span class="badge badge-blue">{{ rainfall }} mm</span>
            </div>
            <input 
              type="range" 
              :value="rainfall" 
              @input="updateRainfall"
              min="0" 
              max="100" 
              class="custom-slider slider-blue"
            />
            <span class="slider-helper">Afecta la estimación del radio de inundación por lluvia.</span>
          </div>

          <!-- Slider Temperatura (Heatmap) -->
          <div class="control-group">
            <div class="control-label">
              <span>🌡️ Temperatura Suelo</span>
              <span class="badge badge-orange">{{ temperature }}°C</span>
            </div>
            <input 
              type="range" 
              :value="temperature" 
              @input="updateTemperature"
              min="-10" 
              max="50" 
              class="custom-slider slider-orange"
            />
            <span class="slider-helper">Modifica la intensidad del mapa de calor térmico.</span>
          </div>

          <!-- Soil Type Select -->
          <div class="control-group">
            <label class="control-sub-label">Tipo de Suelo (Filtración)</label>
            <Select 
              :modelValue="soilType" 
              @update:modelValue="handleSoilChange"
              :options="soilOptions" 
              optionLabel="name" 
              placeholder="Selecciona tipo" 
              class="w-full text-sm font-sans"
            />
            <span class="slider-helper">La arcilla y roca retienen agua; la arena filtra rápido.</span>
          </div>
        </div>
      </div>

      <!-- ACCORDION SECTION 2: ATMOSPHERIC EFFECTS -->
      <div class="accordion-item" :class="{ open: showAtmosphereSection }">
        <button class="accordion-header" @click="showAtmosphereSection = !showAtmosphereSection">
          <span class="accordion-title"><i class="pi pi-cloud text-sky"></i> Atmósfera & Viento</span>
          <i class="pi" :class="showAtmosphereSection ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
        </button>
        
        <div class="accordion-content" v-show="showAtmosphereSection">
          <div class="control-group" style="margin-top: 0.5rem;">
            <div class="flex-row-space-between">
              <span class="control-sub-label" style="margin: 0;">Activar Nubosidad</span>
              <ToggleSwitch 
                :modelValue="cloudsVisible" 
                @update:modelValue="(val: boolean) => emit('update:cloudsVisible', val)" 
              />
            </div>
            <span class="slider-helper">Visualiza nubes físicas en movimiento sobre el mapa.</span>
          </div>

          <div v-if="cloudsVisible" class="clouds-advanced-controls">
            <!-- Slider Nubosidad -->
            <div class="control-group">
              <div class="control-label">
                <span>Densidad de Nubes</span>
                <span class="badge badge-sky">{{ cloudCoverage }}%</span>
              </div>
              <input 
                type="range" 
                :value="cloudCoverage" 
                @input="(e: any) => emit('update:cloudCoverage', parseFloat((e.target as HTMLInputElement).value))"
                min="10" 
                max="100" 
                class="custom-slider slider-sky"
              />
            </div>

            <!-- Slider Velocidad Viento -->
            <div class="control-group">
              <div class="control-label">
                <span>Velocidad Viento</span>
                <span class="badge badge-teal">{{ windSpeed }} km/h</span>
              </div>
              <input 
                type="range" 
                :value="windSpeed" 
                @input="(e: any) => emit('update:windSpeed', parseFloat((e.target as HTMLInputElement).value))"
                min="5" 
                max="120" 
                class="custom-slider slider-teal"
              />
            </div>

            <!-- Slider Dirección Viento -->
            <div class="control-group">
              <div class="control-label">
                <span>Dirección Viento</span>
                <span class="badge badge-teal">{{ windDirection }}°</span>
              </div>
              <input 
                type="range" 
                :value="windDirection" 
                @input="(e: any) => emit('update:windDirection', parseFloat((e.target as HTMLInputElement).value))"
                min="0" 
                max="359" 
                class="custom-slider slider-teal"
              />
              <div class="wind-dir-labels">
                <span>N</span>
                <span>E</span>
                <span>S</span>
                <span>O</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Pinned Footer Actions -->
    <div class="panel-footer">
      <Button 
        :label="simulationRunning ? 'Pausar Simulación' : 'Simulación Dinámica'" 
        :icon="simulationRunning ? 'pi pi-pause-circle' : 'pi pi-play-circle'" 
        :class="simulationRunning ? 'p-button-danger w-full' : 'p-button-primary w-full'"
        @click="emit('toggleSimulation')"
      />
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

.header-icon {
  font-size: 1.1rem;
}

.text-purple {
  color: #c084fc;
}

.panel-body {
  flex-grow: 1;
  overflow-y: auto;
  padding: 0.75rem 1.25rem;
}

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

.panel-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(10px);
}

.control-section-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 1rem 0;
}

.flex-row-space-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.clouds-advanced-controls {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.badge-sky {
  background: rgba(14, 165, 233, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(14, 165, 233, 0.2);
}

.badge-teal {
  background: rgba(20, 184, 166, 0.15);
  color: #2dd4bf;
  border: 1px solid rgba(20, 184, 166, 0.2);
}

.slider-sky::-webkit-slider-runnable-track {
  background: linear-gradient(to right, #38bdf8, #0ea5e9);
}

.slider-teal::-webkit-slider-runnable-track {
  background: linear-gradient(to right, #2dd4bf, #0d9488);
}

.wind-dir-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: var(--text-muted-dark);
  margin-top: 0.25rem;
  padding: 0 0.25rem;
}

/* Accordions styling */
.accordion-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 0.75rem;
  transition: all 0.2s ease;
}

.accordion-item.open {
  border-color: rgba(139, 92, 246, 0.25);
  background: rgba(139, 92, 246, 0.02);
}

.accordion-header {
  width: 100%;
  background: transparent;
  border: none;
  padding: 0.85rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  color: #ffffff;
  transition: background-color 0.2s;
}

.accordion-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.accordion-title {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.accordion-content {
  padding: 0 1rem 1rem 1rem;
}

.control-sub-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #c084fc;
  margin-bottom: 0.5rem;
}

/* Presets styling */
.presets-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.preset-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 0.5rem 0.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.25);
  transform: translateY(-1px);
}

.preset-btn.active {
  background: rgba(139, 92, 246, 0.2) !important;
  border-color: rgba(139, 92, 246, 0.5) !important;
  box-shadow: 0 0 10px rgba(139, 92, 246, 0.25);
}

.preset-btn span {
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--text-muted-dark);
}

.preset-btn:hover span,
.preset-btn.active span {
  color: var(--text-main-dark);
}

.preset-icon {
  font-size: 0.85rem;
  color: #c084fc;
}

.preset-btn.active .preset-icon {
  color: #ffffff;
  filter: drop-shadow(0 0 4px #c084fc);
}
</style>
