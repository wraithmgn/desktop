import * as appProxy from '../ui/lib/app-proxy'

import { proxyRequest } from '../ui/main-process-proxy'

/** The HTTP payload returned by Electron's net module */
export interface IHTTPResponse {
  /** The HTTP status code */
  readonly statusCode?: number,
  /** The key-value collection of headers associated with the response */
  readonly headers?: { [key: string]: any; },
  /** The response body */
  readonly body?: string
  /** An error if one occurred. */
  readonly error?: Error
}

/** The HTTP request to map to Electron's net module */
export interface IHTTPRequest {
  /** The resource to access */
  readonly url: string,
  /** The verb associated with the request */
  readonly method: HTTPMethod,
  /** The key-value collection of headers associated with the request */
  readonly headers?: { [key: string]: any; },
  /** The request object to serialize */
  readonly body?: Object
}

/** The HTTP methods available. */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'HEAD'

/** Resolve a given header on the HTTP response */
export function getHeader(response: IHTTPResponse, key: string): string | null {
  if (!response.headers) {
    return null
  }

  const keyUpper = key.toUpperCase()

  for (const k in response.headers) {
    const key = k.toUpperCase()

    if (key === keyUpper) {
      const header = response.headers[k]
      if (header) {
        // `net` module returns an array for each header, so to keep things
        // simple we are currently just returning the first value.
        // Discussion about changing this behaviour to match the Node HTTP API:
        // https://github.com/electron/electron/issues/8117
        const value: string = header[0]
        return value
      }
      return null
    }
  }

  return null
}

/**
 * Deserialize the HTTP response body into an expected object shape
 *
 * Note: this doesn't validate the expected shape, and will only fail
 * if it encounters invalid JSON
 */
export function deserialize<T>(body: string | undefined): T | null {
  if (!body) {
    return null
  }

  try {
    return JSON.parse(body) as T
  } catch (e) {
    console.error('Unable to deserialize JSON string to object', e)
    return null
  }
}

/**
 * Detect the encoding associated with the HTTP response.
 *
 * If not specified in the response headers, null is returned.
 */
export function getContentType(response: IHTTPResponse): string | null {
  const contentType = getHeader(response, 'Content-Type')
  if (!contentType) {
    return null
  }

  // example `Content-Type: text/html; charset=utf-8`
  const tokens = contentType.split(';')
  if (tokens.length > 0) {
    return tokens[0]
  }

  return null
}

/**
 * Detect the character encoding associated with the HTTP response.
 *
 * If not found, for `text/*` or `application/json` assumes `'ISO-8859-1'`.
 * Otherwise returns `null`
 */
export function getEncoding(response: IHTTPResponse): string | null {
  const contentType = getContentType(response)
  if (!contentType) {
    return null
  }

  // example `Content-Type: text/html; charset=utf-8`
  const contentTypeRaw = getHeader(response, 'Content-Type')

  // we've checked above for the existence of this header, but we
  // can't reuse that value here because it strips the optional
  // key-value parameters that we need here to find `charset`
  const tokens = contentTypeRaw!.split(';')

  // in theory there could be multiple `;` values here, but
  // we're really expecting one `;` here to separate the
  // value of `Content-Type` from the optional list of key-value
  // parameters that may be provided afterwards
  if (tokens.length >= 2) {
    for (let i = 1; i < tokens.length; i++) {
      const values = tokens[i].split('=')
      if (values.length === 2 && values[0].trim() === 'charset') {
        return values[1]
      }
    }
  }


  // while we expect JSON endpoints to return a charset, we might
  // have some scenarios where this is not the case
  // see http://www.iana.org/assignments/media-types/application/json
  // for more information
  if (contentType === 'application/json') {
    return 'utf-8'
  }

  // RFC2616 states that text-based media subtypes without an
  // explicit charset should be considered ISO-8859-1
  if (contentType.startsWith('text/')) {
    return 'iso-8859-1'
  }

  return null
}

/**
 * Make an API request.
 *
 * @param endpoint      - The API endpoint.
 * @param authorization - The value to pass in the `Authorization` header.
 * @param method        - The HTTP method.
 * @param path          - The path without a leading /.
 * @param body          - The body to send.
 * @param customHeaders - Any optional additional headers to send.
 */
export function request(endpoint: string, authorization: string | null, method: HTTPMethod, path: string, body?: Object, customHeaders?: Object): Promise<IHTTPResponse> {
  const url = `${endpoint}/${path}`
  const headers: any = Object.assign({}, {
    'Accept': 'application/vnd.github.v3+json, application/json',
    'Content-Type': 'application/json',
    'User-Agent': `${appProxy.getName()}/${appProxy.getVersion()}`,
  }, customHeaders)

  if (authorization) {
    headers['Authorization'] = authorization
  }

  const options = {
    url,
    headers,
    method,
    body,
  }

  return proxyRequest(options)
}
