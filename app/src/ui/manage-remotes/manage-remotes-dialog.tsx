import * as React from 'react'

import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'
import { PopupType } from '../../models/popup'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DefaultDialogFooter } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Loading } from '../lib/loading'
import { RemoteListItem } from './remote-list-item'

interface IManageRemotesDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly isTopMost: boolean

  readonly onDismissed: () => void
}

interface IManageRemotesDialogState {
  readonly remotes: ReadonlyArray<IRemote>
  readonly filterText: string
  readonly loading: boolean
}

export class ManageRemotesDialog extends React.Component<
  IManageRemotesDialogProps,
  IManageRemotesDialogState
> {
  public constructor(props: IManageRemotesDialogProps) {
    super(props)

    this.state = {
      remotes: [],
      filterText: '',
      loading: true,
    }
  }

  public componentDidMount() {
    this.loadRemotes()
  }

  public componentDidUpdate(prevProps: IManageRemotesDialogProps) {
    // When the "Add a remote" dialog (which is rendered on top of this one)
    // is dismissed, this dialog becomes the top-most popup again. Reload the
    // remotes so that any newly added remote shows up.
    if (!prevProps.isTopMost && this.props.isTopMost) {
      this.loadRemotes()
    }
  }

  private loadRemotes = async () => {
    const remotes = await this.props.dispatcher.getRemotes(
      this.props.repository
    )
    this.setState({ remotes, loading: false })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent pressing Enter in the filter field from closing the dialog.
    if (event.key === 'Enter') {
      event.preventDefault()
    }
  }

  private onNewRemote = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddRemote,
      repository: this.props.repository,
      existingRemoteNames: this.state.remotes.map(r => r.name),
    })
  }

  private onRemoveRemote = async (name: string) => {
    this.setState({ loading: true })

    try {
      await this.props.dispatcher.removeRemote(this.props.repository, name)
    } catch (e) {
      this.props.dispatcher.postError(e)
    }

    await this.loadRemotes()
  }

  private get filteredRemotes(): ReadonlyArray<IRemote> {
    const filter = this.state.filterText.trim().toLowerCase()

    if (filter.length === 0) {
      return this.state.remotes
    }

    return this.state.remotes.filter(
      r =>
        r.name.toLowerCase().includes(filter) ||
        r.url.toLowerCase().includes(filter)
    )
  }

  private renderRemote = (remote: IRemote) => {
    return (
      <RemoteListItem
        key={remote.name}
        remote={remote}
        onRemoveRemote={this.onRemoveRemote}
      />
    )
  }

  private renderList() {
    if (this.state.loading) {
      return (
        <div className="remotes-loading">
          <Loading /> Loading remotes…
        </div>
      )
    }

    const remotes = this.filteredRemotes

    if (remotes.length === 0) {
      return (
        <div className="no-remotes">
          {this.state.remotes.length === 0
            ? 'This repository has no remotes.'
            : 'No remotes match your filter.'}
        </div>
      )
    }

    return <ul className="remote-list">{remotes.map(this.renderRemote)}</ul>
  }

  public render() {
    return (
      <Dialog
        className="manage-remotes"
        id="manage-remotes"
        title={
          __DARWIN__
            ? 'Manage Remote Repositories'
            : 'Manage remote repositories'
        }
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row className="filter-field-row">
            <TextBox
              type="search"
              autoFocus={true}
              displayClearButton={true}
              prefixedIcon={octicons.search}
              placeholder="Filter remotes"
              value={this.state.filterText}
              onValueChanged={this.onFilterTextChanged}
              onKeyDown={this.onFilterKeyDown}
            />
            <Button
              className="new-remote-button button-with-icon"
              onClick={this.onNewRemote}
            >
              <Octicon symbol={octicons.plus} className="mr" />
              {__DARWIN__ ? 'New Remote' : 'New remote'}
            </Button>
          </Row>

          {this.renderList()}
        </DialogContent>

        <DefaultDialogFooter />
      </Dialog>
    )
  }
}
