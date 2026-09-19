import { Hammer } from 'lucide-react'
import Card, { CardBody } from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'

/**
 * Temporary screen for routes whose real UI lands in a later phase. Keeps the
 * full route map navigable so guards, redirects and the shell can be tested.
 */
export default function PlaceholderPage({ title, subtitle, phase }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardBody className="py-10">
          <div className="flex flex-col items-center text-center">
            <span className="mb-3 rounded-full bg-surface-sunken p-3">
              <Hammer className="h-6 w-6 text-ink-faint" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-ink">Under construction</p>
            <p className="mt-1 text-sm text-ink-muted">
              This screen is scheduled in {phase}.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
