import { ApprovalCard } from '../components/domain.tsx'
import { Card, Empty, PageHeader } from '../components/ui.tsx'
import { useWorkspace } from '../state/WorkspaceContext.tsx'

export function ApprovalsPage() {
  const { ws } = useWorkspace()
  const pending = ws.approvals.filter((a) => a.status === 'pending')
  const decided = ws.approvals.filter((a) => a.status !== 'pending')
  return (
    <div>
      <PageHeader title="Approvals" subtitle="The agent prepares freely but never publishes, launches, sends or starts an experiment without a human yes. Every decision is recorded." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Waiting (${pending.length})`}>
          {pending.length ? <div className="space-y-2.5">{pending.map((a) => <ApprovalCard key={a.id} a={a} />)}</div> : <Empty title="Nothing waiting" />}
        </Card>
        <Card title="History">
          {decided.length ? <div className="space-y-2.5">{decided.slice(0, 30).map((a) => <ApprovalCard key={a.id} a={a} compact />)}</div> : <Empty title="No decisions yet" />}
        </Card>
      </div>
    </div>
  )
}
