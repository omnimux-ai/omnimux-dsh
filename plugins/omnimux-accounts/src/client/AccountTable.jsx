import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from 'dsh-ui-kit'
import { AccountMenu, AgentSwitch } from './account-controls.jsx'
import { Avatar, GroupChip, PlatformChip, StatusDot } from './chips.jsx'
import { fmt, localeText, relativeTime, selectAllState } from './view.js'

/**
 * Column model. `sortKey` maps onto view.js sortAccounts (null = not
 * sortable, e.g. the free-text group column).
 */
const COLUMNS = [
  { id: 'name', labelKey: 'sort.display_name', sortKey: 'display_name' },
  { id: 'platform', labelKey: 'sort.platform', sortKey: 'platform' },
  { id: 'group', labelKey: 'group', sortKey: null },
  { id: 'status', labelKey: 'sort.status', sortKey: 'status' },
  { id: 'lastUsed', labelKey: 'sort.lastUsed', sortKey: 'last_used_at' },
]

/**
 * Dense table view. Semantics: thead sticky (styles.js), sortable headers
 * synced with the FilterBar sort controls, select-all checkbox column, and
 * per-row ⋯ menu with disconnect confirm — identical interactions to the
 * grid card.
 * @param {{
 *   t: (key: string) => string,
 *   accounts: Array<Record<string, unknown>>,
 *   selected: Set<string>,
 *   sortKey: string,
 *   sortDir: 'asc' | 'desc',
 *   busy: string,
 *   onSortHeader: (key: string) => void,
 *   onToggleSelect: (id: string) => void,
 *   onToggleSelectAll: () => void,
 *   onAgentToggle: (id: string, next: boolean) => void,
 *   onDisconnect: (id: string) => void,
 * }} props
 */
export function AccountTable(props) {
  const { t, accounts, selected, sortKey, sortDir, busy = '', onSortHeader, onToggleSelect, onToggleSelectAll, onAgentToggle, onDisconnect } = props
  const disabled = busy !== ''
  const checkState = selectAllState(accounts, selected)

  /**
   * @param {Record<string, unknown>} account
   */
  const rowName = (account) => [account.display_name, account.username, account.name]
    .find((value) => typeof value === 'string' && value !== '') || String(account.id)

  return (
    <div className="omnimux-accounts-tablewrap">
      <Table className="omnimux-accounts-table" stickyHeader dense>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="omnimux-accounts-table-check">
              <input
                type="checkbox"
                checked={checkState.all}
                ref={(node) => {
                  if (node) node.indeterminate = checkState.some && !checkState.all
                }}
                aria-label={t('bulk.selectAll')}
                disabled={disabled || accounts.length === 0}
                onChange={onToggleSelectAll}
              />
            </TableHead>
            {COLUMNS.map((column) => (
              column.sortKey ? (
                <TableHead
                  key={column.id}
                  scope="col"
                  sortable
                  disabled={disabled}
                  sortDirection={sortKey === column.sortKey ? sortDir : null}
                  onClick={disabled ? undefined : () => { onSortHeader(column.sortKey) }}
                >
                  {t(column.labelKey)}
                </TableHead>
              ) : (
                <TableHead key={column.id} scope="col">
                  {t(column.labelKey)}
                </TableHead>
              )
            ))}
            <TableHead scope="col">{t('card.agentUsable')}</TableHead>
            <TableHead scope="col">{t('card.menu')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => {
            const id = String(account.id)
            const name = rowName(account)
            const username = typeof account.username === 'string' && account.username !== '' ? `@${account.username}` : ''
            const status = typeof account.status === 'string' ? account.status : ''
            const statusLabel = localeText(t, `status.${status}`, status)
            const lastUsed = typeof account.last_used_at === 'string' ? relativeTime(account.last_used_at) : ''
            const isSelected = selected.has(id)
            return (
              <TableRow
                key={id}
                selected={isSelected}
                className={isSelected ? 'omnimux-accounts-row-selected' : undefined}
                data-busy={disabled}
              >
                <TableCell className="omnimux-accounts-table-check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    aria-label={fmt(t('bulk.selectRow'), { name })}
                    disabled={disabled}
                    onChange={() => { onToggleSelect(id) }}
                  />
                </TableCell>
                <TableCell>
                  <div className="omnimux-accounts-cell-id">
                    <Avatar account={account} t={t} />
                    <div className="omnimux-accounts-id">
                      <span className="omnimux-accounts-name">{name}</span>
                      {username !== '' ? <span className="omnimux-accounts-username">{username}</span> : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {typeof account.platform === 'string' && account.platform !== '' ? (
                    <PlatformChip platform={account.platform} t={t} />
                  ) : null}
                </TableCell>
                <TableCell>
                  {typeof account.group === 'string' && account.group !== '' ? (
                    <GroupChip group={account.group} />
                  ) : null}
                </TableCell>
                <TableCell>
                  {status !== '' ? (
                    <div className={`omnimux-accounts-status omnimux-accounts-status--${status}`}>
                      <StatusDot status={status} label={statusLabel} />
                      <span>{statusLabel}</span>
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {lastUsed !== '' ? (
                    <span className="omnimux-accounts-meta">{lastUsed}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <AgentSwitch
                    t={t}
                    checked={account.agent_usable !== false}
                    disabled={disabled}
                    onToggle={(next) => { onAgentToggle(id, next) }}
                  />
                </TableCell>
                <TableCell>
                  <span className="omnimux-accounts-cellmenu">
                    <AccountMenu t={t} name={name} disabled={disabled} onDisconnect={() => { onDisconnect(id) }} />
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
