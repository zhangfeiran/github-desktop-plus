import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'
import { Branch } from '../../models/branch'

interface ICantDeleteMainBranchProps {
  readonly branchToDelete: Branch
  readonly onDismissed: () => void
}

export class CantDeleteMainBranch extends React.Component<ICantDeleteMainBranchProps> {
  public render() {
    const { branchToDelete } = this.props
    return (
      <Dialog
        id="cant-delete-main-branch"
        title={__DARWIN__ ? 'Cannot Delete Branch' : 'Cannot delete branch'}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            You cannot delete the default branch{' '}
            <Ref>{branchToDelete.name}</Ref> because it is currently
            checked-out.
          </p>
          <p>
            You will need to switch to a different branch before removing this
            one.
          </p>
          <div className="secondary-text">
            Tip: You can right-click on a branch and select "Set as default
            branch" to change the default branch for the repository.
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Close"
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
