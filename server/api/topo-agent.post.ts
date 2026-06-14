import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  // Try test webhook first (if n8n test listener is active in the n8n editor).
  // If not active, n8n responds with 404 immediately.
  const urls = [
    'https://mr3miliano.app.n8n.cloud/webhook-test/topo-agent',
    'https://mr3miliano.app.n8n.cloud/webhook/topo-agent'
  ]

  let lastError: any = null

  for (const url of urls) {
    try {
      console.log(`[Nitro Proxy] Intentando enviar a: ${url}`)
      
      const controller = new AbortController()
      // 90 seconds timeout to prevent hanging if a webhook is frozen
      const timeoutId = setTimeout(() => controller.abort(), 90000)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-KEY': 'topo-secret-api-key-2026-vbc',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        console.log(`[Nitro Proxy] Respuesta exitosa de: ${url}`)
        return data
      } else {
        const text = await response.text()
        console.warn(`[Nitro Proxy] Error ${response.status} de ${url}:`, text)
        lastError = new Error(`Status ${response.status}: ${text}`)
        
        // If it returns 404 (test webhook not registered), immediately continue to the production webhook.
        if (response.status === 404) {
          continue
        }
      }
    } catch (err: any) {
      console.error(`[Nitro Proxy] Falló conexión a ${url}:`, err.message)
      lastError = err
    }
  }

  throw createError({
    statusCode: 502,
    statusMessage: `No se pudo conectar con n8n. Último error: ${lastError ? lastError.message : 'Desconocido'}`
  })
})
