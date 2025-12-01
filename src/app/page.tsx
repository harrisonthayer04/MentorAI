import ThemeToggle from './components/ThemeToggle';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--color-surface)] dark:bg-zinc-950 text-[var(--color-text)] overflow-hidden">
      {/* Subtle gradient orbs for depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[120px] opacity-30 dark:opacity-10" style={{ backgroundColor: 'var(--color-brand)' }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/30 dark:bg-cyan-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-6 py-4" style={{ animation: "fade-in 0.4s ease-out" }}>
        <div className="mx-auto max-w-6xl flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-lg font-display font-bold tracking-tight">MentorAI</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Link
              href="/signin"
              className="px-5 py-2.5 rounded-xl font-display font-semibold text-sm text-white shadow-lg transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Get Started
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="mx-auto max-w-6xl">
          {/* Badge */}
          <div 
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-elevated)]/80 px-4 py-1.5 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] mb-8"
            style={{ animation: "fade-in-up 0.5s ease-out" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
            AI-powered personalized learning
          </div>

          {/* Headline */}
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-display font-extrabold tracking-tight leading-[0.95] max-w-4xl"
            style={{ animation: "fade-in-up 0.6s ease-out" }}
          >
            Learn anything,{" "}
            <span className="gradient-text">your way</span>
          </h1>

          {/* Subheadline */}
          <p 
            className="mt-6 text-lg md:text-xl text-[var(--color-text-secondary)] max-w-2xl leading-relaxed"
            style={{ animation: "fade-in-up 0.7s ease-out" }}
          >
            An intelligent tutor that adapts to your pace, understands your goals, and remembers your progress. Start learning smarter today.
          </p>

          {/* CTA Buttons */}
          <div 
            className="mt-10 flex flex-wrap gap-4"
            style={{ animation: "fade-in-up 0.8s ease-out" }}
          >
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-display font-semibold text-white shadow-xl transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Start Learning
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link 
              href="/signin"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-display font-semibold text-[var(--color-text-secondary)] bg-[var(--color-surface-elevated)]/80 border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Login
            </Link>
          </div>

          {/* Feature Preview Cards */}
          <div 
            className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4"
            style={{ animation: "fade-in-up 0.9s ease-out" }}
          >
            {/* Card 1 */}
            <div className="group p-6 rounded-2xl bg-[var(--color-surface-elevated)]/60 border border-[var(--color-border)] hover:border-[var(--color-border-subtle)] transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: 'color-mix(in srgb, var(--color-brand) 20%, transparent)' }}>
                <svg className="w-5 h-5" style={{ color: 'var(--color-brand)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-[var(--color-text)] mb-2">Natural Conversation</h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">Chat naturally with voice or text. Your AI tutor understands context and remembers your learning journey.</p>
            </div>

            {/* Card 2 */}
            <div className="group p-6 rounded-2xl bg-[var(--color-surface-elevated)]/60 border border-[var(--color-border)] hover:border-[var(--color-border-subtle)] transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-[var(--color-text)] mb-2">Adaptive Learning</h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">Personalized teaching that adjusts to your skill level, learning style, and goals in real-time.</p>
            </div>

            {/* Card 3 */}
            <div className="group p-6 rounded-2xl bg-[var(--color-surface-elevated)]/60 border border-[var(--color-border)] hover:border-[var(--color-border-subtle)] transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-[var(--color-text)] mb-2">Long-term Memory</h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">Your tutor remembers your progress, preferences, and past conversations across all sessions.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 border-t border-[var(--color-border-subtle)]">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            Made for students, by students.
          </p>
          <div className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
            <a href="#" className="hover:text-[var(--color-text-secondary)] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[var(--color-text-secondary)] transition-colors">Terms</a>
            <a href="#" className="hover:text-[var(--color-text-secondary)] transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
