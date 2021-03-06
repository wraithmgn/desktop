/** Is the app running in dev mode? */
declare const __DEV__: boolean

/** The OAuth secret the app should use. */
declare const __OAUTH_SECRET__: string | undefined

/** Is the app being built to run on Darwin? */
declare const __DARWIN__: boolean

/** Is the app being built to run on Win32? */
declare const __WIN32__: boolean

/** The environment for which the release was created. */
declare const __RELEASE_ENV__: 'production' | 'beta' | 'test' | 'development'
