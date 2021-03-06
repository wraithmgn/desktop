import * as React from 'react'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { updateStore } from '../lib/update-store'

interface IUpdateAvailableProps {
  readonly dispatcher: Dispatcher
}

/**
 * A component which tells the user an update is available and gives them the
 * option of moving into the future or being a luddite.
 */
export class UpdateAvailable extends React.Component<IUpdateAvailableProps, void> {
  public render() {
    return (
      <div id='update-available'>
        GitHub Desktop will be updated after it restarts!

        <Button onClick={this.updateNow}>Update Now</Button>
        <Button onClick={this.dismiss}>I prefer living in the past</Button>
      </div>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }

  private dismiss = () => {
    this.props.dispatcher.closePopup()
  }
}
