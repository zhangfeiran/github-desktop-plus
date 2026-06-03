import * as React from 'react'

import { IRemote } from '../../models/remote'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IRemoteListItemProps {
  readonly remote: IRemote
  readonly onRemoveRemote: (name: string) => void
}

export class RemoteListItem extends React.Component<IRemoteListItemProps, {}> {
  private onRemoveClick = () => {
    this.props.onRemoveRemote(this.props.remote.name)
  }

  public render() {
    const { remote } = this.props

    return (
      <li className="remote-list-item">
        <Octicon className="icon" symbol={octicons.server} />
        <span className="name">{remote.name}</span>
        <span className="url">{remote.url}</span>
        <Button
          className="remove-remote-button"
          tooltip={`Remove the "${remote.name}" remote`}
          ariaLabel={`Remove the "${remote.name}" remote`}
          onClick={this.onRemoveClick}
        >
          <Octicon symbol={octicons.trash} />
        </Button>
      </li>
    )
  }
}
