import { AppShell, BrandMark } from '../components/layout/AppShell'
import { SetupForm } from '../components/setup/SetupForm'

export function SetupPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-10 sm:px-10 sm:py-14">
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex items-center gap-3 sm:hidden">
            <BrandMark size={40} />
            <h1 className="text-2xl font-semibold tracking-tight text-steel-50">
              Process Insight
            </h1>
          </div>
          <h1 className="hidden text-4xl font-semibold tracking-tight text-steel-50 sm:block">
            Process Insight
          </h1>
          <p className="max-w-xl text-base text-steel-400 leading-relaxed">
            Configure material, process, and melt parameters for additive
            manufacturing analysis.
          </p>
        </div>

        <div className="panel-surface rounded-sm p-5 sm:p-7">
          <SetupForm />
        </div>
      </div>
    </AppShell>
  )
}
