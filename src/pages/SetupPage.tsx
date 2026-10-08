import { AppShell, BrandMark } from '../components/layout/AppShell'
import { SetupForm } from '../components/setup/SetupForm'

export function SetupPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8 sm:px-10 sm:py-12">
        <div className="mb-6 flex flex-col gap-2.5 sm:mb-7">
          <div className="flex items-center gap-3 sm:hidden">
            <BrandMark size={34} />
            <h1 className="text-xl font-semibold tracking-tight text-steel-50">
              Process Insight
            </h1>
          </div>
          <h1 className="hidden text-3xl font-semibold tracking-tight text-steel-50 sm:block">
            Process Insight
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-steel-400">
            Select a coupon build, then choose how to analyse it.
          </p>
        </div>

        <div className="panel-surface rounded-sm p-4 sm:p-6">
          <SetupForm />
        </div>
      </div>
    </AppShell>
  )
}
