import { AppShell, BrandMark, PRISM_EXPANSION } from '../components/layout/AppShell'
import { SetupForm } from '../components/setup/SetupForm'

export function SetupPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8 sm:px-10 sm:py-12">
        <div className="mb-6 flex flex-col gap-2.5 sm:mb-7">
          <div className="flex items-start gap-3 sm:hidden">
            <BrandMark size={34} />
            <h1 className="flex flex-col gap-0.5">
              <span className="text-xl font-semibold tracking-tight text-steel-50">PRISM:</span>
              <span className="text-sm font-medium leading-snug text-steel-300">
                {PRISM_EXPANSION}
              </span>
            </h1>
          </div>
          {/*
            The acronym carries the weight and its expansion sits under it:
            at 62 characters the full name would wrap to three lines as a
            single heading and stop reading as a title.
          */}
          <h1 className="hidden flex-col gap-1 sm:flex">
            <span className="text-3xl font-semibold tracking-tight text-steel-50">PRISM:</span>
            <span className="text-base font-medium tracking-tight text-steel-300">
              {PRISM_EXPANSION}
            </span>
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
