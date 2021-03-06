import * as React from 'react'
import { IGitHubUser } from '../../lib/dispatcher'

interface IAvatarProps {
  readonly gitHubUser: IGitHubUser | null
  readonly title: string | null
}

const DefaultAvatarURL = 'https://github.com/hubot.png'

export class Avatar extends React.Component<IAvatarProps, void> {
   private getTitle(user: IGitHubUser | null): string {
    if (user === null) {
      return this.props.title || 'Unknown User'
    }

    return this.props.title || user.email
   }

  public render() {
    const gitHubUser = this.props.gitHubUser
    const avatarURL = (gitHubUser ? gitHubUser.avatarURL : null) || DefaultAvatarURL
    const avatarTitle = this.getTitle(gitHubUser)

    return (
      <img className='avatar' title={avatarTitle} src={avatarURL} alt={avatarTitle}/>
    )
  }
}
