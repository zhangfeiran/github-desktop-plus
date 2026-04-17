import * as React from 'react'
import { IRemote } from '../../models/remote'
import { TextBox } from '../lib/text-box'
import { DialogContent } from '../dialog'
import { Account } from '../../models/account'
import { AccountPicker } from '../account-picker'
import { Repository } from '../../models/repository'
import { getDotComAPIEndpoint, getEndpointForRepository } from '../../lib/api'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface IRemoteProps {
  /** The remote being shown. */
  readonly remote: IRemote

  readonly repository: Repository

  readonly account: Account | null

  readonly accounts: ReadonlyArray<Account>

  /** The default branch being shown. */
  readonly defaultBranch: string | undefined

  /** The function to call when the remote URL is changed by the user. */
  readonly onRemoteUrlChanged: (url: string) => void

  /** The function to call when the default branch is changed by the user. */
  readonly onDefaultBranchChanged: (branch: string) => void

  /** The function to call when the account is changed by the user. */
  readonly onSelectedAccountChanged: (account: Account) => void

  /** Whether automatic periodic fetches are enabled for this repository. */
  readonly periodicFetchEnabled: boolean

  /** The function to call when automatic periodic fetches are toggled. */
  readonly onPeriodicFetchEnabledChanged: (enabled: boolean) => void
}

/** The Remote component. */
export class Remote extends React.Component<IRemoteProps, {}> {
  public render() {
    const { remote, defaultBranch } = this.props

    const repoEndpoint = this.props.repository.url
      ? getEndpointForRepository(this.props.repository.url)
      : null
    const endpoint = repoEndpoint ?? getDotComAPIEndpoint()
    const noAccount = Account.anonymous()

    const account = this.props.account ?? noAccount

    const accounts: ReadonlyArray<Account> = [
      noAccount,
      ...this.props.accounts.filter(a => a.endpoint === endpoint),
    ]

    return (
      <DialogContent>
        <div className="config-row">
          <TextBox
            placeholder="Remote URL"
            label={
              __DARWIN__
                ? `Primary Remote Repository (${remote.name}) URL`
                : `Primary remote repository (${remote.name}) URL`
            }
            value={remote.url}
            onValueChanged={this.props.onRemoteUrlChanged}
          />
        </div>
        <div className="config-row">
          <p>Override the remote's default branch</p>
          <TextBox
            placeholder="Default branch"
            value={defaultBranch}
            onValueChanged={this.props.onDefaultBranchChanged}
          />
        </div>
        <div className="config-row">
          <AccountPicker
            accounts={accounts}
            openButtonClassName="dialog-preferred-focus"
            selectedAccount={account}
            onSelectedAccountChanged={this.props.onSelectedAccountChanged}
          />
        </div>
        <div className="config-row">
          <Checkbox
            label="Periodically fetch this repository"
            value={
              this.props.periodicFetchEnabled
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onPeriodicFetchEnabledChanged}
            ariaDescribedBy="repository-periodic-fetch-description"
          />
          <div
            id="repository-periodic-fetch-description"
            className="git-settings-description"
          >
            Automatic fetches keep branch counts and repository list status
            current. Manual fetch, pull, and push operations still work when
            this is off.
          </div>
        </div>
        <div className="config-row">
          <TextBox
            placeholder="Endpoint"
            readOnly={true}
            label="API Endpoint"
            value={endpoint}
          />
        </div>
      </DialogContent>
    )
  }

  private onPeriodicFetchEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onPeriodicFetchEnabledChanged(event.currentTarget.checked)
  }
}
