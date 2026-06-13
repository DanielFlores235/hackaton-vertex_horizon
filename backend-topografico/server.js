const express = require('express');
const cors = require('cors');
const multer = require('multer');
const DxfParser = require('dxf-parser');

const app = express();
const port = 4000;

// Enable CORS for frontend clients (e.g. localhost:3000 or Tauri localhost:1420)
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:1420',
    'http://localhost:3001'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY']
}));

app.use(express.json());

// Set up Multer for handling raw file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

/**
 * 1. POST /api/analisis-terreno
 * Evaluates terrain geometry and simulation parameters to estimate flood risk,
 * thermal impact, and overall construction viability.
 */
app.post('/api/analisis-terreno', async (req, res) => {
  try {
    const { geometria_terreno, parametros_simulacion } = req.body;

    if (!geometria_terreno || !parametros_simulacion) {
      return res.status(400).json({
        success: false,
        error: "Faltan parámetros requeridos: 'geometria_terreno' y 'parametros_simulacion'."
      });
    }

    const { coordenadas, area_m2 } = geometria_terreno;
    const { clima, lluvia_mm, temp_suelo_c, tipo_suelo } = parametros_simulacion;

    // Resolve a fallback base coordinates
    let lat = 19.4326;
    let lng = -99.1332;

    if (Array.isArray(coordenadas)) {
      if (Array.isArray(coordenadas[0])) {
        lat = parseFloat(coordenadas[0][0]) || lat;
        lng = parseFloat(coordenadas[0][1]) || lng;
      } else if (coordenadas.length === 2) {
        lat = parseFloat(coordenadas[0]) || lat;
        lng = parseFloat(coordenadas[1]) || lng;
      }
    }

    const coordsStr = `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° W`;
    const descStr = `Terreno de tipo ${geometria_terreno.tipo || 'Polygon'} con área de ${area_m2 || 150}m². Parámetros climáticos: clima ${clima || 'templado'}, precipitación acumulada de ${lluvia_mm || 0}mm, temperatura de suelo ${temp_suelo_c || 20}°C, suelo clasificado como: ${tipo_suelo || 'limoso'}.`;

    // Forward request to n8n Topo-Agent Webhook
    const n8nResponse = await fetch('https://mr3miliano.app.n8n.cloud/webhook/topo-agent', {
      method: 'POST',
      headers: {
        'X-API-KEY': 'topo-secret-api-key-2026-vbc',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: `session-backend-${Date.now()}`,
        coordenadas: coordsStr,
        descripcion_terreno: descStr,
        planos_2d: 'No se ha proporcionado plano de AutoCAD (es opcional). Realizar la estimación y cálculos estructurales (capacidad de carga Terzaghi, estabilidad de taludes FS) para una residencia estándar unifamiliar típica de 2 niveles (~150 m²) adaptada a este terreno.'
      })
    });

    if (!n8nResponse.ok) {
      throw new Error(`n8n webhook responded with status ${n8nResponse.status}`);
    }

    const responseData = await n8nResponse.json();

    if (!responseData || !responseData.success || !responseData.agent_response) {
      throw new Error(responseData?.error?.message || 'Formato de respuesta de n8n inválido');
    }

    const agent = responseData.agent_response;

    // Parse risk level from vulnerability string
    const vulnHidro = (agent.riesgos_ambientales?.vulnerabilidad_hidrologica || '').toLowerCase();
    let nivelRiesgo = 'bajo';
    if (vulnHidro.includes('alto') || vulnHidro.includes('alta') || vulnHidro.includes('severo')) {
      nivelRiesgo = 'alto';
    } else if (vulnHidro.includes('medio') || vulnHidro.includes('moderada') || vulnHidro.includes('moderado') || vulnHidro.includes('vulnerabilidad')) {
      nivelRiesgo = 'medio';
    }

    // Generate heatmap coordinates around target terrain location using AI's risk levels
    const coordenadas_criticas_heatmap = [
      [lat + 0.00015, lng - 0.0001, nivelRiesgo === 'alto' ? 0.9 : nivelRiesgo === 'medio' ? 0.6 : 0.3],
      [lat - 0.0001, lng + 0.0002, nivelRiesgo === 'alto' ? 0.95 : nivelRiesgo === 'medio' ? 0.7 : 0.25],
      [lat + 0.00025, lng + 0.00015, nivelRiesgo === 'alto' ? 0.85 : nivelRiesgo === 'medio' ? 0.55 : 0.2]
    ];

    const tempVal = parseFloat(temp_suelo_c) || 20;
    const coordenadas_calor_heatmap = [
      [lat - 0.0002, lng - 0.00025, tempVal > 35 ? 0.92 : tempVal > 20 ? 0.65 : 0.3],
      [lat + 0.0001, lng + 0.00012, tempVal > 35 ? 0.88 : tempVal > 20 ? 0.72 : 0.28],
      [lat - 0.00015, lng + 0.00025, tempVal > 35 ? 0.85 : tempVal > 20 ? 0.58 : 0.22]
    ];

    // Build overall viability string mapping AI output
    const viabilidad_obra = `Veredicto Estructural: ${agent.cotejo_cad_matematico?.veredicto_estructural || 'aprobado'}. Normativa: ${agent.viabilidad_normativa?.cumplimiento_reglamentos || 'aprobado'}. Resumen: ${agent.conclusion_para_agente_principal || 'Terreno viable para la obra.'}`;

    res.json({
      riesgo_inundacion: {
        nivel: nivelRiesgo,
        coordenadas_criticas_heatmap,
        justificacion: agent.riesgos_ambientales?.vulnerabilidad_hidrologica || 'Sin información de riesgo.'
      },
      impacto_termico: {
        coordenadas_calor_heatmap
      },
      viabilidad_obra
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Fallo al conectar con el agente IA a través de n8n: " + err.message
    });
  }
});

/**
 * Helper function converting DxfParser JSON structure into valid GeoJSON FeatureCollection
 */
function dxfToGeoJson(dxf) {
  const features = [];
  if (!dxf || !dxf.entities) {
    return { type: "FeatureCollection", features: [] };
  }

  dxf.entities.forEach(entity => {
    try {
      if (entity.type === 'LINE') {
        const p1 = entity.vertices ? [entity.vertices[0].x, entity.vertices[0].y] : (entity.start ? [entity.start.x, entity.start.y] : null);
        const p2 = entity.vertices ? [entity.vertices[1].x, entity.vertices[1].y] : (entity.end ? [entity.end.x, entity.end.y] : null);
        
        if (p1 && p2) {
          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [p1, p2]
            },
            properties: {
              type: 'LINE',
              layer: entity.layer || '0',
              color: entity.color
            }
          });
        }
      } else if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && entity.vertices && entity.vertices.length > 1) {
        const coordinates = entity.vertices.map(v => [v.x, v.y]);
        
        // Match standard loop closure
        if (entity.shape || entity.closed) {
          coordinates.push([entity.vertices[0].x, entity.vertices[0].y]);
        }
        
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          },
          properties: {
            type: entity.type,
            layer: entity.layer || '0',
            color: entity.color
          }
        });
      } else if (entity.type === 'CIRCLE') {
        const center = entity.center ? [entity.center.x, entity.center.y] : [0, 0];
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: center
          },
          properties: {
            type: 'CIRCLE',
            radius: entity.radius || 1,
            layer: entity.layer || '0',
            color: entity.color
          }
        });
      } else if (entity.type === 'POINT') {
        const pos = entity.position ? [entity.position.x, entity.position.y] : [0, 0];
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: pos
          },
          properties: {
            type: 'POINT',
            layer: entity.layer || '0',
            color: entity.color
          }
        });
      }
    } catch (e) {
      console.warn("Skipping DXF entity due to conversion exception:", e.message);
    }
  });

  return {
    type: "FeatureCollection",
    features
  };
}

/**
 * 2. POST /api/procesar-cad
 * Receives a raw DXF file buffer, parses it using dxf-parser, and returns a valid GeoJSON structure.
 */
app.post('/api/procesar-cad', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No se subió ningún archivo. Envía un archivo DXF en el campo 'file'."
      });
    }

    const dxfString = req.file.buffer.toString('utf-8');
    const parser = new DxfParser();
    const dxfParsed = parser.parseSync(dxfString);

    if (!dxfParsed) {
      return res.status(422).json({
        success: false,
        error: "El archivo subido no contiene una estructura DXF válida."
      });
    }

    const geoJson = dxfToGeoJson(dxfParsed);

    res.json(geoJson);

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Fallo al parsear el archivo DXF: " + err.message
    });
  }
});

// Start listening
app.listen(port, () => {
  console.log(`[Topografía-Backend] Servidor activo escuchando en el puerto ${port}`);
});
