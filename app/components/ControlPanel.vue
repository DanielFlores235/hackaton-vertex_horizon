<script setup lang="ts">
import { ref } from 'vue'

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
    icon: 'pi pi-filter-slash',
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
</script>

<template>
  <aside class="floating-panel left-panel glass-panel">
    <div class="panel-header">
      <i class="pi pi-sliders-h header-icon text-purple"></i>
      <h2>Control de Simulación</h2>
    </div>

    <div class="panel-body">
      
      <!-- Climate Presets Selector Grid -->
      <div class="control-group">
        <label class="control-title-label"><i class="pi pi-globe"></i> Preajustes Climáticos</label>
        <div class="presets-grid">
          <button 
            v-for="preset in weatherPresets" 
            :key="preset.name"
            class="preset-btn"
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
          <span><i class="pi pi-cloud-rain"></i> Lluvia (Acumulación)</span>
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
        <span class="slider-helper">Afecta el radio del polígono de inundación (Turf.js).</span>
      </div>

      <!-- Slider Temperatura (Heatmap) -->
      <div class="control-group">
        <div class="control-label">
          <span><i class="pi pi-sun"></i> Temperatura Suelo</span>
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
        <span class="slider-helper">Ajusta la intensidad calórica del mapa térmico (leaflet.heat).</span>
      </div>

      <!-- Soil Type Select -->
      <div class="control-group">
        <label class="control-title-label">Tipo de Suelo (Filtración)</label>
        <Select 
          :modelValue="soilType" 
          @update:modelValue="handleSoilChange"
          :options="soilOptions" 
          optionLabel="name" 
          placeholder="Selecciona tipo" 
          class="w-full text-sm font-sans"
        />
        <span class="slider-helper">Suelos arenosos absorben más; suelos arcillosos y rocosos inundan rápido.</span>
      </div>

      <!-- Cloud & Wind Atmospheric Simulation -->
      <div class="control-section-divider"></div>
      
      <div class="control-group">
        <div class="flex-row-space-between">
          <span class="control-title-label"><i class="pi pi-cloud"></i> Capa de Nubes</span>
          <ToggleSwitch 
            :modelValue="cloudsVisible" 
            @update:modelValue="(val: boolean) => emit('update:cloudsVisible', val)" 
          />
        </div>
        <span class="slider-helper">Activa una simulación visual y física de nubosidad sobre el terreno.</span>
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

      <!-- Simulation triggers -->
      <div class="control-section-divider"></div>
      <div class="action-box">
        <Button 
          :label="simulationRunning ? 'Pausar Simulación' : 'Simulación Dinámica'" 
          :icon="simulationRunning ? 'pi pi-pause-circle' : 'pi pi-play-circle'" 
          :class="simulationRunning ? 'p-button-danger w-full' : 'p-button-primary w-full'"
          @click="emit('toggleSimulation')"
        />
      </div>

    </div>
  </aside>
</template>

<style scoped>
/* Scoped overrides to keep floating panels styles in parent and prevent clashes */
.floating-panel {
  width: 100%;
  position: relative;
  box-shadow: none;
  border: none;
  background: transparent;
  backdrop-filter: none;
  padding: 0;
}

.control-section-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 1.25rem 0;
}

.light-mode .control-section-divider {
  background: rgba(0, 0, 0, 0.08);
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

.preset-btn span {
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--text-muted-dark);
}

.preset-btn:hover span {
  color: var(--text-main-dark);
}

.preset-icon {
  font-size: 0.85rem;
  color: #c084fc;
}

.light-mode .preset-btn {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
}
</style>
