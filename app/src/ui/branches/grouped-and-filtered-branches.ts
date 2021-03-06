import { Branch } from '../../models/branch'

export type BranchListItemModel = { kind: 'branch', branch: Branch } | { kind: 'label', label: string }

export function groupedAndFilteredBranches(defaultBranch: Branch | null, currentBranch: Branch | null, allBranches: ReadonlyArray<Branch>, recentBranches: ReadonlyArray<Branch>, filter: string): ReadonlyArray<BranchListItemModel> {
  if (filter.length < 1) {
    return groupedBranches(defaultBranch, currentBranch, allBranches, recentBranches)
  }

  filter = filter.toLowerCase()

  if (defaultBranch) {
    if (!defaultBranch.name.toLowerCase().includes(filter)) {
      defaultBranch = null
    }
  }

  if (currentBranch) {
    if (!currentBranch.name.toLowerCase().includes(filter)) {
      currentBranch = null
    }
  }

  allBranches = allBranches.filter(b => b.name.toLowerCase().includes(filter))
  recentBranches = recentBranches.filter(b => b.name.toLowerCase().includes(filter))

  return groupedBranches(defaultBranch, currentBranch, allBranches, recentBranches)
}

function groupedBranches(defaultBranch: Branch | null, currentBranch: Branch | null, allBranches: ReadonlyArray<Branch>, recentBranches: ReadonlyArray<Branch>): ReadonlyArray<BranchListItemModel> {
  const items = new Array<BranchListItemModel>()

  if (defaultBranch) {
    items.push({ kind: 'label', label: 'Default Branch' })
    items.push({ kind: 'branch', branch: defaultBranch })
  }

  const recentBranchNames = new Set<string>()
  const defaultBranchName = defaultBranch ? defaultBranch.name : null
  const recentBranchesWithoutDefault = recentBranches.filter(b => b.name !== defaultBranchName)
  if (recentBranchesWithoutDefault.length > 0) {
    items.push({ kind: 'label', label: 'Recent Branches' })
    for (const branch of recentBranchesWithoutDefault) {
      items.push({ kind: 'branch', branch: branch })
      recentBranchNames.add(branch.name)
    }
  }

  const remainingBranches = allBranches.filter(b => b.name !== defaultBranchName && !recentBranchNames.has(b.name))
  if (remainingBranches.length > 0) {
    items.push({ kind: 'label', label: 'Other Branches' })
    for (const branch of remainingBranches) {
      items.push({ kind: 'branch', branch: branch })
    }
  }

  return items
}
