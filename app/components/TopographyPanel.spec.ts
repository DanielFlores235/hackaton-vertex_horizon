import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TopographyPanel from './TopographyPanel.vue'

// Helper to create mocked agentResponse
function createMockAgentResponse(overrides = {}) {
  return {
    conclusion_para_agente_principal: "El terreno es viable para la cimentación residencial con precauciones menores.",
    analisis_topografico: {
      pendientes_y_curvas: "El relieve es plano con pendiente promedio de 3.5%.",
      limitantes_fisicas: ["Presencia de talud menor en lindero norte"]
    },
    riesgos_ambientales: {
      vulnerabilidad_hidrologica: "Bajo",
      medidas_mitigacion: ["Zanja de escurrimiento pluvial"]
    },
    viabilidad_normativa: {
      restricciones_linderos: "Ninguna restricción de linderos observada.",
      cumplimiento_reglamentos: "Aprobado"
    },
    analisis_termico_clima: {
      comportamiento_temperatura_estaciones: "Templado, promedio 22C.",
      necesidades_calefaccion_refrigeracion: "HVAC no crítico, estrategias pasivas suficientes.",
      recomendaciones_diseno_termico: ["Aislamiento estándar"]
    },
    cotejo_cad_matematico: {
      analisis_apoyos_columnas: "Columnas alineadas.",
      calculos_ingenieria: "FS = 2.8\nTerzaghi q_ult = 320 kPa",
      veredicto_estructural: "Aprobado"
    },
    ...overrides
  }
}

// Default props helper
function createDefaultProps(overrides = {}) {
  return {
    lastClickedCoords: [19.4326, -99.1332] as [number, number],
    currentElevation: 2240,
    currentSlope: 5,
    loadingElevation: false,
    aqiValue: 42,
    aqiStatus: { label: 'Excelente', color: '#10b981', class: 'aqi-good' },
    loadedDxfEntitiesCount: 0,
    hasCadOverlay: false,
    loadingAgent: false,
    agentResponse: null,
    drawnZoneMetrics: null,
    activeTab: 'terreno' as 'terreno' | 'agente',
    ...overrides
  }
}

describe('TopographyPanel Component Tests', () => {
  
  // TIER 1: FEATURE COVERAGE (>=25 Test Cases)
  describe('Tier 1: Feature Coverage', () => {
    
    it('1. should not render risk semaphores when agentResponse is null', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: null, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box').exists()).toBe(false)
      expect(wrapper.find('.viabilidad-obra-badge').exists()).toBe(false)
    })

    it('2. should render risk semaphore for Vulnerabilidad Hidrológica when agentResponse is present', () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      // Switch active section to riesgos
      const tabContent = wrapper.find('.tab-content-panel')
      expect(tabContent.exists()).toBe(true)
    })

    it('3. should color-code Vulnerabilidad Hidrológica as Green (risk-low) for low risk', async () => {
      const response = createMockAgentResponse({
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Bajo riesgo de inundación",
          medidas_mitigacion: []
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      // Force tab section update to riesgos
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      const badge = wrapper.find('.risk-indicator-badge')
      expect(badge.classes()).toContain('risk-low')
    })

    it('4. should color-code Vulnerabilidad Hidrológica as Yellow (risk-medium) for moderate risk', async () => {
      const response = createMockAgentResponse({
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Riesgo Moderado",
          medidas_mitigacion: []
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      const badge = wrapper.find('.risk-indicator-badge')
      expect(badge.classes()).toContain('risk-medium')
    })

    it('5. should color-code Vulnerabilidad Hidrológica as Red (risk-high) for high risk', async () => {
      const response = createMockAgentResponse({
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Alto riesgo",
          medidas_mitigacion: []
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      const badge = wrapper.find('.risk-indicator-badge')
      expect(badge.classes()).toContain('risk-high')
    })

    it('6. should render risk semaphore for Veredicto Estructural in engineering tab', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      const veredictoBadge = wrapper.find('.tab-content-panel .regulatory-badge')
      expect(veredictoBadge.exists()).toBe(true)
    })

    it('7. should color-code Veredicto Estructural as Green (badge-ok) when Approved', async () => {
      const response = createMockAgentResponse({
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Ok",
          calculos_ingenieria: "FS = 2.5",
          veredicto_estructural: "Aprobado para construcción"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      const badge = wrapper.find('.tab-content-panel .regulatory-badge')
      expect(badge.classes()).toContain('badge-ok')
    })

    it('8. should color-code Veredicto Estructural as Red (badge-danger) when Rejected', async () => {
      const response = createMockAgentResponse({
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Mala distribución",
          calculos_ingenieria: "FS = 0.9",
          veredicto_estructural: "Rechazado por inestabilidad de talud"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      const badge = wrapper.find('.tab-content-panel .regulatory-badge')
      expect(badge.classes()).toContain('badge-danger')
    })

    it('9. should render risk semaphore for Viabilidad de Obra in the improved UI', () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      // This is expected to fail on the unimproved UI because the viabilidad-obra-badge class is not yet implemented.
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.exists()).toBe(true)
    })

    it('10. should color-code Viabilidad de Obra as Green (viable) for positive response', () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Totalmente Viable. Proceder con cimentación estándar."
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      // Expected to fail on unimproved UI
      expect(viabilidadBadge.classes()).toContain('viable-ok')
    })

    it('11. should color-code Viabilidad de Obra as Yellow (condicionado) for moderate warnings', () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Viabilidad Condicionada a la instalación de drenes."
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      // Expected to fail on unimproved UI
      expect(viabilidadBadge.classes()).toContain('viable-cond')
    })

    it('12. should color-code Viabilidad de Obra as Red (rechazado) for unsafe warnings', () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "No Viable. Riesgo inminente de colapso de talud."
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      // Expected to fail on unimproved UI
      expect(viabilidadBadge.classes()).toContain('viable-danger')
    })

    it('13. should display slope data card with correct slope percentage in terrain tab', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentSlope: 12 }),
        global: { stubs: { Button: true } }
      })
      const values = wrapper.findAll('.val')
      const texts = values.map(v => v.text())
      expect(texts).toContain('12 %')
    })

    it('14. should display elevation values in data card', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentElevation: 1950 }),
        global: { stubs: { Button: true } }
      })
      const values = wrapper.findAll('.val')
      const texts = values.map(v => v.text())
      expect(texts).toContain('1950 m')
    })

    it('15. should display boundaries and area metrics in data card when drawnZoneMetrics is active', () => {
      const metrics = {
        area: 450,
        perimeter: 90,
        avgElevation: 2242,
        maxSlope: 15,
        minElevation: 2238,
        maxElevation: 2246,
        avgSlope: 6
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ drawnZoneMetrics: metrics }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.text()).toContain('450 m²')
      expect(wrapper.text()).toContain('90 m')
      expect(wrapper.text()).toContain('2,242 m')
    })

    it('16. should display climate and station behaviour under thermal tab', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'termico' })
      expect(wrapper.text()).toContain("Templado, promedio 22C.")
    })

    it('17. should display HVAC integration details under thermal tab', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'termico' })
      expect(wrapper.text()).toContain("HVAC no crítico, estrategias pasivas suficientes.")
    })

    it('18. should render PrimeIcons in data cards', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps(),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.pi-compass').exists()).toBe(true)
    })

    it('19. should render engineering progress scale/bar for Factor of Safety (FS)', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      // Expected to fail initially as the progress scale graphic is not in the original code
      const fsProgressBar = wrapper.find('.fs-progress-bar')
      expect(fsProgressBar.exists()).toBe(true)
    })

    it('20. should render engineering progress scale/bar for Terzaghi calculations', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      // Expected to fail initially
      const terzaghiProgressBar = wrapper.find('.terzaghi-progress-bar')
      expect(terzaghiProgressBar.exists()).toBe(true)
    })

    it('21. should have contextual tooltip for FS progress scale', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      // Tooltip could be PrimeVue tooltip v-tooltip or simple title attribute on progress bar
      const fsProgressBar = wrapper.find('.fs-progress-bar')
      // Expected to fail initially
      expect(fsProgressBar.attributes('title') || fsProgressBar.attributes('data-tooltip')).toBeDefined()
    })

    it('22. should have contextual tooltip for Terzaghi scale', async () => {
      const response = createMockAgentResponse()
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      const terzaghiProgressBar = wrapper.find('.terzaghi-progress-bar')
      // Expected to fail initially
      expect(terzaghiProgressBar.attributes('title') || terzaghiProgressBar.attributes('data-tooltip')).toBeDefined()
    })

    it('23. should apply flexbox layout classes on floating-panel', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps(),
        global: { stubs: { Button: true } }
      })
      const panel = wrapper.find('.floating-panel')
      expect(panel.exists()).toBe(true)
      // Check for flex style directly
      expect((panel.element as HTMLElement).style.display).toBe('flex')
    })

    it('24. should keep panel-header fixed (outside scrolling body)', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps(),
        global: { stubs: { Button: true } }
      })
      const header = wrapper.find('.panel-header')
      const body = wrapper.find('.panel-body')
      expect(header.element.nextElementSibling).not.toBe(body.element) // Tabs are in between, but body is separate from header
      expect(body.element.contains(header.element)).toBe(false)
    })

    it('25. should enable internal vertical scrolling on panel-body', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps(),
        global: { stubs: { Button: true } }
      })
      const body = wrapper.find('.panel-body')
      // Verify styling for overflow-y
      const overflowY = (body.element as HTMLElement).style.overflowY
      expect(overflowY === 'auto' || overflowY === 'scroll').toBe(true)
    })

    it('26. should prevent horizontal overflow on panel-body', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps(),
        global: { stubs: { Button: true } }
      })
      const body = wrapper.find('.panel-body')
      // Expected to have overflow-x: hidden
      const overflowX = (body.element as HTMLElement).style.overflowX
      expect(overflowX).toBe('hidden')
    })
  })

  // TIER 2: BOUNDARY & CORNER CASES (>=25 Test Cases)
  describe('Tier 2: Boundary & Corner Cases', () => {
    
    it('27. should handle altitude of exactly 0m', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentElevation: 0 }),
        global: { stubs: { Button: true } }
      })
      const vals = wrapper.findAll('.val').map(v => v.text())
      expect(vals).toContain('0 m')
    })

    it('28. should handle negative altitude (below sea level)', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentElevation: -15 }),
        global: { stubs: { Button: true } }
      })
      const vals = wrapper.findAll('.val').map(v => v.text())
      expect(vals).toContain('-15 m')
    })

    it('29. should handle extremely high altitude', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentElevation: 8848 }),
        global: { stubs: { Button: true } }
      })
      const vals = wrapper.findAll('.val').map(v => v.text())
      expect(vals).toContain('8848 m')
    })

    it('30. should handle slope of exactly 0%', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentSlope: 0 }),
        global: { stubs: { Button: true } }
      })
      const vals = wrapper.findAll('.val').map(v => v.text())
      expect(vals).toContain('0 %')
    })

    it('31. should handle negative slope values gracefully (e.g. 0% fallback)', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentSlope: -5 }),
        global: { stubs: { Button: true } }
      })
      // Component should display 0 % or clean text
      const text = wrapper.text()
      expect(text).toContain('0 %')
    })

    it('32. should handle extremely steep slope (e.g. 100%)', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ currentSlope: 100 }),
        global: { stubs: { Button: true } }
      })
      const vals = wrapper.findAll('.val').map(v => v.text())
      expect(vals).toContain('100 %')
    })

    it('33. should handle extremely small area (1m2)', () => {
      const metrics = {
        area: 1,
        perimeter: 4,
        avgElevation: 100,
        maxSlope: 1,
        minElevation: 100,
        maxElevation: 100,
        avgSlope: 1
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ drawnZoneMetrics: metrics }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.text()).toContain('1 m²')
    })

    it('34. should handle extremely large area', () => {
      const metrics = {
        area: 12500850,
        perimeter: 15400,
        avgElevation: 500,
        maxSlope: 22,
        minElevation: 450,
        maxElevation: 550,
        avgSlope: 8
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ drawnZoneMetrics: metrics }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.text()).toContain('12,500,850 m²')
    })

    it('35. should handle zero perimeter', () => {
      const metrics = {
        area: 0,
        perimeter: 0,
        avgElevation: 0,
        maxSlope: 0,
        minElevation: 0,
        maxElevation: 0,
        avgSlope: 0
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ drawnZoneMetrics: metrics }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.text()).toContain('0 m²')
      expect(wrapper.text()).toContain('0 m')
    })

    it('36. should handle extremely large perimeter', () => {
      const metrics = {
        area: 50000,
        perimeter: 1200500,
        avgElevation: 100,
        maxSlope: 5,
        minElevation: 90,
        maxElevation: 110,
        avgSlope: 2
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ drawnZoneMetrics: metrics }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.text()).toContain('1,200,500 m')
    })

    it('37. should handle null or empty climate recommendations', async () => {
      const response = createMockAgentResponse({
        analisis_termico_clima: {
          comportamiento_temperatura_estaciones: "Frío",
          necesidades_calefaccion_refrigeracion: "Calefacción requerida",
          recomendaciones_diseno_termico: []
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'termico' })
      const listItems = wrapper.findAll('.pane-list-item')
      expect(listItems.length).toBe(0)
    })

    it('38. should handle empty physical limits list', async () => {
      const response = createMockAgentResponse({
        analisis_topografico: {
          pendientes_y_curvas: "Plano",
          limitantes_fisicas: []
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'topo' })
      const listItems = wrapper.findAll('.pane-list-item')
      expect(listItems.length).toBe(0)
    })

    it('39. should handle empty mitigation measures list', async () => {
      const response = createMockAgentResponse({
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Baja",
          medidas_mitigacion: []
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      const listItems = wrapper.findAll('.pane-list-item')
      expect(listItems.length).toBe(0)
    })

    it('40. should handle invalid or partial agent response structures gracefully', () => {
      const partialResponse = {
        conclusion_para_agente_principal: "Datos incompletos"
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: partialResponse, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box').text()).toContain("Datos incompletos")
    })

    it('41. should handle FS value of exactly 1.0 (boundary)', async () => {
      const response = createMockAgentResponse({
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas inestables",
          calculos_ingenieria: "FS = 1.0 (Límite de falla)",
          veredicto_estructural: "Rechazado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("FS = 1.0")
    })

    it('42. should handle extremely high FS value (highly stable)', async () => {
      const response = createMockAgentResponse({
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas estables",
          calculos_ingenieria: "FS = 15.4 (Sobrediseño)",
          veredicto_estructural: "Aprobado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("FS = 15.4")
    })

    it('43. should handle extremely low FS value (below 1.0)', async () => {
      const response = createMockAgentResponse({
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Deslave inminente",
          calculos_ingenieria: "FS = 0.45",
          veredicto_estructural: "Rechazado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("FS = 0.45")
    })

    it('44. should handle Terzaghi capacity output with extreme load values', async () => {
      const response = createMockAgentResponse({
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Carga pesada",
          calculos_ingenieria: "Terzaghi q_ult = 12500 kPa",
          veredicto_estructural: "Aprobado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("Terzaghi q_ult = 12500 kPa")
    })

    it('45. should handle long text strings in executive conclusion without breaking layout', () => {
      const longText = "A".repeat(1000)
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: longText
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box p').text()).toBe(longText)
    })

    it('46. should render special Unicode characters in agent responses', () => {
      const unicodeText = "Viabilidad estructurál y topográfica: 🏔️ Cimentación en laderas con sismicidad ⚡."
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: unicodeText
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ agentResponse: response, activeTab: 'agente' }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box p').text()).toBe(unicodeText)
    })

    it('47. should handle zero DXF entity count', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ hasCadOverlay: true, loadedDxfEntitiesCount: 0 }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.cad-status').text()).toContain("Simulación CAD activa")
    })

    it('48. should handle extremely high DXF entity count', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ hasCadOverlay: true, loadedDxfEntitiesCount: 995420 }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.cad-status').text()).toContain("Cargado: 995420 líneas")
    })

    it('49. should handle null lastClickedCoords state gracefully', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ lastClickedCoords: null }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.no-click-info').exists()).toBe(true)
    })

    it('50. should handle null drawnZoneMetrics state gracefully', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({ drawnZoneMetrics: null }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.drawn-metrics-section').exists()).toBe(false)
    })

    it('51. should handle air quality index (AQI) of exactly 0', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          aqiValue: 0,
          aqiStatus: { label: 'Excelente', color: '#10b981', class: 'aqi-good' }
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.aqi-badge').text()).toBe('0 AQI')
    })

    it('52. should handle air quality index (AQI) of 500 (hazardous)', () => {
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          aqiValue: 500,
          aqiStatus: { label: 'Riesgoso', color: '#ef4444', class: 'aqi-bad' }
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.aqi-badge').text()).toBe('500 AQI')
    })
  })

  // TIER 3: CROSS-FEATURE COMBINATIONS (>=5 Test Cases)
  describe('Tier 3: Cross-Feature Combinations', () => {
    
    it('53. should evaluate high slope and high hydro risk showing red badges and rejecting construction', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "No Viable. Peligro extremo.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Alta (Severa inundación pluvial)",
          medidas_mitigacion: ["Reubicar proyecto"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas inestables en pendiente",
          calculos_ingenieria: "FS = 0.82",
          veredicto_estructural: "Rechazado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentSlope: 45,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      // Switch active section to riesgos and then cotejo
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      expect(wrapper.find('.risk-indicator-badge').classes()).toContain('risk-high')
      
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.regulatory-badge').classes()).toContain('badge-danger')
      
      // Expected to fail on unimproved UI due to viabilidad-obra-badge checks
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-danger')
    })

    it('54. should evaluate flat terrain and low hydro risk showing green badges and approving construction', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Totalmente Viable. Proceder con cimentación estándar.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Bajo",
          medidas_mitigacion: ["Limpieza general"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas estables",
          calculos_ingenieria: "FS = 3.2",
          veredicto_estructural: "Aprobado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentSlope: 1,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      expect(wrapper.find('.risk-indicator-badge').classes()).toContain('risk-low')
      
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.regulatory-badge').classes()).toContain('badge-ok')
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-ok')
    })

    it('55. should evaluate gentle slope and high hydro risk showing conditional viability and approved structural veredicto with warning badges', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Viabilidad Condicionada a medidas hidráulicas.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Alta (Desborde de río cercano)",
          medidas_mitigacion: ["Muro de contención e impermeabilización"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas estables",
          calculos_ingenieria: "FS = 2.1",
          veredicto_estructural: "Aprobado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentSlope: 8,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      expect(wrapper.find('.risk-indicator-badge').classes()).toContain('risk-high')
      
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.regulatory-badge').classes()).toContain('badge-ok')
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-cond')
    })

    it('56. should show CAD entity status and drawn zone area concurrently when both are loaded', () => {
      const metrics = {
        area: 1200,
        perimeter: 140,
        avgElevation: 2300,
        maxSlope: 8,
        minElevation: 2295,
        maxElevation: 2305,
        avgSlope: 4
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          hasCadOverlay: true,
          loadedDxfEntitiesCount: 45,
          drawnZoneMetrics: metrics
        }),
        global: { stubs: { Button: true } }
      })
      // Should display metrics area
      expect(wrapper.text()).toContain('1,200 m²')
      // Should display CAD status badge
      expect(wrapper.find('.cad-status').text()).toContain('Cargado: 45 líneas')
    })

    it('57. should show high AQI warning and active drawn metrics together in terrain pane', () => {
      const metrics = {
        area: 750,
        perimeter: 110,
        avgElevation: 2240,
        maxSlope: 5,
        minElevation: 2235,
        maxElevation: 2245,
        avgSlope: 3
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          aqiValue: 154,
          aqiStatus: { label: 'Riesgoso', color: '#ef4444', class: 'aqi-bad' },
          drawnZoneMetrics: metrics
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.aqi-badge').text()).toBe('154 AQI')
      expect(wrapper.find('.aqi-level-text').text()).toContain('Riesgoso')
      expect(wrapper.text()).toContain('750 m²')
    })
  })

  // TIER 4: REAL-WORLD APPLICATION SCENARIOS (>=5 Test Cases)
  describe('Tier 4: Real-World Application Scenarios', () => {
    
    it('58. should simulate residential villa scenario on gentle slope', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Proyecto Viable. La pendiente del 4% y la baja vulnerabilidad pluvial permiten cimentación directa.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Bajo",
          medidas_mitigacion: ["Pendiente pluvial hacia la vialidad"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "5 columnas cargadas en plano CAD alineadas correctamente",
          calculos_ingenieria: "FS = 2.85 (Talud estable)\nCapacidad de carga Terzaghi = 310 kPa (Suelo arcilloso duro)",
          veredicto_estructural: "Aprobado"
        }
      })
      const metrics = {
        area: 450,
        perimeter: 90,
        avgElevation: 2245,
        maxSlope: 6,
        minElevation: 2242,
        maxElevation: 2248,
        avgSlope: 4
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentElevation: 2245,
          currentSlope: 4,
          drawnZoneMetrics: metrics,
          hasCadOverlay: true,
          loadedDxfEntitiesCount: 5,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      // Verify visual elements rendering
      expect(wrapper.find('.executive-conclusion-box').text()).toContain("Proyecto Viable")
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("FS = 2.85")
      expect(wrapper.find('.tab-content-panel').text()).toContain("Terzaghi = 310 kPa")
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-ok')
    })

    it('59. should simulate mountain cabin scenario on steep slope', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Viabilidad Condicionada. Requiere pilotes profundos debido a pendiente de 32% y riesgo de deslizamiento moderado.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Moderada (Escurrimiento lateral)",
          medidas_mitigacion: ["Canaletas perimetrales", "Barreras forestales"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas en talud requieren anclaje especial",
          calculos_ingenieria: "FS = 1.35 (Marginalmente estable)\nCapacidad portante Terzaghi = 180 kPa",
          veredicto_estructural: "Aprobado con condiciones"
        }
      })
      const metrics = {
        area: 250,
        perimeter: 70,
        avgElevation: 2850,
        maxSlope: 35,
        minElevation: 2838,
        maxElevation: 2862,
        avgSlope: 32
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentElevation: 2850,
          currentSlope: 32,
          drawnZoneMetrics: metrics,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box').text()).toContain("Viabilidad Condicionada")
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      expect(wrapper.find('.risk-indicator-badge').classes()).toContain('risk-medium')
      
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("FS = 1.35")
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-cond')
    })

    it('60. should simulate riverfront warehouse scenario with flood risk', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "No Viable. Terreno en zona federal de inundación recurrente.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Alta (Zona de inundación activa de río)",
          medidas_mitigacion: ["No se puede mitigar de forma segura"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Riesgo de socavación de apoyos",
          calculos_ingenieria: "FS = 1.1\nCapacidad portante del limo húmedo = 80 kPa (Insuficiente)",
          veredicto_estructural: "Rechazado"
        }
      })
      const metrics = {
        area: 15000,
        perimeter: 520,
        avgElevation: 12,
        maxSlope: 3,
        minElevation: 10,
        maxElevation: 14,
        avgSlope: 2
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentElevation: 12,
          currentSlope: 2,
          drawnZoneMetrics: metrics,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box').text()).toContain("No Viable")
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      expect(wrapper.find('.risk-indicator-badge').classes()).toContain('risk-high')
      
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.regulatory-badge').classes()).toContain('badge-danger')
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-danger')
    })

    it('61. should simulate urban plot scenario with CAD columns data', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "Proyecto Viable. Lote plano en zona urbanizada estable.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Bajo (Drenaje municipal suficiente)",
          medidas_mitigacion: []
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Columnas C-1 a C-5 cargadas en linderos cumplen restricciones",
          calculos_ingenieria: "FS = 3.5\nCapacidad portante Terzaghi = 290 kPa",
          veredicto_estructural: "Aprobado"
        }
      })
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentElevation: 2240,
          currentSlope: 1,
          hasCadOverlay: true,
          loadedDxfEntitiesCount: 5,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box').text()).toContain("Proyecto Viable")
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.tab-content-panel').text()).toContain("Columnas C-1 a C-5")
      expect(wrapper.find('.tab-content-panel').text()).toContain("FS = 3.5")
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-ok')
    })

    it('62. should simulate volcanic seismic slope development scenario', async () => {
      const response = createMockAgentResponse({
        conclusion_para_agente_principal: "No Viable. Terreno con 46% de pendiente, fallas geológicas activas y sismicidad severa.",
        riesgos_ambientales: {
          vulnerabilidad_hidrologica: "Alta (Deslizamiento de flujos de lodo)",
          medidas_mitigacion: ["Reubicación total requerida"]
        },
        cotejo_cad_matematico: {
          analisis_apoyos_columnas: "Falla por cortante en cimentación",
          calculos_ingenieria: "FS = 0.62 (Inestable)\nCapacidad Terzaghi = 110 kPa (Suelo suelto)",
          veredicto_estructural: "Rechazado"
        }
      })
      const metrics = {
        area: 8900,
        perimeter: 420,
        avgElevation: 3450,
        maxSlope: 52,
        minElevation: 3380,
        maxElevation: 3520,
        avgSlope: 46
      }
      const wrapper = mount(TopographyPanel, {
        props: createDefaultProps({
          currentElevation: 3450,
          currentSlope: 46,
          drawnZoneMetrics: metrics,
          agentResponse: response,
          activeTab: 'agente'
        }),
        global: { stubs: { Button: true } }
      })
      expect(wrapper.find('.executive-conclusion-box').text()).toContain("No Viable")
      await wrapper.setData({ activeAgentSection: 'riesgos' })
      expect(wrapper.find('.risk-indicator-badge').classes()).toContain('risk-high')
      
      await wrapper.setData({ activeAgentSection: 'cotejo' })
      expect(wrapper.find('.regulatory-badge').classes()).toContain('badge-danger')
      
      // Expected to fail on unimproved UI
      const viabilidadBadge = wrapper.find('.viabilidad-obra-badge')
      expect(viabilidadBadge.classes()).toContain('viable-danger')
    })
  })
})
