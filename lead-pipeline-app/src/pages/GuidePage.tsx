import { AppHeader } from '@/components/AppHeader';

const STAGES: Array<{ name: string; dot: string; blurb: string }> = [
  { name: 'New', dot: '#868e96', blurb: 'A fresh lead just came in. No one has met them yet.' },
  { name: 'Consult', dot: '#f08c00', blurb: 'A design consultation is booked or done.' },
  { name: 'Quote', dot: '#7048e8', blurb: 'You have sent the customer a price.' },
  { name: 'Won', dot: '#2f9e44', blurb: 'They said yes. The project is sold.' },
  { name: 'Lost', dot: '#e03131', blurb: 'They decided not to go ahead.' },
];

const GLOSSARY: Array<[string, string]> = [
  ['Lead', 'A potential customer or project you are tracking.'],
  ['Stage', 'Where a lead is in the journey: New, Consult, Quote, then Won or Lost.'],
  ['Win rate', 'Of the deals you have closed (won plus lost), the share you won.'],
  ['Pipeline value', 'The total estimated value of deals that are still open.'],
  ['Won value', 'The total value of the deals you have actually sold.'],
  ['Stalled', 'An open lead with no activity for more than 14 days. Time to follow up.'],
  ['Funnel', 'A view of how many leads reached each stage on the way to Won.'],
  ['Source', 'Where a lead came from, such as Houzz, Google, a referral, or a walk-in.'],
];

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">{kicker}</div>
      <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-strong">
        {n}
      </span>
      <div>
        <div className="font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-[14px] text-muted">{children}</p>
      </div>
    </li>
  );
}

export function GuidePage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <header>
          <h1 className="text-[28px] font-semibold tracking-tight">How Pipeline works</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Pipeline tracks every closet project from the first phone call to the final install, and shows how the
            business is doing at a glance. There are two screens. This guide explains what each one does and how to
            get the most out of them. No technical knowledge needed.
          </p>
        </header>

        {/* Two-up summary */}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="text-[13px] font-semibold text-ink">Board</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              Your daily workspace. Log new leads and move them forward as customers progress.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="text-[13px] font-semibold text-ink">Dashboard</div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              The big picture. See how many leads you have, how many you are winning, and where they come from.
            </p>
          </div>
        </div>

        <div className="mt-10 space-y-10">
          {/* Board */}
          <Section kicker="The Board" title="Where the work happens">
            <p>
              Every potential project is a card. Cards move left to right across five columns as the customer gets
              closer to buying. At a glance you can see who is in play and what needs attention today.
            </p>
            <div className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-faint">The five stages</div>
              <ul className="space-y-2.5">
                {STAGES.map((s) => (
                  <li key={s.name} className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.dot }} />
                    <span className="w-20 shrink-0 text-[14px] font-medium text-ink">{s.name}</span>
                    <span className="text-[14px] text-muted">{s.blurb}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ol className="space-y-4">
              <Step n={1} title="Add a lead">
                Click <strong className="font-medium text-ink">New lead</strong> and fill in the customer, the project
                type, an estimated value, who owns it, and where it came from.
              </Step>
              <Step n={2} title="Move it forward">
                As the customer progresses, click <strong className="font-medium text-ink">Move to …</strong> on the
                card to advance it to the next stage.
              </Step>
              <Step n={3} title="Close it out">
                Mark it <strong className="font-medium text-ink">Won</strong> when it sells, or
                <strong className="font-medium text-ink"> Lost</strong> if it falls through.
              </Step>
            </ol>
            <p>
              The row of numbers at the top is a quick health check: open leads still in play, your win rate, the value
              of open deals (pipeline), what you have sold (won value), and your average deal size.
            </p>
          </Section>

          {/* Dashboard */}
          <Section kicker="The Dashboard" title="The health of the pipeline">
            <p>
              The dashboard answers two questions: how is the pipeline doing, and where should we focus? The five
              headline numbers cover the whole business. Note <strong className="font-medium text-ink">Stalled</strong>:
              open leads that have gone quiet for more than two weeks and need a nudge.
            </p>
            <div className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-faint">The four charts</div>
              <ul className="space-y-3 text-[14px]">
                <li><span className="font-medium text-ink">Funnel.</span> <span className="text-muted">Of all leads, how many reached each stage. A big drop between two stages shows where deals get stuck.</span></li>
                <li><span className="font-medium text-ink">Leads by month.</span> <span className="text-muted">How many new leads arrived each month, and how many were won.</span></li>
                <li><span className="font-medium text-ink">Win rate by rep.</span> <span className="text-muted">Who closes best across the team.</span></li>
                <li><span className="font-medium text-ink">Leads by source.</span> <span className="text-muted">Which channels bring the most leads, so you know where to spend.</span></li>
              </ul>
            </div>
            <ol className="space-y-4">
              <Step n={1} title="Filter with slicers">
                Use the buttons in the Slicers bar to narrow everything to a rep, source, stage, showroom, or date
                range. Want only Maria’s Houzz leads this year? Pick them and the whole page updates.
              </Step>
              <Step n={2} title="Click a chart to focus">
                Click any bar or point, say <strong className="font-medium text-ink">Won</strong> in the funnel, and
                every other chart, the headline numbers, and the table narrow to just that. The clicked item lights up
                and the rest dim. Click it again, or use the chip and <strong className="font-medium text-ink">Clear all</strong>, to reset.
              </Step>
              <Step n={3} title="Dig into the details table">
                The list at the bottom is every lead behind the charts. Search by name, sort any column, and page
                through them. The <strong className="font-medium text-ink">Idle</strong> column shows days since the
                last activity, and stalled leads are flagged so you know who to chase.
              </Step>
            </ol>
          </Section>

          {/* How they connect */}
          <Section kicker="How they connect" title="One source of truth">
            <p>
              The two screens show the same data. The moment a rep adds or moves a lead on the Board, it flows into the
              Dashboard. So reps and managers are always looking at the same numbers, with no spreadsheets and no
              debate over whose figure is right.
            </p>
            <div className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-3.5 text-[14px] leading-relaxed text-accent-strong">
              Reps work the Board. Managers watch the Dashboard. Both see the same truth, updated as the work happens.
            </div>
          </Section>

          {/* Glossary */}
          <Section kicker="Reference" title="Plain-language glossary">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {GLOSSARY.map(([term, def]) => (
                <div key={term}>
                  <dt className="text-[14px] font-semibold text-ink">{term}</dt>
                  <dd className="mt-0.5 text-[14px] text-muted">{def}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </main>
    </div>
  );
}
