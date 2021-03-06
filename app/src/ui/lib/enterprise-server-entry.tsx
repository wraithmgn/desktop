import * as React from 'react'
import { getEnterpriseAPIURL, fetchMetadata } from '../../lib/api'
import { Loading } from './loading'
import { validateURL, InvalidURLErrorName, InvalidProtocolErrorName } from './enterprise-validate-url'
import { Form } from './form'
import { TextBox } from './text-box'
import { Button } from './button'
import { Errors } from './errors'

/** The authentication methods server allows. */
export enum AuthenticationMethods {
  /** Basic auth in order to create authorization tokens. */
  BasicAuth,

  /** OAuth web flow. */
  OAuth,
}

interface IEnterpriseServerEntryProps {
  /** Called after the user has entered their Enterprise server address. */
  readonly onContinue: (endpoint: string, authMethods: Set<AuthenticationMethods>) => void

  /** An array of additional buttons to render after the "Continue" button. */
  readonly additionalButtons?: ReadonlyArray<JSX.Element>
}

interface IEnterpriseServerEntryState {
  readonly serverAddress: string

  readonly loading: boolean

  readonly error: Error | null
}

/** An entry form for an Enterprise server address. */
export class EnterpriseServerEntry extends React.Component<IEnterpriseServerEntryProps, IEnterpriseServerEntryState> {
  public constructor(props: IEnterpriseServerEntryProps) {
    super(props)

    this.state = { serverAddress: '', loading: false, error: null }
  }

  public render() {
    const disableEntry = this.state.loading
    const disableSubmission = !this.state.serverAddress.length || this.state.loading
    return (
      <Form onSubmit={this.onSubmit}>
        <TextBox
          label='Enterprise server address'
          autoFocus={true}
          disabled={disableEntry}
          onChange={this.onServerAddressChanged}/>

        <Button type='submit' disabled={disableSubmission}>Continue</Button>

        {this.props.additionalButtons}

        {this.state.loading ? <Loading/> : null}

        {this.state.error ? <Errors>{this.state.error.message}</Errors> : null}
      </Form>
    )
  }

  private onServerAddressChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({
      serverAddress: event.currentTarget.value,
      loading: false,
      error: null,
    })
  }

  private async fetchAllowedAuthenticationMethods(endpoint: string): Promise<Set<AuthenticationMethods>> {
    const response = await fetchMetadata(endpoint)

    if (response) {
      const authMethods = new Set([
        AuthenticationMethods.BasicAuth,
        AuthenticationMethods.OAuth,
      ])

      if (response.verifiable_password_authentication === false) {
        authMethods.delete(AuthenticationMethods.BasicAuth)
      }

      return authMethods
    } else {
      throw new Error('Unsupported Enterprise server')
    }
  }

  private onSubmit = async () => {
    const userEnteredAddress = this.state.serverAddress
    let address: string
    try {
      address = validateURL(this.state.serverAddress)
    } catch (e) {
      let humanFacingError = e
      if (e.name === InvalidURLErrorName) {
        humanFacingError = new Error(`The Enterprise server address doesn't appear to be a valid URL. We're expecting something like https://github.example.com.`)
      } else if (e.name === InvalidProtocolErrorName) {
        humanFacingError = new Error('Unsupported protocol. We can only sign in to GitHub Enterprise instances over http or https.')
      }

      this.setState({
        serverAddress: userEnteredAddress,
        loading: false,
        error: humanFacingError,
      })
      return
    }

    this.setState({
      serverAddress: userEnteredAddress,
      loading: true,
      error: null,
    })

    const endpoint = getEnterpriseAPIURL(address)
    try {
      const methods = await this.fetchAllowedAuthenticationMethods(endpoint)

      this.setState({
        serverAddress: userEnteredAddress,
        loading: false,
        error: null,
      })

      this.props.onContinue(endpoint, methods)
    } catch (e) {
      // We'll get an ENOTFOUND if the address couldn't be resolved.
      if (e.code === 'ENOTFOUND') {
        this.setState({
          serverAddress: userEnteredAddress,
          loading: false,
          error: new Error('The server could not be found'),
        })
      } else {
        this.setState({
          serverAddress: userEnteredAddress,
          loading: false,
          error: e,
        })
      }
    }
  }
}
