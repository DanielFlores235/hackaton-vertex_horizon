import { defineEventHandler, readBody, createError } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { url } = body

  if (!url) {
    throw createError({
      statusCode: 400,
      statusMessage: "Falta el parámetro 'url'."
    })
  }

  try {
    let currentUrl = url
    // Follow redirects up to 5 hops
    for (let i = 0; i < 5; i++) {
      const response = await fetch(currentUrl, { method: 'HEAD', redirect: 'manual' })
      const location = response.headers.get('location')
      if (location) {
        if (location.startsWith('/')) {
          const parsed = new URL(currentUrl)
          currentUrl = parsed.origin + location
        } else {
          currentUrl = location
        }
      } else {
        break
      }
    }

    return {
      success: true,
      redirectUrl: currentUrl
    }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      statusMessage: "Error al resolver redirección: " + err.message
    })
  }
})
