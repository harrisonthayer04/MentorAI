import ThemeToggle from './components/ThemeToggle';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-start)] via-[var(--color-bg-mid)] to-[var(--color-bg-end)] dark:bg-gradient-to-br dark:from-[var(--color-bg-start)] dark:via-[var(--color-bg-mid)] dark:to-[var(--color-bg-end)] transition-all duration-500 [animation:fade-in_0.35s_ease-out_both] motion-reduce:animate-none">
      {/* Navigation */}
      <nav className="p-6 backdrop-blur-md bg-white/30 dark:bg-white/5 border-b border-white/30 dark:border-white/10 [animation:fade-in_0.45s_ease-out_both] motion-reduce:animate-none">
        <div className="mx-auto max-w-7xl flex justify-between items-center">
          <div className="text-gray-900 dark:text-white text-2xl font-display font-bold tracking-tight">MentorAI</div>
          <div className="flex items-center space-x-6">
            <button className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors font-sans hover:bg-white/40 dark:hover:bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm">About</button>
            <button className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors font-sans hover:bg-white/40 dark:hover:bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm">Contact</button>
            <Link
              href="/signin"
              className="px-4 py-2 rounded-xl font-display font-semibold text-white bg-gradient-to-r from-[var(--color-brand)] to-[color-mix(in_oklab,var(--color-brand),black_15%)] hover:from-[color-mix(in_oklab,var(--color-brand),black_5%)] hover:to-[color-mix(in_oklab,var(--color-brand),black_25%)] shadow-lg shadow-black/10 backdrop-blur-md transition-colors"
            >
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative px-6 py-16 md:py-24">
        <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
          {/* Left: Copy */}
          <div className="md:col-span-7 [animation:fade-in-up_0.5s_ease-out_both] motion-reduce:animate-none">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/40 dark:bg-white/5 backdrop-blur px-3 py-1 text-sm text-[var(--color-brand)] border border-white/30 dark:border-white/10 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]/80"></span>
              Personalized AI tutoring
            </div>

            <h1 className="mt-4 text-5xl md:text-7xl font-display font-extrabold tracking-tight text-gray-900 dark:text-white">
              Education at your {" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-brand)] via-[var(--color-brand)] to-[var(--color-brand)] drop-shadow-[0_2px_12px_rgba(122,108,134,0.35)]">fingertips</span>
            </h1>

            <p className="mt-6 text-lg text-gray-700 dark:text-gray-300 max-w-xl font-sans">
              An AI tutor who adapts to your pace, style, and goals.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 [animation:fade-in-up_0.6s_ease-out_both] motion-reduce:animate-none">
              <button className="bg-[var(--color-brand)] text-white px-8 py-4 rounded-2xl font-display font-semibold hover:bg-[color-mix(in_oklab,var(--color-brand),black_8%)] transition-all duration-300 transform hover:scale-105 hover:shadow-2xl shadow-xl backdrop-blur-md">
                Get Started
              </button>
              <button className="border-2 border-white/30 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-md text-gray-900 dark:text-gray-200 px-8 py-4 rounded-2xl font-display font-semibold hover:bg-white/40 dark:hover:bg-white/10 transition-all duration-300">
                Learn More
              </button>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="md:col-span-5 relative [animation:fade-in-up_0.7s_ease-out_both] motion-reduce:animate-none">
            <div className="relative mx-auto w-full max-w-md">
              {/* Ambient blobs */}
              <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-[var(--color-brand)]/25 blur-3xl"></div>
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-[var(--color-brand)]/25 blur-3xl"></div>

              {/* Main glass card */}
              <div className="relative rounded-3xl bg-white/30 dark:bg-white/5 backdrop-blur-xl border border-white/30 dark:border-white/10 p-6 shadow-2xl [animation:float-slow_6s_ease-in-out_infinite_alternate]">
                <div className="flex items-center justify-between">
                  <div className="text-gray-900 dark:text-white font-display font-semibold">Your study plan</div>
                  <span className="text-xs text-[var(--color-brand)] bg-white/40 dark:bg-white/10 border border-white/30 dark:border-white/10 rounded-full px-2 py-0.5">v1.2</span>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="h-3 rounded-full bg-white/50 dark:bg-white/10 w-3/4"></div>
                  <div className="h-3 rounded-full bg-white/50 dark:bg-white/10 w-2/3"></div>
                  <div className="h-3 rounded-full bg-white/50 dark:bg-white/10 w-5/6"></div>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-[var(--color-brand)]/60"></div>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-white/50 dark:bg-white/10 w-5/6"></div>
                    <div className="mt-2 h-2 rounded-full bg-white/40 dark:bg-white/5 w-2/3"></div>
                  </div>
                </div>
              </div>

              {/* Small overlay card */}
              <div className="absolute -right-6 -bottom-6 w-44 rounded-2xl bg-white/40 dark:bg-white/10 backdrop-blur-xl border border-white/30 dark:border-white/10 p-4 shadow-xl [animation:float-slow_7s_ease-in-out_infinite_alternate]">
                <div className="text-xs text-gray-700 dark:text-gray-300">Streak</div>
                <div className="mt-1 text-lg font-display font-bold text-gray-900 dark:text-white">7 days</div>
                <div className="mt-3 h-2 rounded-full bg-white/30 dark:bg-white/5">
                  <div className="h-2 rounded-full bg-[var(--color-brand)] w-3/4"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-0 w-full p-6 text-center">
        <p className="text-gray-600 dark:text-gray-400 text-sm font-sans bg-white/20 dark:bg-white/5 px-4 py-2 rounded-2xl inline-block backdrop-blur-md border border-white/20 dark:border-white/10">
          Made for students, by students.
        </p>
      </footer>
    </div>
  );
}