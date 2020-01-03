addEventListener('fetch', event => event.respondWith(handle_request(event)))


const description = (
  "https://proxy.samuelcolvin.workers.dev will proxy a request to the URL specified by the 'upstream' GET parameter. " +
  'Request method, headers and body will be forwarded unchanged if possible. ' +
  'This function will return immediate, but the proxied request will continue for as long as possible, this ' +
  'is useful when you want to fire a webhook to an endpoint which may take a long time to startup and respond.'
)

async function handle_request(event) {
  const params = new URL(event.request.url).searchParams
  const upstream = params.get('upstream')
  if (!upstream) {
    return response({status: 'error', summary: "no 'upstream' get parameter found"}, 400)
  }
  try {
    new URL(upstream)
  } catch (e) {
    return response({status: 'error', summary: 'invalid url', details: e.toString()}, 400)
  }

  const headers = get_headers(event.request)
  const body = await get_body(event.request)
  const method = event.request.method
  event.waitUntil(fetch(upstream, {method, headers, body}))
  // let error = null
  // try {
  //   await fetch(upstream, {method, headers, body})
  // } catch (e) {
  //   error = {string: e.toString(), stack: e.stack}
  //   console.error('error:', e, e.stack)
  // }

  return response({
    status: 'success',
    upstream: {
      url: upstream,
      method,
      headers,
      body_length: body ? body.length : null,
    }
  })
}

function response(data, status = 200) {
  const body = JSON.stringify(Object.assign({description}, data), null, 2) + '\n'
  const init = {headers: {'content-type': 'application/json'}, status}
  return new Response(body, init)
}

const ignored_headers = new Set([
  'accept-encoding', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'connection', 'host',
  'x-forwarded-proto', 'x-real-ip'
])

const get_headers = request => {
  const h = Array.from(request.headers.entries()).filter(h => !ignored_headers.has(h[0]))
  const ip = request.headers.get('x-real-ip')
  h.push(['x-forwarded-for', ip])
  h.push(['x-proxied-ip', ip])
  h.push(['x-proxied-url', request.url])
  return Object.assign(...h.map(([k, v]) => ({[k]: v})))
}

async function get_body (request) {
  if (['GET', 'HEAD'].includes(request.method)) {
    return null
  }
  const reader = request.body && request.body.getReader()
  if (!reader) {
    return null
  }
  const chunks = []

  while (true) {
    const {done, value} = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
  }

  const buffer_view = new Uint8Array(chunks.map(b => b.length).reduce((a, b) => a + b, 0))
  let pos = 0
  for (let b of chunks) {
    buffer_view.set(new Uint8Array(b), pos)
    pos += b.length
  }
  return buffer_view
}
